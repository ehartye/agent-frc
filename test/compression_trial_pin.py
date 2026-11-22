"""Bind a soft-payload indentation allowance to the pinned trial that measured it."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import pin, write
from mechanical_motion import evaluate


def ball_step(path):
    """Write an invented ball resting 1 mm into a flat pad, in millimeters."""
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeSphere
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_AsIs
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_DocumentTool
    from OCP.gp import gp_Pnt
    doc = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    table = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    for name, solid in (("ball", BRepPrimAPI_MakeSphere(gp_Pnt(0, 0, 9), 10).Shape()),
                        ("pad", BRepPrimAPI_MakeBox(gp_Pnt(-20, -20, -5), gp_Pnt(20, 20, 0)).Shape())):
        TDataStd_Name.Set_s(table.AddShape(solid, False), TCollection_ExtendedString(name))
    writer = STEPCAFControl_Writer()
    writer.Transfer(doc, STEPControl_AsIs)
    writer.Write(str(path))


class CompressionTrialPin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        ball_step(cls.root / "scene.step")
        cls.trial = write(cls.root, "indentation-trial.json", dict(basis="Invented squeeze trial", radialIndentationMm=1.5, cycles=20, label="soft"))

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def run_rule(self, **rule):
        rule = dict(dict(payload="ball", contact="pad", maxDepthMm=1.5, basis="Invented radial indentation from the squeeze trial"), **rule)
        case = dict(id="rest", basis="Invented ball resting on the pad", minGapMm=0, moves={"ball": [dict(kind="translation", travelMm=[5, 0, 0])]},
                    payloadCompression=[rule])
        study = dict(schema="agent-frc/mechanical-motion@1", step=pin(self.root, "scene.step"), cases=[case])
        return evaluate(self.root, study)["cases"][0]

    def row(self, case):
        return next(r for r in case["pairs"] if r.get("method") == "payload section indentation")

    def test_a_rule_without_evidence_is_unchanged(self):
        case = self.run_rule()
        self.assertEqual(case["status"], "pass")
        self.assertNotIn("evidence", self.row(case))

    def test_a_pinned_trial_binds_the_allowance(self):
        evidence = dict(self.trial, field="radialIndentationMm")
        case = self.run_rule(evidence=evidence)
        self.assertEqual(case["status"], "pass")
        self.assertEqual(self.row(case)["evidence"], evidence)
        plain = self.row(self.run_rule())
        self.assertEqual({k: v for k, v in self.row(case).items() if k != "evidence"}, plain)

    def test_an_allowance_that_differs_from_its_trial_is_refused(self):
        evidence = dict(self.trial, field="radialIndentationMm")
        with self.assertRaisesRegex(ValueError, "Compression allowance for ball on pad differs from radialIndentationMm in its pinned trial"):
            self.run_rule(evidence=evidence, maxDepthMm=1.4)

    def test_a_missing_or_non_numeric_field_is_refused(self):
        for field in ("absent", "label", "basis"):
            with self.assertRaisesRegex(ValueError, "differs from " + field + " in its pinned trial", msg=field):
                self.run_rule(evidence=dict(self.trial, field=field))
        flags = write(self.root, "flag-trial.json", dict(radialIndentationMm=True))
        with self.assertRaisesRegex(ValueError, "differs from radialIndentationMm"):
            self.run_rule(evidence=dict(flags, field="radialIndentationMm"), maxDepthMm=1)
        listed = write(self.root, "list-trial.json", [1.5])
        with self.assertRaisesRegex(ValueError, "differs from radialIndentationMm"):
            self.run_rule(evidence=dict(listed, field="radialIndentationMm"))

    def test_a_malformed_or_changed_pin_is_refused(self):
        for tag, evidence in (("no-field", dict(self.trial)), ("no-digest", dict(file=self.trial["file"], field="radialIndentationMm")),
                              ("extra", dict(self.trial, field="radialIndentationMm", note="x")), ("text", "indentation-trial.json"),
                              ("blank-field", dict(self.trial, field=" "))):
            with self.assertRaisesRegex(ValueError, "Pin a compression trial by file, sha256 and field", msg=tag):
                self.run_rule(evidence=evidence)
        with self.assertRaisesRegex(ValueError, "Changed evidence"):
            self.run_rule(evidence=dict(self.trial, field="radialIndentationMm", sha256="f" * 64))
        outside = write(self.root.parent, "outside-" + self.root.name + ".json", dict(radialIndentationMm=1.5))
        with self.assertRaises(ValueError):
            self.run_rule(evidence=dict(file="../" + outside["file"], sha256=outside["sha256"], field="radialIndentationMm"))
        (self.root.parent / outside["file"]).unlink()
        # Without a project root the pin cannot be checked, so the rule is refused, not skipped.
        from payload_compression import trial_pin
        with self.assertRaisesRegex(ValueError, "Pin a compression trial"):
            trial_pin(None, dict(payload="ball", contact="pad", maxDepthMm=1.5, evidence=dict(self.trial, field="radialIndentationMm")))


if __name__ == "__main__":
    unittest.main()
