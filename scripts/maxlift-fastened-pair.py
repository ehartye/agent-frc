"""Pinned opposing MAXLift geometry with explicit screw proxies, not fastening acceptance."""
import pathlib,json,hashlib,importlib.util,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('roller',ROOT/'scripts/maxlift-roller-contact.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r);c=r.c;g=c.g
PINS=sorted(set(r.PINS+['scripts/maxlift-fastened-pair.py','case-studies/maxlift-fastened-pair-evidence.json']))

def mirror(shape):
 t=g.gp_Trsf();t.SetRotation(g.gp_Ax1(g.gp_Pnt(0,0,0),g.gp_Dir(0,0,1)),math.pi)
 return g.move(g.BRepBuilderAPI_Transform(shape,t,True).Shape(),63.49,0,0)

def load(directory):
 e=json.loads((ROOT/'case-studies/maxlift-fastened-pair-evidence.json').read_text());raw={}
 if set(e['sources'])!={'REV-21-2618','REV-21-2710','REV-21-2162','REV-29-2943'}:raise ValueError('unexpected source set')
 for name,source in e['sources'].items():
  p=pathlib.Path(directory)/(name+'.STEP');data=p.read_bytes()
  if hashlib.sha256(data).hexdigest()!=source['sha256'] or len(data)!=source['bytes']:raise ValueError('source revision mismatch '+name)
  reader=g.STEPControl_Reader()
  if reader.ReadFile(str(p))!=g.IFSelect_RetDone or reader.TransferRoots()!=1:raise ValueError('native CAD import')
  raw[name]=reader.OneShape()
 return e,raw

def report(directory):
 e,raw=load(directory);block=raw['REV-21-2618'];other=mirror(block);tube=raw['REV-21-2162'];rail=c.placed(tube,[31.745,300,0]);groups=r.rollers(block);witnesses=[]
 for side in [0,1]:
  for group in groups:
   d=group[0][1];z=d['axisPointMm'][2];p=([19.045,-.005,22.8 if z>0 else -22.8] if d['radiusMm']<9 else [22.05,0,25.4 if z>0 else -25.4]);faces=[f for f,_ in group]
   if side:p=[63.49-p[0],-p[1],p[2]];faces=[mirror(f) for f in faces]
   vertex=r.BRepBuilderAPI_MakeVertex(g.gp_Pnt(*p)).Shape()
   witnesses.append(dict(block=side,sourceFaceInvariants=[d for _,d in group],pointMm=p,pointToActualCylinderMm=min(g.distance(vertex,f) for f in faces),pointToNativeTubeMm=g.distance(vertex,rail),continuous60mmTrackLengthMm=r.track(rail,p)))
 cap=c.placed(raw['REV-21-2710'],[0,-22.098,0]);crossbar=c.placed(tube,[0,-25.4,0]);screws=[];shapes=[]
 for side in [0,1]:
  body=other if side else block;endcap=mirror(cap) if side else cap;bar=mirror(crossbar) if side else crossbar
  for z in [-12.7,0,12.7]:
   q=c.placed(raw['REV-29-2943'],[0,-14.5923,z]);q=mirror(q) if side else q;shapes.append(q)
   screws.append(dict(block=side,axisZmm=z,boundsMm=g.bounds(q),blockCommonMm3=g.common(q,body),tubeCommonMm3=g.common(q,bar),railCommonMm3=g.common(q,rail),capThreadProxyCommonMm3=g.common(q,endcap)))
 controls=[]
 for x in [31.745,31.75,36.745]:
  shifted=c.placed(tube,[x,300,0]);controls.append(dict(railXmm=x,secondBlockRailCommonMm3=g.common(other,shifted)))
 over=c.placed(raw['REV-29-2943'],[0,-14.6923,0])
 return dict(schema='frc-maxlift-fastened-pair/v1',sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},sourceRecords=e['sources'],runtimeOcp=g.OCP.__version__,oppositionTransform=dict(rotationAxis='Z',rotationDegrees=180,translationMm=[63.49,0,0]),railPose=dict(rotationXDegrees=-90,translationMm=[31.745,300,0]),blockBlockCommonMm3=g.common(block,other),blockBlockDistanceMm=g.distance(block,other),witnesses=witnesses,screws=screws,escapeControls=controls,overseat0p1mmControlMm3=g.common(over,block),screwStack=dict(rotationXDegrees=-90,translationMm=[0,-14.5923,0],axisZmm=[-12.7,0,12.7],headSeatYmm=-9.525,headTopYmm=-6.9596,tipYmm=-22.225,blockClearanceWallMm=3.175,capProxyWallYmm=[-17.78,-12.7],capProxyWallThicknessMm=5.08,tipExtensionIntoCavityMm=4.445,secondSide='mirror complete first-side pose'),simulationContract=dict(available=True,mode='explicit ideal rigid joints for block/cap/crossbar and zero-clearance opposed nominal roller constraints',calibrated=False,screwProxyTreatment='exclude screw/cap simplified thread overlap from contact response only under declared ideal rigid-joint assumption',longitudinalTravelAxis='Y',strokeWitnessRailYmm=[300,360],longitudinalStopsIncluded=False,secondSeparatedStationIncluded=False,backWebAttached=False),threadEngagement=None,preload=None,loadAcceptance=None,engineeringAcceptance='blocked',limitations=['One opposed station only; no validated longitudinal moment/rotation restraint','Six exact screw CAD placements are geometric proxies, not tightened or strength-qualified fasteners','Positive cap common volume is simplified major-diameter screw versus tap-drill solid; not accepted physical penetration or thread engagement','Eight mid-width native tracks only; no contact-patch width, tolerances, bearing preload or rolling friction','Native tube is uncut stock; no installed rail length, frame attachment, wheel web or robot-world placement','No inferred historical season legality, calibrated force, physical safety or scoring'])
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--cad-dir',required=True);a.add_argument('--output',required=True);v=a.parse_args()
 result=report(v.cad_dir)
 with pathlib.Path(v.output).open('x',encoding='utf-8') as f:json.dump(result,f,indent=2,allow_nan=False);f.write('\n')
