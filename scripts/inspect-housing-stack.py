"""Local bearing/retainer/original plate housing hypothesis; no fastening acceptance."""
import importlib.util,pathlib,tempfile,urllib.request,hashlib,json
spec=importlib.util.spec_from_file_location('s',pathlib.Path(__file__).with_name('inspect-support-stack.py'));s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);a=s.a;b=s.b
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
SOURCES={k:v for k,v in s.SOURCES.items() if k in ['bearing','collar']}
SOURCES['retainer']=('REV-21-2286','6d22992a59ed8864450ad7d98f78c20118a948267ab876d871d4666d4bf8902f')

def run():
 shapes={};records={}
 with tempfile.TemporaryDirectory(prefix='frc-housing-') as td:
  for key,(part,pin) in SOURCES.items():
   url='https://www.revrobotics.com/content/cad/'+part+'.STEP';raw=urllib.request.urlopen(url,timeout=60).read();sha=hashlib.sha256(raw).hexdigest()
   if sha!=pin:raise ValueError('Changed source '+part)
   f=pathlib.Path(td)/(part+'.step');f.write_bytes(raw);r=b.STEPControl_Reader()
   if r.ReadFile(str(f))!=b.IFSelect_RetDone or r.TransferRoots()!=1:raise RuntimeError('STEP transfer failed')
   shapes[key]=r.OneShape();records[key]=dict(url=url,sha256=sha,bytes=len(raw),boundsMm=b.bounds(shapes[key]))
  # Original80x50x3.175 plate; local Z axis shaft, plate face Z0 aligned to flange underside.
  plate=BRepPrimAPI_MakeBox(b.gp_Pnt(-40,-25,-3.175),80,50,3.175).Shape()
  for x,radius in [(0,14.2875),(-25.4,2.5),(25.4,2.5)]:
   cylinder=a.BRepPrimAPI_MakeCylinder(radius,3.175).Shape();t=b.gp_Trsf();t.SetTranslation(b.gp_Vec(x,0,-3.175));cylinder=b.BRepBuilderAPI_Transform(cylinder,t,True).Shape()
   cut=a.BRepAlgoAPI_Cut(plate,cylinder);cut.Build()
   if not cut.IsDone():raise RuntimeError('Plate cut failed')
   plate=cut.Shape()
  posed=dict(plate=a.pose(plate,127.38125),retainer=a.pose(shapes['retainer'],130.55625,side=-1),bearing=a.pose(shapes['bearing'],125),collar=a.pose(shapes['collar'],132.14375))
  pairs=[('plate','bearing'),('plate','retainer'),('retainer','bearing'),('retainer','collar'),('plate','collar')]
  return dict(schema='frc-housing-local-exploration/v1',sourceRecords=records,reversedRetainerControl=a.overlap(a.pose(shapes['retainer'],127.38125),posed['bearing']),posedBoundsMm={k:b.bounds(v) for k,v in posed.items()},checks={k+'-'+m:a.overlap(posed[k],posed[m]) for k,m in pairs},
   originalPlate=dict(dimensionsMm=[80,50,3.175],boreDiameterMm=28.575,mountHolesDiameterMm=5,mountHoleSpacingMm=50.8,material=None,tolerances=None),
   engineeringAcceptance='blocked',fastenersIncluded=False,limitation='Only nominal local intersection. Race preload/face-contact and outer-race retention strength not accepted. No plate anchorage, stiffness or mirrored/combined housing execution. Drawing tolerances and machining release absent.')
if __name__=='__main__':print(json.dumps(run(),indent=2))
