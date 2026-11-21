"""Original ruled helical teaching solid and matched placement controls, in mm."""
import math
from pathlib import Path
import sys
import unittest

from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Pnt

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import spatial_fit as fit


REGION = {"startMm": [0, 0, 0], "endMm": [0, 0, 4], "pilotRadiusMm": 2,
          "majorRadiusMm": 2.5, "classificationSlackMm": .001}
FORM = {"hand": "right", "pitchMm": 1, "crestPointMm": [2.15, 0, 1]}
COMMISSION = {"region": REGION, "threadForm": FORM}


def twisted_male():
    # At every cross section the crest is on one side and the root on the other.
    # Twisting the closed profiles through four turns produces a continuous modeled ridge.
    tool = BRepOffsetAPI_ThruSections(True, True)
    tool.CheckCompatibility(False)
    for station in range(49):
        z = station / 12
        wire = BRepBuilderAPI_MakePolygon()
        for index in range(12):
            phase = math.tau * index / 12
            radius = 2.04 + .31 * math.cos(phase)
            angle = math.tau*z + phase
            wire.Add(gp_Pnt(radius*math.cos(angle), radius*math.sin(angle), z))
        wire.Close()
        tool.AddWire(wire.Wire())
    tool.Build()
    return tool.Shape()


def cylinder(radius):
    return BRepPrimAPI_MakeCylinder(radius, 4).Shape()


class SpatialMatingFit(unittest.TestCase):
    def test_positive_helix_smooth_male_and_wrong_hand(self):
        male = twisted_male()
        self.assertTrue(fit.placed_thread(male, COMMISSION)["matched"])
        self.assertFalse(fit.placed_thread(cylinder(2.35), COMMISSION)["matched"])
        wrong_hand = dict(COMMISSION, threadForm=dict(FORM, hand="left"))
        self.assertFalse(fit.placed_thread(male, wrong_hand)["matched"])

    def test_same_common_volume_in_wrong_region(self):
        sleeve = BRepAlgoAPI_Cut(cylinder(2.35), cylinder(2.05)).Shape()
        shapes = {"a": sleeve, "b": cylinder(3)}
        good = fit.placed_sections(shapes, ["a", "b"], REGION)
        wrong = dict(REGION, startMm=[0, 0, 2], endMm=[0, 0, 6])
        bad = fit.placed_sections(shapes, ["a", "b"], wrong)
        self.assertAlmostEqual(good["totalMm3"], bad["totalMm3"])
        limits = [good["totalMm3"]-.01, good["totalMm3"]+.01]
        for row, verdict in [(good, "pass"), (bad, "fail")]:
            self.assertEqual(fit.assess({"placed":row}, limits, required_methods=["placed"])[0], verdict)
        self.assertEqual(fit.assess({"placed":bad}, limits, required_methods=["placed","missing"])[0],"fail")


if __name__ == "__main__":
    unittest.main()
