"""Reconcile an independently observed loaded duty with the full prescribed geometric replay."""
import math
import os
from pathlib import Path
from mechanical_readiness import digest, named, number, pinned, read, require
from mechanical_motion import common, distance, transform


def placed(shape, offset):
    return transform(shape,[dict(kind="translation",travelMm=offset)],1)


def contact_normal(piece, member, point, force):
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_IN, TopAbs_ON
    from OCP.gp import gp_Pnt
    require(isinstance(point,list) and len(point)==3 and all(number(v) for v in point) and
            isinstance(force,list) and len(force)==3 and all(number(v) for v in force)
            and math.hypot(*force)>0, "Record the contact point and signed force on the piece")
    normal=[v/math.hypot(*force) for v in force]
    def location(shape,offset):
        return BRepClass3d_SolidClassifier(shape,gp_Pnt(*[p+n*offset for p,n in zip(point,normal)]),1e-7).State()
    require(location(piece,0)==TopAbs_ON and location(member,0)==TopAbs_ON and
            location(piece,1e-4)==TopAbs_IN and location(member,-1e-4)==TopAbs_IN,
            "Recorded reaction does not enter the loaded piece from its contacting member")


def supported_segment(shape, point, end, displacement, force, outward):
    """Check the entire straight contact locus on one finite trimmed supporting face."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge,BRepBuilderAPI_MakeVertex
    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
    from OCP.BRepGProp import BRepGProp
    from OCP.GeomAbs import GeomAbs_Cylinder,GeomAbs_Plane,GeomAbs_Sphere
    from OCP.GProp import GProp_GProps
    from OCP.gp import gp_Pnt
    from OCP.TopAbs import TopAbs_FACE,TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    relative=[p-v for p,v in zip(end,displacement)]
    length=math.dist(point,relative)
    probe=(BRepBuilderAPI_MakeEdge(gp_Pnt(*point),gp_Pnt(*relative)).Edge() if length>1e-7 else
            BRepBuilderAPI_MakeVertex(gp_Pnt(*point)).Vertex())
    faces=TopExp_Explorer(shape,TopAbs_FACE)
    while faces.More():
        face=(getattr(TopoDS,"Face_s",None) or TopoDS.Face)(faces.Current());faces.Next()
        surface=BRepAdaptor_Surface(face)
        kind=surface.GetType()
        if kind==GeomAbs_Plane:
            axis=surface.Plane().Axis().Direction().Coord()
        elif kind in (GeomAbs_Cylinder,GeomAbs_Sphere):
            obj=surface.Cylinder() if kind==GeomAbs_Cylinder else surface.Sphere()
            center=obj.Location().Coord()
            def radial(p):
                v=[x-y for x,y in zip(p,center)]
                if kind==GeomAbs_Cylinder:
                    line=obj.Axis().Direction().Coord()
                    along=sum(a*b for a,b in zip(line,v));v=[x-along*y for x,y in zip(v,line)]
                mag=math.hypot(*v)
                return [x/mag for x in v] if mag else [0.,0.,0.]
            axis=radial(point)
            if math.dist(axis,radial(relative))>1e-8:continue
        else:continue
        sign=-1 if face.Orientation()==TopAbs_REVERSED else 1
        alignment=sum(a*f for a,f in zip(axis,force))*sign*outward/math.hypot(*force)
        if alignment<1-1e-8:continue
        if length<=1e-7:
            check=BRepExtrema_DistShapeShape(probe,face)
            if check.IsDone() and check.Value()<=1e-7:return True
        else:
            overlap=BRepAlgoAPI_Common(probe,face);props=GProp_GProps()
            if overlap.IsDone():
                BRepGProp.LinearProperties_s(overlap.Shape(),props)
                if abs(props.Mass()-length)<=1e-7:return True
    return False


def inspect(root, study, test, trace, parts, piece, stock, *, installed_at=None, rotates=None, mission=None, article=None):
    if installed_at is None:
        installed_at=lambda f,n:placed(parts[n],f["offsetsMm"].get(n,[0,0,0]))

    frames=trace["frames"];identity=trace["pieceId"];zero=[0,0,0]
    initial=frames[0]["offsetsMm"]
    def part_at(f):
        return article.at(article.index[f["timeS"]]) if article else placed(piece,f["offsetsMm"][identity])
    admitted=part_at(frames[0])
    for name,shape in {**parts,**stock}.items():
        obstacle=installed_at(frames[0],name) if name in parts else placed(shape,initial.get(name,zero))
        overlap=common(admitted,obstacle) if distance(admitted,obstacle)<=1e-7 else 0
        if overlap>0:
            return "fail",f"Initial admitted piece penetrates {name} by {overlap:.9g} mm^3"
    if any(f["custody"]=="guided" for f in frames):
        guide=trace["guide"]
        cited=read(pinned(root,trace["trajectorySource"]))
        if "frames" in cited and cited["frames"]!=frames:
            return "fail","Proposed trajectory contradicts the clock and positions in its own executed source"
        for f in frames:
            if f["custody"]=="guided" and distance(part_at(f),
                    installed_at(f,guide))>1e-6:
                return "fail","The named guide cannot reach the article at the claimed time"
    ref=test.get("execution")
    if not ref:
        return "open","No independently registered observed loaded execution"
    source=pinned(root,ref);raw=read(source)
    ledger=os.environ.get("FRC_TRANSFER_EXECUTIONS")
    if not ledger:return "open","Independent execution inventory is unavailable"
    inventory=Path(ledger).resolve()
    require(not inventory.is_relative_to(root) and inventory.is_file(),"Transfer execution inventory must be independent of candidate")
    registered=read(inventory)
    require(registered.get("schema")=="agent-frc/observed-transfer-inventory@1" and
            digest(source) in registered["observed"],"Execution is absent from independent operator inventory")
    witness=registered["observed"][digest(source)]
    if mission is not None:
        from transfer_mission import identity as mission_identity
        require(witness.get("missionSha256")==mission_identity(mission),
                "Independent observer did not register this run for the commissioned article, recipient and duty")
    require(witness.get("origin") in ("executed-simulation","physical-measurement") and named(witness.get("observer")) and
            named(witness.get("producer")) and named(witness.get("basis")),"Register who observed the executed solver or instrument")
    require(raw.get("schema")=="agent-frc/observed-transfer@1" and raw.get("outcome")=="pass" and
            all(raw.get(k)==trace.get(k) for k in ("stepSha256","pieceSha256","pieceId","case","stockIds","holder")) and
            raw.get("frames")==frames and raw.get("windowS")==test["windowS"] and raw.get("duty")==test["duty"],
            "Executed event clock, disposition, identity or motion differs from the proposed duty")
    if "trajectorySource" in trace:
        require(pinned(root,trace["trajectorySource"])==source,"Guided route contradicts its registered execution")
    events=raw["observations"]
    require(len(events)==len(frames),"Every executed time must retain its observed physical state")
    center=raw.get("centerOfMassLocalMm")
    require(isinstance(center,list) and len(center)==3 and all(number(n) for n in center),
            "Identify the admitted article's center of mass in its source pose")
    obstruction=False
    for i,(frame,event) in enumerate(zip(frames,events)):
        require(event.get("timeS")==frame["timeS"],"Execution contact clock differs")
        custody=frame["custody"]
        if custody=="free" or i and frames[i-1]["custody"]=="free":
            body=trace["holder"];holder=installed_at(frame,body);obj=part_at(frame)
            gap=distance(obj,holder)
            if gap<=1e-7:
                require(common(obj,holder)==0,"Released article penetrates its original support at the reported release")
                require(custody=="free" and (i==0 or frames[i-1]["custody"]!="free"),
                        "Released article still contacts its donor after free motion began")
            if custody=="free":
                require(not event.get("contacts"),"Free motion cannot retain a measured contact reaction")
                continue
        mass=raw.get("massKg");acc=event.get("accelerationMmS2")
        require(number(mass) and mass>0 and isinstance(acc,list) and len(acc)==3 and all(number(n) for n in acc),
                "Executed custody needs piece mass and observed three-axis acceleration")
        force_sum=[0.,0.,-mass*study["gravityMmS2"]/1000]
        moments=[0.,0.,0.]
        final_moments=[0.,0.,0.]
        cg=[c+x for c,x in zip(center,frame["offsetsMm"][identity])]
        if event.get("obstructed") is True:
            actuator=event.get("actuator")
            demand=event.get("commandedOffsetMm")
            measured=frame["offsetsMm"].get(actuator)
            require(custody=="jammed" and actuator in parts and measured is not None and isinstance(demand,list)
                    and len(demand)==3 and all(number(n) for n in demand) and math.dist(demand,measured)>study["traceToleranceMm"],
                    "A jam needs an identified actuator and measured lost commanded travel")
            obstruction=True
        supports=event.get("contacts",[])
        required=trace["holder"] if i==0 else trace.get("guide") if custody=="guided" else raw.get("receiver") if custody=="received" else None
        require(supports and (not required or required in {r["body"] for r in supports}),"Observed custody lacks required physical support")
        for contact in supports:
            body=contact["body"]
            require(body in parts,
                    "Observed support needs a compressive contact reaction on an installed body")
            obj=part_at(frame)
            member=installed_at(frame,body)
            require(distance(obj,member)<=1e-6 and common(obj,member)<=1e-9,
                    "Observed support cannot reach the admitted object without penetration")
            force=contact["forceOnPieceN"]
            contact_normal(obj,member,contact["pointMm"],force)
            force_sum=[x+y for x,y in zip(force_sum,force)]
            arm=[(x-y)/1000 for x,y in zip(contact["pointMm"],cg)]
            for k in range(3):moments[k]+=arm[(k+1)%3]*force[(k+2)%3]-arm[(k+2)%3]*force[(k+1)%3]
            if i+1<len(frames):
                if rotates and rotates(frame,frames[i+1],body):
                    return "open","Continuous support on a rotating finite contact needs a qualified force-path model"
                after=frames[i+1]["offsetsMm"]
                def displacement(key):
                    return [x-y for x,y in zip(after.get(key,zero),frame["offsetsMm"].get(key,zero))]
                move=displacement(identity)
                track=contact.get("nextPointMm",[p+d for p,d in zip(contact["pointMm"],move)])
                require(len(track)==3 and all(number(n) for n in track),"Missing contact path on the moving support")
                if article and article.rotating:
                    from rigid_article import rotating_face_path
                    on_article=rotating_face_path(article,i,contact["pointMm"],track,force)
                else:on_article=supported_segment(obj,contact["pointMm"],track,move,force,-1)
                if not (on_article and
                        supported_segment(member,contact["pointMm"],track,displacement(body),force,1)):
                    return "open","Continuous contact on the finite reaction surfaces is unqualified"
                finish=[(x-y-z)/1000 for x,y,z in zip(track,cg,move)]
                for k in range(3):final_moments[k]+=finish[(k+1)%3]*force[(k+2)%3]-finish[(k+2)%3]*force[(k+1)%3]
        require(math.dist(force_sum,[v*mass/1000 for v in acc])<=1e-6,
                "Observed forces and gravity do not account for measured translation")
        require(max(math.hypot(*moments),math.hypot(*final_moments))<=1e-6,"Observed contact wrench cannot sustain the recorded angular motion")
    terminal=events[-1]
    if test["duty"]=="delivery":
        require(raw.get("receiver") in parts and terminal.get("acceptedId")==identity,"No observed receiver admission of this piece")
    else:
        require(raw.get("resetObserved") is True and terminal.get("ready") is True and
                obstruction,"No observed loaded obstruction and return to ready")
    if mission is not None:
        if any(f["custody"]=="free" for f in frames):
            from release_onset import verify_executed
            verify_executed(root,study,test,trace,raw,witness)
        from transfer_mission import verify_terminal
        verify_terminal(mission,raw,trace,study,piece,installed_at,rotates,article=article)
    if article and article.dynamics_error:return "open",article.dynamics_error
    return "pass","Full executed clock, physical contacts and terminal observation reconciled"
