"""Bind installed body movement to cold native joint coordinates and retained hardware."""
import hashlib
from pathlib import Path

import numpy as np

from mechanical_readiness import number,pinned,read,require


def joint_key(row):
    return row["type"],row["occurrence"],row["name"]


def relative_errors(base_a,base_b,current_a,current_b):
    first=np.linalg.inv(base_a)@base_b
    now=np.linalg.inv(current_a)@current_b
    angle=np.linalg.norm(first[:3,:3]-now[:3,:3],ord=2)/2
    return float(np.linalg.norm(first[:3,3]-now[:3,3])),float(np.degrees(2*np.arcsin(np.clip(angle,0,1))))


def native_model(root,study):
    reopen=read(pinned(root,study["reopen"]))
    labels={(row["path"],name):solid for row in reopen["installedOccurrences"] for solid,name in row["nativeBodyNames"].items()}
    owners={s:occ for (occ,_),s in labels.items()}
    def matrices(record):
        result={labels[r["path"],r["name"]]:np.array(r["worldTransform"]).reshape(4,4) for r in record["bodies"]}
        require(set(result)==set(owners),"Native pose does not cover all installed bodies")
        return result
    cold=matrices(read(pinned(root,study["nativeCensus"])))
    groups=set(reopen["movingGroups"])
    if not groups:
        for ref in study.get("nativePoses",[]):
            pose=matrices(read(pinned(root,ref)))
            require(all(np.allclose(pose[s],cold[s],rtol=0,atol=1e-6) for s in cold),
                    "A declared fixed assembly changes measured native pose")
        return dict(cold=cold,groups={},poses={"saved":cold},sliders={})
    raw=read(pinned(root,study.get("jointAuthority")))
    require(raw.get("schema")=="agent-frc/fusion-joint-authority@1" and raw.get("archiveSha256")==study["archive"]["sha256"]
            and raw.get("stepSha256")==study["step"]["sha256"],"Joint ownership and limits must come from this exact Fusion source")
    # Native hosts can append their platform newline to a source file already ending in LF.
    source=Path(__file__).with_name("fusion_joint_authority.py").read_bytes().rstrip(b"\r\n")
    variants=(tail for tail in (b"",b"\n",b"\r\n",b"\n\n",b"\n\r\n",b"\r\n\r\n"))
    require(raw["collectorSha256"] in {hashlib.sha256(source+s).hexdigest() for s in variants},"Unrecognized joint collector")
    joints={joint_key(j):j for j in raw["joints"]}
    require(len(joints)==len(raw["joints"]),"Ambiguous native joint identity")
    real={};poses={"saved":cold};calibrations={}
    for ref in study["nativePoses"]:
        row=read(pinned(root,ref));pid=row["pose"]["id"];pose=matrices(row);poses[pid]=pose
        coords=row["pose"]["joints"]
        for reg in coords:
            key=joint_key(reg);joint=joints.get(key)
            require(joint is not None and reg["coordinate"] in joint["coordinates"],"Unrecognized inspected native joint")
            group=reg["group"];axis=joint["coordinates"][reg["coordinate"]];value=reg["nativeValue"]
            require(group in groups and (group not in real or real[group][:2]==(key,reg["coordinate"])) and number(value),
                    "A joint group must identify a unique actual native degree of freedom")
            for bound,sign in (("minimum",1),("maximum",-1)):
                limit=axis.get(bound);require(limit is None or sign*(value-limit)>=-1e-8,"Inspected pose exceeds native joint limits")
            real[group]=(key,reg["coordinate"],axis,joint["members"])
            if len(coords)==1 and abs(value-axis["saved"])>1e-8:
                calibrations.setdefault(group,[]).append((value,pose))
    require(set(real)==groups,"No native calibration for a declared moving group")
    require(len(set((r[0],r[1]) for r in real.values()))==len(real),"Two groups register the same joint coordinate")
    require({(key,c) for key,j in joints.items() for c in j["coordinates"]}=={(r[0],r[1]) for r in real.values()},
            "Native joint coordinates disappeared from the engineering register")
    sliders={}
    for group,(_,coord,axis,_) in real.items():
        require(group in calibrations,"Qualify each native coordinate with an isolated nonzero measured pose")
        if coord!="slideValue":continue
        direction=None;values=[axis["saved"]]
        for val,pose in calibrations[group]:
            observed={}
            for s in cold:
                delta=pose[s]@np.linalg.inv(cold[s])
                require(np.allclose(delta[:3,:3],np.eye(3),atol=1e-7,rtol=0),"Prismatic calibration includes an unqualified rotation")
                observed[s]=delta[:3,3]/(val-axis["saved"])
            require(any(abs(np.linalg.norm(d)-10)<1e-5 for d in observed.values()) and
                    all(min(np.linalg.norm(d),abs(np.linalg.norm(d)-10))<1e-5 for d in observed.values()),
                    "Native slider must move its installed members by the measured centimeter travel")
            if direction is not None:
                require(all(np.allclose(observed[s],direction[s],atol=1e-6,rtol=0) for s in observed),"Inconsistent native slider calibration")
            direction=observed;values.append(val)
        sliders[group]=dict(vectors=direction,limits=[min(values),max(values)])
    # Multiple prismatic coordinates may share members. A combination which
    # changes the response cannot be reconstructed as a linear serial chain.
    for ref in study["nativePoses"]:
        observed=read(pinned(root,ref));pose=observed["pose"];coord={j["group"]:j["nativeValue"] for j in pose["joints"]}
        if not coord or any(k not in sliders for k in coord):continue
        measured=poses[pose["id"]]
        for s in owners:
            offset=sum((sliders[g]["vectors"][s]*(v-real[g][2]["saved"]) for g,v in coord.items()),np.zeros(3))
            idx=measured[s]@np.linalg.inv(cold[s])
            require(np.allclose(idx[:3,:3],np.eye(3),atol=1e-7,rtol=0) and np.allclose(idx[:3,3],offset,atol=1e-5,rtol=0),
                    "Combined prismatic calibration contradicts the measured native body pose")
    for edge in study["connections"]:
        a,b=edge["pair"];group=edge.get("jointGroup")
        if group:
            require(group in real and set(real[group][3])=={owners[a],owners[b]},
                    "An articulating attachment must match both actual joint occurrences")
        else:
            # Mounting origins can be far apart. The complete relative transform,
            # including orientation, must persist, not just their mutual distance.
            for pid,pose in poses.items():
                delta,angle=relative_errors(cold[a],cold[b],pose[a],pose[b])
                require(delta<=1e-5 and angle<=1e-5,
                    f"Rigid attachment {a} / {b} changed by {delta:.6g} mm and {angle:.6g} degrees at {pid}")
    return dict(cold=cold,groups=real,poses=poses,sliders=sliders)


