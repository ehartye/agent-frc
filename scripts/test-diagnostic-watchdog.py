import pathlib,importlib.util,json,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(n):
 s=importlib.util.spec_from_file_location(n,ROOT/f'scripts/{n}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class DiagnosticTests(unittest.TestCase):
 def test_receipt_pins_and_inventory(self):
  r=json.loads((ROOT/'case-studies/diagnostic-world-supervisor.json').read_text());self.assertEqual(r['sourceCodeSha256'],module('run-diagnostic-world').pins());self.assertEqual(len(r['tests']),15);self.assertEqual(len(r['observations']),66);self.assertEqual(len(r['runtimeClassSha256']),13);self.assertFalse(r['physicalRobotIoExecuted']);self.assertIsNone(r['calibration'])
 def test_single_fault_rejected_but_correlated_fault_preserved(self):
  rows=json.loads((ROOT/'case-studies/diagnostic-world-supervisor.json').read_text())['observations'];self.assertEqual(sum('captured=true' in x for x in rows),9)
  for f,hold in [(13,False),(15,True),(16,False)]:
   subset=[x for x in rows if f'fault={f} ' in x];self.assertEqual(len(subset),3)
   for x in subset:self.assertIn(f'enteredHold={str(hold).lower()}',x);self.assertIn('captured=false',x)
  for f,closed in [(17,True),(18,False)]:
   subset=[x for x in rows if f'fault={f} ' in x];self.assertEqual(len(subset),3)
   for x in subset:self.assertIn('leaseExpired=true',x);self.assertIn(f'finalPhysicalGateClosed={str(closed).lower()}',x);self.assertIn('retainedClosureAfterFault=true',x)
 def test_post_fault_report_regenerates_and_is_not_safety_qualification(self):
  m=module('post-fault-output-study');r=m.report();self.assertEqual(r,json.loads((ROOT/'case-studies/post-fault-output-hypotheses.json').read_text()));self.assertEqual(len(r['cases']),36)
  for c in r['cases']:self.assertFalse(c['physicalSafetyQualified']);self.assertLess(c['maxEnergyResidualJ'],1e-8)
  self.assertEqual(sum(c['firstExit50mmSeconds'] is not None for c in r['cases']),6)
 def test_loaded_gate_cannot_discard_energy_when_zeroed(self):
  m=module('post-fault-output-study');c=m.simulate(dict(year=2024,fault=13,x=-.03,v=0),'zero-spring-open');self.assertTrue(c['openingBlockedByLoadedGuard']);self.assertTrue(c['gateRemainsClosed']);self.assertGreater(c['initialEnergyJ'],0)
if __name__=='__main__':unittest.main()
