"""Pinned MAXLift corner mating only, not a complete captive guide or loaded assembly."""
import pathlib, json, math, hashlib, importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('geometry',ROOT/'scripts/retained-pregrip-fit.py'); g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
PINS=['scripts/maxlift-corner-mating.py','scripts/retained-pregrip-fit.py','case-studies/maxlift-corner-evidence.json']
def placed(shape,offset):
 t=g.gp_Trsf();t.SetRotation(g.gp_Ax1(g.gp_Pnt(0,0,0),g.gp_Dir(1,0,0)),-math.pi/2)
 return g.move(g.BRepBuilderAPI_Transform(shape,t,True).Shape(),*offset)
def report(directory):
 e=json.loads((ROOT/PINS[-1]).read_text());raw={}
 for part,source in e['sources'].items():
  p=pathlib.Path(directory)/(part+'.STEP')
  if hashlib.sha256(p.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('CAD revision mismatch '+part)
  r=g.STEPControl_Reader()
  if r.ReadFile(str(p))!=g.IFSelect_RetDone or r.TransferRoots()!=1:raise ValueError('native import failed')
  raw[part]=r.OneShape()
 parts={'block':raw['REV-21-2618'],'cap':placed(raw['REV-21-2710'],[0,-22.098,0]),'tube':placed(raw['REV-21-2162'],[0,-25.4,0])}
 holes=e['nativeNominalHoleEvidence']; cap_y=holes['capEndFaceZmm']-22.098; expected_z=holes['blockYAxesX0Zmm']; actual_z=[-y for y in reversed(holes['capNativeEndHoleYmm'])]; residuals=[math.hypot(cap_y-holes['blockMountingYmm'],a-b) for a,b in zip(actual_z,expected_z)]
 bad=placed(raw['REV-21-2710'],[0,-19.098,0]); control=g.common(parts['block'],bad)
 pairs=[]
 for a,b in [('block','cap'),('block','tube'),('cap','tube')]:pairs.append(dict(parts=[a,b],intersectionMm3=g.common(parts[a],parts[b]),distanceMm=g.distance(parts[a],parts[b])))
 return dict(schema='frc-maxlift-corner-mating/v1',sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},sourceRecords=e['sources'],runtimeOcp=g.OCP.__version__,rawBoundsMm={p:g.bounds(v) for p,v in raw.items()},placedBoundsMm={p:g.bounds(v) for p,v in parts.items()},pairs=pairs,pose=e['pose'],mountingHoleCenterResidualsMm=residuals,misplacedCap3mmInterferenceMm3=control,fastenersInstalled=False,threadEngagement=None,opposedStageInstalled=False,continuous60mmEngagementProven=False,backWebAttachment=None,loadAcceptance=None,engineeringAcceptance='blocked',limitations=['One pinned corner only; no independent captive slider, opposed stage or longitudinal restraint','Coincident nominal hole axes and contacting surfaces do not prove fastening, thread engagement, tolerances or loads','Uncut purchased tube CAD; no claim of an installed cut length or 60mm carriage stroke','No transfer to NOTE/CORAL/FUEL body or wheel assembly; no powered contact or scoring'])
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--cad-dir',required=True);a.add_argument('--output',required=True);v=a.parse_args()
 with pathlib.Path(v.output).open('x') as f:json.dump(report(v.cad_dir),f,indent=2,allow_nan=False);f.write('\n')
