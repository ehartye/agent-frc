"""Post-fault continuation seeded from executed world states. Not real actuator behavior."""
import pathlib,json,hashlib,importlib.util,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('contact',ROOT/'scripts/unilateral-catcher-study.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def pin(p):return hashlib.sha256(p.read_text(encoding='utf-8-sig').encode()).hexdigest()
def seeds():
 r=json.loads((ROOT/'case-studies/staged-world-supervisor.json').read_text());out=[]
 for row in r['observations']:
  f=int(re.search(r'fault=(\d+)',row)[1])
  if f not in (13,14):continue
  assert 'enteredHold=true' in row and 'retainedClosureAfterFault=true' in row
  out.append(dict(year=int(re.search(r'year=(\d+)',row)[1]),fault=f,x=float(re.search(r'finalX=([^,]+)',row)[1])-.4,v=float(re.search(r'finalSpeed=([^,]+)',row)[1])))
 return out

def simulate(seed,policy,dt=.002):
 x,v=seed['x'],seed['v'];closed=True;hold=10 if seed['fault']==14 else 0;openingBlocked=False
 if policy!='legacy-retain':hold=0
 if policy=='zero-spring-open':
  openingBlocked=m.potential(-x-.02,1000,50)>1e-10
  closed=openingBlocked
 elif policy not in ('legacy-retain','zero-latched-gate'):raise ValueError('unknown fault-output hypothesis')
 initial=.25*v*v+m.potential(x,200,50)+(m.potential(-x-.02,1000,50) if closed else 0);loss=0;maxError=0;maxAbs=abs(x);maxSpeed=abs(v);escape=None
 for i in range(round(1/dt)):
  x,v,d,*_=m.step(x,v,dt,closed,50,hold);loss+=d
  energy=.25*v*v+m.potential(x,200,50)+(m.potential(-x-.02,1000,50) if closed else 0)
  maxError=max(maxError,abs(energy-initial+loss));maxAbs=max(maxAbs,abs(x));maxSpeed=max(maxSpeed,abs(v))
  if escape is None and abs(x)>.05:escape=(i+1)*dt
 return dict(**seed,policy=policy,stepSeconds=dt,gateRemainsClosed=closed,openingBlockedByLoadedGuard=openingBlocked,initialEnergyJ=initial,finalOffsetM=x,finalSpeedMps=v,peakAbsOffsetM=maxAbs,peakSpeedMps=maxSpeed,firstExit50mmSeconds=escape,maxEnergyResidualJ=maxError,physicalSafetyQualified=False)
def report():
 return dict(schema='frc-post-fault-output-hypotheses/v1',sourceCodeSha256={n:pin(ROOT/n) for n in ['scripts/post-fault-output-study.py','scripts/unilateral-catcher-study.py','case-studies/staged-world-supervisor.json']},cases=[simulate(s,p,dt) for s in seeds() for p in ['legacy-retain','zero-latched-gate','zero-spring-open'] for dt in [.002,.001]],calibration=None,engineeringAcceptance='blocked',assumptions=['Continuation starts at previously recorded fault state, not before watchdog expiry or across the missing-update interval','Three output-to-mechanics mappings are alternatives, not properties of selected hardware','Zero latched assumes gate position persists and pad load vanishes; zero spring-open assumes instant unloaded gate opening and pad load vanishes','Spring opening is blocked if rear spring loaded; no removal of stored rear energy by fiat','Same passive one-dimensional tangential plant; no real power-loss dynamics, actuator force, lateral pad energy or safe stop claim','50mm exit is an illustrative boundary, not an approved safety requirement'])
if __name__=='__main__':print(json.dumps(report(),indent=2,allow_nan=False))
