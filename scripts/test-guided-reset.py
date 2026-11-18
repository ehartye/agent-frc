import pathlib,importlib.util,json,unittest,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/guided-reset-coupling.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ResetTests(unittest.TestCase):
 def test_taut_cable_prevents_drop(self):self.assertFalse(m.screen(170,200,46,0,0)['fullDropUnconstrained'])
 def test_fuel_reserve_stroke_failure(self):self.assertFalse(m.screen(170,200,46,205,35)['strokeFitsNecessaryCondition'])
 def test_optimistic_cycle_not_fast(self):self.assertGreater(m.screen(170,200,46,175,5)['resetPlusPrepayNoLoadSeconds'],7.6)
 def test_domain(self):
  for v in [True,float('nan'),float('inf'),-1,'x']:
   with self.assertRaises(ValueError):m.screen(v,200,46,175,5)
 def test_fresh_receipt(self):
  r=json.loads((ROOT/'case-studies/guided-reset-coupling.json').read_text());self.assertEqual(r,m.report());self.assertEqual(len(r['cases']),36)
  self.assertEqual(set(r['sourceCodeSha256']),{'scripts/guided-reset-coupling.py','case-studies/retention-component-evidence.json','case-studies/guided-retention-evidence.json'})
if __name__=='__main__':unittest.main()
