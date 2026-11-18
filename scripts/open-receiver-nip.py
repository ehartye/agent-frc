"""Original continuous-cylinder nip envelopes; not selected hardware or a force model."""
import pathlib,json,math,hashlib,OCP
from OCP.gp import gp_Pnt,gp_Dir,gp_Ax1,gp_Ax2,gp_Vec,gp_Trsf
from OCP.BRepPrimAPI import BRepPrimAPI_MakeTorus,BRepPrimAPI_MakeCylinder,BRepPrimAPI_MakeSphere
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut,BRepAlgoAPI_Common
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
ROOT=pathlib.Path(__file__).resolve().parents[1]
FILES={2024:'case-studies/2024/note-fixture-nominal.json',2025:'case-studies/2025/coral-fixture-nominal.json',2026:'case-studies/2026/intake-fixture-nominal.json'}
PINS=['scripts/open-receiver-nip.py',*FILES.values()]
def geometry(year):return json.loads((ROOT/FILES[year]).read_text())['pieceSource']['geometryMm']
def extent(year,pitch):
 if type(year) is not int or year not in FILES or isinstance(pitch,bool) or not isinstance(pitch,(int,float)) or not math.isfinite(pitch) or abs(pitch)>20:raise ValueError('bounded season/pitch required')
 g=geometry(year);a=abs(math.radians(pitch))
 if year==2024:return (g['outerDiameter']/2-g['thickness']/2)/1000*math.sin(a)+g['thickness']/2000
 if year==2025:return g['length']/2000*math.sin(a)+g['outerDiameter']/2000*math.cos(a)
 return g['diameter']/2000

def piece(year,x,pitch):
 g=geometry(year)
 if year==2024:s=BRepPrimAPI_MakeTorus((g['outerDiameter']-g['thickness'])/2000,g['thickness']/2000).Shape()
 elif year==2025:
  length=g['length']/1000;axis=gp_Ax2(gp_Pnt(-length/2,0,0),gp_Dir(1,0,0));s=BRepAlgoAPI_Cut(BRepPrimAPI_MakeCylinder(axis,g['outerDiameter']/2000,length).Shape(),BRepPrimAPI_MakeCylinder(axis,g['innerDiameter']/2000,length).Shape()).Shape()
 else:s=BRepPrimAPI_MakeSphere(g['diameter']/2000).Shape()
 tr=gp_Trsf();tr.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,1,0)),math.radians(pitch));s=BRepBuilderAPI_Transform(s,tr,True).Shape();tr=gp_Trsf();tr.SetTranslation(gp_Vec(x,0,0));return BRepBuilderAPI_Transform(s,tr,True).Shape()

def case(year,x,pitch,retraction):
 for v in (x,retraction):
  if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):raise ValueError('finite dimensions')
 if retraction<0 or retraction>.1:raise ValueError('retraction domain')
 extent(year,pitch) # Validate the bounded orientation before native construction.
 radius={2024:.0508,2025:.0254,2026:.0381}[year];nominal=extent(year,0);body=piece(year,x,pitch);distances=[];volumes=[]
 for sign in (-1,1):
  roller=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(.3496,-.2,sign*(nominal+radius-.001+retraction)),gp_Dir(0,1,0)),radius,.4).Shape();d=BRepExtrema_DistShapeShape(body,roller);d.Perform()
  if not d.IsDone():raise ValueError('distance failed')
  op=BRepAlgoAPI_Common(body,roller);op.Build()
  if not op.IsDone():raise ValueError('intersection failed')
  props=GProp_GProps();BRepGProp.VolumeProperties_s(op.Shape(),props);distances.append(d.Value());volumes.append(props.Mass())
 vertical=retraction-.001-(extent(year,pitch)-nominal)
 return dict(season=year,bodyCenterXM=x,pitchDegrees=pitch,retractionEachSideM=retraction,nativeMinDistanceM=min(distances),nativeIntersectionSumM3=sum(volumes),conservativeVerticalGapM=vertical,translationAllowanceM=.002,requiredClearanceM=.002,verticalEnvelopePass=vertical-.002>=.002,nativeSamplePass=min(distances)-.002>=.002,normalForce=None,closureTime=None,installedAcceptance=None)

def report():
 return dict(schema='frc-open-receiver-nip/v1',cases=[case(y,x,p,r) for y in (2024,2025,2026) for x in (.4,.3496) for p in (0,10,20) for r in (0,.01,.04,.06)],intervalCertificates=[dict(season=y,pitchBoundDegrees=20,translationBoundM=.002,clearanceM=.002,minimumSymmetricRetractionM=.005+extent(y,20)-extent(y,0),candidateRetractionM=.06,passes=.06>=.005+extent(y,20)-extent(y,0)) for y in (2024,2025,2026)],sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},runtimeOcp=OCP.__version__,limitations=['Original continuous cylinder envelopes with400mm span; not segmented wheels, hubs, bearings, guides or actuators','1mm nominal interference is a geometry hypothesis, not validated compression or normal force','Pitch-only fixed-axis rotation; no yaw/roll, independent motion, sensing latency or swept closure','20degree interval certificate is a vertical support bound with2mm translation allowance, not a load or dynamics proof','FUEL finite-body extent warning is refined by actual sphere geometry; early extent does not itself prove collision','60mm each-side retraction is a geometry candidate, not a sourced actuator stroke/time acceptance','No mechanism acceptance or score'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);p=pathlib.Path(a.parse_args().output)
 with p.open('x',encoding='utf-8') as f:json.dump(report(),f,indent=2,allow_nan=False);f.write('\n')
