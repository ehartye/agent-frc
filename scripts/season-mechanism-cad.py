"""Original two-sleeve CAD fixture; no physical or scoring acceptance."""
import json, math, hashlib, pathlib, sys, importlib.metadata, subprocess
from OCP.Interface import Interface_Static
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.gp import gp_Ax2,gp_Pnt,gp_Dir
from OCP.TopoDS import TopoDS_Compound
from OCP.BRep import BRep_Builder
from OCP.STEPControl import STEPControl_Writer,STEPControl_Reader,STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
ROOT=pathlib.Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def require(ok,msg):
 if not ok:raise ValueError(msg)
def keys(o,expected):require(type(o) is dict and set(o)==set(expected.split()),'Closed schema required')
def num(x,lo,hi):return type(x) in (int,float) and math.isfinite(x) and lo<=x<=hi
def context(year):
 result=subprocess.run(['node',str(ROOT/'scripts/roller-context.mjs'),str(year)],check=True,capture_output=True,text=True)
 return json.loads(result.stdout)
def validate(c):
 keys(c,'schema season candidateId basis graphPins frame rollers piece transport contact omissions engineeringAcceptance')
 require(c['schema']=='frc-roller-mechanism-input/v1' and type(c['season']) is int and c['season'] in (2024,2025,2026),'Supported season schema required')
 year=c['season'];branch='fixed-speaker' if year==2024 else 'coral-l1' if year==2025 else 'fuel-feeder'
 require(c['candidateId']==f'{year}-{branch}' and c['basis']=='original-unvalidated-concept' and c['engineeringAcceptance']=='blocked','Unvalidated candidate scope required')
 expected=context(year)['pins']
 require(type(c['graphPins']) is dict and set(c['graphPins'])==set(expected),'Exact graph pin kinds required')
 for pin in c['graphPins'].values():
  keys(pin,'id revision sha256');require(type(pin['id']) is str and type(pin['revision']) is int and type(pin['sha256']) is str,'Primitive graph pin types required')
 require(c['graphPins']==expected,'Exact current planning graph pins required')
 require(c['frame']=={'unit':'mm','origin':'midpoint-between-roller-axes','axes':'+X transport, +Y shafts, +Z up; right-handed'},'Only explicit axis-aligned fixture frame supported')
 require(type(c['rollers']) is list and len(c['rollers'])==2,'Exactly two rotors required')
 for r,name,sign in zip(c['rollers'],('upper','lower'),(1,-1)):
  keys(r,'id axisOriginMm axisUnitVector outerRadiusMm boreRadiusMm lengthMm densityKgM3 densityBasis gearRatio motorCount contactVelocitySign')
  require(r['id']==name and type(r['axisUnitVector']) is list and all(type(v) in (int,float) for v in r['axisUnitVector']) and r['axisUnitVector']==[0.,1.,0.] and type(r['contactVelocitySign']) is int and r['contactVelocitySign']==-sign,'Explicit Y shaft required')
  require(num(r['outerRadiusMm'],10,150) and num(r['boreRadiusMm'],1,50) and r['boreRadiusMm']<r['outerRadiusMm'] and num(r['lengthMm'],20,600),'Rotor dimensions outside fixture domain')
  require(type(r['axisOriginMm']) is list and len(r['axisOriginMm'])==3 and all(num(v,-500,500) for v in r['axisOriginMm']) and r['axisOriginMm'][:2]==[0.,0.] and sign*r['axisOriginMm'][2]>0,'Explicit symmetric axis positions required')
  require(num(r['densityKgM3'],100,10000) and r['densityBasis']=='assumed-uniform-not-material-identification','Explicit finite assumed density required')
  require(num(r['gearRatio'],.1,100) and type(r['motorCount']) is int and 1<=r['motorCount']<=4,'Motor/gearing assumptions invalid')
 a,b=c['rollers'];require(a['axisOriginMm'][2]==-b['axisOriginMm'][2] and all(a[k]==b[k] for k in ('outerRadiusMm','boreRadiusMm','lengthMm','densityKgM3','gearRatio','motorCount')),'Symmetric pair required')
 p=c['piece'];keys(p,'type source orientation geometryMm massMinKg massMaxKg massBasis'+(' roundingNote' if year==2026 else ''));keys(p['source'],'url sha256 revision locator')
 case=json.loads((ROOT/f'case-studies/{year}/case.json').read_text());m=case['manualFingerprint']
 require(p['source']=={'url':m['url'],'sha256':m['sha256'],'revision':'section 5 V8' if year==2024 else 'section 5 V4' if year==2025 else 'TU22','locator':'p34 section5.7' if year==2024 else 'p33 section5.7.1' if year==2025 else 'pp32-33 section5.10.1'},'Exact reviewed piece source pin required')
 geom={'outerDiameter':355.6,'innerDiameter':254.,'thickness':50.8} if year==2024 else {'outerDiameter':114.3,'innerDiameter':101.6,'length':301.625} if year==2025 else {'diameter':150.}
 require(p['geometryMm']==geom and p['type']==('NOTE' if year==2024 else 'CORAL' if year==2025 else 'FUEL') and p['orientation']==('torus-axis-Z-flat' if year==2024 else 'tube-axis-X-axial' if year==2025 else 'sphere-no-preferred-axis'),'Exact reviewed nominal piece dimensions/orientation required')
 limits=(8.1*.028349523125,8.5*.028349523125) if year==2024 else (1.1*.45359237,1.8*.45359237) if year==2025 else (.448*.45359237,.500*.45359237)
 require((p['massMinKg'],p['massMaxKg'])==limits and p['massBasis']=='manual-range-not-measured-specimen','Exact source mass range required')
 if year==2026:require(p['roundingNote']=='Uses displayed 15.0 cm metric nominal; 5.91 inch converts to 150.114 mm. Neither is a measured tolerance.','Explicit metric nominal rounding choice required')
 gap=2*(a['axisOriginMm'][2]-a['outerRadiusMm']);require(abs(gap-(50.8 if year==2024 else 114.3 if year==2025 else 150.))<1e-8,'Nominal tangent gap only; compression unsupported')
 require(a['lengthMm']>=(355.6 if year==2024 else 114.3 if year==2025 else 150.),'Sleeve span must cover nominal transverse piece extent')
 t=c['transport'];keys(t,'axisUnitVector entryPlaneXmm exitPlaneXmm sensorPlanesXmm planeBasis')
 require(type(t['axisUnitVector']) is list and all(type(v) in (int,float) for v in t['axisUnitVector']) and t['axisUnitVector']==[1.,0.,0.] and t['planeBasis']=='hypothetical-fixture-datums-not-field-targets','Explicit fixture transport axis required')
 require(num(t['entryPlaneXmm'],-2000,-200) and num(t['exitPlaneXmm'],200,2000),'Bounded fixture planes required')
 require(type(t['sensorPlanesXmm']) is list and len(t['sensorPlanesXmm'])==3 and all(num(v,t['entryPlaneXmm'],t['exitPlaneXmm']) for v in t['sensorPlanesXmm']) and t['sensorPlanesXmm']==sorted(set(t['sensorPlanesXmm'])),'Three distinct ordered sensor planes required')
 require(c['contact']=={'frictionCoefficient':None,'normalForcePerRollerN':None,'basis':'unresolved-not-derived-from-nominal-tangency'},'CAD tangency cannot establish contact physics')
 require(type(c['omissions']) is list and 4<=len(c['omissions'])<=64 and all(type(x) is str and 0<len(x)<=2048 for x in c['omissions']),'Explicit physical omissions required')
 return True

