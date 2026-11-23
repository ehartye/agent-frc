"""Pin the trial behind a payload's unsupported free path; the free path alone is not a loaded operating case."""
from copy import deepcopy
import json
import runpy
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

from mechanical_fixture import SCRIPTS, package_write as write

NO_LOADED = "No operating path includes the moving mechanism and finite payload"
PIN = "Name the free-path evidence file for carried article in release"
UNBOUND = "Free-path evidence for carried article in release does not record this payload path"


class FreePath(unittest.TestCase):
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
        """Check the plan with a freshly written scene: the scene names each declared free path."""
        from package_view import SCENE_FILE
        from preliminary_design import review
        write(self.root, "layout.json", plan)
        (self.root / SCENE_FILE).unlink(missing_ok=True)
        return review(self.root.parent, self.root / "layout.json", write_view=True)

    def evidence(self, name, case="release", **change):
        """An invented release trial that records the free path it established."""
        c = next(c for c in self.paths["cases"] if c["id"] == case)
        record = dict(case=case, payload="carried article", moves={"sample": c["moves"]["sample"]},
                      initialPose={"sample": c.get("initialPose", {}).get("sample", [])})
        record.update(change)
        return write(self.root, name, dict(basis="Invented release trial on the synthetic package", freePath=record))

    def free(self, spec, case="release", plan=None):
        plan = deepcopy(self.plan if plan is None else plan)
        plan["stages"][case]["carriedWith"] = {}
        plan["stages"][case]["freePath"] = {"carried article": spec}
        return plan

    def test_a_pinned_trial_evidences_the_free_path(self):
        spec = dict(evidence=self.evidence("release-trial.json"), basis="The article leaves the carrier and flies free")
        result = self.review(self.free(spec))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["stages"]["release"]["freePath"]["carried article"]["evidence"], spec["evidence"])

    def test_a_free_path_alone_is_not_a_loaded_operating_case(self):
        plan = deepcopy(self.plan)
        for stage in plan["stages"].values():
            stage["carriedWith"] = {}
        spec = dict(evidence=self.evidence("alone-trial.json"), basis="The article flies free")
        result = self.review(self.free(spec, plan=plan))
        self.assertEqual(result["status"], "provisional")
        self.assertEqual(result["missingInputs"], [NO_LOADED])

    def test_missing_unpinned_or_unbound_evidence_stays_missing(self):
        short = [dict(kind="translation", travelMm=[0, 4, 0])]
        cases = (("absent", None, PIN), ("no-file", {"sha256": "0" * 64}, PIN), ("no-path", {"file": ""}, PIN),
                 ("other-path", self.evidence("short-flight.json", moves={"sample": short}), UNBOUND),
                 ("other-start", self.evidence("other-start.json", initialPose={"sample": short}), UNBOUND),
                 ("other-case", self.evidence("turn-flight.json", case="loaded-turn"), UNBOUND),
                 ("other-payload", self.evidence("other-payload.json", payload="carrier"), UNBOUND),
                 ("transport-record", write(self.root, "as-transport.json", dict(transport=dict(case="release"))), UNBOUND))
        for tag, evidence, reason in cases:
            spec = dict(basis="The article flies free", **({} if evidence is None else {"evidence": evidence}))
            result = self.review(self.free(spec))
            self.assertEqual(result["status"], "provisional", tag)
            self.assertEqual(result["missingInputs"], [reason], tag)

    def test_malformed_declarations_are_rejected(self):
        evidence = self.evidence("malformed.json")
        with self.assertRaisesRegex(ValueError, "Describe the free path"):
            self.review(self.free(dict(evidence=evidence)))
        with self.assertRaisesRegex(ValueError, "List free payload paths by group"):
            plan = self.free(dict(evidence=evidence, basis="Invented"))
            plan["stages"]["release"]["freePath"] = ["carried article"]
            self.review(plan)
        for group in ("carrier", "unknown"):
            plan = self.free(dict(evidence=evidence, basis="Invented"))
            plan["stages"]["release"]["freePath"] = {group: plan["stages"]["release"]["freePath"]["carried article"]}
            with self.assertRaisesRegex(ValueError, "Identify the moving payload on a free path", msg=group):
                self.review(plan)
        # A payload cannot be both carried and free in one case.
        plan = deepcopy(self.plan)
        plan["stages"]["loaded-turn"]["freePath"] = {"carried article": dict(evidence=evidence, basis="Invented")}
        with self.assertRaisesRegex(ValueError, "Identify the moving payload on a free path"):
            self.review(plan)

    def test_a_trial_named_by_path_alone_is_read_and_its_digest_recorded(self):
        pinned = self.evidence("path-only-flight.json")
        result = self.review(self.free(dict(evidence={"file": pinned["file"]}, basis="The article flies free")))
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        self.assertEqual(result["stages"]["release"]["freePath"]["carried article"]["evidence"], pinned)
        with self.assertRaisesRegex(ValueError, "Unresolved project file: layout/absent-flight.json"):
            self.review(self.free(dict(evidence={"file": "layout/absent-flight.json"}, basis="Invented")))

    def test_changed_trial_is_refused(self):
        evidence = self.evidence("changed-flight.json")
        with self.assertRaisesRegex(ValueError, "Changed evidence"):
            self.review(self.free(dict(evidence=dict(evidence, sha256="f" * 64), basis="Invented")))

    def test_the_review_scene_names_the_trial_behind_the_free_path(self):
        from package_view import SCENE_FILE
        import gzip
        spec = dict(evidence=self.evidence("scene-trial.json"), basis="The article leaves the carrier and flies free")
        result = self.review(self.free(spec))
        self.assertTrue(result["view"]["verified"], result["missingInputs"])
        scene = json.loads(gzip.decompress((self.root / SCENE_FILE).read_bytes()))
        rows = {r["case"]: r for r in scene["motionEvidence"]}
        self.assertEqual(rows["release"]["freePath"], [dict(payload="carried article", basis=spec["basis"],
                                                             evidence=spec["evidence"], bound=True)])
        self.assertIn("Free path of carried article from pinned trial layout/scene-trial.json", rows["release"]["method"])
        self.assertNotIn("freePath", rows["loaded-turn"])
        unbound = self.review(self.free(dict(basis=spec["basis"])))
        self.assertFalse(unbound["view"]["verified"] and unbound["status"] == "layout-checked")
        scene = json.loads(gzip.decompress((self.root / SCENE_FILE).read_bytes()))
        row = next(r for r in scene["motionEvidence"] if r["case"] == "release")
        self.assertEqual(row["freePath"], [dict(payload="carried article", basis=spec["basis"], evidence=None, bound=False)])
        self.assertIn("Free path of carried article without a trial that records this path", row["method"])


if __name__ == "__main__":
    unittest.main()
