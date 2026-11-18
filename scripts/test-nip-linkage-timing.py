import pathlib,json,math,unittest,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/nip-linkage-timing.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class NipTimingTests(unittest.TestCase):
 def test_exact_report_and_dependencies(self):
  r=m.report();self.assertEqual(r,json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text()));self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS));self.assertEqual(len(r['nativeSweeps']),36)
 def test_longer_belt_envelope_not_hardware_acceptance(self):
  r=json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text())
  for x in r['layoutCases']:self.assertEqual(x['positionEnvelopePass'],x['beltPitchLengthMm']==1000);self.assertIsNone(x['installedGuideAndClampFit']);self.assertAlmostEqual(x['pulleyCenterDistanceM'],(x['beltPitchLengthMm']-100)/2000)
 def test_drive_independent_arithmetic(self):
  r=json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text())
  for x in r['driveCases']:
   a=4*.06/x['durationS']**2;radius=.1/(2*math.pi);force=2*x['eachCarriageMassKg']*a+abs(x['imbalanceKg'])*9.80665+10;demand=force*radius/(9*.7)+x['assumedRotorEquivalentInertiaKgM2']*a/radius*9;self.assertAlmostEqual(demand,x['peakDemandNm']);self.assertIsNone(x['nipForceAfterContact']);self.assertFalse(x['necessaryFreeMotionEnvelopePass']) if x['durationS']==.02 else None
 def test_interval_bounds_and_goal_gate(self):
  r=json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text())
  for x in r['nativeSweeps']:
   self.assertFalse(x['goalChainAccepted']);self.assertIsNone(x['contactValidity'])
   for a,b,i in zip(x['samples'],x['samples'][1:],x['intervals']):self.assertAlmostEqual(i['distanceLowerBoundM'],min(a['nativeMinDistanceM'],b['nativeMinDistanceM'])-math.hypot(x['prescribedSpeedMps'],.12/x['closureDurationS'])*(b['timeS']-a['timeS'])/2)
 def test_fuel_moving_misses_closing_nip(self):
  r=json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text())
  for x in r['nativeSweeps']:
   if x['season']==2026 and x['prescribedSpeedMps']<0:self.assertTrue(x['certifiedNoContact']);self.assertFalse(x['positiveIntersectionWitness'])
   if x['prescribedSpeedMps']==0:self.assertTrue(x['positiveIntersectionWitness'])
 def test_fuel_distance_independent_circle_formula(self):
  r=json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text())
  for sweep in r['nativeSweeps']:
   if sweep['season']!=2026:continue
   for x in sweep['samples']:
    distance=max(0,math.hypot(x['bodyCenterXM']-.3496,.075+.0381-.001+x['retractionEachSideM'])-.075-.0381);self.assertAlmostEqual(x['nativeMinDistanceM'],distance,places=7)
 def test_actual_exit_state_not_reset(self):
  r=json.loads((ROOT/'case-studies/nip-linkage-timing.json').read_text());source={int(x['year']):x for x in json.loads((ROOT/'case-studies/handoff-continuity-report.json').read_text())['cases'] if x['initialSpeed']==.2}
  for x in r['nativeSweeps']:
   if x['prescribedSpeedMps']<0:
    e=source[x['season']];self.assertEqual(x['sourcePositionM'],e['sourceX']);self.assertEqual(x['sourceTimeS'],e['sourceTime']);self.assertEqual(x['prescribedSpeedMps'],e['sourceV'])
    for s in x['samples']:self.assertAlmostEqual(s['absolutePlantTimeS'],e['sourceTime']+s['timeS']);self.assertAlmostEqual(s['bodyCenterXM'],e['sourceX']+e['sourceV']*s['timeS'])
 def test_invalid_numeric_domain(self):
  for x in (True,float('nan'),float('inf'),'1'):
   with self.assertRaises(ValueError):m.fraction(x)
   with self.assertRaises(ValueError):m.drive(x,.2,0,12,0)
  with self.assertRaises(ValueError):m.drive(.25,.2,.5,12,0)
if __name__=='__main__':unittest.main()
