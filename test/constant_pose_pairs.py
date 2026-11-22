"""Cull and reuse constant-relative-pose pairs without changing any clearance finding."""
from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS, pin, write


def named_step(path, boxes):
    """Write invented named solids. Each value is a list of (low, high) boxes fused into one solid."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_AsIs
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_DocumentTool
    from OCP.gp import gp_Pnt
    doc = TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    table = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    for name, spec in boxes.items():
        solid = BRepPrimAPI_MakeBox(gp_Pnt(*spec["box"][0]), gp_Pnt(*spec["box"][1])).Shape()
        for lo, hi in spec.get("cut", []):
            solid = BRepAlgoAPI_Cut(solid, BRepPrimAPI_MakeBox(gp_Pnt(*lo), gp_Pnt(*hi)).Shape()).Shape()
        for lo, hi in spec.get("add", []):
            solid = BRepAlgoAPI_Fuse(solid, BRepPrimAPI_MakeBox(gp_Pnt(*lo), gp_Pnt(*hi)).Shape()).Shape()
        TDataStd_Name.Set_s(table.AddShape(solid, False), TCollection_ExtendedString(name))
    writer = STEPCAFControl_Writer()
    writer.Transfer(doc, STEPControl_AsIs)
    writer.Write(str(path))


# A notched bracket whose bounding box encloses a separated insert: only an exact query can clear it.
BRACKET = dict(box=([0, 0, 0], [20, 20, 10]), cut=[([5, 5, -1], [21, 21, 11])])
INSERT = dict(box=([8, 8, 2], [12, 12, 6]))


def lift(mm):
    return [dict(kind="translation", travelMm=[0, 0, mm])]


@contextmanager
def counted_distance():
    import mechanical_motion
    calls = []
    original = mechanical_motion.distance
    def spy(a, b):
        calls.append((mechanical_motion.bounds(a), mechanical_motion.bounds(b)))
        return original(a, b)
    with patch("mechanical_motion.distance", side_effect=spy):
        yield calls


@contextmanager
def exhaustive():
    """Reproduce the earlier exact query of every constant-pose pair in every case."""
    with patch("mechanical_motion.constant_pose_separated", return_value=False), \
         patch("mechanical_motion.pose_key", return_value=None):
        yield


def same_findings(test, case, reference, cut):
    """The culled run reports the reference rows in order, omitting only pairs clear by more than the cut."""
    omitted = [r for r in reference["pairs"] if r not in case["pairs"]]
    test.assertEqual(case["pairs"], [r for r in reference["pairs"] if r not in omitted])
    test.assertEqual([r for r in omitted if r["status"] != "pass" or r["witness"]["gapMm"] <= cut], [])
    test.assertEqual(len(omitted), case["counts"]["constantPoseBroadPhase"])
    test.assertEqual({k: v for k, v in case.items() if k not in ("pairs", "counts")},
                     {k: v for k, v in reference.items() if k not in ("pairs", "counts")})
    return len(omitted)


class ConstantPosePairs(unittest.TestCase):
    def setUp(self):
        self.folder = TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)

    def study(self, bodies, cases, name="scene.step"):
        named_step(self.root / name, bodies)
        return dict(schema="agent-frc/mechanical-motion@1", step=pin(self.root, name), cases=cases)

    def evaluate(self, study):
        from mechanical_motion import evaluate
        return evaluate(self.root, study, package_scene=lambda case, scene: None)

    def test_separated_stationary_bodies_skip_the_exact_query(self):
        bodies = {f"block-{i}": dict(box=([30 * i, 0, 0], [30 * i + 10, 10, 10])) for i in range(5)}
        bodies["slider"] = dict(box=([0, 200, 0], [5, 205, 5]))
        study = self.study(bodies, [dict(id="raise", basis="Invented lift", minGapMm=1, moves={"slider": lift(5)})])
        with counted_distance() as calls:
            case = self.evaluate(study)["cases"][0]
        self.assertEqual(calls, [])
        self.assertEqual(case["status"], "pass")
        self.assertEqual(case["pairs"], [])
        self.assertEqual(case["counts"]["constantPoseBroadPhase"], 10)
        self.assertEqual(case["counts"]["broadPhase"], 5)

    def test_shared_static_pairs_are_measured_once_and_remeasured_when_the_scene_changes(self):
        bodies = dict(bracket=BRACKET, insert=INSERT, slider=dict(box=([0, 200, 0], [5, 205, 5])))
        stroke = [dict(id=f"stroke-{k}", basis="Invented lift", minGapMm=1, moves={"slider": lift(5 + k)}) for k in range(3)]
        study = self.study(bodies, stroke)
        with counted_distance() as calls:
            cases = self.evaluate(study)["cases"]
        self.assertEqual(len(calls), 1)
        self.assertEqual([c["counts"]["constantPoseReused"] for c in cases], [0, 1, 1])
        rows = [c["pairs"] for c in cases]
        self.assertEqual(rows[0], [dict(pair=["bracket", "insert"], status="pass", witness=dict(t=0, gapMm=3.0, volumeMm3=0))])
        self.assertTrue(all(r == rows[0] for r in rows))

        # An initial pose, a different fixture or a declared interface changes the static scene.
        named_step(self.root / "probe-clear.step", dict(probe=dict(box=([8, 8, 8], [12, 12, 9]))))
        named_step(self.root / "probe-hit.step", dict(probe=dict(box=([3, 8, 8], [12, 12, 9]))))
        evidence = write(self.root, "interface.json", dict(stepSha256=study["step"]["sha256"], case="seated",
                                                          pair=["bracket", "insert"], status="pass"))
        def fixture(file):
            return [dict(id="probe", file=pin(self.root, file), solid="probe", basis="Invented gauge")]
        variants = [
            dict(stroke[0], id="shifted", initialPose={"insert": [dict(kind="translation", travelMm=[0, 0, 1])]}),
            dict(stroke[0], id="gauge-clear", fixtures=fixture("probe-clear.step")),
            dict(stroke[0], id="gauge-hit", fixtures=fixture("probe-hit.step")),
            dict(stroke[0], id="seated", intendedInterfaces=[dict(pair=["insert", "bracket"], basis="Invented press fit",
                                                                  qualifiedBy=evidence)]),
            dict(stroke[0], id="after"),
        ]
        changed = dict(study, cases=[stroke[0], *variants])
        with counted_distance() as fast:
            observed = self.evaluate(changed)["cases"]
        with exhaustive(), counted_distance() as slow:
            reference = self.evaluate(changed)["cases"]
        for case, before in zip(observed, reference):
            same_findings(self, case, before, 1)
        by = {c["case"]: c for c in observed}
        self.assertEqual(by["shifted"]["pairs"][0]["witness"]["gapMm"], 3.0)
        self.assertEqual(by["shifted"]["counts"]["constantPoseReused"], 0)
        self.assertEqual(by["gauge-hit"]["status"], "fail")
        self.assertEqual(by["gauge-clear"]["status"], "pass")
        self.assertEqual(by["seated"]["pairs"], [])
        self.assertEqual(by["after"]["counts"]["constantPoseReused"], 1)
        # bracket/insert at the base and shifted poses, then bracket/probe for each fixture.
        # The probe clears the insert's box by 2 mm.
        self.assertEqual(len(fast), 4)
        self.assertGreater(len(slow), len(fast))

    def test_same_motion_pairs_are_culled_and_reused(self):
        bodies = dict(bracket=BRACKET, insert=INSERT, guide=dict(box=([40, 0, 0], [45, 5, 5])),
                      post=dict(box=([0, 200, 0], [5, 205, 5])))
        carry = lift(5)
        cases = [dict(id=f"carry-{k}", basis="Invented lift of a seated assembly", minGapMm=1,
                      moves={"bracket": carry, "insert": carry, "guide": carry}) for k in range(2)]
        with counted_distance() as calls:
            observed = self.evaluate(self.study(bodies, cases))["cases"]
        self.assertEqual(len(calls), 1)
        for case in observed:
            self.assertEqual(case["status"], "pass")
            self.assertEqual(case["pairs"], [dict(pair=["bracket", "insert"], status="pass",
                                                  witness=dict(t=0, gapMm=3.0, volumeMm3=0))])
            self.assertEqual(case["counts"]["constantPoseBroadPhase"], 2)
        self.assertEqual([c["counts"]["constantPoseReused"] for c in observed], [0, 1])

    def test_near_and_overlapping_stationary_pairs_keep_exact_findings(self):
        bodies = dict(base=dict(box=([0, 0, 0], [10, 10, 10])),
                      near=dict(box=([10.5, 0, 0], [15, 10, 10])),
                      edge=dict(box=([0, 11.0005, 0], [10, 15, 10])),
                      overlap=dict(box=([-1, 0, 0], [0.5, 10, 10])),
                      far=dict(box=([0, -12, 0], [10, -1.5, 10])),
                      slider=dict(box=([0, 200, 0], [5, 205, 5])))
        study = self.study(bodies, [dict(id="raise", basis="Invented lift", minGapMm=1, moves={"slider": lift(5)})])
        case = self.evaluate(study)["cases"][0]
        with exhaustive():
            reference = self.evaluate(study)["cases"][0]
        rows = {tuple(r["pair"]): r for r in case["pairs"]}
        self.assertEqual(case["status"], "fail")
        self.assertEqual(rows[("base", "near")]["status"], "fail")
        self.assertAlmostEqual(rows[("base", "near")]["witness"]["gapMm"], .5)
        self.assertEqual(rows[("base", "overlap")]["status"], "fail")
        self.assertAlmostEqual(rows[("base", "overlap")]["witness"]["volumeMm3"], 50)
        # Inside the box margin, an exact query still settles the pair.
        self.assertEqual(rows[("base", "edge")]["status"], "pass")
        self.assertAlmostEqual(rows[("base", "edge")]["witness"]["gapMm"], 1.0005)
        self.assertNotIn(("base", "far"), rows)
        self.assertEqual(same_findings(self, case, reference, 1), 6)

    def test_preliminary_example_keeps_every_finding_and_its_control(self):
        import runpy
        import preliminary_design
        folder = self.root / "layout"
        runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](folder)
        captured = []
        original = preliminary_design.evaluate
        def record(*args, **kwargs):
            captured.append(original(*args, **kwargs))
            return captured[-1]
        with patch("preliminary_design.evaluate", side_effect=record):
            fast = preliminary_design.review(folder, folder / "layout.json")
            with exhaustive():
                slow = preliminary_design.review(folder, folder / "layout.json")
        self.assertEqual(fast["status"], "layout-checked")
        self.assertTrue(fast["control"]["witness"]["witness"]["volumeMm3"] > 50)
        self.assertEqual(fast["control"], slow["control"])
        observed, reference = captured
        self.assertEqual({k: v for k, v in observed.items() if k != "cases"},
                         {k: v for k, v in reference.items() if k != "cases"})
        culled = 0
        for case, before, motion in zip(observed["cases"], reference["cases"],
                                        [*json.loads((folder / "paths.json").read_text())["cases"], None]):
            cut = (motion or {"minGapMm": 1})["minGapMm"]
            culled += same_findings(self, case, before, cut)
        self.assertGreater(culled, 0)
        ignored = ("view", "missingInputs", "status", "cases")
        self.assertEqual({k: v for k, v in fast.items() if k not in ignored},
                         {k: v for k, v in slow.items() if k not in ignored})
        self.assertEqual(slow["missingInputs"], ["Generate the matching view of these checked trajectories with --write-view"])


if __name__ == "__main__":
    unittest.main()
