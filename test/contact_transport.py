"""Count an operating case where powered contact, not a rigid carrier, moves the finite payload."""
from copy import deepcopy
import json
import runpy
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

from mechanical_fixture import SCRIPTS, package_write as write

NO_LOADED = "No operating path includes the moving mechanism and finite payload"


class ContactTransport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        cls.paths = json.loads((cls.root.parent / cls.plan["motion"]["file"]).read_text())

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def review(self, plan):
        from preliminary_design import review
        write(self.root, "layout.json", plan)
        return review(self.root.parent, self.root / "layout.json")

    def uncarried(self):
        """The example without any rigid carry declaration: no operating case covers the loaded path."""
        plan = deepcopy(self.plan)
        for stage in plan["stages"].values():
            stage["carriedWith"] = {}
        return plan

    def evidence(self, name, case, mechanisms, **change):
        """An invented contact trial that records the payload path it established."""
        c = next(c for c in self.paths["cases"] if c["id"] == case)
        record = dict(case=case, payload="carried article", mechanisms=sorted(mechanisms),
                      moves={"sample": c["moves"]["sample"]}, initialPose={"sample": c.get("initialPose", {}).get("sample", [])})
        record.update(change)
        return write(self.root, name, dict(basis="Invented powered-roller trial on the synthetic package", transport=record))

    def transport(self, plan, case, spec):
        plan["stages"][case]["transportedBy"] = {"carried article": spec}
        return plan

    def test_rigid_carry_only_example_is_unchanged(self):
        self.assertEqual(self.review(self.plan)["status"], "layout-checked")
        result = self.review(self.uncarried())
        self.assertEqual(result["status"], "provisional")
        self.assertIn(NO_LOADED, result["missingInputs"])

    def test_stationary_driven_rollers_transport_the_payload(self):
        # The article rolls into the parked carrier, whose powered surface is declared but does not move in this case.
        spec = dict(mechanisms=["carrier"], drive={"carrier": "Invented roller surface held at a fixed powered speed"},
                    evidence=self.evidence("acquire-trial.json", "acquire", ["carrier"]),
                    basis="The article rolls in on the powered carrier surface")
        result = self.review(self.transport(self.uncarried(), "acquire", spec))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])

    def test_moving_mechanism_transports_the_payload(self):
        spec = dict(mechanisms=["carrier"], evidence=self.evidence("turn-trial.json", "loaded-turn", ["carrier"]),
                    basis="The turning carrier pushes the article through its arc")
        result = self.review(self.transport(self.uncarried(), "loaded-turn", spec))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])

    def test_missing_unpinned_or_unbound_evidence_stays_missing(self):
        base = dict(mechanisms=["carrier"], drive={"carrier": "Invented powered roller"},
                    basis="The article rolls in on the powered carrier surface")
        cases = (("absent", None, "Name the contact-transport evidence file for carried article in acquire"),
                 ("no-file", {"sha256": "0" * 64}, "Name the contact-transport evidence file for carried article in acquire"),
                 ("no-path", {"file": ""}, "Name the contact-transport evidence file for carried article in acquire"),
                 ("other-path", self.evidence("short-trial.json", "acquire", ["carrier"], moves={"sample": [dict(kind="translation", travelMm=[0, 4, 0])]}),
                  "Contact-transport evidence for carried article in acquire does not record this payload path"),
                 ("other-case", self.evidence("turn-only.json", "loaded-turn", ["carrier"]),
                  "Contact-transport evidence for carried article in acquire does not record this payload path"))
        for tag, evidence, reason in cases:
            spec = dict(base, **({} if evidence is None else {"evidence": evidence}))
            result = self.review(self.transport(self.uncarried(), "acquire", spec))
            self.assertEqual(result["status"], "provisional", tag)
            self.assertIn(reason, result["missingInputs"], tag)
            self.assertIn(NO_LOADED, result["missingInputs"], tag)

    def test_stationary_transporter_needs_a_declared_drive(self):
        spec = dict(mechanisms=["carrier"], evidence=self.evidence("undriven.json", "acquire", ["carrier"]),
                    basis="The article rolls in on the carrier surface")
        result = self.review(self.transport(self.uncarried(), "acquire", spec))
        self.assertIn("Declare the drive of stationary transporter carrier in acquire", result["missingInputs"])
        self.assertIn(NO_LOADED, result["missingInputs"])

    def test_only_a_mechanism_can_transport(self):
        for transporter in ("structure", "drive", "carried article", "unknown"):
            spec = dict(mechanisms=[transporter], drive={transporter: "Invented"},
                        evidence=self.evidence("wrong-" + transporter.replace(" ", "-") + ".json", "acquire", [transporter]),
                        basis="Invented")
            with self.assertRaisesRegex(ValueError, "Only mechanism groups can transport a payload"):
                self.review(self.transport(self.uncarried(), "acquire", spec))

    def test_transport_outside_an_operating_case_does_not_count(self):
        # A fully evidenced transport in the service withdrawal is not an operating path.
        spec = dict(mechanisms=["carrier"], evidence=self.evidence("service-trial.json", "remove-carrier", ["carrier"]), basis="Invented")
        result = self.review(self.transport(self.uncarried(), "remove-carrier", spec))
        self.assertIn(NO_LOADED, result["missingInputs"])
        self.assertFalse(any("contact-transport" in m or "transporter" in m for m in result["missingInputs"]))

    def test_malformed_declarations_are_rejected(self):
        evidence = self.evidence("malformed.json", "acquire", ["carrier"])
        for tag, spec, message in (
                ("empty", dict(mechanisms=[], evidence=evidence, basis="Invented"), "Supply unique names"),
                ("stray-drive", dict(mechanisms=["carrier"], drive={"neighbor": "Invented"}, evidence=evidence, basis="Invented"),
                 "Declare each transporter drive"),
                ("no-basis", dict(mechanisms=["carrier"], drive={"carrier": "Invented"}, evidence=evidence), "Describe how contact")):
            with self.assertRaisesRegex(ValueError, message, msg=tag):
                self.review(self.transport(self.uncarried(), "acquire", spec))
        # The payload must move in the transported case.
        plan = self.uncarried()
        plan["stages"]["loaded-turn"]["transportedBy"] = {"carried article": dict(mechanisms=["carrier"], evidence=evidence, basis="Invented")}
        plan["stages"]["park-loaded"]["transportedBy"] = plan["stages"]["loaded-turn"].pop("transportedBy")
        plan["stages"]["park-loaded"]["transportedBy"]["carried article"]["drive"] = {"carrier": "Invented"}
        with self.assertRaisesRegex(ValueError, "Identify the moving payload transported by contact"):
            self.review(plan)

    def test_a_trial_named_by_path_alone_is_read_and_its_digest_recorded(self):
        pinned = self.evidence("path-only.json", "acquire", ["carrier"])
        spec = dict(mechanisms=["carrier"], drive={"carrier": "Invented"}, evidence={"file": pinned["file"]}, basis="Invented")
        result = self.review(self.transport(self.uncarried(), "acquire", spec))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["stages"]["acquire"]["transportedBy"]["carried article"]["evidence"], pinned)

    def test_changed_trial_is_refused(self):
        evidence = self.evidence("changed.json", "acquire", ["carrier"])
        spec = dict(mechanisms=["carrier"], drive={"carrier": "Invented"}, evidence=dict(evidence, sha256="f" * 64), basis="Invented")
        with self.assertRaisesRegex(ValueError, "Changed evidence"):
            self.review(self.transport(self.uncarried(), "acquire", spec))

    def test_payload_cannot_be_both_carried_and_transported(self):
        spec = dict(mechanisms=["carrier"], evidence=self.evidence("both.json", "loaded-turn", ["carrier"]), basis="Invented")
        with self.assertRaisesRegex(ValueError, "Identify the moving payload transported by contact"):
            self.review(self.transport(deepcopy(self.plan), "loaded-turn", spec))


if __name__ == "__main__":
    unittest.main()
