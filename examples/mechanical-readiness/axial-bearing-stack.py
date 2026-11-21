"""Exercise a complete axial stack, or replay a registered one-axis obstruction study."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"scripts"))
from interface_consistency import inscribed_balls
from mechanical_motion import bearing_area, evaluate, transform, vec
from mechanical_readiness import number, pinned, project_path, read, require
from showcase_contacts import load_solids


def covered(limits, intervals):
    """An interval boundary is excluded: a tangent pair of spheres has no shared interior."""
    left,right=limits
    end=None
    for lo,hi in sorted(intervals):
        if end is None:
            if lo < left < hi:
                end=hi
        elif lo < end:
            end=max(end,hi)
        if end is not None and end > right:
            return True
    return False


def diagnose(root,study):
    from OCP.BRepCheck import BRepCheck_Analyzer
    require(study["schema"]=="agent-frc/axial-obstruction@1","Wrong study schema")
    shapes,_=load_solids(pinned(root,study["step"]))
    moving=study["moving"]
    require(isinstance(moving,list) and moving and len(set(moving))==len(moving)
            and set(moving)<=shapes.keys(),"Register the installed, rigidly translating members")
    axis=vec(study["axis"])
    require(abs(math.hypot(*axis)-1)<1e-8,"Register a unit world axis")
    axis=[v/math.hypot(*axis) for v in axis]
    limits=study["rangeMm"]
    require(len(limits)==2 and all(number(v) for v in limits) and limits[0]<limits[1],"Invalid signed interval")
    reserve=study["reserveMm"]
    require(number(reserve) and reserve>0 and study["observations"],"Supply witness points and a positive boundary reserve")
    rows=[];intervals=[];checked=set()
    for witness in study["observations"]:
        a,b=witness["pair"];x=witness["offsetMm"];point=vec(witness["pointMm"])
        require(a in moving and b in shapes and b not in moving and number(x) and limits[0]<=x<=limits[1],
                "Witness requires a moving member and a stationary obstacle at a registered offset")
        for name in {a,b}-checked:
            require(BRepCheck_Analyzer(shapes[name]).IsValid(),"Invalid source solid: "+name)
            checked.add(name)
        posed=transform(shapes[a],[dict(kind="translation",travelMm=[v*x for v in axis])],1)
        balls,volume=inscribed_balls(posed,shapes[b],[point],reserve)
        row=dict(pair=[a,b],offsetMm=x,pointMm=point,sharedVolumeLowerMm3=volume)
        if balls:
            radius=balls[0]["radiusMm"]
            interval=[x-2*radius,x+2*radius]
            intervals.append(interval)
            row.update(radiusMm=radius,obstructedOpenIntervalMm=interval)
        rows.append(row)
    return dict(stepSha256=study["step"]["sha256"],axis=axis,rangeMm=limits,moving=moving,witnesses=rows,
                everyOffsetObstructed=covered(limits,intervals))


def make_fixture(folder, mount_z):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.Message import Message, Message_Gravity
    from OCP.gp import gp_Ax2,gp_Pnt,gp_Dir
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_AsIs
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFDoc import XCAFDoc_DocumentTool

    def ring(inner,outer,lo,hi):
        axis=gp_Ax2(gp_Pnt(0,0,lo),gp_Dir(0,0,1))
        solid=BRepPrimAPI_MakeCylinder(axis,outer,hi-lo).Shape()
        if inner:
            solid=BRepAlgoAPI_Cut(solid,BRepPrimAPI_MakeCylinder(axis,inner,hi-lo).Shape()).Shape()
        return solid

    shapes={"outer race":ring(4.5,6,0,4),"inner race":ring(2,3.3,0,4),"shaft":ring(0,1.95,-2,6),
            "hub shoulder":ring(4.8,6.3,-1,.4),"axle spacer":ring(2.1,3.1,mount_z,mount_z+1)}
    doc=TDocStd_Document(TCollection_ExtendedString("BinXCAF"))
    tree=XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    for name,shape in shapes.items():
        TDataStd_Name.Set_s(tree.AddShape(shape,False),TCollection_ExtendedString(name))
    step=folder/"stack.step"
    levels=[(p,p.GetTraceLevel()) for p in Message.DefaultMessenger_s().Printers()]
    try:
        for printer,_ in levels:
            printer.SetTraceLevel(Message_Gravity.Message_Fail)
        writer=STEPCAFControl_Writer()
        require(writer.Transfer(doc,STEPControl_AsIs) and writer.Write(str(step))==IFSelect_RetDone,"STEP export failed")
    finally:
        for printer,level in levels:
            printer.SetTraceLevel(level)
    return {"file":step.name,"sha256":hashlib.sha256(step.read_bytes()).hexdigest()}


def exercise():
    results={}
    with TemporaryDirectory() as tmp:
        folder=Path(tmp)
        for name,z in (("trapped",4),("relieved",4.8)):
            step=make_fixture(folder,z)
            moving=["shaft","outer race","inner race"]
            case=dict(schema="agent-frc/axial-obstruction@1",step=step,moving=moving,axis=[0,0,1],rangeMm=[0,.4],
                      reserveMm=.0001,observations=[
                          dict(pair=["outer race","hub shoulder"],offsetMm=0,pointMm=[5.5,0,.2]),
                          dict(pair=["inner race","axle spacer"],offsetMm=.4,pointMm=[2.6,0,4.2])])
            result=diagnose(folder,case)
            require(result["everyOffsetObstructed"]==(name=="trapped"),"Unexpected synthetic witness result")
            if name=="relieved":
                op=lambda dz:[dict(kind="translation",travelMm=[0,0,dz])]
                shapes,_=load_solids(folder/step["file"])
                result["outerShoulderAreaMm2"]=bearing_area(transform(shapes["outer race"],op(.4),1),shapes["hub shoulder"],[0,0,-1])
                result["innerSpacerAreaMm2"]=bearing_area(transform(shapes["inner race"],op(.8),1),shapes["axle spacer"],[0,0,1])
                trial=dict(id="free axial travel",basis="Original synthetic rigid stack between separate seats",minGapMm=0,
                           initialPose={k:op(.42) for k in moving},moves={k:op(.32) for k in moving})
                result["shaftTravel"]=evaluate(folder,dict(schema="agent-frc/mechanical-motion@1",step=step,cases=[trial]))["cases"][0]["status"]
                require(result["shaftTravel"]=="pass" and min(result["outerShoulderAreaMm2"],result["innerSpacerAreaMm2"])>0,
                        "The relieved exercise must have both seats and a clear interior stroke")
            results[name]=result
    return results


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("inputs",nargs="*")
    args=parser.parse_args()
    if len(args.inputs)==2:
        root=Path(args.inputs[0]).resolve()
        result=diagnose(root,read(project_path(root,args.inputs[1])))
    elif not args.inputs:
        result=exercise()
    else:
        parser.error("Use no arguments for the exercise or supply PROJECT STUDY")
    print(json.dumps(result,indent=2,allow_nan=False))
