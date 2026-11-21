"""Conservative two-way surface distance between explicitly owned triangle sets, in CAD millimeters."""
import math
from mechanical_readiness import number,require


def surface(triangles):
    import vtk
    from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray
    import numpy as np
    xyz=np.asarray(triangles,dtype=np.float64).reshape((-1,3))
    require(len(xyz)>=3,"Empty surface")
    pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(xyz,deep=True))
    cells=vtk.vtkCellArray()
    count=len(xyz)//3
    cells.SetData(numpy_to_vtkIdTypeArray(np.arange(0,len(xyz)+1,3,dtype=np.int64),deep=True),
                  numpy_to_vtkIdTypeArray(np.arange(len(xyz),dtype=np.int64),deep=True))
    mesh=vtk.vtkPolyData();mesh.SetPoints(pts);mesh.SetPolys(cells)
    locator=vtk.vtkStaticCellLocator();locator.SetDataSet(mesh);locator.BuildLocator()
    return locator


def directional(tris,locator,tolerance,budget):
    import vtk
    cache={};checked=0;worst=0;unresolved=False
    def nearest(p):
        nonlocal checked,worst
        if p not in cache:
            if checked>=budget:return None
            nearest=[0.,0.,0.];cell=vtk.reference(0);sub=vtk.reference(0);squared=vtk.reference(0.)
            locator.FindClosestPoint(p,nearest,cell,sub,squared)
            value=math.sqrt(float(squared))
            require(math.isfinite(value) and int(cell)>=0,"Unresolved nearest facet")
            cache[p]=(int(cell),value);checked+=1;worst=max(worst,value)
        return cache[p]
    def mid(a,b):return tuple((x+y)/2 for x,y in zip(a,b))
    for tri in tris:
        stack=[(tuple(tuple(p) for p in tri),0)]
        while stack:
            t,level=stack.pop()
            observations=[nearest(p) for p in t]
            if any(x is None for x in observations):
                return {"status":"open","samples":checked,"observedMaxMm":worst}
            if any(x[1]>tolerance for x in observations):
                index=max(range(3),key=lambda i:observations[i][1])
                return {"status":"fail","samples":checked,"observedMaxMm":worst,"witnessMm":t[index]}
            # Distance to one fixed closed triangle is convex. Vertex bounds on
            # the same target triangle certify the complete source subtriangle.
            if len({x[0] for x in observations})==1:
                continue
            center=tuple(sum(p[k] for p in t)/3 for k in range(3))
            sample=nearest(center)
            if sample is None:return {"status":"open","samples":checked,"observedMaxMm":worst}
            if sample[1]>tolerance:
                return {"status":"fail","samples":checked,"observedMaxMm":worst,"witnessMm":center}
            if sample[1]+max(math.dist(center,p) for p in t)<=tolerance:
                continue
            if level==12:
                unresolved=True;continue
            a,b,c=t;ab,bc,ca=mid(a,b),mid(b,c),mid(c,a)
            stack.extend((x,level+1) for x in ((a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)))
    return {"status":"open" if unresolved else "pass","samples":checked,"observedMaxMm":worst}


def compare_parts(source,display,tolerance,budget):
    require(number(tolerance) and tolerance>0 and type(budget) is int and budget>0,"Invalid scoped surface tolerance or sample budget")
    directions={"sourceToDisplay":directional(source,surface(display),tolerance,budget),
                "displayToSource":directional(display,surface(source),tolerance,budget)}
    statuses={r["status"] for r in directions.values()}
    return {**directions,"status":"fail" if "fail" in statuses else "open" if "open" in statuses else "pass"}


def sample_distances(named_triangles,target):
    import vtk
    locator=surface(target)
    maximum=0;owner=None;witness=None;count=0
    for name,tri in named_triangles:
        p=tuple(sum(v[i] for v in tri)/3 for i in range(3))
        near=[0.,0.,0.];cell=vtk.reference(0);sub=vtk.reference(0);squared=vtk.reference(0.)
        locator.FindClosestPoint(p,near,cell,sub,squared)
        dist=math.sqrt(float(squared));count+=1
        if dist>maximum:
            maximum=dist;owner=name;witness=p
    return {"samples":count,"observedMaxMm":maximum,"subject":owner,"pointMm":witness}
