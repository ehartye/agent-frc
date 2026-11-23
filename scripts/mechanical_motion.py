"""Certify registered rigid-body sweep intervals and evaluate as-built planar support seats in millimeters."""
import argparse
import json
import math
import os
from pathlib import Path
import pickle
import sys
from time import perf_counter
from itertools import combinations, product

from mechanical_readiness import named,number,pinned,project_path,read,require,digest,fill_digests
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
    A body, pose and move that already drew a warning in an earlier case is not repeated.
    Each line comes with the identity that keeps it from repeating."""
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
        lines.append((seen,f"[motion] warning {case} {name}: {text}"))
    return lines


# A case with fewer body pairs than this is one unit of work; a larger case is shared between the workers.
PAIRS_PER_SHARE=500


def _open(root,study):
    """Load a study's installed solids, with the caches that the cases evaluated in one process share."""
    original=pinned(root,study["step"]);identities={}
    shapes,non_solids=load_solids(original,identities)
    # measured holds the exact (gap, volume) of constant-relative-pose pairs, reused only for identical sources and poses.
    return dict(root=root,study=study,original=original,identities=identities,shapes=shapes,non_solids=non_solids,
                measured={},fresh=[],boxes={},invariance={},told=set(),phase=(0,0))


def _removal(case,verified=None):
    """A case's service removals. verified lists the complete states of the extractions that passed before it."""
    removed=case.get("removed",{})
    require(isinstance(removed,dict),"Service removals must map installed bodies to extraction case IDs")
    if removed:
        require(case.get("stage")=="service" and (verified is None or removed in verified),
                "Service removals must match the complete state of one previously verified extraction")
    return removed


def _scene(run,case,verified=None):
    """One case's bodies at their start pose, and the source identity of each."""
    root=run["root"];scene=dict(run["shapes"])
    sources={n:("installed",n) for n in scene}
    for ext in case.get("fixtures",[]):
        source,_=load_solids(pinned(root,ext["file"]))
        require(ext["id"] not in scene and named(ext.get("basis")),"Duplicate or unjustified tool/piece/field fixture")
        scene[ext["id"]]=source[ext["solid"]]
        sources[ext["id"]]=("fixture",ext["file"]["file"],ext["file"]["sha256"],ext["solid"])
    run["phase"]=(1,0)
    for key in _removal(case,verified):
        del scene[key]
    moves=case["moves"]
    require(isinstance(moves,dict) and moves and set(moves)<=set(scene),"Motion references absent installed parts")
    for name,ops in case.get("initialPose",{}).items():
        require(name in scene,"Initial pose names absent body")
        scene[name]=transform(scene[name],ops,1)
    return scene,sources


