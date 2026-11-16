"""Original native CAD envelope layout for downstream guide/gate/bumper interfaces."""
import pathlib,json,hashlib,importlib.util,math,sys,OCP
from OCP.gp import gp_Pnt,gp_Dir,gp_Ax2,gp_Trsf,gp_Vec
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox,BRepPrimAPI_MakeSphere,BRepPrimAPI_MakeTorus,BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut,BRepAlgoAPI_Common
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.TopoDS import TopoDS_Compound
from OCP.BRep import BRep_Builder
from OCP.STEPControl import STEPControl_Writer,STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('p',ROOT/'scripts/prepare-segmented-replay.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
def box(x,y,z,a,b,c):return BRepPrimAPI_MakeBox(gp_Pnt(x,y,z),a,b,c).Shape()
def move(shape,x,y,z):
 t=gp_Trsf();t.SetTranslation(gp_Vec(x,y,z));return BRepBuilderAPI_Transform(shape,t,True).Shape()
def volume(shape):
 props=GProp_GProps();BRepGProp.VolumeProperties_s(shape,props);return props.Mass()
def common(a,b):
 op=BRepAlgoAPI_Common(a,b);op.Build()
 if not op.IsDone():raise ValueError('native boolean failed')
 return volume(op.Shape())
def run(out):
 out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=False);cases={}
 for year,hx,hy,height,bankr in [(2024,177.8,177.8,50.8,50.8),(2025,150.8125,57.15,114.3,25.4),(2026,75,75,150,38.1)]:
  center=400.;gateface=center-hx-20;frontface=center+hx;start=gateface-16;length=frontface+56-start;wide=2*(hy+10)
  if year==2024:piece=BRepPrimAPI_MakeTorus(gp_Ax2(gp_Pnt(center,0,25.4),gp_Dir(0,0,1)),152.4,25.4).Shape()
  elif year==2025:
   ax=gp_Ax2(gp_Pnt(center-hx,0,57.15),gp_Dir(1,0,0));piece=BRepAlgoAPI_Cut(BRepPrimAPI_MakeCylinder(ax,57.15,2*hx).Shape(),BRepPrimAPI_MakeCylinder(ax,50.8,2*hx).Shape()).Shape()
  else:piece=BRepPrimAPI_MakeSphere(gp_Pnt(center,0,75),75).Shape()
  floor=box(start,-hy-16,-6,length,wide+12,6)
  left=box(start,-hy-16,0,length,6,height+10);right=box(start,hy+10,0,length,6,height+10)
  # Original side-pinch envelope, with guide slots for retracted pads. No actuator/linkage is implied.
  pad_left=box(center-70,-hy-6,height/2-15,140,6,30);pad_right=box(center-70,hy,height/2-15,140,6,30)
  open_left=move(pad_left,0,-10,0);open_right=move(pad_right,0,10,0)
  left=BRepAlgoAPI_Cut(left,box(center-71,-hy-17,height/2-16,142,8,32)).Shape()
  right=BRepAlgoAPI_Cut(right,box(center-71,hy+9,height/2-16,142,8,32)).Shape()
  gate=box(gateface-6,-hy-10,0,6,wide,height+10);raised=move(gate,0,0,height+20)
  bumper=box(frontface,-hy-10,0,6,wide,height+10)
  pairs={'initial-gate':common(piece,gate),'initial-left-guide':common(piece,left),'initial-right-guide':common(piece,right),'initial-floor':common(piece,floor),'initial-bumper':common(piece,bumper),'rear-release-raised-gate':common(move(piece,-100,0,0),raised),'closed-gate-positive-control':common(move(piece,-25,0,0),gate),'nominal-left-pinch':common(piece,pad_left),'nominal-right-pinch':common(piece,pad_right),'open-pad-left-guide':common(open_left,left),'open-pad-right-guide':common(open_right,right),'pinch-compression-positive-control':common(piece,move(pad_right,0,-2,0))}
  if any(v>1e-5 for k,v in pairs.items() if not k.endswith('positive-control')) or min(pairs['closed-gate-positive-control'],pairs['pinch-compression-positive-control'])<1:raise ValueError('unexpected envelope contact')
  compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
  for shape in [piece,floor,left,right,gate,bumper,pad_left,pad_right]:builder.Add(compound,shape)
  path=out/f'{year}-catcher-envelope.step';writer=STEPControl_Writer();writer.Transfer(compound,STEPControl_AsIs)
  if writer.Write(str(path))!=IFSelect_RetDone:raise ValueError('STEP export failed')
  cases[str(year)]=dict(entryCenterXmm=center,gamePieceHalfExtentXmm=hx,gamePieceHalfExtentYmm=hy,pieceHeightMm=height,guideInnerWidthMm=wide,closedGateDownstreamFaceXmm=gateface,gateThicknessMm=6,gateRaisedBottomZmm=height+20,nominalBumperFaceXmm=frontface,provisionalBumperTravelMm=50,initialRearClearanceMm=20,pinchPadFeedSpanMm=140,pinchPadHeightMm=30,pinchPadRetractionMm=10,pinchCompressionPositiveControlMm=2,initialPieceToUpstreamWheelEnvelopeXGapMm=center-hx-bankr,minPieceToUpstreamWheelEnvelopeXGapAt100mmRearReleaseMm=center-hx-bankr-100,booleanIntersectionVolumesMm3=pairs,pieceVolumeMm3=volume(piece),stepSha256=hashlib.sha256(path.read_bytes()).hexdigest())
 report=dict(schema='frc-original-catcher-envelope-layout/v1',status='native-envelope-booleans-and-original-step-export-executed',runtime=dict(python=sys.version,ocp=OCP.__version__),geometryEvidenceSha256=p.evidence(),sourceCodeSha256={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in ['scripts/native-catcher-envelopes.py','scripts/prepare-segmented-replay.py']},cases=cases,calibration=None,engineeringAcceptance='blocked',
  limitations=['Original axis-aligned envelope layout only, not detailed mechanism, constrained assembly, manufacturing drawing or load acceptance','400mm downstream entry station is an original hypothesis, not approved robot packaging','Scalar isolation compares full piece trailing extent against upstream ideal wheel X extent, not chassis/housing/drive interference','Gate/pinch actuation path, hinges/latches, spring mounting, bumper linkage, actuator selection and force capacity absent; pad/guide slots are envelope clearances only','Floor/guide clearances are nominal; no tolerance, friction, deformation, yaw or lift-over assessment','Native positive control shows rear gate intersects piece after25mm reverse displacement; real impact force remains unverified','STEP export includes static closed gate and nominal bumper only; raised/retracted configurations checked separately, not animated'])
 (out/'receipt.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');return report
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();print(json.dumps(run(a.output),indent=2))
