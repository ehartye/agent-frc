import unittest,importlib.util,pathlib,json,math,copy,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('m',ROOT/'scripts/powered-target-link.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class PoweredLinkTests(unittest.TestCase):
 def test_receipt_and_dependency_set(self):
  r=m.report();self.assertEqual(r,json.loads((ROOT/'case-studies/powered-target-link.json').read_text()));self.assertEqual(set(r['sourceCodeSha256']),set(m.PINS));self.assertEqual(len(r['cases']),18)
 def test_independent_energy_reconstruction(self):
  rows=json.loads((ROOT/'case-studies/powered-guide-run.json').read_text())['observations']
  for line in rows:
   d=m.parse(line);energy=.5*d['massKg']*d['speed']**2+d['inertiaEach']*d['omega']**2+d['massKg']*9.80665*d['x']*math.sin(d['angleRad'])
   self.assertAlmostEqual(energy+d['frictionLoss']-d['motorWork']-d['feedEnergy'],d['energyResidual'],places=9);self.assertAlmostEqual(d['feedEnergy'],.5*d['massKg']*.2**2);self.assertGreater(d['frictionLoss'],0)
 def test_force_limited_exit_independent_solution(self):
  for line in json.loads((ROOT/'case-studies/powered-guide-run.json').read_text())['observations']:
   d=m.parse(line)
   if d['year'] in (2024,2026):
    acceleration=2*.8*15/d['massKg']-9.80665*math.sin(d['angleRad']);expected=math.sqrt(.2**2+2*acceleration*d['guideLengthM']);self.assertAlmostEqual(d['speed'],expected,places=8)
 def test_velocity_and_clock_are_not_reset(self):
  for c in m.report()['cases']:
   r=c['sourceExit'];v=c['embeddedExit']['velocityMps'];self.assertAlmostEqual(sum(x*x for x in v),r['speed']**2,places=12);self.assertAlmostEqual(v[2],r['speed']*math.sin(r['angleRad']))
   if c['targetCenterCrossing']:self.assertAlmostEqual(c['targetCenterCrossing']['absolutePlantTimeS'],r['time']+c['targetCenterCrossing']['timeS'])
 def test_preserves_misses_and_unknowns(self):
  rows=m.report()['cases'];self.assertEqual(sum(c['conditionalWholeSphereThinPlaneClearance'] is True for c in rows),4);self.assertEqual(sum(c['conditionalWholeSphereThinPlaneClearance'] is False for c in rows),2)
  for c in rows:
   for key in ['targetSensorPassage','nominalComponentPoints','wholeNoteClearance','coralInstalledContact']:self.assertIsNone(c[key])
   self.assertIsNone(c['embeddedExit']['installedRegistration'])
 def test_corals_do_not_invent_installed_floor(self):
  for c in m.report()['cases']:
   if c['season']==2025:
    event=c['targetCenterCrossing'];self.assertAlmostEqual(event['timeS'],math.sqrt(.02/9.80665));self.assertAlmostEqual(event['positionM'][0],c['embeddedExit']['positionM'][0]+c['sourceExit']['speed']*event['timeS']);self.assertIsNone(c['coralInstalledContact'])
 def test_fuel_interval_bound_dense(self):
  for c in m.report()['cases']:
   if c['season']!=2026 or not c['conditionalWholeSphereThinPlaneClearance']:continue
   p,v=c['embeddedExit']['positionM'],c['embeddedExit']['velocityMps'];h=72*.0254;radius=.075;times=[next(x['timeS'] for x in m.b.crossing(p,v,(0,0,z),(0,0,1)) if x['normalVelocityMps']<0) for z in (h+radius,h-radius)]
   for k in range(1001):
    q=m.b.position(p,v,times[0]+(times[1]-times[0])*k/1000);self.assertGreaterEqual(m.b.hex_projection_margin(q[0],q[1],41.73*.0254/2,radius),c['projectionMarginM']-1e-12)
 def test_bad_record_and_duplicate_fields(self):
  line=json.loads((ROOT/'case-studies/powered-guide-run.json').read_text())['observations'][0]
  for bad in [line.replace('year=2024','year=2024.5'),line.replace('year=2024','year=NaN'),line.replace('exited=true','exited=false'),line.replace('volts=9.0','volts=9.0 volts=9.0'),line.replace(' Sample[',' Sample[time=1, ')]:
   with self.assertRaises(ValueError):m.parse(bad)
 def test_changed_and_missing_native_pins_denied(self):
  old=m.ROOT;r=json.loads((ROOT/'case-studies/powered-guide-run.json').read_text())
  try:
   with tempfile.TemporaryDirectory() as d:
    m.ROOT=pathlib.Path(d)
    for p in set(m.PINS)|set(m.runner.CODE):
     dest=m.ROOT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes((ROOT/p).read_bytes())
    p=m.ROOT/'examples/java-2026-sim/src/main/java/org/agentfrc/lesson/PoweredGuidePlant.java';p.write_text(p.read_text()+'\n// mutation\n')
    with self.assertRaisesRegex(ValueError,'stale native input'):m.report()
    del r['sourceCodeSha256']['scripts/run-powered-guide.py'];(m.ROOT/'case-studies/powered-guide-run.json').write_text(json.dumps(r))
    with self.assertRaisesRegex(ValueError,'native dependency set'):m.report()
  finally:m.ROOT=old
if __name__=='__main__':unittest.main()
