# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/review.py
# @subject scripts/kernel_layout/inputs.py
# @subject scripts/kernel_layout/judge.py
# @subject scripts/kernel_layout/attachment.py
# @subject scripts/kernel_layout/stages.py
# @subject examples/design-source/create.py
"""The layout check on the design library: it passes a clear invented layout and can fail in each way that matters.

Failure caught: the check passes a layout that interferes, floats or breaks a budget, or reads stale generated solids.
Each control below changes one input of the passing example and must be rejected or reported."""
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"


class KernelLayoutCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name).resolve()
        starter = runpy.run_path(str(PLUGIN / "examples/design-source/create.py"))
        starter["create"](cls.root / RELEASE, "1.0", cls.root)
        cls.source = json.loads((cls.root / RELEASE / "design.json").read_text(encoding="utf-8"))
        cls.judgement = json.loads((cls.root / RELEASE / "judgement.json").read_text(encoding="utf-8"))
        cls.budgets = json.loads((cls.root / RELEASE / "budgets.json").read_text(encoding="utf-8"))
        cls.build()

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    @classmethod
    def build(cls):
        subprocess.run([sys.executable, "-m", "frc_design_kernel", "build", RELEASE + "/design.json", "--out", RELEASE + "/generated"],
                       cwd=cls.root, check=True, capture_output=True)

    def put(self, name, data):
        (self.root / RELEASE / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")

    def tearDown(self):
        # Each test leaves the passing example behind it.
        self.put("design.json", self.source)
        self.put("judgement.json", self.judgement)
        self.put("budgets.json", self.budgets)
        self.build()

    def check(self, *flags):
        run = subprocess.run(["node", str(PLUGIN / "scripts/design.mjs"), "preliminary-check", str(self.root), RELEASE + "/judgement.json", *flags],
                             capture_output=True, text=True)
        return run, json.loads(run.stdout) if run.stdout.strip() else None

    def copy(self, data):
        return json.loads(json.dumps(data))

    def test_clear_layout_is_checked_and_says_what_ran(self):
        run, receipt = self.check("--write-view", "--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(receipt["status"], "layout-checked")
        self.assertEqual([c["status"] for c in receipt["cases"]], ["pass"] * 5)
        self.assertEqual(receipt["control"]["witness"]["status"], "fail", "the displaced control is rejected")
        self.assertEqual(receipt["library"]["library"], "frc-design-kernel")
        self.assertTrue(receipt["view"]["verified"])
        self.assertEqual(receipt["step"]["file"], RELEASE + "/generated/design.step")
        self.assertEqual(receipt["attachment"]["floating"], [])
        self.assertEqual([r["solid"] for r in receipt["attachment"]["unmountedAllowances"]], ["rail"])
        self.assertEqual(receipt["attachment"]["onUnmountedAllowance"], ["gate"])
        self.assertRegex(run.stderr, r"\[time\] layout check of 5 case\(s\), the displaced control, attachment and budgets and the review view in \d+ s\. "
                                     r"Guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate\.")
        # A view-only rebuild measures nothing again and says so; a changed allowance refuses it.
        (self.root / RELEASE / "receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
        again, rebuilt = self.check("--view-only")
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(rebuilt["cases"], receipt["cases"])
        self.assertIn("[time] not run: the cases and the displaced control", again.stderr)
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["minGapMm"] = 2
        self.put("judgement.json", judgement)
        refused, _ = self.check("--view-only")
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Changed since that receipt: the stages", refused.stderr)

    def test_interference_blocks_the_layout(self):
        source = self.copy(self.source)
        # Control: the rail drawn inside the arc the loaded head sweeps.
        next(s for s in source["solids"] if s["name"] == "rail")["shape"].update(fromMm=[19, 20, 18], toMm=[24, 25, 23])
        self.put("design.json", source)
        self.build()
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertEqual(receipt["status"], "blocked")
        failing = {c["case"] for c in receipt["cases"] if c["status"] == "fail"}
        self.assertIn("loaded-turn", failing)
        self.assertEqual(receipt["decision"]["firstUnmet"]["kind"], "clearance")

    def test_floating_solid_is_reported_and_a_control_that_passes_is_named(self):
        judgement = self.copy(self.judgement)
        del judgement["attachment"]
        # Control of the control: an offset that leaves the rail clear cannot show that the check fails.
        judgement["control"]["offsetMm"] = [0, 5, 0]
        self.put("judgement.json", judgement)
        run, receipt = self.check("--physics-only")
        # The gate is mounted on the rail, so it floats with it.
        self.assertEqual([r["solid"] for r in receipt["attachment"]["floating"]], ["gate", "rail"])
        self.assertIn("[attachment] floating: rail (structure)", run.stderr)
        self.assertIsNone(receipt["control"]["witness"])
        self.assertIn("Matched displacement did not reject the commissioned pair", receipt["missingInputs"])
        self.assertEqual(receipt["status"], "provisional")

    def test_mass_over_the_limit_blocks_the_layout(self):
        budgets = self.copy(self.budgets)
        budgets["masses"][0]["kg"] = [4, 12]
        self.put("budgets.json", budgets)
        _, receipt = self.check("--physics-only")
        self.assertEqual(receipt["budgets"]["massStatus"], "fail")
        self.assertEqual(receipt["status"], "blocked")

    def test_stale_solids_and_geometry_in_the_judgement_are_refused(self):
        source = self.copy(self.source)
        source["parameters"]["slide"] = 11
        self.put("design.json", source)
        stale, _ = self.check("--physics-only")
        self.assertEqual(stale.returncode, 2)
        self.assertIn("The generated solids are of an earlier design source", stale.stderr)
        self.put("design.json", self.source)
        judgement = self.copy(self.judgement)
        judgement["groups"] = {"structure": {"role": "structure", "members": ["mount"]}}
        self.put("judgement.json", judgement)
        mixed, _ = self.check("--physics-only")
        self.assertEqual(mixed.returncode, 2)
        self.assertIn("The judgement file holds no geometry or motion. Move groups to the design source", mixed.stderr)

    def test_a_partial_run_is_marked_and_never_checked(self):
        run, receipt = self.check("--cases", "acquire,release", "--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertTrue(receipt["partial"])
        self.assertEqual(receipt["skippedCases"], ["loaded-turn", "park-loaded", "remove-carrier"])
        self.assertNotEqual(receipt["status"], "layout-checked")

    def explain(self, judgement, *names):
        for name in names:
            judgement["presentation"]["components"][name] = dict(purpose="Invented purpose.", rationale="Invented reason.")

    def test_a_motion_through_poses_a_carried_group_and_a_hanging_fixture_are_judged(self):
        source, judgement = self.copy(self.source), self.copy(self.judgement)
        spin = lambda deg: [dict(kind="rotation", originMm=[0, 0, 20], axis=[0, 0, 1], travelDeg=deg)]
        slide = lambda v: [dict(kind="translation", travelMm=v)]
        # The article rides on the carrier: the source says so once, and no motion repeats the carrier's moves for it.
        source["groups"]["carried article"]["carriedBy"] = "carrier"
        source["poses"] = {"parked": {}, "offered": {"carried article": slide([0, -10, 0])},
                           "turned": {"carrier": spin(90), "neighbor": slide([0, 12, 0])},
                           "released": {"carrier": spin(90), "neighbor": slide([0, 12, 0]), "carried article": slide([12, 0, 0])}}
        source["motions"] = {"acquire": {"from": "offered", "moves": {"carried article": slide([0, 10, 0])}},
                             "loaded-turn": {"through": ["parked", "turned"]},
                             "release": {"from": "turned", "moves": {"carried article": slide([12, 0, 0])}},
                             "park-loaded": {"from": "released", "moves": {"carrier": spin(-90), "neighbor": slide([0, -12, 0])}},
                             "remove-carrier": {"moves": {"carrier": slide([0, 0, 80])}}}
        source["groups"]["field"] = {"role": "fixture"}
        source["fixtures"] = [dict(name="lane", group="field", shape=dict(kind="box", fromMm=[80, -20, 30], toMm=[120, 20, 34]))]
        self.explain(judgement, "lane")
        # A recorded trial stands behind the acquire path, and repeats exactly what the source gives the article.
        path = dict(case="acquire", payload="carried article", mechanisms=["carrier"], moves={"sample": slide([0, 10, 0])},
                    initialPose={"sample": slide([0, -10, 0])})
        self.put("acquire-trial.json", dict(transport=path))
        judgement["stages"]["acquire"]["transportedBy"] = {"carried article": dict(
            mechanisms=["carrier"], drive={"carrier": "Invented powered surface"}, basis="The article rolls in on the carrier",
            evidence={"file": RELEASE + "/acquire-trial.json"})}
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        self.build()
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr + json.dumps((receipt or {}).get("missingInputs")))
        self.assertEqual(receipt["stages"]["loaded-turn"]["movingGroups"], ["carried article", "carrier", "neighbor"])
        self.assertEqual(receipt["stages"]["remove-carrier"]["movingGroups"], ["carried article", "carrier"])
        self.assertEqual([r["fixture"] for r in receipt["attachment"]["fixturesOffFloor"]], ["lane"])
        self.assertIn("[attachment] field fixture off the floor: lane", run.stderr)
        # Controls: a labelled fixture is listed as suspended; a trial of another path is a missing input; a carrier that
        # does not start where the last motion ended breaks the cycle.
        judgement["attachment"]["suspended"] = {"lane": "Invented: hung from a frame that is not drawn."}
        self.put("acquire-trial.json", dict(transport=dict(path, moves={"sample": slide([0, 9, 0])})))
        source["poses"]["released"]["carrier"] = spin(80)
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        self.build()
        _, changed = self.check("--physics-only")
        self.assertEqual(changed["attachment"]["fixturesOffFloor"], [])
        self.assertEqual([r["fixture"] for r in changed["attachment"]["suspendedFixtures"]], ["lane"])
        self.assertIn("Contact-transport evidence for carried article in acquire does not record this payload path", changed["missingInputs"])
        self.assertIn("Discontinuous cycle: carrier between release and park-loaded", changed["missingInputs"])
        self.assertNotEqual(changed["status"], "layout-checked")

    def test_a_squeezed_game_piece_is_judged_by_its_depth(self):
        source, judgement, budgets = self.copy(self.source), self.copy(self.judgement), self.copy(self.budgets)
        # A ball in place of the box, and a pad that presses 0.5 mm into its top where it is drawn.
        next(s for s in source["solids"] if s["name"] == "sample")["shape"] = dict(kind="sphere", centerMm=[38, 0, 20], radiusMm=2)
        source["solids"].append(dict(name="pad", group="structure", shape=dict(kind="box", fromMm=[36, -2, 21.5], toMm=[40, 2, 24])))
        source["contacts"] = [dict(pair=["sample", "pad"], note="The pad squeezes the ball in the pocket")]
        self.explain(judgement, "pad")
        judgement["attachment"]["unmounted"]["pad"] = "Invented: the pad bracket is not drawn."
        next(row for row in budgets["masses"] if row["id"] == "body")["members"].append("pad")
        rule = dict(payload="sample", contact="pad", maxDepthMm=1, basis="Invented one-sided squeeze allowance")
        judgement["stages"]["acquire"]["payloadCompression"] = [rule]
        self.put("design.json", source)
        self.put("budgets.json", budgets)
        self.put("judgement.json", judgement)
        self.build()
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr + json.dumps((receipt or {}).get("missingInputs")))
        row = receipt["cases"][0]["compression"][0]
        self.assertEqual((row["status"], round(row["deepestMm"], 3)), ("pass", 0.5))
        self.assertLessEqual(row["upperBoundMm"], 1)
        self.assertIn("[squeeze] acquire sample by pad: pass, deepest 0.50 mm of 1 mm allowed", run.stderr)
        # Control: the same squeeze against a tighter allowance blocks the layout.
        rule["maxDepthMm"] = 0.3
        self.put("judgement.json", judgement)
        tight, blocked = self.check("--physics-only", "--require-checked")
        self.assertEqual(tight.returncode, 1)
        self.assertEqual((blocked["cases"][0]["status"], blocked["cases"][0]["compression"][0]["status"], blocked["status"]), ("fail", "fail", "blocked"))
        # Control: a squeezed pair the source does not declare as a contact stops the check with what to do.
        source["contacts"] = []
        self.put("design.json", source)
        self.build()
        undeclared, _ = self.check("--physics-only")
        self.assertEqual(undeclared.returncode, 2)
        self.assertIn("Declare sample and pad as a contact during acquire in the design source", undeclared.stderr)


if __name__ == "__main__":
    unittest.main()
