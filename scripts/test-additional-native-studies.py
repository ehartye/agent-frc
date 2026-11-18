import json,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class AdditionalNativeTests(unittest.TestCase):
 def test_season_receipt_not_replay(self):
  r=json.loads((ROOT/'case-studies/native-season-wheel-units.json').read_text(encoding='utf-8-sig'))
  for v in r['NOTE'].values():self.assertLess(abs(v['volumeMm3']),1e-7)
  self.assertGreater(r['CORAL']['wheelShaftPhase0']['volumeMm3'],90)
  self.assertLess(abs(r['CORAL']['wheelShaftPhase30']['volumeMm3']),1e-7)
  self.assertEqual(r['engineeringAcceptance'],'blocked')
 def test_housing_receipt_not_replay(self):
  r=json.loads((ROOT/'case-studies/2026/native-housing-stack.json').read_text(encoding='utf-8-sig'))
  for v in r['checks'].values():self.assertLess(abs(v['volumeMm3']),1e-7)
  self.assertGreater(r['reversedRetainerControl']['volumeMm3'],180)
  self.assertFalse(r['fastenersIncluded']);self.assertIsNone(r['originalPlate']['tolerances'])
if __name__=='__main__':unittest.main()
