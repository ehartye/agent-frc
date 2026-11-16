"""Optimistic gravity-gate timing and conditional native sweeps; no latch acceptance."""
import pathlib,importlib.util,json,math,hashlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/f'scripts/{name}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
base=module('time-resolved-catcher-closure');n=base.n;sw=base.sw

def drop(height,mass,friction,side_load):
 for x in [height,mass,friction,side_load]:
  if isinstance(x,bool) or not isinstance(x,(float,int)) or not math.isfinite(x):raise ValueError('finite numbers required')
 if height<=0 or mass<=0 or friction<0 or side_load<0:raise ValueError('invalid domain')
 a=9.80665-friction*side_load/mass
 t=math.sqrt(2*height/1000/a) if a>0 else None
 return dict(heightMm=height,massKg=mass,assumedFrictionCoefficient=friction,assumedGuideSideLoadN=side_load,accelerationMps2=a,closureSeconds=t,stalled=a<=0,impactSpeedMps=math.sqrt(2*a*height/1000) if a>0 else None,releaseLatencyBudgetTo250ms=None if t is None else .25-t,availableGravitationalEnergyJ=mass*9.80665*height/1000)

def native_case(year,v):
 hx,hy=base.pc.GEOMETRY[year];h={2024:50.8,2025:114.3,2026:150}[year];lift=h+20;a=9806.65;t=math.sqrt(2*lift/a)
 piece=base.piece(year);gate=n.box(400-hx-26,-hy-10,0,6,2*hy+20,h+10);speed=math.hypot(v,a*t);cache={};bounds=[];witness=[]
 def sample(time):
  if time not in cache:
   p=n.move(piece,v*time,0,0);g=n.move(gate,0,0,max(0,lift-.5*a*time*time));d=sw.distance(p,g)
   cache[time]=dict(timeS=time,distanceMm=d,intersectionVolumeMm3=n.common(p,g) if d<1e-5 else 0)
  return cache[time]
 def visit(lo,hi,depth):
  ra,rb=sample(lo),sample(hi)
  for r in [ra,rb]:
   if r['intersectionVolumeMm3']>1e-5:witness.append(r);return 'collision-witness'
   if r['distanceMm']<2:witness.append(r);return 'clearance-violation-witness'
  lower=min(ra['distanceMm'],rb['distanceMm'])-speed*(hi-lo)/2
  if lower>=2:bounds.append(lower);return 'certified-2mm-clearance'
  if depth==12:return 'unresolved'
  mid=(lo+hi)/2;s=visit(lo,mid,depth+1)
  return visit(mid,hi,depth+1) if s=='certified-2mm-clearance' else s
 status=visit(0,t,0)
 return dict(season=year,pieceVelocityMmS=v,closureSeconds=t,releaseDelayAssumedSeconds=0,relativeSpeedUpperBoundMmS=speed,status=status,samples=sorted(cache.values(),key=lambda x:x['timeS']),witness=witness,minimumCertifiedLeafBoundMm=min(bounds) if bounds and status=='certified-2mm-clearance' else None)

def report():
 heights=[70.8,134.3,170];rows=[dict(season=y,**drop(h,m,mu,f)) for y,h in zip([2024,2025,2026],heights) for m in [.2,.5] for mu in [0,.05,.1] for f in [0,50]]
 return dict(schema='frc-guided-gravity-retention/v1',timingCases=rows,nativeCases=[native_case(y,v) for y in [2024,2025,2026] for v in [0,200,-400]],sourceCodeSha256={k:hashlib.sha256((ROOT/k).read_text(encoding='utf-8-sig').encode()).hexdigest() for k in ['scripts/guided-gravity-retention.py','scripts/time-resolved-catcher-closure.py','scripts/native-catcher-sweep.py','scripts/native-catcher-envelopes.py','case-studies/guided-retention-evidence.json']},runtime=dict(python=sys.version,ocp=base.OCP.__version__),geometryEvidenceSha256=n.p.evidence(),proof='Rigid distance Lipschitz bound uses maximum relative translation speed over the full parabolic drop, not average gate speed; every certified adjacent sample interval must reconstruct the2mm lower bound.',limitations=['Gravity-only closure is optimistic: latch release delay is set to zero, not measured','Mass, friction and50N side load are hypothetical sensitivity inputs, not selected materials or load qualification','Native paths prescribe constant piece velocity and fixed pose; not the coupled intake/catcher plant','Guide binding, latch engagement, striker approach force, impact absorption, fasteners and full power-loss response are unmodeled','No rated load or phase-specific loss-of-power behavior for exact latch established; all power-off architecture acceptance remains blocked'],engineeringAcceptance='blocked',calibration=None)
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);args=a.parse_args();p=pathlib.Path(args.output)
 if p.exists():raise ValueError('fresh output required')
 r=report();p.write_text(json.dumps(r,indent=2,allow_nan=False)+'\n',encoding='utf-8',newline='\n');print([(x['season'],x['pieceVelocityMmS'],x['status']) for x in r['nativeCases']])
