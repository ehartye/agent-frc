"""Pinned component dimensions and fresh prescribed triangular native gate sweeps."""
import pathlib,importlib.util,json,hashlib,math,sys,OCP
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/f'scripts/{name}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
base=module('time-resolved-catcher-closure');drive=module('braked-gate-screen');n=base.n;sw=base.sw
PINS=['scripts/braked-gate-layout.py','scripts/braked-gate-screen.py','scripts/time-resolved-catcher-closure.py','scripts/native-catcher-sweep.py','scripts/native-catcher-envelopes.py','scripts/pose-clearance-contract.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py','case-studies/braked-layout-evidence.json','case-studies/braked-gate-evidence.json']
def fraction(t,duration):
 if not math.isfinite(t) or not math.isfinite(duration) or duration<=0 or not 0<=t<=duration:raise ValueError('time domain')
 u=t/duration
 return 2*u*u if u<=.5 else 1-2*(1-u)**2

def native_case(year,v,duration):
 hx,hy=base.pc.GEOMETRY[year];h={2024:50.8,2025:114.3,2026:150}[year];lift=h+20
 piece=base.piece(year);gate=n.box(400-hx-26,-hy-10,0,6,2*hy+20,h+10);speed=math.hypot(v,2*lift/duration);cache={};bounds=[];witness=[]
 def sample(t):
  if t not in cache:
   p=n.move(piece,v*t,0,0);g=n.move(gate,0,0,lift*(1-fraction(t,duration)));d=sw.distance(p,g);cache[t]=dict(timeS=t,distanceMm=d,intersectionVolumeMm3=n.common(p,g) if d<1e-5 else 0)
  return cache[t]
 def visit(lo,hi,depth):
  a,b=sample(lo),sample(hi)
  for r in [a,b]:
   if r['intersectionVolumeMm3']>1e-5:witness.append(r);return 'collision-witness'
   if r['distanceMm']<2:witness.append(r);return 'clearance-violation-witness'
  lower=min(a['distanceMm'],b['distanceMm'])-speed*(hi-lo)/2
  if lower>=2:bounds.append(lower);return 'certified-2mm-clearance'
  if depth==12:return 'unresolved'
  mid=(lo+hi)/2;s=visit(lo,mid,depth+1)
  return visit(mid,hi,depth+1) if s=='certified-2mm-clearance' else s
 status=visit(0,duration,0)
 return dict(season=year,pieceVelocityMmS=v,durationS=duration,relativeSpeedUpperBoundMmS=speed,status=status,samples=sorted(cache.values(),key=lambda r:r['timeS']),witness=witness)

def guide_metadata(path,pin):
 from OCP.STEPControl import STEPControl_Reader
 from OCP.IFSelect import IFSelect_RetDone
 from OCP.Bnd import Bnd_Box
 from OCP.BRepBndLib import BRepBndLib
 from OCP.TopExp import TopExp_Explorer
 from OCP.TopAbs import TopAbs_SOLID
 if hashlib.sha256(path.read_bytes()).hexdigest()!=pin:raise ValueError('vendor CAD hash mismatch')
 reader=STEPControl_Reader()
 if reader.ReadFile(str(path))!=IFSelect_RetDone:raise ValueError('STEP read failed')
 reader.TransferRoots();shape=reader.OneShape();b=Bnd_Box();BRepBndLib.Add_s(shape,b);ex=TopExp_Explorer(shape,TopAbs_SOLID);solids=0
 while ex.More():solids+=1;ex.Next()
 return dict(sha256=pin,boundsMm=[b.CornerMin().X(),b.CornerMin().Y(),b.CornerMin().Z(),b.CornerMax().X(),b.CornerMax().Y(),b.CornerMax().Z()],solidCount=solids,scope='Imported vendor assembly metadata only; no installed guide/tube fit or load acceptance')

def report(cad):
 e=json.loads((ROOT/'case-studies/braked-layout-evidence.json').read_text());pitch=e['pulley']['pitchMm'];teeth=e['pulley']['teeth'];radius=pitch*teeth/math.tau;center=(e['belt']['pitchLengthMm']-pitch*teeth)/2
 rows=[dict(season=y,**drive.screen(h,t,m,v,j,radius=radius/1000)) for y,h in [(2024,.0708),(2025,.1343),(2026,.170)] for t in [.02,.25,.4] for m in [.2,.5] for v in [9.,12.] for j in [0.,1e-5]]
 layouts=[dict(season=y,gateTravelMm=h,pulleyCenterDistanceMm=center,provisionalClampLengthMm=40,provisionalEndExclusionEachMm=20,usableStraightTravelMm=center-40-40,remainingTravelMm=center-80-h) for y,h in [(2024,70.8),(2025,134.3),(2026,170)]]
 arrests=[dict(season=y,assumedDelayS=d,initialGateSpeedMps=2*h/.25,unpoweredFreeGravityTravelMm=1000*(2*h/.25*d+.5*9.80665*d*d),interpretation='hypothetical fully released drivetrain during delay; not measured brake response') for y,h in [(2024,.0708),(2025,.1343),(2026,.170)] for d in [.01,.04]]
 return dict(schema='frc-braked-gate-layout/v1',sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},geometryEvidenceSha256=n.p.evidence(),guideMetadata=guide_metadata(cad,e['guideCandidate']['nativeCadSha256']),pitchRadiusMm=radius,layoutCases=layouts,driveCases=rows,nativeCases=[native_case(y,v,t) for y in [2024,2025,2026] for v in [0,200,-400] for t in [.25,.4]],arrestSensitivity=arrests,runtime=dict(python=sys.version,ocp=OCP.__version__),limitations=['Pitch path is not tooth engagement, tension, belt strength, clamp or pulley flange fit','No vendor pulley or installed guide CAD assembly executed','All timing paths prescribed; drive envelope does not establish profile tracking','Rotor inertia endpoints and stopping delay scenarios hypothetical; not physical bounds','Prior 15mm-radius 250ms failures preserved in prior report, not overwritten','Historical availability and season compliance remain limited as previous evidence'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--cad',required=True);p.add_argument('--output',required=True);a=p.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('fresh output required')
 r=report(pathlib.Path(a.cad));out.write_text(json.dumps(r,indent=2,allow_nan=False)+'\n',encoding='utf-8');print(r['guideMetadata']);print([(t,sum(x['necessaryDriveEnvelopePass'] for x in r['driveCases'] if x['durationS']==t)) for t in [.02,.25,.4]]);print([(c['season'],c['pieceVelocityMmS'],c['durationS'],c['status']) for c in r['nativeCases']])
