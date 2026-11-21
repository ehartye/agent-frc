"""Resolve a registered solid-interface discrepancy using exact source solids, partitions and interior witnesses."""
import argparse
import json
import math
import sys
from pathlib import Path

from component_shape import proper_rotation
from mechanical_readiness import named,number,pinned,project_path,read,require
from mechanical_motion import common,distance,vec
from showcase_contacts import load_solids


def inscribed_balls(a,b,probes,reserve,*,outside_second=False):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_IN,TopAbs_OUT,TopAbs_SHELL
    from OCP.TopExp import TopExp_Explorer
    from OCP.gp import gp_Pnt
    classifiers=[BRepClass3d_SolidClassifier(s) for s in (a,b)]
    boundaries=[]
    for shape in (a,b):
        shells=TopExp_Explorer(shape,TopAbs_SHELL)
        require(shells.More(),"Solid has no closed boundary")
        while shells.More():
            boundaries.append(shells.Current());shells.Next()
    balls=[]
    for raw in probes:
        center=vec(raw);p=gp_Pnt(*center)
        for c in classifiers:c.Perform(p,1e-7)
        if classifiers[0].State()!=TopAbs_IN or classifiers[1].State()!=(TopAbs_OUT if outside_second else TopAbs_IN):continue
        point=BRepBuilderAPI_MakeVertex(p).Vertex()
        radius=min(distance(point,shell) for shell in boundaries)-reserve
        if radius<=0:continue
        # Trim rather than count any spatial region twice.
        radius=min([radius,*[math.dist(center,b["centerMm"])-b["radiusMm"] for b in balls]])
        if radius>0:balls.append(dict(centerMm=center,radiusMm=radius))
    return balls,sum(4*math.pi*b["radiusMm"]**3/3 for b in balls)


def excluded_material(parts, pair, points, reserve):
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.TopAbs import TopAbs_SOLID,TopAbs_OUT
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    require(isinstance(points,dict) and points and set(points)<=set(pair),
            "Register excluded probes against a member of the measured pair")
    for member in pair:
        require(parts[member].ShapeType()==TopAbs_SOLID,"Excluded volume requires individual solids")
        exterior=BRepClass3d_SolidClassifier(parts[member])
        exterior.PerformInfinitePoint(1e-7)
        require(exterior.State()==TopAbs_OUT,"Expected a finite solid with an exterior")
    rows={}
    for owner, probes in points.items():
        require(isinstance(probes,list) and probes,"Missing registered excluded probes")
        mate=next(k for k in pair if k!=owner)
        balls,excluded=inscribed_balls(parts[owner],parts[mate],probes,reserve,outside_second=True)
        props=GProp_GProps()
        relative_error=BRepGProp.VolumeProperties_s(parts[owner],props,1e-9,True)
        total=props.Mass()
        require(number(total) and total>0 and number(relative_error) and 0<=relative_error<1,
                "Could not integrate the finite material volume")
        upper=total/(1-relative_error)-excluded
        require(upper>=0,"Excluded material exceeds the integrated body volume")
        rows[owner]=dict(disjointBalls=balls,excludedLowerBoundMm3=excluded,
                         bodyVolumeMm3=total,estimatedRelativeIntegrationError=relative_error,
                         commonUpperBoundMm3=upper)
    return rows


def partition(shape,record):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCP.gp import gp_Ax2,gp_Dir,gp_Pnt
    origin=vec(record["originMm"]);axis=vec(record["direction"])
    inner=record["innerRadiusMm"];outer=record["outerRadiusMm"];h=record["lengthMm"]
    require(math.hypot(*axis)>0 and all(number(n) for n in (inner,outer,h)) and 0<inner<outer and h>0,"Invalid cylindrical partition")
    line=gp_Ax2(gp_Pnt(*origin),gp_Dir(*axis))
    core=BRepPrimAPI_MakeCylinder(line,inner,h).Shape()
    whole=BRepPrimAPI_MakeCylinder(line,outer,h).Shape()
    cut=BRepAlgoAPI_Cut(whole,core)
    require(cut.IsDone() and not cut.Shape().IsNull(),"Failed to construct complementary region")
    row={};errors=[]
    for key,part in (("wholeMm3",whole),("coreMm3",core),("ringMm3",cut.Shape())):
        try:row[key]=common(shape,part)
        except (ValueError,RuntimeError) as e:
            row[key]=None;errors.append(key+": "+str(e))
    row["residualMm3"]=None if errors else abs(row["wholeMm3"]-row["coreMm3"]-row["ringMm3"])
    if errors:row["errors"]=errors
    return row


