"""Necessary kinematic conditions for hypothetical 1:1 slack-cable gate reset."""
import pathlib,json,hashlib,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
PINS=['scripts/guided-reset-coupling.py','case-studies/retention-component-evidence.json','case-studies/guided-retention-evidence.json']
def screen(lift,stroke,speed,slack,reserve):
 for v in (lift,stroke,speed,slack,reserve):
  if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):raise ValueError('finite numeric required')
 if min(lift,stroke,speed)<=0 or min(slack,reserve)<0:raise ValueError('invalid domain')
 # Slack decreases one mm per mm downward travel; payout is done while raised catch carries gate.
 return dict(liftMm=lift,strokeMm=stroke,noLoadSpeedMmS=speed,initialSlackMm=slack,assumedReserveMm=reserve,freeDropTravelMm=slack,fullDropUnconstrained=slack>=lift+reserve,strokeFitsNecessaryCondition=slack<=stroke,resetPlusPrepayNoLoadSeconds=2*slack/speed,remainingStrokeMm=stroke-slack,hardwareAccepted=False)
def report():
 e=json.loads((ROOT/PINS[1]).read_text());rows=[]
 for y,h in [(2024,70.8),(2025,134.3),(2026,170)]:
  for a in e['actuators']:
   for reserve in [0,5,35]:
    for slack in [0,h+reserve]:rows.append(dict(season=y,part=a['part'],**screen(h,a['strokeMm'],a['noLoadSpeedMmS'],slack,reserve)))
 return dict(schema='frc-guided-reset-coupling/v1',cases=rows,sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},assumptions=['1:1 inextensible cable with fixed routing and no friction, no snag or elastic energy','Raised catch supports gate while actuator prepays slack; separate lower latch releases before reset','Reserve values are hypothetical routing/tolerance sensitivity, not a specification','No-load speed is optimistic only; loaded speed, latch timing, cable ratings and guide hardware missing'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('fresh output required')
 out.write_text(json.dumps(report(),indent=2,allow_nan=False)+'\n',encoding='utf-8')
