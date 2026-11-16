import pathlib,importlib.util,json,unittest,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class Replay(unittest.TestCase):
 def test_receipt_pins_and_inventory(self):
  runner=module('runner','scripts/run-acquiring-robot.py');r=json.loads((ROOT/'case-studies/acquiring-robot-run.json').read_text());self.assertEqual(r['sourceCodeSha256'],runner.pins());self.assertEqual(set(r['tests']),runner.TESTS);self.assertEqual(len(r['observations']),4);self.assertEqual(set(r['runtimeClassSha256']),set(runner.CLASSES)|{'DCMotor'})
 def test_independent_python_equivalence(self):
  model=module('model','scripts/acquisition-contract.py');r=json.loads((ROOT/'case-studies/acquiring-robot-run.json').read_text())
  for line in r['observations']:
   d={k:float(v) for k,v in (token.split('=') for token in line.split()[1:])};p=model.acquire(d['mass'],d['angle'])
   for field,expected in [('sourceEnergy',p['sourceKineticEnergyJ']),('potential',p['potentialGainJ']),('dragLoss',p['guideLossJ']),('impactLoss',p['impactLossJ']),('impulse',p['requiredImpulseNs']),('acquisitionTime',p['trace'][-1]['timeS'])]:self.assertAlmostEqual(d[field],expected,places=12)
   self.assertEqual(d['terminalQ'],0);self.assertEqual(d['terminalV'],0);self.assertAlmostEqual(d['globalTime'],d['acquisitionTime']+d['robotTime']);self.assertAlmostEqual(d['speed']**2,sum(d[k]**2 for k in ['vx','vy','vz']),places=10)
if __name__=='__main__':unittest.main()