def axis_inertia(tensor,mass,center,origin,u):
 d=[center[i]-origin[i] for i in range(3)];along=sum(d[i]*u[i] for i in range(3))
 return sum(u[i]*tensor[i][j]*u[j] for i in range(3) for j in range(3))+mass*(sum(x*x for x in d)-along*along)*1e-6

def generate(c,dest):
 validate(c);Interface_Static.SetCVal_s('write.step.unit','MM');Interface_Static.SetCVal_s('xstep.cascade.unit','MM');compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
 for r in c['rollers']:
  o=r['axisOriginMm'];axis=gp_Ax2(gp_Pnt(o[0],o[1]-r['lengthMm']/2,o[2]),gp_Dir(0,1,0))
  outer=BRepPrimAPI_MakeCylinder(axis,r['outerRadiusMm'],r['lengthMm']).Shape();inner=BRepPrimAPI_MakeCylinder(axis,r['boreRadiusMm'],r['lengthMm']).Shape()
  cut=BRepAlgoAPI_Cut(outer,inner);cut.Build();require(cut.IsDone(),'Native sleeve boolean failed');builder.Add(compound,cut.Shape())
 writer=STEPControl_Writer();require(writer.Transfer(compound,STEPControl_AsIs)==IFSelect_RetDone,'STEP transfer failed');require(writer.Write(str(dest))==IFSelect_RetDone,'STEP write failed')