def _share(run,case,share=(0,1),*,package=False,package_scene=None,verified=None,beat=None,warn=None):
    """Evaluate one share of a case: every share[1]-th body pair, starting at pair share[0].

    Share 0 also evaluates the required contacts, seats, visibility and extraction, and passes each advisory
    sweep warning to warn. The shares of a case combine in _combine, whichever process evaluated them.
    run["phase"] records how far the evaluation got, so errors from several shares rank as one run meets them."""
    root=run["root"];study=run["study"];id=case["id"];first,count=share
    run["phase"]=(0,0)
    scene,sources=_scene(run,case,verified)
    built=dict(scene)
    if package_scene is not None:
        package_scene(case, scene)
    moves=case["moves"]
    # A body the callback replaced has no reusable identity.
    keys={n:pose_key(sources.get(n),case.get("initialPose",{}).get(n,[])) if scene[n] is built.get(n) else None for n in scene}
    boxes={}
    for n,s in scene.items():
        # The same source in the same pose has the same box in every case.
        if keys[n] is None:boxes[n]=bounds(s)
        else:
            if keys[n] not in run["boxes"]:run["boxes"][keys[n]]=bounds(s)
            boxes[n]=run["boxes"][keys[n]]
    rates={n:travel_bound(boxes[n],ops) for n,ops in moves.items()}
    pair_total=math.comb(len(scene),2)
    if beat is None:beat=lambda *progressed:None
    if warn is not None and not first:
        for warning in sweep_warnings(id,scene,moves,keys,study.get("sweptEnvelopes",[]),run["invariance"],run["told"]):warn(warning)
    cut=case["minGapMm"];depth=case.get("maxDepth",9)
    require(number(cut) and cut>=0 and type(depth)==int and 0<=depth<=18,"Invalid clearance or subdivision bound")
    excluded={}
    for ex in case.get("intendedInterfaces",[]):
        a,b=ex["pair"]
        require(a in scene and b in scene and a!=b and named(ex.get("basis")) and ex.get("qualifiedBy"),
                "Intentional motion interfaces need their separately qualified, pinned study")
        evidence=pinned(root,ex["qualifiedBy"])
        record=read(evidence)
        # One record qualifies its own case and pair, and each row it lists under `interfaces`, all on its one STEP.
        listed=record.get("interfaces",[]) if isinstance(record,dict) else []
        require(isinstance(record,dict) and isinstance(listed,list) and record.get("stepSha256") in (None,study["step"]["sha256"])
                and any(isinstance(row,dict) and row.get("case")==id and isinstance(row.get("pair"),list)
                        and set(row["pair"])=={a,b} and row.get("status")=="pass" for row in [record,*listed]),
                "Interface qualification is stale or incomplete")
        excluded[tuple(sorted((a,b)))]=ex["basis"]
    compliant=payload_compression.interfaces(case,scene,excluded,root)
    # rows and constant hold (pair position, value), so the shares of one case merge into the order of a whole run.
    rows=[];constant=[];counts={"broadPhase":0,"bounded":0,"constantPoseBroadPhase":0}
    measured=run["measured"]
    for done,(a,b) in enumerate(combinations(sorted(scene),2)):
        if done%count!=first:continue
        run["phase"]=(2,done)
        beat(done,pair_total,a,b,0,0)
        if (a,b) in compliant:
            rows.append((done,payload_compression.sweep(compliant[a,b],scene,moves,rates,depth,transform,distance)))
            continue
        stationary = a not in moves and b not in moves
        if (stationary and not package) or (a,b) in excluded:continue
        if stationary or (a in moves and b in moves and moves[a]==moves[b]):
            # Their relative pose is constant. Fixtures and initial offsets are not necessarily in the original assembly.
            if constant_pose_separated(boxes[a],boxes[b],cut):
                counts["constantPoseBroadPhase"]+=1;continue
            key=None if keys[a] is None or keys[b] is None else (keys[a],keys[b])
            if key in measured:g,v=measured[key]
            else:
                g=distance(scene[a],scene[b]);v=common(scene[a],scene[b]) if g<=1e-7 else 0
                if key is not None:
                    measured[key]=(g,v);run["fresh"].append((key,(g,v)))
            hit=v>0 or g<cut
            constant.append((done,key))
            rows.append((done,dict(pair=[a,b],status="fail" if hit else "pass",witness=dict(t=0,gapMm=g,volumeMm3=v))))
            continue
        speed=rates.get(a,0)+rates.get(b,0)
        if box_gap(boxes[a],boxes[b])-speed>cut or separate_translations(boxes[a],boxes[b],moves.get(a,[]),moves.get(b,[]),cut):
            counts["broadPhase"]+=1;continue
        if case.get("checkLinearEnvelope") and (linear_envelope_clear(boxes[a],scene[b],moves.get(a,[]),moves.get(b,[]),cut)
                or linear_envelope_clear(boxes[b],scene[a],moves.get(b,[]),moves.get(a,[]),cut)
                or planar_translation_clear(scene[a],scene[b],moves.get(a,[]),moves.get(b,[]),cut)
                or planar_translation_clear(scene[b],scene[a],moves.get(b,[]),moves.get(a,[]),cut)):
            counts["bounded"]+=1
            rows.append((done,dict(pair=[a,b],status="pass",method="enclosed relative linear stroke")))
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
            beat(done,pair_total,a,b,d,len(poses))
            if v>0 or g<cut:failed=dict(t=mid,gapMm=g,volumeMm3=v);break
            lower=g-speed*(hi-lo)/2
            if lower>cut:
                lowest=min(lowest,lower);continue
            if d==depth:
                if unresolved is None:unresolved=[lo,hi]
                continue
            pending.extend([(mid,hi,d+1),(lo,mid,d+1)])
        if failed or unresolved:rows.append((done,dict(pair=[a,b],status="fail" if failed else "open",witness=failed or unresolved)))
        else:
            counts["bounded"]+=1
            rows.append((done,dict(pair=[a,b],status="pass",lowerBoundMm=lowest,samples=len(poses))))
    result=dict(rows=rows,constant=constant,counts=counts)
    if first:return result
    run["phase"]=(3,0)
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
            visited+=1;beat(pair_total,pair_total,a,b,d,visited)
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
    fully_out=None
    if case.get("extract"):
        require(case.get("stage")=="service" and not case.get("initialPose") and not excluded and
                set(case["extract"])==set(moves) and set(moves)<=set(run["shapes"]),
                "An extraction needs the installed start, all fixed obstacles and an explicit moving group")
        fixed=[bounds(body) for key,body in scene.items() if key not in moves]
        require(fixed,"An extraction needs a remaining fixed assembly")
        envelope=[min(b[i] for b in fixed) for i in range(3)]+[max(b[i] for b in fixed) for i in (3,4,5)]
        fully_out=all(box_gap(bounds(transform(scene[key],ops,1)),envelope)>cut for key,ops in moves.items())
    result.update(goals=goals,seats=seats,visibility=visibility,fullyOut=fully_out,installed=len(scene),present=sorted(scene))
    return result


