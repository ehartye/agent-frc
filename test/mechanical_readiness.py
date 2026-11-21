import shutil
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import fixture, write, SCRIPTS
from mechanical_readiness import evaluate_inputs as review, verify_delivery, digest,scan
from showcase_contacts import measure
from mesh_controls import MeshComparisons
from observed_transfer import ObservedTransfer
from installed_kinematics import InstalledKinematics
from linked_kinematics import LinkedKinematics


class Readiness(unittest.TestCase):
    def setUp(self):
        self.folder=TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root=Path(self.folder.name)
        self.s=fixture(self.root)

    def change(self,key,edit):
        data=json.loads((self.root/self.s[key]["file"]).read_bytes())
        edit(data)
        self.s[key]=write(self.root,self.s[key]["file"],data)

    def status(self):
        return review(self.root,self.s)

    def test_control_and_real_governing_case(self):
        self.assertEqual(self.status()["showcaseEligibility"],"pass")
        self.s["duties"][-1]["max"]=.7
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_connected_clash_and_incomplete_pair_coverage(self):
        self.change("geometry",lambda g:g["pairs"][0].__setitem__(3,8.1))
        r=self.status()
        self.assertEqual(len(r["geometricGroups"]),1)
        self.assertEqual(r["showcaseEligibility"],"fail")
        self.change("geometry",lambda g:g.update(pairs=[]))
        with self.assertRaisesRegex(ValueError,"Incomplete"):
            self.status()

    def test_visible_legacy_rail_cannot_be_filtered_out_of_both_step_and_declared_native_bodies(self):
        def omit(census):
            census["bodies"].append(dict(census["bodies"][0],path="Legacy stock rail:1",name="Crossing the motor"))
        self.change("nativeCensus",omit)
        out=self.status()
        self.assertEqual(out["showcaseEligibility"],"fail")
        self.assertTrue(any("Legacy stock" in row["subject"] for row in out["findings"]))

    def test_latest_canonical_source_stale_child_same_name_and_old_step(self):
        from fusion_authority import verify
        authority=self.root/self.s["authority"]["file"];lineage=self.root/self.s["lineage"]["file"]
        spec=json.loads(authority.read_bytes());issued=json.loads(lineage.read_bytes())
        self.assertEqual(verify(self.root,authority,lineage)["policy"],"registered-offline-archive")
        spec["source"]={"kind":"cloud","dataFileId":"unique-cloud-file"}
        issued.update(authority=write(self.root,self.s["authority"]["file"],spec),policy="observed-cloud-latest",
            dataFileId="other-cloud-file",savedVersion=8,latestVersion=8,versionId="exact-8",children=[],hasOutofDateChildReferences=False)
        def check():
            write(self.root,lineage.name,issued)
            return verify(self.root,authority,lineage)
        with self.assertRaisesRegex(ValueError,"design"):
            check()
        issued["dataFileId"]="unique-cloud-file";issued["latestVersion"]=9
        with self.assertRaisesRegex(ValueError,"latest"):
            check()
        issued.update(savedVersion=9,hasOutofDateChildReferences=True,children=[dict(id="link",versionId="v2",latestVersionId="v3")])
        with self.assertRaisesRegex(ValueError,"stale"):
            check()
        spec["pinnedChildren"]=[dict(id="link",versionId="v2",basis="version-qualified option")]
        issued["authority"]=write(self.root,self.s["authority"]["file"],spec)
        self.assertEqual(check()["status"],"pass")
        (self.root/issued["step"]["file"]).write_text("stale export")
        with self.assertRaisesRegex(ValueError,"evidence"):
            check()

    def test_native_pair_incomplete_and_failed_repeated_readback(self):
        self.change("nativeCensus",lambda c:c["contacts"].update(pairs=[]))
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s=fixture(self.root)
        self.change("nativeCensus",lambda c:c["contacts"]["pairs"][0].update(interferenceMm3=9))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")
        self.s=fixture(self.root)
        raw=json.loads((self.root/"test-raw.json").read_bytes())
        raw["measurements"]["heldout"]=dict(raw["measurements"]["strength"],value=1.6)
        updated=write(self.root,"test-raw.json",raw)
        obs=json.loads((self.root/"test-observations.json").read_bytes())
        for row in obs["observations"].values():
            if "measurement" in row:
                row["measurement"].update(updated)
                row["sources"][0].update(updated)
        u=write(self.root,"test-observations.json",obs)
        for d in self.s["duties"]:d["observation"].update(u)
        self.s["connections"][0]["evidence"].update(u)
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_nested_joint_source_cannot_override_governing_seat(self):
        from joint_sources import verify
        pair=["block","frame"];step=self.s["step"]["sha256"];archive=self.s["archive"]["sha256"]
        def qualify(status):
            child=write(self.root,"seat.json",dict(schema="agent-frc/mechanical-motion-result@1",stepSha256=step,
                cases=[dict(seats=[dict(pair=pair,areaMm2=48,minAreaMm2=50 if status=="fail" else 45,
                    status=status,interferenceMm3=0)])]))
            summary=write(self.root,"qualified.json",dict(stepSha256=step,archiveSha256=archive,status="pass",pair=pair,
                qualification={"sources":[child]}))
            return lambda:verify(self.root,[summary],pair,archive,step,"A")
        qualify("pass")()
        with self.assertRaisesRegex(ValueError,"area|pass"):qualify("fail")()

    def test_coincident_faces_do_not_establish_retention(self):
        self.s["connections"]=[]
        r=self.status()
        self.assertEqual(len(r["geometricGroups"]),1)
        self.assertEqual(len(r["retainedGroups"]),2)
        self.assertEqual(r["showcaseEligibility"],"open")

    def test_real_separation_exceeds_interface_gap(self):
        self.change("geometry",lambda g:g["pairs"][0].__setitem__(2,2))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_archived_evidence_broken_by_substitution_or_missing_stiffness(self):
        self.s["articles"]["block"]["representation"]="supplier-envelope"
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s["articles"]["block"]["representation"]="official-exact"
        del self.s["duties"][5]["observation"]
        self.assertEqual(self.status()["showcaseEligibility"],"open")

    def test_complete_signed_load_spectrum_and_supported_fatigue_only(self):
        from member_duty import evaluate
        step=self.s["step"]
        base=dict(body="root",stepSha256=step["sha256"])
        dims=write(self.root,"dims.json",{**base,"section":"solid-rectangle","bendingAxis":"minor","grade":"fixture",
            "spanMm":100,"widthMm":10,"depthMm":10})
        mat=write(self.root,"mat.json",dict(grade="fixture",basis="original teaching fixture",modulusMPa=100000,bendingAllowableMPa=100,
            fatigueBasis="reversed bending, matching source treatment",fullyReversedSnMPaCycles=[[90,1000],[20,100000]]))
        cyc=dict(id="adverse",source="synthetic force history",minimumN=-50,maximumN=50,cycles=10)
        forces={**base,"support":"fixed-free-end-force","axis":"minor","cases":[cyc],"completeLifeSpectrum":True}
        study=dict(schema="agent-frc/member-duty@1",step=step,material=mat,dimensions=dims,body="root",stressFactor=1,
            factorBasis="uniform synthetic section",deflectionLimitMm=1,damageLimit=1)
        def actual():
            study["load"]=write(self.root,"forces.json",forces)
            return evaluate(self.root,study)
        r=actual()
        self.assertEqual(r["status"],"pass")
        self.assertAlmostEqual(r["cases"][0]["bendingMPa"],30)
        self.assertAlmostEqual(r["cases"][0]["tipDeflectionMm"],.2)
        cyc["cycles"]=1000000
        self.assertEqual(actual()["fatigue"],"fail")
        cyc["minimumN"]=0
        self.assertEqual(actual()["status"],"open")
        cyc["maximumN"]=400
        self.assertEqual(actual()["status"],"fail")

    def test_changed_pose_assembly_and_raw_evidence(self):
        self.s["installed"]["block"]["transform"][3]=9
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s["installed"]["block"]["transform"][3]=10
        (self.root/"test-raw.json").write_text("{}")
        with self.assertRaisesRegex(ValueError,"Changed evidence"):
            self.status()

    def test_same_vendor_sku_and_good_source_geometry_do_not_cover_a_new_configuration(self):
        from vendor_configuration import compare
        article=self.s["articles"]["block"]
        self.assertEqual(compare(self.root,article)["status"],"pass")
        purchase=json.loads((self.root/"ordered.json").read_bytes())
        purchase["items"].append(dict(position="spacer",partNumber="slim spacer",revision="b",quantity=2))
        article["procurementBom"]=write(self.root,"ordered.json",purchase)
        self.assertEqual(compare(self.root,article)["differentPositions"],["spacer"])
        self.assertEqual(self.status()["showcaseEligibility"],"fail")

    def test_rights_for_native_and_derivatives_are_separate(self):
        p=self.root/"view.png";p.write_bytes(b"test view")
        self.s=fixture(self.root,assets=["view.png"])
        self.s["articles"]["block"]["rights"]="derived-views-only"
        with self.assertRaisesRegex(ValueError,"projection"):
            verify_delivery(self.root,self.s,["view.png"])
        with self.assertRaisesRegex(ValueError,"redistribution"):
            verify_delivery(self.root,self.s,["test.f3d"])
        self.s["articles"]["block"]["rights"]="private-master"
        with self.assertRaisesRegex(ValueError,"public view"):
            verify_delivery(self.root,self.s,["view.png"])

    def test_fresh_step_repeated_source_measurement_clear_and_interfering_controls(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
            from OCP.gp import gp_Pnt
            from OCP.STEPControl import STEPControl_AsIs,STEPControl_Writer
        except ImportError:
            self.skipTest("Install OCP to exercise the native measurement lane")
        from showcase_release import verify_candidate
        for x,expected in [(10,"pass"),(8,"fail")]:
            file=self.root/"actual.step"
            writer=STEPControl_Writer()
            for pos in [0,x]:
                writer.Transfer(BRepPrimAPI_MakeBox(gp_Pnt(pos,0,0),10.,10.,10.).Shape(),STEPControl_AsIs)
            writer.Write(str(file))
            data=measure(file,.02,[],volumes=True)
            from mechanical_readiness import digest
            data["stepSha256"]=digest(file)
            self.assertAlmostEqual(data["pairs"][0][3],(10-x)*100,places=5)
            s=fixture(self.root,"actual.step",measured=data)
            self.assertEqual(review(self.root,s)["showcaseEligibility"],expected)
            if expected=="pass":
                with self.assertRaisesRegex(ValueError,"native station|native Fusion"):
                    verify_candidate(self.root,"test-readiness.json","actual.step",[])
            else:
                with self.assertRaisesRegex(ValueError,"readiness fail"):
                    verify_candidate(self.root,"test-readiness.json","actual.step",[])

    def test_independent_grounding_regressions(self):
        # Adding a same-bounds purchased bore is a shape change independently of a good envelope.
        self.change("geometry",lambda g:g["componentDifferences"]["block"].update(extraMm3=125.66))
        self.assertEqual(self.status()["showcaseEligibility"],"fail")
        self.s=fixture(self.root)
        self.s["duties"][-1]["max"]=1.25
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s=fixture(self.root)
        for d in self.s["duties"]:
            d["subjects"]=["frame"]
        with self.assertRaisesRegex(ValueError,"case/subjects"):
            self.status()
        self.s=fixture(self.root)
        self.change("geometry",lambda g:g["pairs"][0].__setitem__(2,50))
        obs=json.loads((self.root/"test-observations.json").read_bytes())
        obs["observations"]["joint"]["maxInterfaceGapMm"]=50
        updated=write(self.root,"test-observations.json",obs)
        for d in self.s["duties"]:d["observation"].update(updated)
        self.s["connections"][0]["evidence"].update(updated)
        self.assertNotEqual(self.status()["showcaseEligibility"],"pass")

    def test_true_placed_bore_and_midstroke_tool_collision(self):
        try:
            from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox,BRepPrimAPI_MakeCylinder
            from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
            from OCP.gp import gp_Pnt,gp_Ax2,gp_Dir
            from OCP.STEPControl import STEPControl_AsIs,STEPControl_Writer
        except ImportError:
            self.skipTest("Install OCP to exercise the native comparison")
        from component_shape import compare_components
        from showcase_contacts import load_solids
        from mechanical_motion import evaluate
        from mechanical_fixture import pin
        def save(name,shapes):
            writer=STEPControl_Writer()
            for solid in shapes:writer.Transfer(solid,STEPControl_AsIs)
            path=self.root/name;writer.Write(str(path));return path
        cube=BRepPrimAPI_MakeBox(10.,10.,10.).Shape()
        hole=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(5,5,0),gp_Dir(0,0,1)),2,10).Shape()
        official=save("bored.step",[BRepAlgoAPI_Cut(cube,hole).Shape()])
        installed=save("line.step",[cube,BRepPrimAPI_MakeBox(gp_Pnt(20,0,0),5.,10.,10.).Shape()])
        labels=list(load_solids(installed)[0]);original=next(iter(load_solids(official)[0]))
        delta=compare_components(installed,[(labels[0],official,original,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])])
        with self.assertRaisesRegex(ValueError,"reflection"):
            compare_components(installed,[(labels[0],official,original,[-1,0,0,10,0,1,0,0,0,0,1,0,0,0,0,1])])
        self.assertAlmostEqual(delta[labels[0]]["extraMm3"],40*3.14159265358979,places=4)
        case=dict(id="service",basis="finite driver passes through housing at intermediate stroke",minGapMm=.1,
                  moves={labels[0]:[dict(kind="translation",travelMm=[40,0,0])]})
        m={"schema":"agent-frc/mechanical-motion@1","step":pin(self.root,"line.step"),"cases":[case]}
        result=evaluate(self.root,m)["cases"][0]
        self.assertEqual(result["status"],"fail")
        self.assertEqual(result["pairs"][0]["witness"]["t"],.5)
        case["moves"][labels[0]][0]["travelMm"]=[0,20,0]
        self.assertEqual(evaluate(self.root,m)["cases"][0]["status"],"pass")
        case["requiredContacts"]=[dict(id="pickup",pair=labels,maxGapMm=.1,window=[0,1],criterion="actual source contact")]
        miss=evaluate(self.root,m)["cases"][0]
        self.assertEqual(miss["status"],"fail")
        self.assertGreater(miss["requiredContacts"][0]["lowerBoundMm"],.1)
        from mechanical_motion import bearing_area
        side=BRepPrimAPI_MakeBox(gp_Pnt(10,0,0),10.,10.,10.).Shape()
        edge=BRepPrimAPI_MakeBox(gp_Pnt(10,10,0),10.,10.,10.).Shape()
        self.assertAlmostEqual(bearing_area(cube,side),100)
        self.assertEqual(bearing_area(cube,edge),0)
        # Sliding a bored block past a stud: its bounding box collides even when
        # the finite stud stays inside the bored-through channel for the whole stroke.
        from mechanical_motion import planar_translation_clear
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
        channel=BRepPrimAPI_MakeBox(gp_Pnt(-1,2,2),12.,6.,6.).Shape()
        carrier=BRepAlgoAPI_Cut(cube,channel).Shape()
        travel=[dict(kind="translation",travelMm=[20,0,0])]
        for y,expected in ((3,True),(1,False)):
            stud=BRepPrimAPI_MakeBox(gp_Pnt(12,y,3),2.,2.,2.).Shape()
            self.assertEqual(planar_translation_clear(carrier,stud,travel,[],0),expected)
        case.pop("requiredContacts")
        case["initialPose"]={labels[1]:[dict(kind="translation",travelMm=[-18,0,0])]}
        case["moves"][labels[1]]=case["moves"][labels[0]]
        self.assertEqual(evaluate(self.root,m)["cases"][0]["status"],"fail")



if __name__=="__main__":
    unittest.main()
