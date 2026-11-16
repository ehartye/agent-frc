"""NOTE-only overhung vertical support assembly; original plate/spacer/shaft hypotheses."""
import pathlib,json,hashlib,math,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
h=module('housing','scripts/inspect-housing-stack.py');s=h.s;a=s.a;b=s.b
layout=module('layout','scripts/retained-pregrip-fit.py')
PINS=sorted(set(['scripts/note-overhung-support.py','scripts/inspect-housing-stack.py','scripts/inspect-support-stack.py','scripts/inspect-accessory-stack.py','scripts/inspect-wheel-stack.py','case-studies/note-overhung-support-evidence.json']+layout.PINS))
def world(shape):
 t=b.gp_Trsf();t.SetRotation(b.gp_Ax1(b.gp_Pnt(0,0,0),b.gp_Dir(0,1,0)),-math.pi/2);shape=b.BRepBuilderAPI_Transform(shape,t,True).Shape();return layout.move(shape,400,227.6,25.4)
def report(cad_dir,collar_drop=0):
 if isinstance(collar_drop,bool) or not isinstance(collar_drop,(int,float)) or not math.isfinite(collar_drop) or not 0<=collar_drop<=10:raise ValueError('collar offset domain')
 e=json.loads((ROOT/'case-studies/note-overhung-support-evidence.json').read_text());raw={}
 for key,source in e['sources'].items():
  p=pathlib.Path(cad_dir)/(key+'.step')
  if hashlib.sha256(p.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('CAD revision '+key)
  r=b.STEPControl_Reader()
  if r.ReadFile(str(p))!=b.IFSelect_RetDone or r.TransferRoots()!=1:raise ValueError('CAD import')
  raw[key]=r.OneShape()
 parts={'wheel':raw['wheel'],'hubLower':b.transformed(raw['hub'],-1,0),'hubUpper':b.transformed(raw['hub'],1,180),'socketLower':a.pose(raw['socket'],-11.90625,-12.7,side=-1),'socketUpper':a.pose(raw['socket'],11.90625,12.7,side=1),'lowerCollar':a.pose(raw['collar'],-17.4625-collar_drop),'upperCollar':a.pose(raw['collar'],87.54375),'hubSpacer':s.ring(27.14375,14.2875),'bearingSpacer':s.ring(27.0625,49.36875)}
 if collar_drop:parts['lowerHubSpacer']=s.ring(collar_drop,-14.2875-collar_drop)
 shaft=s.shaft_envelope();tr=b.gp_Trsf();tr.SetRotation(b.gp_Ax1(b.gp_Pnt(0,0,0),b.gp_Dir(1,0,0)),math.pi/6);shaft=b.BRepBuilderAPI_Transform(shaft,tr,True).Shape();parts['shaft']=b.BRepAlgoAPI_Common(shaft,layout.box(-20.6375-collar_drop,-20,-20,152.4,40,40)).Shape()
 plate=layout.box(-40,-25,-3.175,80,50,3.175)
 for x,radius in [(0,14.2875),(-25.4,2.5),(25.4,2.5)]:plate=a.BRepAlgoAPI_Cut(plate,layout.move(a.BRepPrimAPI_MakeCylinder(radius,3.175).Shape(),x,0,-3.175)).Shape()
 for name,z in [('lower',70.8),('upper',105.8)]:
  x=z-25.4;parts[name+'Bearing']=a.pose(raw['bearing'],x);parts[name+'Plate']=a.pose(plate,x+2.38125);parts[name+'Retainer']=a.pose(raw['retainer'],x+5.55625,side=-1)
 bad=world(a.pose(raw['retainer'],70.8-25.4+2.38125));parts={k:world(v) for k,v in parts.items()}
 # Original backing web only, unfastened tangency at plate ends. No selected rail attachment.
 parts['backWeb']=layout.box(440,202.6,70.00625,3.175,50,38.175)
 bounds={k:layout.bounds(v) for k,v in parts.items()};pairs=[];culled=0
 for i,k in enumerate(parts):
  for other in list(parts)[i+1:]:
   x,y=bounds[k],bounds[other]
   if any(x[j+3]<y[j]-1e-6 or y[j+3]<x[j]-1e-6 for j in range(3)):culled+=1;continue
   pairs.append(dict(parts=[k,other],classification='thread-proxy-not-engagement-proof' if {k,other} in ({'hubLower','socketLower'},{'hubUpper','socketUpper'}) else 'nonthread-interface',intersectionMm3=layout.common(parts[k],parts[other])))
 environments=layout.environment(177.8,177.8,50.8,40);sweeps=[]
 for name,bb in bounds.items():
  swept=layout.box(bb[0]-4,bb[1]-4,bb[2]-4,bb[3]-bb[0]+8,bb[4]-bb[1]+68,bb[5]-bb[2]+8)
  overlaps={k:layout.common(swept,shape) for k,shape in environments.items()};sweeps.append(dict(part=name,inflatedSweptBoundsMm=layout.bounds(swept),obstructionMm3=overlaps,envelopePass=all(v<1e-5 for v in overlaps.values())))
 return dict(schema='frc-note-overhung-support/v1',lowerCollarOffsetMm=collar_drop,unexpectedIntersections=[x for x in pairs if x['classification']=='nonthread-interface' and x['intersectionMm3']>1e-5],sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},sourceRecords=e['sources'],runtimeOcp=layout.OCP.__version__,partBoundsMm=bounds,pairChecks=pairs,aabbCulledPairCount=culled,partCount=len(parts),reversedRetainerControlMm3=layout.common(bad,parts['lowerBearing']),sweptChecks=sweeps,shaftEnvelopeMm=[4.7625-collar_drop,157.1625-collar_drop],bearingCentersZmm=[70.8,105.8],customSpacerWidthsMm=[27.14375,27.0625],railAttachment=None,axialContactAndPreload=None,loadAcceptance=None,limitations=['NOTE right side only; other side/season supports not inferred','Actual pinned wheel/hub/socket/bearing/collar/retainer CAD; custom shortened analytic shaft,plates,spacers and backing web','13.75mm shaft-envelope corner diameter differs from13.74mm drawing maximum; no tolerance/fit reconciliation','Backing web tangent to plates only, no fasteners/welds or rail attachment; housing fasteners absent','Pairwise rigid-volume tests and4mm-inflated fixed-orientation60mm lateral sweeps, not a constrained loaded assembly','No transfer of previous horizontal bank stiffness, race contact, preload, retention or dynamics','Adjusted collar/shaft can extend below mechanism-floor top datum outside its plate outline; ground/chassis clearance remains unknown','No physical sensing, actuator control or scoring acceptance'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--cad-dir',required=True);p.add_argument('--output',required=True);p.add_argument('--collar-drop',type=float,default=0);v=p.parse_args()
 with pathlib.Path(v.output).open('x',encoding='utf-8') as f:json.dump(report(v.cad_dir,v.collar_drop),f,indent=2,allow_nan=False);f.write('\n')
