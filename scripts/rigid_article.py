"""Reconstruct an observed finite article in assembly coordinates throughout each clock interval."""
import math
from itertools import product
import numpy as np

from mechanical_readiness import require,number
from mechanical_motion import bounds,distance,vec
from release_onset import rigid,position
from release_animation import rotation_vector


def skew(v):
    x,y,z=v
    return np.array([[0,-z,y],[z,0,-x],[-y,x,0]])


class ArticleMotion:
    def __init__(self,shape,frames,raw,*,fixed_evidence=False):
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        self.shape=shape;self.frames=frames;self.center=np.asarray(vec(raw["centerOfMassLocalMm"]))
        seq=[f.get("articlePose") for f in frames]
        events=raw["observations"];require(len(events)==len(frames),"Missing article pose observations")
        explicit=any(m is not None for m in seq)
        require(not explicit or all(m is not None for m in seq),"Missing rigid pose during the executed clock")
        require(explicit or fixed_evidence or raw.get("orientationModel")=="fixed-in-saved-axes",
                "Need observed finite article poses or independently established fixed orientation")
        self.poses=[]
        for f,event,m in zip(frames,events,seq):
            off=np.asarray(vec(f["offsetsMm"][raw["pieceId"]]))
            if explicit:
                require(event.get("articlePose")==m,"Independent observation differs from the rigid article pose")
                mat=rigid(m)
                require(np.linalg.norm(mat[:3,:3]@self.center+mat[:3,3]-self.center-off)<1e-6,
                        "Article translation disagrees with the observed center of mass")
            else:
                require(event.get("articlePose") is None,"Observer provides a rigid pose omitted by the trace")
                mat=np.eye(4);mat[:3,3]=off
            self.poses.append(mat)
        box=bounds(shape);self.radius=max(math.dist(c,self.center) for c in product(*zip(box[:3],box[3:])))
        self.rot=[];self.rates=[]
        for i,(a,b) in enumerate(zip(self.poses,self.poses[1:])):
            rot=rotation_vector(b[:3,:3]@a[:3,:3].T);dt=frames[i+1]["timeS"]-frames[i]["timeS"]
            require(dt>0 and np.linalg.norm(rot)<math.pi-1e-7,"Need resolved, chronologically ordered finite rotations")
            self.rot.append(rot);self.rates.append(rot/dt)
        self.rotating=any(np.linalg.norm(v)>1e-10 for v in self.rot) or any(np.linalg.norm(m[:3,:3]-np.eye(3))>1e-10 for m in self.poses)
        if fixed_evidence or raw.get("orientationModel")=="fixed-in-saved-axes":
            require(not self.rotating,"Actual article orientation differs from the independently fixed model")
        rates=raw.get("angularVelocityRadS")
        for i,e in enumerate(events):
            w=e.get("angularVelocityRadS",rates)
            if w is None:
                require(not self.rotating,"Missing achieved angular velocity for the registered orientation")
                continue
            w=np.asarray(vec(w))
            require(all(np.linalg.norm(w-self.rates[k])<1e-7 for k in {max(0,i-1),min(i,len(self.rates)-1)}),
                    "Angular observation differs from the interpolated rigid pose or requires an unresolved change of rate")
            require(rates is None or np.linalg.norm(w-np.asarray(vec(rates)))<1e-7,"Conflicting run and event angular velocities")
        self.dynamics_error=None
        if self.rotating:
            props=GProp_GProps();BRepGProp.VolumeProperties_s(shape,props,True)
            require((raw.get("inertiaKgMm2") is not None or math.dist(props.CentreOfMass().Coord(),self.center)<1e-6) and props.Mass()>0 and number(raw.get("massKg")) and raw["massKg"]>0,
                    "Need the actual inertia model for a nonuniform rotating article")
            # A uniform solid or an independently supplied physical inertia tensor is required for spin dynamics.
            tensor=raw.get("inertiaKgMm2")
            if tensor is None:
                if raw.get("massDistribution")!="uniform":
                    self.dynamics_error="Register the mass distribution or inertia tensor for the rotating article"

                j=props.MatrixOfInertia();tensor=[[j.Value(i+1,k+1)*raw["massKg"]/props.Mass() for k in range(3)] for i in range(3)]
            self.inertia=np.asarray(tensor,dtype=float)
            require(self.inertia.shape==(3,3) and np.allclose(self.inertia,self.inertia.T,rtol=0,atol=1e-10)
                    and min(np.linalg.eigvalsh(self.inertia))>0,"Invalid body-frame inertia")
            eigen=np.linalg.eigvalsh(self.inertia)
            require(eigen[2]<=eigen[0]+eigen[1]+1e-8,"Principal moments cannot come from a physical mass distribution")
            for i,w in enumerate(self.rates):
                r=self.poses[i][:3,:3]
                require(np.linalg.norm(np.cross(w,r@self.inertia@r.T@w))<1e-7,
                        "A nonprincipal spin needs an executed angular-momentum and torque history")
        self.index={f["timeS"]:i for i,f in enumerate(frames)}

    def center_at(self,i):
        m=self.poses[i];return m[:3,:3]@self.center+m[:3,3]

    def matrix(self,i,t):
        if t==0:return self.poses[i]
        if t==1:return self.poses[i+1]
        rv=self.rot[i];angle=np.linalg.norm(rv)
        r=self.poses[i][:3,:3]
        if angle:
            k=skew(rv/angle);r=(np.eye(3)+math.sin(t*angle)*k+(1-math.cos(t*angle))*(k@k))@r
        center=self.center_at(i)*(1-t)+self.center_at(i+1)*t
        m=np.eye(4);m[:3,:3]=r;m[:3,3]=center-r@self.center
        return m

    def at(self,i,t=0):return position(self.shape,self.matrix(i,t))

    def operations(self,i):
        m=self.poses[i];rv=rotation_vector(m[:3,:3]);delta=self.center_at(i+1)-self.center_at(i)
        def rotation(r,p):
            a=float(np.linalg.norm(r))
            return [dict(kind="rotation",originMm=np.asarray(p,dtype=float).tolist(),axis=(r/a).tolist(),travelDeg=math.degrees(a))] if a>0 else []
        initial=rotation(rv,[0.,0.,0.])+[dict(kind="translation",travelMm=m[:3,3].tolist())]
        moves=rotation(self.rot[i],self.center_at(i))+[dict(kind="translation",travelMm=delta.tolist())]
        return initial,moves

    def extent_rate(self,i,relative):
        rv=self.rot[i];angle=np.linalg.norm(rv)
        speed=abs(self.center_at(i+1)-self.center_at(i)-relative)
        if angle:speed=speed+self.radius*angle*np.sqrt(np.maximum(0,1-(rv/angle)**2))
        return speed

    def terminal(self,i,region,tolerance,offset0,offset1):
        speed=self.extent_rate(i,offset1-offset0);cache={}
        def margins(t):
            if t not in cache:
                box=np.asarray(bounds(self.at(i,t)));offset=offset0*(1-t)+offset1*t
                cache[t]=np.minimum(box[:3]-offset-region[:3],region[3:]-(box[3:]-offset))+tolerance
            return cache[t]
        def visit(lo,hi,depth):
            mid=(lo+hi)/2;m=margins(mid)
            if np.min(m)<0:return False
            if np.all(m>=speed*(hi-lo)/2):return True
            return depth<22 and visit(lo,mid,depth+1) and visit(mid,hi,depth+1)
        return np.min(margins(0))>=0 and np.min(margins(1))>=0 and visit(0,1,0)


