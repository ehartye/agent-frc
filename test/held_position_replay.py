"""Resume a held delivery stand-off premise by replaying the pinned field profile at the revised position."""
import json
import runpy
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

from mechanical_fixture import SCRIPTS, package_write as write

# The invented training field's blue bay and the robot's delivery step.
BAY = [175, 194]
UNIDENTIFIED = "Held premise delivery-standoff predates fieldInput and its evidence does not identify the step"
DELIVERY = dict(match="trial-1", actor="B1", input="stepPosition", period="Main play",
                stepIndex=1, stepLabel="Deliver to bay", station="blue-bay")
STATION = dict(input="stationPosition", actor="B1", station="blue-bay")


class HeldPositionReplay(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root, pins=True)
        cls.base = json.loads((SCRIPTS.parent / "examples/kickoff/training-field.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def review(self, previous=None):
        from preliminary_design import review
        return review(self.root.parent, self.root / "layout.json", previous)

    def premise(self, tag, value, field_input, accepted_extra=None, criterion=(0., 80.), source=None, phase="conceptual-design", scenario="selected cycle", unit="in",
                scenario_id=None, observed=None):
        """Register a delivery stand-off premise alongside the example premises."""
        plan = self.plan
        role = source or json.loads((self.root.parent / plan["premises"][0]["accepted"]["file"]).read_text())["source"]
        identity = dict(id="delivery-standoff", unit=unit, scenario=scenario, **({} if scenario_id is None else {"scenarioId": scenario_id}))
        accepted = dict(**identity, criterion={"range": list(criterion)}, phase=phase,
                        interfaces=["carrier", "carried article"], source=role,
                        basis="Invented delivery stand-off from the bay center", **(accepted_extra or {}))
        if field_input is not None:
            accepted["fieldInput"] = field_input
        estimate = write(self.root, tag + "-standoff.json", {"standoffIn": value})
        current = write(self.root, tag + "-standoff-current.json",
                        dict(**dict(identity, **(observed or {})), value=value, issue=plan["issue"], designSha256=plan["design"]["sha256"],
                             stepSha256=plan["step"]["sha256"], source=estimate, valueField="standoffIn"))
        premises = [*plan["premises"], dict(accepted=write(self.root, tag + "-standoff-accepted.json", accepted), current=current)]
        write(self.root, "layout.json", dict(plan, premises=premises))

    def hold(self, tag, field_input, source=None, phase="conceptual-design", scenario="selected cycle", unit="in", scenario_id=None):
        """A first issue observed a stand-off outside the rehearsed range and reopened its phase."""
        self.premise(tag + "-held", 90., field_input, source=source, phase=phase, scenario=scenario, unit=unit, scenario_id=scenario_id)
        held = self.review()
        self.assertEqual(held["status"], "reopen")
        self.assertIn("delivery-standoff", [r["reason"] for r in held["reopen"]])
        self.replays = {}
        write(self.root, tag + "-hold.json", held)
        return held, self.root / (tag + "-hold.json")

    def resubmit(self, tag, held, field_input, delivery_at, value, phase="conceptual-design", edit=None, criterion=(0., 80.), unit="in",
                 scenario="selected cycle", scenario_id=None, upstream=None):
        """Re-run the field series with the delivery step at the revised position and resubmit."""
        profile = json.loads(json.dumps(self.base))
        profile["rehearsal"]["programs"]["shuttle"]["steps"][1]["at"] = delivery_at
        if edit:
            edit(profile)
        run_input = write(self.root, tag + "-field.json", profile)
        replay = json.loads(subprocess.check_output(["node", str(SCRIPTS / "rehearsal-series.mjs"), str(self.root.parent / run_input["file"])]))
        self.replays[tag] = replay
        field = dict(profile=run_input, result=write(self.root, tag + "-replayed.json", replay), **field_input)
        plan = self.plan
        upstream = write(self.root, tag + "-upstream.json", dict(issue=plan["issue"], designSha256=plan["design"]["sha256"],
                         stepSha256=plan["step"]["sha256"], phase=phase,
                         **(upstream or dict(scenario=scenario, **({} if scenario_id is None else {"scenarioId": scenario_id}))),
                         premise="delivery-standoff", fieldReplay=field))
        self.premise(tag, value, field_input, dict(repeat=dict(previousPlanSha256=held["planSha256"])), phase=phase, criterion=criterion, unit=unit,
                     scenario=scenario, scenario_id=scenario_id)
        accepted_file = self.root / (tag + "-standoff-accepted.json")
        accepted = json.loads(accepted_file.read_text())
        accepted["source"] = upstream
        premises = json.loads((self.root / "layout.json").read_text())["premises"]
        premises[-1]["accepted"] = write(self.root, accepted_file.name, accepted)
        write(self.root, "layout.json", dict(plan, premises=premises))
        return self.review(self.root / (tag + "-hold.json"))

    @staticmethod
    def prior(result):
        return [d for d in result["priorDecisions"] if d["reason"] == "delivery-standoff"][0]

    def test_replayed_legal_standoff_clears_the_hold(self):
        held, _ = self.hold("clear", DELIVERY)
        result = self.resubmit("clear", held, DELIVERY, [BAY[0], BAY[1] - 10], 10.)
        self.assertTrue(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "layout-checked")

    def test_displaced_standoff_stays_open(self):
        held, _ = self.hold("displaced", DELIVERY)
        # The project reports 12 in while the replayed program delivers from 10 in.
        result = self.resubmit("displaced", held, DELIVERY, [BAY[0], BAY[1] - 10], 12.)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")

    def test_out_of_station_standoff_stays_open(self):
        held, _ = self.hold("outside", DELIVERY)
        # 20 in from the bay the footprint is legal and the program completes,
        # but the station's 16 in release radius makes every attempt ineligible.
        result = self.resubmit("outside", held, DELIVERY, [BAY[0], BAY[1] - 20], 20.)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")

    def test_illegal_standoff_stays_open(self):
        held, _ = self.hold("illegal", DELIVERY)
        # 60 in north of the bay the robot footprint crosses the field boundary.
        # The footprint screen refuses it, and the planner never reaches it to deliver.
        result = self.resubmit("illegal", held, DELIVERY, [BAY[0], BAY[1] + 60], 60.)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")

    def test_wrong_station_or_step_stays_open(self):
        for tag, change in (("station", dict(station="blue-supply")), ("label", dict(stepLabel="Pick up tile"))):
            field_input = dict(DELIVERY, **change)
            held, _ = self.hold(tag, field_input)
            result = self.resubmit(tag, held, field_input, [BAY[0], BAY[1] - 10], 10.)
            self.assertFalse(self.prior(result)["repeatVerified"], tag)

    def test_unsupported_input_stays_open(self):
        field_input = dict(DELIVERY, input="stepRoute")
        held, _ = self.hold("unsupported", field_input)
        result = self.resubmit("unsupported", held, field_input, [BAY[0], BAY[1] - 10], 10.)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")

    def legacy(self, tag, evidence, scenario="selected cycle", unit="in", field_input=DELIVERY):
        """Hold a premise accepted before fieldInput records, citing its own pinned evidence."""
        source = write(self.root, tag + "-legacy-evidence.json", evidence)
        held, _ = self.hold(tag, None, source=source, scenario=scenario, unit=unit)
        before = json.loads((self.root / (tag + "-held-standoff-accepted.json")).read_text())
        self.assertNotIn("fieldInput", before)
        return self.resubmit(tag, held, field_input, [BAY[0], BAY[1] - 10], 10.)

    def test_legacy_premise_with_derivable_evidence_clears(self):
        step = {k: v for k, v in DELIVERY.items() if k != "input"}
        result = self.legacy("derivable", dict(basis="Invented coarse field study", fieldReplay=dict(step, program="shuttle")))
        self.assertTrue(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "layout-checked")

    def test_legacy_premise_with_underivable_evidence_stays_open(self):
        result = self.legacy("underivable", dict(cycle="Invented coarse field study that names no step"))
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")
        self.assertIn(UNIDENTIFIED, result["missingInputs"])
        step = {k: v for k, v in DELIVERY.items() if k != "input"}
        # A partial record, an extra field or a step named for another input does not identify the delivery step.
        for tag, evidence, field_input in (
                ("partial", dict(fieldReplay={k: v for k, v in step.items() if k != "station"}), DELIVERY),
                ("extra", dict(fieldReplay=dict(step, speed=78)), DELIVERY),
                ("speed", dict(fieldReplay=dict(match="trial-1", actor="B1")), dict(match="trial-1", actor="B1", input="speed"))):
            result = self.legacy(tag, evidence, field_input=field_input)
            self.assertFalse(self.prior(result)["repeatVerified"], tag)
            self.assertIn(UNIDENTIFIED, result["missingInputs"], tag)

    def test_legacy_premise_naming_a_different_step_stays_open(self):
        for tag, change in (("other-step", dict(stepIndex=0, stepLabel="Pick up tile")),
                            ("other-program", dict(program="receive")),
                            ("other-input", dict(input="actionDwell")),
                            ("typed", dict(stepIndex=True)),
                            ("conflicting", None)):
            step = {k: v for k, v in DELIVERY.items() if k != "input"}
            evidence = dict(fieldReplay=dict(step, **change)) if change else dict(
                fieldReplay=step, fieldInput=dict(step, station="red-bay"))
            result = self.legacy(tag, evidence)
            self.assertFalse(self.prior(result)["repeatVerified"], tag)
            self.assertEqual(result["status"], "reopen", tag)
            # Disagreeing records are ambiguous; a single record naming another step is a different step.
            reason = UNIDENTIFIED if tag == "conflicting" else "Held premise delivery-standoff evidence identifies a different field step"
            self.assertIn(reason, result["missingInputs"], tag)

    def test_legacy_premise_from_another_scenario_stays_open(self):
        step = {k: v for k, v in DELIVERY.items() if k != "input"}
        for tag, change in (("scenario", dict(scenario="invented defended cycle")), ("unit", dict(unit="s"))):
            result = self.legacy(tag, dict(fieldReplay=step), **change)
            self.assertFalse(self.prior(result)["repeatVerified"], tag)
            self.assertEqual(result["status"], "reopen", tag)

    STEP = {k: v for k, v in DELIVERY.items() if k != "input"}
    FAR, NEAR = "Invented cycle delivering from 90 in", "Invented cycle delivering from 10 in"

    def reworded(self, tag, held_id, revised_id, upstream=None, revised=NEAR):
        """Hold a premise that predates fieldInput under one description, then resubmit it under another."""
        source = write(self.root, tag + "-legacy-evidence.json", dict(fieldReplay=self.STEP))
        held, _ = self.hold(tag, None, source=source, scenario=self.FAR, scenario_id=held_id)
        return self.resubmit(tag, held, DELIVERY, [BAY[0], BAY[1] - 10], 10., scenario=revised, scenario_id=revised_id, upstream=upstream)

    def test_a_stable_scenario_id_lets_the_description_change(self):
        result = self.reworded("same-id", "delivery-cycle", "delivery-cycle")
        prior = self.prior(result)
        self.assertTrue(prior["repeatVerified"], result["missingInputs"])
        self.assertEqual(result["status"], "layout-checked")
        # The receipt keeps both wordings in view.
        self.assertEqual(prior["scenarioRevised"], dict(held=self.FAR, current=self.NEAR))
        decision = [d for d in result["premises"] if d["id"] == "delivery-standoff"][0]
        self.assertEqual((decision["scenarioId"], decision["scenario"]), ("delivery-cycle", self.NEAR))

    def test_a_different_scenario_id_stays_open_with_its_reason(self):
        result = self.reworded("other-id", "delivery-cycle", "defended-cycle")
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")
        self.assertIn("Held premise delivery-standoff has scenarioId delivery-cycle; the revised premise has defended-cycle",
                      result["missingInputs"])
        # A hold that records its field input replays without comparing descriptions; two different IDs still keep it open.
        held, _ = self.hold("other-id-input", DELIVERY, scenario_id="delivery-cycle")
        result = self.resubmit("other-id-input", held, DELIVERY, [BAY[0], BAY[1] - 10], 10., scenario_id="defended-cycle")
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")
        held, _ = self.hold("same-id-input", DELIVERY, scenario_id="delivery-cycle")
        same = self.resubmit("same-id-input", held, DELIVERY, [BAY[0], BAY[1] - 10], 10., scenario=self.NEAR, scenario_id="delivery-cycle")
        self.assertTrue(self.prior(same)["repeatVerified"], same["missingInputs"])
        # The same wording does not override two different IDs.
        result = self.reworded("other-id-same-text", "delivery-cycle", "defended-cycle", revised=self.FAR)
        self.assertFalse(self.prior(result)["repeatVerified"])

    def test_an_id_on_one_side_only_falls_back_to_the_exact_description(self):
        for tag, held_id, revised_id in (("held-only", "delivery-cycle", None), ("revised-only", None, "delivery-cycle")):
            result = self.reworded(tag, held_id, revised_id)
            self.assertFalse(self.prior(result)["repeatVerified"], tag)
            self.assertEqual(result["status"], "reopen", tag)
            same = self.reworded(tag + "-same-text", held_id, revised_id, revised=self.FAR)
            self.assertTrue(self.prior(same)["repeatVerified"], tag)
            self.assertNotIn("scenarioRevised", self.prior(same))

    def test_upstream_evidence_is_matched_by_scenario_id(self):
        worded = "Invented upstream wording of the same cycle"
        result = self.reworded("upstream-same", "delivery-cycle", "delivery-cycle", upstream=dict(scenario=worded, scenarioId="delivery-cycle"))
        self.assertTrue(self.prior(result)["repeatVerified"], result["missingInputs"])
        for tag, upstream in (("upstream-other", dict(scenario=self.NEAR, scenarioId="defended-cycle")),
                              ("upstream-none", dict(scenario=worded))):
            result = self.reworded(tag, "delivery-cycle", "delivery-cycle", upstream=upstream)
            self.assertFalse(self.prior(result)["repeatVerified"], tag)
            self.assertEqual(result["status"], "reopen", tag)

    def test_an_observation_is_matched_to_its_acceptance_by_scenario_id(self):
        worded = "Invented observer wording of the same cycle"
        self.premise("observed-same", 10., DELIVERY, scenario=self.NEAR, scenario_id="delivery-cycle", observed=dict(scenario=worded))
        decision = [d for d in self.review()["premises"] if d["id"] == "delivery-standoff"][0]
        self.assertEqual((decision["status"], decision["observedScenario"]), ("within", worded))
        # Another ID, or a reworded observation without an ID of its own, is a different scope.
        for tag, observed in (("observed-other", dict(scenarioId="defended-cycle")), ("observed-none", dict(scenario=worded, scenarioId=None))):
            self.premise(tag, 10., DELIVERY, scenario=self.NEAR, scenario_id="delivery-cycle", observed=observed)
            with self.assertRaisesRegex(ValueError, "Premise observation differs in scope", msg=tag):
                self.review()
        for bad in ("", " ", 0, False, 5, []):
            self.premise("bad-id", 10., DELIVERY, scenario_id=bad)
            with self.assertRaisesRegex(ValueError, "Bind each premise", msg=repr(bad)):
                self.review()
        self.premise("bad-wording", 10., DELIVERY, scenario_id="delivery-cycle", observed=dict(scenario={"x": 1}))
        with self.assertRaisesRegex(ValueError, "Premise observation differs in scope"):
            self.review()

    def test_preliminary_design_field_premise_stays_open(self):
        # A stale field conclusion reopens the conceptual trade study; a field replay cannot clear a preliminary hold.
        held, _ = self.hold("preliminary", DELIVERY, phase="preliminary-design")
        result = self.resubmit("preliminary", held, DELIVERY, [BAY[0], BAY[1] - 10], 10., phase="preliminary-design")
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")

    def generic(self, tag, field_input, criterion, extra=None):
        """Hold a generic premise whose evidence is the whole field profile, then replay the series."""
        source = write(self.root, tag + "-generic-evidence.json", self.base)
        held, _ = self.hold(tag, None, source=source, unit="m")
        def edit(profile):
            programs = profile["rehearsal"]["programs"]
            # A second invented program delivers to the same bay from 14 in, used by B1 in one match only.
            programs["shuttle-far"] = json.loads(json.dumps(programs["shuttle"]))
            programs["shuttle-far"]["label"] = "Move tiles to bay from farther"
            programs["shuttle-far"]["steps"][1]["at"] = [BAY[0], BAY[1] - 14]
            roster = profile["rehearsal"]["series"]["matches"][1]["roster"]
            next(r for r in roster if r["side"] == "blue" and r["slot"] == 1)["plans"]["Main play"] = "shuttle-far"
            if extra:
                extra(profile)
        return self.resubmit(tag, held, field_input, [BAY[0], BAY[1] - 10], 10., edit=edit, criterion=criterion)

    def test_generic_premise_clears_on_a_series_wide_station_replay(self):
        result = self.generic("generic", STATION, (0., 15.))
        self.assertTrue(self.prior(result)["repeatVerified"], result["missingInputs"])
        self.assertEqual(result["status"], "layout-checked")
        # Empty-cargo attempts after a supply empties count for position but not delivery.
        events = [e for m in self.replays["generic"]["matches"] for e in m["game"]["events"]
                  if e["robot"] == "B1" and e["station"] == "blue-bay" and e["operation"] == "attempt"]
        self.assertIn("no-compatible-cargo", {e["outcome"] for e in events})

    def test_generic_premise_clears_when_one_match_has_no_attempt(self):
        def elsewhere(profile):
            # In one match B1 never visits the bay, so that match imposes no delivery requirement.
            roster = profile["rehearsal"]["series"]["matches"][2]["roster"]
            next(r for r in roster if r["side"] == "blue" and r["slot"] == 1)["plans"] = {"Opening": "hold", "Main play": "hold"}
        result = self.generic("generic-idle", STATION, (0., 15.), extra=elsewhere)
        self.assertFalse(any(e["robot"] == "B1" and e["operation"] == "attempt"
                             for e in self.replays["generic-idle"]["matches"][2]["game"]["events"]))
        self.assertTrue(self.prior(result)["repeatVerified"], result["missingInputs"])
        self.assertEqual(result["status"], "layout-checked")

    def test_generic_premise_with_one_attempt_out_of_range_stays_open(self):
        result = self.generic("generic-range", STATION, (0., 12.))
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")
        self.assertTrue(any("outside the accepted range" in m for m in result["missingInputs"]), result["missingInputs"])

    def test_generic_premise_with_one_blocked_attempt_stays_open(self):
        def wall(profile):
            # B1 makes one extra attempt from a footprint across the field boundary, in a period it otherwise holds.
            profile["rehearsal"]["programs"]["reach-over"] = dict(label="Reach over the boundary", steps=[
                dict(at=[BAY[0], BAY[1] + 60], label="Deliver over the rail", operation="attempt",
                     station=dict(blue="blue-bay", red="red-bay"), outcome="credited", dwell=0.6)])
            roster = profile["rehearsal"]["series"]["matches"][2]["roster"]
            next(r for r in roster if r["side"] == "blue" and r["slot"] == 1)["plans"]["Opening"] = "reach-over"
        result = self.generic("generic-wall", STATION, (0., 80.), extra=wall)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertTrue(any("footprint is blocked" in m for m in result["missingInputs"]), result["missingInputs"])

    def test_generic_premise_with_a_match_of_empty_attempts_stays_open(self):
        def dry(profile):
            # In one match B1 only attempts, never acquires, so every attempt there finds no cargo.
            programs = profile["rehearsal"]["programs"]
            programs["attempt-only"] = dict(label="Attempt without pickup", loop=True, steps=[programs["shuttle"]["steps"][1]])
            roster = profile["rehearsal"]["series"]["matches"][2]["roster"]
            next(r for r in roster if r["side"] == "blue" and r["slot"] == 1)["plans"]["Main play"] = "attempt-only"
        result = self.generic("generic-dry", STATION, (0., 15.), extra=dry)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertIn("Station replay: B1 delivered no piece at blue-bay in trial-3", result["missingInputs"])

    def test_station_replay_needs_generic_evidence_and_an_inch_range(self):
        # Evidence naming one step needs that step's replay.
        step = {k: v for k, v in DELIVERY.items() if k != "input"}
        source = write(self.root, "named-generic-evidence.json", dict(fieldReplay=step))
        held, _ = self.hold("named", None, source=source)
        result = self.resubmit("named", held, STATION, [BAY[0], BAY[1] - 10], 10.)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertIn(UNIDENTIFIED, result["missingInputs"])
        # The revised premise must measure the stand-off in inches.
        source = write(self.root, "unit-generic-evidence.json", self.base)
        held, _ = self.hold("generic-unit", None, source=source, unit="m")
        result = self.resubmit("generic-unit", held, STATION, [BAY[0], BAY[1] - 10], 10., criterion=(0., 15.), unit="m")
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertIn("Station replay: needs an inch stand-off range", result["missingInputs"])

    def test_generic_premise_without_any_delivery_stays_open(self):
        def dry(profile):
            programs = profile["rehearsal"]["programs"]
            programs["attempt-only"] = dict(label="Attempt without pickup", loop=True, steps=[programs["shuttle"]["steps"][1]])
            for match in profile["rehearsal"]["series"]["matches"]:
                robot = next(r for r in match["roster"] if r["side"] == "blue" and r["slot"] == 1)
                robot["plans"] = {period: "attempt-only" for period in robot["plans"]}
        result = self.generic("generic-none", STATION, (0., 15.), extra=dry)
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertIn("Station replay: B1 delivered no piece at blue-bay in the series", result["missingInputs"])

    def test_generic_premise_with_a_single_step_input_stays_open(self):
        result = self.generic("generic-step", DELIVERY, (0., 15.))
        self.assertFalse(self.prior(result)["repeatVerified"])
        self.assertEqual(result["status"], "reopen")
        self.assertIn(UNIDENTIFIED, result["missingInputs"])


if __name__ == "__main__":
    unittest.main()
