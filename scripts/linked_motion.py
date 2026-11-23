"""Reconstruct supported slider/revolute trees from driver-only native readbacks and recorded physical poses."""
from math import pi
from pathlib import Path
import numpy as np
from mechanical_readiness import digest, number, pinned, read, require
from source_joint_roster import joint_key
from release_animation import rotation_vector


def matrix(axis, distance):
    vector, origin, angular = axis
    transform = np.eye(4)
    if angular:
        x,y,z = vector
        cross = np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
        rotation = np.eye(3) + np.sin(distance)*cross + (1-np.cos(distance))*(cross@cross)
        transform[:3,:3] = rotation
        transform[:3,3] = origin-rotation@origin
    else:
        transform[:3,3] = vector*distance
    return transform


def observations(root,study,raw,owners,anchor,intent):
    capture=read(pinned(root,study["linkCalibration"]))
    require(capture["schema"]=="agent-frc/native-link-calibration@1" and capture["archiveSha256"]==raw["archiveSha256"] and
            capture["stepSha256"]==raw["stepSha256"] and capture["collectorSha256"]==digest(Path(__file__).with_name("fusion_link_calibration.py")),
            "Missing current driver-only observation from the canonical Fusion configuration")
    coords=capture["coordinates"]
    require(coords==intent["nativeCoordinates"],"Driver observation and commissioning coordinates differ")
    active={joint_key(j):j for j in raw["joints"] if not j["suppressed"] and not j["locked"] and j["coordinates"]}
    joints={g:active[joint_key(c)] for g,c in coords.items()}
    saved={g:j["coordinates"][coords[g]["coordinate"]]["saved"] for g,j in joints.items()}
    angular={g:coords[g]["coordinate"]=="rotationValue" for g in coords}
    links={}
    inventory={(l["occurrence"],l["name"]):l for l in raw["motionLinks"] if not l["suppressed"]}
    for item in capture["links"]:
        key=(item["occurrence"],item["name"]);a,b=item["one"],item["two"]
        require(key in inventory and item["healthy"] and inventory[key]["health"]=="healthy" and
                [joint_key(coords[x]) for x in (a,b)]==[joint_key(x) for x in inventory[key]["joints"]] and
                all(number(item[n]) and item[n]!=0 for n in ("valueOne","valueTwo")) and type(item["reversed"]) is bool and b not in links,
                "Unresolved, duplicated or mismatched native coupling")
        ratio=item["valueTwo"]/item["valueOne"]*(-1 if item["reversed"] else 1)
        links[b]=(a,ratio)
    expected=intent.get("motionLinks",{})
    require(len(capture["links"])==len(inventory)==len(links) and set(expected)==set(links) and all(
        expected[b]["driver"]==a and number(expected[b]["nativeRatio"]) and np.isclose(expected[b]["nativeRatio"],r,rtol=1e-9,atol=1e-10)
        for b,(a,r) in links.items()),"Installed native link ratio, sign or membership differs from the commissioned coupling")
    drivers=set(coords)-set(links)
    def resolve(values):
        result=dict(values)
        remaining=dict(links)
        while remaining:
            candidates=[b for b,(a,_) in remaining.items() if a in result]
            require(candidates,"Cyclic or incomplete linked-coordinate driver set")
            for b in candidates:
                a,ratio=remaining.pop(b)
                result[b]=saved[b]+(result[a]-saved[a])*ratio
        return result
    frames=capture["frames"]
    require(frames[0]["id"]=="saved" and not frames[0]["commands"] and len({f["id"] for f in frames})==len(frames),
            "Start at the uncommanded saved native assembly and identify every observation")
    nodes=set(raw["localCounts"])
    transforms=[];states=[]
    controls={g:saved[g] for g in drivers}
    for f in frames:
        require(set(f["commands"])<=drivers and set(f["values"])==set(coords) and set(f["transforms"])==nodes,"Incomplete rooted linked observation")
        controls.update(f["commands"]); q=resolve(controls)
        for g,value in q.items():
            measured=f["values"][g]
            error=(measured-value+pi)%(2*pi)-pi if angular[g] else measured-value
            require(number(value) and number(measured) and abs(error)<1e-6,"Attained linked coordinate disagrees with native ratio or driver at "+f["id"]+" / "+g)
            axis=joints[g]["coordinates"][coords[g]["coordinate"]]
            require((axis["minimum"] is None or value>=axis["minimum"]-1e-7) and
                    (axis["maximum"] is None or value<=axis["maximum"]+1e-7),"Coupled motion exceeds native mechanical limits")
        transforms.append({n:np.array(m).reshape(4,4) for n,m in f["transforms"].items()})
        states.append(q)
    saved_t=transforms[0]
    require(all(abs(states[-1][g]-saved[g])<1e-7 for g in coords) and
            all(np.allclose(transforms[-1][n],saved_t[n],rtol=0,atol=1e-5) for n in nodes),"Linked hardware did not return to its saved pose")
    expected_members=set(m for g in set(links)|{a for a,_ in links.values()} for m in joints[g]["members"])
    require(expected_members<=set(intent.get("linkedReferencePoses",{}))<=nodes and all(
        np.allclose(saved_t[n],np.asarray(m).reshape(4,4),rtol=0,atol=1e-5) for n,m in intent.get("linkedReferencePoses",{}).items()),
        "Mechanical phase or mounting position differs from the approved reference")
    axes={}
    for g,joint in joints.items():
        child,parent=joint["members"]
        r0=np.linalg.inv(saved_t[parent])@saved_t[child]
        for q,t in zip(states[1:],transforms[1:]):
            change=q[g]-saved[g]
            if abs(change)<1e-6 or angular[g] and abs(change)>=pi-.02:continue
            local=np.linalg.inv(t[parent])@t[child]@np.linalg.inv(r0)
            delta=saved_t[parent]@local@np.linalg.inv(saved_t[parent])
            if angular[g]:
                v=rotation_vector(delta[:3,:3])/change
                pivot=np.linalg.lstsq(np.eye(3)-delta[:3,:3],delta[:3,3],rcond=1e-8)[0]
                require(abs(np.linalg.norm(v)-1)<1e-5,"Native revolute member differs from measured joint angle")
            else:
                v=delta[:3,3]/change;pivot=np.zeros(3)
                require(abs(np.linalg.norm(v)-10)<1e-5,"Native slider member differs from measured travel")
            axes[g]=(v,pivot,angular[g])
            break
        require(g in axes,"Capture a short nonzero motion for "+g)
    # Merge genuine rigid constraints before traversing the articulated tree.
    parents={n:n for n in nodes}
    def representative(n):
        while parents[n]!=n:
            parents[n]=parents[parents[n]];n=parents[n]
        return n
    def connect(a,b):parents[representative(a)]=representative(b)
    for occ in raw["occurrences"]:
        if occ["groundedToParent"]:connect(occ["path"],occ["parent"])
    for joint in raw["joints"]:
        if not joint["suppressed"] and (joint["locked"] or not joint["coordinates"]):connect(*joint["members"])
    for group in raw["rigidGroups"]:
        if not group["suppressed"]:
            for member in group["members"][1:]:connect(group["members"][0],member)
    graph={}
    for g,joint in joints.items():
        child,parent=map(representative,joint["members"])
        graph.setdefault(parent,[]).append((child,g,1))
        graph.setdefault(child,[]).append((parent,g,-1))
    paths={representative(owners[anchor]):[]}
    todo=list(paths)
    while todo:
        n=todo.pop()
        for other,g,sign in graph.get(n,[]):
            if paths[n] and paths[n][-1][0]==g:continue
            require(other not in paths,"Supported linked kinematics requires a resolvable joint tree")
            paths[other]=[*paths[n],(g,sign)];todo.append(other)
    body_paths={n:paths[representative(n)] for n in nodes if representative(n) in paths}
    require(set(owners.values())<=body_paths.keys(),"Installed member has no verified linked path")
    def predict(q):
        return {n:pose_for(path,axes,q,saved) for n,path in body_paths.items()}
    for state,t in zip(states,transforms):
        forecast=predict(state)
        for n,d in forecast.items():
            require(np.allclose(d@saved_t[n],t[n],rtol=0,atol=2e-5),"Installed linked member drifted, including phase or mounting transform: "+n)
    landmarks=capture["landmarks"]
    require(landmarks and landmarks==intent["landmarks"],"Expected independent solid-vertex landmarks at the exact installed parts")
    expected_trials=intent["landmarkTrials"]
    require({t["group"] for t in expected_trials}==set(coords),"Check a physical off-axis or translating landmark for every operating coordinate")
    for i,f in enumerate(frames):
        require(set(f["landmarks"])==set(landmarks),"Missing native assembly-context landmark readback")
        for n,site in landmarks.items():
            original=np.append(site["localMm"],1)
            expected=(transforms[i][site["occurrence"]]@original)[:3]
            require(np.allclose(expected,f["landmarks"][n],rtol=0,atol=2e-5),"Physical vertex differs from occurrence transform at "+n)
    by_frame={f["id"]:f for f in frames}
    for trial in expected_trials:
        f=by_frame[trial["frame"]];tip,anchor=trial["tip"],trial["anchor"];g=trial["group"]
        require(tip!=anchor and g in {j for j,_ in body_paths[landmarks[tip]["occurrence"]]} and
                not body_paths[landmarks[anchor]["occurrence"]],"Register a moving solid and independently fixed anchor")
        delta=np.asarray(f["landmarks"][tip])-frames[0]["landmarks"][tip]
        anchor_d=np.asarray(f["landmarks"][anchor])-frames[0]["landmarks"][anchor]
        tolerance=trial["toleranceMm"];expected=np.asarray(trial["deltaMm"])
        group_steps=states[next(i for i,row in enumerate(frames) if row["id"]==trial["frame"])][g]-saved[g]
        rest_site=np.append(frames[0]["landmarks"][tip],1)
        own_motion=(matrix(axes[g],group_steps)@rest_site-rest_site)[:3]
        require(number(tolerance) and 0<tolerance<np.linalg.norm(expected)/2 and np.linalg.norm(own_motion)>tolerance and
                np.linalg.norm(anchor_d)<=tolerance and np.linalg.norm(delta-anchor_d-expected)<=tolerance,
                "Source landmark did not move the signed distance relative to its fixed anchor: "+tip)
    for g in coords:
        scale=180/pi if angular[g] else 10
        lo,hi=intent["motionRanges"][g]
        require(number(lo) and number(hi) and lo<hi and min(q[g] for q in states)*scale<=lo+1e-6 and
                max(q[g] for q in states)*scale>=hi-1e-6,"Native observations do not bracket the selected coupled duty")
    return dict(resolve=resolve,drivers=drivers,axes=axes,saved=saved,owners=owners,paths=body_paths,predict=predict,
                states={f["id"]:state for f,state in zip(frames,states)},savedTransforms=saved_t)


