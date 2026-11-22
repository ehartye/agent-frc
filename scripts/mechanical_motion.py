"""Certify registered rigid-body sweep intervals and evaluate as-built planar support seats in millimeters."""
import argparse
import json
import math
from pathlib import Path
import sys
from time import perf_counter
from itertools import combinations, product

from mechanical_readiness import named,number,pinned,project_path,read,require,digest
from showcase_contacts import load_solids,box_gap
import payload_compression


def vec(x):
    require(isinstance(x,list) and len(x)==3 and all(number(v) for v in x),"Supply a finite XYZ vector")
    return x


def axes(r):
    from OCP.gp import gp_Ax1,gp_Dir,gp_Pnt
    a=vec(r["axis"]);o=vec(r["originMm"])
    require(math.dist(a,[0,0,0])>0,"Empty rotation axis")
    return gp_Ax1(gp_Pnt(*o),gp_Dir(*a))


def bounds(shape):
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box
    b=Bnd_Box();BRepBndLib.AddOptimal_s(shape,b,False,False)
    return [*b.CornerMin().Coord(),*b.CornerMax().Coord()]


def transforms(moves,t):
    from OCP.gp import gp_Trsf,gp_Vec
    for move in moves:
        tr=gp_Trsf()
        if move["kind"]=="gravity-drop":
            h=move["fallMm"];w=move["quadraticFraction"]
            require(number(h) and h>=0 and number(w) and 0<=w<=1,"Invalid downward gravity stroke")
            tr.SetTranslation(gp_Vec(0,0,-h*((1-w)*t+w*t*t)))
        elif move["kind"]=="translation":
            tr.SetTranslation(gp_Vec(*[v*t for v in vec(move["travelMm"])]))
        else:
            require(move["kind"]=="rotation" and number(move["travelDeg"]),"Unknown prescribed motion")
            tr.SetRotation(axes(move),math.radians(move["travelDeg"])*t)
        yield tr


def transform(shape,moves,t):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    for tr in transforms(moves,t):
        shape=BRepBuilderAPI_Transform(shape,tr,False).Shape()
    return shape


def travel_bound(box,moves):
    # The norm of velocity per normalized stroke parameter. Prior stages may
    # increase a later axis' lever arm by at most their total arc travel.
    corners=list(product(*[(box[i],box[i+3]) for i in range(3)]))
    bound=0
    for move in moves:
        if move["kind"]=="gravity-drop":
            h=move["fallMm"];w=move["quadraticFraction"]
            require(number(h) and h>=0 and number(w) and 0<=w<=1,"Invalid downward gravity bound")
            bound+=h*(1+w)
        elif move["kind"]=="translation":
            bound+=math.dist(vec(move["travelMm"]),[0,0,0])
        else:
            require(move["kind"]=="rotation" and number(move["travelDeg"]),"Unknown motion law")
            axes(move)
            origin=move["originMm"]
            bound+=abs(math.radians(move["travelDeg"]))*(max(math.dist(p,origin) for p in corners)+bound)
    return bound


def separate_translations(a,b,ma,mb,clearance):
    # A fixed separating coordinate plane may move during a gravity/linear
    # stroke. Check the exact minimum of each quadratic relative displacement.
    def coefficients(moves):
        invariant=[True,True,True]
        linear=[0.,0.,0.];square=[0.,0.,0.]
        for move in moves:
            if move["kind"]=="translation":
                linear=[x+y for x,y in zip(linear,move["travelMm"])]
            elif move["kind"]=="gravity-drop":
                h=move["fallMm"];w=move["quadraticFraction"]
                linear[2]-=h*(1-w);square[2]-=h*w
            elif move["kind"]=="rotation":
                axis=vec(move["axis"])
                invariant=[ok and all(axis[k]==0 for k in range(3) if k!=i) for i,ok in enumerate(invariant)]
            else:return None
        return linear,square,invariant
    pa,pb=coefficients(ma),coefficients(mb)
    if pa is None or pb is None:return False
    for i in range(3):
        if not (pa[2][i] and pb[2][i]):continue
        for first,second,sign in ((a,b,1),(b,a,-1)):
            gap=second[i]-first[i+3]
            v=sign*(pb[0][i]-pa[0][i]);q=sign*(pb[1][i]-pa[1][i])
            low=min(gap,gap+v+q)
            if q>0 and 0<-v/(2*q)<1:low=min(low,gap-v*v/(4*q))
            if low>=clearance:return True
    return False