def _combine(case,shares):
    """One case's result from all of its shares, before the reuse count that depends on the cases ahead of it."""
    tail=next(s for s in shares if "goals" in s)
    rows=[row for _,row in sorted((r for s in shares for r in s["rows"]),key=lambda r:r[0])]
    counts={k:sum(s["counts"][k] for s in shares) for k in ("broadPhase","bounded","constantPoseBroadPhase")}
    seats=tail["seats"];goals=tail["goals"];visibility=tail["visibility"]
    observed=[r["status"] for r in [*rows,*seats,*goals,*visibility]]
    status="fail" if "fail" in observed else "open" if "open" in observed or not rows and not seats and not goals and not visibility and not counts["broadPhase"] and not counts["constantPoseBroadPhase"] else "pass"
    extracted=[]
    if case.get("extract"):
        if status=="pass" and tail["fullyOut"]:extracted=sorted(case["moves"])
        elif status=="pass":status="open"
    return dict(case=case["id"],extracted=extracted,status=status,moving=list(case["moves"]),removed=case.get("removed",{}),
                installedCount=tail["installed"],pairs=rows,seats=seats,requiredContacts=goals,visibility=visibility,counts=counts)


def _settle(result,shares,reused,verified):
    """Give a combined case what its place in the study decides: the pairs an earlier case measured, and its extraction."""
    count=0
    for _,key in sorted((c for s in shares for c in s["constant"]),key=lambda c:c[0]):
        if key in reused:count+=1
        elif key is not None:reused.add(key)
    result["counts"]["constantPoseReused"]=count
    if result["extracted"]:verified.append({**result["removed"],**dict.fromkeys(result["extracted"],result["case"])})
    return result


def _heartbeat_line(index,total,id,progressed,case_seconds,total_seconds):
    done,pair_total,a,b,d,samples=progressed
    return (f"[heartbeat] motion {index}/{total} {id} pairs={done}/{pair_total} pair={a}|{b} depth={d} "
            f"samples={samples} case={case_seconds:.2f}s total={total_seconds:.2f}s")


def _portable(error):
    """An error in a form a worker can hand to the coordinating process."""
    try:
        pickle.loads(pickle.dumps(error));return error
    except Exception:
        return RuntimeError(type(error).__name__+": "+str(error))


