import pathlib,json,hashlib,re,unittest,importlib.util
ROOT=pathlib.Path(__file__).resolve().parents[1]
class WorldEvidenceTests(unittest.TestCase):
 def setUp(self):self.r=json.loads((ROOT/'case-studies/world-catcher-handoff.json').read_text())
 def test_pins_and_inventory(self):
  self.assertEqual(len(self.r['tests']),7);self.assertEqual(len(self.r['observations']),30);self.assertEqual(len(self.r['runtimeClassSha256']),5)
  for kind in ['sourceCodeSha256','mechanicalInterfaceEvidenceSha256']:
   for name,pin in self.r[kind].items():self.assertEqual(pin,hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  self.assertIsNone(self.r['calibration']);self.assertEqual(self.r['engineeringAcceptance'],'blocked');self.assertFalse(self.r['physicalRobotIoExecuted'])
 def test_positive_and_failure_outcomes(self):
  positives=negatives=0
  for line in self.r['observations']:
   row=dict(re.findall(r'(\w+)=([^,\] ]+)',line))
   self.assertLess(float(row['maxEnergyResidual']),1e-8)
   if row['fault']=='0' and float(row['initialSpeed'])>0:
    positives+=1;self.assertEqual(row['catcherState'],'RELEASED');self.assertEqual(row['captured'],'true');self.assertEqual(row['locallyReleased'],'true');self.assertGreater(float(row['minIsolationGap']),0);self.assertGreater(float(row['finalX']),.3)
   else:
    negatives+=1;self.assertEqual(row['catcherState'],'FAULT');self.assertEqual(row['captured'],'false');self.assertEqual(row['locallyReleased'],'false')
  self.assertEqual((positives,negatives),(9,21))
 def test_independent_port_vectors_regenerate(self):
  s=importlib.util.spec_from_file_location('g',ROOT/'scripts/prepare-catcher-golden.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
  text=(ROOT/'examples/java-2026-sim/src/test/resources/catcher-contact-golden.csv').read_text();self.assertEqual(text,g.vectors());self.assertEqual(len(text.splitlines())-1,18)
if __name__=='__main__':unittest.main()
