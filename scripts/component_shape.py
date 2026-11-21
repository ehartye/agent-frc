"""Compare the placed solid to the specific source solid at the recorded rigid transform."""
import math
from itertools import product

from showcase_contacts import load_solids


def proper_rotation(matrix):
    if len(matrix)!=16 or not all(type(x) in (int,float) and math.isfinite(x) for x in matrix):
        raise ValueError("Invalid model placement")
    if list(matrix[12:])!=[0,0,0,1]:
        raise ValueError("Expected affine row-major transform")
    rotation=[matrix[i:i+3] for i in (0,4,8)]
    for i in range(3):
        for j in range(3):
            dot=sum(x*y for x,y in zip(rotation[i],rotation[j]))
            if abs(dot-(1 if i==j else 0))>1e-8:
                raise ValueError("Placement must preserve supplier dimensions")
    a,b,c=rotation
    determinant=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0])
    if abs(determinant-1)>1e-8:
        raise ValueError("Installed part placement must be a proper rotation; reflection changes handedness")


def volume(shape):
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    props=GProp_GProps()
    BRepGProp.VolumeProperties_s(shape,props,True)
    value=props.Mass()
    if not math.isfinite(value):
        raise ValueError("Non-finite solid volume")
    return value


def difference(a,b):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    cut=BRepAlgoAPI_Cut(a,b)
    if not cut.IsDone() or cut.Shape().IsNull():
        raise ValueError("Unresolved directed Boolean difference")
    return volume(cut.Shape())


def measured_difference(a,b,registered_points):
    # Keep source observations separate from the readiness decision. A kernel
    # failure on this solid must not discard measurements of other occurrences.
    from mechanical_motion import bounds,common
    from interface_consistency import inscribed_balls
    raw={"absentMm3":None,"extraMm3":None}
    detail={}
    try:
        raw["absentMm3"]=difference(a,b)
        raw["extraMm3"]=difference(b,a)
        src=volume(a);placed=volume(b)
        detail.update(sourceVolumeMm3=src,installedVolumeMm3=placed)
        absent,extra=raw["absentMm3"],raw["extraMm3"]
        if min(src,placed)<=0 or min(absent,extra)<0:
            raise ValueError("Nonphysical volume from source comparison")
        eps=max(1e-8,max(src,placed)*1e-9)
        expected=(src-absent,placed-extra)
        if min(expected)<-eps or abs(expected[0]-expected[1])>eps:
            raise ValueError("Directed source differences violate volume conservation")
        if not registered_points and min(expected)>eps:
            return raw
        # No inferred shared material despite overlapping bounds: seek a
        # counterexample, never use unsuccessful probing to infer equality.
        left,right=bounds(a),bounds(b)
        box=[(max(left[i],right[i]),min(left[i+3],right[i+3])) for i in range(3)]
        if not registered_points and any(lo>=hi for lo,hi in box):
            return raw
        actual=common(a,b)
        detail["commonMm3"]=actual
        candidates=list(registered_points)
        if max(min(expected),actual)<=eps:
            candidates.extend([list(point) for point in product(*[
                [lo+(hi-lo)*fraction for fraction in (.25,.5,.75)] for lo,hi in box])])
        balls,lower=inscribed_balls(a,b,candidates,0.000001)
        detail.update(interiorBalls=balls,certifiedLowerBoundMm3=lower)
        if (actual==0 and lower>0 or actual+eps<lower or min(expected)+eps<lower
                or max(abs(v-actual) for v in expected)>eps):
            raise ValueError("Direct common, directed differences or certified shared interior disagree")
        return raw
    except (RuntimeError,ValueError) as exc:
        return {**raw,"measurementStatus":"open","reason":str(exc),"numericalEvidence":detail}


def compare_components(placed_path,comparisons,*,interior_points=None):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.gp import gp_Trsf
    from mechanical_motion import vec
    comparisons=list(comparisons)
    points={} if interior_points is None else interior_points
    if not isinstance(points,dict) or not set(points)<={row[0] for row in comparisons}:
        raise ValueError("Interior probes must reference a registered placed solid")
    for probes in points.values():
        if not isinstance(probes,list) or not probes:
            raise ValueError("Register nonempty installed-frame interior probes")
        for point in probes:vec(point)
    placed,_=load_solids(placed_path)
    originals={}
    result={}
    for name,source,label,matrix in comparisons:
        if source not in originals:
            originals[source]=load_solids(source)[0]
        if label not in originals[source] or name not in placed:
            raise ValueError("Unresolved source or placed body: "+name)
        proper_rotation(matrix)
        tr=gp_Trsf()
        tr.SetValues(*matrix[:12])
        official=BRepBuilderAPI_Transform(originals[source][label],tr,True).Shape()
        current=placed[name]
        result[name]=measured_difference(official,current,points.get(name,[]))
    return result
