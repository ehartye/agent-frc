import json,pathlib,importlib.util,tempfile,unittest,math
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('target',ROOT/'scripts/acquiring-robot-targets.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class AcquiredTargets(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.receipt=json.loads((ROOT/'case-studies/acquiring-robot-run.json').read_text());cls.rows=m.report()
 def test_reproduction_and_pins(self):
  self.assertEqual(json.loads(json.dumps(self.rows)),json.loads((ROOT/'case-studies/acquiring-robot-targets.json').read_text()))
  self.assertEqual(set(self.rows['sourceCodeSha256']),set(m.PINS))
  for p in m.runner.CODE+m.base.PINS+m.acquire.PINS+['case-studies/2026/intake-fixture-nominal.json']:self.assertIn(p,m.PINS)
 def test_real_generated_exits_and_clocks(self):
  for case in self.rows['cases']:
   a=case['acquisitionRuntime'];r=case['runtime'];self.assertEqual(a['globalTime'],r['time']);self.assertAlmostEqual(a['robotTime']+a['acquisitionTime'],r['time'])
   for k in ['exitX','exitY','exitZ','vx','vy','vz','mass']:self.assertEqual(a[k],r[k])
   self.assertIsNone(case['officialScore'])
   if r['year']==2024:self.assertTrue(case['note']['conditionalWholeTorusThinPlaneClearance'])
   if r['year']==2026:self.assertTrue(case['fuel']['conditionalClearance'])
   if r['year']==2025:
    for stop in case['coral']:self.assertEqual(stop['conditionalContainedStop'],stop['muHypothesis'] in (.3,.5))
 def test_mutated_output_rejected(self):
  line=self.receipt['observations'][0]
  for k in ['terminalQ','terminalV','acquisitionTime','impactLoss','sourceEnergy','impulse','mass','angle','globalTime','vx','exitX','duty','feedEnergy','motorResidual']:
   changed=' '.join(k+'=0.123' if p.startswith(k+'=') else p for p in line.split())
   with self.subTest(k=k),self.assertRaises(ValueError):m.parse(changed)
  for bad in [line+' extra=1',line.replace('terminalV=0.0','terminalV=NaN'),line.replace('ACQUIRE_EXIT','ROBOT_EXIT')]:
   with self.assertRaises(ValueError):m.parse(bad)
 def test_stale_missing_duplicate_receipt_rejected(self):
  for kind in ['source','class','test','artifact','duplicate']:
   r=json.loads(json.dumps(self.receipt))
   if kind=='source':r['sourceCodeSha256'][m.runner.CODE[0]]='0'*64
   if kind=='class':r['runtimeClassSha256'].pop('SourceAcquisition')
   if kind=='test':r['tests']=r['tests'][:-1]
   if kind=='artifact':r['artifactsSha256'].pop('dependencies.json')
   if kind=='duplicate':r['observations'][0]=r['observations'][1]
   with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)/'receipt.json';p.write_text(json.dumps(r))
    with self.subTest(kind=kind),self.assertRaises(ValueError):m.report(p)
 def test_line_endings_same_receipt_identity(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'receipt.json';p.write_text((ROOT/'case-studies/acquiring-robot-run.json').read_text(),newline='\r\n');self.assertEqual(m.report(p),self.rows)
if __name__=='__main__':unittest.main()
