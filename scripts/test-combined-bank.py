import unittest,pathlib,json,hashlib,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
class CombinedTests(unittest.TestCase):
 def setUp(self):self.r=json.loads((ROOT/'case-studies/2026/native-combined-bank.json').read_text(encoding='utf-8-sig'))
 def test_pair_accounting(self):
  r=self.r;self.assertEqual(r['partCount'],42);self.assertEqual(r['pairCount'],861)
  self.assertEqual(r['boundingBoxCulled']+len(r['pairEvidence']),861)
  reused=sum('reusedRigidTranslationOf' in x for x in r['pairEvidence'])
  self.assertEqual(reused,r['equivalenceReused']);self.assertEqual(reused,55)
  self.assertEqual(r['nativeCommonCalls'],len(r['pairEvidence'])-reused)
 def test_recompute_bounding_box_separation(self):
  bs=list(self.r['instanceBoundsMm'].values());n=0
  for i,lo in enumerate(bs):
   for hi in bs[i+1:]:n+=any(lo[j+3]<hi[j]-1e-6 or hi[j+3]<lo[j]-1e-6 for j in range(3))
  self.assertEqual(n,self.r['boundingBoxCulled'])
 def test_recorded_outcome_not_replay(self):
  r=self.r;self.assertEqual(r['unexpectedOverlaps'],[]);self.assertEqual(len(r['threadProxyOverlaps']),12)
  self.assertEqual(r['engineeringAcceptance'],'blocked')
  self.assertFalse(r['vendorAssetsRetained'])
 def test_code_pins(self):
  for name,pin in self.r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/'scripts'/name).read_text(encoding='utf-8-sig').encode('utf-8')).hexdigest(),pin)
if __name__=='__main__':unittest.main()
