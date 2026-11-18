"""Independent downstream capture subsystem comparison, not integrated robot acceptance."""
import pathlib,math,json,hashlib,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('stop',ROOT/'scripts/summarize-segmented-stop.py');stop=importlib.util.module_from_spec(s);s.loader.exec_module(stop)
TOPOLOGIES={'open-exit':dict(k=0,c=0),'damped-pinch-surrogate':dict(k=0,c=20),'guided-compliant-cradle':dict(k=200,c=20)}
def finite(v):
 if isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v):raise ValueError('finite real required')
 return v

def step(x,v,m,k,c,dt):
 for a in (x,v,m,k,c,dt):finite(a)
 if m<=0 or dt<=0 or k<0 or c<0:raise ValueError('positive inertia/time and passive coefficients required')
 # Implicit midpoint linear spring/damper: exact discrete quadratic energy ledger.
 vn=(v*(m-dt*c/2-dt*dt*k/4)-dt*k*x)/(m+dt*c/2+dt*dt*k/4)
 xn=x+dt*(v+vn)/2
 dissipated=c*dt*((v+vn)/2)**2
 return xn,vn,dissipated

def simulate(speed,k,c,dt,disturbance=.2):
 for a in (speed,k,c,dt,disturbance):finite(a)
 if not 0<=speed<=3 or not 0<=k<=1000 or not 0<=c<=100 or dt not in (.002,.001,.0005) or not 0<=disturbance<=1:raise ValueError('bounded comparison inputs')
 m=.5;x=0.;v=speed;initial=.5*m*v*v;loss=work=0.;max_x=max_v_pre=max_v_post=residual=0.;peak_force=c*abs(v)
 n=round(2/dt);shock=round(1/dt);pre=round(.75/dt);post=round(1.75/dt)
 for tick in range(n):
  if tick==shock:
   next_v=v+disturbance/m;work+=.5*m*(next_v*next_v-v*v);v=next_v
  x,v,dissipated=step(x,v,m,k,c,dt);loss+=dissipated
  energy=.5*m*v*v+.5*k*x*x
  residual=max(residual,abs(energy-initial-work+loss))
  max_x=max(max_x,abs(x));peak_force=max(peak_force,abs(k*x+c*v))
  if pre<=tick+1<=shock:max_v_pre=max(max_v_pre,abs(v))
  if post<=tick+1:max_v_post=max(max_v_post,abs(v))
 return dict(speedMps=speed,kNPerM=k,cNsPerM=c,dtS=dt,disturbanceNs=disturbance,
  maxAbsDisplacementM=max_x,preDisturbanceDwellMaxSpeedMps=max_v_pre,postDisturbanceDwellMaxSpeedMps=max_v_post,
  finalPositionM=x,finalSpeedMps=v,peakSampledReactionN=peak_force,initialEnergyJ=initial,
  disturbanceWorkJ=work,dissipatedJ=loss,maxAbsEnergyResidualJ=residual,
  provisionalSampledCapture=max_x<=.05 and max_v_pre<=.01 and max_v_post<=.01)