def rotating_face_path(motion,i,point,end,force):
    """Certify the contact locus stays within the same finite planar face during a constant principal spin."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE,TopAbs_REVERSED,TopAbs_WIRE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Pnt
    start=np.asarray(point);finish=np.asarray(end);force=np.asarray(force)/np.linalg.norm(force)
    delta=finish-start-(motion.center_at(i+1)-motion.center_at(i))
    rv=motion.rot[i];angle=np.linalg.norm(rv)
    if angle and np.linalg.norm(np.cross(rv/angle,force))>1e-8:return False
    def where(t):
        m=motion.matrix(i,t);s=m[:3,:3].T@(start*(1-t)+finish*t-m[:3,3])
        return BRepBuilderAPI_MakeVertex(gp_Pnt(*s)).Vertex()
    radius=max(np.linalg.norm(start-motion.center_at(i)),np.linalg.norm(finish-motion.center_at(i+1)))
    speed=np.linalg.norm(delta)+angle*radius
    it=TopExp_Explorer(motion.shape,TopAbs_FACE)
    while it.More():
        face=(getattr(TopoDS,"Face_s",None) or TopoDS.Face)(it.Current());it.Next()
        surf=BRepAdaptor_Surface(face)
        if surf.GetType()!=GeomAbs_Plane:continue
        n=motion.poses[i][:3,:3]@np.asarray(surf.Plane().Axis().Direction().Coord())
        if face.Orientation()==TopAbs_REVERSED:n=-n
        if n@force>-.999999999 or any(distance(where(t),face)>1e-7 for t in (0,1)):continue
        paths=TopExp_Explorer(face,TopAbs_WIRE);wires=[]
        while paths.More():wires.append(paths.Current());paths.Next()
        def test(a,b,depth):
            t=(a+b)/2;p=where(t)
            if distance(p,face)>1e-7:return False
            if min(distance(p,w) for w in wires)>speed*(b-a)/2:return True
            return depth<15 and test(a,t,depth+1) and test(t,b,depth+1)
        if wires and test(0,1,0):return True
    return False
