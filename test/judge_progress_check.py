# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/progress.py
# @subject scripts/kernel_layout/run.py
# @subject scripts/kernel_layout/measure.py
"""Where a run is, asked from another process while it runs (acceptance 7).

Failure caught: a person or an agent cannot tell a run inside one long motion or trial from a stuck one, a frozen one or a
killed one, or loses the checks that had finished. Every case here is a real run in its own process; the questions are asked
with design judge --where in another."""
import ctypes
import datetime
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent / "fixtures"))
import judged_project as fixture  # noqa: E402
from judged_project import PLUGIN, RELEASE, get, put  # noqa: E402
import ready_example as tray  # noqa: E402

SLOW = PLUGIN / "test/fixtures/slow_library"
PROGRESS = RELEASE + "/results/progress.json"
LONG = "ball waits a long time"


def long_trial(source, judgement):
    """The tray with one more trial: a ball that lies still for many minutes of simulated time, one long nominal run."""
    tray.tray(source)
    tray.judged(judgement)
    trial = json.loads(json.dumps(source["trials"][tray.TRIAL]))
    trial.update(durationS=4000, traceS=10, adjustments=[], events=[{"name": "waited", "when": {"signal": "tS", "above": 3990}, "outcome": "stayed"}])
    source["trials"] = {LONG: trial}
    judgement["interactions"]["tray stop"]["trial"] = LONG
    judgement["missionCases"][0]["trial"] = LONG


def freeze(process):
    if os.name == "nt":
        handle = ctypes.windll.kernel32.OpenProcess(0x0800, False, process.pid)      # PROCESS_SUSPEND_RESUME
        ctypes.windll.ntdll.NtSuspendProcess(handle)
        ctypes.windll.kernel32.CloseHandle(handle)
    else:
        os.kill(process.pid, signal.SIGSTOP)


