"""Reconcile commissioned mounting features with measured Fusion placement and the issued solid surface."""
import math
import numpy as np
from component_shape import proper_rotation
from mechanical_motion import distance,vec
from mechanical_readiness import named,number,require


def verify(plan,registered,rows,shapes):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCP.TopAbs import TopAbs_SHELL
    from OCP.TopExp import TopExp_Explorer
    from OCP.gp import gp_Pnt
    mounts=plan.get("mountDatums")
    require(isinstance(mounts,list),"Independently register the mounting datums of the saved configuration")
    paths=[m["occurrence"] for m in mounts]
    require(len(set(paths))==len(paths) and set(paths)<=set(registered),"Unknown or duplicate commissioned mounting occurrence")
    if plan["mode"]=="fixed":
        require(set(paths)==set(registered),"Commission the installation of every fixed placed occurrence")
    native={(row["path"],row["name"]):row for row in rows}
    for mount in mounts:
        occurrence=mount["occurrence"];features=mount["features"];tol=mount["toleranceMm"]
        require(number(tol) and tol>=0 and named(mount["basis"]) and len(features)>=3,
                "Supply manufacturing landmarks, world datums and their approved tolerance")
        sites=[]
        for f in features:
            solid=f["solid"];body=registered[occurrence]["nativeBodyNames"].get(solid)
            require(body==f["body"] and (occurrence,body) in native and solid in shapes,
                    "A mounting feature names another placed native solid")
            record=native[(occurrence,body)]
            proper_rotation(record["worldTransform"])
            matrix=np.asarray(record["worldTransform"]).reshape(4,4)
            local=vec(f["localMm"]);target=vec(f["worldMm"]);sites.append(np.array(local))
            actual=matrix[:3,:3]@local+matrix[:3,3]
            require(math.dist(actual,target)<=tol,"Cold mounted feature misses commissioned world datum on "+occurrence)
            point=BRepBuilderAPI_MakeVertex(gp_Pnt(*actual)).Vertex()
            shells=TopExp_Explorer(shapes[solid],TopAbs_SHELL);near=math.inf
            while shells.More():
                near=min(near,distance(point,shells.Current()));shells.Next()
            require(near<=1e-5,"Mount datum is not on the specified original solid surface: "+occurrence)
        a=sites[0];axis=max((v-a for v in sites),key=np.linalg.norm)
        require(np.linalg.norm(axis)>1e-6 and any(np.linalg.norm(np.cross(axis,b-a))/np.linalg.norm(axis)>1e-5 for b in sites),
                "Coincident or collinear landmarks cannot establish the mounting frame")


def observe(root,study):
    """Screen saved physical landmarks when only a partial native inspection is available."""
    from mechanical_readiness import pinned,read,digest
    raw=read(pinned(root,study["observation"]))
    def select(pointer):
        require(pointer.startswith("/"),"Need a JSON pointer into the native readback")
        node=raw
        for k in pointer[1:].split("/"):
            token=k.replace("~1","/").replace("~0","~")
            node=node[int(token)] if isinstance(node,list) else node[token]
        return node
    require(select(study["archivePointer"])==digest(pinned(root,study["archive"])), "Observation belongs to another native archive")
    rows=[]
    for site in study["sites"]:
        matrix=np.array(select(site["matrixPointer"]),dtype=float).reshape(4,4)
        require(site["translationUnit"] in ("cm","mm"),"Unknown native placement units")
        if site["translationUnit"]=="cm":matrix[:3,3]*=10
        proper_rotation(matrix.flatten().tolist())
        local=np.asarray(vec(select(site["localMmPointer"])));measured=vec(select(site["worldMmPointer"]))
        target=vec(site["targetWorldMm"]);tol=site["toleranceMm"]
        require(number(tol) and tol>=0 and named(site["occurrence"]) and named(site["basis"]), "Missing physical site or installation authority")
        projected=matrix[:3,:3]@local+matrix[:3,3]
        err=math.dist(measured,target);registration=math.dist(measured,projected)
        rows.append(dict(occurrence=site["occurrence"],measuredWorldMm=measured,targetWorldMm=target,
                         registrationErrorMm=registration,installationErrorMm=err,withinTolerance=max(err,registration)<=tol))
    require(rows,"No observed mounting features")
    return dict(status="fail" if any(not r["withinTolerance"] for r in rows) else "open",features=rows,
                scope="A partial native observation can reject a mount. Use full three-point controls and source correspondence for qualification.")


if __name__=="__main__":
    import argparse,json,sys
    from pathlib import Path
    from mechanical_readiness import project_path,read
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument("root",type=Path);ap.add_argument("study");args=ap.parse_args()
    try:
        root=args.root.resolve();r=observe(root,read(project_path(root,args.study)));print(json.dumps(r,indent=2))
        sys.exit(int(r["status"]!="pass"))
    except (ValueError,KeyError,TypeError,OSError) as e:sys.exit(str(e))
