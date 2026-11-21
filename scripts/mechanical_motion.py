"""Certify registered rigid-body sweep intervals and evaluate as-built planar support seats in millimeters."""
import argparse
import json
import math
from pathlib import Path
import sys
from itertools import combinations, product

from mechanical_readiness import named,number,pinned,project_path,read,require,digest
from showcase_contacts import load_solids,box_gap


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


def transform(shape,moves,t):
    from OCP.gp import gp_Trsf,gp_Vec
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
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
        linear=[0.,0.,0.];square=[0.,0.,0.]
        for move in moves:
            if move["kind"]=="translation":
                linear=[x+y for x,y in zip(linear,move["travelMm"])]
            elif move["kind"]=="gravity-drop":
                h=move["fallMm"];w=move["quadraticFraction"]
                linear[2]-=h*(1-w);square[2]-=h*w
            else:return None
        return linear,square
    pa,pb=coefficients(ma),coefficients(mb)
    if pa is None or pb is None:return False
    for i in range(3):
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


def evaluate(root,study):
    require(study.get("schema")=="agent-frc/mechanical-motion@1","Unknown motion study")
    original=pinned(root,study["step"])
    identities={}
    shapes,_=load_solids(original,identities)
    case_ids=set();results=[];extractions={}
    for case in study["cases"]:
        id=case["id"]
        require(named(id) and id not in case_ids and named(case.get("basis")),"Unique case ID and physical basis required")
        case_ids.add(id)
        scene=dict(shapes)
        for ext in case.get("fixtures",[]):
            source,_=load_solids(pinned(root,ext["file"]))
            require(ext["id"] not in scene and named(ext.get("basis")),"Duplicate or unjustified tool/piece/field fixture")
            scene[ext["id"]]=source[ext["solid"]]
        removed=case.get("removed",{})
        for key,prior in removed.items():
            require(case.get("stage")=="service" and key in shapes and prior in extractions and
                    key in extractions[prior],"A service removal requires a previously verified complete extraction of that installed body")
            del scene[key]
        moves=case["moves"]
        require(isinstance(moves,dict) and moves and set(moves)<=set(scene),"Motion references absent installed parts")
        for name,ops in case.get("initialPose",{}).items():
            require(name in scene,"Initial pose names absent body")
            scene[name]=transform(scene[name],ops,1)
        boxes={n:bounds(s) for n,s in scene.items()}
        rates={n:travel_bound(boxes[n],ops) for n,ops in moves.items()}
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
        rows=[];counts={"broadPhase":0,"bounded":0}
        for a,b in combinations(sorted(scene),2):
            if (a not in moves and b not in moves) or (a,b) in excluded:continue
            if a in moves and b in moves and moves[a]==moves[b]:
                # Their relative pose is constant. Fixtures and initial offsets are not necessarily in the original assembly.
                g=distance(scene[a],scene[b]);v=common(scene[a],scene[b]) if g<=1e-7 else 0
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
            for t in (lo,hi):
                gap=separation(t)
                if gap<=limit:
                    reached=dict(t=t,gapMm=gap);break
            while pending and reached is None:
                low,high,d=pending.pop();mid=(low+high)/2;gap=separation(mid)
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
        status="fail" if "fail" in observed else "open" if "open" in observed or not rows and not seats and not goals and not visibility and not counts["broadPhase"] else "pass"
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
                extractions[id]=extracted
            elif status=="pass":
                status="open"
        results.append(dict(case=id,extracted=extracted,status=status,moving=list(moves),removed=removed,installedCount=len(scene),pairs=rows,seats=seats,requiredContacts=goals,visibility=visibility,counts=counts))
    require(results,"Supply at least one operating or service case")
    return {"schema":"agent-frc/mechanical-motion-result@1","stepSha256":digest(original),"occurrences":identities,"cases":results}

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project",type=Path);parser.add_argument("study");parser.add_argument("--require-pass",action="store_true")
    args=parser.parse_args()
    try:
        root=args.project.resolve();res=evaluate(root,read(project_path(root,args.study)))
        print(json.dumps(res,indent=2,allow_nan=False))
        sys.exit(int(args.require_pass and any(c["status"]!="pass" for c in res["cases"])))
    except (OSError,ValueError,TypeError,KeyError,ImportError) as e:
        sys.exit(str(e))