def shares_rigid_motion(linked,a,b):
    path_a,path_b=linked["paths"][a],linked["paths"][b]
    while path_a and path_b and path_a[0]==path_b[0]:
        path_a,path_b=path_a[1:],path_b[1:]
    if not path_a and not path_b:return True
    if any(linked["axes"][g][2] for g,_ in [*path_a,*path_b]):return False
    # All remaining operations are translations affine in the independent driver
    # coordinates. Equality of each signed coefficient proves equal relative motion.
    for driver in linked["drivers"]:
        control={g:linked["saved"][g]+int(driver==g) for g in linked["drivers"]}
        q=linked["resolve"](control)
        if not np.allclose(pose_for(path_a,linked["axes"],q,linked["saved"]),pose_for(path_b,linked["axes"],q,linked["saved"]),rtol=0,atol=1e-6):
            return False
    return True


def pose_for(path,axes,q,saved):
    transform=np.eye(4)
    for group,sign in path:
        transform=transform@matrix(axes[group],sign*(q[group]-saved[group]))
    return transform


def coordinates(model,frame):
    linked=model["linked"];supplied=frame.get("nativeCoordinates",{})
    require(set(supplied)==set(model["groups"]) and all(number(v) for v in supplied.values()),
            "The executed loaded scene must observe all drivers and followers")
    expected=linked["resolve"]({g:supplied[g] for g in linked["drivers"]})
    for g,q in expected.items():
        require(abs(supplied[g]-q)<1e-6,"Observed follower drift or bypass at "+g)
        lo,hi=model["operatingRanges"][g]
        units=q*(180/pi if linked["axes"][g][2] else 10)
        require(lo-1e-8<=units<=hi+1e-8,"Loaded coordinate exceeds selected operating interval for "+g)
    return expected


