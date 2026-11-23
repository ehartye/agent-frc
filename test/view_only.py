# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/package_view.py
# @subject scripts/preliminary_design.py
"""Rebuild the review scene and receipt from an earlier receipt without rerunning the cases, and refuse changed physics inputs."""
from copy import deepcopy
import json
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS, package_write as write


def as_saved(result):
    return json.loads(json.dumps(result))


class ViewOnly(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        from package_view import SCENE_FILE
        cls.scene = cls.root / SCENE_FILE
        cls.stock_scene = cls.scene.read_bytes()
        cls.receipt = cls.root / "receipt.json"

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        self.scene.write_bytes(self.stock_scene)

    def review(self, plan=None, **options):
        from preliminary_design import review
        write(self.root, "layout.json", plan or self.plan)
        return review(self.root.parent, self.root / "layout.json", **options)

    def hold(self, **options):
        """Save the receipt of a full check of the stock plan, as --output does."""
        result = self.review(**options)
        self.receipt.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        return result

    def reworded(self):
        """A presentation-only edit: a component explanation, a clearance basis and a renamed group."""
        plan = deepcopy(self.plan)
        plan["presentation"]["components"]["head"]["purpose"] = "Carry the invented sample through the quarter turn."
        for stage in plan["stages"].values():
            stage["allowanceBasis"] = "Invented 1 mm packaging reserve, reworded"
        plan["groups"] = {("pedestal and rail" if key == "structure" else key): group for key, group in plan["groups"].items()}
        return plan

    def rebuild(self, plan=None, **options):
        """Rebuild from the saved receipt; any attempt to check a case fails the test."""
        with patch("preliminary_design.evaluate", side_effect=AssertionError("a view-only run checks no case")):
            return self.review(plan, view_only=self.receipt, **options)

    def test_a_presentation_edit_rebuilds_the_receipt_a_full_check_writes(self):
        held = self.hold(write_view=True)
        self.assertEqual(held["status"], "layout-checked", held["missingInputs"])
        lines = []
        rebuilt = self.rebuild(self.reworded(), progress=lines.append)
        scene = self.scene.read_bytes()
        self.assertNotEqual(scene, self.stock_scene, "the scene carries the new wording")
        self.assertNotEqual(rebuilt["planSha256"], held["planSha256"])
        self.assertTrue(rebuilt["view"]["verified"])
        self.assertEqual(rebuilt["status"], "layout-checked", rebuilt["missingInputs"])
        self.assertTrue(any(l.startswith("[view] reusing 5 checked case(s)") for l in lines), lines)
        self.assertFalse(any(l.startswith("[motion] ") for l in lines), lines)
        # The same edit through a full check gives the same receipt and the same scene bytes.
        self.scene.write_bytes(self.stock_scene)
        full = self.review(self.reworded(), write_view=True)
        self.assertEqual(json.dumps(rebuilt, indent=2), json.dumps(full, indent=2))
        self.assertEqual(self.scene.read_bytes(), scene)

    def test_an_unchanged_plan_rebuilds_its_own_receipt(self):
        held = self.hold(write_view=True)
        self.scene.unlink()
        self.assertEqual(as_saved(self.rebuild()), as_saved(held))
        self.assertEqual(self.scene.read_bytes(), self.stock_scene)

    def test_a_physics_only_receipt_is_enough_to_write_the_view(self):
        held = self.hold(physics_only=True)
        self.assertTrue(held["physicsOnly"])
        rebuilt = self.rebuild(self.reworded())
        self.assertNotIn("physicsOnly", rebuilt)
        self.scene.write_bytes(self.stock_scene)
        self.assertEqual(json.dumps(rebuilt, indent=2), json.dumps(self.review(self.reworded(), write_view=True), indent=2))

    def test_a_presentation_gap_still_keeps_the_review_provisional(self):
        self.hold(write_view=True)
        plan = self.reworded()
        del plan["presentation"]["components"]["head"]["rationale"]
        rebuilt = self.rebuild(plan)
        self.assertEqual(rebuilt["status"], "provisional")
        self.assertIn("Missing component rationale: head", rebuilt["missingInputs"])

    def refused(self, plan, naming):
        before = self.scene.read_bytes()
        with self.assertRaises(ValueError) as caught:
            self.rebuild(plan)
        self.assertIn(naming, str(caught.exception))
        self.assertIn("run the full check with --write-view", str(caught.exception).lower())
        self.assertEqual(self.scene.read_bytes(), before, "a refused rebuild writes nothing")

    def test_changed_physics_inputs_are_refused_by_name(self):
        self.hold(write_view=True)
        # A wider reserve in one case: a new motion study, and budgets that pin it.
        study = json.loads((self.root / "paths.json").read_text())
        study["cases"][0]["minGapMm"] = 2
        self.refused(dict(deepcopy(self.plan), motion=write(self.root, "paths-wider.json", study)),
                     "Changed since that receipt: the motion study")
        # The control displaced by another offset.
        shifted = deepcopy(self.plan)
        shifted["control"]["offsetMm"] = [0, -48, 0]
        self.refused(shifted, "Changed since that receipt: the displaced control")
        # A heavier mass line: the same cases, another budget result.
        ledger = json.loads((self.root / "budgets.json").read_text())
        ledger["masses"][0]["kg"] = [4, 5.5]
        self.refused(dict(deepcopy(self.plan), budgets=write(self.root, "budgets-heavier.json", ledger)),
                     "Changed since that receipt: the weight and voltage budgets")
        self.refused(dict(deepcopy(self.plan), issue="synthetic-package-B"), "Changed since that receipt: the issue name")

    def test_a_partial_or_missing_receipt_is_refused(self):
        held = self.hold(write_view=True)
        self.receipt.write_text(json.dumps(dict(held, partial=True)), encoding="utf-8")
        self.refused(self.plan, "cannot reuse a partial --fail-fast receipt")
        self.receipt.unlink()
        self.refused(self.plan, "none at layout/receipt.json")
        with self.assertRaises(ValueError):
            self.review(view_only=self.receipt, physics_only=True)

    def test_the_command_reads_the_receipt_beside_the_plan_and_replaces_it(self):
        project, plan = str(self.root.parent), "layout/layout.json"
        def run(*flags):
            return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", project, plan, *flags],
                                  capture_output=True, text=True)
        write(self.root, "layout.json", self.plan)
        first = run("--write-view", "--output", "layout/receipt.json", "--require-checked")
        self.assertEqual(first.returncode, 0, first.stderr)
        held = self.receipt.read_bytes()
        write(self.root, "layout.json", self.reworded())
        again = run("--view-only", "--output", "layout/receipt.json", "--require-checked")
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertIn("[view] reusing 5 checked case(s) and the displaced control from the receipt; no case is rerun", again.stderr)
        self.assertNotIn("[motion] 1/", again.stderr)
        self.assertNotEqual(self.receipt.read_bytes(), held)
        self.assertEqual(json.loads(self.receipt.read_text())["status"], "layout-checked")
        # Without --output the receipt beside the plan is read and the new one is printed.
        printed = run("--view-only", "--quiet")
        self.assertEqual(printed.returncode, 0, printed.stderr)
        self.assertEqual(printed.stdout.encode(), self.receipt.read_bytes().replace(b"\r\n", b"\n"))
        refused = run("--view-only", "--physics-only")
        self.assertEqual(refused.returncode, 2)
        self.assertEqual(run("--from-receipt", "layout/receipt.json").returncode, 2)


if __name__ == "__main__":
    unittest.main()
