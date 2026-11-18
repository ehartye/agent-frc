import importlib.util,pathlib,json,tempfile,unittest,math,os,sys
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('cad',ROOT/'scripts/season-mechanism-cad.py');cad=importlib.util.module_from_spec(spec);spec.loader.exec_module(cad)
def config(y=2024):return json.loads((ROOT/f'case-studies/{y}/roller-mechanism.json').read_text())
class NativeTests(unittest.TestCase):
 def test_three_distinct_native_season_geometries(self):
  results=[]
  for y in (2024,2025,2026):
   c=config(y)
   with tempfile.TemporaryDirectory() as td:
    step=pathlib.Path(td)/'original.step';cad.generate(c,step);out=cad.extract(c,step);results.append(out)
    for r,p in zip(c['rollers'],out['rollers']):
     R,b,L=r['outerRadiusMm'],r['boreRadiusMm'],r['lengthMm'];mass=math.pi*(R*R-b*b)*L*r['densityKgM3']*1e-9;I=.5*mass*(R*R+b*b)*1e-6
     self.assertAlmostEqual(p['massKg'],mass,places=8);self.assertAlmostEqual(p['shaftInertiaKgM2'],I,places=9)
     self.assertEqual(p['bodySelector']['solidCountMatched'],1);self.assertEqual(out['engineeringAcceptance'],'blocked')
  self.assertNotEqual(results[0]['rollers'][0]['shaftInertiaKgM2'],results[1]['rollers'][0]['shaftInertiaKgM2'])
 def test_fuel_nominal_rounding_and_source_range(self):
  c=config(2026);self.assertTrue(cad.validate(c));self.assertAlmostEqual(c['piece']['massMinKg'],.20320938176);self.assertAlmostEqual(c['piece']['massMaxKg'],.226796185)
  c['piece']['geometryMm']['diameter']=150.114
  with self.assertRaises(ValueError):cad.validate(c)
  c=config(2026);c['piece']['roundingNote']='exact measured diameter'
  with self.assertRaises(ValueError):cad.validate(c)
 def test_parallel_axis_is_perpendicular_only(self):
  T=[[1,0,0],[0,2,0],[0,0,3]];self.assertEqual(cad.axis_inertia(T,2,[0,1000,0],[0,0,0],[0,1,0]),2);self.assertEqual(cad.axis_inertia(T,2,[1000,0,0],[0,0,0],[0,1,0]),4)
 def test_schema_and_physical_unknowns_fail_closed(self):
  for mutate in (lambda c:c.update(season=2023),lambda c:c['rollers'][0].update(densityKgM3=float('nan')),lambda c:c['contact'].update(normalForcePerRollerN=10),lambda c:c['piece']['geometryMm'].update(outerDiameter=100),lambda c:c['graphPins']['robot-envelope'].update(sha256='0'*64),lambda c:c.update(engineeringAcceptance='passed'),lambda c:c['graphPins']['robot-envelope'].update(revision=True),lambda c:c['rollers'][0].update(axisUnitVector=[False,True,False])):
   c=config();mutate(c)
   with self.assertRaises(ValueError):cad.validate(c)
 def test_modified_or_missing_native_body_rejects(self):
  with tempfile.TemporaryDirectory() as td:
   c=config();p=pathlib.Path(td)/'x.step';cad.generate(c,p);wrong=config(2025)
   with self.assertRaises(ValueError):cad.extract(wrong,p)
 def test_step_mutation_during_extraction_rejects(self):
  with tempfile.TemporaryDirectory() as td:
   c=config();p=pathlib.Path(td)/'x.step';cad.generate(c,p);before=cad.sha(p)
   with patch.object(cad,'sha',side_effect=[before,'0'*64]):
    with self.assertRaisesRegex(ValueError,'STEP changed'):cad.extract(c,p)
 def test_receipt_is_actual_cad_execution_not_robot_simulation(self):
  with tempfile.TemporaryDirectory() as td:
   out=pathlib.Path(td)/'run';cad.run(ROOT/'case-studies/2024/roller-mechanism.json',out);receipt=json.loads((out/'receipt.json').read_text());self.assertEqual(receipt['status'],'passed');self.assertEqual(receipt['cadSha256'],cad.sha(out/'mechanism.step'));self.assertEqual(receipt['propertiesSha256'],cad.sha(out/'properties.json'));self.assertIn('no-IO-execution',receipt['scope'])
   with self.assertRaises(FileExistsError):cad.run(ROOT/'case-studies/2024/roller-mechanism.json',out)
if __name__=='__main__':
 result=unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(NativeTests))
 report={'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)}
 if os.getenv('FRC_NATIVE_TEST_REPORT'):pathlib.Path(os.environ['FRC_NATIVE_TEST_REPORT']).write_text(json.dumps(report)+'\n')
 sys.exit(0 if report=={'tests':7,'failures':0,'errors':0,'skipped':0} else 1)
