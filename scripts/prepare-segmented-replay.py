"""Prepare fixed prescribed-motion segmented geometry + controller IO replay inputs."""
import pathlib,importlib.util,math,json,hashlib,csv
ROOT=pathlib.Path(__file__).resolve().parents[1]
sp=importlib.util.spec_from_file_location('g',ROOT/'scripts/segmented-fuel-contact.py');g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g)
SEASONS={2024:dict(radius=50.8,half=12.00625,z=101.6,centers=[-175,-125,-75,-25,25,75,125,175]),2025:dict(radius=25.4,half=6.35,z=139.7,centers=[(i-3.5)*19.05 for i in range(8)]),2026:dict(radius=38.1,half=12.00625,z=188.1,centers=[-87.3125,-52.3875,-17.4625,17.4625,52.3875,87.3125])}

EVIDENCE=['case-studies/2024/note-fixture-nominal.json','case-studies/2025/coral-fixture-nominal.json','case-studies/2026/intake-fixture-nominal.json','case-studies/native-season-wheel-units.json','case-studies/2026/native-wheel-stack-exploration.json']
def evidence():
 records=[json.loads((ROOT/n).read_text(encoding='utf-8-sig')) for n in EVIDENCE]
 expected=[{'outerDiameter':355.6,'innerDiameter':254.0,'thickness':50.8},{'outerDiameter':114.3,'innerDiameter':101.6,'length':301.625},{'diameter':150.0}]
 for year,r,geom in zip(SEASONS,records,expected):
  if r['pieceSource']['geometryMm']!=geom or r['roller']['axisOriginMm'][2]!=SEASONS[year]['z']:raise ValueError('Fixture geometry changed; review required')
 wheel_records=[records[3]['sourceRecords']['note'],records[3]['sourceRecords']['coral'],records[4]['sourceRecords']['wheel']]
 expected_pins=['408544394be77d3815d32ab360d8cbb975ccf847366f0d02c77499dc33fe3bb2','31c85aa9eb59711c3119e0089d2865bb243f82126007d15e49e4189892882150','b6e6ad137251120e3acb7650f947534b732f05841fa7b0a36a7c61a571e0e599']
 for year,r,pin in zip(SEASONS,wheel_records,expected_pins):
  c=SEASONS[year];bounds=r['boundsMm']
  if r['sha256']!=pin or abs(bounds[3]-bounds[0]-2*c['half'])>1e-6 or abs(bounds[4]-c['radius'])>1e-6:raise ValueError('Pinned wheel envelope mismatch')
 return {n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode('utf-8')).hexdigest() for n in EVIDENCE}

def gaps(year,x,compression):
 if type(year) is not int or year not in SEASONS:raise ValueError('fixed season required')
 g.finite_number(x);g.finite_number(compression)
 if not -250<=x<=386 or compression not in (0,5):raise ValueError('fixed replay domain')
 c=SEASONS[year];z=c['z']-compression
 if year==2026:
  v=[g.sphere_wheel_gap((x,0,75),75,y,z,c['radius'],c['half']) for y in c['centers']];return min(v),min(v)
 if year==2025:
  # Partial end crossing is deliberately unsupported; far-separated X bounds remain safe.
  distance=abs(x)-301.625/2-c['radius']
  if distance>0:return distance,None
  if abs(x)>301.625/2-c['radius']:return None,None
  v=[math.hypot(max(abs(y)-c['half'],0),z-c['radius']-57.15)-57.15 for y in c['centers']];return min(v),min(v)
 n=720;upper=float('inf')
 for i in range(n):
  t=i*math.tau/n;cx=x+152.4*math.cos(t);cy=152.4*math.sin(t)
  for y in c['centers']:upper=min(upper,g.sphere_wheel_gap((cx,cy,25.4),25.4,y,z,c['radius'],c['half']))
 return upper-152.4*math.pi/n,upper

def occupied(year,x):
 if type(year) is not int or year not in SEASONS:raise ValueError('fixed season required')
 g.finite_number(x)
 return (127<=abs(x)<=177.8) if year==2024 else abs(x)<=(301.625/2 if year==2025 else 75)

def sha(path):return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()

def prepare(out):
 evidence_pins=evidence()
 out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=False);summaries={};props=['schema=frc-segmented-prescribed-replay/v1','engineeringAcceptance=blocked','motion=prescribed-not-force-integrated','calibration=none']
 for year,c in SEASONS.items():
  for name,compression in [('nominal',0),('compressed',5)]:
   path=out/f'{year}-{name}.csv';counts={'overlap':0,'separated':0,'unknown':0}
   with path.open('w',newline='',encoding='utf-8') as stream:
    writer=csv.writer(stream);writer.writerow(['tick','xM','gapLowerMm','gapUpperMm','classification','beam','topCount','bottomCount'])
    for tick in range(160):
     x=-250+4*tick;lo,hi=gaps(year,x,compression)
     state='overlap' if hi is not None and hi < -1e-6 else ('separated' if lo is not None and lo>1e-6 else 'unknown');counts[state]+=1
     # Independent synthetic complementary encoder stimulus, NOT resulting dynamics.
     angle=.2/(c['radius']/1000)*tick*.02;count=round(angle/(math.tau/2048))
     writer.writerow([tick,x/1000,'unknown' if lo is None else lo,'unknown' if hi is None else hi,state,int(occupied(year,x)),-count,count])
   props.append(f'{year}-{name}.sha256={sha(path)}');summaries[f'{year}-{name}']=counts
  props.append(f'{year}.radiusM={c["radius"]/1000}')
 props.extend(f'evidence.{k}.sha256={v}' for k,v in evidence_pins.items())
 (out/'input.properties').write_text('\n'.join(props)+'\n',encoding='utf-8')
 receipt=dict(schema='frc-segmented-replay-inputs/v1',status='prepared',geometryEvidenceSha256=evidence_pins,counts=summaries,inputSha256=sha(out/'input.properties'),motion='prescribed constant0.2m/s, fixed height/orientation/lateral pose; not caused by motors/contact',forceLaw=None,engineeringAcceptance='blocked',sourceCodePinBasis='UTF-8 without BOM and normalized LF',sourceCodeSha256={name:hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode('utf-8')).hexdigest() for name in ['scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py']})
 (out/'prepared.json').write_text(json.dumps(receipt,indent=2)+'\n')
 return receipt
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args();print(json.dumps(prepare(args.output),indent=2))
