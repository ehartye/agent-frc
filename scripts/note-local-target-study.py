import pathlib,importlib.util,json,math,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('b',ROOT/'scripts/target-local-ballistics.py');b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
PINS=['scripts/note-local-target-study.py','scripts/target-local-ballistics.py','case-studies/2024/note-fixture-nominal.json','case-studies/target-frame-evidence.json']
def run_case(vx,lateral,pitch):
 e=json.loads((ROOT/PINS[-1]).read_text())['speaker'];low=e['lowEdgeAboveAssemblyBottomInch']*.0254;high=e['highEdgeAboveAssemblyBottomInch']*.0254;reach=e['horizontalReachInch']*.0254;length=math.hypot(reach,high-low);width=e['widthInch']*.0254;a=math.atan2(high-low,reach);u=(math.cos(a),0,math.sin(a));vaxis=(0,1,0);n=b.cross(u,vaxis);origin=(0,0,low);p=(2,lateral,.7);v=(vx,0,5.32);axis=(-math.sin(pitch),0,math.cos(pitch));geom=json.loads((ROOT/'case-studies/2024/note-fixture-nominal.json').read_text())['pieceSource']['geometryMm'];minor=geom['thickness']/2000;major=geom['outerDiameter']/2000-minor;supports=[b.torus_support(d,axis,major,minor) for d in [u,vaxis,n]]
 def positive(offset):return next((x for x in b.crossing(p,v,tuple(origin[i]+n[i]*offset for i in range(3)),n) if x['normalVelocityMps']>0),None)
 first,center,last=[positive(x) for x in [-supports[2],0,supports[2]]];margin=None
 if first and last:
  times=[first['timeS'],last['timeS']]
  if abs(b.dot(b.G,u))>1e-12:
   extremum=-b.dot(v,u)/b.dot(b.G,u)
   if times[0]<extremum<times[1]:times.append(extremum)
  coords=[b.to_local(b.position(p,v,t),origin,[u,vaxis,n]) for t in times]
  margin=min(min(c[0]-supports[0],length-c[0]-supports[0],width/2-abs(c[1])-supports[1]) for c in coords)
 return dict(season=2024,basis='uncalibrated-plant-generated-local-plane-evidence',frame='SPEAKER_SIDE_PROFILE_HYPOTHESIS',exitPositionM=p,exitVelocityMps=v,assumedFixedNotePitchDegrees=math.degrees(pitch),derivedPlaneAngleDegrees=math.degrees(a),planeLengthM=length,planeWidthM=width,torusSupportsM=supports,positiveNormalCrossings=[x for x in [first,center,last] if x],conservativeWholeTorusProjectionMarginM=margin,conditionalThinPlaneClearance=margin is not None and margin>0,targetSensorPassage=None,nominalComponentPoints=None,physicalScoring=None,calibration=None)
def report():
 e=json.loads((ROOT/PINS[-1]).read_text())['speaker'];angle=math.atan2(e['highEdgeAboveAssemblyBottomInch']-e['lowEdgeAboveAssemblyBottomInch'],e['horizontalReachInch'])
 return dict(schema='frc-note-local-target-study/v1',cases=[run_case(vx,y,pitch) for vx in [-4.,-4.4,-4.8] for y in [0,.45,.6] for pitch in [0,angle,math.pi/6]],sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},limitations=['Source side-profile interpretation only; manual14deg versus derived angle unresolved','Fixed orientation torus under constant gravity, no aerodynamic spin/lift/drag or deformation','Prescribed exit state not produced by mechanism','Conservative thin rectangular plane test only, not roof/wall bounce or sensor','Default drawing tolerance not propagated; this is nominal geometry only'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);p=pathlib.Path(a.parse_args().output)
 if p.exists():raise ValueError('fresh output required')
 p.write_text(json.dumps(report(),indent=2,allow_nan=False)+'\n',encoding='utf-8')
