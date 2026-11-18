import unittest,pathlib,json,hashlib,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/maxlift-roller-contact.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class RollerTests(unittest.TestCase):
 def test_fresh_native(self):self.assertEqual(m.report(ROOT/'examples/java-2026-sim/build/maxlift-mating-sources'),self.r())
 def r(self):return json.loads((ROOT/'case-studies/maxlift-roller-contact.json').read_text())
 def test_dependency_closure(self):
  r=self.r();self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS))
  for p,h in r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
 def test_actual_surface_tracks(self):
  r=self.r();self.assertEqual(len(r['rollerFaces']),4);self.assertTrue(all(len(g)==2 for g in r['rollerFaces']))
  for w in r['witnesses']:
   self.assertLess(w['pointToActualCylinderMm'],1e-8);self.assertLess(w['pointToNativeTubeMm'],1e-8);self.assertAlmostEqual(w['continuous60mmTrackLengthMm'],60,places=6)
 def test_holes_not_ignored(self):
  a,b,c=self.r()['nativeTrackControls'];self.assertAlmostEqual(a['trackLengthMm'],0);self.assertGreater(b['trackLengthMm'],35);self.assertLess(b['trackLengthMm'],40);self.assertAlmostEqual(c['trackLengthMm'],60)
 def test_min_distance_does_not_mean_captive(self):
  r=self.r();a,b,c,d=r['cases'];self.assertLess(max(a['rollerDistancesMm']),1e-8);self.assertLess(b['wholePairDistanceMm'],1e-8);self.assertAlmostEqual(max(b['rollerDistancesMm']),.005,places=6);self.assertLess(c['wholePairDistanceMm'],1e-8);self.assertAlmostEqual(max(c['rollerDistancesMm']),5,places=6);self.assertGreater(min(d['rollerDistancesMm']),4);self.assertFalse(r['opposedStageInstalled']);self.assertIsNone(r['physicalPreload'])
if __name__=='__main__':unittest.main()
