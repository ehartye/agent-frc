import pathlib,importlib.util,json,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('b',ROOT/'scripts/braked-gate-screen.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class BrakeTests(unittest.TestCase):
 def test_twenty_ms_rejected(self):
  rows=[c for c in m.report()['cases'] if c['durationS']==.02];self.assertEqual(len(rows),24);self.assertFalse(any(c['necessaryDriveEnvelopePass'] for c in rows))
 def test_brownout_inertia_counterexample(self):
  self.assertTrue(m.screen(.17,.25,.5,9,0)['necessaryDriveEnvelopePass']);self.assertFalse(m.screen(.17,.25,.5,9,1e-5)['necessaryDriveEnvelopePass'])
 def test_triangle_integrates_to_lift(self):
  c=m.screen(.17,.25,.5,12,1e-5);self.assertAlmostEqual(.5*c['peakSpeedMps']*.25,.17);self.assertAlmostEqual(c['peakAccelMps2']*.125,c['peakSpeedMps'])
 def test_inertia_demands_more_torque(self):self.assertGreater(m.screen(.17,.25,.5,12,1e-5)['peakDemandNm'],m.screen(.17,.25,.5,12,0)['peakDemandNm'])
 def test_invalid(self):
  for v in [True,float('inf'),float('nan'),'1',-1]:
   with self.assertRaises(ValueError):m.screen(v,.25,.5,12,0)
 def test_receipt_and_dependency_set(self):
  r=json.loads((ROOT/'case-studies/braked-gate-screen.json').read_text());self.assertEqual(r,m.report());self.assertEqual(len(r['cases']),72);self.assertEqual(set(r['sourceCodeSha256']),{'scripts/braked-gate-screen.py','case-studies/braked-gate-evidence.json'})
 def test_motor_not_mislabeled_controller(self):
  e=json.loads((ROOT/'case-studies/braked-gate-evidence.json').read_text());self.assertEqual(e['candidate']['controller'],'REV-11-2158');self.assertEqual(set(e['seasonRuleScreen']),{'2024','2025','2026'});self.assertEqual(e['engineeringAcceptance'],'blocked')
if __name__=='__main__':unittest.main()
