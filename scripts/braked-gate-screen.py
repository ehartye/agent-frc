"""Uncalibrated triangular gate profile screening, not a drive simulation or rating."""
import pathlib,json,math,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
PINS=['scripts/braked-gate-screen.py','case-studies/braked-gate-evidence.json']
def screen(h,t,mass,voltage,inertia,friction=5.,efficiency=.7,radius=.015,current=20.):
 for x in [h,t,mass,voltage,inertia,friction,efficiency,radius,current]:
  if isinstance(x,bool) or not isinstance(x,(float,int)) or not math.isfinite(x):raise ValueError('finite numeric required')
 if min(h,t,mass,voltage,radius,current)<=0 or min(inertia,friction)<0 or not 0<efficiency<=1:raise ValueError('invalid domain')
 e=json.loads((ROOT/PINS[1]).read_text());d=e['motorData'];ratio=e['candidate']['ratio'];v=2*h/t;a=4*h/t**2
 rpm=v/radius*ratio*60/math.tau;alpha=a/radius*ratio
 # Optimistic linear torque-speed voltage scaling and simple current/torque interpolation.
 available=max(0,min(d['stallTorqueNm']*(voltage/d['voltageV']-rpm/d['freeRpm']),d['stallTorqueNm']*max(0,current-d['freeCurrentA'])/(d['stallCurrentA']-d['freeCurrentA'])))
 required=(mass*(a+9.80665)+friction)*radius/(ratio*efficiency)+inertia*alpha
 return dict(liftM=h,durationS=t,gateMassKg=mass,voltageV=voltage,assumedRotorEquivalentInertiaKgM2=inertia,assumedGuideFrictionN=friction,assumedEfficiency=efficiency,assumedPitchRadiusM=radius,assumedCurrentCapA=current,peakSpeedMps=v,peakAccelMps2=a,motorPeakRpm=rpm,motorAccelRadS2=alpha,peakDemandNm=required,idealAvailableTorqueAtPeakNm=available,necessaryDriveEnvelopePass=required<=available,hardwareAccepted=False)
def report():
 rows=[dict(season=y,**screen(h,t,m,v,j)) for y,h in [(2024,.0708),(2025,.1343),(2026,.170)] for t in [.02,.25,.4] for m in [.2,.5] for v in [9.,12.] for j in [0.,1e-5]]
 return dict(schema='frc-braked-gate-screen/v1',cases=rows,sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},limitations=['Ideal linear motor envelope only; no thermal, current controller or battery dynamics','Assumed 15mm pulley, 20A cap, .7 efficiency, 5N friction and inertia sensitivity are not specifications','Triangular velocity has acceleration discontinuities; jerk and tracking not verified','No brake unlocking/dynamic arrest, drivetrain compliance, belt skip or structural qualification','No native gate collision result transfers to this new trajectory','Historical brake availability and complete season compliance unverified'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();target=pathlib.Path(a.output)
 if target.exists():raise ValueError('fresh output required')
 target.write_text(json.dumps(report(),indent=2,allow_nan=False)+'\n',encoding='utf-8')
