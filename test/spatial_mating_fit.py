"""Original ruled helical teaching solid and matched placement controls, in mm."""
import math
import os
from pathlib import Path
import sys
import unittest
import copy
import hashlib
import json
from tempfile import TemporaryDirectory
from unittest.mock import patch

portable = os.environ.get("FRC_TEST_PROFILE") == "portable"
cad_test = unittest.skipIf(portable, "Run placed BRep controls in the qualified CAD test environment")
if not portable:
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
    def test_review_preserves_a_confirmed_probe_and_requires_all_negative_observations(self):
        from mechanical_readiness import digest
        probes=[{"centerMm":[0,0,-1],"radiusMm":.1},{"centerMm":[0,0,-2],"radiusMm":.1}]
        ids=[["Screw:1","body"],["Host:1","body"]]
        commission=dict(COMMISSION,host=ids[1],bodies=ids,basis="Original teaching calculation",
                        representation="external-thread/smooth-pilot",expectedCommonMm3=[1,2],forbiddenProbes=probes)
        with TemporaryDirectory() as directory:
            root=Path(directory)
            def pin(file,data):
                (root/file).write_bytes(data)
                return {"file":file,"sha256":hashlib.sha256(data).hexdigest()}
            sources={k:pin(k,k.encode()) for k in ("threadDrawing","maleGeometry")}
            prediction=dict(schema="agent-frc/spatial-fit-prediction@1",archiveSha256="archive",
                            commission=commission,drawingSha256=sources["threadDrawing"]["sha256"],
                            maleGeometrySha256=sources["maleGeometry"]["sha256"],calculation=pin("calculation",b"teaching"))
            sources["independentOverlap"]=pin("prediction.json",json.dumps(prediction).encode())
            case=dict(id="pair",configuration="fixed",pose="saved",solids=["a","b"],archiveSha256="archive",
                      stepSha256="step",commission=commission,evidence=sources)
            section=dict(totalMm3=1.5,outsideCylinderMm3=0,insideCoreMm3=0,permittedMm3=1.5,conservationErrorMm3=0)
            spatial=dict(commission=commission,programSha256=digest(Path(fit.__file__)),smoothPilot=True,
                         maleThread={"matched":True},methods={"fusionInterference":section,"fusionTransient":section})
            observation=dict(identities=ids,spatialFit=spatial,interferenceMm3=1.5,temporaryCommonMm3=1.5)
            census=dict(archiveSha256="archive",pose=dict(id="saved",spatialFits=[commission],spatialProgramSha256=spatial["programSha256"]),
                        contacts=dict(complete=True,pairs=[observation],programSha256=digest(Path(fit.__file__).with_name("fusion_issue_contacts.py"))))
            mapping={tuple(ids[0]):("a",{"neutralSha256":sources["maleGeometry"]["sha256"]}),tuple(ids[1]):("b",{})}
            clear=[dict(probe=p,sharedInterior=False) for p in probes]
            with (patch.object(fit,"placed_sections",return_value=section),patch.object(fit,"smooth_host",return_value=True),
                  patch.object(fit,"placed_thread",return_value={"matched":True}),patch.object(fit,"placed_forbidden",return_value=clear)):
                for observations,expected in ((clear,"pass"),([clear[0],{"probe":probes[1]}],"open"),
                                               ([dict(probe=probes[0],sharedInterior=True)],"fail")):
                    spatial["forbidden"]=observations
                    result,=fit.review(root,[case],{"a":1,"b":2},mapping,census,"archive","step","fixed",{("a","b"):2})
                    self.assertEqual(result["status"],expected,result)

    @cad_test
    def test_positive_helix_smooth_male_and_wrong_hand(self):
        male = twisted_male()
        self.assertTrue(fit.placed_thread(male, COMMISSION)["matched"])
        self.assertFalse(fit.placed_thread(cylinder(2.35), COMMISSION)["matched"])
        wrong_hand = dict(COMMISSION, threadForm=dict(FORM, hand="left"))
        self.assertFalse(fit.placed_thread(male, wrong_hand)["matched"])

    @cad_test
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

    @cad_test
    def test_independent_forbidden_material_survives_an_unresolved_boolean(self):
        commission = dict(COMMISSION, representation="external-thread/smooth-pilot",
                          expectedCommonMm3=[1,2], forbiddenProbes=[{"centerMm":[0,0,1],"radiusMm":.1}])
        pair = ["male","host"]
        shapes = {key:cylinder(3) for key in pair}
        observations = fit.placed_forbidden(shapes,pair,commission)
        self.assertTrue(observations[0]["sharedInterior"])
        raw = {"spatialFit":{"commission":commission,"methods":{},"forbidden":observations}}
        self.assertEqual(fit.native_result(raw,commission)[0],"fail")
        shapes["host"] = BRepAlgoAPI_Cut(cylinder(3),cylinder(2)).Shape()
        raw["spatialFit"]["forbidden"] = fit.placed_forbidden(shapes,pair,commission)
        self.assertFalse(raw["spatialFit"]["forbidden"][0]["sharedInterior"])
        self.assertEqual(fit.native_result(raw,commission)[0],"open")
        wrong = copy.deepcopy(commission)
        wrong["forbiddenProbes"][0]["centerMm"] = [2.1,0,1]
        with self.assertRaises(ValueError):
            fit.forbidden_probes(wrong)
        second={"centerMm":[0,0,2],"radiusMm":.1}
        commission["forbiddenProbes"].append(second)
        known=[{"centerMm":[0,0,1],"radiusMm":.25}]
        with patch("interface_consistency.inscribed_balls", side_effect=[(known,.02),RuntimeError("unresolved face")]):
            observations=fit.placed_forbidden(shapes,pair,commission)
        self.assertEqual([r["sharedInterior"] for r in observations],[True,None])
        self.assertEqual(fit.probe_result(commission,observations),"fail")
        observations[0]["sharedInterior"]=False
        self.assertEqual(fit.probe_result(commission,observations),"open")


if __name__ == "__main__":
    unittest.main()
