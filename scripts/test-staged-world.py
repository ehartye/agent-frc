import pathlib,importlib.util,json,unittest,random,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(n):
 s=importlib.util.spec_from_file_location(n,ROOT/f'scripts/{n}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class StagedWorldTests(unittest.TestCase):
 def test_bound_receipt_and_inventory(self):
  r=json.loads((ROOT/'case-studies/staged-world-supervisor.json').read_text());self.assertEqual(r['sourceCodeSha256'],module('run-staged-world').pins());self.assertEqual(len(r['tests']),10);self.assertEqual(len(r['observations']),54);self.assertEqual(len(r['runtimeClassSha256']),9);self.assertFalse(r['physicalRobotIoExecuted']);self.assertIsNone(r['calibration'])
 def test_counterexamples_retained(self):
  r=json.loads((ROOT/'case-studies/staged-world-supervisor.json').read_text());rows=r['observations']
  self.assertEqual(sum('captured=true' in x for x in rows),9)
  for fault in [12,13,14]:
   subset=[x for x in rows if f'fault={fault} ' in x];self.assertEqual(len(subset),3)
   for x in subset:self.assertIn('catcherState=FAULT',x);self.assertIn('captured=false',x)
  for x in rows:
   if 'fault=13 ' in x or 'fault=14 ' in x:self.assertIn('enteredHold=true',x);self.assertIn('retainedClosureAfterFault=true',x)
 def test_passive_energy_lower_acceleration_bound(self):
  m=module('unilateral-catcher-study');rng=random.Random(3801)
  for _ in range(1000):
   x=rng.uniform(-.05,.1);v=rng.uniform(-2,2);closed=rng.choice([True,False]);hold=rng.choice([0,10]);e=.25*v*v+m.potential(x,200,50)+(m.potential(-x-.02,1000,50) if closed else 0)
   bound=min(104,2*(60*math.sqrt(e)+2));xn,vn,*_=m.step(x,v,.002,closed,50,hold)
   self.assertGreaterEqual((vn-v)/.002,-bound-1e-8)
if __name__=='__main__':unittest.main()
