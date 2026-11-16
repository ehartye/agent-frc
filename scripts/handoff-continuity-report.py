"""Summarize continuous state transfer, not installed hardware or scoring."""
import pathlib,json,hashlib,importlib.util,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('runner',ROOT/'scripts/run-catcher-powered.py');runner=importlib.util.module_from_spec(s);s.loader.exec_module(runner)
PINS=['scripts/handoff-continuity-report.py','scripts/run-catcher-powered.py','case-studies/catcher-powered-handoff.json']
def parse(line):
 if not isinstance(line,str) or not line.startswith('JOINED_EXIT '):raise ValueError('joined exit required')
 header,body=line[len('JOINED_EXIT '):].split(' Joined[');hp=[p.split('=') for p in header.split()];bp=[p.split('=') for p in body.removesuffix(']').split(', ')]
 if len(hp)!=3 or len(bp)!=11 or any(len(p)!=2 for p in hp+bp):raise ValueError('fields')
 h=dict(hp);r=dict(bp)
 if set(h)!={'year','initialSpeed','length'} or set(r)!={'sourceTime','sourceX','sourceV','finalTime','finalWorldX','finalWorldV','inheritedEnergy','finalEnergyResidual','upstreamGap','exited','heldBodyReachesGuideEntrance'}:raise ValueError('field set')
 if r.pop('exited')!='true' or r.pop('heldBodyReachesGuideEntrance')!='true':raise ValueError('expected bounded result')
 d={k:float(v) for k,v in (h|r).items()}
 if not all(math.isfinite(v) for v in d.values()) or d['year'] not in (2024,2025,2026) or d['initialSpeed'] not in (.1,.2,.4):raise ValueError('numeric domain')
 if d['finalTime']<=d['sourceTime'] or d['finalWorldV']>=0 or abs(d['sourceX']-d['length']-d['finalWorldX'])>1e-12 or abs(.25*d['sourceV']**2-d['inheritedEnergy'])>1e-12:raise ValueError('broken continuity')
 return dict(**d,frame='ORIGINAL_CATCHER_WORLD_1D',bodyMassKg=.5,heldBodyReachesGuideEntrance=True,fixedNipIsolationVerified=False,verticalVelocityMps=0,installedTargetTransform=None,nominalComponentPoints=None)
def report():
 r=json.loads((ROOT/'case-studies/catcher-powered-handoff.json').read_text())
 if set(r['sourceCodeSha256'])!=set(runner.CODE):raise ValueError('native dependency set')
 for p,h in r['sourceCodeSha256'].items():
  if hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest()!=h:raise ValueError('stale native input')
 rows=[parse(l) for l in r['observations']]
 if len(rows)!=9 or {(x['year'],x['initialSpeed']) for x in rows}!={(y,v) for y in (2024,2025,2026) for v in (.1,.2,.4)}:raise ValueError('inventory')
 return dict(schema='frc-handoff-continuity-report/v1',runId=r['runId'],cases=rows,sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},limitations=['Generic0.5kg catcher body preserved for every season; not actual season-specific mass validation','Original0.2Ns external reverse-release impulse remains; guide power starts after release','Horizontal receiving guide preserves velocity direction; no invented turn into elevated NOTE/FUEL trajectory','Short guide avoids modeled upstream intake overlap; full guide/housing/robot clearance remains unknown','Held finite body already reaches guide entrance before center handoff; fixed closed-nip isolation is NOT established','Normal force enabled only after center handoff, with no verified opening/closing actuator or finite contact geometry','Receiver wheel spin-up clock matches catcher clock, but upstream/receiver electrical supply interaction and full-robot energy are not modeled','Standalone exit and powered receipts are freshly replayed at this source revision; historical evidence remains in predecessor commits','No target registration, installed trough geometry, sensor passage, score or engineering acceptance'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);p=pathlib.Path(a.parse_args().output)
 with p.open('x',encoding='utf-8') as f:json.dump(report(),f,indent=2,allow_nan=False);f.write('\n')
