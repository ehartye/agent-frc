"""Original FUEL support layout with pinned bearings/collars; nominal geometry only."""
import importlib.util,pathlib,tempfile,urllib.request,hashlib,json,math
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon,BRepBuilderAPI_MakeFace
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
spec=importlib.util.spec_from_file_location('a',pathlib.Path(__file__).with_name('inspect-accessory-stack.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a);b=a.b
SOURCES={
'bearing':('REV-21-1916','3e16cb3f5f215288b8706eb8228d9580fea78c425eee536ef95195b5b98f02e6'),
'collar':('REV-21-2900','9167c2167b9470f9b33ef368b81d1cc52038c7914f220cc7dd83f142c2022ee9'),
'socket':a.SOURCES['socket'],'hub':a.SOURCES['hub']}

def translate(s,x):
 t=b.gp_Trsf();t.SetTranslation(b.gp_Vec(x,0,0));return b.BRepBuilderAPI_Transform(s,t,True).Shape()

def ring(width,x):
 cut=a.BRepAlgoAPI_Cut(a.BRepPrimAPI_MakeCylinder(8.5,width).Shape(),a.BRepPrimAPI_MakeCylinder(7,width).Shape());cut.Build()
 if not cut.IsDone():raise RuntimeError('Analytic ring construction failed')
 return a.pose(cut.Shape(),x)

def shaft_envelope():
 # Original nominal rounded-hex envelope, not a complete purchased shaft CAD model.
 polygon=BRepBuilderAPI_MakePolygon()
 for i in range(6):
  theta=math.radians(30+i*60);r=12.7/math.sqrt(3)
  polygon.Add(b.gp_Pnt(r*math.cos(theta),r*math.sin(theta),0))
 polygon.Close();prism=BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(polygon.Wire()).Face(),b.gp_Vec(0,0,300)).Shape()
 clip=b.BRepAlgoAPI_Common(prism,a.BRepPrimAPI_MakeCylinder(6.875,300).Shape());clip.Build()
 if not clip.IsDone():raise RuntimeError('Shaft envelope construction failed')
 return a.pose(clip.Shape(),-150)

def run():
 shapes={};records={}
 with tempfile.TemporaryDirectory(prefix='frc-support-') as td:
  for key,(part,pin) in SOURCES.items():
   url='https://www.revrobotics.com/content/cad/'+part+'.STEP';raw=urllib.request.urlopen(url,timeout=60).read();sha=hashlib.sha256(raw).hexdigest()
   if sha!=pin:raise ValueError('Source changed '+part)
   f=pathlib.Path(td)/(part+'.step');f.write_bytes(raw);r=b.STEPControl_Reader()
   if r.ReadFile(str(f))!=b.IFSelect_RetDone or r.TransferRoots()!=1:raise RuntimeError('Transfer failed')
   shapes[key]=r.OneShape();records[key]=dict(url=url,sha256=sha,bytes=len(raw),boundsMm=b.bounds(shapes[key]))
  # Adjacent wheel centers0 and34.925; opposing entry heads occupy y=-12.7 and+12.7.
  first=a.pose(shapes['socket'],-11.90625,-12.7,side=-1)
  second=a.pose(shapes['socket'],34.925+11.90625,12.7,side=1)
  middle=ring(6.35,14.2875)
  # Positive end of six-wheel bank; mirror symmetry is proposed, not separately checked.
  wheelCenter=87.3125;bossEnd=101.6;bearingCenter=125
  bearing=a.pose(shapes['bearing'],bearingCenter)
  collar=a.pose(shapes['collar'],132.14375)
  endSpacer=ring(19.43125,bossEnd)
  hub=translate(b.transformed(shapes['hub'],1,180),wheelCenter)
  endScrew=translate(first,wheelCenter)
  shaft=shaft_envelope();misclocked=shaft
  rotation=b.gp_Trsf();rotation.SetRotation(b.gp_Ax1(b.gp_Pnt(0,0,0),b.gp_Dir(1,0,0)),math.pi/6)
  shaft=b.BRepBuilderAPI_Transform(shaft,rotation,True).Shape()
  pairs={'shaftHub':(shaft,hub),'shaftBearing':(shaft,bearing),'shaftCollar':(shaft,collar),'shaftEndSpacer':(shaft,endSpacer),'adjacentSocketHeads':(first,second),'middleSpacerFirstSocket':(middle,first),'middleSpacerSecondSocket':(middle,second),'endSpacerHub':(endSpacer,hub),'endSpacerSocket':(endSpacer,endScrew),'endSpacerBearing':(endSpacer,bearing),'bearingCollar':(bearing,collar)}
  return dict(schema='frc-support-layout-exploration/v1',sourceRecords=records,shaftClockingDegrees=30,misclockedShaftHubControl=a.overlap(misclocked,hub),checks={name:a.overlap(*pair) for name,pair in pairs.items()},
   originalLayoutMm=dict(pitch=34.925,wheelCenters=[-87.3125,-52.3875,-17.4625,17.4625,52.3875,87.3125],bearingCenters=[-125,125],shaftEnds=[-150,150],endSpacerWidth=19.43125,collarCenter=132.14375,collarOuterEnd=135.31875,endAllowance=14.68125),
   proposedSpacer=dict(odMm=17,idMm=14,interWheelWidthMm=6.35,endWidthMm=19.43125,supplierSku=None,material=None),
   engineeringAcceptance='blocked',supportHousingIncluded=False,shaftIncluded=True,shaftProvenance='original nominal external envelope only; 12.7mm flats clipped by13.75mm circle; no bore, threads, tolerance, material or inertia',wheelIncluded=False,threadEngagementChecked=False,
   limitation='Nominal pairwise rigid-volume checks only. Opposite-end support not separately executed. Contact faces, race load paths, preload, tolerances, stiffness, material and dynamic acceptance unverified.')
if __name__=='__main__':print(json.dumps(run(),indent=2))
