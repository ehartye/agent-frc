"""Construct a bounded, unilateral equilibrium witness on the actual CAD bearing patches."""
import json
import math
from itertools import product
import numpy as np

from mechanical_readiness import require,number
from mechanical_motion import common,distance,bounds,vec


def properties(shape,volume=False):
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    g=GProp_GProps()
    if volume:BRepGProp.VolumeProperties_s(shape,g,True)
    else:BRepGProp.SurfaceProperties_s(shape,g)
    return g.Mass(),list(g.CentreOfMass().Coord())


def bearing_cells(a,b,direction,pressure):
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon,BRepBuilderAPI_MakeFace
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE,TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Pnt
    d=np.asarray(direction)
    require(abs(np.linalg.norm(d)-1)<1e-8,"A reaction direction must be a unit vector")
    def surfaces(s,n):
        it=TopExp_Explorer(s,TopAbs_FACE)
        while it.More():
            f=(getattr(TopoDS,"Face_s",None) or TopoDS.Face)(it.Current());it.Next()
            surf=BRepAdaptor_Surface(f)
            if surf.GetType()!=GeomAbs_Plane:continue
            normal=np.array(surf.Plane().Axis().Direction().Coord())
            if f.Orientation()==TopAbs_REVERSED:normal=-normal
            if np.linalg.norm(normal-n)<1e-8:yield f
    def intersection(a,b):
        tool=BRepAlgoAPI_Common(a,b);require(tool.IsDone() and not tool.Shape().IsNull(),"Unresolved trimmed bearing intersection")
        return tool.Shape()
    cells=[]
    u=np.cross(d,np.eye(3)[np.argmin(abs(d))]);u/=np.linalg.norm(u);v=np.cross(d,u)
    for af,bf in product(surfaces(a,d),surfaces(b,-d)):
        if distance(af,bf)>1e-7:continue
        seat=intersection(af,bf);area,c=properties(seat)
        if area<=1e-9:continue
        c=np.asarray(c);bb=bounds(seat);points=np.array(list(product(*zip(bb[:3],bb[3:]))))-c
        xs=np.linspace(min(points@u)-1e-5,max(points@u)+1e-5,4)
        ys=np.linspace(min(points@v)-1e-5,max(points@v)+1e-5,4)
        measured=0.
        for x0,x1 in zip(xs,xs[1:]):
            for y0,y1 in zip(ys,ys[1:]):
                wire=BRepBuilderAPI_MakePolygon()
                for x,y in ((x0,y0),(x1,y0),(x1,y1),(x0,y1)):
                    wire.Add(gp_Pnt(*(c+x*u+y*v)))
                wire.Close();cut=intersection(seat,BRepBuilderAPI_MakeFace(wire.Wire()).Face())
                n,center=properties(cut);measured+=n
                if n>1e-10:cells.append(dict(pointMm=center,direction=(-d).tolist(),capacityN=n*pressure,areaMm2=n,footprintBoundsMm=bb))
        require(abs(measured-area)<=max(1e-7,area*1e-7),"Trimmed pressure cells do not reconcile to the original patch")
    return cells


def wrench(force,point,origin):
    return np.r_[force,np.cross(np.asarray(point)-origin,force)]


def bounded_fit(matrix,target,upper):
    """Bounded least squares. Recheck the unscaled force and moment independently."""
    a=np.array(matrix);b=np.array(target);u=np.array(upper);x=np.zeros(len(u))
    fixed=np.full(len(u),-1);tol=1e-10
    for _ in range(20*len(u)+50):
        gradient=a.T@(b-a@x)
        gain=np.where(fixed==-1,gradient,np.where(fixed==1,-gradient,0))
        if max(gain,default=0)<=tol:break
        fixed[int(np.argmax(gain))]=0
        for _ in range(2*len(u)+4):
            free=fixed==0;z=x.copy()
            z[free]=np.linalg.lstsq(a[:,free],b-a[:,~free]@x[~free],rcond=1e-12)[0]
            hits=[]
            for j in np.where(free)[0]:
                if z[j]<-tol:hits.append(((0-x[j])/(z[j]-x[j]),j,-1))
                if z[j]>u[j]+tol:hits.append(((u[j]-x[j])/(z[j]-x[j]),j,1))
            if not hits:x=np.clip(z,0,u);break
            t,j,side=min(hits);x=np.clip(x+max(0,min(1,t))*(z-x),0,u);fixed[j]=side
        else:break
    return x


