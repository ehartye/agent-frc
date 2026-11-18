"""Readable handoff from generated robot-target results, without score inference."""
import json,pathlib,hashlib,argparse

def render(report):
 if report.get('schema')!='frc-season-robot-targets/v1':raise ValueError('robot target report required')
 lines=['# Three-season prototype run','','Conditional model results, not official scores or hardware acceptance.','', '| Season | Plan | Supply | Mass | Dock time | Exit speed | Conditional target result |','|---|---|---:|---:|---:|---:|---|']
 for c in report['cases']:
  r=c['runtime'];year=r['year']
  if year==2024:
   n=c['note'];m=n['conservativeWholeTorusProjectionMarginM'];outcome='No full-plane crossing' if m is None else ('Whole torus clears' if n['conditionalWholeTorusThinPlaneClearance'] else 'Whole torus misses')+f' ({m*1000:.1f} mm margin)'
  elif year==2026:
   n=c['fuel'];m=n['wholeSphereThinPlaneMarginM'];outcome='No full-plane crossing' if m is None else ('Sphere clears' if n['conditionalClearance'] else 'Sphere misses')+f' ({m*1000:.1f} mm margin)'
  else:
   passed=[str(s['muHypothesis']) for s in c['coral'] if s['conditionalContainedStop']];outcome='Contained axial stop at assumed μ '+', '.join(passed) if passed else 'No contained stop in tested friction cases'
  lines.append(f"| {year} | {'refined' if r['plan'] else 'preserved baseline'} | {r['volts']:g} V | {r['mass']:.3f} kg | {r['dockTime']:.2f} s | {r['speed']:.3f} m/s | {outcome} |")
 lines+=['','## What this run connects','- Preloaded body carried by ideal differential-drive approach, then 200 ms commanded-stop dwell.','- Fresh pose/stop authorization, virtual pregrip/gate sequence and powered mechanism.','- Generated chassis pose plus declared mount offsets, unchanged exit velocity and continuous global clock into target assessment.','','## Remaining scope','- No acquisition/indexer from an empty robot, multiple pieces or field-wide autonomous routine.','- Drive is ideal kinematics: no traction, recoil, coupled drive/mechanism energy or physical odometry.','- Virtual sensors and ideal joints are model inputs, not production hardware adapters or calibrated loads.','- NOTE has no roof/wall/aerodynamic model; FUEL no funnel/sensor model; CORAL no rolling/elastic impact/full installed trough.','- No official scoring, complete legal robot envelope or clean-machine setup validation.','','Run identity: `'+report['sourceRunId']+'`','Runtime receipt (normalized UTF-8) SHA256: `'+report['sourceExecutionReceiptSha256']+'`','']
 return '\n'.join(lines)
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--report',required=True);a.add_argument('--output',required=True);v=a.parse_args();report=json.loads(pathlib.Path(v.report).read_text())
 with pathlib.Path(v.output).open('x',encoding='utf-8') as f:f.write(render(report))
