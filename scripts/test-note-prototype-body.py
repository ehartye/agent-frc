import pathlib,json,hashlib,math,unittest,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('n',ROOT/'scripts/note-prototype-body.py');n=importlib.util.module_from_spec(s);s.loader.exec_module(n)
class NoteTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.r=json.loads((ROOT/'case-studies/note-prototype-body.json').read_text())
 def test_reproduces(self):self.assertEqual(json.loads(json.dumps(n.report())),self.r)
 def test_dependency_closure(self):
  self.assertEqual(set(self.r['sourceCodeSha256']),set(n.PINS))
  for p,h in self.r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
 def test_baseline_center_pass_is_not_whole_note_pass(self):self.assertEqual(len(self.r['baselineCases']),72);self.assertFalse(any(c['conditionalWholeTorusThinPlaneClearance'] for c in self.r['baselineCases']))
 def test_bounded_aim_improvement_is_conditional(self):
  passing=[c['best'] for c in self.r['boundedAimStudy'] if c['best'] and c['best']['conditionalWholeTorusThinPlaneClearance']];self.assertEqual(len(passing),1);c=passing[0];self.assertEqual(c['sourceExit']['volts'],12);self.assertEqual(c['sourceExit']['inertiaEach'],.0003);self.assertAlmostEqual(c['aimDistanceM'],1.95);self.assertGreater(c['conservativeWholeTorusProjectionMarginM'],.02);self.assertLess(c['conservativeWholeTorusProjectionMarginM'],.022)
  bad=n.evaluate(c['sourceExit'],c['aimDistanceM'],math.radians(c['fixedNotePitchDeg']),.6);self.assertFalse(bad['conditionalWholeTorusThinPlaneClearance']);self.assertIsNone(c['matchScore'])
 def test_no_exit_speed_or_clock_reset(self):
  for c in self.r['baselineCases']:
   self.assertAlmostEqual(sum(v*v for v in c['exitVelocityMps']),c['sourceExit']['speed']**2)
   for x in c['normalSupportCrossings']:
    if x:self.assertEqual(x['absolutePlantTimeS'],c['sourceExit']['time']+x['timeS'])
 def test_dense_whole_torus_samples_inside_certified_projection(self):
  c=next(x['best'] for x in self.r['boundedAimStudy'] if x['best'] and x['best']['conditionalWholeTorusThinPlaneClearance']);pitch=math.radians(c['fixedNotePitchDeg']);axis=(-math.sin(pitch),0,math.cos(pitch));a=(math.cos(pitch),0,math.sin(pitch));b=(0,1,0);first,last=c['normalSupportCrossings'][0]['timeS'],c['normalSupportCrossings'][2]['timeS']
  for j in range(21):
   center=n.b.position(c['exitPositionM'],c['exitVelocityMps'],first+(last-first)*j/20)
   for k in range(36):
    u=2*math.pi*k/36
    for l in range(12):
     v=2*math.pi*l/12;point=[center[i]+(.1524+.0254*math.cos(v))*(a[i]*math.cos(u)+b[i]*math.sin(u))+.0254*math.sin(v)*axis[i] for i in range(3)];local=n.b.to_local(point,c['planeOriginM'],c['planeAxes']);self.assertGreaterEqual(local[0],0);self.assertLessEqual(local[0],c['planeLengthM']);self.assertLessEqual(abs(local[1]),c['planeWidthM']/2)
 def test_invalid_pose_inputs_rejected(self):
  row=self.r['baselineCases'][0]['sourceExit']
  for bad in [True,float('nan'),float('inf')]:
   for args in [(bad,0,0),(2,bad,0),(2,0,bad)]:
    with self.assertRaises(ValueError):n.evaluate(row,*args)
  for year in ['2024',2025,True]:
   with self.assertRaises(ValueError):n.evaluate(dict(row,year=year),2,0)
 def test_tampered_runtime_targets_rejected(self):
  import tempfile
  report=json.loads((ROOT/'case-studies/integrated-prototype-targets.json').read_text());report['cases'][0]['sourceExit']['speed']+=1
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'targets.json';path.write_text(json.dumps(report))
   with self.assertRaisesRegex(ValueError,'stale integrated'):n.report(path)
if __name__=='__main__':unittest.main()
