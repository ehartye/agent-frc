import pathlib,importlib.util,unittest,math,json,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('m',ROOT/'scripts/capture-topology-study.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class CaptureTests(unittest.TestCase):
 def test_midpoint_passive_energy_identity(self):
  for k,c in [(0,0),(0,20),(200,20),(200,0)]:
   for x,v in [(.01,1),(-.03,-.4),(0,0)]:
    xx,vv,d=m.step(x,v,.5,k,c,.001)
    self.assertGreaterEqual(d,0);self.assertAlmostEqual(.25*vv*vv+.5*k*xx*xx+d,.25*v*v+.5*k*x*x,places=12)
 def test_analytic_viscous_asymptote(self):
  r=m.simulate(1.7,0,20,.001,.2)
  self.assertAlmostEqual(r['finalPositionM'],(.5*1.7+.2)/20,places=9)
  self.assertFalse(r['provisionalSampledCapture'])
 def test_open_exit_negative_control(self):
  r=m.simulate(1,0,0,.001,.2)
  self.assertFalse(r['provisionalSampledCapture']);self.assertAlmostEqual(r['finalPositionM'],2.4,places=10)
 def test_cradle_vs_disturbance(self):
  r=m.simulate(1.76,200,20,.001,.2)
  self.assertTrue(r['provisionalSampledCapture']);self.assertLess(r['maxAbsEnergyResidualJ'],1e-10)
 def test_invalid(self):
  for bad in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):m.simulate(bad,200,20,.001)
  for args in [(1,-1,20,.001),(1,200,20,.003),(4,200,20,.001)]:
   with self.assertRaises(ValueError):m.simulate(*args)
 def test_receipt_pins_and_inventory(self):
  r=json.loads((ROOT/'case-studies/capture-topology-study.json').read_text())
  self.assertEqual(len(r['cases']),243);self.assertFalse(r['criterion']['ownerApproved']);self.assertFalse(r['integratedWithController'])
  for name,pin in r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  self.assertEqual(r['upstreamReceiptSha256'],hashlib.sha256((ROOT/'case-studies/segmented-stop-sensitivity.json').read_text(encoding='utf-8-sig').encode()).hexdigest())
  for case in r['cases']:self.assertLess(case['maxAbsEnergyResidualJ'],1e-10)
 def test_critical_oscillator_analytic_envelope(self):
  r=json.loads((ROOT/'case-studies/capture-topology-study.json').read_text());a=r['analyticCradleBound'];v=a['worstSeedSpeedMps']
  # x=v*t*exp(-20t) plus delayed0.4*(t-1)*exp(-20*(t-1)); triangle bound.
  self.assertAlmostEqual(a['positionBoundM'],(v+.4)/(20*math.e),places=14)
  self.assertLess(a['positionBoundM'],.05);self.assertLess(a['preDwellSpeedBoundMps'],.01);self.assertLess(a['postDwellSpeedBoundMps'],.01)
  for case in r['cases']:
   if case['topology']=='guided-compliant-cradle':self.assertLess(case['maxAbsDisplacementM'],a['positionBoundM'])
if __name__=='__main__':unittest.main()
