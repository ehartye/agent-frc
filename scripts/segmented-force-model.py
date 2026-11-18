"""Uncalibrated, geometry-gated tangential two-DOF sensitivity model.

Normal load is externally imposed, never inferred from penetration or material.
One equivalent roller coordinate represents a synchronized bank, not two motors.
"""
import importlib.util, pathlib, math, json, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('replay',ROOT/'scripts/prepare-segmented-replay.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

def number(v):return p.g.finite_number(v)

def contact_step(v,u,m,rotor_mass,capacity):
 for a in (v,u,m,rotor_mass,capacity):number(a)
 if min(m,rotor_mass)<=0 or capacity<0:raise ValueError('positive inertia and nonnegative impulse capacity required')
 free=(u-v)/(1/m+1/rotor_mass)
 impulse=max(-capacity,min(capacity,free))
 vv=v+impulse/m;uu=u-impulse/rotor_mass
 before=.5*m*v*v+.5*rotor_mass*u*u
 after=.5*m*vv*vv+.5*rotor_mass*uu*uu
 return vv,uu,impulse,after-before

def simulate(year,*,compression=5,mu=.5,normal=10,mass=.5,rotor_mass=.25,
             target=.2,drive_limit=5,gain=10,dt=.005,duration=.5):
 # All masses and loads are hypothetical, including the identical piece mass across seasons.
 if type(year) is not int or year not in p.SEASONS:raise ValueError('season required')
 for a in (compression,mu,normal,mass,rotor_mass,target,drive_limit,gain,dt,duration):number(a)
 if compression not in (0,5) or min(mu,normal,drive_limit,gain)<0 or min(mass,rotor_mass,dt,duration)<=0:raise ValueError('invalid parameter')
 if not .0001<=dt<=.02 or duration>2 or abs(target)>1 or max(mass,rotor_mass)>100 or normal>10000 or mu>10 or gain>1000 or drive_limit>1000:raise ValueError('bounded experiment domain')
 ticks=round(duration/dt)
 if not math.isclose(ticks*dt,duration,abs_tol=1e-10):raise ValueError('duration must contain whole ticks')
 x=v=u=0.;motor_work=contact_loss=0.;rows=[];status='duration-complete'
 for tick in range(ticks):
  if not -250<=x*1000<=386:status='geometry-domain-stop';break
  lo,hi=p.gaps(year,x*1000,compression)
  state='overlap' if hi is not None and hi < -1e-6 else ('separated' if lo is not None and lo>1e-6 else 'unknown')
  # Unknown is not no-contact: terminate and expose unsupported geometry.
  if state=='unknown':status='unknown-geometry-stop';break
  drive=max(-drive_limit,min(drive_limit,gain*(target-u)))
  driven=u+drive*dt/rotor_mass
  work=.5*rotor_mass*(driven*driven-u*u)
  capacity=mu*normal*dt if state=='overlap' else 0.
  vv,uu,impulse,delta=contact_step(v,driven,mass,rotor_mass,capacity)
  motor_work+=work;contact_loss-=delta
  x+=vv*dt;v,u=vv,uu
  energy=.5*mass*v*v+.5*rotor_mass*u*u
  residual=energy-motor_work+contact_loss
  rows.append(dict(tick=tick,xM=x,pieceMps=v,rollerMps=u,geometry=state,
                   normalN=normal if state=='overlap' else 0,impulseNs=impulse,
                   capacityNs=capacity,motorWorkJ=work,contactEnergyChangeJ=delta,
                   energyResidualJ=residual,gapLowerMm=lo,gapUpperMm=hi))
 return dict(season=year,status=status,parameters=dict(compressionMm=compression,mu=mu,
  imposedAggregateNormalN=normal,pieceMassKg=mass,equivalentRotorMassKg=rotor_mass,
  targetMps=target,driveLimitN=drive_limit,gainNsPerM=gain,dtS=dt,durationS=duration),
  final=dict(xM=x,pieceMps=v,rollerMps=u,motorWorkJ=motor_work,contactDissipationJ=contact_loss),
  maxAbsEnergyResidualJ=max((abs(r['energyResidualJ']) for r in rows),default=0),rows=rows)

def suite():
 cases={}
 for year in p.SEASONS:
  for name,kw in [('baseline',{}),('zero-friction',dict(mu=0)),('zero-load',dict(normal=0)),
                  ('nominal',dict(compression=0)),('zero-drive',dict(drive_limit=0)),
                  ('low-friction',dict(mu=.02)),('reverse',dict(target=-.2)),
                  ('half-step',dict(dt=.0025)),('heavy-piece',dict(mass=1))]:
   cases[f'{year}-{name}']=simulate(year,**kw)
 pins={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest()
       for n in ['scripts/segmented-force-model.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py']}
 return dict(schema='frc-segmented-force-sensitivity/v1',status='executed-reduced-tangential-model',
  geometryEvidenceSha256=p.evidence(),sourceCodeSha256=pins,
  calibration=None,engineeringAcceptance='blocked',physicalRobotIoExecuted=False,
  controllerCoupled=False,normalLaw='external constant aggregate load gated by confirmed ideal-envelope overlap',
  limitations=['No normal mechanics, floor, contact-normal direction, piece rotation or bank load distribution',
   'One effective synchronized roller coordinate; not a physical two-motor topology',
   'Ideal limited proportional drive; no WPILib/controller/electrical/battery/thermal coupling',
   'Normal load and both effective masses are hypothetical, not identified measurements',
   'Fixed height, yaw and lateral pose; normal support work and deformation excluded',
   'Ideal finite-cylinder tread overfill and NOTE sampling uncertainty retained; unknown geometry stops',
   'Energy balance applies only to the two modeled tangential coordinates, not the full mechanism'],cases=cases)
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args()
 path=pathlib.Path(a.output)
 if path.exists():raise ValueError('refuse overwrite of evidence')
 report=suite();path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf-8')
 print(json.dumps({k:dict(status=v['status'],**v['final']) for k,v in report['cases'].items()},indent=2))

