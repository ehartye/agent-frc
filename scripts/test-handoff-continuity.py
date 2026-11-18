import unittest,pathlib,importlib.util,json,math,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/handoff-continuity-report.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class HandoffTests(unittest.TestCase):
 def test_receipt(self):
  r=m.report();self.assertEqual(r,json.loads((ROOT/'case-studies/handoff-continuity-report.json').read_text()));self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS));self.assertEqual(len(r['cases']),9)
 def test_world_position_velocity_energy(self):
  for c in m.report()['cases']:
   self.assertAlmostEqual(c['sourceX']-c['length'],c['finalWorldX'],places=12);self.assertLess(c['sourceV'],0);self.assertLess(c['finalWorldV'],0);self.assertAlmostEqual(.25*c['sourceV']**2,c['inheritedEnergy'],places=12);self.assertLess(abs(c['finalEnergyResidual']),2e-5);self.assertGreater(c['finalTime'],c['sourceTime'])
 def test_independent_force_solution(self):
  for c in m.report()['cases']:
   if c['year']!=2025:self.assertAlmostEqual(-c['finalWorldV'],math.sqrt(c['sourceV']**2+2*(2*.8*15/.5)*c['length']),places=8)
 def test_upstream_and_early_body_constraints(self):
  for c in m.report()['cases']:
   hx={2024:.1778,2025:.1508125,2026:.075}[c['year']];radius={2024:.0508,2025:.0254,2026:.0381}[c['year']];self.assertAlmostEqual(c['upstreamGap'],c['finalWorldX']-hx-radius);self.assertGreater(c['upstreamGap'],.002);self.assertTrue(.4-hx<c['sourceX']);self.assertTrue(c['heldBodyReachesGuideEntrance']);self.assertFalse(c['fixedNipIsolationVerified'])
 def test_no_target_fabrication(self):
  for c in m.report()['cases']:self.assertEqual(c['verticalVelocityMps'],0);self.assertIsNone(c['installedTargetTransform']);self.assertIsNone(c['nominalComponentPoints']);self.assertEqual(c['bodyMassKg'],.5)
 def test_bad_records(self):
  line=json.loads((ROOT/'case-studies/catcher-powered-handoff.json').read_text())['observations'][0]
  for bad in [line+' extra=1',line.replace('year=2024','year=2024.5'),line.replace('year=2024','year=NaN'),line.replace('exited=true','exited=false'),line.replace(' Joined[',' Joined[sourceTime=1, ')]:
   with self.assertRaises(ValueError):m.parse(bad)
 def test_stale_native_input(self):
  old=m.ROOT;r=json.loads((ROOT/'case-studies/catcher-powered-handoff.json').read_text())
  try:
   with tempfile.TemporaryDirectory() as d:
    m.ROOT=pathlib.Path(d)
    for p in set(m.PINS)|set(m.runner.CODE):
     dest=m.ROOT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((ROOT/p).read_bytes())
    p=m.ROOT/'examples/java-2026-sim/src/main/java/org/agentfrc/lesson/PoweredGuidePlant.java';p.write_text(p.read_text()+'\n// mutated\n')
    with self.assertRaisesRegex(ValueError,'stale native input'):m.report()
  finally:m.ROOT=old
if __name__=='__main__':unittest.main()
