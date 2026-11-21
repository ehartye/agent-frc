"""An original compound carriage with opposed slides and a phased pinion."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import numpy as np
from mechanical_fixture import write
from mechanical_readiness import digest
from linked_motion import observations, check_frame, geometry_segment


def synthetic(root):
    groups=("travel","near","far","wheel")
    names=["table","carrier","near rail","far rail","wheel"]
    owners={n:n for n in names}
    def rotate(q):
        c=np.cos(q);s=np.sin(q);m=np.eye(4);m[:2,:2]=[[c,-s],[s,c]];return m
    def shift(x,y):
        m=np.eye(4);m[:2,3]=[x,y];return m
    rel=[np.eye(4),np.eye(4),shift(0,1),shift(0,-1),shift(-15,0)@rotate(.37)]
    coord={g:dict(type="asBuilt",occurrence="@root",name=g,coordinate="rotationValue" if g=="wheel" else "slideValue") for g in groups}
    joints=[dict(type="asBuilt",occurrence="@root",name=g,locked=False,suppressed=False,
        members=[names[i+1],names[0 if i==0 else 1]],coordinates={coord[g]["coordinate"]:dict(saved=0,minimum=None,maximum=None)})
        for i,g in enumerate(groups)]
    edges=[dict(occurrence="@root",name=b,joints=[coord["near"],coord[b]],health="healthy",suppressed=False) for b in ("far","wheel")]
    ref=dict(archiveSha256="a"*64,stepSha256="b"*64,joints=joints,rigidGroups=[],
        localCounts={n:{} for n in ["@root",*names]},occurrences=[dict(path=n,parent="@root",groundedToParent=n=="table") for n in names],motionLinks=edges)
    capture=dict(schema="agent-frc/native-link-calibration@1",archiveSha256=ref["archiveSha256"],stepSha256=ref["stepSha256"],
        collectorSha256=digest(Path(__file__).resolve().parents[1]/"scripts/fusion_link_calibration.py"),coordinates=coord,
        links=[dict(one="near",two=b,occurrence="@root",name=b,healthy=True,reversed=b=="far",valueOne=1,valueTwo=1 if b=="far" else 2)
               for b in ("far","wheel")],frames=[])
    for pid,x,y in (("saved",0,0),("calibrate",.1,.1),("full",1,2),("reset",0,0)):
        matrices=[rel[0],shift(x*10,0),shift(x*10,y*10)@rel[2],shift(x*10,-y*10)@rel[3],shift(x*10-15,0)@rotate(.37+2*y)]
        capture["frames"].append(dict(id=pid,commands={} if pid=="saved" else {"travel":x,"near":y},
            values=dict(travel=x,near=y,far=-y,wheel=(2*y+np.pi)%(2*np.pi)-np.pi),
            transforms={**{n:m.flatten().tolist() for n,m in zip(names,matrices)},"@root":np.eye(4).flatten().tolist()}))
    plan=dict(nativeCoordinates=coord,motionLinks={"far":{"driver":"near","nativeRatio":-1},"wheel":{"driver":"near","nativeRatio":2}},
        linkedReferencePoses={n:rel[i].flatten().tolist() for i,n in enumerate(names) if i},
        motionRanges={"travel":[0,10],"near":[0,20],"far":[-20,0],"wheel":[0,225]})
    sites={n:dict(occurrence=n,body="physical stock",localMm=[2.,0,0]) for n in names}
    capture["landmarks"]=sites;plan["landmarks"]=sites
    for f in capture["frames"]:
        f["landmarks"]={n:(np.array(f["transforms"][n]).reshape(4,4)@np.array([2.,0,0,1.]))[:3].tolist() for n in names}
    plan["landmarkTrials"]=[dict(group=g,frame="calibrate",tip=n,anchor="table",toleranceMm=.00001,
        deltaMm=(np.array(capture["frames"][1]["landmarks"][n])-capture["frames"][0]["landmarks"][n]).tolist()) for g,n in zip(groups,names[1:])]
    return owners,ref,capture,plan


class LinkedKinematics(unittest.TestCase):
    def test_linked_phase_member_and_fault_controls(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp);owners,source,capture,plan=synthetic(root)
            def build(raw,intent):
                return observations(root,{"linkCalibration":write(root,"calibration.json",raw)},source,owners,"table",intent)
            linked=build(capture,plan)
            model=dict(linked=linked,groups=plan["nativeCoordinates"],operatingRanges=plan["motionRanges"])
            for x,y in ((0,0),(.3,.5),(1,1.5)):
                q=dict(travel=x,near=y,far=-y,wheel=2*y)
                pred=linked["predict"](q);v=pred["wheel"]@linked["savedTransforms"]["wheel"]
                self.assertTrue(np.allclose(v[:2,3],[x*10-15,0]))
                frame=dict(timeS=0,nativeCoordinates=q,offsetsMm={"carrier":[10*x,0,0],"near rail":[10*x,10*y,0],
                    "far rail":[10*x,-10*y,0],"wheel":[10*x,0,0]},installedTransforms={"wheel":pred["wheel"].flatten().tolist()})
                check_frame(model,frame)
                bad=deepcopy(frame);bad["nativeCoordinates"]["far"]+=.1
                with self.assertRaisesRegex(ValueError,"drift"):check_frame(model,bad)
            start=deepcopy(frame);start["nativeCoordinates"].update(near=0,far=0,wheel=0)
            ops=geometry_segment(model,start,frame)[1]["wheel"]
            self.assertEqual(ops[0]["kind"],"rotation")
            self.assertTrue(np.allclose(ops[0]["originMm"],[-5,0,0]))
            controls=[]
            for kind in ("sign","ratio","phase","left-behind","landmark","reset"):
                c=deepcopy(capture)
                if kind=="sign":c["links"][0]["reversed"]=False
                elif kind=="ratio":c["links"][1]["valueTwo"]=3
                elif kind=="phase":
                    for f in c["frames"]:f["transforms"]["wheel"][3]+=1
                elif kind=="left-behind":c["frames"][2]["transforms"]["near rail"]=c["frames"][0]["transforms"]["near rail"]
                elif kind=="landmark":c["frames"][1]["landmarks"]["wheel"]=c["frames"][0]["landmarks"]["wheel"]
                else:c["frames"].pop()
                controls.append(c)
            for c in controls:
                with self.assertRaises(ValueError):build(c,plan)
