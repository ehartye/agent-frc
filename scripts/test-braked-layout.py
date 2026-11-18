import pathlib,importlib.util,json,hashlib,math,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('l',ROOT/'scripts/braked-gate-layout.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class LayoutTests(unittest.TestCase):
 def setUp(self):self.r=json.loads((ROOT/'case-studies/braked-gate-layout.json').read_text())
 def test_full_dependency_closure(self):
  expected={'scripts/braked-gate-layout.py','scripts/braked-gate-screen.py','scripts/time-resolved-catcher-closure.py','scripts/native-catcher-sweep.py','scripts/native-catcher-envelopes.py','scripts/pose-clearance-contract.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py','case-studies/braked-layout-evidence.json','case-studies/braked-gate-evidence.json'}
  self.assertEqual(set(self.r['sourceCodeSha256']),expected)
  for p,h in self.r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
  self.assertEqual(self.r['geometryEvidenceSha256'],m.n.p.evidence())
 def test_pitch_layout(self):
  self.assertAlmostEqual(self.r['pitchRadiusMm'],100/math.tau)
  for c in self.r['layoutCases']:self.assertEqual(2*c['pulleyCenterDistanceMm']+100,800);self.assertEqual(c['usableStraightTravelMm'],270);self.assertGreater(c['remainingTravelMm'],0)
 def test_profile(self):
  self.assertEqual([m.fraction(t,.25) for t in [0,.125,.25]],[0,.5,1])
  for t in [-1,1,float('nan')]:
   with self.assertRaises(ValueError):m.fraction(t,.25)
 def test_native_intervals_and_collisions(self):
  self.assertEqual(len(self.r['nativeCases']),18);self.assertEqual(sum(c['status']=='collision-witness' for c in self.r['nativeCases']),6)
  for c in self.r['nativeCases']:
   if c['status']=='certified-2mm-clearance':
    for a,b in zip(c['samples'],c['samples'][1:]):self.assertGreaterEqual(min(a['distanceMm'],b['distanceMm'])-c['relativeSpeedUpperBoundMmS']*(b['timeS']-a['timeS'])/2,2-1e-9)
   else:self.assertEqual(c['pieceVelocityMmS'],-400);self.assertGreater(max(x['intersectionVolumeMm3'] for x in c['witness']),1e-5)
 def test_drive_cases_regenerate_and_failures_persist(self):
  for c in self.r['driveCases']:
   actual=m.drive.screen(c['liftM'],c['durationS'],c['gateMassKg'],c['voltageV'],c['assumedRotorEquivalentInertiaKgM2'],radius=self.r['pitchRadiusMm']/1000);self.assertEqual(actual,{k:v for k,v in c.items() if k!='season'})
  for t,count in [(.02,0),(.25,22),(.4,24)]:self.assertEqual(sum(c['necessaryDriveEnvelopePass'] for c in self.r['driveCases'] if c['durationS']==t),count)
 def test_poweroff_sensitivity_not_safe(self):
  c=next(c for c in self.r['arrestSensitivity'] if c['season']==2026 and c['assumedDelayS']==.04);self.assertGreater(c['unpoweredFreeGravityTravelMm'],60);self.assertEqual(self.r['engineeringAcceptance'],'blocked')
 def test_exact_belt_variant_and_cad_pin(self):
  e=json.loads((ROOT/'case-studies/braked-layout-evidence.json').read_text());self.assertEqual(e['belt']['part'],'TTB-0156');self.assertEqual(e['belt']['designation'],'800-5M-09');self.assertEqual(self.r['guideMetadata']['sha256'],e['guideCandidate']['nativeCadSha256']);self.assertEqual(self.r['guideMetadata']['solidCount'],70)
if __name__=='__main__':unittest.main()
