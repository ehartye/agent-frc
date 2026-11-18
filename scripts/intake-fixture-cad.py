"""Original fixed planar intake fixture: one sleeve and two supports, never a complete robot."""
import pathlib,json,hashlib,sys,importlib.util,importlib.metadata
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox,BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut,BRepAlgoAPI_Common
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.gp import gp_Pnt,gp_Dir,gp_Ax2
from OCP.TopoDS import TopoDS_Compound
from OCP.BRep import BRep_Builder
from OCP.STEPControl import STEPControl_Writer,STEPControl_Reader,STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('season_cad',ROOT/'scripts/season-mechanism-cad.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
check=base.require;sha=base.sha

def same(a,b):
 if type(b) in (int,float):return type(a) in (int,float) and a==b
 if type(b) is dict:return type(a) is dict and set(a)==set(b) and all(same(a[k],b[k]) for k in b)
 if type(b) is list:return type(a) is list and len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
 return type(a) is type(b) and a==b

def make_config(variant):
 check(variant in ('compressed','nominal'),'Known independent fixture variant required')
 parent_path=ROOT/'case-studies/2026/roller-mechanism.json';parent=json.loads(parent_path.read_text());base.validate(parent);context=base.context(2026)
 z=186.1 if variant=='compressed' else 188.1
 return {'schema':'frc-fuel-intake-fixture/v1','id':'fuel-intake-'+variant,'variant':variant,'basis':'original-unvalidated-fixed-planar-fixture','parentCadConfigPin':{'path':'case-studies/2026/roller-mechanism.json','sha256':sha(parent_path)},'graphPins':context['pins'],'frame':{'unit':'mm','origin':'floor-top-at-roller-X-and-centerline-Y','axes':'+X feed, +Y shaft, +Z up; right-handed','fieldRegistration':'none'},'roller':{'id':'driven-sleeve','axisOriginMm':[0.,0.,z],'axisUnitVector':[0.,1.,0.],'outerRadiusMm':38.1,'boreRadiusMm':6.35,'lengthMm':200.,'densityKgM3':1200.,'densityBasis':'assumed-uniform-not-material-identification','gearRatio':10.,'motorCount':1,'gearingBasis':'hypothetical-not-manufacturer-verified'},'supports':[{'id':'floor','role':'fixed-support-no-mass-model','minMm':[-400.,-150.,-20.],'maxMm':[90.,150.,0.]},{'id':'backstop','role':'fixed-support-no-mass-model','minMm':[90.,-150.,0.],'maxMm':[110.,150.,300.]}],'contactFaces':[{'id':'floor-top','supportId':'floor','pointMm':[0.,0.,0.],'normal':[0.,0.,1.],'domainMm':{'x':[-400.,90.],'y':[-150.,150.]}},{'id':'backstop-inner','supportId':'backstop','pointMm':[90.,0.,0.],'normal':[-1.,0.,0.],'domainMm':{'y':[-150.,150.],'z':[0.,300.]}}],'pieceSource':parent['piece'],'modelDimension':'planar-XZ-at-Y0-only','contactCoefficients':None,'assemblyComplete':False,'totalAssemblyMassKg':None,'captureEstablished':False,'engineeringAcceptance':'blocked','omissions':['No shaft, motor rotor, gearbox, bearings, guards or support strength model','Fixed supports are original fixture geometry, not robot mass or official field geometry','Planar centerline constraint is external; no side guides, end-face or corner collision claim','Contact stiffness, damping and friction are unknown until separately declared experiment assumptions','Native mass/inertia describes the ideal sleeve under assumed density, not measured material or assembly','Any imposed overlap is a compliant experiment design; no rigid interpenetration validity or capture outcome']}

def validate(c):
 check(type(c) is dict and type(c.get('variant')) is str,'Closed fixture object required')
 check(same(c,make_config(c['variant'])),'Fixture differs from exact reviewed geometry/source/context schema')
 return True

def shapes(c):
 r=c['roller'];axis=gp_Ax2(gp_Pnt(0,-r['lengthMm']/2,r['axisOriginMm'][2]),gp_Dir(0,1,0))
 outer=BRepPrimAPI_MakeCylinder(axis,r['outerRadiusMm'],r['lengthMm']).Shape();inner=BRepPrimAPI_MakeCylinder(axis,r['boreRadiusMm'],r['lengthMm']).Shape();cut=BRepAlgoAPI_Cut(outer,inner);cut.Build();check(cut.IsDone(),'Sleeve boolean failed');items=[(r['id'],'driven-sleeve',cut.Shape())]
 for p in c['supports']:
  lo,hi=p['minMm'],p['maxMm'];items.append((p['id'],p['role'],BRepPrimAPI_MakeBox(gp_Pnt(*lo),*(hi[i]-lo[i] for i in range(3))).Shape()))
 return items

def bounds(s):
 box=Bnd_Box();BRepBndLib.AddOptimal_s(s,box,False,False);lo,hi=box.CornerMin(),box.CornerMax();return [lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z()]
def properties(s):
 p=GProp_GProps();BRepGProp.VolumeProperties_s(s,p);return p

def common_volume(a,b):
 op=BRepAlgoAPI_Common(a,b);op.Build();check(op.IsDone(),'Native intersection failed');return properties(op.Shape()).Mass()

def generate(c,dest):
 validate(c);Interface_Static.SetCVal_s('write.step.unit','MM');Interface_Static.SetCVal_s('xstep.cascade.unit','MM');compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
 for _,_,shape in shapes(c):check(BRepCheck_Analyzer(shape).IsValid(),'Invalid original solid');builder.Add(compound,shape)
 writer=STEPControl_Writer();check(writer.Transfer(compound,STEPControl_AsIs)==IFSelect_RetDone,'STEP transfer failed');check(writer.Write(str(dest))==IFSelect_RetDone,'STEP write failed')

def extract(c,path):
 validate(c);before=sha(path);Interface_Static.SetCVal_s('xstep.cascade.unit','MM');reader=STEPControl_Reader();check(reader.ReadFile(str(path))==IFSelect_RetDone and reader.TransferRoots()==1,'Native fixture read failed')
 ex=TopExp_Explorer(reader.OneShape(),TopAbs_SOLID);native=[]
 while ex.More():native.append(ex.Current());ex.Next()
 check(len(native)==3,'Exactly one sleeve and two fixed support solids required');used=set();records=[];roller=None
 for identity,role,expected in shapes(c):
  expected_bounds=bounds(expected);matches=[i for i,s in enumerate(native) if all(abs(a-b)<1e-5 for a,b in zip(bounds(s),expected_bounds))];check(len(matches)==1 and matches[0] not in used,'Unique body-role selector failed');i=matches[0];used.add(i);s=native[i];check(BRepCheck_Analyzer(s).IsValid(),'Invalid native solid');p=properties(s);V=p.Mass();symmetric_difference=V+properties(expected).Mass()-2*common_volume(s,expected);check(abs(symmetric_difference)<=1e-3,'Native body differs from analytic fixture solid');records.append({'id':identity,'role':role,'boundsMm':bounds(s),'volumeMm3':V,'solidCountMatched':1,'symmetricDifferenceVolumeMm3':symmetric_difference})
  if role=='driven-sleeve':
   r=c['roller'];rho=r['densityKgM3'];center=p.CentreOfMass();centroid=[center.X(),center.Y(),center.Z()];T=p.MatrixOfInertia();tensor=[[T.Value(i,j)*rho*1e-15 for j in range(1,4)] for i in range(1,4)];mass=V*rho*1e-9;roller={**r,'massKg':mass,'centroidMm':centroid,'centroidalTensorKgM2':tensor,'shaftInertiaKgM2':base.axis_inertia(tensor,mass,centroid,r['axisOriginMm'],r['axisUnitVector'])}
 overlaps=[]
 for i in range(3):
  for j in range(i+1,3):
   volume=common_volume(native[i],native[j]);check(abs(volume)<=1e-3,'Fixture solid intersection');overlaps.append({'nativeSolidIndices':[i,j],'intersectionVolumeMm3':volume})
 check(sha(path)==before,'STEP changed during fixture extraction')
 return {'schema':'frc-native-intake-fixture/v1','id':c['id'],'variant':c['variant'],'cadSha256':before,'frame':c['frame'],'bodies':records,'roller':roller,'analyticContactFaces':c['contactFaces'],'nativeIntersectionChecks':overlaps,'numericalGeometryTolerance':'1e-5 mm bounds; 1e-3 mm3 symmetric-difference/intersection, numerical only','pieceSource':c['pieceSource'],'modelDimension':c['modelDimension'],'assemblyComplete':False,'totalAssemblyMassKg':None,'captureEstablished':False,'engineeringAcceptance':'blocked','omissions':c['omissions']}

def run(config_path,out):
 raw=pathlib.Path(config_path).read_bytes();check(len(raw)<=65536,'Fixture input size bound');c=json.loads(raw);validate(c);context=base.context(2026)['files'];context['scripts/season-mechanism-cad.py']=sha(ROOT/'scripts/season-mechanism-cad.py');context['case-studies/2026/roller-mechanism.json']=sha(ROOT/'case-studies/2026/roller-mechanism.json');out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=False)
 receipt={'schema':'frc-native-intake-fixture-receipt/v1','status':'running','configSha256':hashlib.sha256(raw).hexdigest(),'sourceSha256':sha(__file__),'contextFileHashes':context,'python':sys.version,'ocpVersion':importlib.metadata.version('cadquery-ocp'),'scope':'original-native-fixture-only-no-IO-contact-or-capture-execution','engineeringAcceptance':'blocked'}
 def save():(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  (out/'input.json').write_bytes(raw);step=out/'fixture.step';generate(c,step);p=extract(c,step);p['configSha256']=receipt['configSha256'];p['sourceSha256']=receipt['sourceSha256'];(out/'properties.json').write_text(json.dumps(p,indent=2)+'\n');check(sha(config_path)==receipt['configSha256'] and sha(__file__)==receipt['sourceSha256'] and all(sha(ROOT/k)==v for k,v in context.items()),'Fixture input/context changed');receipt.update(status='passed',cadSha256=sha(step),propertiesSha256=sha(out/'properties.json'));save();return p
 except Exception as e:receipt.update(status='failed',error=str(e));save();raise
if __name__=='__main__':check(len(sys.argv)==3,'Usage: intake-fixture-cad.py config.json NEW_OUTPUT_DIRECTORY');run(sys.argv[1],sys.argv[2])
