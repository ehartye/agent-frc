# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/interactions.py
# @subject scripts/kernel_layout/stages.py
# @subject scripts/effective-readiness.mjs
# @subject examples/design-source/create.py
"""Interactions on the design library: the screen verdict, the trial record and the adjustment extremes the check records.

Failure caught: a design reaches the effective bar on a trial that is stale, on a verdict that hides what one
section cannot show, or on an adjustment whose ends were never measured. The invented starter gains a tray and a
wall on the field, a ball, one interaction, one planar trial and one mechanical adjustment. Each control changes one
input and must change what is recorded."""
import gzip
import hashlib
import json
import math
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
TRIAL, tray = _TRAY["TRIAL"], _TRAY["tray"]
ROLLED = "ball rolls off the tray"


class KernelInteractionsCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        runpy.run_path(str(PLUGIN / "examples/design-source/create.py"))["create"](cls.root / RELEASE, "1.0", cls.root)
        cls.source = tray(json.loads((cls.root / RELEASE / "design.json").read_text(encoding="utf-8")))
        judgement = json.loads((cls.root / RELEASE / "judgement.json").read_text(encoding="utf-8"))
        judgement["trials"], judgement["measurements"] = {"file": RELEASE + "/records/trials.json"}, {"file": RELEASE + "/records/measurements.json"}
        judgement["interactions"] = {"tray stop": dict(decides="Invented: whether the wall needs a lip", trial=TRIAL, cases=["release"])}
        for name in ("tray", "wall"):
            judgement["presentation"]["components"][name] = dict(purpose="Invented field part.", rationale="Invented: the ball rests here.")
        cls.judgement = judgement
        cls.put("judgement.json", judgement)
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
        cls.library("build", RELEASE + "/design.json", "--out", RELEASE + "/generated")
        if trial:
            cls.library("try", RELEASE + "/design.json", "--out", RELEASE + "/records")
        if extremes:
            cls.library("measure", RELEASE + "/design.json", "--out", RELEASE + "/records", "--extremes", "--min-gap", "1")

    def tearDown(self):
        self.put("judgement.json", self.judgement)
        self.refresh(self.source)

    def check(self, *flags):
        run = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json",
                              "--physics-only", *flags], capture_output=True, text=True)
        receipt = json.loads(run.stdout) if run.stdout.strip() else None
        return run, receipt, (receipt or {}).get("interactions", [None])[0]

    def copy(self, data):
        return json.loads(json.dumps(data))

    def test_the_verdict_the_trial_and_the_adjustment_are_recorded_and_meet_the_bar(self):
        run, _, _ = self.check("--output", RELEASE + "/receipt.json")
        self.assertEqual(run.returncode, 0, run.stderr)
        receipt = json.loads((self.root / RELEASE / "receipt.json").read_text(encoding="utf-8"))
        row = receipt["interactions"][0]
        self.assertEqual(receipt["status"], "layout-checked", receipt["missingInputs"])
        self.assertEqual((row["verdict"], row["decides"], row["cases"]), ("planar is enough", "Invented: whether the wall needs a lip", ["release"]))
        trial = row["trial"]
        self.assertEqual((trial["name"], trial["engine"], trial["result"], trial["state"]), (TRIAL, "planar", "passed", "current"))
        self.assertEqual(trial["sensitivity"][0], "loads.push.accelerationMps2")
        self.assertIn(dict(path="pieces.ball.massKg", value=0.2, source="assumed", range=[0.15, 0.25]), trial["inputs"])
        self.assertIn("flat-tray", [a["id"] for a in trial["assumptions"]])
        self.assertEqual(trial["adjustments"], ["wall position"])
        self.assertEqual([(a["name"], a["measured"], a["findings"]) for a in receipt["adjustments"]], [("wall position", True, [])])
        self.assertEqual(receipt["trials"]["file"], RELEASE + "/records/trials.json")
        self.assertIn("[screen] tray stop: planar is enough", run.stderr)
        self.assertIn("[trial] " + TRIAL + " (planar): passed", run.stderr)
        # The readiness report reads the same receipt: the interaction meets its bar and backs the mission case.
        report = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "effective-readiness", str(self.root), "--release", RELEASE, "--json"],
                                capture_output=True, text=True)
        bar = next(c for c in json.loads(report.stdout)["criteria"] if c["id"] == "interactions")
        self.assertEqual(bar["reasons"], [])
        self.assertIn("tray stop: planar is enough; trial " + TRIAL + " (planar): passed; leans most on loads.push.accelerationMps2", bar["notes"])

    def test_a_changed_solid_makes_the_trial_stale(self):
        source = self.copy(self.source)
        source["fixtures"][-1]["shape"]["toMm"][2] = 70
        self.refresh(source, trial=False, extremes=False)
        _, receipt, row = self.check()
        self.assertEqual(row["trial"]["state"], "stale")
        self.assertTrue(any('"wall"' in change for change in row["trial"]["changes"]), row["trial"]["changes"])
        self.assertEqual(receipt["status"], "layout-checked", "a stale trial never blocks the layout")

    def test_the_screen_sends_what_a_section_cannot_show_to_3d_and_an_override_needs_a_reason(self):
        source = self.copy(self.source)
        source["interactions"]["tray stop"]["piecesAtOnce"] = 2
        self.refresh(source, trial=False, extremes=False)
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
        self.refresh(source, trial=False, extremes=False)
        self.put("judgement.json", self.judgement)
        _, _, soft = self.check()
        self.assertEqual((soft["verdict"], soft["reasons"]), ("configurable", ["tray is compliant; guideline: rigid surfaces"]))

    def test_an_adjustment_end_that_closes_on_the_robot_is_a_finding(self):
        source = self.copy(self.source)
        source["adjustments"]["wall position"]["range"] = [45, 306]
        self.refresh(source)
        _, receipt, _ = self.check()
        findings = receipt["adjustments"][0]["findings"]
        self.assertTrue(any(f.startswith("at 45: ") and "wall" in f for f in findings), findings)
        # Not measured at its ends: the row says how to measure it.
        self.refresh(source, trial=False, extremes=False)
        (self.root / RELEASE / "records/measurements.json").unlink()
        judgement = self.copy(self.judgement)
        del judgement["measurements"]
        self.put("judgement.json", judgement)
        _, unmeasured, _ = self.check()
        self.assertFalse(unmeasured["adjustments"][0]["measured"])
        self.assertIn("--extremes --min-gap 1", unmeasured["adjustments"][0]["hint"])

    def test_an_unexplained_interaction_is_a_missing_input_and_a_path_must_be_the_trial_fit(self):
        judgement = self.copy(self.judgement)
        del judgement["interactions"]
        self.put("judgement.json", judgement)
        _, receipt, row = self.check()
        self.assertIn("Say in the judgement file what interaction tray stop decides, and name its trial or why it needs none", receipt["missingInputs"])
        self.assertEqual(receipt["status"], "provisional")
        self.assertEqual(row["verdict"], "planar is enough", "the verdict is still recorded")
        # A payload bound to a trial must move on the path the trial fitted.
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["transportedBy"] = {"carried article": dict(mechanisms=["carrier"], drive={"carrier": "Invented rollers"},
                                                                                   basis="Invented", trial=TRIAL)}
        self.put("judgement.json", judgement)
        _, unfit, _ = self.check()
        self.assertIn("The move of carried article in acquire is not the path trial " + TRIAL + " fitted. Write its fit operation as the move in the design source",
                      unfit["missingInputs"])
        fit = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][TRIAL]["fit"]
        source = self.copy(self.source)
        source["motions"]["acquire"]["moves"]["carried article"] = [fit["operation"]]
        self.refresh(source, trial=False, extremes=False)
        _, fitted, _ = self.check()
        self.assertFalse(any("fitted" in gap for gap in fitted["missingInputs"]), fitted["missingInputs"])
        # A window of the trial binds the stroke between two kept points of the fit; any other time is refused.
        spec = judgement["stages"]["acquire"]["transportedBy"]["carried article"]
        spec["window"] = [fit["atS"][0], fit["atS"][-1]]
        self.put("judgement.json", judgement)
        _, windowed, _ = self.check()
        self.assertFalse(any("fitted" in gap for gap in windowed["missingInputs"]), windowed["missingInputs"])
        spec["window"] = [fit["atS"][0], fit["atS"][-1] / 3]
        self.put("judgement.json", judgement)
        refused, _, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("The window of carried article in acquire runs between two kept points of the trial's fit", refused.stderr)

    def rolling(self):
        """The source with a second invented trial whose fit turns and keeps several points: the ball pushed off the tray's
        open end rolls along it and falls. Returns (source, the trial's fit)."""
        source = self.copy(self.source)
        trial = self.copy(source["trials"][TRIAL])
        trial.update(fitToleranceMm=1, adjustments=[], pass_={"outcomes": ["rolled off"]},
                     loads=[{"name": "push", "along": [-1, 0], "accelerationMps2": -6, "startS": 0.0, "durationS": 0.3}],
                     events=[{"name": "rolled off", "when": {"signal": "zMm", "below": 0}, "outcome": "rolled off"},
                             {"name": "stayed", "when": {"all": [{"signal": "tS", "above": 0.8}, {"restFor": 0.3}]}, "outcome": "stayed"}],
                     control={"change": {"loads.push.accelerationMps2": 3}, "note": "Pushed toward the wall, the ball stays on the tray."},
                     brackets=[{"input": "loads.push.accelerationMps2", "unit": "m/s2", "values": [-8, -6, -4]}])
        trial["pass"] = trial.pop("pass_")
        source["trials"][ROLLED] = trial
        self.refresh(source, extremes=False)
        return source, json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][ROLLED]["fit"]

    def bind(self, window=None):
        """Bind the carried article's move in acquire to the rolling trial, over a window of its fit when one is given."""
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["transportedBy"] = {"carried article": dict(
            mechanisms=["carrier"], drive={"carrier": "Invented rollers"}, basis="Invented", trial=ROLLED, **({"window": window} if window else {}))}
        self.put("judgement.json", judgement)

    def test_a_window_of_a_turning_fit_is_its_kept_points_with_their_turn(self):
        source, fit = self.rolling()
        op, times = fit["operation"], fit["atS"]
        self.assertGreaterEqual(len(times), 4, "the fit keeps points inside the trace")
        self.assertTrue(op["turnDeg"][-1] > 90 and op["turnAxis"] == [0, -1, 0], "the rolling ball's fit turns")
        # The stroke between the second and the next-to-last kept point: their places and their turns, about the fit's axis.
        window = [times[1], times[-2]]
        part = dict(op, throughMm=op["throughMm"][1:-1], turnDeg=op["turnDeg"][1:-1])
        source["motions"]["acquire"]["moves"]["carried article"] = [part]
        self.refresh(source, trial=False, extremes=False)
        self.bind(window)
        _, bound, _ = self.check()
        self.assertFalse(any("fitted" in gap for gap in bound["missingInputs"]), bound["missingInputs"])
        unbound = "The move of carried article in acquire is not the path trial " + ROLLED + " fitted over its window. Write its fit operation as the move in the design source"
        # Controls: the same places with the turn the other way, or with no turn, are not the trial's path.
        for other in (dict(part, turnAxis=[0, 1, 0]), {k: v for k, v in part.items() if k not in ("turnDeg", "turnAxis")}):
            source["motions"]["acquire"]["moves"]["carried article"] = [other]
            self.refresh(source, trial=False, extremes=False)
            _, refused, _ = self.check()
            self.assertIn(unbound, refused["missingInputs"])

    def test_a_fit_that_strays_past_its_own_tolerance_is_not_the_trial(self):
        source, fit = self.rolling()
        source["motions"]["acquire"]["moves"]["carried article"] = [fit["operation"]]
        self.refresh(source, trial=False, extremes=False)
        self.bind()
        _, bound, _ = self.check()
        self.assertFalse(any(ROLLED in gap for gap in bound["missingInputs"]), bound["missingInputs"])
        # The library measures each sample against its own piece of the kept path. A fit it records as straying past its
        # tolerance, in place or in turn, does not stand for the trace; the record is written that way here.
        records = self.root / RELEASE / "records/trials.json"
        held = records.read_text(encoding="utf-8")
        for field, limit, words in (("maxDeviationMm", "toleranceMm", "1.5 mm from its trace, past its tolerance of 1 mm"),
                                    ("maxTurnDeviationDeg", "turnToleranceDeg", "7.5 degrees from its trace, past its tolerance of 5 degrees")):
            record = json.loads(held)
            record["trials"][ROLLED]["fit"][field] = record["trials"][ROLLED]["fit"][limit] * 1.5
            records.write_text(json.dumps(record), encoding="utf-8")
            _, strays, _ = self.check()
            self.assertIn("The fit of trial " + ROLLED + " strays " + words + ", so the path of carried article in acquire is not the trial. "
                          "Run the trial with a smaller fitToleranceMm", strays["missingInputs"])
        records.write_text(held, encoding="utf-8")

    def test_the_review_plays_each_trial_from_its_record(self):
        source, _ = self.rolling()
        run = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json", "--write-view",
                              "--output", RELEASE + "/receipt.json"], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        scene = json.loads(gzip.decompress((self.root / RELEASE / "review-scene.json.gz").read_bytes()))
        record = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))
        replays = {row["id"]: row for row in scene["replays"]}
        self.assertEqual(sorted(replays), ["trial-ball-rolls-off-the-tray", "trial-ball-stays-at-the-wall"], "one replay per trial in the record")
        for name, trial in record["trials"].items():
            replay, rows = replays["trial-" + name.replace(" ", "-")], trial["nominal"]["trace"]["rows"]
            self.assertEqual(replay["evidence"], [dict(file=RELEASE + "/records/trials.json", sha256=hashlib.sha256(
                (self.root / RELEASE / "records/trials.json").read_bytes()).hexdigest(), role="trial record")])
            self.assertEqual(replay["time"], [row[0] for row in rows])
            self.assertEqual(replay["follow"], "piece")
            # The ball, drawn about its centre, is placed at each traced centre on the plane y = 0 and turned by the spin summed so far.
            frames = replay["groups"]["piece"]
            self.assertEqual([[round(m[3], 3), round(m[7], 3), round(m[11], 3)] for m in frames], [[round(r[1], 3), 0, round(r[2], 3)] for r in rows])
            # About the plane's normal signed as the engines count spin, [0, -1, 0]: a turn of a leaves -sin a in the first row.
            spin, turns = [0.0], [math.degrees(math.atan2(-m[2], m[0])) for m in frames]
            for a, b in zip(rows, rows[1:]):
                spin.append(spin[-1] + math.degrees((a[3] + b[3]) / 2 * (b[0] - a[0])))
            # The scene keeps six decimals of each matrix entry: the angles agree to well within a thousandth of a degree.
            self.assertLess(max(abs((t - a + 180) % 360 - 180) for t, a in zip(turns, spin)), 1e-3)
            self.assertEqual([e["label"] for e in replay["events"]], [e["event"] for e in trial["nominal"]["events"]])
            self.assertEqual(replay["time"][replay["events"][-1]["frame"]], trial["nominal"]["events"][-1]["t"])
            piece = scene["bodies"][next(member for member, body in replay["bodies"].items() if body["group"] == "piece")]
            self.assertEqual((piece["role"], piece["fixture"]), ("payload", False))
            # The robot and the field stand where the trial's pose puts them; the source's own payload is not drawn beside the piece.
            self.assertEqual((replay["bodies"]["tray"]["group"], replay["bodies"]["head"]["group"]), (None, None))
            self.assertNotIn("sample", replay["bodies"])
        # Control: a trial run again with a weaker push ends elsewhere, and its replay follows the new record.
        source["trials"][ROLLED]["loads"][0]["accelerationMps2"] = -4
        self.refresh(source, extremes=False)
        subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json", "--write-view",
                        "--output", RELEASE + "/receipt.json"], capture_output=True, text=True, check=True)
        again = json.loads(gzip.decompress((self.root / RELEASE / "review-scene.json.gz").read_bytes()))
        weaker = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][ROLLED]["nominal"]["trace"]["rows"]
        moved = next(row for row in again["replays"] if row["id"] == "trial-ball-rolls-off-the-tray")
        self.assertNotEqual(moved["time"], replays["trial-ball-rolls-off-the-tray"]["time"])
        self.assertEqual(moved["time"], [row[0] for row in weaker])

    def test_a_free_path_or_a_fixture_moves_a_payload_only_on_its_trial_and_a_free_path_alone_is_not_loaded(self):
        fit = json.loads((self.root / RELEASE / "records/trials.json").read_text(encoding="utf-8"))["trials"][TRIAL]["fit"]["operation"]
        source = self.copy(self.source)
        source["motions"]["acquire"]["moves"]["carried article"] = [fit]
        self.refresh(source, trial=False, extremes=False)
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["freePath"] = {"carried article": dict(basis="Invented: the article rolls free", trial=TRIAL)}
        self.put("judgement.json", judgement)
        # The fitted path ends where the trial left the article, so the cycle after it is broken here; the path itself is bound.
        cycle = ["Discontinuous cycle: carried article between acquire and loaded-turn"]
        _, receipt, _ = self.check()
        self.assertEqual(receipt["missingInputs"], cycle)
        # A free path is not a loaded operating case: without the carried turn, no operating path moves the payload with a mechanism.
        del judgement["stages"]["loaded-turn"]["carriedWith"]
        self.put("judgement.json", judgement)
        _, unloaded, _ = self.check()
        self.assertIn("No operating path includes the moving mechanism and finite payload", unloaded["missingInputs"])
        # A field fixture supports the same path; a robot solid cannot.
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["supportedBy"] = {"carried article": dict(fixtures=["tray"], basis="Invented: the tray carries it", trial=TRIAL)}
        self.put("judgement.json", judgement)
        _, supported, _ = self.check()
        self.assertEqual(supported["missingInputs"], cycle)
        judgement["stages"]["acquire"]["supportedBy"]["carried article"]["fixtures"] = ["rail"]
        self.put("judgement.json", judgement)
        refused, _, _ = self.check()
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Only a field fixture present in acquire can support a payload: carried article", refused.stderr)
        # A stage names its trial: a path with no trial stops the check.
        spec = judgement["stages"]["acquire"]["supportedBy"]["carried article"]
        del spec["trial"]
        spec["fixtures"] = ["tray"]
        self.put("judgement.json", judgement)
        unnamed, _, _ = self.check()
        self.assertEqual(unnamed.returncode, 2)
        self.assertIn("the design library trial that moves it, as trial: NAME: carried article", unnamed.stderr)


if __name__ == "__main__":
    unittest.main()
