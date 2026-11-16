import unittest,json,pathlib,importlib.util
p=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('s',p/'inspect-support-stack.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class SupportTests(unittest.TestCase):
 def test_shaft_envelope_span(self):
  box=s.b.bounds(s.shaft_envelope());self.assertAlmostEqual(box[0],-150,places=5);self.assertAlmostEqual(box[3],150,places=5)
 def test_recorded_not_replayed(self):
  r=json.loads((p.parent/'case-studies/2026/native-support-stack.json').read_text(encoding='utf-8-sig'))
  self.assertEqual(len(r['checks']),11)
  for c in r['checks'].values():self.assertLess(abs(c['volumeMm3']),1e-7)
  self.assertGreater(r['misclockedShaftHubControl']['volumeMm3'],60)
  self.assertFalse(r['supportHousingIncluded']);self.assertEqual(r['engineeringAcceptance'],'blocked')
if __name__=='__main__':unittest.main()
