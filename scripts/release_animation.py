"""Trace every playable rigid channel to measured native poses and replay full solid strokes."""
import math
import numpy as np

from mechanical_readiness import named, pinned, read, require
from mesh_correspondence import pose_nodes
from showcase_geometry import IDENTITY, Glb, transform


def rotation_vector(matrix):
    cosine=float(np.clip((np.trace(matrix)-1)/2,-1,1))
    axis=np.array([matrix[2,1]-matrix[1,2],matrix[0,2]-matrix[2,0],matrix[1,0]-matrix[0,1]])/2
    sine=np.linalg.norm(axis)
    angle=math.atan2(sine,cosine)
    if sine>1e-9:return axis*(angle/sine)
    if cosine>0:return axis
    # At a half turn either sign represents the same rigid endpoint.
    _,vectors=np.linalg.eigh((matrix+matrix.T)/2)
    return vectors[:,-1]*angle


def scene(glb, nodes):
    paths,world,counts = {},{},[]
    def visit(i, parents, parent):
        require(i not in paths, "A physical node has more than one placement")
        node=nodes[i]
        paths[i]=[*parents,i]
        world[i]=parent @ np.array(transform(node)).reshape((4,4),order="F")
        if "mesh" in node:
            count=0
            for prim in glb.doc["meshes"][node["mesh"]]["primitives"]:
                accessor=prim["indices"] if "indices" in prim else prim["attributes"]["POSITION"]
                count+=glb.doc["accessors"][accessor]["count"]//3
            counts.append((i,count))
        for child in node.get("children",[]): visit(child,paths[i],world[i])
    for i in glb.doc["scenes"][glb.doc.get("scene",0)]["nodes"]:visit(i,[],np.eye(4))
    return paths,world,counts