def extract(c,source):
 validate(c);source_hash=sha(source);Interface_Static.SetCVal_s('xstep.cascade.unit','MM');reader=STEPControl_Reader();require(reader.ReadFile(str(source))==IFSelect_RetDone and reader.TransferRoots()==1,'Native STEP read failed')
 ex=TopExp_Explorer(reader.OneShape(),TopAbs_SOLID);bodies=[]
 while ex.More():
  shape=ex.Current();box=Bnd_Box();BRepBndLib.AddOptimal_s(shape,box,False,False);lo,hi=box.CornerMin(),box.CornerMax();bounds=[lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z()];bodies.append((shape,bounds));ex.Next()
 require(len(bodies)==2,'Exactly two native sleeve solids required');outputs=[];used=set()
 for r in c['rollers']:
  rad,L=r['outerRadiusMm'],r['lengthMm'];x,y,z=r['axisOriginMm'];expected=[x-rad,y-L/2,z-rad,x+rad,y+L/2,z+rad]
  matches=[i for i,(_,bounds) in enumerate(bodies) if all(abs(a-b)<1e-5 for a,b in zip(bounds,expected))];require(len(matches)==1 and matches[0] not in used,'Unique native body selector failed');i=matches[0];used.add(i)
  props=GProp_GProps();BRepGProp.VolumeProperties_s(bodies[i][0],props);V=props.Mass();rho=r['densityKgM3'];mass=V*rho*1e-9;center=props.CentreOfMass();centroid=[center.X(),center.Y(),center.Z()];T=props.MatrixOfInertia();tensor=[[T.Value(i,j)*rho*1e-15 for j in range(1,4)] for i in range(1,4)]
  I=axis_inertia(tensor,mass,centroid,r['axisOriginMm'],r['axisUnitVector']);require(math.isfinite(I) and I>0 and mass>0,'Invalid native mass properties')
  outputs.append({'id':r['id'],'bodySelector':{'boundsMm':bodies[i][1],'solidCountMatched':1},'axisOriginMm':r['axisOriginMm'],'axisUnitVector':r['axisUnitVector'],'contactRadiusMm':rad,'contactVelocitySign':r['contactVelocitySign'],'gearRatio':r['gearRatio'],'motorCount':r['motorCount'],'volumeMm3':V,'centroidMm':centroid,'massKg':mass,'centroidalTensorKgM2':tensor,'shaftInertiaKgM2':I,'densityKgM3':rho,'densityBasis':r['densityBasis']})
 require(sha(source)==source_hash,'STEP changed during native extraction')
 return {'assemblyComplete':False,'schema':'frc-native-roller-properties/v1','season':c['season'],'candidateId':c['candidateId'],'cadSha256':source_hash,'cadBytes':pathlib.Path(source).stat().st_size,'frame':c['frame'],'rollers':outputs,'omissions':c['omissions'],'physicalValidation':False,'engineeringAcceptance':'blocked'}

def run(config_path,out):
 raw=pathlib.Path(config_path).read_bytes();require(len(raw)<=65536,'Input size limit');c=json.loads(raw);validate(c);out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=False)
 context_files=context(c['season'])['files']
 receipt={'contextFileHashes':context_files,'schema':'frc-native-roller-cad-receipt/v1','status':'running','configSha256':hashlib.sha256(raw).hexdigest(),'sourceSha256':sha(__file__),'python':sys.version,'ocpVersion':importlib.metadata.version('cadquery-ocp'),'scope':'original-native-sleeve-CAD-only-no-IO-execution','engineeringAcceptance':'blocked'}
 def save(): (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  (out/'input.json').write_bytes(raw);step=out/'mechanism.step';generate(c,step);r=extract(c,step);r['configSha256']=receipt['configSha256'];r['sourceSha256']=receipt['sourceSha256'];(out/'properties.json').write_text(json.dumps(r,indent=2)+'\n')
  require(sha(config_path)==receipt['configSha256'] and sha(__file__)==receipt['sourceSha256'] and all(sha(ROOT/p)==h for p,h in context_files.items()),'Inputs changed during run')
  receipt.update(status='passed',cadSha256=sha(step),propertiesSha256=sha(out/'properties.json'));save();return r
 except Exception as e:receipt.update(status='failed',error=str(e));save();raise
if __name__=='__main__':
 require(len(sys.argv)==3,'Usage: season-mechanism-cad.py config.json new-output-dir');run(sys.argv[1],sys.argv[2])
