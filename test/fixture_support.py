"""Declare a payload that a registered field fixture supports, with the pinned trial behind its path."""
from copy import deepcopy
import gzip
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, package_pin as pin, package_write as write
from constant_pose_pairs import named_step

NO_LOADED = "No operating path includes the moving mechanism and finite payload"
PIN = "Name the fixture-support evidence file for carried article in release"
UNBOUND = "Fixture-support evidence for carried article in release does not record this payload path"
IDENTIFY = "Identify the moving payload a fixture supports, declared under supportedBy alone"


class FixtureSupport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        # An invented field lane, registered as a fixture of every case so the package scene stays common.
        named_step(cls.root / "lane.step", dict(lane=dict(box=([400, 400, 0], [420, 420, 20]))))
        cls.paths = json.loads((cls.root.parent / plan["motion"]["file"]).read_text())
        for case in cls.paths["cases"]:
            case["fixtures"] = [dict(id="lane", solid="lane", file=pin(cls.root, "lane.step"), basis="Invented field lane")]
        plan["groups"]["field lane"] = dict(role="service", members=["lane"])
        plan["presentation"]["components"]["lane"] = dict(purpose="Receive the released article.", rationale="Invented field lane.")
        plan["motion"] = write(cls.root, "paths-with-lane.json", cls.paths)
        budgets = json.loads((cls.root.parent / plan["budgets"]["file"]).read_text())
        plan["budgets"] = write(cls.root, "budgets-with-lane.json", dict(budgets, motion=plan["motion"]))
        cls.plan = plan

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def review(self, plan):
        from package_view import SCENE_FILE
        from preliminary_design import review
        write(self.root, "layout.json", plan)
        (self.root / SCENE_FILE).unlink(missing_ok=True)
        return review(self.root.parent, self.root / "layout.json", write_view=True)

    def evidence(self, name, case="release", **change):
        """An invented trial that records the path the lane gives the article."""
        c = next(c for c in self.paths["cases"] if c["id"] == case)
        record = dict(case=case, payload="carried article", fixtures=["lane"], moves={"sample": c["moves"]["sample"]},
                      initialPose={"sample": c.get("initialPose", {}).get("sample", [])})
        record.update(change)
        return write(self.root, name, dict(basis="Invented lane trial on the synthetic package", support=record))

    def supported(self, spec, case="release", plan=None):
        plan = deepcopy(self.plan if plan is None else plan)
        plan["stages"][case]["carriedWith"] = {}
        plan["stages"][case]["supportedBy"] = {"carried article": spec}
        return plan

    def spec(self, name, **change):
        return dict(dict(fixtures=["lane"], evidence=self.evidence(name), basis="The article rolls down the lane"), **change)

    def test_a_pinned_trial_evidences_the_supported_path_and_the_scene_names_it(self):
        from package_view import SCENE_FILE
        spec = self.spec("lane-trial.json")
        result = self.review(self.supported(spec))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["stages"]["release"]["supportedBy"]["carried article"], spec)
        scene = json.loads(gzip.decompress((self.root / SCENE_FILE).read_bytes()))
        rows = {r["case"]: r for r in scene["motionEvidence"]}
        self.assertEqual(rows["release"]["supportedBy"], [dict(payload="carried article", fixtures=["lane"], basis=spec["basis"],
                                                                evidence=spec["evidence"], bound=True)])
        self.assertIn("carried article supported by fixture lane from pinned trial layout/lane-trial.json", rows["release"]["method"])
        self.assertNotIn("free path", rows["release"]["method"].lower())
        self.assertNotIn("supportedBy", rows["loaded-turn"])

    def test_a_plan_without_the_declaration_is_unchanged(self):
        result = self.review(self.plan)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        from package_view import SCENE_FILE
        scene = json.loads(gzip.decompress((self.root / SCENE_FILE).read_bytes()))
        self.assertFalse(any("supportedBy" in r for r in scene["motionEvidence"]))

    def test_only_a_fixture_registered_in_the_case_can_support(self):
        # The failing control: a robot member and an unknown name are each refused.
        for name in ("head", "absent"):
            with self.assertRaisesRegex(ValueError, "Only a field fixture registered in release can support a payload: " + name):
                self.review(self.supported(self.spec("control-" + name + ".json", fixtures=[name])))
        for fixtures in ([], "lane", ["lane", "lane"], None):
            with self.assertRaisesRegex(ValueError, "Supply unique names for supporting fixtures"):
                self.review(self.supported(self.spec("control-list.json", fixtures=fixtures)))

    def test_a_supported_path_alone_is_not_a_loaded_operating_case(self):
        plan = deepcopy(self.plan)
        for stage in plan["stages"].values():
            stage["carriedWith"] = {}
        result = self.review(self.supported(self.spec("alone-trial.json"), plan=plan))
        self.assertEqual(result["status"], "provisional")
        self.assertEqual(result["missingInputs"], [NO_LOADED])

    def test_missing_unpinned_or_unbound_evidence_stays_missing(self):
        short = [dict(kind="translation", travelMm=[0, 4, 0])]
        cases = (("absent", None, PIN), ("no-file", {"sha256": "0" * 64}, PIN), ("no-path", {"file": ""}, PIN),
                 ("other-path", self.evidence("short-roll.json", moves={"sample": short}), UNBOUND),
                 ("other-start", self.evidence("other-start.json", initialPose={"sample": short}), UNBOUND),
                 ("other-case", self.evidence("turn-roll.json", case="loaded-turn"), UNBOUND),
                 ("other-fixture", self.evidence("other-fixture.json", fixtures=["ramp"]), UNBOUND),
                 ("free-path-record", write(self.root, "as-free.json", dict(freePath=dict(case="release"))), UNBOUND))
        for tag, evidence, reason in cases:
            spec = dict(fixtures=["lane"], basis="The article rolls down the lane", **({} if evidence is None else {"evidence": evidence}))
            result = self.review(self.supported(spec))
            self.assertEqual(result["status"], "provisional", tag)
            self.assertEqual(result["missingInputs"], [reason], tag)
        from package_view import SCENE_FILE
        row = next(r for r in json.loads(gzip.decompress((self.root / SCENE_FILE).read_bytes()))["motionEvidence"] if r["case"] == "release")
        self.assertIn("carried article supported by fixture lane without a trial that records this path", row["method"])

    def test_malformed_and_overlapping_declarations_are_rejected(self):
        spec = self.spec("malformed.json")
        with self.assertRaisesRegex(ValueError, "Describe how a fixture supports carried article"):
            self.review(self.supported({k: v for k, v in spec.items() if k != "basis"}))
        plan = self.supported(spec)
        plan["stages"]["release"]["supportedBy"] = ["carried article"]
        with self.assertRaisesRegex(ValueError, "List fixture-supported payloads by group"):
            self.review(plan)
        for group in ("carrier", "unknown"):
            plan = self.supported(spec)
            plan["stages"]["release"]["supportedBy"] = {group: spec}
            with self.assertRaisesRegex(ValueError, IDENTIFY, msg=group):
                self.review(plan)
        # One relation per payload in a case: supported, carried, transported or free.
        plan = self.supported(spec)
        plan["stages"]["release"]["freePath"] = {"carried article": dict(evidence=spec["evidence"], basis="Invented")}
        with self.assertRaisesRegex(ValueError, IDENTIFY):
            self.review(plan)
        plan = deepcopy(self.plan)
        plan["stages"]["loaded-turn"]["supportedBy"] = {"carried article": spec}
        with self.assertRaisesRegex(ValueError, IDENTIFY):
            self.review(plan)

    def test_a_trial_named_by_path_alone_is_read_and_its_digest_recorded(self):
        spec = self.spec("path-only-roll.json")
        result = self.review(self.supported(dict(spec, evidence={"file": spec["evidence"]["file"]})))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["stages"]["release"]["supportedBy"]["carried article"]["evidence"], spec["evidence"])

    def test_changed_trial_is_refused(self):
        spec = self.spec("changed-roll.json")
        with self.assertRaisesRegex(ValueError, "Changed evidence"):
            self.review(self.supported(dict(spec, evidence=dict(spec["evidence"], sha256="f" * 64))))


if __name__ == "__main__":
    unittest.main()