def distance(a,b):
    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
    q=BRepExtrema_DistShapeShape(a,b)
    require(q.IsDone() and number(q.Value()) and q.Value()>=0,"Unresolved solid separation")
    return q.Value()


def common(a,b,area=False):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    q=BRepAlgoAPI_Common(a,b)
    require(q.IsDone() and not q.Shape().IsNull(),"Unresolved common geometry")
    props=GProp_GProps()
    if area:
        BRepGProp.SurfaceProperties_s(q.Shape(),props)
    else:
        BRepGProp.VolumeProperties_s(q.Shape(),props,True)
    v=props.Mass()
    require(number(v) and v>=0,"Invalid geometric measure")
    return v


def linear_envelope_clear(moving_box,fixed,moving_ops,fixed_ops,clearance):
    from OCP.gp import gp_Pnt
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
    if any(op["kind"]!="translation" for op in [*moving_ops,*fixed_ops]):return False
    travel=[sum(op["travelMm"][i] for op in moving_ops)-sum(op["travelMm"][i] for op in fixed_ops) for i in range(3)]
    lo=[moving_box[i]+min(0,v) for i,v in enumerate(travel)]
    hi=[moving_box[i+3]+max(0,v) for i,v in enumerate(travel)]
    # This solid encloses every position in the exact relative linear stroke.
    # A zero-volume common allows sliding face contact at a registered zero gap.
    envelope=BRepPrimAPI_MakeBox(gp_Pnt(*lo),gp_Pnt(*hi)).Shape()
    gap=distance(envelope,fixed)
    return gap>=clearance and (gap>1e-7 or common(envelope,fixed)==0)


def planar_translation_clear(shape, fixed, moving_ops, fixed_ops, clearance):
    """Certify a piecewise-planar solid's relative sweep, including reentrant corners."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Vec
    if any(op["kind"]!="translation" for op in [*moving_ops,*fixed_ops]):
        return False
    travel=gp_Vec(*[sum(op["travelMm"][i] for op in moving_ops)-sum(op["travelMm"][i] for op in fixed_ops) for i in range(3)])
    def clear(s):
        gap=distance(s,fixed)
        return gap>=clearance and (gap>1e-7 or common(s,fixed)==0)
    if travel.Magnitude()==0 or not clear(shape):return False
    # The original solid and prisms swept by its boundary cover every occupied point.
    # Tangential planar faces add no interior. Restrict this proof to exact planarity.
    faces=TopExp_Explorer(shape,TopAbs_FACE)
    while faces.More():
        face=(getattr(TopoDS,"Face_s",None) or TopoDS.Face)(faces.Current());surface=BRepAdaptor_Surface(face)
        if surface.GetType()!=GeomAbs_Plane:return False
        if travel.Dot(gp_Vec(surface.Plane().Axis().Direction()))!=0:
            prism=BRepPrimAPI_MakePrism(face,travel)
            if not prism.IsDone() or not clear(prism.Shape()):return False
        faces.Next()
    return True


def bearing_area(a,b,load_direction=None):
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_REVERSED
    def planar(s):
        it=TopExp_Explorer(s,TopAbs_FACE)
        while it.More():
            face=(getattr(TopoDS,"Face_s",None) or TopoDS.Face)(it.Current());surf=BRepAdaptor_Surface(face)
            if surf.GetType()==GeomAbs_Plane:
                n=surf.Plane().Axis().Direction()
                normal=list(n.Coord())
                if face.Orientation()==TopAbs_REVERSED:normal=[-v for v in normal]
                yield face,normal
            it.Next()
    faces=list(planar(b))
    return sum(common(f,g,True) for f,n in planar(a) for g,m in faces
        if (load_direction is None or sum(x*y for x,y in zip(n,load_direction))>.999999999)
        and sum(i*j for i,j in zip(n,m))<-.999999999 and distance(f,g)<=1e-7)


# Each optimal axis-aligned box encloses its solid. Past this margin, box separation certifies the gap.
BOX_MARGIN_MM=1e-3


def constant_pose_separated(a,b,cut):
    """A pair with constant relative pose whose boxes are farther apart than the cut cannot fail."""
    return box_gap(a,b)>cut+BOX_MARGIN_MM


def pose_key(source,ops):
    """Identify one body's exact placed geometry: its source solid and ordered initial pose."""
    return None if source is None else (source,json.dumps(ops,sort_keys=True,allow_nan=False))