def report():
 receipt_path=ROOT/'case-studies/segmented-stop-sensitivity.json';receipt=json.loads(receipt_path.read_text());rows=stop.observations(receipt)
 states={}
 for r in rows:
  if r['approachResistance']==0 and r['postDoneResistance']==0:
   if not r['done'] or r['eventSpeed'] is None:raise ValueError('incomplete seed state')
   states[(int(r['year']),r['feed'],int(r['substeps']))]=r['eventSpeed']
 if len(states)!=27:raise ValueError('expected27 entry states')
 cases=[]
 for (year,feed,sub),speed in states.items():
  for topology,params in TOPOLOGIES.items():
   for dt in (.002,.001,.0005):cases.append(dict(season=year,upstreamFeedMps=feed,upstreamSubsteps=sub,topology=topology,**simulate(speed,dt=dt,**params)))
 nominal_speed=max(states.values());perturbation=[]
 for topology,params in TOPOLOGIES.items():
  for impulse in (0,.1,.2,.4):perturbation.append(dict(topology=topology,**simulate(nominal_speed,dt=.001,disturbance=impulse,**params)))
 # Feeder interface calculation is deliberately separate from downstream capture dynamics.
 # Constant opposing0.1N over the whole approach; no selected powered feeder component.
 feeder=[]
 # Use the common250mm start-to-axis span, not an estimate of first contact.
 # Roller assistance is excluded from this separate feeder-work screen.
 for year,distance in [(2024,.25),(2025,.25),(2026,.25)]:
  feeder.append(dict(season=year,assumedApproachBoundM=distance,assumedResistanceN=.1,
   initialSpeedMps=.2,availableInitialEnergyJ=.5*.5*.2**2,requiredResistanceWorkJ=.1*distance,
   initialMomentumOnlyCanCoverBound=False,idealMinimumInitialSpeedMps=math.sqrt(2*.1*distance/.5),
   poweredFeederWorkLowerBoundJ=max(0,.1*distance-.5*.5*.2**2),
   interpretation='Common250mm approach envelope, not actual contact onset. Missing work assumes feeder-only approach with no roller assistance; powered feeder sizing and disengagement unverified.'))
 coefficient_grid=[dict(k=k,c=c,**simulate(nominal_speed,k,c,dt)) for k in (100,200,400) for c in (5,10,20,40) for dt in (.002,.001,.0005)]
 omega=20.;analytic_cradle=dict(basis='Critical linear oscillator k200,c20,m0.5; triangle bound on two nonnegative impulse responses',worstSeedSpeedMps=nominal_speed,positionBoundM=(nominal_speed+.2/.5)/(omega*math.e),preDwellSpeedBoundMps=nominal_speed*(omega*.75-1)*math.exp(-omega*.75),postDwellSpeedBoundMps=nominal_speed*(omega*1.75-1)*math.exp(-omega*1.75)+(.2/.5)*(omega*.75-1)*math.exp(-omega*.75),scope='Independent unsaturated bilateral linear subsystem only; not real mechanism or other coefficient cases')
 source_names=['scripts/capture-topology-study.py','scripts/summarize-segmented-stop.py']
 return dict(schema='frc-provisional-capture-topologies/v1',status='executed-independent-downstream-subsystem-screen',
  upstreamReceiptSha256=stop.text_pin(receipt_path),upstreamReceiptPinBasis='UTF-8 without BOM and normalized LF',
  sourceCodeSha256={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in source_names},
  criterion=dict(ownerApproved=False,positionOrigin='catcher engagement datum, reset to0 for independent subsystem',sampledAbsPositionLimitM=.05,preDwellS=[.75,1],postDwellS=[1.75,2],dwellAbsSpeedLimitMps=.01,disturbanceTimeS=1,positiveDisturbanceImpulseNs=.2,definition='All three clauses must pass. Retention beyond2s is not screened; independent continuous-time bounds are supplied only for the exact critical cradle assumptions.'),
  topologies=TOPOLOGIES,analyticCradleBound=analytic_cradle,cases=cases,coefficientSensitivity=coefficient_grid,disturbanceSensitivity=perturbation,feederInterfaceBounds=feeder,
  resultCounts={name:dict(total=sum(r['topology']==name for r in cases),passed=sum(r['topology']==name and r['provisionalSampledCapture'] for r in cases)) for name in TOPOLOGIES},
  calibration=None,engineeringAcceptance='blocked',integratedWithController=False,
  limitations=['No new feeder/drive/catcher hardware selected; all spring/damper coefficients hypothetical',
   'Upstream controller remains the reviewed equivalent drive; downstream starts from its event speed only, not rotor energy or spatial assembly',
   'Requires mechanical isolation from upstream roller before catch; isolation/contact feasibility is not established',
   'Damped pinch is a linear viscous-force surrogate, not characterized roller torque or static holding capacity',
   'Compliant cradle is a bilateral guided linear spring-damper engaged without delay at zero displacement; attachment/latch/spring travel and force limits unverified',
   'No collision, unilateral release, saturation, contact loss, entry shock, gravity, yaw, structural or thermal model',
   'Disturbance and capture window are provisional experiment choices, not owner requirements or hardware specs',
   'Reaction peaks are mathematical model outputs, not selected component ratings; sampling agreement is not physical validation'])
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('refuse overwrite')
 r=report();out.write_text(json.dumps(r,indent=2,allow_nan=False)+'\n',encoding='utf-8');print(json.dumps(r['resultCounts']))
