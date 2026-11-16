import pathlib,json,math,hashlib,unittest,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('r',ROOT/'scripts/season-robot-targets.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class RobotTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.report=json.loads((ROOT/'case-studies/season-robot-targets.json').read_text())
 def test_fresh_report(self):self.assertEqual(json.loads(json.dumps(r.report())),self.report)
 def test_exact_pins(self):
  self.assertEqual(set(self.report['sourceCodeSha256']),set(r.PINS))
  for p,h in self.report['sourceCodeSha256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest(),h)
 def test_actual_pose_not_ideal_goal_used(self):
  for c in self.report['cases']:
   x=c['runtime'];self.assertGreater(abs(x['heading']-(math.pi if x['year']==2024 else 0)),.001);self.assertGreater(x['time'],x['dockTime']);self.assertLess(abs(x['residual']),2e-5);self.assertAlmostEqual(x['speed']**2,x['vx']**2+x['vy']**2+x['vz']**2)
 def test_season_outcomes_and_low_supply_failures(self):
  for c in self.report['cases']:
   x=c['runtime'];self.assertIsNone(c['officialScore'])
   if x['year']==2024:
    self.assertEqual(c['note']['conditionalWholeTorusThinPlaneClearance'],x['volts']==12)
    if x['volts']==12:self.assertGreater(c['note']['conservativeWholeTorusProjectionMarginM'],.017)
   if x['year']==2026:self.assertEqual(c['fuel']['conditionalClearance'],x['volts']==12)
 def test_coral_slow_placement_improves_preserved_baseline(self):
  for c in self.report['cases']:
   x=c['runtime']
   if x['year']!=2025:continue
   self.assertEqual(x['duty'],.04 if x['plan']==1 else .08)
   for stop in c['coral']:self.assertEqual(stop['conditionalContainedStop'],x['plan']==1 and stop['muHypothesis'] in (.3,.5))
 def test_tampered_mount_or_velocity_rejected(self):
  line=json.loads((ROOT/'case-studies/season-robot-run.json').read_text())['observations'][0]
  for key in ['exitX','vx']:
   parts=line.split();bad=' '.join(key+'=0' if part.startswith(key+'=') else part for part in parts)
   with self.assertRaises(ValueError):r.parse(bad)
  with self.assertRaises(ValueError):r.parse(line.replace('year=2024','year=2023'))
 def test_whole_note_adapter_rejects_velocity_reset(self):
  x=self.report['cases'][0]['runtime'];state=dict(positionM=[x['exitX'],x['exitY'],x['exitZ']],velocityMps=[0,0,0])
  with self.assertRaises(ValueError):r.note.evaluate(x,x['exitX'],0,world_state=state)
 def test_readable_handoff_preserves_model_boundaries(self):
  spec=importlib.util.spec_from_file_location('handoff',ROOT/'scripts/prototype-handoff.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h);text=h.render(self.report);self.assertIn('not official scores',text);self.assertIn('preserved baseline',text);self.assertIn('No acquisition',text);self.assertEqual(sum(line.startswith('| 202') for line in text.splitlines()),12)
if __name__=='__main__':unittest.main()