def verify(root, study, spec, path):
    glb=Glb.from_project(path)
    clips=glb.doc.get("animations",[])
    require(len(glb.doc["scenes"])==1,"Resolve every selectable scene before qualifying animated geometry")
    if not clips:return
    require(spec["pose"]=="rest","Issue the native saved pose as the animated reference")
    native=read(pinned(root,study["reopen"]))
    groups=set(native["movingGroups"])
    require(groups,"A fixed native assembly has no qualified physical animation")
    registry=spec.get("animations",{})
    require(len(clips)==len(registry) and set(registry)=={c.get("name") for c in clips},
            "Register every playable clip exactly once")
    ranges=spec.get("surfaces",{}).get("facets",{})
    paths,rest,chunks=scene(glb,glb.doc["nodes"])
    facet_owners=[]
    for node,count in chunks:facet_owners.extend([node]*count)
    owners={}
    for solid,spans in ranges.items():
        nodes={owner for first,count in spans for owner in facet_owners[first:first+count]}
        require(len(nodes)==1,"Map each physical solid to a rigid display instance")
        owners[solid]=nodes.pop()
    record=read(pinned(root,study["nativeCensus"]))
    naming={(occ["path"],name):solid for occ in native["installedOccurrences"] for solid,name in occ["nativeBodyNames"].items()}
    def transforms(record):
        return {naming[b["path"],b["name"]]:np.array(b["worldTransform"]).reshape(4,4) for b in record["bodies"]}
    cold=transforms(record)
    require(set(owners)==set(cold),"Every animated and stationary native solid needs a verified rest facet assignment")
    poses={"saved":{k:np.eye(4) for k in cold}}
    pose_inputs={"saved":{}}
    for ref in study["nativePoses"]:
        row=read(pinned(root,ref));pid=row["pose"]["id"]
        poses[pid]={s:m@np.linalg.inv(cold[s]) for s,m in transforms(row).items()}
        pose_inputs[pid]={j["group"]:j for j in row["pose"]["joints"]}
    reg=np.array(spec.get("glbToCad",IDENTITY)).reshape(4,4)
    convert=reg@np.diag([1000.,1000.,1000.,1.])
    def relative(world,node):
        return convert@world[node]@np.linalg.inv(rest[node])@np.linalg.inv(convert)
    def validate_native(world,pid):
        require(pid in poses and all(np.allclose(relative(world,node),poses[pid][s],rtol=0,atol=1e-5)
                for s,node in owners.items()),"Displayed body transform differs from the registered native pose")
    def rotation_ops(m):
        require(np.allclose(m[:3,:3].T@m[:3,:3],np.eye(3),atol=1e-8) and np.linalg.det(m[:3,:3])>0,
                "Animated instance uses a nonrigid transform")
        v=rotation_vector(m[:3,:3]);a=np.linalg.norm(v)
        ops=[]
        if a>1e-12:ops.append(dict(kind="rotation",originMm=[0,0,0],axis=(v/a).tolist(),travelDeg=math.degrees(a)))
        if np.linalg.norm(m[:3,3])>1e-12:ops.append(dict(kind="translation",travelMm=m[:3,3].tolist()))
        return ops
    linked=None
    if study.get("linkCalibration"):
        from assembly_kinematics import native_model
        linked=native_model(root,study)["linked"]
    cases=[]
    for clip in clips:
        name=clip["name"];contract=registry[name];channels={}
        for channel in clip["channels"]:
            i=channel["target"]["node"];kind=channel["target"]["path"]
            require(i in paths and kind in ("translation","rotation") and i not in channels and
                    any(i in paths[n] for n in owners.values()),"Unsupported or compound physical target")
            sampler=clip["samplers"][channel["sampler"]]
            require(sampler.get("interpolation","LINEAR")=="LINEAR","Physical motion must remain continuous")
            times=[r[0] for r in glb.accessor(sampler["input"],times=True)]
            require(len(times)>=2 and times[0]>=0 and all(math.isfinite(v) for v in times) and
                    all(a<b for a,b in zip(times,times[1:])),"Invalid clip clock")
            channels[i]=(kind,times)
        clocks=sorted({t for _,ts in channels.values() for t in ts})
        keys=contract["keyPoses"]
        require(clocks and clocks==[k["timeS"] for k in keys],"Every authored physical key must have a native pose")
        bindings=contract["channels"]
        require(set(bindings)=={str(i) for i in channels},"Unregistered or unused physics channel")
        calibrations={}
        # Calibrate each joint independently against a nonzero cold native move.
        for i,(kind,times) in channels.items():
            binding=bindings[str(i)];group=binding["group"]
            if linked:
                require(group in linked["axes"] and linked["axes"][group][2]==(kind=="rotation"),"Unregistered linked display coordinate")
                continue
            pid=binding["calibrationPose"]
            require(group in groups and pid in pose_inputs and set(pose_inputs[pid])=={group},
                    "A display channel requires an isolated, measured native joint calibration")
            joint=pose_inputs[pid][group]
            require(joint["coordinate"]==("slideValue" if kind=="translation" else "rotationValue"),
                    "Display motion differs from measured native joint type")
            pos=pose_nodes(glb,dict(clip=name,timeS=binding["timeS"]))
            isolated=list(glb.doc["nodes"]);isolated[i]=pos[i]
            _,world,_=scene(glb,isolated);validate_native(world,pid)
            require(any(not np.allclose(m,np.eye(4),rtol=0,atol=1e-6) for m in poses[pid].values()),
                    "A stationary calibration does not identify a physical joint")
            baseline=binding["baselinePose"]
            require(baseline in pose_inputs and group in pose_inputs[baseline] and all(
                np.allclose(m,np.eye(4),rtol=0,atol=1e-6) for m in poses[baseline].values()),
                "Identify the measured native coordinate of the saved display configuration")
            native_start=pose_inputs[baseline][group]["nativeValue"]
            span=joint["nativeValue"]-native_start
            require(math.isfinite(span) and abs(span)>1e-9,"Independent joint calibration has no coordinate change")
            def vector(start,end,kind):
                if kind=="translation":
                    return 1000*(np.array(end.get("translation",[0,0,0]))-start.get("translation",[0,0,0]))
                a=np.array(transform({"rotation":start.get("rotation",[0,0,0,1])})).reshape(4,4,order="F")[:3,:3]
                b=np.array(transform({"rotation":end.get("rotation",[0,0,0,1])})).reshape(4,4,order="F")[:3,:3]
                return rotation_vector(b@a.T)
            calibrated=vector(glb.doc["nodes"][i],pos[i],kind)
            require(math.isclose(np.linalg.norm(calibrated),abs(span)*(10 if kind=="translation" else 1),abs_tol=1e-5),
                    "Display stroke differs from the native centimeter or radian calibration")
            calibrations[i]=(group,native_start,calibrated/span)
        scenes=[]
        for k in keys:
            nodes=pose_nodes(glb,dict(clip=name,timeS=k["timeS"]))
            _,world,_=scene(glb,nodes);validate_native(world,k["pose"]);scenes.append((nodes,world))
        for j,((a,wa),(b,wb)) in enumerate(zip(scenes,scenes[1:])):
            for i,(group,baseline,direction) in calibrations.items():
                def coordinate(key):
                    return pose_inputs[key["pose"]].get(group,{}).get("nativeValue",baseline)
                actual=vector(a[i],b[i],channels[i][0])
                require(np.allclose(actual,direction*(coordinate(keys[j+1])-coordinate(keys[j])),rtol=0,atol=1e-5),
                        "Displayed interpolation traverses a different native coordinate interval or direction")
            moves={};initial={}
            for solid,node in owners.items():
                ops=[]
                init=rotation_ops(relative(wa,node))
                if init:initial[solid]=init
                # Compose child first; parent carries the entire moving child frame.
                for i in reversed(paths[node]):
                    if i not in channels:continue
                    kind=channels[i][0];parent=paths[i][:-1]
                    wp=wa[parent[-1]] if parent else np.eye(4)
                    R=reg[:3,:3]@wp[:3,:3]
                    require(np.allclose(R.T@R,np.eye(3),rtol=0,atol=1e-8) and np.linalg.det(R)>0,
                            "Animated ancestors must have rigid proper coordinate frames")
                    if kind=="translation":
                        v=1000*R@(np.array(b[i].get("translation",[0,0,0]))-a[i].get("translation",[0,0,0]))
                        if np.linalg.norm(v)>1e-10:ops.append(dict(kind="translation",travelMm=v.tolist()))
                    else:
                        q0=np.array(transform({"rotation":a[i]["rotation"]})).reshape(4,4,order="F")[:3,:3]
                        q1=np.array(transform({"rotation":b[i]["rotation"]})).reshape(4,4,order="F")[:3,:3]
                        v=R@rotation_vector(q1@q0.T);angle=np.linalg.norm(v)
                        require(angle<math.pi-1e-7,"Insert a native intermediate pose to disambiguate half turns")
                        if angle>1e-12:ops.append(dict(kind="rotation",axis=(v/angle).tolist(),travelDeg=math.degrees(angle),
                            originMm=(convert@wa[i][:,3])[:3].tolist()))
                if linked:
                    from linked_motion import segment_ops
                    src=linked["states"][keys[j]["pose"]];dst=linked["states"][keys[j+1]["pose"]]
                    chain=linked["paths"][linked["owners"][solid]]
                    expected_ops=segment_ops(linked,chain,src,dst)
                    expected_groups=[g for g,_ in reversed(chain) if abs(dst[g]-src[g])>1e-10]
                    actual_groups=[bindings[str(i)]["group"] for i in reversed(paths[node]) if i in channels and
                                   abs(dst[bindings[str(i)]["group"]]-src[bindings[str(i)]["group"]])>1e-10]
                    require(actual_groups==expected_groups and len(expected_ops)==len(ops),"Display channel ancestry differs from the installed coupled assembly")
                    for got,want in zip(ops,expected_ops):
                        require(got["kind"]==want["kind"],"Display interpolation changes installed joint kind")
                        if got["kind"]=="translation":
                            require(np.allclose(got["travelMm"],want["travelMm"],rtol=0,atol=1e-5),"Displayed coupled translation differs from installed travel")
                        else:
                            a1=np.array(got["axis"])*got["travelDeg"];a2=np.array(want["axis"])*want["travelDeg"]
                            require(np.allclose(a1,a2,rtol=0,atol=1e-5) and
                                    np.linalg.norm(np.cross(np.array(got["originMm"])-want["originMm"],got["axis"]))<1e-5,
                                    "Displayed coupled rotation differs in sign, turns or pivot")
                if ops:moves[solid]=ops
            if moves:cases.append(dict(id=f"{name}/{j}",basis="Continuous glTF rigid interpolation between measured Fusion poses",
                initialPose=initial,moves=moves,minGapMm=0,maxDepth=9,checkLinearEnvelope=True))
    if cases:
        from mechanical_motion import evaluate
        result=evaluate(root,dict(schema="agent-frc/mechanical-motion@1",step=study["step"],cases=cases))
        require(all(c["status"]=="pass" for c in result["cases"]),"Animated solids do not maintain certified clearance throughout travel")