def progress_line(index,total,result,case_seconds,total_seconds):
    """One stderr progress line for a finished case. It never enters the receipt."""
    pairs=[r["status"] for r in result["pairs"]];c=result["counts"]
    return (f"[motion] {index}/{total} {result['case']} status={result['status']} failing={pairs.count('fail')} "
            f"open={pairs.count('open')} bounded={c['bounded']} broadPhase={c['broadPhase']} "
            f"constantPoseBroadPhase={c['constantPoseBroadPhase']} case={case_seconds:.2f}s total={total_seconds:.2f}s")


HEARTBEAT_SECONDS=30.
# The full, half and golden-section fractions of a rotation: no finite rotational symmetry satisfies all three by accident.
INVARIANCE_FRACTIONS=(1.,.5,(math.sqrt(5)-1)/2)
INVARIANCE_TOLERANCE_MM=1e-3
INVARIANCE_FACE_LIMIT=200


def boundary_samples(shape,per_face=4):
    """The boundary faces of a placed solid with points on every face: mesh nodes and the surface points under
    triangle centers, so a flat or ruled wall is sampled away from its edges. Returns None above the face limit."""
    from OCP.BRep import BRep_Builder,BRep_Tool
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Copy
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopLoc import TopLoc_Location
    from OCP.TopoDS import TopoDS,TopoDS_Compound
    face_of=getattr(TopoDS,"Face_s",None) or TopoDS.Face
    faces=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(faces)
    explorer=TopExp_Explorer(shape,TopAbs_FACE);count=0
    while explorer.More():
        builder.Add(faces,explorer.Current());explorer.Next();count+=1
    if count>INVARIANCE_FACE_LIMIT:return None
    # Meshing the original would attach a triangulation to a shape other checks and views still use.
    copy=BRepBuilderAPI_Copy(shape,True,False).Shape()
    box=bounds(copy)
    BRepMesh_IncrementalMesh(copy,max(math.dist(box[:3],box[3:])/200,1e-3),False,.3)
    points=[];explorer=TopExp_Explorer(copy,TopAbs_FACE)
    def spread(n):
        return range(1,n+1,max(1,math.ceil(n/per_face)))
    while explorer.More():
        face=face_of(explorer.Current());location=TopLoc_Location();mesh=BRep_Tool.Triangulation_s(face,location)
        if mesh is None:return None
        points.extend(mesh.Node(i).Transformed(location.Transformation()) for i in spread(mesh.NbNodes()))
        if not mesh.HasUVNodes():return None
        surface=BRep_Tool.Surface_s(face)
        for i in spread(mesh.NbTriangles()):
            corners=[mesh.UVNode(n) for n in mesh.Triangle(i).Get()]
            points.append(surface.Value(sum(c.X() for c in corners)/3,sum(c.Y() for c in corners)/3))
        explorer.Next()
    return faces,points


def rotation_invariant(shape,move):
    """Whether one rotation leaves a placed solid unchanged at its full, half and golden-section travel.

    True for a solid of revolution about the rotation axis. None when the test cannot judge: the travel is too
    small to tell, the solid has too many faces or the kernel fails. The test compares the centroid, the
    bounding box and sampled boundary points, so it supports a warning and never a clearance finding."""
    try:
        return _rotation_invariant(shape,move)
    except Exception:
        # An advisory check never stops or changes a clearance run.
        return None


