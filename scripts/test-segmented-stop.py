import pathlib,importlib.util,json,hashlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('summary',ROOT/'scripts/summarize-segmented-stop.py');smod=importlib.util.module_from_spec(s);s.loader.exec_module(smod)
class StopReceiptTests(unittest.TestCase):
 def setUp(self):self.r=json.loads((ROOT/'case-studies/segmented-stop-sensitivity.json').read_text());self.rows=smod.observations(self.r)
 def test_source_pins_and_inventory(self):
  self.assertEqual(len(self.r['tests']),4);self.assertEqual(len(self.rows),42)
  for name,pin in self.r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  self.assertIsNone(self.r['calibration']);self.assertEqual(self.r['engineeringAcceptance'],'blocked')
 def test_passivity_accounting_and_stop_failure(self):
  for r in self.rows:self.assertLess(r['maxResidualJ'],1e-8);self.assertGreaterEqual(r['resistanceLossJ'],0)
  for y in (2024,2025):
   r=next(x for x in self.rows if x['year']==y and x['feed']==.1 and x['postDoneResistance']==10)
   self.assertTrue(r['done']);self.assertFalse(r['hypothetical50mmScreen']);self.assertGreater(r['postEventTravel'],.05)
  r=next(x for x in self.rows if x['year']==2026 and x['approachResistance']==.1)
  self.assertTrue(r['timeout']);self.assertFalse(r['done']);self.assertIsNone(r['completionS'])
 def test_summary_regenerates(self):self.assertEqual(smod.summary(),json.loads((ROOT/'case-studies/segmented-stop-summary.json').read_text(encoding='utf-8-sig')))
if __name__=='__main__':unittest.main()
