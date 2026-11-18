import pathlib,json,importlib.util,unittest,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('screen',ROOT/'scripts/retention-component-screen.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ComponentScreenTests(unittest.TestCase):
 def test_report_regenerates(self):self.assertEqual(m.report(),json.loads((ROOT/'case-studies/retention-component-integration.json').read_text()))
 def test_all_direct_drive_candidates_fail_timing(self):
  rows=m.report()['directDriveCases'];self.assertEqual(len(rows),6)
  for r in rows:self.assertTrue(r['strokeRangeFits']);self.assertTrue(r['gate']['exceedsTimeoutEvenAtNoLoad']);self.assertTrue(r['pad']['exceedsTimeoutEvenAtNoLoad']);self.assertFalse(r['directArchitectureAccepted'])
  self.assertAlmostEqual(rows[0]['gate']['optimisticNoLoadTransitSeconds'],70.8/46)
 def test_precision_and_interface_not_promoted(self):
  r=m.report();self.assertGreater(r['loadMeasurement']['idealDirectBridgeNewtonsPerLsb'],2);self.assertAlmostEqual(r['loadMeasurement']['listedStaticErrorTermsLinearSumN'],.0555);self.assertFalse(r['loadMeasurement']['totalSystemErrorBoundEstablished']);self.assertFalse(r['procurementSelected'])
 def test_rigid_release_coupling_does_not_establish_spring_return(self):
  rows=m.report()['retentionPair'];self.assertEqual(len(rows),2)
  for r in rows:self.assertTrue(r['catalogBackdriveExceedsPinSpring']);self.assertFalse(r['automaticPowerOffReengagementEstablished'])
 def test_download_pins_if_evidence_present(self):
  e=json.loads((ROOT/'case-studies/retention-component-evidence.json').read_text());base=ROOT/'examples/java-2026-sim/build/component-evidence'
  for v in e['sources'].values():
   p=base/v['localEvidenceName']
   if p.exists():self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),v['downloadSha256'])
 def test_invalid_inputs(self):
  for x in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):m.screen(x,46,.25)
  for args in [(-1,46,.25),(12,0,.25),(12,46,0)]:
   with self.assertRaises(ValueError):m.screen(*args)
 def test_revision_and_independence_boundaries(self):
  e=json.loads((ROOT/'case-studies/retention-component-evidence.json').read_text());self.assertEqual(e['amplifier']['partInDrawing'],'FSH04461');self.assertTrue(e['amplifier']['allGroundsConnected']);self.assertTrue(e['hall']['threeElementsAreParallelNotIndependent']);self.assertEqual(e['loadCell']['part'],'FSH00103')
if __name__=='__main__':unittest.main()
