# @lane merge
# @subject scripts/layout_check.py
# @subject scripts/kernel_layout/verdict.py
# @subject scripts/kernel_layout/inputs.py
# @subject scripts/kernel_layout/rules.py
# @subject scripts/kernel_layout/jobs.py
# @subject scripts/kernel_layout/judge.py
# @subject scripts/kernel_layout/limits.py
# @subject scripts/kernel_layout/attachment.py
# @subject scripts/kernel_layout/stages.py
# @subject scripts/kernel_layout/premises.py
# @subject examples/design-source/create.py
"""What the judge makes of the design library's measurements: it passes a clear invented layout and can fail in each way that matters.

Failure caught: the judge passes a layout that interferes, floats, is too heavy or sags the bus, or judges before it has read
every input. Each control below changes one input of the passing example and must be rejected or reported."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent / "fixtures"))
from judged_project import RELEASE, Judge, get, solid  # noqa: E402

RULES = "kickoff/rules/2001-01-06/rules.json"
NAMES = ("acquire", "loaded-turn", "release", "park-loaded", "remove-carrier")


def slide(v):
    return [dict(kind="translation", travelMm=v)]


class KernelLayoutCheck(Judge):
    def kept(self, name):
        return get(self.root, RELEASE + "/" + name)

    def jobs(self):
        folder = self.root / RELEASE / "results/measurements"
        return {p.stem: self.record(p.stem) for p in sorted(folder.glob("*.json"))}

    # Acceptance 8 of the data model: measuring writes the library's job records, each with the question and the answer.
    def test_a_clear_layout_is_measured_as_library_jobs(self):
        verdict = self.judge()
        self.assertEqual((verdict["result"], verdict["status"]), ("pass", "layout-checked"), verdict["unmet"])
        self.assertIsNone(verdict["firstUnmet"])
        self.assertEqual({m: verdict["motions"][m]["status"] for m in verdict["motions"]}, dict.fromkeys(NAMES, "pass"))
        self.assertTrue(verdict["control"]["rejected"], "the displaced control is rejected")
        self.assertEqual(verdict["attachment"]["floating"], [])
        self.assertEqual([r["solid"] for r in verdict["attachment"]["unmountedAllowances"]], ["rail"])
        self.assertEqual(verdict["attachment"]["onUnmountedAllowance"], ["gate", "gate motor"])
        jobs = self.jobs()
        self.assertEqual(set(jobs), {"clearance.motion." + m for m in NAMES} | {"electrical." + m for m in ("loaded-turn", "release", "park-loaded")} | {
            "clearance.motion.loaded-turn.displaced.rail", "withdrawal.remove-carrier", "attachment.pose.offered", "mass.drawn"},
            "a motion no motor drives states its cause and has no electrical job")
        for name, record in jobs.items():
            # No file holds a row for a pair the broad phase settled far apart.
            for row in (record["result"].get("pairs") or []) if record["job"]["kind"] == "clearance" else []:
                self.assertTrue(row["closerThanMinGap"] or not row["proven"] or row["lowerBoundMm"] < record["job"]["minGapMm"] + record["job"].get("nearMm", 0), name)
        self.assertEqual(verdict["records"]["folder"], RELEASE + "/results")
        self.assertEqual({r["id"] for r in verdict["records"]["jobs"]}, set(jobs))

    def test_the_judgement_holds_no_geometry(self):
        self.judgement(lambda j: j.update(groups={"structure": {"role": "structure"}}))
        self.assertIn("The judgement file holds no geometry or motion. Move groups to the design source", self.refused())

    # Acceptance 10 of the data model: weight from the source, against each limit with the roles it leaves out.
    def test_weight_comes_from_the_source_and_each_limit_leaves_out_its_roles(self):
        weight = self.judge()["weight"]
        mass = self.record("mass.drawn")["result"]
        self.assertEqual((weight["totalKg"], weight["rangeKg"]), (mass["totalKg"], mass["rangeKg"]))
        self.assertEqual(weight["rules"], "kickoff/rules/2001-01-06")
        inspection = next(row for row in weight["limits"] if row["name"] == "inspection")
        left = sum(mass["groups"][g]["rangeKg"][1] for g in ("bumper", "battery", "carried article"))
        self.assertAlmostEqual(inspection["rangeKg"][1], mass["rangeKg"][1] - left, places=9)
        self.assertEqual((inspection["status"], inspection["excludesRoles"]), ("pass", ["bumper", "battery"]))
        # A heavy battery is left out of the inspection weight: that limit passes and the other one fails.
        self.source(lambda s: solid(s, "battery").update(massKg=12))
        (self.root / RELEASE / "premises/robot-mass.json").unlink()
        heavy = self.judge()
        self.assertEqual({row["name"]: row["status"] for row in heavy["weight"]["limits"]}, {"inspection": "pass", "with bumpers and battery": "fail"})
        self.assertEqual((heavy["status"], heavy["firstUnmet"]["kind"]), ("blocked", "weight"))
        self.assertIn("with bumpers and battery", heavy["firstUnmet"]["text"])
        # Control: the same inspection limit without its exclusion fails.
        self.edit(RULES, lambda r: r["weightLimits"][0].update(excludesRoles=[]))
        unexcluded = self.judge(only=["weight"])
        self.assertEqual(next(row["status"] for row in unexcluded["weight"]["limits"] if row["name"] == "inspection"), "fail")
        # A limit in pounds is the same limit in kilograms; a role nobody may list is refused.
        self.edit(RULES, lambda r: r["weightLimits"][0].update(limit={"value": 100, "unit": "lb"}))
        self.assertAlmostEqual(self.judge(only=["weight"])["weight"]["limits"][0]["limitKg"], 45.359237)
        self.edit(RULES, lambda r: r["weightLimits"][0].update(excludesRoles=["payload"]))
        self.assertIn("payload", self.refused(only=["weight"]))

    # Acceptance 11 of the data model: the bus voltage of each motion, worked out from its running drives.
    def test_each_motion_is_judged_for_bus_voltage_and_current_from_its_running_drives(self):
        electrical = self.judge()["electrical"]
        self.assertEqual(electrical["minBusV"], 9)
        self.assertEqual(sorted(electrical["motions"]), ["loaded-turn", "park-loaded", "release"])
        turn = electrical["motions"]["loaded-turn"]
        record = self.record("electrical.loaded-turn")["result"]
        self.assertEqual(turn["busV"], record["bus"]["volts"]["range"])
        self.assertEqual(turn["requiredV"], max(9, *(d["motorV"]["range"][1] for d in record["drives"].values())))
        self.assertEqual(turn["status"], "pass")
        # The drivetrain running at its limit beside the turn sags the weak pack below the floor: the motion fails.
        self.source(lambda s: s["motions"]["loaded-turn"].update(alsoRunning=[{"drive": "drivetrain", "atLimit": True}]))
        sagged = self.judge()
        row = sagged["electrical"]["motions"]["loaded-turn"]
        self.assertEqual((row["status"], sagged["status"], sagged["firstUnmet"]["kind"]), ("fail", "blocked", "electrical"))
        self.assertLess(row["marginV"], 0)
        self.assertIn("loaded-turn", sagged["firstUnmet"]["text"])
        self.assertIn("minBusV", sagged["firstUnmet"]["text"])
        self.assertEqual(sagged["electrical"]["motions"]["release"]["status"], "pass", "only the motion that runs the drivetrain fails")
        # A drive whose motor must turn faster than the bus can drive it fails, naming the drive.
        self.source(lambda s: (s["motions"]["loaded-turn"].pop("alsoRunning"), s["drives"]["pivot"].update(gear=400)))
        fast = self.judge(only=["electrical"])
        self.assertEqual(fast["electrical"]["motions"]["loaded-turn"]["status"], "fail")
        self.assertEqual(fast["electrical"]["motions"]["loaded-turn"]["governs"], "pivot")
        self.assertIn("pivot", fast["firstUnmet"]["text"])

        # A heavy carrier needs more current than the pivot's limit: the drive is clamped and the motion fails; a lighter one passes.
        def carrier(kg):
            def change(source):
                source["drives"]["pivot"]["gear"] = 10
                source["groups"]["carrier"]["massKg"] = kg
                for row in source["solids"]:
                    if row["group"] == "carrier":
                        row.pop("massKg", None)
            return change
        self.source(carrier(400))
        clamped = self.judge(only=["electrical"])
        self.assertEqual(clamped["electrical"]["motions"]["loaded-turn"]["clamped"], ["pivot"])
        self.assertEqual(clamped["result"], "fail")
        self.source(carrier(0.6))
        self.assertEqual(self.judge(only=["electrical"])["electrical"]["motions"]["loaded-turn"]["status"], "pass")
        # A design with powered motions and no battery is refused before anything is built; what needs no battery is still judged.
        self.source(lambda s: s.pop("battery"))
        self.assertIn("Give the design source a battery: loaded-turn, park-loaded and release draw from it", self.refused())
        self.assertEqual(self.judge(only=["weight"])["result"], "pass")

    # Acceptance 12 of the data model: the rules are stated once, and an exception changes only its motion.
    def test_the_rules_are_stated_once_and_an_exception_changes_one_motion(self):
        verdict = self.judge()
        self.assertEqual({verdict["motions"][m]["allowanceMm"] for m in verdict["motions"]}, {1})
        first = self.jobs()
        exception = {"release": {"minGapMm": 0.5, "allowanceBasis": "Invented: the ejector runs in a guide"}}
        self.judgement(lambda j: j["rules"].update(exceptions=exception))
        verdict = self.judge()
        self.assertEqual({m: verdict["motions"][m]["allowanceMm"] for m in verdict["motions"]},
                         {"acquire": 1, "loaded-turn": 1, "release": 0.5, "park-loaded": 1, "remove-carrier": 1})
        after = self.jobs()
        self.assertEqual({name for name in after if after[name] != first[name]}, {"clearance.motion.release"})
        # An exception names a motion of the source and a rule the judgement knows.
        self.judgement(lambda j: j["rules"].update(exceptions={"spin": {"minGapMm": 0.5}, "release": {"stroke": 3}}))
        said = self.refused()
        self.assertIn("rules.exceptions names spin, which is not a motion of the design source", said)
        self.assertIn("rules.exceptions.release holds stroke", said)

    def test_interference_blocks_the_layout(self):
        # Control: the rail drawn inside the arc the loaded head sweeps.
        self.source(lambda s: solid(s, "rail")["shape"].update(fromMm=[19, 20, 18], toMm=[24, 25, 23]))
        verdict = self.judge()
        self.assertEqual((verdict["result"], verdict["status"]), ("fail", "blocked"))
        self.assertEqual(verdict["motions"]["loaded-turn"]["status"], "fail")
        self.assertIn(["head", "rail"], [sorted(row["pair"]) for row in verdict["motions"]["loaded-turn"]["failing"]])
        self.assertEqual(verdict["firstUnmet"]["kind"], "clearance")
        self.assertIn("preliminary-design", [r["phase"] for r in verdict["reopen"]])

    def test_a_floating_solid_fails_the_layout_and_the_same_solid_mounted_passes(self):
        # The rail's allowance taken away: nothing drawn holds it, and the gate and its motor hang on it, so all float.
        self.judgement(lambda j: j.pop("attachment"))
        verdict = self.judge(all=True)
        self.assertEqual([r["solid"] for r in verdict["attachment"]["floating"]], ["gate", "gate motor", "rail"])
        self.assertEqual((verdict["status"], verdict["firstUnmet"]["kind"]), ("blocked", "attachment"))
        self.assertIn("rail", verdict["firstUnmet"]["text"])
        self.assertEqual({verdict["motions"][m]["status"] for m in verdict["motions"]}, {"pass"}, "nothing but the floating solids is wrong")
        # Control: the same rail on a post and a beam that reach the mount block is attached. Each stands 2 mm off the
        # next: within the 3 mm touching gap, and clear of the 1 mm allowance.
        self.source(lambda s: s["solids"].extend([
            dict(name="rail beam", group="structure", shape=dict(kind="box", fromMm=[-8, 17, 0], toMm=[24, 75, 6]), massKg=0.3),
            dict(name="rail post", group="structure", shape=dict(kind="box", fromMm=[19, 70, 8], toMm=[24, 75, 16]), massKg=0.1)]))
        mounted = self.judge()
        self.assertEqual((mounted["result"], mounted["attachment"]["floating"]), ("pass", []), mounted["unmet"])

    def test_a_displaced_control_that_is_not_rejected_fails(self):
        # An offset that leaves the rail clear cannot show that the check fails.
        self.judgement(lambda j: j["control"].update(offsetMm=[0, 5, 0]))
        verdict = self.judge()
        self.assertFalse(verdict["control"]["rejected"])
        self.assertEqual((verdict["status"], verdict["firstUnmet"]["kind"]), ("blocked", "control"))
        # With no control commissioned nothing fails but a full judgement: it is a decision still to make.
        self.judgement(lambda j: j.pop("control"))
        verdict = self.judge()
        self.assertEqual(verdict["result"], "pass")
        self.assertTrue(any("displaced control" in text for text in verdict["completeness"]))

    def test_a_premise_outside_its_acceptance_reopens_conceptual_design(self):
        # The observed mass is computed from the library's mass record: a premise of at most 9 kg is left, and reopens conceptual design.
        row = self.judge()["premises"][0]
        self.assertEqual((row["id"], row["status"], row["value"]), ("robot-mass", "within", self.record("mass.drawn")["result"]["rangeKg"]))
        premise = RELEASE + "/premises/robot-mass.json"
        self.edit(premise, lambda p: p.update(criterion={"range": [0, 9]}))
        reopened = self.judge()
        self.assertEqual((reopened["result"], reopened["status"]), ("fail", "reopen"))
        self.assertEqual([(r["phase"], r["reason"]) for r in reopened["reopen"]], [("conceptual-design", "robot-mass")])
        # A premise names a fact the library states; a premise without observes is not observed: a decision still to make.
        self.edit(premise, lambda p: p.update(observes="mass.colour"))
        self.assertIn("Premise robot-mass observes mass.colour", self.refused())
        self.edit(premise, lambda p: p.pop("observes"))
        unseen = self.judge()
        self.assertEqual(unseen["result"], "pass")
        self.assertTrue(any("Premise robot-mass is not observed" in text for text in unseen["completeness"]))

    def test_a_carried_payload_that_leaves_its_carrier_stops_the_check(self):
        # Without carriedBy the article must move with the carrier by its own operations; 70 mm is not the carrier's 80.
        self.source(lambda s: (s["groups"]["carried article"].pop("carriedBy"),
                               s["motions"]["remove-carrier"]["moves"].update({"carried article": slide([0, 0, 70])})))
        self.judgement(lambda j: j.update(motions={"remove-carrier": {"carriedWith": {"carried article": "carrier"}}}))
        self.assertIn("The attached payload diverges from its carrier in remove-carrier", self.refused())
        self.assertEqual(self.judge(motions=["acquire"])["result"], "pass", "another motion does not need that binding")

    def test_only_a_mechanism_transports_and_a_named_trial_must_be_defined(self):
        self.judgement(lambda j: j.update(motions={"acquire": {"transportedBy": {"carried article": dict(
            mechanisms=["structure"], basis="Invented: rollers pull the article in", trial="invented pull-in")}}}))
        said = self.refused()
        self.assertIn("Only mechanism groups transport a payload, each with a declared drive: carried article in acquire", said)
        self.assertIn("transportedBy names trial invented pull-in, which the design source does not define", said)

    def test_scope_guidelines_are_said_aloud_and_an_agreed_budget_is_recorded(self):
        budget = dict(detail="Invented: the carrier drawn in four parts", question="Invented: does the head clear the gate",
                      allowance="Invented: ten more solids", stopsWhen="Invented: the head clears by 1 mm")
        self.judgement(lambda j: j.update(scopeGuidelines=dict(solids=5, extendedBudget=budget)))
        verdict = self.judge()
        self.assertEqual(verdict["result"], "pass")
        scope = verdict["scope"]
        self.assertEqual((scope["passed"], scope["guideline"]["source"], scope["extendedBudget"]), (["solids"], "judgement file", budget))
        self.assertTrue(any("The judgement file records an agreed extended budget: Invented: the carrier drawn in four parts" in note for note in verdict["notes"]))
        self.judgement(lambda j: j.update(scopeGuidelines=dict(solids=-1)))
        self.assertIn("Give scopeGuidelines.solids as a positive number", self.refused())

    def test_a_touching_solid_is_attached_and_a_service_gauge_is_left_out(self):
        # A cleat that only touches the mount block is attached; a service gauge standing apart is not a robot part.
        self.source(lambda s: (s["groups"].update(gauges={"role": "service"}), s["solids"].extend([
            dict(name="cleat", group="structure", shape=dict(kind="box", fromMm=[-4, -8, 7], toMm=[4, -4, 9]), massKg=0.05),
            dict(name="reach gauge", group="gauges", shape=dict(kind="box", fromMm=[-60, -4, 0], toMm=[-56, 4, 4]))])))
        verdict = self.judge()
        self.assertEqual((verdict["result"], verdict["attachment"]["floating"]), ("pass", []), verdict["unmet"])
        self.assertEqual(verdict["attachment"]["excluded"]["serviceAndGauges"], 1)
        # Control: moved 5 mm off the block, past the touching gap, the cleat floats.
        self.source(lambda s: solid(s, "cleat")["shape"].update(fromMm=[-4, -8, 12], toMm=[4, -4, 14]))
        self.assertEqual([r["solid"] for r in self.judge()["attachment"]["floating"]], ["cleat"])

    def test_the_cycle_is_one_ordered_list_of_phases_and_runs_continuously(self):
        verdict = self.judge()
        self.assertEqual([row["phase"] for row in verdict["cycle"]], ["acquire", "retain", "transfer", "deliver", "reset", "endgame", "park", "service"])
        cycle = self.kept("judgement.json")["cycle"]
        self.judgement(lambda j: j.update(cycle=[row for row in cycle if row["phase"] != "deliver"]))
        partial = self.judge()
        self.assertIn("The cycle does not list release", [row["text"] for row in partial["unmet"]])
        # A motion that does not start where the one before it ended breaks the cycle.
        self.judgement(lambda j: j.update(cycle=cycle))
        self.source(lambda s: s["motions"]["park-loaded"].update({"from": "offered"}))
        broken = self.judge(only=["cycle"])
        self.assertIn("Discontinuous cycle: carried article between release and park-loaded", [row["text"] for row in broken["unmet"]])
        # A phase word the cycle does not know, and a park motion in another phase, are refused.
        self.judgement(lambda j: (j["cycle"][0].update(phase="gather"), j["cycle"][6].update(motions=[]), j["cycle"][7].update(motions=["remove-carrier", "park-loaded"])))
        said = self.refused()
        self.assertIn("cycle[0] names the phase gather", said)
        self.assertIn("park-loaded is a park motion and is listed under service", said)

    def test_a_motion_through_poses_and_a_hanging_fixture_are_judged(self):
        def change(source):
            source["poses"]["parked"] = {}
            source["poses"]["turned"] = {"carrier": [dict(kind="rotation", originMm=[0, 0, 20], axis=[0, 0, 1], travelDeg=90)], "neighbor": slide([0, 12, 0])}
            source["motions"]["loaded-turn"] = {"through": ["parked", "turned"], "by": "hand"}
            source["motions"]["release"]["from"] = "turned"
            source["groups"]["field"] = {"role": "fixture"}
            source["fixtures"] = [dict(name="lane", group="field", shape=dict(kind="box", fromMm=[80, -20, 30], toMm=[120, 20, 34]))]
        self.source(change)
        floating = self.judge()
        self.assertEqual([r["fixture"] for r in floating["attachment"]["fixturesOffFloor"]], ["lane"])
        self.assertEqual((floating["status"], floating["firstUnmet"]["kind"]), ("blocked", "attachment"))
        self.judgement(lambda j: j["attachment"].update(suspended={"lane": "Invented: hung from a frame that is not drawn."}))
        verdict = self.judge()
        self.assertEqual(verdict["result"], "pass", verdict["unmet"])
        self.assertEqual(verdict["motions"]["loaded-turn"]["movingGroups"], ["carried article", "carrier", "neighbor"])
        self.assertEqual([r["fixture"] for r in verdict["attachment"]["suspendedFixtures"]], ["lane"])

    def test_a_squeezed_game_piece_is_judged_by_its_depth(self):
        # A ball in place of the box, and a pad under it that presses 0.5 mm into its bottom where it is drawn.
        self.source(lambda s: (solid(s, "sample").update(shape=dict(kind="sphere", centerMm=[38, 0, 20], radiusMm=2)),
                               s["solids"].append(dict(name="pad", group="structure", shape=dict(kind="box", fromMm=[36, -2, 16], toMm=[40, 2, 18.5]), massKg=0.01)),
                               s.update(contacts=[dict(pair=["sample", "pad"], note="The pad squeezes the ball in the pocket")])))
        rule = dict(payload="sample", contact="pad", maxDepthMm=1, basis="Invented one-sided squeeze allowance")
        self.judgement(lambda j: (j["attachment"]["unmounted"].update(pad="Invented: the pad bracket is not drawn."),
                                  j["rules"].update(payloadCompression=[rule], exceptions={"release": {"payloadCompression": []}})))
        verdict = self.judge()
        self.assertEqual(verdict["result"], "pass", verdict["unmet"])
        row = verdict["motions"]["acquire"]["compression"][0]
        self.assertEqual((row["status"], round(row["deepestMm"], 3)), ("pass", 0.5))
        self.assertLessEqual(row["upperBoundMm"], 1)
        self.assertEqual(verdict["motions"]["release"]["compression"], [], "the exception takes the rule off one motion")
        self.assertEqual(sorted(name for name in self.jobs() if name.startswith("indentation.")),
                         ["indentation.acquire.sample.pad", "indentation.loaded-turn.sample.pad", "indentation.park-loaded.sample.pad",
                          "indentation.remove-carrier.sample.pad"])
        # A tighter allowance blocks; the squeeze alone can be judged.
        self.judgement(lambda j: j["rules"]["payloadCompression"][0].update(maxDepthMm=0.3))
        tight = self.judge(only=["squeeze"])
        self.assertEqual((tight["result"], tight["firstUnmet"]["kind"]), ("fail", "squeeze"))
        # A squeezed pair the source does not declare as a contact stops the check with what to do.
        self.source(lambda s: s.update(contacts=[]))
        self.assertIn("Declare sample and pad as a contact in the design source", self.refused())

    def test_missions_and_risks_are_stated_in_the_judgement(self):
        self.judgement(lambda j: (j.update(missionCases=[dict(name="deliver", trial="invented throw", accomplishes="delivered", objective="Acquire, turn and release")]),
                                  j["risks"].append(dict(id="evidence", risk="Invented", closedBy={"file": "kickoff/strategic-narrative.md"}))))
        said = self.refused()
        self.assertIn("Mission case deliver names trial invented throw, which the design source does not define", said)
        self.assertIn("Risk evidence: closedBy names a trial, interaction, adjustment or measured job, or is a sentence; a file is not allowed", said)


if __name__ == "__main__":
    unittest.main()
