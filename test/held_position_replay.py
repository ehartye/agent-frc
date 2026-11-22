"""Resume a held delivery stand-off premise by replaying the pinned field profile at the revised position."""
import json
import runpy
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path
import unittest

from mechanical_fixture import SCRIPTS, write

# The invented training field's blue bay and the robot's delivery step.
BAY = [175, 194]
DELIVERY = dict(match="trial-1", actor="B1", input="stepPosition", period="Main play",
                stepIndex=1, stepLabel="Deliver to bay", station="blue-bay")


class HeldPositionReplay(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.root = Path(cls.folder.name) / "layout"
        cls.plan = runpy.run_path(str(SCRIPTS.parent / "examples/preliminary-design/create.py"))["create"](cls.root)
        cls.base = json.loads((SCRIPTS.parent / "examples/kickoff/training-field.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def review(self, previous=None):
        from preliminary_design import review
        return review(self.root, self.root / "layout.json", previous)

    def premise(self, tag, value, field_input, accepted_extra=None, criterion=(0., 80.)):
        """Register a delivery stand-off premise alongside the example premises."""
        plan = self.plan
        role = json.loads((self.root / plan["premises"][0]["accepted"]["file"]).read_text())["source"]
        identity = dict(id="delivery-standoff", unit="in", scenario="selected cycle")
        accepted = dict(**identity, criterion={"range": list(criterion)}, phase="conceptual-design",
                        interfaces=["carrier", "carried article"], source=role, fieldInput=field_input,
                        basis="Invented delivery stand-off from the bay center", **(accepted_extra or {}))
        estimate = write(self.root, tag + "-standoff.json", {"standoffIn": value})
        current = write(self.root, tag + "-standoff-current.json",
                        dict(**identity, value=value, issue=plan["issue"], designSha256=plan["design"]["sha256"],
                             stepSha256=plan["step"]["sha256"], source=estimate, valueField="standoffIn"))
        premises = [*plan["premises"], dict(accepted=write(self.root, tag + "-standoff-accepted.json", accepted), current=current)]
        write(self.root, "layout.json", dict(plan, premises=premises))

    def hold(self, tag, field_input):
        """A first issue observed a stand-off outside the rehearsed range and reopened conceptual design."""
        self.premise(tag + "-held", 90., field_input)
        held = self.review()
        self.assertEqual(held["status"], "reopen")
        self.assertIn("delivery-standoff", [r["reason"] for r in held["reopen"]])
        write(self.root, tag + "-hold.json", held)
        return held, self.root / (tag + "-hold.json")

    def resubmit(self, tag, held, field_input, delivery_at, value):
        """Re-run the field series with the delivery step at the revised position and resubmit."""
        profile = json.loads(json.dumps(self.base))
        profile["rehearsal"]["programs"]["shuttle"]["steps"][1]["at"] = delivery_at
        run_input = write(self.root, tag + "-field.json", profile)
        replay = json.loads(subprocess.check_output(["node", str(SCRIPTS / "rehearsal-series.mjs"), str(self.root / run_input["file"])]))
        field = dict(profile=run_input, result=write(self.root, tag + "-replayed.json", replay), **field_input)
        plan = self.plan
        upstream = write(self.root, tag + "-upstream.json", dict(issue=plan["issue"], designSha256=plan["design"]["sha256"],
                         stepSha256=plan["step"]["sha256"], phase="conceptual-design", scenario="selected cycle",
                         premise="delivery-standoff", fieldReplay=field))
        self.premise(tag, value, field_input, dict(repeat=dict(previousPlanSha256=held["planSha256"])))
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


if __name__ == "__main__":
    unittest.main()
