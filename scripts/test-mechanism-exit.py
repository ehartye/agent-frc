import unittest,importlib.util,pathlib,math,copy,json,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/mechanism-exit-registration.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ExitTests(unittest.TestCase):
 def setUp(self):self.r=dict(season=2024,basis='hypothetical-rigid-registration',units='m',**{'from':'MECHANISM_1D','to':'TARGET_LOCAL_2024'},originM=[1,2,3],axes=[[0,1,0],[-1,0,0],[0,0,1]])
 def test_rigid_transform_preserves_velocity_and_translation(self):
  r=m.embed(2024,.35,-.4,self.r);self.assertEqual(r['positionM'],[1,2.35,3]);self.assertEqual(r['velocityMps'],[0,-.4,0]);self.assertIsNone(r['orientation']);self.assertIsNone(r['scoring'])
 def test_no_default_registration(self):
  with self.assertRaises(ValueError):m.embed(2024,0,0,None)
 def test_season_and_nonfinite(self):
  for y in ['2024',True,2024.0,2027,None]:
   with self.assertRaises(ValueError):m.embed(y,0,0,self.r)
  for x in [float('nan'),float('inf'),True,'0']:
   with self.assertRaises(ValueError):m.embed(2024,x,0,self.r)
 def test_frame_confusion(self):
  for k,v in [('season',2025),('basis','installed'),('units','mm'),('from','FIELD'),('to','TARGET_LOCAL_2026')]:
   r=copy.deepcopy(self.r);r[k]=v
   with self.assertRaises(ValueError):m.embed(2024,0,0,r)
 def test_scaling_and_reflection(self):
  for axes in [[[2,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,1,0],[0,0,1]]]:
   r=copy.deepcopy(self.r);r['axes']=axes
   with self.assertRaises(ValueError):m.embed(2024,0,0,r)
 def test_exit_negative_records(self):
  r=json.loads((ROOT/m.PINS[-1]).read_text());line=r['mechanismExitObservations'][0]
  for bad in [line+' timeS=1',line.replace('fault=0','fault=1'),line.replace('year=2024','year=2024.5'),line.replace('dtS=0.002','dtS=NaN'),line.replace('externalReleaseImpulseNs=0.2','externalReleaseImpulseNs=0')]:
   with self.assertRaises(ValueError):m.parse_exit(bad)
 def test_energy_bound_all_directions(self):
  r=m.report()
  for c in r['cases']:
   speed=abs(c['vxMps']);rise=c['maximumRiseAnyRotationM']
   for k in range(1001):
    vz=speed*math.sin(k*math.pi/500);self.assertLessEqual(max(0,vz)**2/(2*9.80665),rise+1e-15)
   self.assertLess(rise,.009);self.assertIsNone(c['nominalComponentPoints']);self.assertFalse(c['mechanismGeneratedLaunch'])
   if c['year']!=2025:self.assertFalse(c['centerHeightReachableWithoutAddedEnergy'])
 def test_receipt_exact_and_dependency_set(self):
  r=m.report();self.assertEqual(r,json.loads((ROOT/'case-studies/mechanism-exit-continuity.json').read_text()));self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS));self.assertEqual(len(r['cases']),9)
 def test_stale_replay_denied(self):
  old=m.ROOT;r=json.loads((ROOT/m.PINS[-1]).read_text())
  try:
   with tempfile.TemporaryDirectory() as d:
    m.ROOT=pathlib.Path(d)
    for p in set(m.PINS)|set(r['sourceCodeSha256']):
     dest=m.ROOT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((ROOT/p).read_bytes())
    p=m.ROOT/'scripts/pose-clearance-contract.py';p.write_text(p.read_text()+'\n# changed\n')
    with self.assertRaisesRegex(ValueError,'stale world replay'):m.report()
  finally:m.ROOT=old
 def test_missing_replay_pin_denied(self):
  old=m.ROOT;r=json.loads((ROOT/m.PINS[-1]).read_text());del r['sourceCodeSha256']['scripts/pose-clearance-contract.py']
  try:
   with tempfile.TemporaryDirectory() as d:
    m.ROOT=pathlib.Path(d)
    for p in set(m.PINS)|{'scripts/run-diagnostic-world.py'}:
     dest=m.ROOT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((ROOT/p).read_bytes())
    (m.ROOT/m.PINS[-1]).write_text(json.dumps(r))
    with self.assertRaisesRegex(ValueError,'dependency set mismatch'):m.report()
  finally:m.ROOT=old
if __name__=='__main__':unittest.main()
