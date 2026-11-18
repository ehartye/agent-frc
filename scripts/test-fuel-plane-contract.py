import pathlib,json,unittest,importlib.util,copy,subprocess,sys,ast
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('plane_runner',ROOT/'scripts/run-fuel-plane.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class Contract(unittest.TestCase):
 def test_unknown_or_promoted_assumptions_reject(self):
  e=json.loads((ROOT/'references/fuel-plane-experiment.json').read_text());c=json.loads((ROOT/'case-studies/2026/roller-mechanism.json').read_text());case=json.loads((ROOT/'case-studies/2026/case.json').read_text());r.validate(e,c,case)
  for mutate in [lambda x:x.update(frictionCoefficient=True),lambda x:x.update(frictionCoefficient=float('nan')),lambda x:x.update(robotGeometryIncluded=True),lambda x:x.update(plane='certified-field-mesh'),lambda x:x.update(inertiaBasis='measured'),lambda x:x.update(durationSeconds=1.0001),lambda x:x.update(extra=1)]:
   bad=copy.deepcopy(e);mutate(bad)
   with self.assertRaises(ValueError):r.validate(bad,c,case)
  bad=copy.deepcopy(case);bad['manualFingerprint']['sha256']='0'*64
  with self.assertRaises(ValueError):r.validate(e,c,bad)
 def test_optimized_execution_keeps_required_gate(self):
  code="import importlib.util;s=importlib.util.spec_from_file_location('r',r'%s');r=importlib.util.module_from_spec(s);s.loader.exec_module(r);r.check(False,'required-plane-gate')"%(ROOT/'scripts/run-fuel-plane.py');p=subprocess.run([sys.executable,'-O','-c',code],capture_output=True,text=True);self.assertNotEqual(0,p.returncode);self.assertIn('ValueError: required-plane-gate',p.stderr)
 def test_production_has_no_removable_asserts(self):
  self.assertFalse(any(isinstance(n,ast.Assert) for n in ast.walk(ast.parse((ROOT/'scripts/run-fuel-plane.py').read_text()))))
if __name__=='__main__':unittest.main()
