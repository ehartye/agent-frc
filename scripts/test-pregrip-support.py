import pathlib,json,unittest,importlib.util,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('m','scripts/note-overhung-support.py');runner=load('runner','scripts/run-pregrip-supervisor.py');CAD=ROOT/'examples/java-2026-sim/build/support-sources'
class SupportTests(unittest.TestCase):
 def test_fresh_both_candidates(self):
  for drop,file in [(0,'note-overhung-support-initial.json'),(6.03225,'note-overhung-support.json')]:
   r=m.report(CAD,drop);self.assertEqual(r,json.loads((ROOT/'case-studies'/file).read_text()));self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS));self.assertEqual(len(r['pairChecks'])+r['aabbCulledPairCount'],r['partCount']*(r['partCount']-1)//2)
 def test_collar_collision_not_hidden(self):
  a=json.loads((ROOT/'case-studies/note-overhung-support-initial.json').read_text());b=json.loads((ROOT/'case-studies/note-overhung-support.json').read_text());self.assertEqual(len(a['unexpectedIntersections']),1);self.assertEqual(set(a['unexpectedIntersections'][0]['parts']),{'socketUpper','lowerCollar'});self.assertGreater(a['unexpectedIntersections'][0]['intersectionMm3'],70);self.assertEqual(b['unexpectedIntersections'],[])
 def test_threads_and_retainer_are_not_acceptance(self):
  r=json.loads((ROOT/'case-studies/note-overhung-support.json').read_text());self.assertEqual(sum(x['classification']=='thread-proxy-not-engagement-proof' for x in r['pairChecks']),2);self.assertGreater(r['reversedRetainerControlMm3'],100);self.assertIsNone(r['axialContactAndPreload']);self.assertIsNone(r['loadAcceptance']);self.assertIsNone(r['railAttachment'])
 def test_swept_bounds_cover_every_component(self):
  r=json.loads((ROOT/'case-studies/note-overhung-support.json').read_text())
  for x in r['sweptChecks']:
   b=r['partBoundsMm'][x['part']];s=x['inflatedSweptBoundsMm'];self.assertTrue(x['envelopePass'])
   for i in range(3):self.assertAlmostEqual(s[i],b[i]-4,places=6);self.assertAlmostEqual(s[i+3],b[i+3]+(64 if i==1 else 4),places=6)
 def test_shaft_candidate_difference_and_below_datum_scope(self):
  e=json.loads((ROOT/'case-studies/note-overhung-support-evidence.json').read_text())['shaftCandidate'];self.assertEqual(e['drawingMaxDiameterMm'],13.74);self.assertEqual(e['analysisEnvelopeCornerDiameterMm'],13.75);r=json.loads((ROOT/'case-studies/note-overhung-support.json').read_text());self.assertLess(r['shaftEnvelopeMm'][0],0);self.assertAlmostEqual(r['shaftEnvelopeMm'][1]-r['shaftEnvelopeMm'][0],152.4)
 def test_virtual_protocol_receipt_bound(self):
  r=json.loads((ROOT/'case-studies/virtual-pregrip-supervisor.json').read_text());self.assertEqual(set(r['tests']),runner.TESTS);self.assertEqual(len(r['tests']),8);self.assertEqual(set(r['sourceCodeSha256']),set(runner.CODE));self.assertFalse(r['physicalRobotIoExecuted']);self.assertFalse(r['simulatedWpilibIoExecuted']);self.assertTrue(r['virtualLogicOnly'])
  for p,h in r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
 def test_no_standalone_rail_claim(self):
  r=json.loads((ROOT/'case-studies/pregrip-rail-interface.json').read_text());self.assertFalse(r['nativeMatingExecuted']);self.assertFalse(r['continuous60mmEngagementProven']);self.assertIsNone(r['attachmentToNewWeb'])
if __name__=='__main__':unittest.main()
