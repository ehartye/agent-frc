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


def boolean_measure(a,b,operation):
    from OCP.BRepCheck import BRepCheck_Analyzer
    result=operation(a,b)
    if not result.IsDone() or result.Shape().IsNull():
        raise ValueError("Unresolved solid Boolean operation")
    shape=result.Shape()
    return volume(shape),BRepCheck_Analyzer(shape).IsValid()


def measured_difference(a,b,registered_points):
    # Keep source observations separate from the readiness decision. A kernel
    # failure on this solid must not discard measurements of other occurrences.
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut,BRepAlgoAPI_Common
    from OCP.BRepCheck import BRepCheck_Analyzer
    from mechanical_motion import bounds
    from interface_consistency import inscribed_balls
    raw={"absentMm3":None,"extraMm3":None}
    detail={}
    problems=[]
    try:
        src=volume(a);placed=volume(b)
        detail.update(sourceVolumeMm3=src,installedVolumeMm3=placed,
                      sourceTopologyValid=BRepCheck_Analyzer(a).IsValid(),
                      installedTopologyValid=BRepCheck_Analyzer(b).IsValid())
        if not detail["sourceTopologyValid"] or not detail["installedTopologyValid"]:
            raise ValueError("Invalid source or installed solid topology")
        raw["absentMm3"],detail["absentTopologyValid"]=boolean_measure(a,b,BRepAlgoAPI_Cut)
        raw["extraMm3"],detail["extraTopologyValid"]=boolean_measure(b,a,BRepAlgoAPI_Cut)
        if not detail["absentTopologyValid"] or not detail["extraTopologyValid"]:
            problems.append("Invalid directed Boolean topology")
        absent,extra=raw["absentMm3"],raw["extraMm3"]
        if min(src,placed)<=0 or min(absent,extra)<0:
            raise ValueError("Nonphysical volume from source comparison")
        eps=max(1e-8,max(src,placed)*1e-9)
        expected=(src-absent,placed-extra)
        if min(expected)<-eps or abs(expected[0]-expected[1])>eps:
            problems.append("Directed source differences violate volume conservation")
        if registered_points or min(expected)<=eps:
            left,right=bounds(a),bounds(b)
            box=[(max(left[i],right[i]),min(left[i+3],right[i+3])) for i in range(3)]
            if registered_points or all(lo<hi for lo,hi in box):
                actual,valid_common=boolean_measure(a,b,BRepAlgoAPI_Common)
                detail.update(commonMm3=actual,commonTopologyValid=valid_common)
                if not valid_common or actual<0:
                    problems.append("Invalid direct common geometry or volume")
                candidates=list(registered_points)
                # All points are checked against the original solids independently
                # of any invalid Boolean result; a missed probe proves nothing.
                if min(expected)<=eps and actual<=eps:
                    coordinates=[[lo+(hi-lo)*f for f in (.25,.5,.75)] for lo,hi in box]
                    candidates.extend(list(point) for point in product(*coordinates))
                balls,lower=inscribed_balls(a,b,candidates,0.000001)
                detail.update(interiorBalls=balls,certifiedLowerBoundMm3=lower)
                if (actual==0 and lower>0 or actual+eps<lower or min(expected)+eps<lower
                        or max(abs(v-actual) for v in expected)>eps):
                    problems.append("Direct common, directed differences or certified shared interior disagree")
    except (RuntimeError,ValueError) as exc:
        problems.append(str(exc))
    if problems:
        raw.update(measurementStatus="open",reason="; ".join(problems),numericalEvidence=detail)
    return raw


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
