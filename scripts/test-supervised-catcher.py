import pathlib,importlib.util,json,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/f'scripts/{name}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class SupervisorEvidenceTests(unittest.TestCase):
 def test_golden_regeneration(self):self.assertEqual(module('prepare-supervisor-golden').content(),(ROOT/'examples/java-2026-sim/src/test/resources/supervisor-clearance-golden.csv').read_text())
 def test_receipt_source_pins(self):
  r=json.loads((ROOT/'case-studies/bounded-virtual-supervisor.json').read_text());self.assertEqual(r['sourceCodeSha256'],module('run-supervised-catcher').pins());self.assertEqual(len(r['tests']),7);self.assertEqual(len(r['runtimeClassSha256']),7);self.assertFalse(r['physicalRobotIoExecuted']);self.assertIsNone(r['calibration']);self.assertEqual(r['engineeringAcceptance'],'blocked')
 def test_age_bound_can_reject_an_otherwise_clear_pose(self):
  p=module('pose-clearance-contract');self.assertTrue(p.certificate(2026,initial_v_lower=-500,duration=.02)['gateAndGuidePermission']);self.assertFalse(p.certificate(2026,initial_v_lower=-500,duration=.04)['gateAndGuidePermission'])
if __name__=='__main__':unittest.main()