def normal_support_limit(body,anchor,contacts,load,origin):
    """Necessary geometric limits, independent of the pressure-cell discretization."""
    rows=[c for c in contacts if body in (c["from"],c["to"])]
    if not rows:return None
    local=[np.asarray(c["direction"])*(1 if c["from"]==body else -1) for c in rows]
    n=local[0];p=np.asarray(rows[0]["pointMm"])
    if any(np.linalg.norm(d-n)>1e-9 or abs((np.asarray(r["pointMm"])-p)@n)>1e-6 for r,d in zip(rows,local)):return None
    # All reactions are unilateral and share a normal. Their center lies in the
    # convex hull of the true patches, hence within its enclosing coordinate box.
    amount=-float(load[:3]@n);twist=float(load[3:]@n)
    shear=float(np.linalg.norm(load[:3]+amount*n))
    result=dict(requiredNormalN=amount,unsupportedNormalMomentNmm=twist,unsupportedShearN=shear,
                impossible=bool(amount < -1e-7 or shear>1e-7 or abs(twist)>1e-6))
    if amount>1e-7:
        center=origin+np.cross(n,-load[3:])/amount+n*((p-origin)@n)
        boxes=np.asarray([r.get("footprintBoundsMm",r["pointMm"]*2) for r in rows])
        lower=boxes[:,:3].min(axis=0);upper=boxes[:,3:].max(axis=0)
        excess=float(max(0.,max(lower-center),max(center-upper)))
        result.update(requiredCenterMm=center.tolist(),supportBoundsMm=[*lower.tolist(),*upper.tolist()],
                      outsideMm=excess,missingMomentLowerBoundNmm=amount*excess)
        result["impossible"] |= amount*excess>1e-6
    elif np.linalg.norm(load[3:])>1e-6:
        result["impossible"]=True
    return result


def solve(members,anchor,contacts,forces,moments):
    free=[b for b in members if b!=anchor]
    require(free and len(set(members))==len(members),"Need distinct free bodies and an installed anchor")
    origin=np.array(contacts[0]["pointMm"] if contacts else [0,0,0],dtype=float)
    load=np.zeros((len(free),6))
    for row in forces:
        require(row["body"] in free,"External load acts outside the commissioned free bodies")
        load[free.index(row["body"])]+=wrench(vec(row["forceN"]),vec(row["pointMm"]),origin)
    for row in moments:
        require(row["body"] in free,"External couple acts outside the commissioned free bodies")
        load[free.index(row["body"]),3:]+=vec(row["momentNmm"])
    a=np.zeros((len(free),6,len(contacts)))
    for j,c in enumerate(contacts):
        vec(c["pointMm"]);unit=vec(c["direction"])
        require(abs(math.hypot(*unit)-1)<1e-8 and number(c["capacityN"]) and c["capacityN"]>=0,
                "Missing qualified unilateral reaction direction and force allowance")
        column=wrench(unit,c["pointMm"],origin)
        for name,sign in ((c["from"],1),(c["to"],-1)):
            require(name in members,"A reaction member is outside the selected assembly")
            if name!=anchor:a[free.index(name),:,j]+=sign*column
    lever=max([1.]+[math.dist(origin,row["pointMm"]) for row in [*contacts,*forces]])
    scale=np.tile([1,1,1,1/lever,1/lever,1/lever],len(free))
    system=a.reshape(len(free)*6,len(contacts))
    magnitudes=bounded_fit(system*scale[:,None],-load.flatten()*scale,[c["capacityN"] for c in contacts]) if contacts else np.zeros(0)
    residual=(system@magnitudes).reshape(-1,6)+load
    limits={b:normal_support_limit(b,anchor,contacts,load[i],origin) for i,b in enumerate(free)}
    impossible=any(v and v["impossible"] for v in limits.values())
    return dict(normalSupportLimits=limits,status="fail" if impossible else "pass" if all(np.linalg.norm(r[:3])<=1e-7 and np.linalg.norm(r[3:])<=1e-6 for r in residual) else "open",
                originMm=origin.tolist(),externalWrenchesN_Nmm={b:load[i].tolist() for i,b in enumerate(free)},
                reactionsN=magnitudes.tolist(),residualsN_Nmm={b:residual[i].tolist() for i,b in enumerate(free)})