def check_frame(model,frame):
    linked=model["linked"];q=coordinates(model,frame);predicted=linked["predict"](q)
    actual=frame.get("installedTransforms",{})
    require(set(actual)<=set(linked["owners"]),"Unknown installed transform in loaded scene")
    for s,n in linked["owners"].items():
        delta=predicted[n]
        angular=any(linked["axes"][g][2] for g,_ in linked["paths"][n])
        if angular or s in actual:
            require(s in actual and np.allclose(np.asarray(actual[s]).reshape(4,4),delta,rtol=0,atol=2e-5),
                    "Executed rigid pose differs from the coupled hardware at "+s)
        # offsetsMm is the displacement of the installed occurrence origin, not the
        # translation column of a rotation around an off-center world pivot.
        start=linked["savedTransforms"][n][:3,3]
        displacement=delta[:3,:3]@start+delta[:3,3]-start
        require(np.allclose(displacement,frame["offsetsMm"].get(s,[0,0,0]),rtol=0,atol=2e-5),
                "Executed installed origin differs from its coupled pose at "+s)


def segment_ops(linked,path,start,end):
    """Move a saved STEP or a segment-start shape using its moving-parent native screw axes."""
    prefix=np.eye(4);ordered=[]
    for g,sign in path:
        vector,origin,angular=linked["axes"][g]
        change=sign*(end[g]-start[g])
        if abs(change)>1e-12:
            v=prefix[:3,:3]@vector
            if angular:
                ordered.append(dict(kind="rotation",axis=v.tolist(),originMm=(prefix[:3,:3]@origin+prefix[:3,3]).tolist(),
                                    travelDeg=change*180/pi))
            else:
                ordered.append(dict(kind="translation",travelMm=(v*change).tolist()))
        prefix=prefix@matrix(linked["axes"][g],sign*(start[g]-linked["saved"][g]))
    return ordered[::-1]


