import unittest,importlib.util,pathlib,json,copy,subprocess,sys,ast
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runner',ROOT/'scripts/run-season-io.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class Contracts(unittest.TestCase):
 def test_closed_explicit_hypotheses(self):
  e=json.loads((ROOT/'references/season-contact-experiment.json').read_text());runner.validate_experiment(e)
  for mutate in [lambda c:c.update(normalPerRollerN=True),lambda c:c.update(frictionCoefficient=float('nan')),lambda c:c.update(massSelection='measured'),lambda c:c.update(orientation='free'),lambda c:c.update(extra=1),lambda c:c['seasons'].pop('2026')]:
   c=copy.deepcopy(e);mutate(c)
   with self.assertRaises(ValueError):runner.validate_experiment(c)
 def test_optimized_python_cannot_remove_gates(self):
  code="import importlib.util; s=importlib.util.spec_from_file_location('r',r'%s'); r=importlib.util.module_from_spec(s);s.loader.exec_module(r);r.check(False,'required-gate')"%(ROOT/'scripts/run-season-io.py')
  p=subprocess.run([sys.executable,'-O','-c',code],capture_output=True,text=True);self.assertNotEqual(p.returncode,0);self.assertIn('ValueError: required-gate',p.stderr)
 def test_no_removable_production_asserts(self):
  tree=ast.parse((ROOT/'scripts/run-season-io.py').read_text());self.assertFalse(any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
if __name__=='__main__':unittest.main()
