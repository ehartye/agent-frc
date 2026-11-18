import pathlib,json,hashlib,re,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class UncertaintyTests(unittest.TestCase):
 def test_receipt_pins_and_inventory(self):
  for name,count in [('catcher-native-sweep-uncertainty.json',30),('catcher-sensor-uncertainty.json',90)]:
   r=json.loads((ROOT/'case-studies'/name).read_text());self.assertEqual(len(r.get('cases',r.get('observations'))),count)
   self.assertIsNone(r['calibration']);self.assertEqual(r['engineeringAcceptance'],'blocked')
   for path,pin in r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/path).read_text(encoding='utf-8-sig').encode()).hexdigest())
 def test_native_pose_counterexamples(self):
  r=json.loads((ROOT/'case-studies/catcher-native-sweep-uncertainty.json').read_text());rows={(c['season'],c['pose']):c for c in r['cases']}
  c=rows[(2025,'yaw3-tight-margin')];self.assertTrue(c['nominalOneDimensionalGateGuardWouldAllow']);self.assertGreater(c['intersectionVolumesMm3']['gate-sweep'],1)
  self.assertLess(c['intersectionVolumesMm3']['left-guide'],1e-5);self.assertLess(c['intersectionVolumesMm3']['right-guide'],1e-5)
  c=rows[(2024,'pitch10')];self.assertGreater(c['leftClosedPadGapMm'],2);self.assertGreater(c['rightClosedPadGapMm'],2)
  for year in (2024,2025,2026):
   c=rows[(year,'lateral5')];self.assertGreater(c['leftClosedPadGapMm'],4.9);self.assertGreater(c['intersectionVolumesMm3']['right-pad-sweep'],1)
   self.assertTrue(all(v<1e-5 for v in rows[(year,'nominal')]['intersectionVolumesMm3'].values()))
 def test_sensor_matrix_and_post_hold_fault(self):
  r=json.loads((ROOT/'case-studies/catcher-sensor-uncertainty.json').read_text());rows=[dict(re.findall(r'(\w+)=([^,\] ]+)',s)) for s in r['observations']]
  matrix={tuple(x[k] for k in ['year','arrivalShift','tailShift','delayMs']):x for x in rows if x['fault']=='0'}
  self.assertEqual(len(matrix),81);self.assertEqual(sum(x['captured']=='true' for x in matrix.values()),63)
  for x in rows:
   self.assertLess(float(x['maxEnergyResidual']),1e-8)
   if x['fault'] in ('7','8'):
    self.assertEqual(x['catcherState'],'FAULT');self.assertEqual(x['captured'],'false');self.assertEqual(x['locallyReleased'],'false')
   if x['fault']=='7':self.assertEqual(x['enteredHold'],'true')
  self.assertEqual(sum(x['fault']=='7' for x in rows),3);self.assertEqual(sum(x['fault']=='8' for x in rows),3)
if __name__=='__main__':unittest.main()
