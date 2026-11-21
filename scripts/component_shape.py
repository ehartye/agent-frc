"""Compare the placed solid to the specific source solid at the recorded rigid transform."""
import math
from pathlib import Path

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


def compare_components(placed_path,comparisons):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.gp import gp_Trsf
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
        def difference(a,b):
            cut=BRepAlgoAPI_Cut(a,b)
            if not cut.IsDone() or cut.Shape().IsNull():
                raise ValueError("Unresolved source-shape difference: "+name)
            props=GProp_GProps()
            BRepGProp.VolumeProperties_s(cut.Shape(),props,True)
            v=props.Mass()
            if not math.isfinite(v) or v<0:
                raise ValueError("Unresolved source-shape difference volume")
            return v
        result[name]={"absentMm3":difference(official,current),"extraMm3":difference(current,official)}
    return result