def applied(route,members,center_mass):
    require("appliedForces" in route and "appliedMomentsNmm" in route and "gravityMmS2" in route,
            "Commission all simultaneous point forces, free couples and gravity, including explicit empty lists")
    def forces(rows):
        require(isinstance(rows,list),"All simultaneous forces and couples must be explicitly inventoried")
        for row in rows:
            required={"pointMm","forceN"} if "forceN" in row else {"momentNmm"}
            require(required<=row.keys() and row.keys()<=required|{"body"},"Unknown or incomplete applied force or couple")
        return [dict(r,body=r.get("body",route["loaded"])) for r in rows]
    fixed=forces(route["appliedForces"]);couples=forces(route["appliedMomentsNmm"])
    g=np.asarray(vec(route["gravityMmS2"]))
    if np.linalg.norm(g):
        for n in members:
            if n==route["chassis"]:continue
            require(n in center_mass,"Missing cold native mass of the loaded solid")
            mass,point=center_mass[n];fixed.append(dict(body=n,pointMm=point,forceN=(g*mass/1000).tolist()))
    states=route.get("loadStates")
    if states is None:return [("saved",fixed,couples)]
    require(states and all(s.get("pose")=="saved" and number(s.get("timeS")) for s in states) and
            all(b["timeS"]>a["timeS"] for a,b in zip(states,states[1:])) and route.get("historyLaw")=="linear-at-fixed-points",
            "Moving structural poses, changing force locations and nonlinear load histories need a bounded structural model")
    cases=[];previous=None
    for s in states:
        fl=forces(s["appliedForces"]);ml=forces(s["appliedMomentsNmm"])
        sites=[(r["body"],r["pointMm"]) for r in fl],[r["body"] for r in ml]
        require(previous is None or previous==sites,"Changing support applications lack an intersample wrench proof")
        previous=sites;cases.append((s["timeS"],fixed+fl,couples+ml))
    # At a fixed pose both wrench equilibrium and bounds on every contact pressure
    # are convex. Interpolating endpoint witnesses certifies every intermediate load.
    return cases


def observed_supports(root,study):
    """Screen force/moment compatibility of directly observed, parallel finite seats."""
    from mechanical_readiness import read,pinned,digest
    raw=read(pinned(root,study["observation"]))
    require(raw["archiveSha256"]==digest(pinned(root,study["archive"])) and
            raw["stepSha256"]==digest(pinned(root,study["step"])), "Support observation is for another native issue")
    def select(pointer):
        node=raw
        for k in pointer.split("/")[1:]:
            k=k.replace("~1","/").replace("~0","~");node=node[int(k)] if isinstance(node,list) else node[k]
        return node
    results={}
    for name,case in study["cases"].items():
        body="loaded assembly";anchor="support"
        direction=vec(case["normal"]);require(abs(math.hypot(*direction)-1)<1e-8,"Unknown bearing normal")
        forces=[dict(body=body,pointMm=vec(select(f["point"])),forceN=vec(select(f["force"]))) for f in case["applied"]]
        moments=[dict(body=body,momentNmm=vec(select(p))) for p in case["couples"]]
        # For parallel unidirectional normals no individual normal force can exceed
        # the entire sourced compressive resultant. This bound asserts no rating.
        bound=max(0,-float(np.sum([f["forceN"] for f in forces],axis=0)@direction))
        contacts=[]
        for patch in case["patches"]:
            p=vec(select(patch["centroid"]));area=select(patch["area"])
            require(number(area) and area>0,"No measured finite support area")
            contacts.append(dict(pointMm=p,areaMm2=area,capacityN=bound,direction=direction,**{"from":body,"to":anchor}))
        require(forces and contacts,"No applied loads or observed bearing faces")
        res=solve([body,anchor],anchor,contacts,forces,moments)
        resultant=sum((wrench(f["forceN"],f["pointMm"],np.zeros(3)) for f in forces),np.zeros(6))
        for m in moments:resultant[3:]+=m["momentNmm"]
        spin=float(resultant[3:]@direction)
        res.update(rootWrenchN_Nmm=resultant.tolist(),unsupportedTwistingMomentNmm=spin)
        # The source contains pressure centroids, not boundaries. A net twist
        # is impossible for ANY distribution of these parallel normal forces
        # when their resultant is parallel to the normal. Other infeasibility
        # of the centroid basis alone does not disprove a different distribution.
        res["equilibrium"]="fail" if abs(spin)>1e-6 and np.linalg.norm(np.cross(resultant[:3],direction))<1e-7 else ("pass" if res["status"]=="pass" else "open")
        res["capacity"]="open";results[name]=res
    return dict(status="fail" if any(c["equilibrium"]=="fail" for c in results.values()) else "open",cases=results,
                scope="Observed compressive centroid reactions. Contact allowables, installed joint retention and other load paths remain unqualified.")
