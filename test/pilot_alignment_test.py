# @lane merge
# @subject scripts/mechanical_readiness.py
"""A centered cover can stay seated through its full radial clearance."""
import unittest
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
from mechanical_fixture import pin, write
from pilot_alignment import measure, review


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

    def test_qualified_budget_cannot_move_to_another_service_or_land(self):
        from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
        from showcase_contacts import load_solids
        with TemporaryDirectory() as directory:
            root=Path(directory)
            writer=STEPControl_Writer()
            for shape in (self.host,self.member):
                writer.Transfer(shape,STEPControl_AsIs)
            writer.Write(str(root/"fixture.step"))
            ids={}
            shapes,_=load_solids(root/"fixture.step",ids)
            h,m=shapes
            case=dict(self.case,schema="agent-frc/seated-pilot@1",step=pin(root,"fixture.step"),
                      host=dict(solid=h,identity=ids[h]),member=dict(solid=m,identity=ids[m]),
                      serviceOperation="Remove flanged cover",shaftAxis="Cover spindle",targetAxis="Housing spindle")
            natural=review(root,case)
            self.assertEqual(natural["status"],"open")
            case["budget"]=write(root,"inspection.json",dict(self.budget,commissionSha256=natural["commissionSha256"]))
            self.assertEqual(review(root,case)["status"],"within-budget")
            for field,changed in (("engagedBandMm",[1.4,3.7]),("targetAxis","Far spindle"),
                                  ("serviceOperation","Remove cover and housing")):
                with self.assertRaisesRegex(ValueError,"different service or datum"):
                    review(root,{**case,field:changed})
