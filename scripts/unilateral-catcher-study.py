"""Force-limited unilateral bumper/gate subsystem, not hardware qualification."""
import pathlib,json,math,hashlib,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('prior',ROOT/'scripts/capture-topology-study.py');prior=importlib.util.module_from_spec(s);s.loader.exec_module(prior)
M=.5;GAP=.020

def potential(p,k,cap):
 p=max(0.,p);threshold=cap/k
 return .5*k*p*p if p<=threshold else cap*p-.5*cap*cap/k

def average_spring(a,b,k,cap):
 lo,hi=sorted((a,b));threshold=cap/k
 if hi==lo:return min(cap,k*max(hi,0))
 start=max(lo,0);end=max(hi,0)
 if end<=start:return 0.
 quad_end=min(end,threshold);quad_start=min(start,threshold)
 area=.5*k*(quad_end-quad_start)*(quad_end+quad_start)+cap*max(0,end-max(start,threshold))
 return area/(hi-lo)
def contact_fraction(a,b):
 lo,hi=sorted((a,b))
 if hi<=0:return 0.
 if lo>=0:return 1.
 return hi/(hi-lo)
def forces(x0,x1,vmid,closed,cap,hold=0):
 # Both spring and damping are averaged over the fraction of the step actually in contact.
 # This avoids a discontinuous whole-step damping impulse at first touching.
 front=average_spring(x0,x1,200,cap);fraction=contact_fraction(x0,x1)
 ff=max(0.,min(cap*fraction,front+20*vmid*fraction))
 rear=average_spring(-x0-GAP,-x1-GAP,1000,cap) if closed else 0.
 fraction=contact_fraction(-x0-GAP,-x1-GAP) if closed else 0.
 fr=max(0.,min(cap*fraction,rear-20*vmid*fraction))
 lo,hi=sorted((x0,x1))
 fraction=(max(0,min(hi,.07)-max(lo,-.07))/(hi-lo) if hi>lo else float(abs(lo)<.07)) if closed else 0.
 fh=max(-2.,min(2.,hold*vmid))*fraction
 return fr-ff-fh,ff,fr,fh

def step(x,v,dt,closed,cap,hold=0):
 # Discrete-gradient spring plus projected damping; monotone scalar midpoint solve.
 lo=v-2*cap*dt/M;hi=v+2*cap*dt/M
 def residual(vn):
  mid=(v+vn)/2;xn=x+dt*mid;f,ff,fr,fh=forces(x,xn,mid,closed,cap,hold)
  return M*(vn-v)-dt*f,xn,ff,fr,fh
 if residual(lo)[0]>1e-12 or residual(hi)[0]<-1e-12:raise ValueError('unbracketed passive step')
 for _ in range(55):
  mid=(lo+hi)/2
  if residual(mid)[0]>0:hi=mid
  else:lo=mid
 vn=(lo+hi)/2;err,xn,ff,fr,fh=residual(vn)
 before=.5*M*v*v+potential(x,200,cap)+(potential(-x-GAP,1000,cap) if closed else 0)
 after=.5*M*vn*vn+potential(xn,200,cap)+(potential(-xn-GAP,1000,cap) if closed else 0)
 loss=before-after
 if loss< -1e-9 or abs(err)>1e-10:raise ValueError(f'passivity or solver failure: loss={loss}, residual={err}, x={x}, v={v}, xn={xn}, vn={vn}, cap={cap}, closed={closed}')
 return xn,vn,loss,ff,fr,fh

def gate_can_close(x):return x>-GAP+.002
def gate_can_release(x,cap):return potential(-x-GAP,1000,cap)<=1e-10

