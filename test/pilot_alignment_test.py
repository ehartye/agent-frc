"""A centered cover can stay seated through its full radial clearance."""
import unittest
from copy import deepcopy
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
from pilot_alignment import measure


def cylinder(radius, z, height):
    return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0,0,z),gp_Dir(0,0,1)),radius,height).Shape()


class SeatedPilot(unittest.TestCase):
    def setUp(self):
        self.host=BRepAlgoAPI_Cut(cylinder(12,0,4),cylinder(5,-1,6)).Shape()
        self.member=BRepAlgoAPI_Fuse(cylinder(4.8,1,3),cylinder(8,4,2)).Shape()
        self.case=dict(originMm=[0,0,0],axis=[0,0,1],engagedBandMm=[1.2,3.8],seatPlaneMm=4,
                       hostNormalSign=1,boreRadiusMm=5,pilotRadiusMm=4.8,minimumSeatMm2=100,
                       clearDisplacementMm=.15,blockedDisplacementMm=-.24,displacementDirectionWorld=[.6,.8,0])
        self.budget=dict(kind="qualified",basis="Synthetic finished inspection",largestFinishedBoreRadiusMm=5.015,
                         smallestFinishedPilotRadiusMm=4.79,shaftToPilotRadialMm=.01,targetToBoreRadialMm=.015,
                         otherParallelErrorMm=.005,allowableParallelOffsetMm=.3)

    def test_holds_seat_through_play_and_exposes_uncertainty(self):
        for kind,outcome in (("qualified","within-budget"),("conditional","conditional")):
            self.budget["kind"]=kind
            result=measure(self.host,self.member,self.case,self.budget)
            self.assertEqual(result["status"],outcome)
            self.assertAlmostEqual(result["upperParallelOffsetMm"],.255)
            self.assertGreater(result["controls"][2]["seatMm2"],100)
            self.assertGreater(min(result["controls"][2]["commonMm3"]),0)
        self.assertEqual(measure(self.host,self.member,self.case,None)["status"],"open")
        self.budget["allowableParallelOffsetMm"]=.22
        self.assertEqual(measure(self.host,self.member,self.case,self.budget)["status"],"open")

    def test_split_open_wall_unseated_and_wrong_axis(self):
        slot=BRepPrimAPI_MakeBox(gp_Pnt(0,-1,0),14,2,4).Shape()
        broken=BRepAlgoAPI_Cut(self.host,slot).Shape()
        with self.assertRaisesRegex(ValueError,"cylindrical land"):
            measure(broken,self.member,self.case,None)
        case=deepcopy(self.case)
        case["seatPlaneMm"]=3.9
        self.assertEqual(measure(self.host,self.member,case,self.budget)["status"],"open")
        case["axis"]=[1,0,0]
        with self.assertRaisesRegex(ValueError,"cylindrical land"):
            measure(self.host,self.member,case,None)
