"""Original opposing belt-carriage layout and prescribed closure; no force/actuator acceptance."""
import pathlib,json,math,hashlib,importlib.util,collections
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('nip',ROOT/'scripts/open-receiver-nip.py');nip=importlib.util.module_from_spec(s);s.loader.exec_module(nip)
PINS=['scripts/nip-linkage-timing.py','scripts/open-receiver-nip.py','case-studies/nip-linkage-evidence.json','case-studies/braked-layout-evidence.json','case-studies/braked-gate-evidence.json','case-studies/handoff-continuity-report.json',*nip.FILES.values()]
def finite(*values):
 if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in values):raise ValueError('finite numeric required')
def fraction(u):
 finite(u)
 if not 0<=u<=1:raise ValueError('fraction domain')
 return 2*u*u if u<=.5 else 1-2*(1-u)**2

def drive(duration,each_mass,imbalance,voltage,inertia):
 finite(duration,each_mass,imbalance,voltage,inertia)
 if duration<=0 or each_mass<=0 or abs(imbalance)>2*each_mass or voltage<=0 or inertia<0:raise ValueError('drive domain')
 e=json.loads((ROOT/'case-studies/braked-gate-evidence.json').read_text());d=e['motorData'];ratio=e['candidate']['ratio'];r=.1/math.tau;stroke=.06;v=2*stroke/duration;a=4*stroke/duration**2;rpm=v/r*ratio*60/math.tau
 # Both carriages accelerate; only exact equal mass cancels gravitational potential.
 force=2*each_mass*a+abs(imbalance)*9.80665+10
 demand=force*r/(ratio*.7)+inertia*a/r*ratio
 available=max(0,min(d['stallTorqueNm']*(voltage/d['voltageV']-rpm/d['freeRpm']),d['stallTorqueNm']*(20-d['freeCurrentA'])/(d['stallCurrentA']-d['freeCurrentA'])))
 return dict(durationS=duration,eachCarriageMassKg=each_mass,imbalanceKg=imbalance,voltageV=voltage,assumedRotorEquivalentInertiaKgM2=inertia,peakSpeedMps=v,peakAccelMps2=a,peakDemandNm=demand,availableIdealNm=available,necessaryFreeMotionEnvelopePass=demand<=available,nipForceAfterContact=None,tracking=None,brakeArrest=None)

def sweep(year,pitch,speed,duration,initial_x=.3496,source_time=0):
 finite(pitch,speed,duration,initial_x,source_time)
 if duration<=0:raise ValueError('positive closure duration')
 # Align center with fixed receiving station at start. Motion/closure are prescribed.
 times=[duration*k/8 for k in range(9)];rows=[]
 for t in times:
  x=initial_x+speed*t;r=.06*(1-fraction(t/duration));c=nip.case(year,x,pitch,r);rows.append(dict(timeS=t,absolutePlantTimeS=source_time+t,**c))
 bound=math.hypot(speed,2*.06/duration)
 intervals=[dict(startS=a['timeS'],endS=b['timeS'],distanceLowerBoundM=min(a['nativeMinDistanceM'],b['nativeMinDistanceM'])-bound*(b['timeS']-a['timeS'])/2) for a,b in zip(rows,rows[1:])]
 return dict(season=year,pitchDegrees=pitch,prescribedSpeedMps=speed,sourcePositionM=initial_x,sourceTimeS=source_time,closureDurationS=duration,samples=rows,relativeSpeedBoundMps=bound,intervals=intervals,positiveIntersectionWitness=any(x['nativeIntersectionSumM3']>1e-12 for x in rows),certifiedNoContact=all(x['distanceLowerBoundM']>0 for x in intervals),contactValidity=None,goalChainAccepted=False)

def report():
 e=json.loads((ROOT/'case-studies/nip-linkage-evidence.json').read_text());rows=[]
 for year in (2024,2025,2026):
  center=nip.extent(year,0)+{2024:.0508,2025:.0254,2026:.0381}[year]-.001
  for belt in (800,e['belt']['pitchLengthMm']):
   spacing=(belt-100)/2/1000;limit=spacing/2-.02-.02
   rows.append(dict(season=year,beltPitchLengthMm=belt,pulleyCenterDistanceM=spacing,assumedClampLengthM=.04,assumedEndExclusionM=.02,maxCarriageCenterAbsZM=limit,openCarriageCenterAbsZM=center+.06,nominalPositionMarginM=limit-center-.06,positionEnvelopePass=limit>=center+.06,installedGuideAndClampFit=None))
 drives=[drive(t,m,imb,v,j) for t in (.02,.25,.4) for m in (.2,.5) for imb in (0,.1) for v in (9,12) for j in (0,1e-5)]
 handoff=json.loads((ROOT/'case-studies/handoff-continuity-report.json').read_text());moving={int(x['year']):x for x in handoff['cases'] if x['initialSpeed']==.2}
 sweeps=[]
 for y in (2024,2025,2026):
  source=moving[y]
  for p in (0,10,20):
   for t in (.25,.4):
    sweeps.append(sweep(y,p,0,t))
    sweeps.append(sweep(y,p,source['sourceV'],t,source['sourceX'],source['sourceTime']))
 return dict(schema='frc-nip-linkage-timing/v1',runtimeOcp=nip.OCP.__version__,nominalComponentPoints=None,layoutCases=rows,driveCases=drives,nativeSweeps=sweeps,sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},limitations=['TTB0164 exact belt identity and nominal pitch path only; no tooth/load/clamp/guide acceptance','Opposing carriages on separate belt legs require unmodeled offset links, bearings, synchronization and interference checks','20A,.7efficiency,5N friction per carriage,inertia and imbalance cases are hypotheses not ratings','Free-motion torque screen omits unknown compression/contact force and cannot establish tracking or safe brake arrest','Moving sweeps start at the actual representative catcher exit position/velocity/time, then prescribe constant velocity and triangular retraction; not a motor/force-coupled closure','Positive rigid intersection is a contact/obstruction witness, not calibrated traction; lack of sampled intersection is not proof of no contact unless interval bound certifies it','Prior ballistic passes cannot be accepted as a continuous physical goal chain from these closure studies','Stationary pose at the receiver could represent a retained/pregrip architecture, but actual catcher registration/interference is not demonstrated'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);p=pathlib.Path(a.parse_args().output)
 with p.open('x',encoding='utf-8') as f:json.dump(report(),f,indent=2,allow_nan=False);f.write('\n')
