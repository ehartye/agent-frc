"""Report a preliminary layout's solid count and finest path tolerance as information that never changes the result."""
from copy import deepcopy
import json
from pathlib import Path
import runpy
import subprocess
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, write


class LayoutScope(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        cls.layout = cls.root / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)
        cls.baseline = cls.check(cls.plan, "--require-checked")

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    @classmethod
    def check(cls, plan, *flags):
        write(cls.layout, "trial.json", plan)
        return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(cls.root), "layout/trial.json", *flags],
                              capture_output=True, text=True)

    def variant(self, edit):
        plan = deepcopy(self.plan)
        edit(plan)
        return plan

    def scope_lines(self, run):
        return [line for line in run.stderr.splitlines() if line.startswith("[scope] ")]

    def test_blockout_reports_its_count_and_passes_no_guideline(self):
        self.assertEqual(self.baseline.returncode, 0, self.baseline.stderr)
        receipt = json.loads(self.baseline.stdout)
        scope = receipt["scope"]
        members = {m for g in self.plan["groups"].values() for m in g["members"]}
        self.assertTrue(scope["informational"])
        self.assertEqual(scope["solids"] + scope["fieldFixtures"], len(members))
        self.assertEqual(scope["guideline"], dict(solids=80, toleranceMm=10, source="plugin default"))
        self.assertEqual(scope["passed"], [])
        self.assertIsNone(scope["finestPathToleranceMm"])
        self.assertEqual(scope["undeclaredPathTolerance"], len(self.plan["stages"]))
        lines = self.scope_lines(self.baseline)
        self.assertEqual(len(lines), 1)
        self.assertIn(f"solids={scope['solids']} ", lines[0])
        self.assertIn("finest path tolerance=not declared", lines[0])
        # The line is printed before any case runs.
        stderr = self.baseline.stderr.splitlines()
        self.assertLess(stderr.index(lines[0]), next(i for i, l in enumerate(stderr) if l.startswith("[motion] ")))

    def test_the_run_reports_its_time_against_the_guidelines(self):
        lines = [line for line in self.baseline.stderr.splitlines() if line.startswith("[time] ")]
        self.assertEqual(len(lines), 1, self.baseline.stderr)
        self.assertRegex(lines[0], r"^\[time\] layout check in \d+ s\. Guidelines: about 1 minute while editing, 15 minutes at a stage gate\.$")
        self.assertEqual(self.baseline.stderr.splitlines()[-1], lines[0], "the last line an agent reads")
        self.assertNotIn("[time]", self.check(self.plan, "--quiet").stderr)
        time_lines = runpy.run_path(str(SCRIPTS / "preliminary_design.py"), run_name="scope_time")["time_lines"]
        self.assertEqual(len(time_lines(42)), 1)
        self.assertIn("past the guideline for a check while editing", time_lines(200)[1])
        self.assertIn("[time] layout check in 11.0 min.", time_lines(660)[0])
        self.assertIn("this run passed ten minutes. Stop and tell the owner what is slow and why", time_lines(660)[1])
        self.assertIn("[time] view rebuilt in 3 s.", time_lines(3, reused=True)[0])

    def test_passing_a_guideline_is_information_only(self):
        first, second = list(self.plan["stages"])[:2]
        def deeper(plan):
            plan["scopeGuidelines"] = dict(solids=3)
            plan["stages"][first]["pathToleranceMm"] = 40
            plan["stages"][second]["pathToleranceMm"] = 2.5
        # The review lists the tolerance of each phase in its check results, so a newly declared tolerance rewrites the view.
        run = self.check(self.variant(deeper), "--require-checked", "--write-view")
        self.assertEqual(run.returncode, self.baseline.returncode, run.stderr)
        receipt, before = json.loads(run.stdout), json.loads(self.baseline.stdout)
        for key in ("status", "missingInputs", "reopen", "cases", "control", "budgets", "decision"):
            self.assertEqual(receipt[key], before[key], key)
        scope = receipt["scope"]
        self.assertEqual(scope["passed"], ["solids", "pathTolerance"])
        self.assertEqual(scope["guideline"], dict(solids=3, toleranceMm=10, source="layout plan"))
        self.assertEqual((scope["finestPathToleranceMm"], scope["finestPathToleranceCase"]), (2.5, second))
        self.assertEqual(scope["undeclaredPathTolerance"], len(self.plan["stages"]) - 2)
        self.assertNotIn("extendedBudget", scope)
        note = self.scope_lines(run)[1]
        self.assertTrue(note.startswith("[scope] note: "))
        self.assertIn("past the guideline of about 3", note)
        self.assertIn(second + " is checked to a 2.5 mm path tolerance, finer than the guideline of 10 mm", note)
        self.assertIn("does not change the result", note)
        self.assertIn("agree a bounded extended budget", note)
        stale = self.check(self.plan, "--quiet")
        self.assertIn("Generate the matching view of these checked trajectories with --write-view", json.loads(stale.stdout)["missingInputs"],
                      "the view on disk now shows tolerances this plan does not declare")
        quiet = self.check(self.variant(deeper), "--quiet")
        self.assertEqual(quiet.stderr, "")
        self.assertEqual(json.loads(quiet.stdout)["scope"], scope)

    def test_an_agreed_budget_is_named_in_the_note_and_the_receipt(self):
        budget = dict(detail="Invented idler shafts on the carrier", question="Does the carrier clear the rail with its shafts?",
                      allowance="Six more solids and one refined case", stopsWhen="The carrier pair is resolved either way")
        def agreed(plan):
            plan["scopeGuidelines"] = dict(solids=3, toleranceMm=50, extendedBudget=budget)
            for stage in plan["stages"].values():
                stage["pathToleranceMm"] = 40
        run = self.check(self.variant(agreed), "--require-checked", "--write-view")
        self.assertEqual(run.returncode, self.baseline.returncode, run.stderr)
        scope = json.loads(run.stdout)["scope"]
        self.assertEqual(scope["passed"], ["solids", "pathTolerance"])
        self.assertEqual(scope["extendedBudget"], budget)
        self.assertEqual(scope["undeclaredPathTolerance"], 0)
        note = self.scope_lines(run)[1]
        self.assertIn("records an agreed extended budget: " + budget["detail"], note)
        self.assertIn("stops when: " + budget["stopsWhen"], note)
        self.assertNotIn("agree a bounded extended budget", note)

    def test_malformed_figures_stop_with_a_message(self):
        for edit, message in (
                (lambda plan: plan.update(scopeGuidelines=dict(solids=0)), "scopeGuidelines.solids as a positive number"),
                (lambda plan: plan.update(scopeGuidelines=dict(extendedBudget=dict(detail="Invented shafts"))), "An agreed extended budget names its"),
                (lambda plan: next(iter(plan["stages"].values())).update(pathToleranceMm=-1), "as a positive number of millimetres")):
            run = self.check(self.variant(edit))
            self.assertEqual(run.returncode, 2)
            self.assertIn(message, run.stderr)


if __name__ == "__main__":
    unittest.main()
