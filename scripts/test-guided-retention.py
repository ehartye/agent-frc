import pathlib,importlib.util,json,math,hashlib,unittest,tempfile,shutil,copy
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('g',ROOT/'scripts/guided-gravity-retention.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class GuidedRetentionTests(unittest.TestCase):
 def test_ideal_drop_time_is_not_twenty_ms(self):
  for h in [70.8,134.3,170]:
   r=m.drop(h,.2,0,0);self.assertAlmostEqual(r['closureSeconds'],math.sqrt(2*h/1000/9.80665));self.assertGreater(r['closureSeconds'],.02);self.assertLess(r['closureSeconds'],.25)
 def test_side_load_friction_can_stall_or_exceed_deadline(self):
  self.assertTrue(m.drop(170,.2,.05,50)['stalled']);self.assertGreater(m.drop(170,.5,.05,50)['closureSeconds'],.25)
 def test_invalid(self):
  for v in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):m.drop(v,.2,0,0)
  with self.assertRaises(ValueError):m.drop(170,0,0,0)
 def test_native_certificate_pins_and_interval_reconstruction(self):
  r=json.loads((ROOT/'case-studies/guided-gravity-retention.json').read_text());self.assertEqual(len(r['nativeCases']),9);self.assertEqual(len(r['timingCases']),36)
  m.verify_source_pins(r)
  self.assertEqual(set(r['sourceCodeSha256']), {'scripts/guided-gravity-retention.py','scripts/time-resolved-catcher-closure.py','scripts/native-catcher-sweep.py','scripts/native-catcher-envelopes.py','scripts/pose-clearance-contract.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py','case-studies/guided-retention-evidence.json'})
  for name,h in r['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
  for c in r['nativeCases']:
   if c['status']=='certified-2mm-clearance':
    for a,b in zip(c['samples'],c['samples'][1:]):self.assertGreaterEqual(min(a['distanceMm'],b['distanceMm'])-c['relativeSpeedUpperBoundMmS']*(b['timeS']-a['timeS'])/2,2-1e-9)
   else:self.assertEqual(c['status'],'collision-witness');self.assertGreater(max(v['intersectionVolumeMm3'] for v in c['witness']),1e-5)
 def test_rebound_counterexamples_and_acceptance_gate(self):
  r=json.loads((ROOT/'case-studies/guided-gravity-retention.json').read_text());self.assertEqual(sum(c['status']=='collision-witness' for c in r['nativeCases']),3);self.assertIsNone(r['calibration']);self.assertEqual(r['engineeringAcceptance'],'blocked')
  for c in r['nativeCases']:
   if c['pieceVelocityMmS']==-400:self.assertEqual(c['status'],'collision-witness')
 def test_exact_override_compatibility(self):
  e=json.loads((ROOT/'case-studies/guided-retention-evidence.json').read_text());self.assertEqual(e['candidate']['overrideMount'],'R4-EM-72');self.assertEqual(e['candidate']['striker'],'R4-90-511-20')
 def test_timing_rows_regenerate(self):
  r=json.loads((ROOT/'case-studies/guided-gravity-retention.json').read_text())
  for c in r['timingCases']:
   actual=m.drop(c['heightMm'],c['massKg'],c['assumedFrictionCoefficient'],c['assumedGuideSideLoadN']);self.assertEqual(actual,{k:v for k,v in c.items() if k!='season'})
 def test_missing_dependency_rejected(self):
  r=json.loads((ROOT/'case-studies/guided-gravity-retention.json').read_text())
  for name in m.SOURCE_DEPENDENCIES:
   bad=copy.deepcopy(r);del bad['sourceCodeSha256'][name]
   with self.assertRaises(ValueError):m.verify_source_pins(bad)
 def test_geometry_mutation_rejected_without_touching_workspace(self):
  r=json.loads((ROOT/'case-studies/guided-gravity-retention.json').read_text())
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp)
   for name in m.SOURCE_DEPENDENCIES:
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target)
   m.verify_source_pins(r,root)
   p=root/'scripts/pose-clearance-contract.py';old=p.read_text();changed=old.replace('2024:(177.8,177.8)','2024:(187.8,177.8)');self.assertNotEqual(old,changed);p.write_text(changed)
   with self.assertRaises(ValueError):m.verify_source_pins(r,root)
if __name__=='__main__':unittest.main()
