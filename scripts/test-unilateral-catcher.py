import pathlib,json,hashlib,importlib.util,unittest,random
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('m',ROOT/'scripts/unilateral-catcher-study.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class UnilateralTests(unittest.TestCase):
 def test_stable_discrete_gradient(self):
  for a in [-.1,0,.01,.05,.3]:
   for b in [-.1,0,.01,.05,.3]:
    self.assertAlmostEqual(m.average_spring(a,b,200,20)*(b-a),m.potential(b,200,20)-m.potential(a,200,20),places=12)
 def test_first_touch_has_no_damping_jump(self):
  x=-.0004844042918685131;v=.2476912291651155
  xx,vv,loss,ff,fr,fh=m.step(x,v,.002,False,50)
  self.assertGreaterEqual(loss,-1e-12);self.assertLess(ff,20*v);self.assertEqual(fr,0);self.assertEqual(fh,0)
 def test_caps_and_passivity(self):
  rng=random.Random(1)
  for _ in range(100):
   x=rng.uniform(-.06,.06);v=rng.uniform(-2,2);cap=rng.choice([10,20,50])
   xx,vv,loss,ff,fr,fh=m.step(x,v,.002,True,cap,10)
   self.assertGreaterEqual(loss,-1e-9);self.assertTrue(0<=ff<=cap);self.assertTrue(0<=fr<=cap);self.assertLessEqual(abs(fh),2)
 def test_gate_guards(self):
  self.assertTrue(m.gate_can_close(0));self.assertFalse(m.gate_can_close(-.019));self.assertFalse(m.gate_can_close(-.025))
  self.assertTrue(m.gate_can_release(-.01,50));self.assertFalse(m.gate_can_release(-.025,50))
 def test_invalid(self):
  for value in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):m.simulate(value,.02,50)
 def test_evidence_and_negative_controls(self):
  r=json.loads((ROOT/'case-studies/unilateral-catcher-study.json').read_text());self.assertEqual(len(r['cases']),45);self.assertEqual(len(r['sensitivity']),48)
  self.assertEqual(r['counts']['gate-fast']['capture'],0);self.assertEqual(r['counts']['gated-damped-pocket']['capture'],9);self.assertEqual(r['counts']['gated-damped-pocket']['release'],9)
  for case in r['cases']+r['sensitivity']:self.assertLess(case['maxEnergyResidualJ'],1e-8)
  for case in r['cases']:
   if case['topology']=='gate-delayed':self.assertTrue(case['gateClosureBlocked'])
   if case['provisionalCapture']:self.assertGreater(case['finalPositionM'],-.1)
  for name,pin in r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
 def test_native_envelope_receipt(self):
  r=json.loads((ROOT/'case-studies/native-catcher-envelopes.json').read_text());self.assertEqual(set(r['cases']),{'2024','2025','2026'})
  for name,pin in r['sourceCodeSha256'].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  for c in r['cases'].values():
   self.assertGreater(c['minPieceToUpstreamWheelEnvelopeXGapAt100mmRearReleaseMm'],0)
   for name,volume in c['booleanIntersectionVolumesMm3'].items():
    if name.endswith('positive-control'):self.assertGreater(volume,1)
    else:self.assertLessEqual(volume,1e-5)
if __name__=='__main__':unittest.main()
