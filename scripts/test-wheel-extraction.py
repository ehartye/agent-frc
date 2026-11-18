"""Explicit source-input development tests, not a manufacturing tolerance test."""
import importlib.util, os, pathlib, tempfile, unittest, math, json, sys
spec=importlib.util.spec_from_file_location('wheel',pathlib.Path(__file__).with_name('extract-wheel-io.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class WheelExtraction(unittest.TestCase):
 def test_parallel_axis_units_and_axial_displacement(self):
  tensor=[[1,0,0],[0,2,0],[0,0,3]]
  self.assertAlmostEqual(m.shaft_inertia_kgm2(tensor,10,[3,4,999],2700),(3+250)*2700e-15,places=20)
 def test_actual_reviewed_geometry_and_density_scaling(self):
  source=os.environ['FRC_WHEEL_STEP'];a=m.extract(source,2700);b=m.extract(source,5400)
  self.assertEqual(a['bodyCount'],1);self.assertFalse(a['assemblyInertiaComplete']);self.assertEqual(a['engineeringAcceptance'],'blocked')
  self.assertAlmostEqual(a['massKg'],.16169253265472175,places=10)
  self.assertAlmostEqual(a['inertiaZKgM2'],.0001997439529486427,places=12)
  self.assertAlmostEqual(b['inertiaZKgM2'],2*a['inertiaZKgM2'],places=14)
  for d in [float('nan'),float('inf'),-1,0,20001]:
   with self.assertRaises(ValueError):m.extract(source,d)
 def test_wrong_native_bytes_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   f=pathlib.Path(d)/'changed.step';f.write_bytes(b'not the reviewed native geometry')
   with self.assertRaises(ValueError):m.extract(f,2700)
if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(WheelExtraction))
 report={'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)}
 if os.environ.get('FRC_WHEEL_TEST_REPORT'):
  with pathlib.Path(os.environ['FRC_WHEEL_TEST_REPORT']).open('x',encoding='utf-8') as f:json.dump(report,f,indent=2)
 sys.exit(0 if report=={'tests':3,'failures':0,'errors':0,'skipped':0} else 1)
