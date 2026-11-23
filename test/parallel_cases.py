# @lane merge
# @subject scripts/mechanical_readiness.py
# @subject scripts/preliminary_design.py
"""Share the motion cases between worker processes without changing a byte of the receipt."""
from copy import deepcopy
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from mechanical_fixture import SCRIPTS, package_write, pin, write
from constant_pose_pairs import BRACKET, INSERT, lift, named_step
from checker_progress_failfast import progress


class ParallelCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        cls.layout = cls.root / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.layout)
        cls.cases = [c["id"] for c in json.loads((cls.layout / "paths.json").read_text())["cases"]]
        # An invented rack of posts with one notched bracket, its insert and a slider under a stop.
        bodies = {f"post-{i:02d}": dict(box=([30 * i, 0, 0], [30 * i + 10, 10, 40])) for i in range(12)}
        bodies.update(bracket=dict(BRACKET, box=([0, 100, 0], [20, 120, 10]), cut=[([5, 105, -1], [21, 121, 11])]),
                      insert=dict(box=([8, 108, 2], [12, 112, 6])), slider=dict(box=([12, 0, 0], [16, 10, 5])),
                      stop=dict(box=([12, 0, 25], [16, 10, 30])))
        named_step(cls.root / "rack.step", bodies)
        def case(id, mm, **extra):
            return dict(id=id, basis="Invented slider stroke", minGapMm=1, moves={"slider": lift(mm)}, **extra)
        def pull(id, mm):
            return dict(id=id, basis="Invented slider withdrawal", minGapMm=1, stage="service", extract=["slider"],
                        moves={"slider": [dict(kind="translation", travelMm=[0, -mm, 0])]})
        cls.rack = dict(schema="agent-frc/mechanical-motion@1", step=pin(cls.root, "rack.step"), cases=[
            case("short", 5), case("long", 30),
            case("shifted", 5, initialPose={"insert": [dict(kind="translation", travelMm=[0, 0, 1])]}),
            case("again", 5), pull("part-way", 8), pull("pull", 200),
            dict(id="after", basis="Invented insert lift with the slider out", minGapMm=1, stage="service",
                 removed={"slider": "pull"}, moves={"insert": lift(2)})])

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def package(self, plan, *flags):
        write(self.layout, "trial.json", plan)
        return subprocess.run(["node", str(SCRIPTS / "design.mjs"), "preliminary-check", str(self.root), "layout/trial.json", *flags],
                              capture_output=True, text=True)

    def motion(self, study, *flags):
        write(self.root, "study.json", study)
        return subprocess.run([sys.executable, "-B", str(SCRIPTS / "mechanical_motion.py"), str(self.root), "study.json", *flags],
                              capture_output=True, text=True)

    def colliding(self):
        study = json.loads((self.layout / "paths.json").read_text())
        study["cases"][1]["initialPose"] = {**study["cases"][1]["initialPose"],
                                            "rail": [dict(kind="translation", travelMm=[-21, -72, -18])]}
        return dict(deepcopy(self.plan), motion=package_write(self.layout, "second-collides.json", study))

    def test_the_receipt_is_the_same_for_one_worker_four_and_the_default(self):
        one = self.package(self.plan, "--jobs", "1")
        self.assertEqual(one.returncode, 0, one.stderr)
        self.assertEqual(json.loads(one.stdout)["status"], "layout-checked")
        self.assertNotIn("jobs", one.stdout)
        for flags in (("--jobs", "4"), ()):
            run = self.package(self.plan, *flags)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(run.stdout, one.stdout, flags)

    def test_every_case_reports_once_and_the_control_keeps_its_place(self):
        run = self.package(self.plan, "--jobs", "4")
        rows = progress(run.stderr)
        self.assertEqual(sorted(int(r[0]) for r in rows), list(range(1, len(self.cases) + 2)))
        self.assertEqual({int(r[0]): r[2] for r in rows},
                         dict(enumerate([*self.cases, "package-displacement-control"], 1)))
        result = json.loads(run.stdout)
        # The control is the study's last case: it never enters the nominal cases and its witness is the displaced pair.
        self.assertEqual([c["case"] for c in result["cases"]], self.cases)
        self.assertEqual(result["control"]["witness"]["status"], "fail")
        lines = run.stderr.splitlines()
        self.assertLess(max(i for i, l in enumerate(lines) if l.startswith("[motion] ")), lines.index("[budgets] start"))
        serial = progress(self.package(self.plan, "--jobs", "1").stderr)
        self.assertEqual([r[2] for r in serial], [*self.cases, "package-displacement-control"])

    def test_fail_fast_stops_at_the_case_one_worker_stops_at(self):
        plan = self.colliding()
        one = self.package(plan, "--fail-fast", "--jobs", "1")
        four = self.package(plan, "--fail-fast", "--jobs", "4")
        self.assertEqual((one.returncode, four.returncode), (0, 0), four.stderr)
        self.assertEqual(four.stdout, one.stdout)
        result = json.loads(four.stdout)
        self.assertEqual(result["stoppedAt"], self.cases[1])
        self.assertEqual(result["checkedCases"], self.cases[:2])
        self.assertEqual(result["skippedCases"], self.cases[2:])
        self.assertEqual(result["control"]["status"], "skipped")
        self.assertIn("fail-fast stopped at " + self.cases[1], four.stderr)
        self.assertNotIn("[budgets] start", four.stderr)
        # A clean run stops nowhere and checks the control.
        clean = self.package(self.plan, "--fail-fast", "--jobs", "4", "--quiet")
        self.assertEqual(clean.stdout, self.package(self.plan, "--jobs", "1", "--quiet").stdout)
        self.assertEqual(clean.stderr, "")

    def test_shared_cases_merge_into_the_single_process_result(self):
        import mechanical_motion
        def evaluate(jobs, **options):
            return mechanical_motion.evaluate(self.root, self.rack, package_scene=lambda case, scene: None, jobs=jobs, **options)
        whole = evaluate(1)
        self.assertEqual([c["status"] for c in whole["cases"]], ["pass", "fail", "pass", "pass", "open", "pass", "pass"])
        self.assertEqual([c["counts"]["constantPoseReused"] for c in whole["cases"]], [0, 1, 0, 1, 1, 1, 0])
        self.assertEqual(whole["cases"][5]["extracted"], ["slider"])
        # Every case is cut into three shares of its 120 or 105 body pairs.
        with patch.object(mechanical_motion, "PAIRS_PER_SHARE", 30):
            lines = []
            shared = evaluate(3, progress=lines.append)
            stopped = evaluate(3, fail_fast=True)
        self.assertEqual(json.dumps(shared), json.dumps(whole))
        self.assertEqual(sorted(l.split()[1] for l in lines if l.startswith("[motion] ")), [f"{i}/7" for i in range(1, 8)])
        self.assertEqual(json.dumps(stopped), json.dumps(evaluate(1, fail_fast=True)))
        self.assertEqual(stopped["stoppedAt"], "long")

    def test_an_invalid_case_ends_the_run_with_the_same_error(self):
        study = deepcopy(self.rack)
        study["cases"][3].update(stage="service", removed={"slider": "pull"})
        one, three = self.motion(study, "--quiet"), self.motion(study, "--quiet", "--jobs", "3")
        self.assertEqual(one.returncode, 1)
        self.assertIn("Service removals must match", one.stderr)
        self.assertEqual((three.returncode, three.stderr), (one.returncode, one.stderr))
        study = deepcopy(self.rack)
        study["cases"][2]["moves"] = {"absent": lift(1)}
        one, three = self.motion(study, "--quiet"), self.motion(study, "--quiet", "--jobs", "3")
        self.assertIn("Motion references absent installed parts", one.stderr)
        self.assertEqual((three.returncode, three.stderr), (one.returncode, one.stderr))

    def test_a_body_replacing_callback_needs_one_process(self):
        from mechanical_motion import evaluate, transform
        def replace(case, scene):
            scene["insert"] = transform(scene["insert"], lift(1), 1)
        self.assertEqual(len(evaluate(self.root, self.rack, package_scene=replace)["cases"]), 7)
        with self.assertRaisesRegex(RuntimeError, "jobs=1"):
            evaluate(self.root, self.rack, package_scene=replace, jobs=2)

    def test_the_default_leaves_a_core_free_and_stays_within_memory(self):
        from mechanical_motion import automatic_jobs
        with patch("os.cpu_count", return_value=16):
            self.assertEqual(automatic_jobs(100, (1, 1000)), 15)
            self.assertEqual(automatic_jobs(6, (1, 1000)), 6)
            self.assertEqual(automatic_jobs(100, (250, 1000)), 3)
            self.assertEqual(automatic_jobs(100, (900, 1000)), 1)
        with patch("os.cpu_count", return_value=1):
            self.assertEqual(automatic_jobs(100, (1, 1000)), 1)
        with patch("os.cpu_count", return_value=None):
            self.assertEqual(automatic_jobs(100, (1, 1000)), 1)
        self.assertGreaterEqual(automatic_jobs(100), 1)
