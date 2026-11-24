# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/interactions.py
# @subject scripts/kernel_layout/stages.py
# @subject scripts/effective-readiness.mjs
# @subject examples/design-source/create.py
# @subject test/fixtures/ready_example.py
"""Interactions on the design library: the screen verdict, the trial and the adjustment's ends the judge runs, and the bar they meet.

Failure caught: a design reaches the effective bar on a trial that fails, on a verdict that hides what one section cannot
show, on an adjustment whose ends are never measured, or on a payload path that is not its trial's. The invented starter
gains a tray and a wall on the field, a ball, one interaction, one planar trial and one mechanical adjustment. Each control
changes one input and must change what is judged."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent / "fixtures"))
from judged_project import PLUGIN, RELEASE, Judge, counted, get, with_tray  # noqa: E402
from ready_example import TRIAL  # noqa: E402

ROLLED = "ball rolls off the tray"


class KernelInteractionsCheck(Judge):
    change = staticmethod(with_tray)

    def row(self, verdict, check, subject):
        return next(r for r in verdict["rows"] if (r["check"], r["subject"]) == (check, subject))

    def trials(self):
        return get(self.root, RELEASE + "/results/trials.json")["trials"]

    def bind(self, trial, window=None, field="transportedBy", **spec):
        """Bind the carried article's move in acquire to a trial, over a window of its fit when one is given."""
        own = dict(basis="Invented", trial=trial, **spec, **({"window": window} if window else {}))
        if field == "transportedBy":
            own.update(mechanisms=["carrier"], drive={"carrier": "Invented rollers"})
        self.judgement(lambda j: j.update(motions={"acquire": {field: {"carried article": own}}}))

    def moved_on(self, operation):
        """The article's acquire move written as one operation. It ends where the trial left the article, off its ejector's
        joint, so the turn starts from a pose with the article as drawn instead of after it."""
        def change(source):
            source["motions"]["acquire"]["moves"]["carried article"] = [operation]
            source["motions"]["acquire"]["by"] = "piece"
            source["poses"]["loaded"] = {}
            source["motions"]["loaded-turn"]["from"] = "loaded"
        self.source(change)

    def test_the_screen_the_trial_and_the_adjustment_are_judged_and_meet_the_bar(self):
        verdict = self.judge()
        self.assertEqual((verdict["result"], verdict["status"]), ("pass", "layout-checked"), verdict["unmet"])
        [row] = verdict["interactions"]
        self.assertEqual((row["verdict"], row["decides"], row["unmet"]), ("planar is enough", "Invented: whether the wall needs a lip", []))
        trial = row["trial"]
        self.assertEqual((trial["name"], trial["engine"], trial["result"]), (TRIAL, "planar", "passed"))
        self.assertEqual(trial["sensitivity"][0], "loads.push.accelerationMps2")
        self.assertIn(dict(path="pieces.ball.massKg", value=0.2, source="assumed", range=[0.15, 0.25]), trial["inputs"])
        self.assertIn("flat-tray", [a["id"] for a in trial["assumptions"]])
        self.assertEqual(trial["adjustments"], ["wall position"])
        self.assertEqual([(a["name"], a["status"], a["findings"]) for a in verdict["adjustments"]], [("wall position", "pass", [])])
        self.assertEqual(verdict["missionCases"], [dict(name="deliver", trial=TRIAL, accomplishes="delivered", objective="Acquire, turn and release", result="passed")])
        # Each has a row of its own, at its own level.
        self.assertEqual([(self.row(verdict, *key)["level"], self.row(verdict, *key)["result"]) for key in
                          (("adjustment", "wall position"), ("trial", TRIAL), ("interaction", "tray stop"))], [(5, "pass"), (6, "pass"), (7, "pass")])
        # The readiness report judges the whole design itself: the interaction meets its bar and backs the mission case.
        report = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "effective-readiness", "1.0", "--json"], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(report.returncode, 0, report.stderr)
        found = json.loads(report.stdout)
        criteria = {c["id"]: c for c in found["criteria"]}
        self.assertEqual({name: c["reasons"] for name, c in criteria.items()}, {"whole-cycle": [], "interactions": [], "risks-resolved": []})
        self.assertIn("tray stop: planar is enough; trial " + TRIAL + " (planar): passed; leans most on loads.push.accelerationMps2", criteria["interactions"]["notes"])

    def test_a_trial_that_fails_stops_the_run_and_the_interaction_it_backs_does_not_meet_its_bar(self):
        self.source(lambda s: s["trials"][TRIAL]["loads"][0].update(accelerationMps2=-6))
        verdict = self.judge(trials=[TRIAL])
        self.assertEqual((verdict["result"], verdict["firstUnmet"]["kind"]), ("fail", "trial"))
        self.assertIn(TRIAL, verdict["firstUnmet"]["text"])
        failed = self.judge(only=["interaction"])
        self.assertEqual(self.row(failed, "interaction", "tray stop")["result"], "fail")
        self.assertTrue(any("trial " + TRIAL + " is " in text for text in failed["interactions"][0]["unmet"]), failed["interactions"][0]["unmet"])
        self.assertEqual(failed["missionCases"][0]["result"], self.trials()[TRIAL]["result"])

    def test_the_screen_sends_what_a_section_cannot_show_to_3d_and_an_override_needs_a_reason(self):
        self.source(lambda s: s["interactions"]["tray stop"].update(piecesAtOnce=2))
        verdict = self.judge(only=["interaction"])
        [row] = verdict["interactions"]
        self.assertEqual((verdict["result"], row["verdict"]), ("fail", "needs 3D"))
        self.assertIn("2 pieces at once; guideline: one piece", row["reasons"])
        self.assertTrue(any("try it in 3D" in text for text in row["unmet"]), row["unmet"])
        self.judgement(lambda j: j["interactions"]["tray stop"].update(override=dict(verdict="planar is enough", reason="Invented: the second ball waits behind a gate")))
        over = self.judge(only=["interaction"])
        [row] = over["interactions"]
        self.assertEqual((over["result"], row["screened"], row["verdict"], row["override"]),
                         ("pass", "needs 3D", "planar is enough", "Invented: the second ball waits behind a gate"))
        self.judgement(lambda j: j["interactions"]["tray stop"]["override"].pop("reason"))
        self.assertIn("An override of interaction tray stop gives a verdict", self.refused(only=["interaction"]))
        self.assertEqual(self.judge(motions=["acquire"])["result"], "pass", "a motion needs no interaction")

    def test_a_best_guess_needs_an_adjustment_measured_at_both_ends(self):
        # A compliant surface makes a simulated result only a best guess.
        def soft(source):
            source["fixtures"][-2]["material"] = {"class": "compliant", "stiffnessNPerM": 20000}
        self.source(soft)
        verdict = self.judge(only=["interaction"])
        [row] = verdict["interactions"]
        self.assertEqual((row["verdict"], row["reasons"], row["unmet"]), ("configurable", ["tray is compliant; guideline: rigid surfaces"], []))
        self.source(lambda s: s["trials"][TRIAL].update(adjustments=[]))
        [row] = self.judge(only=["interaction"])["interactions"]
        self.assertTrue(any("Declare the adjustment" in text for text in row["unmet"]), row["unmet"])

    def test_an_adjustment_end_that_closes_on_the_robot_fails(self):
        self.source(lambda s: s["adjustments"]["wall position"].update(range=[45, 306]))
        verdict = self.judge()
        self.assertEqual((verdict["result"], verdict["firstUnmet"]["kind"]), ("fail", "adjustment"))
        [found] = verdict["adjustments"]
        self.assertEqual(found["status"], "fail")
        self.assertTrue(any(f.startswith("at 45: ") and "wall" in f for f in found["findings"]), found["findings"])
        self.assertNotIn(("trial", TRIAL), {(r["check"], r["subject"]) for r in verdict["rows"]})
        # A pair the search cannot settle at an end is open, never clear.
        self.source(lambda s: s["adjustments"]["wall position"].update(range=[61, 306]))
        self.judgement(lambda j: j["rules"].update(depth=1))
        open_ = self.judge(adjustments=["wall position"])["adjustments"][0]
        self.assertEqual(open_["status"], "open", open_)

    def test_an_interaction_nobody_has_explained_fails_only_a_full_judgement(self):
        self.judgement(lambda j: j.pop("interactions"))
        verdict = self.judge()
        self.assertEqual(verdict["result"], "pass")
        self.assertIn("Say in the judgement file what interaction tray stop decides, and name its trial or why it needs none", verdict["completeness"])
        [row] = verdict["interactions"]
        self.assertEqual(row["verdict"], "planar is enough", "it is still screened")
        with counted() as counts:
            said = self.refused(full=True)
        self.assertEqual(counts.built, 0)
        self.assertIn("what interaction tray stop decides", said)

    def test_a_payload_moves_on_the_path_its_trial_fits_judged_after_the_trial_has_run(self):
        self.bind(TRIAL)
        verdict = self.judge(trials=[TRIAL])
        row = self.row(verdict, "path", "acquire")
        self.assertEqual((row["level"], row["result"]), (6, "fail"))
        self.assertIn("The move of carried article in acquire is not the path trial " + TRIAL + " fitted. Write its fit operation as the move in the design source", row["text"])
        fit = self.trials()[TRIAL]["fit"]
        self.moved_on(fit["operation"])
        self.assertEqual(self.row(self.judge(trials=[TRIAL]), "path", "acquire")["result"], "pass")
        # A window of the trial binds the stroke between two kept points of the fit; any other time fails.
        self.bind(TRIAL, [fit["atS"][0], fit["atS"][-1]])
        self.assertEqual(self.row(self.judge(trials=[TRIAL]), "path", "acquire")["result"], "pass")
        self.bind(TRIAL, [fit["atS"][0], fit["atS"][-1] / 3])
        self.assertIn("The window of carried article in acquire runs between two kept points of the trial's fit", self.row(self.judge(trials=[TRIAL]), "path", "acquire")["text"])
        # Without the trial the path is not judged, and the motion's clearance still is.
        left = self.judge(motions=["acquire"])
        self.assertEqual(left["result"], "pass")
        self.assertIn(("path", "acquire"), {(r["check"], r["subject"]) for r in left["notJudged"]})

    def rolling(self):
        """A second invented trial whose fit turns and keeps several points: the ball pushed off the tray's open end rolls
        along it and falls. Returns the trial's fit."""
        def change(source):
            trial = json.loads(json.dumps(source["trials"][TRIAL]))
            trial.update(fitToleranceMm=1, adjustments=[], loads=[{"name": "push", "along": [-1, 0], "accelerationMps2": -6, "startS": 0.0, "durationS": 0.3}],
                         events=[{"name": "rolled off", "when": {"signal": "zMm", "below": 0}, "outcome": "rolled off"},
                                 {"name": "stayed", "when": {"all": [{"signal": "tS", "above": 0.8}, {"restFor": 0.3}]}, "outcome": "stayed"}],
                         control={"change": {"loads.push.accelerationMps2": 3}, "note": "Pushed toward the wall, the ball stays on the tray."},
                         brackets=[{"input": "loads.push.accelerationMps2", "unit": "m/s2", "values": [-8, -6, -4]}])
            trial["pass"] = {"outcomes": ["rolled off"]}
            source["trials"][ROLLED] = trial
        self.source(change)
        self.judge(trials=[ROLLED])
        return self.trials()[ROLLED]["fit"]

    def path(self):
        return self.row(self.judge(trials=[ROLLED]), "path", "acquire")

    def test_a_window_of_a_turning_fit_is_its_kept_points_with_their_turn(self):
        fit = self.rolling()
        op, times = fit["operation"], fit["atS"]
        self.assertGreaterEqual(len(times), 4, "the fit keeps points inside the trace")
        self.assertTrue(op["turnDeg"][-1] > 90 and op["turnAxis"] == [0, -1, 0], "the rolling ball's fit turns")
        # The stroke between the second and the next-to-last kept point: their places and their turns, about the fit's axis.
        part = dict(op, throughMm=op["throughMm"][1:-1], turnDeg=op["turnDeg"][1:-1])
        self.moved_on(part)
        self.bind(ROLLED, [times[1], times[-2]])
        self.assertEqual(self.path()["result"], "pass")
        # Controls: the same places with the turn the other way, or with no turn, are not the trial's path.
        for other in (dict(part, turnAxis=[0, 1, 0]), {k: v for k, v in part.items() if k not in ("turnDeg", "turnAxis")}):
            self.moved_on(other)
            self.assertIn("is not the path trial " + ROLLED + " fitted over its window", self.path()["text"])

    def test_a_fit_that_strays_past_its_own_tolerance_is_not_the_trial(self):
        fit = self.rolling()
        self.moved_on(fit["operation"])
        self.bind(ROLLED)
        self.assertEqual(self.path()["result"], "pass")
        # The library measures each sample against its own piece of the kept path. A fit it states as straying past its
        # tolerance, in place or in turn, does not stand for the trace; the library's answer is changed that way here.
        from frc_design_kernel.trials import fit as fits
        real = fits.path_operation
        try:
            for field, limit, words in (("maxDeviationMm", "toleranceMm", "1.5 mm from its trace, past its tolerance of 1 mm"),
                                        ("maxTurnDeviationDeg", "turnToleranceDeg", "7.5 degrees from its trace, past its tolerance of 5 degrees")):
                def strays(*args, **kwargs):
                    found = real(*args, **kwargs)
                    return dict(found, **{field: found[limit] * 1.5})
                fits.path_operation = strays
                self.assertIn("The fit of trial " + ROLLED + " strays " + words + ", so the path of carried article in acquire is not the trial. "
                              "Run the trial with a smaller fitToleranceMm", self.path()["text"])
        finally:
            fits.path_operation = real

    def test_a_free_path_or_a_fixture_moves_a_payload_only_on_its_trial(self):
        self.judge(trials=[TRIAL])
        self.moved_on(self.trials()[TRIAL]["fit"]["operation"])
        self.bind(TRIAL, field="freePath")
        self.assertEqual(self.row(self.judge(trials=[TRIAL]), "path", "acquire")["result"], "pass")
        # The fitted path ends where the trial left the article, so the cycle after it is broken here: that is its own check.
        self.assertIn("Discontinuous cycle: carried article between acquire and loaded-turn", [r["text"] for r in self.judge(only=["cycle"])["unmet"]])
        # A field fixture supports the same path; a robot solid cannot.
        self.bind(TRIAL, field="supportedBy", fixtures=["tray"])
        self.assertEqual(self.row(self.judge(trials=[TRIAL]), "path", "acquire")["result"], "pass")
        self.bind(TRIAL, field="supportedBy", fixtures=["rail"])
        self.assertIn("Only a field fixture present in acquire can support a payload: carried article", self.refused())
        # A binding names its trial: a path with no trial stops the check.
        self.judgement(lambda j: j["motions"]["acquire"].update(supportedBy={"carried article": dict(basis="Invented", fixtures=["tray"])}))
        self.assertIn("the design library trial that moves it, as trial: NAME: carried article", self.refused())


if __name__ == "__main__":
    unittest.main()