def _rotation_invariant(shape,move):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.gp import gp_Lin,gp_Pnt
    axis=gp_Lin(axes(move));box=bounds(shape)
    reach=max(axis.Distance(gp_Pnt(*corner)) for corner in product(*[(box[i],box[i+3]) for i in range(3)]))
    if abs(math.radians(move["travelDeg"]))*min(INVARIANCE_FRACTIONS)*reach<100*INVARIANCE_TOLERANCE_MM:return None
    props=GProp_GProps();BRepGProp.VolumeProperties_s(shape,props,True)
    if not props.Mass()>0:return None
    if axis.Distance(props.CentreOfMass())>INVARIANCE_TOLERANCE_MM:return False
    for fraction in INVARIANCE_FRACTIONS:
        if max(abs(x-y) for x,y in zip(box,bounds(transform(shape,[move],fraction))))>INVARIANCE_TOLERANCE_MM:return False
    sampled=boundary_samples(shape)
    if sampled is None or not sampled[1]:return None
    faces,points=sampled
    for fraction in INVARIANCE_FRACTIONS:
        turn=next(transforms([move],fraction))
        for point in points:
            if distance(BRepBuilderAPI_MakeVertex(point.Transformed(turn)).Vertex(),faces)>INVARIANCE_TOLERANCE_MM:return False
    return True


def sweep_warnings(case,scene,moves,keys,declared,known,told):
    """Advisory stderr lines about rotations that cannot change, or fail to preserve, a body's occupied volume.

    Only the rotations before a body's first other move are judged, each against the case's starting pose.
    A body, pose and move that already drew a warning in an earlier case is not repeated."""
    lines=[]
    for name,ops in moves.items():
        ops=[m for m in ops if not (m["kind"]=="rotation" and m["travelDeg"]==0)]
        leading=[]
        for move in ops:
            if move["kind"]!="rotation":break
            leading.append(move)
        invariant=True if leading else None
        for move in leading:
            key=None if keys.get(name) is None else (keys[name],json.dumps(move,sort_keys=True,allow_nan=False))
            if key is None:invariant=rotation_invariant(scene[name],move)
            else:
                if key not in known:known[key]=rotation_invariant(scene[name],move)
                invariant=known[key]
            if not invariant:break
        if invariant is True and len(leading)==len(ops):
            kind="redundant";text=("the body is unchanged by its rotation about its own axis, so the move cannot change its swept volume "
                "and only adds refinement cost; unless another body shares the move, model it as a static envelope and remove the rotation")
        elif name in declared and invariant is False:
            kind="declared";text=("declared full swept envelope, but its rotation changes the occupied volume; "
                "revolve the geometry about the rotation axis or remove it from sweptEnvelopes")
        else:continue
        seen=(kind,name,None if keys.get(name) is None else keys[name],json.dumps(ops,sort_keys=True,allow_nan=False))
        if seen[2] is not None and seen in told:continue
        told.add(seen)
        lines.append(f"[motion] warning {case} {name}: {text}")
    return lines


