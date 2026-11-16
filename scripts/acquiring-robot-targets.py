"""Acquired body -> ideal rigid carry -> existing powered robot exits -> scoped targets."""
import json,pathlib,hashlib,math,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
base=module('season_target','scripts/season-robot-targets.py');runner=module('acquire_runner','scripts/run-acquiring-robot.py');acquire=module('acquire_model','scripts/acquisition-contract.py')
PINS=sorted(set(base.PINS+runner.CODE+acquire.PINS+['scripts/acquiring-robot-targets.py','case-studies/2026/intake-fixture-nominal.json','scripts/season-robot-targets.py']))
FIELDS=set('year mass volts plan terminalQ terminalV acquisitionTime sourceEnergy potential dragLoss impactLoss impulse residual dockTime chassisX chassisY heading angle length radius inertia duty speed motorResidual feedEnergy motorWork robotTime globalTime exitX exitY exitZ vx vy vz'.split())
def sha(path):return hashlib.sha256(path.read_text(encoding='utf-8-sig').encode()).hexdigest()
def parse(line):
 if not isinstance(line,str) or not line.startswith('ACQUIRE_EXIT '):raise ValueError('acquisition output required')
 pairs=[x.split('=') for x in line.split()[1:]]
 if len(pairs)!=len(FIELDS) or any(len(p)!=2 for p in pairs):raise ValueError('field inventory')
 row={k:float(v) for k,v in pairs}
 if set(row)!=FIELDS or any(not math.isfinite(v) for v in row.values()):raise ValueError('finite exact fields required')
 y=row['year'];mass=row['mass']
 if y not in (2024,2025,2026) or mass not in ({2024:[.235],2025:[.498951607,.816466266],2026:[.215]}[y]) or row['volts']!=12 or row['plan']!=1:raise ValueError('scenario')
 angle={2024:math.radians(50),2025:0,2026:math.radians(60)}[y]
 if row['angle']!=angle or row['terminalQ']!=0 or row['terminalV']!=0 or row['feedEnergy']!=0:raise ValueError('exact retained state/axis required')
 model=acquire.acquire(mass,angle)
 if not model['conditionalStateEligible']:raise ValueError('acquisition failed')
 expected={'sourceEnergy':model['sourceKineticEnergyJ'],'potential':model['potentialGainJ'],'dragLoss':model['guideLossJ'],'impactLoss':model['impactLossJ'],'impulse':model['requiredImpulseNs'],'acquisitionTime':model['trace'][-1]['timeS']}
 if any(abs(row[k]-v)>1e-11 for k,v in expected.items()) or abs(row['residual'])>1e-11 or abs(row['globalTime']-row['acquisitionTime']-row['robotTime'])>1e-11:raise ValueError('acquisition ledger/time continuity')
 if row['robotTime']<=row['dockTime'] or row['dockTime']<=0 or row['motorWork']<=0:raise ValueError('robot chronology/work')
 config={'length':.15 if y==2025 else .3,'radius':{2024:.0508,2025:.0254,2026:.0381}[y],'inertia':.0003 if y==2024 else .0005,'duty':.04 if y==2025 else .6}
 if any(row[k]!=v for k,v in config.items()):raise ValueError('runtime configuration')
 # Reuse checked pose/velocity transform without replacing any exit component.
 mapped={k:row[k] for k in sorted(base.FIELDS) if k not in ('time','residual')};mapped.update(time=row['globalTime'],residual=row['motorResidual'])
 parsed=base.parse('ROBOT_EXIT '+' '.join(f'{k}={v}' for k,v in mapped.items()))
 return row,parsed

def report(receipt=None):
 path=pathlib.Path(receipt) if receipt else ROOT/'case-studies/acquiring-robot-run.json';r=json.loads(path.read_text(encoding='utf-8-sig'))
 if r.get('schema')!='frc-acquiring-season-robot-run/v1' or set(r['sourceCodeSha256'])!=set(runner.CODE) or set(r['tests'])!=runner.TESTS:raise ValueError('execution source/test inventory')
 if r['sourceCodeSha256']!=runner.pins() or set(r['runtimeClassSha256'])!=set(runner.CLASSES)|{'DCMotor'}:raise ValueError('stale runtime or missing class')
 if set(r['artifactsSha256'])!={'runtime.properties','tests.xml','gradle.log','dependencies.json'}:raise ValueError('artifact inventory')
 for h in list(r['runtimeClassSha256'].values())+list(r['artifactsSha256'].values()):
  if not isinstance(h,str) or len(h)!=64 or any(c not in '0123456789abcdef' for c in h):raise ValueError('hash')
 rows=[parse(line) for line in r['observations']]
 if len(rows)!=4 or {(x['year'],x['mass']) for x,_ in rows}!={(2024,.235),(2025,.498951607),(2025,.816466266),(2026,.215)}:raise ValueError('scenario inventory')
 cases=[]
 for raw,mapped in rows:
  case=base.assess(mapped);case['acquisitionRuntime']=raw;case['clockScope']='global acquisition + ideal drive + mechanism + target flight';cases.append(case)
 return dict(schema='frc-acquiring-robot-targets/v1',sourceRunId=r['runId'],sourceExecutionReceiptSha256=sha(path),sourceCodeSha256={p:sha(ROOT/p) for p in PINS},cases=cases,assumptions=['Only final20mm guided source approach; source delivery speed0.6m/s externally prescribed, not station pickup','Same inclined guide frame with event-exact perfectly inelastic impulse and explicit acquisition energy ledger','Ideal source latch maps to closed pregrip gate; physical latch/release geometry unknown','Exact rest state consumed once; rigid carry during ideal kinematic drive, no drive energy/whole-robot conservation','Generated mass, dock pose, exit velocity and time preserved; target models retain fixed orientation/friction/registration hypotheses','Recorded receipt reproduction is not fresh Java execution; use run-acquiring-robot.py for new execution'],officialScore=None,calibration=None,engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--receipt');p.add_argument('--output',required=True);a=p.parse_args()
 with pathlib.Path(a.output).open('x') as f:json.dump(report(a.receipt),f,indent=2,allow_nan=False);f.write('\n')
