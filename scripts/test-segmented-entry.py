import pathlib,json,hashlib,unittest,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('entry',ROOT/'scripts/coral-entry-geometry.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
class EntryReceiptTests(unittest.TestCase):
 def test_source_and_geometry_pins(self):
  r=json.loads((ROOT/'case-studies/segmented-entry-coupling.json').read_text())
  for name,pin in r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  self.assertEqual(r['geometryEvidenceSha256'],g.p.evidence())
  self.assertEqual(len(r['tests']),6);self.assertEqual(len(r['observations']),15)
  self.assertIsNone(r['calibration']);self.assertEqual(r['engineeringAcceptance'],'blocked')
 def test_coral_report_regenerates(self):
  r=json.loads((ROOT/'case-studies/coral-entry-geometry.json').read_text(encoding='utf-8-sig'))
  self.assertEqual(r,g.report())
 def test_compressed_end_interior_witness_in_real_annulus(self):
  # Strict interior witness near outer shell, not a point in a fictitious filled bore.
  import math
  for x in [-165,0,165]:
   self.assertTrue(g.coral(x,5)['overlap'])
   px=max(x-150.8125,min(0,x+150.8125))
   if x<0:px-=.001
   if x>0:px+=.001
   py=3.176;pz=57.15+math.sqrt(57.15**2-py**2)-.001
   self.assertLess(abs(px-x),150.8125)
   self.assertGreater(math.hypot(py,pz-57.15),50.8)
   self.assertLess(math.hypot(py,pz-57.15),57.15)
   self.assertLess(abs(py-9.525),6.35)
   self.assertLess(math.hypot(px,pz-134.7),25.4)
if __name__=='__main__':unittest.main()