def evaluate(root,study,*,mount_hosts=(),package_scene=None,progress=None,fail_fast=False,never_stop=(),heartbeat_seconds=HEARTBEAT_SECONDS):
    """Evaluate every case in order.

    progress receives one line per finished case, a heartbeat line when heartbeat_seconds have passed
    inside a case without one, and advisory sweep warnings. None of them enters the result. With fail_fast, the first case whose status is not
    "pass" ends the study. Its cases up to and including that case are returned and the result is
    marked partial with the stopping case, the checked cases and the skipped cases. Cases named in
    never_stop, such as an adverse control that is expected to fail, never end the study.
    """
    require(study.get("schema")=="agent-frc/mechanical-motion@1","Unknown motion study")
    declared=study.get("sweptEnvelopes",[])
    require(isinstance(declared,list) and all(named(n) for n in declared),"sweptEnvelopes lists the IDs of bodies modeled as full swept volumes")
    require(number(heartbeat_seconds) and heartbeat_seconds>=0,"Heartbeat interval must be zero or more seconds")
    invariance={};told=set();present=set()
    original=pinned(root,study["step"])
    identities={}
    shapes,non_solids=load_solids(original,identities)
    host_bounds={n:bounds(shapes[n]) for n in sorted(mount_hosts) if n in shapes}
    case_ids=set();results=[];extraction_states=[]
    # Exact (gap, volume) of constant-relative-pose pairs, reused only for identical sources and poses.
    measured={}
    started=perf_counter();stopped=None
    for index,case in enumerate(study["cases"],1):
        case_started=perf_counter()
        id=case["id"]
        require(named(id) and id not in case_ids and named(case.get("basis")),"Unique case ID and physical basis required")
        case_ids.add(id)
        scene=dict(shapes)
        sources={n:("installed",n) for n in shapes}
        for ext in case.get("fixtures",[]):
            source,_=load_solids(pinned(root,ext["file"]))
            require(ext["id"] not in scene and named(ext.get("basis")),"Duplicate or unjustified tool/piece/field fixture")
            scene[ext["id"]]=source[ext["solid"]]
            sources[ext["id"]]=("fixture",ext["file"]["file"],ext["file"]["sha256"],ext["solid"])
        removed=case.get("removed",{})
        require(isinstance(removed,dict),"Service removals must map installed bodies to extraction case IDs")
        if removed:
            require(case.get("stage")=="service" and removed in extraction_states,
                    "Service removals must match the complete state of one previously verified extraction")
            for key in removed:
                del scene[key]
        moves=case["moves"]
        require(isinstance(moves,dict) and moves and set(moves)<=set(scene),"Motion references absent installed parts")
        for name,ops in case.get("initialPose",{}).items():
            require(name in scene,"Initial pose names absent body")
            scene[name]=transform(scene[name],ops,1)
        built=dict(scene)
        if package_scene is not None:
            package_scene(case, scene)
        # A body the callback replaced has no reusable identity.
        keys={n:pose_key(sources.get(n),case.get("initialPose",{}).get(n,[])) if scene[n] is built.get(n) else None for n in scene}
        boxes={n:bounds(s) for n,s in scene.items()}
        rates={n:travel_bound(boxes[n],ops) for n,ops in moves.items()}
        pair_total=math.comb(len(scene),2);last_line=[case_started]
        def beat(done,a,b,d,samples):
            now=perf_counter()
            if progress and now-last_line[0]>=heartbeat_seconds:
                last_line[0]=now
                progress(f"[heartbeat] motion {index}/{len(study['cases'])} {id} pairs={done}/{pair_total} pair={a}|{b} depth={d} "
                         f"samples={samples} case={now-case_started:.2f}s total={now-started:.2f}s")
        if progress:
            present.update(scene)
            for line in sweep_warnings(id,scene,moves,keys,declared,invariance,told):progress(line)
        cut=case["minGapMm"];depth=case.get("maxDepth",9)
        require(number(cut) and cut>=0 and type(depth)==int and 0<=depth<=18,"Invalid clearance or subdivision bound")
        excluded={}
        for ex in case.get("intendedInterfaces",[]):
            a,b=ex["pair"]
            require(a in scene and b in scene and a!=b and named(ex.get("basis")) and ex.get("qualifiedBy"),
                    "Intentional motion interfaces need their separately qualified, pinned study")
            evidence=pinned(root,ex["qualifiedBy"])
            record=read(evidence)
            require(record.get("stepSha256")==study["step"]["sha256"] and record.get("case")==id and
                    set(record.get("pair",[]))=={a,b} and record.get("status")=="pass","Interface qualification is stale or incomplete")
            excluded[tuple(sorted((a,b)))]=ex["basis"]
        compliant=payload_compression.interfaces(case,scene,excluded,root)
        rows=[];counts={"broadPhase":0,"bounded":0,"constantPoseBroadPhase":0,"constantPoseReused":0}
        for done,(a,b) in enumerate(combinations(sorted(scene),2)):
            beat(done,a,b,0,0)
            if (a,b) in compliant:
                rows.append(payload_compression.sweep(compliant[a,b],scene,moves,rates,depth,transform,distance))
                continue
            stationary = a not in moves and b not in moves
            if (stationary and package_scene is None) or (a,b) in excluded:continue
            if stationary or (a in moves and b in moves and moves[a]==moves[b]):
                # Their relative pose is constant. Fixtures and initial offsets are not necessarily in the original assembly.
                if constant_pose_separated(boxes[a],boxes[b],cut):
                    counts["constantPoseBroadPhase"]+=1;continue
                key=None if keys[a] is None or keys[b] is None else (keys[a],keys[b])
                if key in measured:
                    g,v=measured[key];counts["constantPoseReused"]+=1
                else:
                    g=distance(scene[a],scene[b]);v=common(scene[a],scene[b]) if g<=1e-7 else 0
                    if key is not None:measured[key]=(g,v)
                hit=v>0 or g<cut
                rows.append(dict(pair=[a,b],status="fail" if hit else "pass",witness=dict(t=0,gapMm=g,volumeMm3=v)))
                continue
            speed=rates.get(a,0)+rates.get(b,0)
            if box_gap(boxes[a],boxes[b])-speed>cut or separate_translations(boxes[a],boxes[b],moves.get(a,[]),moves.get(b,[]),cut):
                counts["broadPhase"]+=1;continue
            if case.get("checkLinearEnvelope") and (linear_envelope_clear(boxes[a],scene[b],moves.get(a,[]),moves.get(b,[]),cut)
                    or linear_envelope_clear(boxes[b],scene[a],moves.get(b,[]),moves.get(a,[]),cut)
                    or planar_translation_clear(scene[a],scene[b],moves.get(a,[]),moves.get(b,[]),cut)
                    or planar_translation_clear(scene[b],scene[a],moves.get(b,[]),moves.get(a,[]),cut)):
                counts["bounded"]+=1
                rows.append(dict(pair=[a,b],status="pass",method="enclosed relative linear stroke"))
                continue
            poses={}
            def sample(t):
                if t not in poses:
                    sa=transform(scene[a],moves.get(a,[]),t);sb=transform(scene[b],moves.get(b,[]),t)
                    gap=distance(sa,sb);vol=common(sa,sb) if gap<=1e-7 else 0
                    poses[t]=(gap,vol)
                return poses[t]
            pending=[(0.,1.,0)];unresolved=None;failed=None;lowest=math.inf
            for t in (0.,1.):
                g,v=sample(t)
                if v>0 or g<cut:failed=dict(t=t,gapMm=g,volumeMm3=v);break
            while pending and failed is None:
                lo,hi,d=pending.pop();mid=(lo+hi)/2
                g,v=sample(mid)
                beat(done,a,b,d,len(poses))
                if v>0 or g<cut:failed=dict(t=mid,gapMm=g,volumeMm3=v);break
                lower=g-speed*(hi-lo)/2
                if lower>cut:
                    lowest=min(lowest,lower);continue
                if d==depth:
                    if unresolved is None:unresolved=[lo,hi]
                    continue
                pending.extend([(mid,hi,d+1),(lo,mid,d+1)])
            if failed or unresolved:rows.append(dict(pair=[a,b],status="fail" if failed else "open",witness=failed or unresolved))
            else:
                counts["bounded"]+=1
                rows.append(dict(pair=[a,b],status="pass",lowerBoundMm=lowest,samples=len(poses)))
        goals=[]
        for goal in case.get("requiredContacts",[]):
            a,b=goal["pair"];limit=goal["maxGapMm"];lo,hi=goal["window"]
            require(a!=b and a in scene and b in scene and named(goal.get("id")) and named(goal.get("criterion")) and
                    number(limit) and limit>=0 and number(lo) and number(hi) and 0<=lo<=hi<=1,"Invalid finite contact opportunity")
            speed=rates.get(a,0)+rates.get(b,0)
            pending=[(lo,hi,0)];unresolved=False;reached=None;lower_min=math.inf
            def separation(t):
                return distance(transform(scene[a],moves.get(a,[]),t),transform(scene[b],moves.get(b,[]),t))
            visited=2
            for t in (lo,hi):
                gap=separation(t)
                if gap<=limit:
                    reached=dict(t=t,gapMm=gap);break
            while pending and reached is None:
                low,high,d=pending.pop();mid=(low+high)/2;gap=separation(mid)
                visited+=1;beat(pair_total,a,b,d,visited)
                if gap<=limit:
                    reached=dict(t=mid,gapMm=gap);break
                lower=gap-speed*(high-low)/2
                if lower>limit:
                    lower_min=min(lower_min,lower);continue
                if d==depth:
                    unresolved=True;continue
                pending.extend([(mid,high,d+1),(low,mid,d+1)])
            status="pass" if reached else "open" if unresolved else "fail"
            goals.append(dict(id=goal["id"],pair=[a,b],criterion=goal["criterion"],status=status,witness=reached,
                lowerBoundMm=lower_min if math.isfinite(lower_min) and not unresolved and not reached else None))
        seats=[]
        for seat in case.get("seats",[]):
            a,b=seat["pair"];time=seat.get("t",1)
            require(a in scene and b in scene and a!=b and number(time) and 0<=time<=1 and number(seat["minAreaMm2"])
                    and seat["minAreaMm2"]>0,"Invalid support seat")
            sa=transform(scene[a],moves.get(a,[]),time);sb=transform(scene[b],moves.get(b,[]),time)
            v=common(sa,sb);area=bearing_area(sa,sb)
            seats.append(dict(pair=[a,b],areaMm2=area,interferenceMm3=v,status="pass" if v==0 and area>=seat["minAreaMm2"] else "fail"))
        from mechanical_visibility import observe
        visibility=[observe(root,v,scene,moves,transform) for v in case.get("visibility",[])]
        observed=[r["status"] for r in [*rows,*seats,*goals,*visibility]]
        status="fail" if "fail" in observed else "open" if "open" in observed or not rows and not seats and not goals and not visibility and not counts["broadPhase"] and not counts["constantPoseBroadPhase"] else "pass"
        extracted=[]
        if case.get("extract"):
            require(case.get("stage")=="service" and not case.get("initialPose") and not excluded and
                    set(case["extract"])==set(moves) and set(moves)<=set(shapes),
                    "An extraction needs the installed start, all fixed obstacles and an explicit moving group")
            fixed=[bounds(body) for key,body in scene.items() if key not in moves]
            require(fixed,"An extraction needs a remaining fixed assembly")
            envelope=[min(b[i] for b in fixed) for i in range(3)]+[max(b[i] for b in fixed) for i in (3,4,5)]
            fully_out=all(box_gap(bounds(transform(scene[key],ops,1)),envelope)>cut for key,ops in moves.items())
            if status=="pass" and fully_out:
                extracted=sorted(moves)
                extraction_states.append({**removed,**dict.fromkeys(extracted,id)})
            elif status=="pass":
                status="open"
        results.append(dict(case=id,extracted=extracted,status=status,moving=list(moves),removed=removed,installedCount=len(scene),pairs=rows,seats=seats,requiredContacts=goals,visibility=visibility,counts=counts))
        now=perf_counter()
        if progress:progress(progress_line(index,len(study["cases"]),results[-1],now-case_started,now-started))
        if fail_fast and status!="pass" and id not in never_stop:
            stopped=id;break
    require(results,"Supply at least one operating or service case")
    result={"schema":"agent-frc/mechanical-motion-result@1","stepSha256":digest(original),"occurrences":identities,"nonSolidLeafCount":len(non_solids),"mountHostBoundsMm":host_bounds,"cases":results}
    if stopped is not None:
        # A partial receipt can never stand for the whole study: the skipped cases are neither run nor validated.
        skipped=[c.get("id") for c in study["cases"][len(results):]]
        result.update(partial=True,stoppedAt=stopped,checkedCases=[r["case"] for r in results],skippedCases=skipped)
        if progress:progress(f"[motion] fail-fast stopped at {stopped}; skipped {len(skipped)} case{'' if len(skipped)==1 else 's'}: "+(", ".join(map(str,skipped)) or "none"))
    elif progress:
        for name in declared:
            if name not in present:progress(f"[motion] warning sweptEnvelopes names {name}, which no case contains")
    return result


def stderr_progress(line):
    print(line,file=sys.stderr,flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project",type=Path);parser.add_argument("study");parser.add_argument("--require-pass",action="store_true")
    parser.add_argument("--fail-fast",action="store_true",help="Stop at the first case that does not pass and write a partial receipt")
    parser.add_argument("--quiet",action="store_true",help="Omit progress, heartbeat and warning lines on stderr")
    parser.add_argument("--heartbeat",type=float,default=HEARTBEAT_SECONDS,metavar="SECONDS",
                        help="Seconds inside a case before a stderr line names the active pair (default 30)")
    args=parser.parse_args()
    try:
        root=args.project.resolve()
        res=evaluate(root,read(project_path(root,args.study)),progress=None if args.quiet else stderr_progress,fail_fast=args.fail_fast,
                     heartbeat_seconds=args.heartbeat)
        print(json.dumps(res,indent=2,allow_nan=False))
        sys.exit(int(args.require_pass and (res.get("partial",False) or any(c["status"]!="pass" for c in res["cases"]))))
    except (OSError,ValueError,TypeError,KeyError,ImportError) as e:
        sys.exit(str(e))