def isolated_partition(shape,record):
    # Repeated Booleans on intricate imported faces can terminate the native kernel.
    # Serialize the exact BRep for an isolated calculation, preserving the independent
    # interior bound even when that calculation cannot produce any volume.
    import subprocess
    from tempfile import TemporaryDirectory
    from OCP.BRepTools import BRepTools
    with TemporaryDirectory() as directory:
        folder=Path(directory);input_file=folder/"request.json"
        require(BRepTools.Write_s(shape,str(folder/"source.brep")),"Could not serialize partition solid")
        input_file.write_text(json.dumps(record),encoding="utf8")
        try:
            p=subprocess.run([sys.executable,"-B",str(Path(__file__).resolve()),"--kernel-partition",str(input_file)],
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
        except subprocess.TimeoutExpired as e:raise ValueError("Complementary partition kernel timed out") from e
        if p.returncode!=0:raise ValueError("Complementary partition kernel returned "+str(p.returncode))
        return json.loads(p.stdout)


def partition_worker(file):
    from OCP.BRep import BRep_Builder
    from OCP.BRepTools import BRepTools
    from OCP.TopoDS import TopoDS_Shape
    shape=TopoDS_Shape()
    require(BRepTools.Read_s(shape,str(file.parent/"source.brep"),BRep_Builder()),"Could not reopen partition solid")
    print(json.dumps(partition(shape,read(file)),allow_nan=False))


def measure(parts,case,*,original=None):
    from OCP.BRepCheck import BRepCheck_Analyzer
    a,b=case["pair"];reserve=case["boundaryReserveMm"];error=case["volumeToleranceMm3"];limit=case["maxOverlapMm3"]
    require(a!=b and a in parts and b in parts and all(number(v) and v>=0 for v in (error,limit))
            and number(reserve) and reserve>1e-7 and named(case.get("basis")),"Missing selected pair or numerical criteria")
    require(all(BRepCheck_Analyzer(parts[k]).IsValid() for k in (a,b)),"Unresolved or invalid interface solids")
    probes=case["interiorPointsMm"];cuts=case["partitions"]
    require(isinstance(probes,list) and probes and isinstance(cuts,list) and cuts,"Register both interior probes and independent complementary partitions")
    errors=[]
    from component_shape import boolean_measure
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    valid=False
    try:
        mm3,valid=boolean_measure(parts[a],parts[b],BRepAlgoAPI_Common)
        if not valid or mm3<0:errors.append("Invalid direct common topology or volume")
    except (ValueError,RuntimeError) as e:
        mm3=None;errors.append("direct common: "+str(e))
    balls,lower=inscribed_balls(parts[a],parts[b],probes,reserve)
    exclusions={}
    upper=None
    if "excludedPointsMm" in case:
        try:
            exclusions=excluded_material(parts,(a,b),case["excludedPointsMm"],reserve)
            upper=min(row["commonUpperBoundMm3"] for row in exclusions.values())
            if any(not row["disjointBalls"] for row in exclusions.values()):
                errors.append("No excluded material witnessed for a registered member")
            if lower>upper+error:
                errors.append("Witness bounds disagree")
            if mm3 is not None and mm3>upper+error:
                errors.append("Direct common exceeds the independently bounded available material")
        except (TypeError,ValueError,RuntimeError) as exc:
            errors.append("Unresolved excluded material: "+str(exc))
    forbidden=[]
    forbidden_status=None
    if "forbiddenWitnesses" in case:
        from spatial_fit import placed_forbidden, probe_result
        try:
            scope=case["forbiddenWitnesses"]
            require(isinstance(scope,dict) and set(scope)=={"region","forbiddenProbes"} and scope["forbiddenProbes"],
                    "Register a finite permitted annulus and at least one forbidden witness")
            forbidden=placed_forbidden(parts,(a,b),scope)
            forbidden_status=probe_result(scope,forbidden)
            if forbidden_status=="fail":
                errors.append("Independent shared interior outside the registered annulus")
            elif forbidden_status!="pass":
                errors.append("Unresolved forbidden material witness")
        except (KeyError,TypeError,ValueError,RuntimeError) as exc:
            errors.append("Unresolved forbidden material witness: "+str(exc))
    separation=None
    if valid and mm3==0 and (upper is None or upper>limit) and lower<=limit and forbidden_status!="fail":
        from placed_separation import projected_clearance, registered_axes
        registration={"pair":[a,b],"axesWorld":case.get("separationAxesWorld",[[1,0,0],[0,1,0],[0,0,1]])}
        axes=registered_axes([registration],parts)[tuple(sorted((a,b)))]
        separation=projected_clearance(parts,(a,b),axes)
        if separation["status"]=="separated" and lower>0:
            errors.append("Separating intervals contradict the shared material witness")
        elif separation["status"]!="separated":
            errors.append("Zero common on a numerically ambiguous pair lacks independent separation or a sufficient common upper bound")
    rows=[]
    for c in cuts:
        subject=c["subject"]
        require(subject in (a,b),"Partition must sample a member of the registered pair")
        frame=c["frame"]
        require(frame=="installed" or frame=="source" and original is not None,"Unregistered partition coordinates")
        try:
            row=isolated_partition((original if frame=="source" else parts)[subject],c);rows.append(row)
            errors.extend(row.get("errors",[]))
        except (ValueError,RuntimeError) as e:
            rows.append(dict(error=str(e)));errors.append("unresolved partition for "+subject)
    # A partition missing the physical material provides no conservation control.
    consistent=not errors and all(r["wholeMm3"]>error and r["residualMm3"]<=error for r in rows) and mm3+error>=lower
    status="fail" if (forbidden_status=="fail" or lower>limit or valid and mm3>limit and (upper is None or mm3<=upper+error)) else "pass" if consistent else "open"
    return dict(pair=[a,b],directCommonMm3=mm3,disjointInteriorBalls=balls,certifiedLowerBoundMm3=lower,
                directCommonTopologyValid=valid,excludedMaterial=exclusions,commonUpperBoundMm3=upper,
                partitions=rows,errors=errors,numericallyConsistent=consistent,status=status,
                separation=separation,forbiddenWitnesses=forbidden,forbiddenWitnessStatus=forbidden_status)


def run(root,study):
    require(study["schema"]=="agent-frc/interface-consistency@1","Wrong interface study")
    original=None
    if "step" in study:
        parts=load_solids(pinned(root,study["step"]))[0];scope="registered assembly"
    else:
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
        from OCP.gp import gp_Trsf
        original={};parts={};scope="placed source interface only"
        for name,r in study["placedSources"].items():
            m=r["matrix"];proper_rotation(m);tr=gp_Trsf();tr.SetValues(*m[:12])
            original[name]=load_solids(pinned(root,r["file"]))[0][r["solid"]]
            parts[name]=BRepBuilderAPI_Transform(original[name],tr,False).Shape()
    return dict(scope=scope,**measure(parts,study["case"],original=original))


if __name__=="__main__":
    if len(sys.argv)==3 and sys.argv[1]=="--kernel-partition":
        partition_worker(Path(sys.argv[2]));sys.exit(0)
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("root",type=Path);p.add_argument("study");a=p.parse_args()
    try:
        root=a.root.resolve();result=run(root,read(project_path(root,a.study)))
        print(json.dumps(result,indent=2,allow_nan=False));sys.exit(int(result["status"]!="pass"))
    except (KeyError,TypeError,ValueError,OSError) as exc:sys.exit(str(exc))
