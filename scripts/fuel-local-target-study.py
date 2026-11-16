import pathlib,importlib.util,json,hashlib,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('b',ROOT/'scripts/target-local-ballistics.py');b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
PINS=['scripts/fuel-local-target-study.py','scripts/target-local-ballistics.py','case-studies/2026/intake-fixture-nominal.json','case-studies/target-frame-evidence.json']
def descending_height(p,v,h):
 return next((r for r in b.crossing(p,v,(0,0,h),(0,0,1)) if r['normalVelocityMps']<0),None)
def run_case(vx,lateral,height):
 p=(-2.,lateral,.7);v=(vx,0.,5.);radius=json.loads((ROOT/'case-studies/2026/intake-fixture-nominal.json').read_text())['pieceSource']['geometryMm']['diameter']/2000;apothem=41.73*.0254/2
 top,mid,bottom=[descending_height(p,v,h) for h in (height+radius,height,height-radius)]
 rows=[r for r in [top,mid,bottom] if r is not None]
 margin=min((b.hex_projection_margin(r['positionM'][0],r['positionM'][1],apothem,radius) for r in (top,bottom)),default=None) if top and bottom else None
 return dict(season=2026,basis='uncalibrated-plant-generated-local-plane-evidence',frame='HUB_LOCAL_HYPOTHESIS',exitPositionM=p,exitVelocityMps=v,pieceRadiusM=radius,planeHeightM=height,assumedRegularHexApothemM=apothem,descendingCrossings=rows,conservativeWholeSphereProjectionMarginM=margin,conditionalThinPlaneClearance=margin is not None and margin>0,targetSensorPassage=None,nominalComponentPoints=None,physicalScoring=None,calibration=None)
def report():
 return dict(schema='frc-fuel-local-target-study/v1',cases=[run_case(vx,y,h) for vx in [2.7,3.,3.3] for y in [0.,.5,.7] for h in [1.8161,1.8288,1.8415]],sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},limitations=['Prescribed exit velocity, no launcher or transport continuity','Constant gravity only: no drag, spin force, deformation or bounce','Regular planar hex inner size and orientation are local hypotheses, not a certified field/CAD transform','Full sphere projection bound over crossing interval only; not funnel, rim thickness or surrounding structure','No target sensor model; no automatic score conversion'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);p=pathlib.Path(a.parse_args().output)
 if p.exists():raise ValueError('fresh output required')
 p.write_text(json.dumps(report(),indent=2,allow_nan=False)+'\n',encoding='utf-8')
