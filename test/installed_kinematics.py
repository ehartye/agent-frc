"""Installed hardware, stock and smooth geometry during independent issue review."""
from pathlib import Path
from tempfile import TemporaryDirectory
import math
import unittest
import numpy as np
from mechanical_fixture import fixture,write


class InstalledKinematics(unittest.TestCase):
    def test_native_installed_carriage_and_admitted_piece(self):
        from assembly_kinematics import native_model,check_trace
        with TemporaryDirectory() as tmp:
            root=Path(tmp);study=fixture(root)
            m=native_model(root,study)
            moving=next(s for s,d in m["sliders"]["slide"]["vectors"].items() if abs(d[0])>1)
            def f(t,x,q):
                return dict(timeS=t,nativeCoordinates={"slide":q},offsetsMm={moving:[x,0,0],"admitted":[30,0,4]})
            check_trace(m,[f(0,0,0),f(.15,3,.3),f(.5,10,1)])
            m["operatingRanges"]["slide"]=[2,6]
            check_trace(m,[f(0,2,.2),f(.5,6,.6)])
            for outside in [f(0,1,.1),f(1,7,.7)]:
                with self.assertRaisesRegex(ValueError,"selected operating interval"):
                    check_trace(m,[outside])
            m["operatingRanges"]["slide"]=[0,10]
            for row in (f(0,30,0),f(.15,0,.3),f(.5,14,1.4)):
                with self.subTest(frame=row),self.assertRaises(ValueError):check_trace(m,[row])
            stationary=dict(cold=m["cold"],groups={},sliders={})
            with self.assertRaisesRegex(ValueError,"differs from native"):check_trace(stationary,[dict(timeS=0,offsetsMm={moving:[30,0,0]})])
            check_trace(stationary,[dict(timeS=0,offsetsMm={"admitted":[30,0,4]})])
            # A mounted fastener cannot be reassigned as another independent actuator.
            study["connections"][0].pop("jointGroup")
            with self.assertRaisesRegex(ValueError,"Rigid attachment"):native_model(root,study)

    def test_source_roster_precedes_fixed_worksheet(self):
        import copy, json
        from assembly_kinematics import native_model
        with TemporaryDirectory() as tmp:
            root=Path(tmp); study=fixture(root)
            raw=json.loads((root/study["jointAuthority"]["file"]).read_bytes())
            expected=json.loads((root/study["operatingRequirements"]["file"]).read_bytes())
            reopen=json.loads((root/study["reopen"]["file"]).read_bytes())
            fixed=copy.deepcopy(study);fixed["nativePoses"]=[]
            fixed["reopen"]=write(root,"fixed.json",dict(reopen,movingGroups=[],motionRanges={}))
            with self.assertRaisesRegex(ValueError,"Intended operating"):native_model(root,fixed)
            plan=copy.deepcopy(expected)
            plan["operatingIntent"].update(mode="fixed",nativeCoordinates={},motionRanges={})
            fixed["operatingRequirements"]={**write(root,"fixed-plan.json",plan),"pointer":"/operatingIntent"}
            with self.assertRaisesRegex(ValueError,"active native degrees"):native_model(root,fixed)
            omitted=copy.deepcopy(raw);omitted["joints"]=[]
            fixed["jointAuthority"]=write(root,"omitted.json",omitted)
            with self.assertRaisesRegex(ValueError,"component constraints"):native_model(root,fixed)
            omitted["localCounts"]["@root"]["joint"]=0
            fixed["jointAuthority"]=write(root,"loose.json",omitted)
            with self.assertRaisesRegex(ValueError,"lack a native constraint path"):native_model(root,fixed)
            rigid=copy.deepcopy(raw)
            rigid["joints"][0].update(motionType="RigidJointMotion",coordinates={})
            fixed["jointAuthority"]=write(root,"rigid.json",rigid)
            self.assertEqual(native_model(root,fixed)["groups"],{})
            study["jointAuthority"]=fixed["jointAuthority"]
            with self.assertRaisesRegex(ValueError,"active native degrees"):native_model(root,study)
            for state in ("locked","suppressed"):
                frozen=copy.deepcopy(raw);frozen["joints"][0][state]=True
                study["jointAuthority"]=write(root,"freeze.json",frozen)
                with self.subTest(state=state),self.assertRaises(ValueError):native_model(root,study)
            warning=copy.deepcopy(raw);warning["joints"][0]["health"]="warning"
            study["jointAuthority"]=write(root,"warning.json",warning)
            with self.assertRaisesRegex(ValueError,"solver health"):native_model(root,study)
            second=copy.deepcopy(raw)
            second["joints"].append(dict(second["joints"][0],name="Concealed axis"))
            second["localCounts"]["@root"]["joint"]+=1
            study["jointAuthority"]=write(root,"second.json",second)
            with self.assertRaisesRegex(ValueError,"active native degrees"):native_model(root,study)
            study.pop("jointAuthority")
            with self.assertRaises((KeyError,TypeError,ValueError)):native_model(root,study)

    def test_operating_plan_is_read_from_the_project_with_no_external_copy(self):
        import json,os
        from unittest.mock import patch
        from source_joint_roster import intended
        with TemporaryDirectory() as t:
            root=Path(t);study=fixture(root);ref=study["operatingRequirements"]
            reopen=json.loads((root/study["reopen"]["file"]).read_bytes())
            with patch.dict(os.environ,{k:v for k,v in os.environ.items() if not k.startswith("FRC_OPERATING_")},clear=True):
                intended(root,study,reopen)
                study["operatingRequirements"]=dict(ref,pointer="/anotherDuty")
                with self.assertRaises(KeyError):intended(root,study,reopen)
                study["operatingRequirements"]=ref
                with self.assertRaisesRegex(ValueError,"commissioning scope"):
                    intended(root,study,dict(reopen,transferMissions=["transfer"]))
                (root/ref["file"]).write_text("{}")
                with self.assertRaisesRegex(ValueError,"Changed evidence"):intended(root,study,reopen)

    def test_subassembly_filter_preserves_unresolved_and_crossing_pairs(self):
        from native_pair_scope import summarize
        with TemporaryDirectory() as t:
            root=Path(t)
            members=[dict(path=p,name="pad") for p in ("base","guide","carriage","cap")]
            raw=dict(schema="agent-frc/fusion-body-census@1",archiveSha256="a"*64,pose={"id":"saved"},bodies=members,
                contacts=dict(complete=True,candidatePairs=3,pairs=[
                    dict(pair=[0,1],interferenceMm3=None,temporaryCommonMm3=.02),
                    dict(pair=[1,2],interferenceMm3=0,temporaryCommonMm3=0),
                    dict(pair=[2,3],interferenceMm3=.1,temporaryCommonMm3=.1)]))
            scope=dict(census=write(root,"census.json",raw),members=[["base","pad"],["guide","pad"]],thresholdMm3=.01)
            groups=summarize(root,scope)["groups"]
            self.assertEqual([groups[k]["tested"] for k in ("inside","crossing","outside")],[1,1,1])
            self.assertEqual(len(groups["inside"]["unresolved"]),1)
            self.assertEqual(len(groups["inside"]["aboveThreshold"]),1)
            self.assertEqual(len(groups["outside"]["aboveThreshold"]),1)
            with self.assertRaisesRegex(ValueError,"Unknown or ambiguous"):
                summarize(root,dict(scope,members=[["base","other"]]))

    def test_mixed_supplier_bodies_and_mass(self):
        from fusion_body_materials import verify_expected,stock_results,compare_reissue
        occ=dict(path="collar",nativeBodyNames={"one":"shell","two":"liner"},sourceSolids={"one":"solid-A","two":"solid-B"})
        def material(name,density):
            return dict(grade=name,basis="Original two-stock specification",fusionMaterial=name,materialIds=[name],densityKgM3=[density-3,density+3])
        specs={"solid-A":material("Test metal",7800),"solid-B":material("Test liner",1100)}
        raw=dict(schema="agent-frc/fusion-body-materials@1",archiveSha256="a"*64,bodies=[
            dict(path="collar",name=n,materialName=m,materialId=m,volumeCm3=1,massKg=d/1e6) for n,m,d in
            (("shell","Test metal",7800),("liner","Test liner",1100))])
        self.assertEqual(stock_results(verify_expected(specs,raw,occ)),[])
        with TemporaryDirectory() as tmp:
            root=Path(tmp);previous=write(root,"previous.json",raw)
            raw["bodies"][1].update(materialName="Test metal",materialId="Test metal",massKg=.0078)
            raw["archiveSha256"]="b"*64
            with self.assertRaisesRegex(ValueError,"material"):verify_expected(specs,raw,occ)
            current=write(root,"current.json",raw)
            result=compare_reissue(root,dict(schema="agent-frc/material-reissue@1",current=current,previous=previous,volumeToleranceMm3=.01))
            self.assertEqual([r["name"] for r in result["changes"]],["liner"])
        raw["bodies"][1].update(materialName="Test liner",materialId="Test liner")
        self.assertIn("density",stock_results(verify_expected(specs,raw,occ))[0])

    def test_three_noncollinear_smooth_face_sites_in_occurrence_context(self):
        from fusion_issue_inventory import placement_witness
        from types import SimpleNamespace as S
        class Point:
            def __init__(self,coords):self.v=np.array(coords,dtype=float)
            def asArray(self):return self.v.tolist()
            def copy(self):return Point(self.v)
            def transformBy(self,transform):self.v=transform[:3,:3]@self.v+transform[:3,3]
            def distanceTo(self,b):return np.linalg.norm(self.v-b.v)
        class Face:
            def __init__(self,transform=None):
                self.evaluator=self;self.matrix=transform;self.pointOnFace=Point([1,0,0])
                self.parametricRange=lambda:S(minPoint=S(x=0,y=-1),maxPoint=S(x=2*math.pi,y=1))
            def getParameterAtPoint(self,p):return True,S(x=0,y=0)
            def isParameterOnFace(self,p):return True
            def getPointAtParameter(self,p):
                v=Point([math.cos(p.y)*math.cos(p.x),math.cos(p.y)*math.sin(p.x),math.sin(p.y)])
                if self.matrix is not None:v.transformBy(self.matrix)
                return True,v
            def createForAssemblyContext(self,occ):return Face(actual)
        actual=np.eye(4);actual[:2,:2]=[[0,-1],[1,0]];actual[:3,3]=[3,2,1]
        body=S(vertices=S(count=0),faces=[Face()]);uv=S(create=lambda x,y:S(x=x,y=y))
        error,points=placement_witness(body,S(transform2=actual),uv)
        self.assertEqual(len(points),3);self.assertLess(error,1e-8)
        wrong=np.eye(4);wrong[:3,3]=actual[:3,3]
        with self.assertRaisesRegex(ValueError,"placement"):placement_witness(body,S(transform2=wrong),uv)


    def test_null_native_pair_keeps_other_kernel_and_neighbors_then_retries_only_pair(self):
        from types import SimpleNamespace as S
        import sys
        from unittest.mock import patch
        from fusion_issue_contacts import measure
        class Entities(list):
            def add(self,item):self.append(item)
        class Manager:
            def copy(self,body):return S(isValid=True,lumps=S(count=1),volume=.002)
            def booleanOperation(self,*args):return True
        api=S(core=S(ObjectCollection=S(create=Entities)),fusion=S(TemporaryBRepManager=S(get=Manager),
            BooleanTypes=S(IntersectionBooleanType=0)))
        calls=[]
        class Design:
            isValid = True
            def createInterferenceInput(self,items):return S(pair=tuple(items))
            def analyzeInterference(self,query):
                calls.append(query.pair)
                if query.pair==(0,1) and calls.count((0,1))==1:return None
                return []
        rows=[dict(path=str(i),name="part",boundsMm=[0,0,0,1,1,1],worldTransform=np.eye(4).reshape(16).tolist()) for i in range(3)]
        args=(Design(),rows,list(range(3)),[(None,None)]*3)
        with TemporaryDirectory() as tmp,patch.dict(sys.modules,{"adsk":api,"adsk.core":api.core,"adsk.fusion":api.fusion}):
            import fusion_issue_contacts
            import hashlib
            import json
            collector = hashlib.sha256(Path(fusion_issue_contacts.__file__).read_bytes()).hexdigest()
            p=Path(tmp)/"progress.json";fingerprint=["archive","saved","app","inventory",collector]
            result=measure(*args,p,fingerprint,6)
            self.assertTrue(result["complete"]);self.assertEqual(result["unresolvedPairs"],1)
            self.assertEqual(result["pairs"][0]["temporaryCommonMm3"],2)
            self.assertIsNone(result["pairs"][0]["interferenceMm3"])
            self.assertEqual(len(calls),3)
            fixed=measure(*args,p,fingerprint,1,[(0,1)])
            self.assertEqual(fixed["unresolvedPairs"],0);self.assertEqual(len(calls),4)
            with self.assertRaisesRegex(ValueError,"another archive"):
                measure(*args,p,["other",*fingerprint[1:]],1,[(0,1)])

            # A kernel error can surface while obtaining the next temporary manager.
            from unittest.mock import Mock
            api.fusion.TemporaryBRepManager.get = Mock(side_effect=[
                Manager(), RuntimeError("latent Boolean error"), Manager()])
            calls.clear()
            partial_path = Path(tmp)/"partial.json"
            partial = measure(*args, partial_path, fingerprint, 2)
            self.assertEqual((partial["completedPairs"], partial["unresolvedPairs"], partial["unexaminedPairs"]), (2, 2, 1))
            failed = partial["pairs"][1]
            self.assertEqual(failed["identities"], [["0", "part"], ["2", "part"]])
            self.assertEqual(failed["interferenceMm3"], 0.)
            self.assertIsNone(failed["temporaryCommonMm3"])
            self.assertEqual(failed["errors"]["temporaryCommonMm3"]["message"], "latent Boolean error")
            before_stop = list(calls)
            args[0].isValid = False
            stopped = measure(*args, partial_path, fingerprint, 2)
            self.assertFalse(stopped["complete"])
            self.assertEqual(stopped["unexaminedPairs"], 1)
            self.assertEqual(stopped["stop"]["pair"], [1, 2])
            self.assertEqual(stopped["pairs"], partial["pairs"])
            self.assertEqual(calls, before_stop)
            args[0].isValid = True
            resumed = measure(*args, partial_path, fingerprint, 2)
            self.assertTrue(resumed["complete"])
            self.assertEqual((resumed["unexaminedPairs"], resumed["unresolvedPairs"]), (0, 2))
            self.assertEqual(resumed["pairs"][:2], partial["pairs"])
            self.assertEqual(resumed["pairs"][2]["status"], "measured")
            self.assertEqual(calls[len(before_stop):], [(1, 2)])
            api.fusion.TemporaryBRepManager.get = Manager
            calls.clear()

            legacy_sha = "9a570e82486dbcf077d961a143cf6808666255dda1d17a0ac1a9b9bec0112dfe"
            roster = [[r["path"], r["name"], r["boundsMm"], r["worldTransform"]] for r in rows]
            pairs = [(0, 1), (0, 2), (1, 2)]
            legacy_inputs = [[*fingerprint[:4], legacy_sha], pairs, roster]
            legacy = json.loads(p.read_bytes())
            legacy["study"] = hashlib.sha256(json.dumps(legacy_inputs, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            legacy["pairs"] = [dict(pair=pair, interferenceMm3=0, temporaryCommonMm3=0) for pair in pairs]
            original_bytes = json.dumps(legacy).encode()
            p.write_bytes(original_bytes)
            with self.assertRaisesRegex(ValueError, "new checkpoint"):
                measure(*args, p, fingerprint, 1)
            self.assertEqual(p.read_bytes(), original_bytes)
            new = measure(*args, Path(tmp)/"current.json", fingerprint, 1)
            self.assertFalse(new["complete"])
            self.assertEqual(new["pairs"][0]["temporaryCommonMm3"], 2.)
            self.assertEqual(len(calls), 1)

    def test_native_boolean_zero_with_retained_lumps_is_unresolved(self):
        import sys
        from types import SimpleNamespace as S
        from unittest.mock import patch
        import fusion_issue_contacts as contacts

        def body(lumps, volume):
            return S(isValid=True, lumps=S(count=lumps), volume=volume)

        class Entities(list):
            add = list.append

        good, ambiguous, empty = body(2, .004), body(3, 0.), body(0, 0.)
        manager = S(copy=lambda item: item, booleanOperation=lambda *args: True)
        api = S(core=S(ObjectCollection=S(create=Entities)), fusion=S(
            TemporaryBRepManager=S(get=lambda: manager), BooleanTypes=S(IntersectionBooleanType=0)))
        def design(*bodies):
            return S(isValid=True, createInterferenceInput=lambda _: S(),
                     analyzeInterference=lambda _: [S(interferenceBody=b) for b in bodies])
        rows = [dict(path=name, name="Body") for name in ("Shaft", "Block")]
        with patch.dict(sys.modules, {"adsk": api, "adsk.core": api.core, "adsk.fusion": api.fusion}):
            def pair(native, temporary):
                return contacts.measure_pair(native, rows, [0, 1], [(temporary, None)] * 2, 0, 1)

            for row, key, other in ((pair(design(good, ambiguous), good), "interferenceMm3", "temporaryCommonMm3"),
                                    (pair(design(good), ambiguous), "temporaryCommonMm3", "interferenceMm3")):
                self.assertEqual(row["status"], "unresolved")
                self.assertIsNone(row[key])
                self.assertEqual(row[other], 4.)
                self.assertEqual(row["errors"][key]["rawMm3"], 0.)
                self.assertEqual(row["errors"][key]["lumps"], 3)
            separated = pair(design(), empty)
            self.assertEqual(separated["status"], "measured")
            self.assertEqual([separated["interferenceMm3"], separated["temporaryCommonMm3"]], [0., 0.])
            # Apply the same reader inside a fit partition even if the original common is positive.
            model = S(section=lambda common, region, cylinder, boolean, volume: {"insideCoreMm3": volume(ambiguous)})
            with self.assertRaises(contacts.UnresolvedVolume) as exc:
                contacts.native_spatial(model, {}, manager, [good])
            self.assertEqual(exc.exception.observation, {"lumps": 3, "rawMm3": 0.})