class Progress(unittest.TestCase):
    def setUp(self):
        self.folder = TemporaryDirectory(ignore_cleanup_errors=True)
        self.processes = []

    def tearDown(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
            process.wait()
            process.told.close()
        self.folder.cleanup()

    def project(self, change=None):
        self.root = fixture.project(Path(self.folder.name) / "project", change)
        return self.root

    def start(self, *args, **more):
        """Start a run in a process of its own, its output in a file. The process is the judge's own, so killing it kills the run."""
        env = dict(os.environ, **{key: str(value) for key, value in more.items()})
        if more:
            env["PYTHONPATH"] = os.pathsep.join([str(SLOW), os.environ.get("PYTHONPATH", "")])
        told = (Path(self.folder.name) / "told.txt").open("wb")
        process = subprocess.Popen([sys.executable, "-B", str(PLUGIN / "scripts/layout_check.py"), *args], cwd=self.root, env=env, stdout=told, stderr=subprocess.STDOUT)
        process.told = told
        self.processes.append(process)
        return process

    def said(self):
        return (Path(self.folder.name) / "told.txt").read_text(encoding="utf-8")

    def where(self):
        run = fixture.judge(self.root, "1.0", "--where")
        self.assertEqual(run.returncode, 0, run.stderr)
        return run.stdout

    def until(self, found, seconds=60, process=None):
        """What found() gives, once it gives something; asked again and again for up to a while."""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            answer = found()
            if answer:
                return answer
            if process is not None and process.poll() is not None:
                self.fail("the run ended first: " + self.said())
            time.sleep(0.2)
        self.fail("not seen within " + str(seconds) + " s; last said: " + self.where() + self.said())

    def counts(self, pattern, process):
        """Two different counts, in order, that --where gives for the same thing."""
        read = lambda: next((int(m[1].replace(",", "")) for m in [re.search(pattern, self.where())] if m), None)
        first = self.until(read, process=process)
        return first, self.until(lambda: next((n for n in [read()] if n is not None and n > first), None), process=process)

    def test_inside_one_long_motion_it_is_named_its_count_rises_and_the_file_decides_nothing(self):
        self.project()
        self.assertIn("No run", self.where())
        process = self.start("1.0", "--motion", "loaded-turn", "--workers", "1", JUDGE_TEST_PAIR_S=0.1)
        first, later = self.counts(r"level 5, clearance of loaded-turn, ([\d,]+) of [\d,]+ pairs", process)
        self.assertGreater(later, first)
        said = self.where()
        self.assertTrue(said.startswith("running"), said)
        self.assertIn("design judge 1.0 --motion loaded-turn", said)
        held = get(self.root, PROGRESS)
        self.assertEqual((held["process"], held["check"], held["subject"], held["level"]), (process.pid, "clearance", "loaded-turn", 5))
        self.assertLessEqual({"asked", "started", "processStarted", "done", "of", "finished", "left", "failures", "updated", "countRose"}, set(held))
        self.assertIn(("electrical", "loaded-turn"), {(r["check"], r["subject"]) for r in held["finished"]})
        self.assertTrue(all("seconds" in r and "result" in r for r in held["finished"]))
        # The same lines are on standard output while it runs.
        self.assertIn("electrical of loaded-turn: pass", self.said())
        self.until(lambda: re.search(r"clearance of loaded-turn, [\d,]+ of [\d,]+ pairs", self.said()), process=process)
        # A second run is refused while this one is running, naming it.
        second = fixture.judge(self.root, "1.0", "--only", "weight")
        self.assertEqual(second.returncode, 2)
        self.assertIn("design judge 1.0 --motion loaded-turn", second.stderr)
        # Deleted in the middle of the run, the file comes back and no result changes.
        self.until(lambda: self.removed(), process=process)
        self.assertEqual(process.wait(120), 0, self.said())
        self.assertIn("Passed what was asked", self.said())
        self.assertTrue(self.where().startswith("finished"), self.where())
        # Past seconds for the same check are shown as past, and no finish time is guessed.
        again = self.start("1.0", "--motion", "loaded-turn", "--workers", "1", JUDGE_TEST_PAIR_S=0.1)
        self.until(lambda: re.search(r"clearance of loaded-turn.*last time this check took [\d.]+ s", self.where()), process=again)

    def removed(self):
        try:
            (self.root / PROGRESS).unlink()
        except OSError:
            return False
        return True

    def test_inside_one_trial_it_is_named_its_step_rises_and_a_killed_run_reads_as_stopped_early_with_its_checks_logged(self):
        self.project(long_trial)
        process = self.start("1.0", "--workers", "1")
        first, later = self.counts(r"level 6, trial of " + LONG + r", .*step ([\d,]+) of [\d,]+", process)
        self.assertGreater(later, first)
        process.kill()
        process.wait()
        said = self.where()
        self.assertTrue(said.startswith("stopped early"), said)
        self.assertIn("trial of " + LONG, said)
        rows = {(r["check"], r["subject"]): r["result"] for r in get(self.root, RELEASE + "/judge-log.json")["rows"]}
        self.assertEqual((rows[("clearance", "loaded-turn")], rows[("weight", "inspection")], rows[("adjustment", "wall position")]), ("pass", "pass", "pass"))
        self.assertNotIn(("trial", LONG), rows)
        # The killed run does not hold the release: another run starts.
        self.assertEqual(fixture.judge(self.root, "1.0", "--only", "weight").returncode, 0)

    def test_a_frozen_run_reads_as_not_responding(self):
        self.project()
        process = self.start("1.0", "--motion", "loaded-turn", "--workers", "1", JUDGE_TEST_PAIR_S=0.5)
        self.until(lambda: "clearance of loaded-turn" in self.where(), process=process)
        freeze(process)
        time.sleep(0.5)
        # The process is there and frozen; its last word is put back instead of waiting half a minute for it to age.
        held = get(self.root, PROGRESS)
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=40)
        put(self.root, PROGRESS, dict(held, updated=old.isoformat(timespec="seconds").replace("+00:00", "Z")))
        said = self.where()
        self.assertTrue(said.startswith("not responding"), said)
        self.assertRegex(said, r"4\d s")

    def test_with_a_worker_stuck_and_the_parent_still_writing_it_says_there_is_no_progress_and_for_how_long(self):
        self.project()
        stuck = Path(self.folder.name) / "stuck"
        process = self.start("1.0", "--level", "5", "--workers", "2", JUDGE_TEST_PAIR_S=0.05, JUDGE_TEST_STUCK=stuck)
        self.until(lambda: stuck.exists(), process=process)
        found = self.until(lambda: re.search(r"^running, no progress for (\d+) s", self.where()), process=process)
        self.assertGreaterEqual(int(found[1]), 10)
        age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(get(self.root, PROGRESS)["updated"].replace("Z", "+00:00"))
        self.assertLess(age.total_seconds(), 6, "the parent is still writing")

    def test_a_process_that_took_the_number_of_a_killed_run_is_not_taken_for_it(self):
        self.project()
        self.assertEqual(fixture.judge(self.root, "1.0", "--only", "weight").returncode, 0)
        held = get(self.root, PROGRESS)
        put(self.root, PROGRESS, dict(held, state="running", process=os.getpid(), processStarted="another time"))
        self.assertTrue(self.where().startswith("stopped early"), self.where())


if __name__ == "__main__":
    unittest.main()
