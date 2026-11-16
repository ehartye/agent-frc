"""Time-resolved rigid gate closure with conservative inter-sample distance certificates."""
import pathlib,importlib.util,json,math,hashlib,sys,OCP
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
sw=module('sw','native-catcher-sweep.py');n=sw.n;pc=module('pc','pose-clearance-contract.py')
CASES=[('forward',0,200,.02,0),('stationary',0,0,.02,0),('fast-rebound',0,-400,.02,0),('slow-closure-rebound',0,-400,.1,0),('rotated-tight-static',-17.9,0,.02,3),('rotated-tight-advancing',-17.9,400,.1,3)]
def piece(year,q=0,dy=0,yaw=0,pitch=0):
 hx,hy=pc.GEOMETRY[year];a=math.radians(pitch)
 if year==2024:shape=n.BRepPrimAPI_MakeTorus(n.gp_Ax2(n.gp_Pnt(0,0,0),n.gp_Dir(0,0,1)),152.4,25.4).Shape();z=25.4+152.4*abs(math.sin(a))
 elif year==2025:
  ax=n.gp_Ax2(n.gp_Pnt(-hx,0,0),n.gp_Dir(1,0,0));shape=n.BRepAlgoAPI_Cut(n.BRepPrimAPI_MakeCylinder(ax,57.15,2*hx).Shape(),n.BRepPrimAPI_MakeCylinder(ax,50.8,2*hx).Shape()).Shape();z=hx*abs(math.sin(a))+57.15*abs(math.cos(a))
 else:shape=n.BRepPrimAPI_MakeSphere(n.gp_Pnt(0,0,0),75).Shape();z=75
 return n.move(sw.rotate(sw.rotate(shape,(0,1,0),pitch),(0,0,1),yaw),400+q,dy,z)

def gate_case(year,q,v,duration,yaw):
 hx,hy=pc.GEOMETRY[year];height={2024:50.8,2025:114.3,2026:150}[year];lift=height+20
 base=piece(year,q,yaw=yaw);gate=n.box(400-hx-26,-hy-10,0,6,2*hy+20,height+10)
 speed=math.hypot(v,lift/duration);cache={};leaf_bounds=[];witness=[]
 def sample(t):
  if t not in cache:
   p=n.move(base,v*t,0,0);g=n.move(gate,0,0,lift*(1-t/duration));d=sw.distance(p,g)
   volume=n.common(p,g) if d<1e-5 else 0.
   cache[t]=dict(timeS=t,distanceMm=d,intersectionVolumeMm3=volume)
  return cache[t]
 def visit(a,b,depth):
  ra,rb=sample(a),sample(b)
  for r in (ra,rb):
   if r['intersectionVolumeMm3']>1e-5:witness.append(r);return 'collision-witness'
   if r['distanceMm']<2:witness.append(r);return 'clearance-violation-witness'
  lower=min(ra['distanceMm'],rb['distanceMm'])-speed*(b-a)/2
  if lower>=2:leaf_bounds.append(lower);return 'certified-2mm-clearance'
  if depth==12:return 'unresolved-at-refinement-limit'
  mid=(a+b)/2;s1=visit(a,mid,depth+1)
  if s1!='certified-2mm-clearance':return s1
  return visit(mid,b,depth+1)
 status=visit(0,duration,0)
 return dict(season=year,initialFeedOffsetMm=q,pieceVelocityMmPerS=v,closureDurationS=duration,yawDeg=yaw,
  status=status,relativeTranslationSpeedBoundMmPerS=speed,minimumCertifiedLeafBoundMm=min(leaf_bounds) if leaf_bounds and status=='certified-2mm-clearance' else None,
  sampleCount=len(cache),samples=sorted(cache.values(),key=lambda r:r['timeS']),witness=witness,
  conservativePoseContract=pc.certificate(year,q=q,yaw=yaw,initial_v_lower=v,duration=duration))

def pad_case(year,dy,pitch):
 hx,hy=pc.GEOMETRY[year];h={2024:50.8,2025:114.3,2026:150}[year];p=piece(year,dy=dy,pitch=pitch);closed=n.box(330,hy,h/2-15,140,6,30);sweep=n.box(330,hy,h/2-15,140,16,30)
 records=[]
 for t in (0,.005,.01,.015,.02):
  pad=n.move(closed,0,10*(1-t/.02),0);records.append(dict(timeS=t,distanceMm=sw.distance(p,pad),intersectionVolumeMm3=n.common(p,pad)))
 sv=n.common(p,sweep)
 return dict(season=year,lateralOffsetMm=dy,pitchDeg=pitch,closureDurationS=.02,pieceMotion='stationary during this pad test',samples=records,exactSweptIntersectionVolumeMm3=sv,
  status='potential-interference-or-compression' if sv>1e-5 else 'nonpenetrating-rigid-sweep',finalPadContactEstablishedByGeometry=records[-1]['distanceMm']<1e-5,
  forceOrPreloadEstablished=False)

def report():
 gates=[dict(scenario=name,**gate_case(y,q,v,t,yaw)) for y in pc.GEOMETRY for name,q,v,t,yaw in CASES]
 pads=[pad_case(y,dy,pitch) for y in pc.GEOMETRY for dy,pitch in [(0,0),(5,0),(0,10)]]
 return dict(schema='frc-time-resolved-catcher-closure/v1',status='native-time-samples-with-conservative-interval-certificates',runtime=dict(python=sys.version,ocp=OCP.__version__),
  sourceCodeSha256={name:hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest() for name in ['scripts/time-resolved-catcher-closure.py','scripts/pose-clearance-contract.py','scripts/native-catcher-sweep.py','scripts/native-catcher-envelopes.py']},geometryEvidenceSha256=n.p.evidence(),gateCases=gates,padCases=pads,
  proof='For each rigid constant-relative-translation interval, distance(t)>=min(endpoint distances)-relativeSpeed*intervalDuration/2. Adaptive subdivision certifies2mm clearance or returns a sampled collision/clearance witness or unresolved status.',
  limitations=['Prescribed gate/pad stroke and piece velocities, not actuator or force-coupled movement','Piece orientation is fixed per gate trajectory; no time-varying rotation, deformation or normal load model','Gate relative-speed bound is exact for the two prescribed orthogonal translations; not a bound on real hardware','Pad tests hold the posed piece stationary; exact swept boxes avoid mistaking sample-only absence of overlap for proof','Pose clearance contract is conditional and separate from controller implementation and selected sensing','A certified gate path does not establish pad preload, capture, structural or actuator acceptance'],calibration=None,engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('new output required')
 r=report();out.write_text(json.dumps(r,indent=2,allow_nan=False)+'\n');print(json.dumps([(x['season'],x['scenario'],x['status'],x['sampleCount']) for x in r['gateCases']]))
