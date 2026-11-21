"""Bound separation of two finite rigid solids through a registered release and its stroke controls."""
import argparse
import json
import math
from itertools import product
from pathlib import Path
import sys
import numpy as np

from component_shape import proper_rotation
from mechanical_readiness import named,number,pinned,project_path,read,require
from mechanical_motion import bounds,common,distance,vec
from release_animation import rotation_vector
from showcase_contacts import load_solids


def rigid(matrix):
    proper_rotation(matrix)
    return np.array(matrix,dtype=float).reshape(4,4)


def position(shape,matrix):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.gp import gp_Trsf
    t=gp_Trsf();t.SetValues(*matrix[:3,:].reshape(-1))
    return BRepBuilderAPI_Transform(shape,t,False).Shape()


def segment(shape,pivot,start,finish):
    a=rigid(start);b=rigid(finish);p=np.array(pivot)
    ca=a[:3,:3]@p+a[:3,3];cb=b[:3,:3]@p+b[:3,3]
    axis=rotation_vector(b[:3,:3]@a[:3,:3].T);angle=float(np.linalg.norm(axis))
    require(angle<math.pi-1e-7,"A half-turn or ambiguous rotation needs intermediate observed poses")
    x,y,z=axis/angle if angle else [0,0,0]
    cross=np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    box=bounds(shape)
    radius=max(math.dist(v,p) for v in product(*zip(box[:3],box[3:])))
    def at(f):
        if f in (0,1):return position(shape,a if not f else b)
        m=np.eye(4);m[:3,:3]=(np.eye(3)+math.sin(angle*f)*cross+(1-math.cos(angle*f))*(cross@cross))@a[:3,:3]
        m[:3,3]=ca+(cb-ca)*f-m[:3,:3]@p
        return position(shape,m)
    return at,float(np.linalg.norm(cb-ca)+angle*radius)


def evaluate(root,study):
    require(study["schema"]=="agent-frc/release-onset@1" and named(study["basis"]),"Identify the observed finite release")
    piece=study["article"];parts,_=load_solids(pinned(root,study["step"]));solids,_=load_solids(pinned(root,piece["file"]))
    require(set(solids)=={piece["solid"]} and named(piece["id"]) and study["donor"] in parts,"Use the whole finite article and exact donor")
    shapes=[solids[piece["solid"]],parts[study["donor"]]]
    pivots=[vec(p) for p in study["pivotsMm"]];require(len(pivots)==2,"Supply each local rotation center in its source coordinates")
    record=read(pinned(root,study["execution"]))
    require(all(record.get(k)==study[k] for k in ("step","article","donor","pivotsMm")) and named(record["basis"]),
            "Rigid observations refer to another source, article or support")
    frames=record["frames"];times=[f["timeS"] for f in frames]
    require(len(frames)>=3 and all(number(t) for t in times) and all(b>a for a,b in zip(times,times[1:])) and study["releaseTimeS"] in times,
            "Supply the measured contact history, first clear time and subsequent clearance window")
    first=times.index(study["releaseTimeS"]);require(0<first<len(frames)-1,"Need both approach and post-release evidence")
    error=study["trajectoryErrorMm"];require(number(error) and error>=0,"Bound combined spatial error between the observed poses")
    rows=[]
    for f in frames:
        solids_at=[position(shape,rigid(f[k])) for shape,k in zip(shapes,("articlePose","donorPose"))]
        gap=distance(*solids_at);v=common(*solids_at) if gap<=1e-7 else 0.
        rows.append(dict(timeS=f["timeS"],gapMm=gap,commonMm3=v))
    require(any(r["gapMm"]<=1e-7 for r in rows[:first]),"No geometric evidence of prior contact at the intended support")
    bounded=[];status="pass"
    for i in range(first,len(frames)):
        load=frames[i]["donorReactionN"]
        require(number(load) and load>=0,"Missing measured donor normal reaction")
        if load>0 or rows[i]["commonMm3"]>0 or rows[i]["gapMm"]<=error:
            status="fail";continue
        if i+1==len(frames):continue
        ops=[segment(s,p,frames[i][k],frames[i+1][k]) for s,p,k in zip(shapes,pivots,("articlePose","donorPose"))]
        speed=sum(v for _,v in ops)
        def inspect(lo,hi,depth):
            t=(lo+hi)/2;a,b=(func(t) for func,_ in ops);g=distance(a,b)
            if g<=1e-7 and common(a,b)>0:return "fail"
            lower=g-speed*(hi-lo)/2-error
            if lower>0:
                bounded.append(lower);return "pass"
            if depth==12:return "open"
            left=inspect(lo,t,depth+1)
            if left!="pass":return left
            return inspect(t,hi,depth+1)
        result=inspect(0,1,0)
        if result=="fail" or status=="pass":status=result
    return dict(status=status,rows=rows,certifiedIntervals=len(bounded),minimumCertifiedGapMm=min(bounded,default=None),
                scope="Specified article and one installed donor under the registered between-observation motion")


def verify_executed(root,transfer,case,trace,raw,observer):
    """Bind each claimed free departure to its parent run and independent observer."""
    starts=[f for i,f in enumerate(trace["frames"]) if f["custody"]=="free" and (not i or trace["frames"][i-1]["custody"]!="free")]
    checks=case.get("releaseOnsets",[])
    require(len(checks)==len(starts),"Every observed free departure needs a finite donor separation replay")
    refs=observer.get("releaseOnsets",[])
    require(len(refs)==len(checks) and set(refs)=={r["sha256"] for r in checks},
            "Independent execution did not register these finite separation checks")
    for ref,start in zip(checks,starts):
        study=read(pinned(root,ref));run=read(pinned(root,study["execution"]))
        require(study["step"]==transfer["step"] and study["article"]==transfer["piece"] and
                study["donor"]==trace["holder"] and study["releaseTimeS"]==start["timeS"] and
                run.get("parentExecutionSha256")==case["execution"]["sha256"],
                "Separation study differs from the observed departure, holder, article or native issue")
        at=next(f for f in run["frames"] if f["timeS"]==start["timeS"])
        for key,body in (("articlePose",trace["pieceId"]),("donorPose",trace["holder"])):
            m=np.eye(4);m[:3,3]=start["offsetsMm"].get(body,[0,0,0])
            observed=start.get("installedTransforms",{}).get(body)
            if observed is not None:m=rigid(observed)
            require(np.allclose(rigid(at[key]),m,atol=1e-7,rtol=0),
                    "Measured departure position or orientation does not match parent execution")
        result=evaluate(root,study)
        require(result["status"]=="pass","Occupied, unconverged or returning donor at the claimed release")


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("root",type=Path);p.add_argument("study");a=p.parse_args()
    try:
        root=a.root.resolve();result=evaluate(root,read(project_path(root,a.study)))
        print(json.dumps(result,indent=2,allow_nan=False));sys.exit(int(result["status"]!="pass"))
    except (ValueError,TypeError,KeyError,OSError,RuntimeError) as e:sys.exit(str(e))
