import unittest,pathlib,json,math,importlib.util,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/retained-pregrip-fit.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
CAD=ROOT/'examples/java-2026-sim/build/pregrip-sources'
class PregripTests(unittest.TestCase):
 def test_fresh_native_replay_and_pins(self):
  r=m.report(CAD);self.assertEqual(r,json.loads((ROOT/'case-studies/retained-pregrip-fit.json').read_text()));self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS));self.assertEqual(len(r['wheelRecords']),6)
 def test_retained_center_floor_and_pad_replacement(self):
  r=json.loads((ROOT/'case-studies/retained-pregrip-fit.json').read_text())
  for x in r['wheelRecords']:self.assertEqual(x['bodyCenterMm'][0],400);self.assertEqual(x['wheelCenterMm'][0],400);self.assertGreater(x['nativeFloorDistanceMm'],10);self.assertGreater(x['nativeBodyIntersectionMm3'],1);self.assertGreater(x['nativeOldPadIntersectionMm3'],100);self.assertIsNone(x['forceValidity'])
 def test_conservative_sweep_and_slot_scope(self):
  r=json.loads((ROOT/'case-studies/retained-pregrip-fit.json').read_text())
  for x in r['sweptEnvelopes']:
   self.assertEqual(x['envelopePass'],x['slotHeightMm']==40 or x['season']==2025);self.assertTrue(x['padRemoved']);self.assertIsNone(x['hardwareAcceptance'])
   for part in ('floor','gate','bumper'):self.assertEqual(x['obstructionVolumesMm3'][part],0)
 def test_box_contains_native_wheel_over_stroke(self):
  r=json.loads((ROOT/'case-studies/retained-pregrip-fit.json').read_text())
  for rec in r['wheelRecords']:
   box=next(x['conservativeSweptBoxMm'] for x in r['sweptEnvelopes'] if x['season']==rec['season'] and x['side']==rec['side'] and x['slotHeightMm']==40);raw=rec['nativeUnrotatedBoundsMm'];cx,cy,cz=rec['wheelCenterMm']
   # Rotation -90 degrees about Y maps native X->Z and native Z->-X.
   for k in range(101):
    centerY=cy+rec['side']*60*k/100;lo=[cx-raw[5],centerY+raw[1],cz+raw[0]];hi=[cx-raw[2],centerY+raw[4],cz+raw[3]]
    for i in range(3):self.assertLessEqual(box[i],lo[i]-4+1e-6);self.assertGreaterEqual(box[i+3],hi[i]+4-1e-6)
 def test_vertical_floor_obstruction_preserved(self):
  for x in json.loads((ROOT/'case-studies/retained-pregrip-fit.json').read_text())['verticalNipCounterexamples']:self.assertGreater(x['previousBottomBankFloorIntersectionMm3'],1000)
 def test_belt_pitch_envelope_is_not_installation(self):
  for x in json.loads((ROOT/'case-studies/retained-pregrip-fit.json').read_text())['beltLayouts']:
   self.assertAlmostEqual(x['pulleyCenterDistanceMm'],(x['pitchLengthMm']-100)/2);self.assertGreater(x['nominalPositionMarginMm'],0);self.assertIsNone(x['installedLinkageFit'])
 def test_changed_cad_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   (pathlib.Path(d)/'2024-wheel.step').write_bytes(b'not pinned CAD')
   with self.assertRaisesRegex(ValueError,'CAD revision mismatch'):m.report(d)
if __name__=='__main__':unittest.main()
