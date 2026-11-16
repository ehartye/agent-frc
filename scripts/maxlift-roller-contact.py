"""Individual nominal MAXLift roller witnesses, not preload or captive guide acceptance."""
import pathlib,json,hashlib,importlib.util,math
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex,BRepBuilderAPI_MakeEdge
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('corner',ROOT/'scripts/maxlift-corner-mating.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c);g=c.g
PINS=c.PINS+['scripts/maxlift-roller-contact.py']
def read(directory,part):
 e=json.loads((ROOT/'case-studies/maxlift-corner-evidence.json').read_text());p=pathlib.Path(directory)/(part+'.STEP')
 if hashlib.sha256(p.read_bytes()).hexdigest()!=e['sources'][part]['sha256']:raise ValueError('CAD revision mismatch')
 r=g.STEPControl_Reader()
 if r.ReadFile(str(p))!=g.IFSelect_RetDone or r.TransferRoots()!=1:raise ValueError('CAD import')
 return r.OneShape()
def rollers(block):
 result=[];it=TopExp_Explorer(block,TopAbs_FACE)
 while it.More():
  face=TopoDS.Face(it.Current());a=BRepAdaptor_Surface(face)
  if a.GetType()==GeomAbs_Cylinder:
   cy=a.Cylinder();r=cy.Radius();axis=cy.Axis();v=axis.Direction();p=axis.Location()
   if abs(r-8)<1e-7 and abs(v.Z())>.999999 or abs(r-9.5)<1e-7 and abs(v.X())>.999999:
    result.append((face,dict(radiusMm=r,axisPointMm=[p.X(),p.Y(),p.Z()],axisDirection=[v.X(),v.Y(),v.Z()],boundsMm=g.bounds(face))))
  it.Next()
 if len(result)!=8:raise ValueError('expected eight native half-cylinder faces')
 groups={}
 for face,d in result:
  key=tuple(round(v,6) for v in [d['radiusMm']]+d['axisPointMm']);groups.setdefault(key,[]).append((face,d))
 if len(groups)!=4 or any(len(v)!=2 for v in groups.values()):raise ValueError('expected four paired rollers')
 return [groups[k] for k in sorted(groups)]
def track(rail,p):
 edge=BRepBuilderAPI_MakeEdge(g.gp_Pnt(p[0],p[1]-60,p[2]),g.gp_Pnt(*p)).Shape();op=g.BRepAlgoAPI_Common(edge,rail);op.Build()
 if not op.IsDone():raise ValueError('track boolean failure')
 prop=g.GProp_GProps();g.BRepGProp.LinearProperties_s(op.Shape(),prop);return prop.Mass()
def report(directory):
 block=read(directory,'REV-21-2618');raw=read(directory,'REV-21-2162');groups=rollers(block);cases=[];witnesses=[];base=c.placed(raw,[31.745,300,0])
 for group in groups:
  d=group[0][1];z=d['axisPointMm'][2];point=[19.045,-.005,22.8 if z>0 else -22.8] if d['radiusMm']<9 else [22.05,0,25.4 if z>0 else -25.4];vertex=BRepBuilderAPI_MakeVertex(g.gp_Pnt(*point)).Shape()
  witnesses.append(dict(pointMm=point,pointToActualCylinderMm=min(g.distance(vertex,f) for f,_ in group),pointToNativeTubeMm=g.distance(vertex,base),continuous60mmTrackLengthMm=track(base,point)))
 for x in [31.745,31.75,36.745,41.745]:
  rail=c.placed(raw,[x,300,0]);cases.append(dict(railTranslationMm=[x,300,0],rollerDistancesMm=[min(g.distance(f,rail) for f,_ in group) for group in groups],wholePairDistanceMm=g.distance(block,rail)))
 controls=[dict(pointMm=[x,0,25.4],trackLengthMm=track(base,[x,0,25.4])) for x in [31.745,32.745,34.745]]
 return dict(schema='frc-maxlift-roller-contact/v1',sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},runtimeOcp=g.OCP.__version__,rollerFaces=[[d for _,d in group] for group in groups],witnesses=witnesses,cases=cases,nativeTrackControls=controls,strokeRailYmm=[300,360],opposedStageInstalled=False,physicalPreload=None,continuousStrokeWitness='four nominal mid-width point tracks on actual trimmed cylindrical faces and native tube',engineeringAcceptance='blocked',limitations=['Nominal fixed-orientation translation only, no tolerances or contact-patch width','One block is not captive; whole-pair distance masks loss of individual roller contacts','No fasteners, preload, loads, rolling friction, wheel support attachment or robot-world integration','No transfer of old pad dynamics or season scoring'])
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--cad-dir',required=True);a.add_argument('--output',required=True);v=a.parse_args()
 with pathlib.Path(v.output).open('x') as f:json.dump(report(v.cad_dir),f,indent=2,allow_nan=False);f.write('\n')
