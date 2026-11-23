# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/preliminary_design.py
"""Report per-case progress on stderr and stop a motion or package check at its first non-passing case."""
from copy import deepcopy
import json
from pathlib import Path
import re
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import SCRIPTS, package_write, pin, write
from constant_pose_pairs import named_step

PROGRESS = re.compile(r"^\[motion\] (\d+)/(\d+) (\S+) status=(\w+) failing=(\d+) open=(\d+) bounded=(\d+) "
                      r"broadPhase=(\d+) constantPoseBroadPhase=(\d+) case=\d+\.\d\ds total=\d+\.\d\ds$")


def lift(mm):
    return [dict(kind="translation", travelMm=[0, 0, mm])]


def progress(stderr):
    return [PROGRESS.match(line).groups() for line in stderr.splitlines() if line.startswith("[motion] ") and PROGRESS.match(line)]


class CheckerProgressFailFast(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        # Three invented strokes of one slider; the second rises into an overhead stop.
        named_step(cls.root / "scene.step", dict(base=dict(box=([0, 0, 0], [40, 40, 5])),
                                                 stop=dict(box=([0, 0, 30], [10, 10, 35])),
                                                 slider=dict(box=([0, 0, 10], [5, 5, 15]))))
        def study(name, second):
            cases = [dict(id="nudge", basis="Invented short lift", minGapMm=1, moves={"slider": lift(2)}),
                     dict(id="reach", basis="Invented lift toward the stop", minGapMm=1, moves={"slider": lift(second)}),
                     dict(id="settle", basis="Invented return", minGapMm=1, moves={"slider": lift(-3)})]
            return write(cls.root, name, dict(schema="agent-frc/mechanical-motion@1", step=pin(cls.root, "scene.step"), cases=cases))
        study("clear.json", 5)
        study("collide.json", 20)
        cls.layout = cls.root / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def motion(self, study, *flags):
        return subprocess.run([sys.executable, "-B", str(SCRIPTS / "mechanical_motion.py"), str(self.root), study, *flags],
                              capture_output=True, text=True)

    def package(self, plan, *flags):
        write(self.layout, "trial.json", plan)
        return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(self.root), "layout/trial.json", *flags],
                              capture_output=True, text=True)

    def variant(self, name, edit):
        """Register an edited copy of the example motion study under a new pinned file."""
        study = json.loads((self.layout / "paths.json").read_text())
        edit(study["cases"])
        return dict(deepcopy(self.plan), motion=package_write(self.layout, name, study))

    def test_motion_progress_is_stderr_only_and_in_case_order(self):
        loud, quiet = self.motion("clear.json"), self.motion("clear.json", "--quiet")
        self.assertEqual(loud.returncode, 0, loud.stderr)
        self.assertEqual(loud.stdout, quiet.stdout)
        self.assertEqual(quiet.stderr, "")
        rows = progress(loud.stderr)
        self.assertEqual([(r[0], r[1], r[2], r[3]) for r in rows],
                         [("1", "3", "nudge", "pass"), ("2", "3", "reach", "pass"), ("3", "3", "settle", "pass")])
        self.assertNotIn("partial", json.loads(loud.stdout))

    def test_motion_fail_fast_stops_after_the_colliding_case(self):
        full = self.motion("collide.json", "--quiet")
        self.assertEqual([c["status"] for c in json.loads(full.stdout)["cases"]], ["pass", "fail", "pass"])
        run = self.motion("collide.json", "--fail-fast", "--require-pass")
        self.assertEqual(run.returncode, 1)
        result = json.loads(run.stdout)
        self.assertTrue(result["partial"])
        self.assertEqual(result["stoppedAt"], "reach")
        self.assertEqual(result["checkedCases"], ["nudge", "reach"])
        self.assertEqual(result["skippedCases"], ["settle"])
        self.assertEqual([c["case"] for c in result["cases"]], ["nudge", "reach"])
        self.assertEqual(result["cases"], json.loads(full.stdout)["cases"][:2])
        self.assertEqual([r[2] for r in progress(run.stderr)], ["nudge", "reach"])
        self.assertIn("fail-fast stopped at reach; skipped 1 case: settle", run.stderr)
        clean = self.motion("clear.json", "--fail-fast", "--quiet")
        self.assertEqual(clean.stdout, self.motion("clear.json", "--quiet").stdout)

    def test_package_progress_is_stderr_only(self):
        # One process reports the cases in study order; several report each case as it finishes.
        loud, quiet = self.package(self.plan, "--jobs", "1"), self.package(self.plan, "--quiet")
        self.assertEqual(loud.returncode, 0, loud.stderr)
        self.assertEqual(loud.stdout, quiet.stdout)
        self.assertEqual(quiet.stderr, "")
        cases = [c["id"] for c in json.loads((self.layout / "paths.json").read_text())["cases"]]
        rows = progress(loud.stderr)
        self.assertEqual([r[2] for r in rows], [*cases, "package-displacement-control"])
        self.assertEqual([int(r[0]) for r in rows], list(range(1, len(cases) + 2)))
        self.assertTrue(all(int(r[1]) == len(cases) + 1 for r in rows))
        lines = loud.stderr.splitlines()
        self.assertLess(lines.index(next(l for l in lines if l.startswith("[motion] " + str(len(cases) + 1)))),
                        lines.index("[budgets] start"))
        self.assertTrue(any(l.startswith("[budgets] done ") for l in lines))
        self.assertEqual(json.loads(loud.stdout)["status"], "layout-checked")

    def test_package_fail_fast_blocks_and_skips_the_rest(self):
        def collide(cases):
            cases[1]["initialPose"] = {**cases[1]["initialPose"], "rail": [dict(kind="translation", travelMm=[-21, -72, -18])]}
        plan = self.variant("second-collides.json", collide)
        run = self.package(plan, "--fail-fast", "--require-checked", "--jobs", "1")
        self.assertEqual(run.returncode, 1, run.stderr)
        result = json.loads(run.stdout)
        cases = [c["id"] for c in json.loads((self.layout / "paths.json").read_text())["cases"]]
        self.assertTrue(result["partial"])
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["stoppedAt"], cases[1])
        self.assertEqual(result["checkedCases"], cases[:2])
        self.assertEqual(result["skippedCases"], cases[2:])
        self.assertEqual([c["case"] for c in result["cases"]], cases[:2])
        self.assertEqual(result["control"]["status"], "skipped")
        self.assertIsNone(result["control"]["witness"])
        self.assertIsNone(result["budgets"])
        self.assertIn(cases[1], [r["reason"] for r in result["reopen"]])
        self.assertTrue(any("--fail-fast" in m for m in result["missingInputs"]))
        self.assertNotIn("[budgets] start", run.stderr)
        self.assertEqual([r[2] for r in progress(run.stderr)], cases[:2])

    def test_package_fail_fast_open_pair_is_provisional(self):
        def ambiguous(cases):
            # Without subdivision, the loaded turn cannot bound the sample's pass by the sliding gate.
            cases[0]["maxDepth"] = 0
        plan = self.variant("first-open.json", ambiguous)
        full = json.loads(self.package(plan, "--quiet").stdout)
        self.assertEqual([c["status"] for c in full["cases"]], ["open", "pass", "pass", "pass", "pass"])
        self.assertEqual(full["status"], "provisional")
        run = self.package(plan, "--fail-fast", "--quiet", "--require-checked")
        self.assertEqual(run.returncode, 1)
        result = json.loads(run.stdout)
        self.assertTrue(result["partial"])
        self.assertEqual(result["status"], "provisional")
        self.assertEqual(result["stoppedAt"], full["cases"][0]["case"])
        self.assertEqual(result["skippedCases"], [c["case"] for c in full["cases"][1:]])
        self.assertEqual(result["cases"], full["cases"][:1])
        self.assertEqual(result["control"]["status"], "skipped")

    def test_clean_package_fail_fast_matches_the_full_receipt(self):
        full = self.package(self.plan, "--quiet")
        fast = self.package(self.plan, "--fail-fast", "--quiet")
        self.assertEqual(fast.returncode, 0)
        self.assertEqual(fast.stdout, full.stdout)
        self.assertNotIn("partial", json.loads(fast.stdout))

    def test_partial_run_never_writes_or_credits_a_player(self):
        def collide(cases):
            cases[1]["initialPose"] = {**cases[1]["initialPose"], "rail": [dict(kind="translation", travelMm=[-21, -72, -18])]}
        plan = self.variant("partial-view.json", collide)
        plan["view"] = "layout/partial-motion.html"
        run = self.package(plan, "--fail-fast", "--write-view")
        self.assertEqual(run.returncode, 0, run.stderr)
        result = json.loads(run.stdout)
        self.assertTrue(result["partial"])
        self.assertFalse((self.layout / "partial-motion.html").exists())
        self.assertEqual(result["view"], dict(file="layout/partial-motion.html", verified=False, skipped="partial --fail-fast run"))
        self.assertIn("Not writing layout/partial-motion.html", run.stderr)
        # An existing, otherwise matching player is still not credited by a partial run.
        clean = dict(deepcopy(self.plan), view="layout/package-motion.html")
        self.assertTrue(json.loads(self.package(clean, "--quiet").stdout)["view"]["verified"])
        plan["view"] = "layout/package-motion.html"
        self.assertFalse(json.loads(self.package(plan, "--fail-fast", "--quiet").stdout)["view"]["verified"])


if __name__ == "__main__":
    unittest.main()
