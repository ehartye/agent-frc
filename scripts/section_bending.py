"""Recover nominal signed axial and bending stress at a specified planar section of one solid."""
import argparse
import json
import math
from pathlib import Path

from mechanical_readiness import number, pinned, read, require
from mechanical_motion import bounds
from placed_separation import direction
from stock_sections import entities, section_operation


def measure(shape, case):
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SHAPE, TopAbs_SOLID
    from OCP.ShapeAnalysis import ShapeAnalysis_ShapeTolerance
    from OCP.TopLoc import TopLoc_Location
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Ax1, gp_Ax3, gp_Dir, gp_Pln, gp_Pnt, gp_Trsf
    point = case["pointMm"]
    require(len(point)==3 and all(number(v) for v in point), "Supply a finite point on the installed cut plane")
    normal, bend = (direction(case[k]) for k in ("normalWorld","bendingAxisWorld"))
    require(abs(sum(a*b for a,b in zip(normal,bend))) < 1e-10, "The bending axis must lie in the section plane")
    moment, axial = (case.get(k) for k in ("momentNmm","axialN"))
    require(all(v is None or number(v) for v in (moment,axial)), "A supplied signed load must be finite")
    require(len(list(entities(shape,TopAbs_SOLID)))==1 and BRepCheck_Analyzer(shape).IsValid(), "Expected one valid placed solid")
    # Moving the point within its plane must leave the numerical origin close to the stock.
    box = bounds(shape)
    middle = [(a+b)/2 for a,b in zip(box[:3],box[3:])]
    offset = sum((p-c)*n for p,c,n in zip(point,middle,normal))
    origin = gp_Pnt(*(c+n*offset for c,n in zip(middle,normal)))
    frame = gp_Trsf()
    frame.SetTransformation(gp_Ax3(origin,gp_Dir(*normal),gp_Dir(*bend)))
    local = shape.Moved(TopLoc_Location(frame))
    x0,y0,z0,x1,y1,z1 = bounds(local)
    tol = ShapeAnalysis_ShapeTolerance().Tolerance(local,1,TopAbs_SHAPE)
    require(number(tol) and tol>=0 and z0 < -tol and z1 > tol, "Place the section inside the selected stock")
    for f in entities(local, TopAbs_FACE):
        surf = BRepAdaptor_Surface((getattr(TopoDS,"Face_s",None) or TopoDS.Face)(f))
        if surf.GetType()==GeomAbs_Plane:
            plane=surf.Plane()
            require(abs(plane.Axis().Direction().Z()) < 1-1e-12 or abs(plane.Location().Z())>tol,
                    "The cut coincides with a stock face or shoulder; measure the two one-sided sections")
    plane = BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(),gp_Dir(0,0,1)),x0-1,x1+1,y0-1,y1+1).Face()
    section, area = section_operation(local,plane,BRepAlgoAPI_Common)
    require(number(area) and area>0, "No finite planar material at this station")
    props = GProp_GProps()
    BRepGProp.SurfaceProperties_s(section,props)
    cg = props.CentreOfMass()
    def inertia(x,y):
        return props.MomentOfInertia(gp_Ax1(cg,gp_Dir(x,y,0)))
    ixx, iyy = inertia(1,0), inertia(0,1)
    ixy = (ixx+iyy)/2-inertia(1,1)
    det = ixx*iyy-ixy**2
    require(all(number(v) and v>0 for v in [ixx,iyy,det]) and det>1e-12*max(ixx,iyy)**2, "Ill-conditioned in-plane inertia matrix")
    # On the positive normal face, Mx = integral(y*sigma); My = -integral(x*sigma) = 0.
    gx,gy = -ixy/det, iyy/det
    magnitude = math.hypot(gx,gy)
    along = gp_Trsf()
    along.SetTransformation(gp_Ax3(cg,gp_Dir(0,0,1),gp_Dir(gx,gy,0)))
    lo,_,_,hi,_,_ = bounds(section.Moved(TopLoc_Location(along)))
    require(number(lo) and number(hi) and lo<0<hi, "Unresolved material extremes about the neutral axis")
    world = cg.Transformed(frame.Inverted())
    cy = cg.Y()
    transverse = bounds(section)
    moduli = [-1/(lo*magnitude),1/(hi*magnitude)]
    stresses = [axial/area+moment*v*magnitude for v in (lo,hi)] if None not in (moment,axial) else None
    require(all(number(v) for v in [*moduli,*(stresses or [])]), "Unresolved section modulus or stress")
    result = dict(status="measured", areaMm2=area, centroidWorldMm=world.Coord(), sectionFaceCount=len(list(entities(section,TopAbs_FACE))),
                inputTopologyToleranceMm=tol, inertiaAboutBendingAxisMm4=ixx, inertiaAboutTransverseAxisMm4=iyy,
                productOfAreaMm4=ixy, transverseExtremesMm=[transverse[1]-cy,transverse[4]-cy],
                unitMomentStressGradientPerMm4=[gx,gy], stressDirectionExtremesMm=[lo,hi],
                sectionModuliMm3=moduli, momentNmm=moment, axialN=axial,stressAtNegativePositiveFiberMPa=stresses)
    if "comparison" in case:
        comparison = case["comparison"]
        claim, tolerance = comparison["sectionModuliMm3"], comparison["toleranceMm3"]
        require(isinstance(claim,list) and len(claim)==2 and all(number(v) and v>0 for v in claim)
                and number(tolerance) and tolerance>=0 and isinstance(comparison.get("basis"),str)
                and comparison["basis"].strip(), "Identify both section moduli and the justified comparison tolerance")
        result["modulusComparison"] = "within-declared-tolerance" if all(abs(a-b)<=tolerance for a,b in zip(moduli,claim)) else "outside-declared-tolerance"
    return result


def run(root, plan):
    from showcase_contacts import load_solids
    require(plan.get("schema") == "agent-frc/section-bending@1", "Expected a registered bending section plan")
    step = pinned(root,plan["step"])
    source = read(pinned(root,plan["loadCases"]))
    require(source.get("schema")=="agent-frc/section-loads@1" and source.get("stepSha256")==plan["step"]["sha256"]
            and isinstance(source.get("basis"),str) and source["basis"].strip()
            and isinstance(source.get("cases"),list) and source["cases"], "Match the station and load basis to this exact placed configuration")
    ids=[c.get("id") if isinstance(c,dict) else None for c in source["cases"]]
    require(all(isinstance(k,str) and k.strip() for k in ids) and len(ids)==len(set(ids)), "Identify each registered case once")
    parts,_ = load_solids(step)
    rows=[]
    for case in source["cases"]:
        try:
            row=measure(parts[case["solid"]],case)
        except (ValueError,RuntimeError,KeyError,TypeError) as e:
            row=dict(status="open",reason=str(e))
        rows.append(dict(case=case,**row))
    return dict(stepSha256=plan["step"]["sha256"],loadCases=plan["loadCases"],sections=rows,
                scope="Linear homogeneous beam section under the registered axial force and bending moment. Local stress concentration, support, welds, buckling and fatigue require separate evidence.")


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project",type=Path)
    parser.add_argument("plan",type=Path)
    args=parser.parse_args()
    print(json.dumps(run(args.project.resolve(),read(args.plan)),indent=2,allow_nan=False))
