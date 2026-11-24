# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/interactions.py
# @subject scripts/kernel_layout/stages.py
# @subject scripts/effective-readiness.mjs
# @subject examples/design-source/create.py
# @subject test/fixtures/ready_example.py
"""Interactions on the design library: the screen verdict, the trial record and the adjustment extremes the check judges.

Failure caught: a design reaches the effective bar on a trial that is stale, on a verdict that hides what one
section cannot show, or on an adjustment whose ends were never measured. The invented starter gains a tray and a
wall on the field, a ball, one interaction, one planar trial and one mechanical adjustment. Each control changes one
input and must change what is judged."""
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"
# The invented tray, wall, ball, interaction and trial, shared with the tests that mark the starter effective.
_TRAY = runpy.run_path(str(PLUGIN / "test/fixtures/ready_example.py"))
TRIAL, tray, judged = _TRAY["TRIAL"], _TRAY["tray"], _TRAY["judged"]


class KernelInteractionsCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        runpy.run_path(str(PLUGIN / "examples/design-source/create.py"))["create"](cls.root / RELEASE, "1.0", cls.root)
        cls.source = tray(json.loads((cls.root / RELEASE / "design.json").read_text(encoding="utf-8")))
        cls.judgement = judged(json.loads((cls.root / RELEASE / "judgement.json").read_text(encoding="utf-8")))
        cls.put("judgement.json", cls.judgement)
        cls.refresh(cls.source)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    @classmethod
    def put(cls, name, data):
        (cls.root / RELEASE / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")

    @classmethod
    def library(cls, *args):
        return subprocess.run([sys.executable, "-m", "frc_design_kernel", *args], cwd=cls.root, check=True, capture_output=True, text=True)

    @classmethod
    def refresh(cls, source, trial=True, extremes=True):
        """Write the source and the library's records for it, as an author does after an edit."""
        cls.put("design.json", source)
        if trial:
            cls.library("try", RELEASE + "/design.json", "--out", RELEASE + "/records")
        if extremes:
            cls.library("measure", RELEASE + "/design.json", "--out", RELEASE + "/records", "--extremes", "--min-gap", "1")

    def tearDown(self):
        self.put("judgement.json", self.judgement)
        self.refresh(self.source)

    def check(self, *flags):
        run = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json",
                              "--json", *flags], capture_output=True, text=True)
        verdict = json.loads(run.stdout) if run.stdout.strip() else None
        return run, verdict, ((verdict or {}).get("interactions") or [None])[0]

    def copy(self, data):
        return json.loads(json.dumps(data))

    def on_fit(self, operation):
        """The source with the article's acquire move written as the trial's fit. The fit ends where the trial left the
        article, off its ejector's joint, so the turn starts from a pose with the article as drawn instead of after it."""
        source = self.copy(self.source)
        source["motions"]["acquire"]["moves"]["carried article"] = [operation]
        source["motions"]["acquire"]["by"] = "piece"
        source["poses"]["loaded"] = {}
        source["motions"]["loaded-turn"]["from"] = "loaded"
        return source

    def texts(self, verdict):
        return [row["text"] for row in verdict["unmet"]]

    def test_the_verdict_the_trial_and_the_adjustment_are_judged_and_meet_the_bar(self):
        run, verdict, row = self.check()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(verdict["status"], "layout-checked", verdict["unmet"])
        self.assertEqual((row["verdict"], row["decides"]), ("planar is enough", "Invented: whether the wall needs a lip"))
        trial = row["trial"]
        self.assertEqual((trial["name"], trial["engine"], trial["result"], trial["state"]), (TRIAL, "planar", "passed", "current"))
        self.assertEqual(trial["sensitivity"][0], "loads.push.accelerationMps2")
        self.assertIn(dict(path="pieces.ball.massKg", value=0.2, source="assumed", range=[0.15, 0.25]), trial["inputs"])
        self.assertIn("flat-tray", [a["id"] for a in trial["assumptions"]])
        self.assertEqual(trial["adjustments"], ["wall position"])
        self.assertEqual([(a["name"], a["measured"], a["findings"]) for a in verdict["adjustments"]], [("wall position", True, [])])
        self.assertEqual(verdict["missionCases"], [dict(name="deliver", trial=TRIAL, accomplishes="delivered", objective="Acquire, turn and release",
                                                       state="current", result="passed")])
        self.assertIn("[screen] tray stop: planar is enough", run.stderr)
        self.assertIn("[trial] " + TRIAL + " (planar): passed", run.stderr)
        # The readiness report judges the same records: the interaction meets its bar and backs the mission case.
        report = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "effective-readiness", str(self.root), "--release", RELEASE, "--json"],
                                capture_output=True, text=True)
        self.assertEqual(report.returncode, 0, report.stderr)
        criteria = {c["id"]: c for c in json.loads(report.stdout)["criteria"]}
        self.assertEqual(criteria["interactions"]["reasons"], [])
        self.assertIn("tray stop: planar is enough; trial " + TRIAL + " (planar): passed; leans most on loads.push.accelerationMps2",
                      criteria["interactions"]["notes"])
        self.assertEqual((criteria["whole-cycle"]["reasons"], criteria["risks-resolved"]["reasons"]), ([], []))

    def test_a_changed_solid_makes_the_trial_stale_and_judging_refuses(self):
        source = self.copy(self.source)
        source["fixtures"][-1]["shape"]["toMm"][2] = 70
        self.refresh(source, trial=False, extremes=False)
        run, verdict, _ = self.check()
        self.assertEqual(run.returncode, 2)
        self.assertIsNone(verdict)
        self.assertIn('trial "' + TRIAL + '" is stale', run.stderr)
        self.assertIn('"wall"', run.stderr)

    def test_the_screen_sends_what_a_section_cannot_show_to_3d_and_an_override_needs_a_reason(self):
        source = self.copy(self.source)
        source["interactions"]["tray stop"]["piecesAtOnce"] = 2
        self.refresh(source, extremes=False)
        _, _, row = self.check()
        self.assertEqual(row["verdict"], "needs 3D")
        self.assertIn("2 pieces at once; guideline: one piece", row["reasons"])
        judgement = self.copy(self.judgement)
        judgement["interactions"]["tray stop"]["override"] = dict(verdict="planar is enough", reason="Invented: the second ball waits behind a gate")
        self.put("judgement.json", judgement)
        _, _, over = self.check()
        self.assertEqual((over["screened"], over["verdict"], over["override"]), ("needs 3D", "planar is enough", "Invented: the second ball waits behind a gate"))
        del judgement["interactions"]["tray stop"]["override"]["reason"]
        self.put("judgement.json", judgement)
        refused, _, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("An override of interaction tray stop gives a verdict", refused.stderr)
        # A compliant surface makes a simulated result only a best guess.
        source = self.copy(self.source)
        source["fixtures"][-2]["material"] = {"class": "compliant", "stiffnessNPerM": 20000}
        self.refresh(source, extremes=False)
        self.put("judgement.json", self.judgement)
        _, _, soft = self.check()
        self.assertEqual((soft["verdict"], soft["reasons"]), ("configurable", ["tray is compliant; guideline: rigid surfaces"]))

    def test_an_adjustment_end_that_closes_on_the_robot_is_a_finding(self):
        source = self.copy(self.source)
        source["adjustments"]["wall position"]["range"] = [45, 306]
        self.refresh(source)
        _, verdict, _ = self.check()
        findings = verdict["adjustments"][0]["findings"]
        self.assertTrue(any(f.startswith("at 45: ") and "wall" in f for f in findings), findings)
        # Not measured at its ends: the row says how to measure it.
        (self.root / RELEASE / "records/adjustments.json").unlink()
        _, unmeasured, _ = self.check()
        self.assertFalse(unmeasured["adjustments"][0]["measured"])
        self.assertIn("--extremes --min-gap 1", unmeasured["adjustments"][0]["hint"])

    def test_an_unexplained_interaction_is_unmet_and_a_path_must_be_the_trial_fit(self):
        judgement = self.copy(self.judgement)
        del judgement["interactions"]
        self.put("judgement.json", judgement)
        _, verdict, row = self.check()
        self.assertIn("Say in the judgement file what interaction tray stop decides, and name its trial or why it needs none", self.texts(verdict))
        self.assertEqual(verdict["status"], "provisional")
        self.assertEqual(row["verdict"], "planar is enough", "the verdict is still judged")
        # A payload bound to a trial must move on the path the trial fitted.
        judgement = self.copy(self.judgement)
        judgement["motions"] = {"acquire": {"transportedBy": {"carried article": dict(mechanisms=["carrier"], drive={"carrier": "Invented rollers"},
                                                                                      basis="Invented", trial=TRIAL)}}}
        self.put("judgement.json", judgement)
        _, unfit, _ = self.check()
        self.assertIn("The move of carried article in acquire is not the path trial " + TRIAL + " fitted. Write its fit operation as the move in the design source",
                      self.texts(unfit))
        fit = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][TRIAL]["fit"]
        self.refresh(self.on_fit(fit["operation"]), trial=False, extremes=False)
        _, fitted, _ = self.check()
        self.assertFalse(any("fitted" in gap for gap in self.texts(fitted)), fitted["unmet"])
        # A window of the trial binds the stroke between two kept points of the fit; any other time is refused.
        spec = judgement["motions"]["acquire"]["transportedBy"]["carried article"]
        spec["window"] = [fit["atS"][0], fit["atS"][-1]]
        self.put("judgement.json", judgement)
        _, windowed, _ = self.check()
        self.assertFalse(any("fitted" in gap for gap in self.texts(windowed)), windowed["unmet"])
        spec["window"] = [fit["atS"][0], fit["atS"][-1] / 3]
        self.put("judgement.json", judgement)
        refused, _, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("The window of carried article in acquire runs between two kept points of the trial's fit", refused.stderr)

    def test_a_free_path_or_a_fixture_moves_a_payload_only_on_its_trial(self):
        fit = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][TRIAL]["fit"]["operation"]
        self.refresh(self.on_fit(fit), trial=False, extremes=False)
        judgement = self.copy(self.judgement)
        judgement["motions"] = {"acquire": {"freePath": {"carried article": dict(basis="Invented: the article rolls free", trial=TRIAL)}}}
        self.put("judgement.json", judgement)
        # The fitted path ends where the trial left the article, so the cycle after it is broken here; the path itself is bound.
        cycle = "Discontinuous cycle: carried article between acquire and loaded-turn"
        _, verdict, _ = self.check()
        self.assertIn(cycle, self.texts(verdict))
        self.assertFalse(any("fitted" in gap for gap in self.texts(verdict)), verdict["unmet"])
        # A field fixture supports the same path; a robot solid cannot.
        judgement["motions"] = {"acquire": {"supportedBy": {"carried article": dict(fixtures=["tray"], basis="Invented: the tray carries it", trial=TRIAL)}}}
        self.put("judgement.json", judgement)
        _, supported, _ = self.check()
        self.assertIn(cycle, self.texts(supported))
        judgement["motions"]["acquire"]["supportedBy"]["carried article"]["fixtures"] = ["rail"]
        self.put("judgement.json", judgement)
        refused, _, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Only a field fixture present in acquire can support a payload: carried article", refused.stderr)
        # A binding names its trial: a path with no trial stops the check.
        spec = judgement["motions"]["acquire"]["supportedBy"]["carried article"]
        del spec["trial"]
        spec["fixtures"] = ["tray"]
        self.put("judgement.json", judgement)
        unnamed, _, _ = self.check()
        self.assertEqual(unnamed.returncode, 2)
        self.assertIn("the design library trial that moves it, as trial: NAME: carried article", unnamed.stderr)


if __name__ == "__main__":
    unittest.main()