def geometry_segment(model,a,b):
    linked=model["linked"];qa=coordinates(model,a);qb=coordinates(model,b)
    initial={};motion={}
    for s,n in linked["owners"].items():
        path=linked["paths"][n]
        ops=segment_ops(linked,path,linked["saved"],qa)
        if ops:initial[s]=ops
        ops=segment_ops(linked,path,qa,qb)
        if ops:motion[s]=ops
    return initial,motion


def duty_sweep(root,study,model,intent):
    from mechanical_motion import evaluate
    paths=intent["coupledOperatingPaths"]
    require(isinstance(paths,list) and paths,"Freeze the coupled operating sequences in the commissioning plan")
    states=model["linked"]["states"];seen=set();cases=[]
    for path in paths:
        require(isinstance(path,list) and len(path)>=2,"Coupled operation needs at least two witnessed positions")
        for first,last in zip(path,path[1:]):
            require(first in model["poses"] and last in model["poses"] and first in states and last in states and first!=last,"Unknown native coupled operating pose")
            seen.update((first,last))
            a,b=({"nativeCoordinates":states[p]} for p in (first,last))
            initial,moves=geometry_segment(model,a,b)
            if not moves:continue
            cases.append(dict(id="coupled-"+str(len(cases)),basis="Commissioned linear driver stroke with native coupled member transforms",
                              initialPose=initial,moves=moves,minGapMm=0,checkLinearEnvelope=True))
    for g,(low,high) in intent["motionRanges"].items():
        scale=180/pi if model["linked"]["axes"][g][2] else 10
        actual=[states[p][g]*scale for p in seen]
        require(min(actual)<=low+1e-6 and max(actual)>=high-1e-6,"Operating path does not reach the complete commissioned travel")
    require(cases,"No installed movement across the commissioned operating sequence")
    return evaluate(root,dict(schema="agent-frc/mechanical-motion@1",step=study["step"],cases=cases))