def check_trace(model,frames):
    cold=model["cold"];groups=model["groups"];sliders=model["sliders"]
    for frame in frames:
        supplied=frame.get("nativeCoordinates",{})
        require(isinstance(supplied,dict) and set(supplied)<=set(groups),"Unregistered native joint in loaded trace")
        expected={s:np.zeros(3) for s in cold}
        for group,(_,coord,axis,_) in groups.items():
            value=supplied.get(group,axis["saved"]);require(number(value),"Nonfinite native coordinate")
            if coord!="slideValue":
                require(abs(value-axis["saved"])<1e-9,"A rotating installed body requires an orientation-aware loaded trajectory solver")
                continue
            slide=sliders[group];lo,hi=slide["limits"]
            require(lo-1e-9<=value<=hi+1e-9,"Loaded trace exceeds the calibrated native travel")
            for s,d in slide["vectors"].items():expected[s]+=d*(value-axis["saved"])
        for s,start in expected.items():
            actual=frame["offsetsMm"].get(s,[0,0,0])
            require(np.allclose(start,actual,atol=1e-6,rtol=0),
                    f"Installed motion of {s} differs from native hardware at {frame['timeS']} s")


def inspect_mounts(root,study):
    require(study.get("schema")=="agent-frc/rigid-mounts@1","Unknown rigid-mount study")
    base=read(pinned(root,study["saved"]))
    def bodies(row):
        require(row.get("schema")=="agent-frc/fusion-body-census@1" and row["archiveSha256"]==base["archiveSha256"] and
                row["contacts"].get("complete") is True,"Pose belongs to another archive or incomplete native inspection")
        items={(b["path"],b["name"]):np.array(b["worldTransform"]).reshape(4,4) for b in row["bodies"]}
        require(len(items)==len(row["bodies"]),"Ambiguous body identity")
        return items
    initial=bodies(base);rows=[]
    for ref in study["poses"]:
        record=read(pinned(root,ref));current=bodies(record)
        require(set(initial)==set(current),"Installed body inventory changed across poses")
        for mount in study["mounts"]:
            host,member=(tuple(mount[k]) for k in ("host","member"))
            delta,angle=relative_errors(initial[host],initial[member],current[host],current[member])
            rows.append(dict(pose=record["pose"]["id"],mount=mount["id"],host=list(host),member=list(member),
                displacementMm=delta,rotationDeg=angle,status="pass" if delta<=1e-5 and angle<=1e-5 else "fail"))
    require(rows,"Supply a named rigid mount and at least one alternate pose")
    return dict(schema="agent-frc/rigid-mount-result@1",archiveSha256=base["archiveSha256"],
                status="pass" if all(r["status"]=="pass" for r in rows) else "fail",cases=rows)


if __name__=="__main__":
    import argparse,json
    from mechanical_readiness import project_path
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("project",type=Path);p.add_argument("study")
    args=p.parse_args();root=args.project.resolve()
    result=inspect_mounts(root,read(project_path(root,args.study)))
    print(json.dumps(result,indent=2,allow_nan=False))
    raise SystemExit(int(result["status"]!="pass"))
