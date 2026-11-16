import unittest,pathlib,json,hashlib,importlib.util,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('pair',ROOT/'scripts/maxlift-fastened-pair.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
EXPECTED={'scripts/maxlift-fastened-pair.py','scripts/maxlift-roller-contact.py','scripts/maxlift-corner-mating.py','scripts/retained-pregrip-fit.py','case-studies/maxlift-corner-evidence.json','case-studies/maxlift-fastened-pair-evidence.json'}
class PairTests(unittest.TestCase):
 def receipt(self):return json.loads((ROOT/'case-studies/maxlift-fastened-pair.json').read_text())
 def test_dependency_closure(self):
  r=self.receipt();self.assertEqual(set(m.PINS),EXPECTED);self.assertEqual(set(r['sourceCodeSha256']),EXPECTED)
  for p,h in r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
 def test_fresh_native(self):self.assertEqual(m.report(ROOT/'examples/java-2026-sim/build/maxlift-mating-sources'),self.receipt())
 def test_mutated_source_rejected(self):
  name=next(iter(self.receipt()['sourceRecords']))
  with tempfile.TemporaryDirectory() as td:
   (pathlib.Path(td)/(name+'.STEP')).write_bytes(b'not the pinned native source')
   with self.assertRaisesRegex(ValueError,'revision mismatch'):m.load(td)
 def test_opposition_and_tracks(self):
  r=self.receipt();self.assertLess(r['blockBlockCommonMm3'],1e-8);self.assertGreater(r['blockBlockDistanceMm'],8);self.assertEqual(len(r['witnesses']),8)
  for w in r['witnesses']:
   self.assertEqual(len(w['sourceFaceInvariants']),2);self.assertLess(w['pointToActualCylinderMm'],1e-8);self.assertLess(w['pointToNativeTubeMm'],1e-8);self.assertAlmostEqual(w['continuous60mmTrackLengthMm'],60,places=6)
 def test_escape_and_overseat_controls(self):
  r=self.receipt();a,b,c=r['escapeControls'];self.assertLess(a['secondBlockRailCommonMm3'],1e-8);self.assertGreater(b['secondBlockRailCommonMm3'],.01);self.assertGreater(c['secondBlockRailCommonMm3'],200);self.assertGreater(r['overseat0p1mmControlMm3'],4)
 def test_six_screws_thread_proxy_not_false_fit(self):
  r=self.receipt();self.assertEqual(len(r['screws']),6)
  for s in r['screws']:
   self.assertLess(s['blockCommonMm3'],1e-8);self.assertLess(s['tubeCommonMm3'],1e-8);self.assertLess(s['railCommonMm3'],1e-8);self.assertAlmostEqual(s['capThreadProxyCommonMm3'],27.8489065390883,places=6)
  a=r['screwStack'];self.assertAlmostEqual(a['headSeatYmm']-a['tipYmm'],12.7);self.assertAlmostEqual(a['blockClearanceWallMm']+a['capProxyWallThicknessMm']+a['tipExtensionIntoCavityMm'],12.7)
 def test_assumptions_not_acceptance(self):
  r=self.receipt();self.assertIsNone(r['threadEngagement']);self.assertIsNone(r['loadAcceptance']);self.assertIsNone(r['preload']);self.assertEqual(r['engineeringAcceptance'],'blocked');a=r['simulationContract'];self.assertTrue(a['available']);self.assertFalse(a['calibrated']);self.assertFalse(a['backWebAttached']);self.assertFalse(a['secondSeparatedStationIncluded']);self.assertFalse(a['longitudinalStopsIncluded'])
if __name__=='__main__':unittest.main()
