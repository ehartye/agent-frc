import unittest,pathlib,json,hashlib,importlib.util,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/maxlift-corner-mating.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class CornerTests(unittest.TestCase):
 def test_fresh_native_report(self):
  expected=json.loads((ROOT/'case-studies/maxlift-corner-mating.json').read_text());self.assertEqual(m.report(ROOT/'examples/java-2026-sim/build/maxlift-mating-sources'),expected)
 def test_exact_dependencies(self):
  r=json.loads((ROOT/'case-studies/maxlift-corner-mating.json').read_text());self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS))
  for p,h in r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
 def test_nominal_corner_and_obstruction(self):
  r=json.loads((ROOT/'case-studies/maxlift-corner-mating.json').read_text());self.assertTrue(all(p['intersectionMm3']<1e-6 for p in r['pairs']));self.assertAlmostEqual(r['pairs'][2]['distanceMm'],.127,places=6);self.assertGreater(r['misplacedCap3mmInterferenceMm3'],2300);self.assertTrue(all(x<1e-9 for x in r['mountingHoleCenterResidualsMm']))
 def test_missing_load_and_restraint_not_accepted(self):
  r=json.loads((ROOT/'case-studies/maxlift-corner-mating.json').read_text());self.assertFalse(r['fastenersInstalled']);self.assertFalse(r['opposedStageInstalled']);self.assertFalse(r['continuous60mmEngagementProven']);self.assertIsNone(r['loadAcceptance']);self.assertIsNone(r['backWebAttachment'])
 def test_changed_cad_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   (pathlib.Path(d)/'REV-21-2618.STEP').write_bytes(b'wrong revision')
   with self.assertRaisesRegex(ValueError,'CAD revision mismatch'):m.report(d)
if __name__=='__main__':unittest.main()