def _worker(pipe,root,study,package,heartbeat_seconds,loud):
    """Evaluate the shares the coordinating process sends, until it sends None or goes away."""
    try:
        try:run=_open(root,study)
        except Exception as error:
            pipe.send(("broken",_portable(error)));return
        pipe.send(("ready",))
        while True:
            task=pipe.recv()
            if task is None:return
            index,share,known=task
            run["measured"].update(known);run["fresh"]=[]
            last=[perf_counter()];warnings=[]
            def beat(*progressed):
                now=perf_counter()
                if now-last[0]>=heartbeat_seconds:
                    last[0]=now;pipe.send(("beat",index,progressed))
            try:
                result=_share(run,study["cases"][index],share,package=package,beat=beat if loud else None,
                              warn=warnings.append if loud else None)
            except Exception as error:
                pipe.send(("error",index,run["phase"],_portable(error)))
            else:
                pipe.send(("done",index,result,run["fresh"],warnings))
    except (EOFError,OSError,KeyboardInterrupt):
        # The coordinating process ended or cancelled this worker.
        return


def _memory():
    """This process's resident bytes and the machine's available bytes, or None where they are unknown."""
    try:
        if sys.platform=="win32":
            import ctypes
            from ctypes import wintypes
            class Counters(ctypes.Structure):
                _fields_=[("cb",wintypes.DWORD),("faults",wintypes.DWORD)]+[(n,ctypes.c_size_t) for n in
                    ("peak","working","quotaPeakPaged","quotaPaged","quotaPeakNonPaged","quotaNonPaged","pagefile","peakPagefile")]
            class Status(ctypes.Structure):
                _fields_=[("length",wintypes.DWORD),("load",wintypes.DWORD)]+[(n,ctypes.c_ulonglong) for n in
                    ("total","available","totalPage","availablePage","totalVirtual","availableVirtual","extended")]
            kernel=ctypes.WinDLL("kernel32");psapi=ctypes.WinDLL("psapi")
            kernel.GetCurrentProcess.restype=wintypes.HANDLE
            psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
            counters=Counters();counters.cb=ctypes.sizeof(Counters);status=Status();status.length=ctypes.sizeof(Status)
            if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(),ctypes.byref(counters),counters.cb):return None
            if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):return None
            return counters.working,status.available
        resident=int(Path("/proc/self/statm").read_text().split()[1])*os.sysconf("SC_PAGE_SIZE")
        available=next(int(line.split()[1])*1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:"))
        return resident,available
    except Exception:
        return None


def automatic_jobs(units,memory=None):
    """Worker processes for this many units of work, judged once the study's solids are loaded.

    One core stays free for the coordinating process. Every worker loads the study again, so the count also
    stays within four fifths of the available memory, at this process's resident size for each worker."""
    jobs=max(1,min(units,(os.cpu_count() or 2)-1))
    memory=memory or _memory()
    if memory and memory[0]>0:jobs=max(1,min(jobs,int(.8*memory[1]/memory[0])))
    return jobs


def _parallel(run,jobs,plan,*,package_scene,progress,fail_fast,never_stop,heartbeat_seconds,started):
    """Evaluate the planned shares in worker processes and return the cases in study order.

    plan gives the number of shares of each case. Shares are handed out in study order. A case is combined
    when its last share arrives and settled once every case ahead of it has settled, so the cases returned
    are the ones a single process returns. A scene callback runs in this process, on scenes built here."""
    import multiprocessing
    from multiprocessing.connection import wait
    import threading
    from time import sleep
    study=run["study"];cases=study["cases"];total=len(cases)
    queue=[(i,(k,n)) for i,n in enumerate(plan) for k in range(n)]
    state=[dict(shares=[],errors=[],began=None,beat=None,result=None) for _ in cases]
    limit=[total]
    viewed=[None]*total
    def view():
        # The callback sees each scene in study order, as it does in one process.
        for i,case in enumerate(cases):
            if i>=limit[0]:return
            try:
                scene,_=_scene(dict(run),case)
                built=dict(scene)
                package_scene(case,scene)
                if scene.keys()!=built.keys() or any(scene[n] is not built[n] for n in scene):
                    raise RuntimeError("A scene callback that replaces a body needs one process: use jobs=1")
                viewed[i]=True
            except Exception as error:
                viewed[i]=error;return
    context=multiprocessing.get_context("spawn")
    workers=[];ended=[]
    ledger=[];known=set();told=set();present=set()
    results=[];case_ids=set();reused=set();verified=[];stopped=None;settled=0
    def cancel(index):
        # Nothing from this case on can enter the result.
        if index>=limit[0]:return
        limit[0]=index
        queue[:]=[t for t in queue if t[0]<index]
        for w in workers:
            if w["process"] is not None and w["task"] is not None and w["task"][0]>=index:
                w["process"].terminate();w["pipe"].close();ended.append(w["process"])
                w["task"]=w["process"]=None
    viewer=None
    try:
        for _ in range(jobs):
            ours,theirs=context.Pipe()
            process=context.Process(target=_worker,daemon=True,
                                    args=(theirs,run["root"],study,package_scene is not None,heartbeat_seconds,progress is not None))
            process.start();theirs.close()
            workers.append(dict(pipe=ours,process=process,task=None,ready=False,sent=0))
        if package_scene is not None:
            viewer=threading.Thread(target=view,daemon=True);viewer.start()
        while settled<limit[0]:
            now=perf_counter()
            for w in workers:
                if w["process"] is not None and w["ready"] and w["task"] is None and queue:
                    index,share=w["task"]=queue.pop(0)
                    if state[index]["began"] is None:state[index]["began"]=state[index]["beat"]=now
                    w["pipe"].send((index,share,ledger[w["sent"]:]));w["sent"]=len(ledger)
            busy=[w for w in workers if w["process"] is not None and (w["task"] is not None or not w["ready"])]
            if busy:arrived=wait([w["pipe"] for w in busy],timeout=.2)
            else:
                arrived=[];sleep(.02)
            for w in busy:
                # A message that cancels later cases may have ended a worker further down this list.
                if w["process"] is None or w["pipe"] not in arrived:continue
                try:message=w["pipe"].recv()
                except (EOFError,OSError):
                    at="" if w["task"] is None else " in case "+str(cases[w["task"][0]].get("id"))
                    raise RuntimeError("A motion worker ended unexpectedly"+at+". If memory ran out, rerun with fewer --jobs")
                kind=message[0];now=perf_counter()
                if kind=="broken":raise RuntimeError("A motion worker could not load the study: "+str(message[1]))
                if kind=="ready":w["ready"]=True
                elif kind=="beat":
                    index=message[1];entry=state[index]
                    if now-entry["beat"]>=heartbeat_seconds:
                        entry["beat"]=now
                        progress(_heartbeat_line(index+1,total,cases[index]["id"],message[2],now-entry["began"],now-started))
                elif kind=="error":
                    index=message[1];w["task"]=None
                    state[index]["errors"].append((message[2],message[3]))
                    cancel(index+1)
                else:
                    index=message[1];entry=state[index];case=cases[index];w["task"]=None
                    for key,value in message[3]:
                        if key not in known:
                            known.add(key);ledger.append((key,value))
                    for seen,line in message[4]:
                        # Each worker repeats a warning once; the study reports it once.
                        if seen[2] is not None and seen in told:continue
                        told.add(seen);progress(line)
                    part=message[2];entry["shares"].append(part)
                    present.update(part.get("present",()))
                    stops=fail_fast and case["id"] not in never_stop
                    if stops and any(r["status"]!="pass" for r in [*(row for _,row in part["rows"]),*part.get("goals",[]),
                                                                   *part.get("seats",[]),*part.get("visibility",[])]):
                        cancel(index+1)
                    if len(entry["shares"])==plan[index]:
                        entry["result"]=_combine(case,entry["shares"])
                        if progress:progress(progress_line(index+1,total,entry["result"],now-entry["began"],now-started))
                        if stops and entry["result"]["status"]!="pass":cancel(index+1)
            while settled<limit[0]:
                entry=state[settled];case=cases[settled]
                early=[e for e in entry["errors"] if e[0]<(1,0)]
                complete=len(entry["shares"])+len(entry["errors"])==plan[settled] and (viewer is None or viewed[settled] is not None)
                if not (early or complete):break
                id=case["id"]
                require(named(id) and id not in case_ids and named(case.get("basis")),"Unique case ID and physical basis required")
                case_ids.add(id)
                if early:raise early[0][1]
                _removal(case,verified)
                if isinstance(viewed[settled],Exception):raise viewed[settled]
                if entry["errors"]:raise min(entry["errors"],key=lambda e:e[0])[1]
                results.append(_settle(entry["result"],entry["shares"],reused,verified))
                settled+=1
                if fail_fast and results[-1]["status"]!="pass" and id not in never_stop:
                    stopped=id;cancel(settled)
    finally:
        limit[0]=0
        for w in workers:
            if w["process"] is None:continue
            try:
                if w["task"] is None and w["ready"]:w["pipe"].send(None)
                else:w["process"].terminate()
            except (OSError,ValueError):w["process"].terminate()
            ended.append(w["process"])
        for process in ended:
            process.join(5)
            if process.is_alive():
                process.terminate();process.join()
        for w in workers:
            if w["process"] is not None:w["pipe"].close()
        if viewer is not None:viewer.join()
    return results,stopped,present


def evaluate(root,study,*,mount_hosts=(),package_scene=None,progress=None,fail_fast=False,never_stop=(),heartbeat_seconds=HEARTBEAT_SECONDS,jobs=1):
    """Evaluate every case and return the cases in study order.

    progress receives one line per finished case, a heartbeat line when heartbeat_seconds have passed
    inside a case without one, and advisory sweep warnings. None of them enters the result. With fail_fast, the first case whose status is not
    "pass" ends the study. Its cases up to and including that case are returned and the result is
    marked partial with the stopping case, the checked cases and the skipped cases. Cases named in
    never_stop, such as an adverse control that is expected to fail, never end the study.

    jobs is the number of worker processes; None chooses it from the cores and the memory available.
    With one job the cases run in this process, one after another. With more, the result is the same and
    only the progress lines differ: cases finish in any order, and a fail_fast run may report a case that
    follows the one it stops at. A package_scene callback then runs in this process and may not replace a body.
    """
    require(study.get("schema")=="agent-frc/mechanical-motion@1","Unknown motion study")
    declared=study.get("sweptEnvelopes",[])
    require(isinstance(declared,list) and all(named(n) for n in declared),"sweptEnvelopes lists the IDs of bodies modeled as full swept volumes")
    require(number(heartbeat_seconds) and heartbeat_seconds>=0,"Heartbeat interval must be zero or more seconds")
    require(jobs is None or type(jobs)==int and jobs>=1,"Jobs must be a whole number of worker processes, one or more")
    started=perf_counter()
    run=_open(root,study)
    shapes=run["shapes"]
    host_bounds={n:bounds(shapes[n]) for n in sorted(mount_hosts) if n in shapes}
    cases=study["cases"];total=len(cases)
    plan=[1]*total
    if jobs!=1:
        # Only a case with enough body pairs is shared. A malformed case counts as one unit and fails where it runs.
        def size(case):
            try:return math.comb(len(shapes)+len(case.get("fixtures",[]))-len(case.get("removed",{})),2)//PAIRS_PER_SHARE
            except (AttributeError,TypeError,ValueError):return 0
        sizes=[size(case) for case in cases]
        if jobs is None:jobs=automatic_jobs(sum(max(1,s) for s in sizes))
        plan=[max(1,min(jobs,s)) for s in sizes]
        jobs=min(jobs,sum(plan))
    if jobs>1:
        results,stopped,present=_parallel(run,jobs,plan,package_scene=package_scene,progress=progress,fail_fast=fail_fast,
                                          never_stop=never_stop,heartbeat_seconds=heartbeat_seconds,started=started)
    else:
        case_ids=set();results=[];verified=[];reused=set();present=set();stopped=None
        for index,case in enumerate(cases,1):
            case_started=perf_counter()
            id=case["id"]
            require(named(id) and id not in case_ids and named(case.get("basis")),"Unique case ID and physical basis required")
            case_ids.add(id)
            last_line=[case_started]
            def beat(*progressed):
                now=perf_counter()
                if now-last_line[0]>=heartbeat_seconds:
                    last_line[0]=now
                    progress(_heartbeat_line(index,total,id,progressed,now-case_started,now-started))
            share=_share(run,case,package=package_scene is not None,package_scene=package_scene,verified=verified,
                         beat=beat if progress else None,warn=(lambda warning:progress(warning[1])) if progress else None)
            present.update(share["present"])
            results.append(_settle(_combine(case,[share]),[share],reused,verified))
            now=perf_counter()
            if progress:progress(progress_line(index,total,results[-1],now-case_started,now-started))
            if fail_fast and results[-1]["status"]!="pass" and id not in never_stop:
                stopped=id;break
    require(results,"Supply at least one operating or service case")
    result={"schema":"agent-frc/mechanical-motion-result@1","stepSha256":digest(run["original"]),"occurrences":run["identities"],"nonSolidLeafCount":len(run["non_solids"]),"mountHostBoundsMm":host_bounds,"cases":results}
    if stopped is not None:
        # A partial receipt can never stand for the whole study: the skipped cases are neither run nor validated.
        skipped=[c.get("id") for c in cases[len(results):]]
        result.update(partial=True,stoppedAt=stopped,checkedCases=[r["case"] for r in results],skippedCases=skipped)
        if progress:progress(f"[motion] fail-fast stopped at {stopped}; skipped {len(skipped)} case{'' if len(skipped)==1 else 's'}: "+(", ".join(map(str,skipped)) or "none"))
    elif progress:
        for name in declared:
            if name not in present:progress(f"[motion] warning sweptEnvelopes names {name}, which no case contains")
    return result


def reuse(root,study,results,*,mount_hosts=(),package_scene=None):
    """The result evaluate returns for this study, with the case results an earlier run of the same study recorded.

    No pair is checked. The STEP and each case's fixtures are loaded and every scene is built at its start pose
    for the package_scene callback, as evaluate builds them. The caller answers for the study, the STEP and the
    fixtures being the ones those results came from; every pinned file is still read against its digest."""
    require(study.get("schema")=="agent-frc/mechanical-motion@1","Unknown motion study")
    run=_open(root,study)
    shapes=run["shapes"]
    cases=study["cases"]
    require([c.get("id") for c in cases]==[r.get("case") for r in results],"The recorded results do not cover the cases of this study in order")
    for case in cases:
        scene,_=_scene(dict(run),case)
        if package_scene is not None:package_scene(case,scene)
    return {"schema":"agent-frc/mechanical-motion-result@1","stepSha256":digest(run["original"]),"occurrences":run["identities"],
            "nonSolidLeafCount":len(run["non_solids"]),"mountHostBoundsMm":{n:bounds(shapes[n]) for n in sorted(mount_hosts) if n in shapes},
            "cases":list(results)}


def stderr_progress(line):
    print(line,file=sys.stderr,flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project",type=Path);parser.add_argument("study");parser.add_argument("--require-pass",action="store_true")
    parser.add_argument("--fail-fast",action="store_true",help="Stop at the first case that does not pass and write a partial receipt")
    parser.add_argument("--quiet",action="store_true",help="Omit progress, heartbeat and warning lines on stderr")
    parser.add_argument("--heartbeat",type=float,default=HEARTBEAT_SECONDS,metavar="SECONDS",
                        help="Seconds inside a case before a stderr line names the active pair (default 30)")
    parser.add_argument("--jobs",type=int,default=1,metavar="N",help="Worker processes that share the cases (default 1)")
    args=parser.parse_args()
    try:
        root=args.project.resolve()
        # A study checked on its own names its files by path; a typed SHA-256 is verified and none is required.
        res=evaluate(root,fill_digests(root,read(project_path(root,args.study))),progress=None if args.quiet else stderr_progress,fail_fast=args.fail_fast,
                     heartbeat_seconds=args.heartbeat,jobs=args.jobs)
        print(json.dumps(res,indent=2,allow_nan=False))
        sys.exit(int(args.require_pass and (res.get("partial",False) or any(c["status"]!="pass" for c in res["cases"]))))
    except (OSError,ValueError,TypeError,KeyError,ImportError) as e:
        sys.exit(str(e))
