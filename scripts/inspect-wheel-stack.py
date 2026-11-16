"""Pinned private STEP placement experiment; outputs original numerical observations only."""
import json,math,hashlib,urllib.request,tempfile,pathlib,sys,importlib.metadata
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.gp import gp_Trsf,gp_Ax1,gp_Pnt,gp_Dir,gp_Vec
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
SOURCES={
'wheel':('https://www.revrobotics.com/content/cad/Compliant-Wheel-3in-MAXSpline.STEP','b6e6ad137251120e3acb7650f947534b732f05841fa7b0a36a7c61a571e0e599'),
'hub':('https://www.revrobotics.com/content/cad/REV-21-2037.STEP','994be447326c5e10fa86f4d9addd0abc218dd82b7bef9efbcac9e8259c268807')}
def bounds(s):
 b=Bnd_Box();BRepBndLib.AddOptimal_s(s,b,False,False);lo,hi=b.CornerMin(),b.CornerMax()
 return [lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z()]
def volume(s):
 p=GProp_GProps();BRepGProp.VolumeProperties_s(s,p);return p.Mass()
def common(a,b):
 op=BRepAlgoAPI_Common(a,b);op.Build()
 if not op.IsDone():raise RuntimeError('Native common failed')
 return volume(op.Shape())
def transformed(s,side,angle):
 # Existing hub +Z axis points outward from wheel; shoulder z6.35 seats at core face +/-11.90625.
 t=gp_Trsf();t.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,1,0)),side*math.pi/2)
 result=BRepBuilderAPI_Transform(s,t,True).Shape()
 t=gp_Trsf();t.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(1,0,0)),math.radians(angle))
 result=BRepBuilderAPI_Transform(result,t,True).Shape()
 t=gp_Trsf();t.SetTranslation(gp_Vec(side*(11.90625-6.35),0,0))
 return BRepBuilderAPI_Transform(result,t,True).Shape()
def run():
 shapes={};records={}
 with tempfile.TemporaryDirectory(prefix='frc-wheel-stack-') as td:
  for name,(url,pin) in SOURCES.items():
   raw=urllib.request.urlopen(url,timeout=60).read();digest=hashlib.sha256(raw).hexdigest()
   if digest!=pin:raise ValueError('Changed vendor source '+name)
   path=pathlib.Path(td)/(name+'.step');path.write_bytes(raw)
   r=STEPControl_Reader()
   if r.ReadFile(str(path))!=IFSelect_RetDone or r.TransferRoots()!=1:raise RuntimeError('STEP transfer')
   shapes[name]=r.OneShape()
   exp=TopExp_Explorer(shapes[name],TopAbs_SOLID);count=0
   while exp.More():count+=1;exp.Next()
   records[name]={'url':url,'sha256':digest,'bytes':len(raw),'solidCount':count,'boundsMm':bounds(shapes[name])}
  trials=[]
  for phase in [0,30]:
   left=transformed(shapes['hub'],-1,phase);right=transformed(shapes['hub'],1,phase+180)
   trials.append({'phaseDegrees':phase,'opposingHubClockingDegrees':180,
      'leftBoundsMm':bounds(left),'rightBoundsMm':bounds(right),
      'wheelLeftCommonMm3':common(shapes['wheel'],left),'wheelRightCommonMm3':common(shapes['wheel'],right),
      'hubHubCommonMm3':common(left,right)})
  return {'schema':'frc-native-wheel-stack-exploration/v1','status':'executed-bounded-placement-experiment',
    'runtime':{'python':sys.version,'ocp':importlib.metadata.version('cadquery-ocp')},
    'sourceRecords':records,'placementBasis':'original assumed coaxial assembly; observed core faces +/-11.90625 mm and hub shoulder6.35 mm; not supplier assembly approval',
    'trials':trials,'vendorAssetsRetained':False,'assemblyExported':False,
    'nativeThreadsInspected':False,'fastenerSelected':False,'fitAcceptance':'unverified','engineeringAcceptance':'blocked',
    'limitations':['No native shaft, bearing, collar, screw or housing included','Common volume is nominal rigid geometry only, not fit tolerance or assembly interference force','Two clocking trials are not an exhaustive assembly search','No material/inertia/contact law inferred','No prior contact validity transferred']}
if __name__=='__main__':
 if len(sys.argv)!=1:raise ValueError('No arguments accepted')
 print(json.dumps(run(),indent=2))
