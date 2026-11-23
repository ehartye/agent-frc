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
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"
TRIAL = "ball stays at the wall"


def tray(source):
    """The invented field parts, piece, material, adjustment, interaction and trial, added to the starter's source."""
    source["parameters"]["wall_x"] = 300
    source["groups"]["field"] = {"role": "fixture"}
    source["fixtures"] += [dict(name="tray", group="field", shape=dict(kind="box", fromMm=[100, -50, 0], toMm=[298, 50, 10])),
                           dict(name="wall", group="field", shape=dict(kind="box", fromMm=["=wall_x", -50, 0], toMm=["=wall_x + 10", 50, 60]))]
    source["pieces"] = {"ball": {"shape": {"kind": "sphere", "centerMm": [0, 0, 0], "radiusMm": 40}, "massKg": {"value": 0.2, "assumed": [0.15, 0.25]}}}
    source["materials"] = {"felt": {"stiffnessNPerM": {"value": 50000, "assumed": [25000, 100000]}, "restitution": {"value": 0.2, "assumed": [0.1, 0.4]},
                                    "friction": {"value": 0.5, "assumed": [0.3, 0.8]}}}
    source["adjustments"] = {"wall position": {"input": "parameters.wall_x", "kind": "mechanical", "range": [300, 306], "note": "Invented slotted wall"}}
    source["interactions"] = {"tray stop": {"piece": "ball", "plane": {"normal": "y", "atMm": 0}, "solids": ["tray", "wall"],
                                            "pieceAtMm": [["=wall_x - 40", 0, 50]], "approach": {"angleDeg": [-5, 5], "offsetMm": [-5, 5]},
                                            "targetOffPlane": False}}
    source["trials"] = {TRIAL: {
        "assumes": [{"id": "flat-tray", "text": "Invented: the tray is flat and level."}],
        "plane": {"normal": "y", "atMm": 0}, "stepS": 0.0002, "durationS": 1.5, "traceS": 0.01, "fitToleranceMm": 2,
        "piece": {"use": "ball", "start": {"atMm": ["=wall_x - 40", 50]}},
        "surfaces": [{"solid": "tray", "material": "felt"}, {"solid": "wall", "material": "felt"}],
        "loads": [{"name": "push", "along": [-1, 0], "accelerationMps2": 3, "startS": 0.2, "durationS": 0.3}],
        "events": [{"name": "rolled off", "when": {"signal": "zMm", "below": 20}, "outcome": "rolled off"},
                   {"name": "stayed", "when": {"all": [{"signal": "tS", "above": 0.8}, {"restFor": 0.3}]}, "outcome": "stayed"}],
        "pass": {"outcomes": ["stayed"]},
        "control": {"change": {"loads.push.accelerationMps2": -6}, "note": "Pushed away from the wall, the ball rolls off the tray."},
        "brackets": [{"input": "loads.push.accelerationMps2", "unit": "m/s2", "values": [1, 3, 6]}],
        "adjustments": ["wall position"]}}
    return source


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
