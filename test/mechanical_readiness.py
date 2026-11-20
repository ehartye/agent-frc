import shutil
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from mechanical_fixture import fixture, write, SCRIPTS
from mechanical_readiness import review, verify_delivery, digest,scan
from showcase_contacts import measure


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

    def test_changed_pose_assembly_and_raw_evidence(self):
        self.s["installed"]["block"]["transform"][3]=9
        self.assertEqual(self.status()["showcaseEligibility"],"open")
        self.s["installed"]["block"]["transform"][3]=10
        (self.root/"test-raw.json").write_text("{}")
        with self.assertRaisesRegex(ValueError,"Changed evidence"):
            self.status()

    def test_rights_for_native_and_derivatives_are_separate(self):
        p=self.root/"view.png";p.write_bytes(b"test view")
        self.s=fixture(self.root,assets=["view.png"])
        self.s["articles"]["block"]["rights"]="derived-views-only"
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



if __name__=="__main__":
    unittest.main()
