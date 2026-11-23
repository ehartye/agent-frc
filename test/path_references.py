# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/package_view.py
# @subject scripts/preliminary_design.py
"""Name each file of a layout plan by its path: the checker reads it and records its digest, and still verifies a typed SHA-256."""
from copy import deepcopy
import gzip
from hashlib import sha256
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS, package_write as write

CREATE = SCRIPTS.parent / "examples/preliminary-design/create.py"


def typed(node):
    """Every sha256 key an author wrote anywhere in a JSON value."""
    if isinstance(node, dict):
        return ("sha256" in node) + sum(typed(v) for v in node.values())
    return sum(typed(v) for v in node) if isinstance(node, list) else 0


class PathReferences(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.repo = Path(cls.folder.name)
        cls.root = cls.repo / "layout"
        cls.plan = runpy.run_path(str(CREATE))["create"](cls.root, release_id="layout-test")
        cls.files = {p.name: p.read_bytes() for p in cls.root.iterdir() if p.is_file()}

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        for name, data in self.files.items():
            (self.root / name).write_bytes(data)

    def review(self, plan=None, **options):
        from preliminary_design import review
        write(self.root, "layout.json", plan or self.plan)
        return review(self.repo, self.root / "layout.json", **options)

    def digest(self, name):
        return sha256((self.root / name).read_bytes()).hexdigest()

    def test_the_example_types_no_hash_and_the_receipt_records_what_was_read(self):
        authored = [n for n in self.files if n.endswith(".json") and n != "receipt.json"]
        self.assertEqual({n: typed(json.loads(self.files[n])) for n in authored}, {n: 0 for n in authored})
        result = self.review(write_view=True)
        self.assertEqual(result["status"], "layout-checked", result["missingInputs"])
        for key, name in (("design", "design.json"), ("step", "package.step"), ("motion", "paths.json")):
            self.assertEqual(result[key], dict(file="layout/" + name, sha256=self.digest(name)))
        self.assertEqual(result["budgets"]["source"]["sha256"], self.digest("budgets.json"))
        self.assertEqual(result["budgets"]["limits"]["sha256"], self.digest("package-limits.json"))
        self.assertEqual(result["narrativeReview"]["source"]["sha256"], self.digest("narrative.md"))
        self.assertEqual([p["accepted"]["sha256"] for p in result["premises"]],
                         [self.digest("pickup-face-accepted.json"), self.digest("acquire-time-accepted.json")])
        # The scene names the replayed trial and the linked interaction with the digests the checker read.
        from package_view import SCENE_FILE
        scene = json.loads(gzip.decompress((self.root / SCENE_FILE).read_bytes()))
        self.assertEqual(scene["replays"][0]["evidence"],
                         [dict(file="layout/release-lane-run.json", sha256=self.digest("release-lane-run.json"), role="recorded run")])
        self.assertEqual(scene["fieldInteractions"][0]["evidence"]["sha256"], self.digest("release-lane-trial.json"))

    def test_a_typed_hash_beside_path_references_is_still_verified(self):
        mixed = deepcopy(self.plan)
        mixed["motion"] = dict(mixed["motion"], sha256=self.digest("paths.json"))
        mixed["presentation"]["replays"][0]["sha256"] = self.digest("release-lane-replay.json")
        self.assertEqual(self.review(mixed, write_view=True)["status"], "layout-checked")
        for change in (lambda p: p["motion"].update(sha256="f" * 64), lambda p: p["presentation"]["replays"][0].update(sha256="f" * 64),
                       lambda p: p["design"].update(sha256="f" * 64), lambda p: p["narrativeReview"]["source"].update(sha256="f" * 64),
                       lambda p: p["budgets"].update(sha256="f" * 64), lambda p: p["premises"][0]["accepted"].update(sha256="f" * 64)):
            wrong = deepcopy(mixed)
            change(wrong)
            with self.assertRaisesRegex(ValueError, "Changed evidence"):
                self.review(wrong, write_view=True)

    def test_a_digest_a_record_repeats_is_still_compared(self):
        study = json.loads(self.files["paths.json"])
        (self.root / "paths.json").write_text(json.dumps(dict(study, layoutDesignSha256="0" * 64)), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Motion study differs from the selected geometry, design or datum"):
            self.review()
        self.setUp()
        (self.root / "paths.json").write_text(json.dumps(dict(study, step=dict(file="layout/design.json"))), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Motion study differs from the selected geometry, design or datum"):
            self.review()
        self.setUp()
        current = json.loads(self.files["acquire-time-current.json"])
        (self.root / "acquire-time-current.json").write_text(json.dumps(dict(current, stepSha256="0" * 64)), encoding="utf-8")
        self.assertIn("Earlier revision cannot resume acquire-time", self.review()["missingInputs"])
        self.setUp()
        ledger = json.loads(self.files["budgets.json"])
        (self.root / "budgets.json").write_text(json.dumps(dict(ledger, motion=dict(file="layout/design.json"))), encoding="utf-8")
        self.assertIn("Budget selection differs from the package issue", self.review()["missingInputs"])

    def test_a_missing_file_is_named(self):
        gone = deepcopy(self.plan)
        gone["narrativeReview"]["source"] = dict(file="layout/absent.md")
        with self.assertRaisesRegex(ValueError, "Unresolved project file: layout/absent.md"):
            self.review(gone)

    def test_view_only_still_refuses_a_changed_input_the_plan_names_by_path(self):
        held = self.review(write_view=True)
        receipt = self.root / "receipt.json"
        receipt.write_text(json.dumps(held, indent=2) + "\n", encoding="utf-8")
        with patch("preliminary_design.evaluate", side_effect=AssertionError("a view-only run checks no case")):
            rebuilt = self.review(view_only=receipt)
            self.assertEqual(json.loads(json.dumps(rebuilt)), json.loads(json.dumps(held)))
            # The plan bytes are the same; only the file it names changed.
            study = json.loads(self.files["paths.json"])
            study["cases"][0]["minGapMm"] = 2
            (self.root / "paths.json").write_text(json.dumps(study), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Changed since that receipt: the motion study"):
                self.review(view_only=receipt)
            self.setUp()
            ledger = json.loads(self.files["budgets.json"])
            ledger["masses"][0]["kg"] = [4, 5.5]
            (self.root / "budgets.json").write_text(json.dumps(ledger), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Changed since that receipt: the weight and voltage budgets"):
                self.review(view_only=receipt)

    def test_a_plan_with_typed_hashes_gives_the_same_verdicts(self):
        with TemporaryDirectory() as folder:
            root = Path(folder) / "layout"
            plan = runpy.run_path(str(CREATE))["create"](root, release_id="layout-test", pins=True)
            self.assertGreater(typed(plan), 10)
            from preliminary_design import review
            pinned, free = review(root.parent, root / "layout.json"), self.review()
            for key in ("status", "issue", "cycle", "missingInputs"):
                self.assertEqual(pinned[key], free[key], key)
            self.assertEqual([(c["case"], c["status"]) for c in pinned["cases"]], [(c["case"], c["status"]) for c in free["cases"]])


if __name__ == "__main__":
    unittest.main()
