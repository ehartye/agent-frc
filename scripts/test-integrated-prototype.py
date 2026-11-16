import unittest,importlib.util,pathlib,json,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/integrated-prototype-targets.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class IntegratedTests(unittest.TestCase):
 def test_report_reproduces(self):self.assertEqual(m.report(),json.loads((ROOT/'case-studies/integrated-prototype-targets.json').read_text()))
 def test_exit_clock_and_zero_injected_feed_energy(self):
  rows=[m.parse(l) for l in json.loads((ROOT/'case-studies/integrated-prototype-run.json').read_text())['observations']]
  self.assertEqual(len(rows),8)
  for r in rows:self.assertEqual(r['time'],r['plantElapsedTimeS']+r['releaseTimeS']);self.assertEqual(r['feedEnergy'],0);self.assertGreater(r['speed'],0)
 def test_target_registration_preserves_velocity(self):
  for c in m.report()['cases']:
   v=c['embeddedExit']['velocityMps'];self.assertAlmostEqual(sum(x*x for x in v),c['sourceExit']['speed']**2,places=10)
 def test_insufficient_launch_energy_is_not_hidden(self):
  for c in m.report()['cases']:
   if c['season'] in (2024,2026):self.assertIsNone(c['targetCenterCrossing'])
   self.assertIsNone(c['nominalComponentPoints'])
 def test_bad_exit_rejected(self):
  line=json.loads((ROOT/'case-studies/integrated-prototype-run.json').read_text())['observations'][0]
  for bad in [line.replace('releaseTime=0.5200000000000002','releaseTime=2'),line.replace('feedEnergy=0.0','feedEnergy=1.0'),line.replace('year=2024','year=2023')]:
   with self.assertRaises(ValueError):m.parse(bad)
 def test_receipt_bound_to_report(self):
  r=m.report();self.assertEqual(r['sourceExecutionReceiptSha256'],hashlib.sha256((ROOT/'case-studies/integrated-prototype-run.json').read_bytes()).hexdigest());self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS))
if __name__=='__main__':unittest.main()