def simulate(speed,gate_delay,cap,dt=.002,hold=0):
 for value in (speed,cap,dt,hold):prior.finite(value)
 if gate_delay is not None:prior.finite(gate_delay)
 if not 0<=speed<=3 or cap not in (10,20,50) or dt not in (.002,.001) or gate_delay not in (None,0,.02,.1,.5) or hold not in (0,10):raise ValueError('fixed experiment domain')
 x=0.;v=speed;initial=.5*M*v*v;loss=work=0.;closed=False;attempted=False;blocked=False;released=False;release_blocked=False;release_push_applied=False
 maxx=maxpre=maxpost=peakf=peakr=peakh=maxres=0.;unilateral_escape=False;gate_work=0.
 for tick in range(round(3/dt)):
  if gate_delay is not None and not attempted and tick>=round(gate_delay/dt):
   attempted=True
   # Completion of gate motion allowed only with2mm clear tail. No closing through a piece.
   if gate_can_close(x):closed=True
   else:blocked=True
  if tick==round(1/dt):
   nv=v+.2/M;work+=.5*M*(nv*nv-v*v);v=nv
  if tick==round(2/dt):
   if closed and not gate_can_release(x,cap):release_blocked=True
   else:closed=False;released=True
  if tick==round(2.1/dt) and released:
   nv=v-.2/M;work+=.5*M*(nv*nv-v*v);v=nv;release_push_applied=True
  x,v,d,ff,fr,fh=step(x,v,dt,closed,cap,hold);loss+=d;peakf=max(peakf,ff);peakr=max(peakr,fr);peakh=max(peakh,abs(fh))
  energy=.5*M*v*v+potential(x,200,cap)+(potential(-x-GAP,1000,cap) if closed else 0)
  maxres=max(maxres,abs(energy-initial-work+loss))
  if tick+1<=round(2/dt):
   maxx=max(maxx,abs(x));unilateral_escape|=x<-.05
   if round(.75/dt)<=tick+1<=round(1/dt):maxpre=max(maxpre,abs(v))
   if round(1.75/dt)<=tick+1:maxpost=max(maxpost,abs(v))
  if release_push_applied and x<-.05:break
 return dict(speedMps=speed,gateCompletionDelayS=gate_delay,forceCapN=cap,dtS=dt,holdingDampingNsPerM=hold,
  gateClosureBlocked=blocked,releaseBlockedUnderLoad=release_blocked,releaseCommandAccepted=released,
  provisionalCapture=maxx<=.05 and maxpre<=.01 and maxpost<=.01,
  maxAbsCapturePositionM=maxx,preDwellMaxSpeedMps=maxpre,postDwellMaxSpeedMps=maxpost,
  escapedBackwardsBeforeRelease=unilateral_escape,finalPositionM=x,finalSpeedMps=v,finalTimeS=(tick+1)*dt,
  externalReleasePushClearsRear=release_push_applied and x<-.05,peakFrontForceN=peakf,peakRearForceN=peakr,peakHoldingDragN=peakh,
  maxEnergyResidualJ=maxres,dissipatedJ=loss,externalImpulseWorkJ=work)

def report():
 upstream=ROOT/'case-studies/capture-topology-study.json';r=json.loads(upstream.read_text())
 seeds=sorted({(x['season'],x['upstreamFeedMps'],x['speedMps']) for x in r['cases'] if x['dtS']==.001 and x['topology']=='guided-compliant-cradle' and x['upstreamSubsteps']==4})
 cases=[]
 for year,feed,speed in seeds:
  for label,delay,cap,hold in [('bumper-only',None,50,0),('gate-fast',.02,50,0),('gate-delayed',.5,50,0),('gate-force-limited',.02,10,0),('gated-damped-pocket',.02,50,10)]:
   cases.append(dict(season=year,upstreamFeedMps=feed,topology=label,**simulate(speed,delay,cap,hold=hold)))
 worst=max(x[2] for x in seeds)
 sensitivity=[simulate(worst,d,cap,dt,hold) for d in (0,.02,.1,.5) for cap in (10,20,50) for dt in (.002,.001) for hold in (0,10)]
 return dict(schema='frc-unilateral-catcher/v1',status='executed-independent-unilateral-catcher-screen',upstreamReceiptSha256=prior.stop.text_pin(upstream),sourceCodeSha256={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in ['scripts/unilateral-catcher-study.py','scripts/capture-topology-study.py','scripts/summarize-segmented-stop.py']},cases=cases,sensitivity=sensitivity,
  counts={name:dict(total=sum(x['topology']==name for x in cases),capture=sum(x['topology']==name and x['provisionalCapture'] for x in cases),release=sum(x['topology']==name and x['provisionalCapture'] and x['externalReleasePushClearsRear'] for x in cases)) for name in ['bumper-only','gate-fast','gate-delayed','gate-force-limited','gated-damped-pocket']},
  assumptions=['Same provisional50mm/dwell/0.2Ns disturbance criterion as previous study','Unilateral front bumper k200,c20; rear gate gap20mm,k1000,c20; total contact-force cap10/20/50N, all hypothetical','Gate closure completion is instantaneous at configured delay; inhibited unless tail clears gate by2mm; actuator motion/forces absent','Release at2s only if rear spring unloaded; backward0.2Ns external push at2.1s tests local rear clearance, not an actuator design; stop once piece clears50mm backward rather than claiming upstream return travel','Optional retractable side pinch supplies velocity drag10Ns/m capped2N only while gate closed and piece center within±70mm pad span; not static friction or specified hardware','No bilateral attachment; contacts can separate and force can saturate','Discrete-gradient potential and projected damping enforce passive contact; external impulse work is explicit','Subsystem still assumes isolation from upstream rollers; no rotor energy, floor, lateral/rotational behavior or actual latch hardware'],calibration=None,engineeringAcceptance='blocked',integratedWithController=False)
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('refuse overwrite')
 r=report();out.write_text(json.dumps(r,indent=2,allow_nan=False)+'\n');print(json.dumps(r['counts']))
