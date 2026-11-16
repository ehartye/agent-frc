import pathlib,importlib.util,json,hashlib,math,random,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('pc',ROOT/'scripts/pose-clearance-contract.py');pc=importlib.util.module_from_spec(s);s.loader.exec_module(pc)
class PoseClosureTests(unittest.TestCase):
 def test_old_rotated_counterexample_is_rejected(self):
  self.assertFalse(pc.certificate(2025,q=-17.9,yaw=3)['gateAndGuidePermission'])
  self.assertTrue(pc.certificate(2025,q=0,yaw=0)['gateAndGuidePermission'])
 def test_declared_uncertainty_can_change_permission(self):
  self.assertTrue(pc.certificate(2024,initial_v_lower=980,accel_bound=104000,x_error=1,y_error=1,angle_error_deg=2)['gateAndGuidePermission'])
  self.assertFalse(pc.certificate(2024,accel_bound=104000,x_error=1,y_error=1,angle_error_deg=2)['gateAndGuidePermission'])
 def test_angular_support_inflation_bound(self):
  rng=random.Random(7)
  for year in pc.GEOMETRY:
   for _ in range(100):
    yaw=rng.uniform(-20,20);pitch=rng.uniform(-20,20);error=5;dy=rng.uniform(-error,error);dp=rng.uniform(-(error-abs(dy)),error-abs(dy))
    hx,hy,r=pc.support(year,yaw,pitch);actual=pc.support(year,yaw+dy,pitch+dp);inflation=0 if year==2026 else r*math.radians(error)
    self.assertLessEqual(actual[0],hx+inflation+1e-10);self.assertLessEqual(actual[1],hy+inflation+1e-10)
 def test_sphere_orientation_invariant(self):
  self.assertEqual(pc.support(2026,20,10),pc.support(2026,0,0))
 def test_invalid(self):
  for x in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):pc.certificate(2024,q=x)
  with self.assertRaises(ValueError):pc.certificate(2024,duration=0)
  with self.assertRaises(ValueError):pc.certificate(2024,x_error=-1)
 def test_pose_report_regenerates(self):self.assertEqual(pc.report(),json.loads((ROOT/'case-studies/pose-clearance-contract.json').read_text(encoding='utf-8-sig')))
 def test_native_proofs_and_pins(self):
  r=json.loads((ROOT/'case-studies/time-resolved-catcher-closure.json').read_text());self.assertEqual(len(r['gateCases']),18);self.assertEqual(len(r['padCases']),9)
  for name,pin in r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  for case in r['gateCases']:
   if case['conservativePoseContract']['gateAndGuidePermission']:self.assertEqual(case['status'],'certified-2mm-clearance')
   if case['status']=='certified-2mm-clearance':
    self.assertGreaterEqual(case['minimumCertifiedLeafBoundMm'],2)
    samples=case['samples'];self.assertEqual(samples[0]['timeS'],0);self.assertEqual(samples[-1]['timeS'],case['closureDurationS'])
    for a,b in zip(samples,samples[1:]):
     bound=min(a['distanceMm'],b['distanceMm'])-case['relativeTranslationSpeedBoundMmPerS']*(b['timeS']-a['timeS'])/2
     self.assertGreaterEqual(bound,2-1e-9)
   if case['status']=='collision-witness':self.assertTrue(any(x['intersectionVolumeMm3']>1e-5 for x in case['witness']))
  for case in r['padCases']:self.assertFalse(case['forceOrPreloadEstablished'])
 def test_time_paths_preserve_failures_and_allow_conditional_safe_path(self):
  r=json.loads((ROOT/'case-studies/time-resolved-catcher-closure.json').read_text());cases={(c['season'],c['scenario']):c for c in r['gateCases']}
  self.assertEqual(cases[(2025,'rotated-tight-static')]['status'],'collision-witness')
  self.assertEqual(cases[(2025,'rotated-tight-advancing')]['status'],'certified-2mm-clearance')
  self.assertFalse(cases[(2025,'rotated-tight-advancing')]['conservativePoseContract']['gateAndGuidePermission'])
  for year in pc.GEOMETRY:self.assertEqual(cases[(year,'slow-closure-rebound')]['status'],'collision-witness')
if __name__=='__main__':unittest.main()