def fault_contacts(root,ref,linked,raw):
    """Separate an admissible coupled pose from a forced obstruction in the same installed STEP."""
    from mechanical_motion import common,distance,transform
    from showcase_contacts import load_solids
    spec=read(pinned(root,ref)); step=pinned(root,spec["step"])
    require(spec["step"]["sha256"]==raw["stepSha256"],"Obstruction uses another STEP issue")
    names={};solids,_=load_solids(step,names)
    expected=spec["parts"];pairs=spec["pairs"]
    require(expected and pairs and len(pairs)==len({tuple(sorted(pair)) for pair in pairs}) and all(
        len(pair)==2 and pair[0]!=pair[1] and set(pair)<=set(expected) for pair in pairs),"Register each distinct physical obstruction interface")
    for solid,row in expected.items():
        require(row["occurrencePath"]==names[solid]["occurrencePath"] and row["nativeOccurrence"] in linked["paths"],
                "Fault body is absent from the selected STEP or its original native occurrence")
        # Verify the resolved sequence of native instances survives neutral export.
        occurrences=row["nativeOccurrence"].split("+")
        cursor=iter(row["occurrencePath"])
        require(all(any(p==n for p in cursor) for n in occurrences),"Fault registration uses another native instance")
    rows=[]
    for case in spec["cases"]:
        frame=case["values"];require(set(frame)==set(linked["saved"]) and all(number(v) for v in frame.values()),"Specify finite coordinates for the forced pose")
        resolved=linked["resolve"]({g:frame[g] for g in linked["drivers"]})
        violated=[g for g in frame if abs(frame[g]-resolved[g])>1e-7]
        placed={s:transform(solids[s],segment_ops(linked,linked["paths"][r["nativeOccurrence"]],linked["saved"],frame),1) for s,r in expected.items()}
        hits=[]
        for a,b in pairs:
            gap=distance(placed[a],placed[b])
            hits.append(dict(pair=[a,b],gapMm=gap,commonMm3=common(placed[a],placed[b]) if gap<1e-6 else 0))
        rows.append(dict(id=case["id"],violatedCoordinates=violated,contacts=hits))
    require(any(not r["violatedCoordinates"] for r in rows) and any(r["violatedCoordinates"] for r in rows),
            "Supply a coupled control as well as the displaced or locked follower")
    return rows


def diagnostic(root,study):
    """Evaluate joint math and mounted occurrence transforms without granting a mechanical release."""
    from source_joint_roster import active_coordinates
    raw=read(pinned(root,study["jointAuthority"]))
    from fusion_authority import verify
    archive=verify(root,pinned(root,study["authority"]),pinned(root,study["lineage"]))
    from fusion_authority import register_path
    require(pinned(root,study["authority"])==register_path(root).resolve() and
            archive["archiveSha256"]==raw["archiveSha256"]==study["archive"]["sha256"] and
            archive["stepSha256"]==raw["stepSha256"]==study["step"]["sha256"],"Linked diagnostic is registered to a different authority")
    from mechanical_readiness import inspect_archive
    inspect_archive(pinned(root,study["archive"]))
    pinned(root,study["linkCalibration"])
    plan=read(pinned(root,study["commissioning"]))
    owners={n:n for n in study["installedOccurrences"]}
    require(len(owners)==len(study["installedOccurrences"]) and owners,"Register exact installed occurrence paths for the diagnostic")
    active_coordinates(raw,owners,study["anchor"])
    model=observations(root,study,raw,owners,study["anchor"],plan)
    faults=fault_contacts(root,study["obstruction"],model,raw) if study.get("obstruction") else []
    return dict(status="pass",obstructionControls=faults,schema="agent-frc/linked-observation-result@1",scope="Selected native occurrence kinematics",archiveSha256=raw["archiveSha256"],
                stepSha256=raw["stepSha256"],states=model["states"],drivers=sorted(model["drivers"]),installedOccurrences=len(owners),
                axes={g:dict(direction=axis.tolist(),originMm=p.tolist(),angular=angular) for g,(axis,p,angular) in model["axes"].items()})


if __name__=="__main__":
    import argparse,json
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("project",type=Path);p.add_argument("study",type=Path)
    a=p.parse_args();root=a.project.resolve()
    study_file=a.study.resolve() if a.study.is_absolute() else (root/a.study).resolve()
    require(study_file.is_relative_to(root),"Use a project-owned linked diagnostic study")
    try:
        result=diagnostic(root,read(study_file))
    except (KeyError,TypeError,ValueError,OSError) as error:
        result=dict(schema="agent-frc/linked-observation-result@1",status="open",reason=str(error))
    print(json.dumps(result,indent=2,allow_nan=False))
    raise SystemExit(int(result["status"]!="pass"))
