import pathlib,importlib.util,unittest,math,json,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('f',ROOT/'scripts/fuel-local-target-study.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);b=m.b
class TargetTests(unittest.TestCase):
 def test_frame_rotation_and_translation(self):self.assertEqual(b.to_local((11,22,33),(10,20,30),[(0,1,0),(-1,0,0),(0,0,1)]),(2,-1,3))
 def test_bad_frames(self):
  for axes in [[(1,0,0),(0,1,0),(0,0,-1)],[(2,0,0),(0,1,0),(0,0,1)]]:
   with self.assertRaises(ValueError):b.frame((0,0,0),axes)
 def test_quadratic_plane_residual(self):
  rows=b.crossing((-2,0,.7),(3,0,5),(0,0,1.8288),(0,0,1));self.assertEqual(len(rows),2)
  for r in rows:self.assertAlmostEqual(r['positionM'][2],1.8288)
  self.assertGreater(rows[0]['normalVelocityMps'],0);self.assertLess(rows[1]['normalVelocityMps'],0)
 def test_low_energy_never_reaches_target(self):self.assertEqual(b.crossing((-2,0,.7),(3,0,1),(0,0,1.8288),(0,0,1)),[])
 def test_full_sphere_bound_dense_reconstruction(self):
  for c in m.report()['cases']:
   if c['conditionalThinPlaneClearance']:
    lo,_,hi=c['descendingCrossings']
    for i in range(101):
     t=lo['timeS']+(hi['timeS']-lo['timeS'])*i/100;p=b.position(c['exitPositionM'],c['exitVelocityMps'],t);margin=b.hex_projection_margin(p[0],p[1],c['assumedRegularHexApothemM'],c['pieceRadiusM']);self.assertGreaterEqual(margin,c['conservativeWholeSphereProjectionMarginM']-1e-10)
 def test_lateral_miss_and_no_score(self):
  good=m.run_case(3,0,1.8288);bad=m.run_case(3,.7,1.8288);self.assertTrue(good['conditionalThinPlaneClearance']);self.assertFalse(bad['conditionalThinPlaneClearance']);self.assertIsNone(good['nominalComponentPoints']);self.assertIsNone(good['targetSensorPassage'])
 def test_torus_orientation_matters(self):self.assertAlmostEqual(b.torus_support((0,0,1)),.0254);self.assertAlmostEqual(b.torus_support((1,0,0)),.1778)
 def test_ballistic_specific_energy_conserved(self):
  p=(2,0,.7);v=(-4.4,0,5.32);e0=.5*b.dot(v,v)+9.80665*p[2]
  for i in range(101):
   t=i/100;pt=b.position(p,v,t);vt=tuple(v[j]+b.G[j]*t for j in range(3));self.assertAlmostEqual(.5*b.dot(vt,vt)+9.80665*pt[2],e0,places=11)
 def test_nonfinite_rejected(self):
  for v in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):b.position((v,0,0),(0,0,0),1)
 def test_receipt_exact_regeneration(self):
  r=json.loads((ROOT/'case-studies/fuel-local-target-study.json').read_text());self.assertEqual(r,json.loads(json.dumps(m.report())));self.assertEqual(len(r['cases']),27);self.assertEqual(set(r['sourceCodeSha256']),{'scripts/fuel-local-target-study.py','scripts/target-local-ballistics.py','case-studies/2026/intake-fixture-nominal.json','case-studies/target-frame-evidence.json'})

class OtherSeasonTargetTests(unittest.TestCase):
 def test_note_dense_projection_and_orientation_counterexample(self):
  s=importlib.util.spec_from_file_location('note',ROOT/'scripts/note-local-target-study.py');n=importlib.util.module_from_spec(s);s.loader.exec_module(n);r=n.report();stored=json.loads((ROOT/'case-studies/note-local-target-study.json').read_text());self.assertEqual(stored,json.loads(json.dumps(r)));positive=[c for c in r['cases'] if c['conditionalThinPlaneClearance']];self.assertEqual(len(positive),1);c=positive[0];self.assertFalse(n.run_case(-4.4,0,0)['conditionalThinPlaneClearance'])
  angle=math.radians(c['derivedPlaneAngleDegrees']);u=(math.cos(angle),0,math.sin(angle));v=(0,1,0);normal=b.cross(u,v);origin=(0,0,78.13*.0254);lo,_,hi=c['positiveNormalCrossings']
  for i in range(1001):
   t=lo['timeS']+(hi['timeS']-lo['timeS'])*i/1000;x,y,z=b.to_local(b.position(c['exitPositionM'],c['exitVelocityMps'],t),origin,[u,v,normal]);su,sv,sn=c['torusSupportsM'];margin=min(x-su,c['planeLengthM']-x-su,c['planeWidthM']/2-abs(y)-sv);self.assertGreaterEqual(margin,c['conservativeWholeTorusProjectionMarginM']-1e-10)
  self.assertIsNone(c['targetSensorPassage']);self.assertIsNone(c['nominalComponentPoints'])
 def test_coral_native_part_only_controls(self):
  s=importlib.util.spec_from_file_location('coral',ROOT/'scripts/coral-trough-part-study.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c);fresh=c.report();stored=json.loads((ROOT/'case-studies/coral-trough-part-study.json').read_text());self.assertEqual(fresh['sourceCodeSha256'],stored['sourceCodeSha256']);self.assertEqual(len(fresh['cases']),9)
  for a,d in zip(fresh['cases'],stored['cases']):self.assertAlmostEqual(a['nativeDistanceM'],d['nativeDistanceM'],places=10);self.assertAlmostEqual(a['nativeIntersectionM3'],d['nativeIntersectionM3'],places=12);self.assertIsNone(a['installedTroughContact']);self.assertIsNone(a['nominalComponentPoints'])
  center=[x for x in fresh['cases'] if x['centerU_M']==.2];self.assertAlmostEqual(center[0]['nativeDistanceM'],.01);self.assertEqual(center[1]['nativeIntersectionM3'],0);self.assertGreater(center[2]['nativeIntersectionM3'],1e-6)
 def test_three_dependency_sets_and_unknown_scores(self):
  for name,expected in [('note-local-target-study',{'scripts/note-local-target-study.py','scripts/target-local-ballistics.py','case-studies/2024/note-fixture-nominal.json','case-studies/target-frame-evidence.json'}),('coral-trough-part-study',{'scripts/coral-trough-part-study.py','case-studies/target-frame-evidence.json','case-studies/2025/coral-fixture-nominal.json'})]:
   r=json.loads((ROOT/f'case-studies/{name}.json').read_text());self.assertEqual(set(r['sourceCodeSha256']),expected)
   for p,h in r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
   self.assertTrue(all(c['nominalComponentPoints'] is None for c in r['cases']))

if __name__=='__main__':unittest.main()
