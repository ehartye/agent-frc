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
            for row in (f(0,30,0),f(.15,0,.3),f(.5,14,1.4)):
                with self.subTest(frame=row),self.assertRaises(ValueError):check_trace(m,[row])
            stationary=dict(cold=m["cold"],groups={},sliders={})
            with self.assertRaisesRegex(ValueError,"differs from native"):check_trace(stationary,[dict(timeS=0,offsetsMm={moving:[30,0,0]})])
            check_trace(stationary,[dict(timeS=0,offsetsMm={"admitted":[30,0,4]})])
            # A mounted fastener cannot be reassigned as another independent actuator.
            study["connections"][0].pop("jointGroup")
            with self.assertRaisesRegex(ValueError,"Rigid attachment"):native_model(root,study)

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
            def createInterferenceInput(self,items):return S(pair=tuple(items))
            def analyzeInterference(self,query):
                calls.append(query.pair)
                if query.pair==(0,1) and calls.count((0,1))==1:return None
                return []
        rows=[dict(path=str(i),name="part",boundsMm=[0,0,0,1,1,1],worldTransform=np.eye(4).reshape(16).tolist()) for i in range(3)]
        args=(Design(),rows,list(range(3)),[(None,None)]*3)
        with TemporaryDirectory() as tmp,patch.dict(sys.modules,{"adsk":api,"adsk.core":api.core,"adsk.fusion":api.fusion}):
            p=Path(tmp)/"progress.json";fingerprint=["archive","saved","app","inventory","contacts"]
            result=measure(*args,p,fingerprint,6)
            self.assertTrue(result["complete"]);self.assertEqual(result["unresolvedPairs"],1)
            self.assertEqual(result["pairs"][0]["temporaryCommonMm3"],2)
            self.assertIsNone(result["pairs"][0]["interferenceMm3"])
            self.assertEqual(len(calls),3)
            fixed=measure(*args,p,fingerprint,1,[(0,1)])
            self.assertEqual(fixed["unresolvedPairs"],0);self.assertEqual(len(calls),4)
            with self.assertRaisesRegex(ValueError,"another archive"):
                measure(*args,p,["other",*fingerprint[1:]],1,[(0,1)])
