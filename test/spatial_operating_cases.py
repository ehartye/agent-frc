"""Compare the actual orientation, simultaneous support and nested installed placement."""
import math
import unittest
import numpy as np
from mechanical_fixture import SCRIPTS
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.gp import gp_Pnt


class SpatialOperatingCases(unittest.TestCase):
    def test_observed_parallel_seats_distinguish_impossible_from_unresolved_loads(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from mechanical_fixture import write
        from support_equilibrium import observed_supports
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            archive=write(root,"fixture-native.json",{"synthetic":"source"})
            step=write(root,"fixture-neutral.json",{"synthetic":"export"})
            raw=dict(archiveSha256=archive["sha256"],stepSha256=step["sha256"],origin=[0,0,0],
                     outboard=[3,0,0],offcenter=[1,0,0],down=[0,0,-10],up=[0,0,5],tie=[0,0,-15],
                     side=[1,0,-10],normalCouple=[0,0,1],rollCouple=[1,0,0],zero=[0,0,0],
                     centroid=[0,0,0],area=8,bounds=[-2,-1,0,2,1,0])
            patch=dict(centroid="/centroid",area="/area",bounds="/bounds")
            def case(loads,couples=(),n=1,known=True):
                return dict(normal=[0,0,n],applied=[dict(point="/"+site,force="/"+force) for site,force in loads],
                            couples=["/"+v for v in couples],patches=[patch if known else {k:v for k,v in patch.items() if k!="bounds"}])
            cases={"up":case([("origin","up")]),"opposite seat":case([("origin","up")],n=-1),
                   "held":case([("origin","up"),("origin","tie")]),"side":case([("origin","side")]),
                   "pure roll":case([],["rollCouple"]),"twist":case([("origin","down")],["normalCouple"]),
                   "overturned":case([("outboard","down")]),"unknown extent":case([("outboard","down")],known=False),
                   "inside":case([("offcenter","down")]),"down":case([("origin","down")])}
            spec=dict(archive=archive,step=step,observation=write(root,"data.json",raw),cases=cases)
            rows=observed_supports(root,spec)["cases"]
            for name in ("up","side","pure roll","twist","overturned"):
                self.assertEqual(rows[name]["equilibrium"],"fail",name)
            for name in ("opposite seat","held","down"):
                self.assertEqual(rows[name]["equilibrium"],"pass",name)
            for name in ("inside","unknown extent"):
                self.assertEqual(rows[name]["equilibrium"],"open",name)
            self.assertEqual(rows["up"]["requiredCompressionN"],-5)
            self.assertEqual(rows["overturned"]["normalSupportLimits"]["loaded assembly"]["missingMomentLowerBoundNmm"],10)
            self.assertTrue(all(r["capacity"]=="open" for r in rows.values()))
            raw["bounds"]=[0,0,0,0,0,0]
            spec["observation"]=write(root,"data.json",raw)
            with self.assertRaisesRegex(ValueError,"area exceeds"):
                observed_supports(root,spec)

    def test_rotating_rectangle_exceeds_terminal_region_between_valid_endpoints(self):
        from rigid_article import ArticleMotion
        from mechanical_motion import bounds
        shape=BRepPrimAPI_MakeBox(gp_Pnt(-2,-.5,-.5),4.,1.,1.).Shape()
        frames=[];observations=[]
        for t,deg in ((0,-50),(1,50)):
            a=math.radians(deg);c,s=math.cos(a),math.sin(a)
            p=[c,-s,0,0,s,c,0,0,0,0,1,0,0,0,0,1]
            frames.append(dict(articlePose=p,timeS=t,offsetsMm={"piece":[0,0,0]}))
            observations.append(dict(articlePose=p,angularVelocityRadS=[0,0,math.radians(100)]))
        raw=dict(centerOfMassLocalMm=[0,0,0],observations=observations,pieceId="piece",massKg=.2,massDistribution="uniform")
        m=ArticleMotion(shape,frames,raw)
        region=np.array([-1.8,-3,-1,1.8,3,1])
        self.assertTrue(all(bounds(m.at(0,t))[3]<1.8 for t in (0,1)))
        self.assertFalse(m.terminal(0,region,1e-7,np.zeros(3),np.zeros(3)))
        self.assertTrue(m.terminal(0,np.array([-3,-3,-1,3,3,1]),1e-7,np.zeros(3),np.zeros(3)))
        with self.assertRaisesRegex(ValueError,"fixed model"):ArticleMotion(shape,frames,raw,fixed_evidence=True)
        raw["observations"][0]["angularVelocityRadS"][2]+=2*math.pi
        with self.assertRaisesRegex(ValueError,"Angular observation"):ArticleMotion(shape,frames,raw)

    def test_contact_pressure_witness_and_unbalanced_pure_couple(self):
        from support_equilibrium import bearing_cells,solve
        foot=BRepPrimAPI_MakeBox(gp_Pnt(6,2,2),8.,6.,4.).Shape()
        rest=BRepPrimAPI_MakeBox(gp_Pnt(5,1,1),10.,8.,1.).Shape()
        contacts=[dict(c,**{"from":"foot","to":"seat"}) for c in bearing_cells(foot,rest,[0,0,-1],.15)]
        def case(left,right,moment=0):
            return solve(["foot","seat"],"seat",contacts,[
                dict(body="foot",forceN=[0,0,left],pointMm=[6.2,5,6]),
                dict(body="foot",forceN=[0,0,right],pointMm=[13.8,5,6])],
                [dict(body="foot",momentNmm=[0,0,moment])])
        self.assertEqual(case(-.5,-.5)["status"],"pass")
        bad=case(5,-6)
        self.assertEqual(bad["status"],"fail");limit=bad["normalSupportLimits"]["foot"]
        self.assertAlmostEqual(limit["requiredCenterMm"][0],51.8)
        self.assertAlmostEqual(limit["missingMomentLowerBoundNmm"],37.8)
        self.assertEqual(case(0,0,3)["status"],"fail")
        self.assertEqual(case(6,-6)["status"],"fail")

    def test_purchased_leaf_under_a_correct_wrapper(self):
        from mount_datums import verify
        leaf="aligned wrapper:1+physical insert:1";body="keyed solid"
        sites=[[0,0,0],[2,0,0],[0,2,0]]
        eye=np.eye(4);eye[0,3]=50
        plan=dict(mode="moving",mountDatums=[dict(occurrence=leaf,toleranceMm=.001,basis="Mount drawing",
            features=[dict(solid=body,body=body,localMm=p,worldMm=[p[0]+50,p[1],p[2]]) for p in sites])])
        reg={leaf:{"nativeBodyNames":{body:body}}}
        def run(x,commission=plan):
            m=eye.copy();m[0,3]=x
            verify(commission,reg,[dict(path=leaf,name=body,worldTransform=m.ravel().tolist())],
                {body:BRepPrimAPI_MakeBox(gp_Pnt(x,0,0),2.,2.,2.).Shape()},purchased=[leaf])
        run(50)
        with self.assertRaisesRegex(ValueError,"misses"):run(0)
        with self.assertRaisesRegex(ValueError,"nested instances"):run(50,dict(plan,mountDatums=[]))
