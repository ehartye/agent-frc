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
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

PLUGIN = Path(__file__).resolve().parents[1]
RELEASE = "cad/preliminary-design/releases/1.0"


def spin(deg):
    return [dict(kind="rotation", originMm=[0, 0, 20], axis=[0, 0, 1], travelDeg=deg)]


def slide(v):
    return [dict(kind="translation", travelMm=v)]


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
        cls.files = {f.name: f.read_bytes() for f in (cls.root / RELEASE).iterdir() if f.is_file()}
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
        # Each test leaves the passing example behind it: the files the starter wrote, and nothing else beside them.
        for f in (self.root / RELEASE).iterdir():
            if f.is_file() and f.name not in self.files:
                f.unlink()
        for name, data in self.files.items():
            (self.root / RELEASE / name).write_bytes(data)
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
        # The first line names the judgement file and its digest, so a reader knows which inputs this run read.
        self.assertIn("[inputs] judgement " + RELEASE + "/judgement.json sha256=" + hashlib.sha256((self.root / RELEASE / "judgement.json").read_bytes()).hexdigest(), run.stderr)
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
        self.put("judgement.json", self.judgement)
        # A view-only rebuild reuses cases only from a whole receipt whose control was rejected.
        for edit, said in ((dict(partial=True), "--view-only needs the receipt of a whole layout check"),
                           (dict(control=dict(receipt["control"], witness=None)), "--view-only cannot rebuild the displaced control")):
            (self.root / RELEASE / "receipt.json").write_text(json.dumps(dict(receipt, **edit)), encoding="utf-8")
            held, _ = self.check("--view-only")
            self.assertEqual(held.returncode, 2)
            self.assertIn(said, held.stderr)
        # A scene that no longer matches the check is not credited: without --write-view the view is unverified.
        judgement["stages"]["acquire"]["minGapMm"] = 1
        judgement["presentation"]["title"] = "Invented reworded title"
        self.put("judgement.json", judgement)
        stale, unverified = self.check("--require-checked")
        self.assertEqual(stale.returncode, 1)
        self.assertFalse(unverified["view"]["verified"])
        self.assertIn("Generate the matching view of these checked motions with --write-view", unverified["missingInputs"])
        self.assertEqual(unverified["status"], "provisional")

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

    def test_an_unexplained_solid_an_open_objective_a_misplaced_mount_and_a_stated_gap_keep_it_provisional(self):
        source, judgement = self.copy(self.source), self.copy(self.judgement)
        del judgement["presentation"]["components"]["head"]["rationale"]
        judgement["narrativeReview"]["objectives"][1]["disposition"] = "open"
        judgement["missingInputs"] = ["Invented open question for the author"]
        next(m for m in source["mounts"] if m["group"] == "carrier")["atMm"] = [0, 0, 40]
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        self.build()
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 1)
        self.assertEqual(receipt["status"], "provisional")
        for gap in ("Missing component rationale: head", "Open narrative objective: Park at the finish", "Invented open question for the author",
                    "Mount datum outside the selected host envelope: carrier on mount"):
            self.assertIn(gap, receipt["missingInputs"])
        self.assertEqual([c["status"] for c in receipt["cases"]], ["pass"] * 5, "a missing input changes no measurement")

    def test_an_undervoltage_blocks_and_a_premise_outside_its_acceptance_reopens(self):
        budgets = self.copy(self.budgets)
        budgets["electricalCases"]["loaded-turn-weak"]["resistanceOhm"] = [0.05, 0.06]
        self.put("budgets.json", budgets)
        _, receipt = self.check("--physics-only")
        self.assertEqual([r["case"] for r in receipt["budgets"]["electricalCases"] if r["status"] == "fail"], ["loaded-turn-weak"])
        self.assertEqual(receipt["status"], "blocked")
        self.assertIn("voltage/loaded-turn-weak", [r["reason"] for r in receipt["reopen"]])
        self.put("budgets.json", self.budgets)
        # The current acquisition estimate leaves the accepted 2.0 to 3.0 s: the premise reopens its upstream phase.
        self.put("capability-estimate.json", dict(acquireSeconds=3.4, basis="Invented slower estimate"))
        current = json.loads(self.files["acquire-time-current.json"])
        self.put("acquire-time-current.json", dict(current, value=3.4))
        _, reopened = self.check("--physics-only")
        self.assertEqual(reopened["status"], "reopen")
        self.assertEqual([(r["phase"], r["reason"]) for r in reopened["reopen"]], [("conceptual-design", "acquire-time")])

    def test_a_carried_payload_that_leaves_its_carrier_stops_the_check(self):
        source = self.copy(self.source)
        source["motions"]["remove-carrier"]["moves"]["carried article"] = slide([0, 0, 70])
        self.put("design.json", source)
        self.build()
        run, _ = self.check("--physics-only")
        self.assertEqual(run.returncode, 2)
        self.assertIn("The attached payload diverges from its carrier in remove-carrier", run.stderr)

    def test_only_a_mechanism_transports_and_a_still_one_declares_its_drive(self):
        judgement = self.copy(self.judgement)
        judgement["stages"]["acquire"]["transportedBy"] = {"carried article": dict(
            mechanisms=["carrier"], basis="Invented: rollers pull the article in", trial="invented pull-in")}
        self.put("judgement.json", judgement)
        _, receipt = self.check("--physics-only")
        self.assertIn("Declare the drive of stationary transporter carrier in acquire", receipt["missingInputs"])
        self.assertIn("Run trial invented pull-in with the design library and name its record in the judgement file as trials: {file}",
                      receipt["missingInputs"])
        self.assertEqual(receipt["status"], "provisional")
        judgement["stages"]["acquire"]["transportedBy"]["carried article"]["mechanisms"] = ["structure"]
        self.put("judgement.json", judgement)
        refused, _ = self.check("--physics-only")
        self.assertEqual(refused.returncode, 2)
        self.assertIn("Only mechanism groups transport a payload, each with a declared drive: carried article in acquire", refused.stderr)

    def test_scope_guidelines_are_said_aloud_and_an_agreed_budget_is_recorded(self):
        judgement = self.copy(self.judgement)
        budget = dict(detail="Invented: the carrier drawn in four parts", question="Invented: does the head clear the gate",
                      allowance="Invented: ten more solids", stopsWhen="Invented: the head clears by 1 mm")
        judgement["scopeGuidelines"] = dict(solids=5, extendedBudget=budget)
        self.put("judgement.json", judgement)
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr)
        scope = receipt["scope"]
        self.assertEqual((scope["passed"], scope["guideline"]["source"], scope["extendedBudget"]), (["solids"], "judgement file", budget))
        self.assertIn("The judgement file records an agreed extended budget: Invented: the carrier drawn in four parts", run.stderr)
        # Control: a guideline that is not a positive number stops the check with what to write.
        judgement["scopeGuidelines"] = dict(solids=-1)
        self.put("judgement.json", judgement)
        bad, _ = self.check("--physics-only")
        self.assertEqual(bad.returncode, 2)
        self.assertIn("Give scopeGuidelines.solids as a positive number", bad.stderr)

    def test_a_touching_solid_is_attached_and_a_gauge_is_left_out(self):
        source, judgement, budgets = self.copy(self.source), self.copy(self.judgement), self.copy(self.budgets)
        # A cleat that only touches the mount block is attached; a service gauge standing apart is not a robot part.
        source["solids"] += [dict(name="cleat", group="structure", shape=dict(kind="box", fromMm=[-4, 8, 0], toMm=[4, 12, 4])),
                             dict(name="reach gauge", group="structure", shape=dict(kind="box", fromMm=[-60, -4, 0], toMm=[-56, 4, 4]))]
        self.explain(judgement, "cleat", "reach gauge")
        judgement["presentation"]["components"]["reach gauge"]["volumeType"] = "gauge"
        next(row for row in budgets["masses"] if row["id"] == "body")["members"] += ["cleat", "reach gauge"]
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        self.put("budgets.json", budgets)
        self.build()
        _, receipt = self.check("--physics-only")
        self.assertEqual(receipt["attachment"]["floating"], [])
        self.assertEqual(receipt["attachment"]["excluded"]["serviceAndGauges"], 1)
        # Control: moved 5 mm off the block, past the touching gap, the cleat floats.
        next(s for s in source["solids"] if s["name"] == "cleat")["shape"].update(fromMm=[-4, 13, 0], toMm=[4, 17, 4])
        self.put("design.json", source)
        self.build()
        _, apart = self.check("--physics-only")
        self.assertEqual([r["solid"] for r in apart["attachment"]["floating"]], ["cleat"])

    def test_the_scene_stores_each_distinct_mesh_once(self):
        sys.path.insert(0, str(PLUGIN / "scripts"))
        from package_view import scene_payload
        square = dict(vertices=[[0, 0, 0], [1, 0, 0], [0, 1, 0]], triangles=[[0, 1, 2]])
        same = dict(vertices=[[0, 0, 0], [1, 0, 0], [0, 1, 0]], triangles=[[0, 1, 2]])
        other = dict(vertices=[[0, 0, 0], [2, 0, 0], [0, 1, 0]], triangles=[[0, 1, 2]])
        cases = [dict(id=c, stage="operating", bodies={"a": dict(square, matrices=[[1] * 12]), "b": dict(same, matrices=[[1] * 12]),
                                                        "c": dict(other, matrices=[[1] * 12])}) for c in ("one", "two")]
        payload = scene_payload(cases)
        self.assertEqual(len(payload["meshes"]), 2, "equal tessellations are stored once, across bodies and cases")
        self.assertEqual([payload["cases"][1]["bodies"][b]["mesh"] for b in "abc"], [0, 0, 1])

    def carried(self, *flags):
        """Check with --carry from the receipt beside the judgement file, and save the new receipt there."""
        run, _ = self.check("--physics-only", "--carry", "--output", RELEASE + "/receipt.json", *flags)
        receipt = json.loads((self.root / RELEASE / "receipt.json").read_text(encoding="utf-8"))
        return run, receipt, sorted(row["case"] for row in receipt["cases"] if row["checked"] == "rerun")

    def test_a_draft_check_measures_only_the_cases_whose_inputs_changed(self):
        judgement = self.copy(self.judgement)
        # The release stage takes the rail out first, so it does not draw on the rail.
        judgement["stages"]["release"]["absent"] = ["rail"]
        self.put("judgement.json", judgement)
        run, _ = self.check("--physics-only", "--output", RELEASE + "/receipt.json")
        self.assertEqual(run.returncode, 0, run.stderr)
        # A renamed design and an edited note change nothing a case measured: every case is carried.
        source = self.copy(self.source)
        source["name"] = "Invented renamed carrier 1.0"
        source["mounts"][0]["note"] = "Invented reworded note"
        self.put("design.json", source)
        self.build()
        run, receipt, rerun = self.carried()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(rerun, [])
        self.assertEqual(receipt["carriedFrom"]["cases"], 5)
        self.assertIn("[carry] 0 of 5 case(s) rerun, 5 carried from " + RELEASE + "/receipt.json", run.stderr)
        self.assertEqual(receipt["control"]["witness"]["status"], "fail", "the displaced control is measured again")
        self.assertIn("carried from " + RELEASE + "/receipt.json", next(row["checked"] for row in receipt["cases"]))
        # Moving the rail reruns exactly the cases that draw on it: every case but release.
        next(s for s in source["solids"] if s["name"] == "rail")["shape"].update(fromMm=[19, 72, 18], toMm=[24, 77, 23])
        self.put("design.json", source)
        self.build()
        run, receipt, rerun = self.carried()
        self.assertEqual(rerun, ["acquire", "loaded-turn", "park-loaded", "remove-carrier"])
        self.assertEqual(receipt["status"], "layout-checked", receipt["missingInputs"])
        # A changed allowance reruns its case alone.
        judgement["stages"]["acquire"]["minGapMm"] = 2
        self.put("judgement.json", judgement)
        _, _, rerun = self.carried()
        self.assertEqual(rerun, ["acquire"])
        # The whole check reruns everything and carries nothing.
        run, whole = self.check("--physics-only")
        self.assertEqual({row["checked"] for row in whole["cases"]}, {"rerun"})
        self.assertNotIn("carriedFrom", whole)

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
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        self.build()
        run, receipt = self.check("--physics-only", "--require-checked")
        self.assertEqual(run.returncode, 0, run.stderr + json.dumps((receipt or {}).get("missingInputs")))
        self.assertEqual(receipt["stages"]["loaded-turn"]["movingGroups"], ["carried article", "carrier", "neighbor"])
        self.assertEqual(receipt["stages"]["remove-carrier"]["movingGroups"], ["carried article", "carrier"])
        self.assertEqual([r["fixture"] for r in receipt["attachment"]["fixturesOffFloor"]], ["lane"])
        self.assertIn("[attachment] field fixture off the floor: lane", run.stderr)
        # Controls: a labelled fixture is listed as suspended; a carrier that does not start where the last motion ended breaks the cycle.
        judgement["attachment"]["suspended"] = {"lane": "Invented: hung from a frame that is not drawn."}
        source["poses"]["released"]["carrier"] = spin(80)
        self.put("design.json", source)
        self.put("judgement.json", judgement)
        self.build()
        _, changed = self.check("--physics-only")
        self.assertEqual(changed["attachment"]["fixturesOffFloor"], [])
        self.assertEqual([r["fixture"] for r in changed["attachment"]["suspendedFixtures"]], ["lane"])
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
