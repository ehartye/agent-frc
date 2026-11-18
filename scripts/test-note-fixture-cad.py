import pathlib,importlib.util,json,tempfile,unittest,math,os,sys
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/note-fixture-cad.py');cad=importlib.util.module_from_spec(s);s.loader.exec_module(cad)
def config(v='compressed'):return json.loads((ROOT/f'case-studies/2024/note-fixture-{v}.json').read_text())
class FixtureTests(unittest.TestCase):
 def test_both_native_variants_are_distinct_role_scoped_fixtures(self):
  results=[]
  for v in ('compressed','nominal'):
   c=config(v);self.assertTrue(cad.validate(c))
   with tempfile.TemporaryDirectory() as td:
    path=pathlib.Path(td)/'fixture.step';cad.generate(c,path);r=cad.extract(c,path);results.append(r);self.assertEqual(len(r['bodies']),3);self.assertEqual([b['role'] for b in r['bodies']],['driven-sleeve','fixed-support-no-mass-model','source-sized-ideal-torus-geometry-only']);self.assertTrue(all(abs(x['intersectionVolumeMm3'])<1e-3 for x in r['nativeIntersectionChecks'] if x['interpretation']=='must-be-disjoint'));self.assertIsNone(r['noteProxy']['nativeMassKg']);self.assertFalse(r['assemblyComplete']);self.assertIsNone(r['totalAssemblyMassKg']);self.assertFalse(r['captureEstablished']);self.assertEqual(r['engineeringAcceptance'],'blocked')
  self.assertAlmostEqual(results[0]['roller']['shaftInertiaKgM2'],results[1]['roller']['shaftInertiaKgM2'],12);self.assertEqual(results[0]['roller']['axisOriginMm'][2],99.6);self.assertEqual(results[1]['roller']['axisOriginMm'][2],101.6)
 def test_independent_sleeve_mass_and_axis_inertia(self):
  c=config()
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'fixture.step';cad.generate(c,path);r=cad.extract(c,path)['roller'];m=math.pi*(50.8**2-6.35**2)*400*1200*1e-9;self.assertAlmostEqual(r['massKg'],m,8);self.assertAlmostEqual(r['shaftInertiaKgM2'],.5*m*(50.8**2+6.35**2)*1e-6,10);self.assertAlmostEqual(r['centroidMm'][2],99.6,8)
 def test_analytic_contact_faces_and_nominal_gap(self):
  c=config();self.assertEqual(c['contactFaces'][0]['domainMm'],{'x':[-700,700],'y':[-250,250]});self.assertAlmostEqual(c['roller']['axisOriginMm'][2]-50.8,48.8);self.assertAlmostEqual(config('nominal')['roller']['axisOriginMm'][2]-50.8,50.8);self.assertIsNone(c['contactCoefficients']);self.assertTrue(c['contactScope']['rollerAxisMustRemainAboveNoteTop'])
 def test_actual_native_proxy_is_torus_with_open_hole(self):
  c=config()
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'fixture.step';cad.generate(c,path);r=cad.extract(c,path);torus=next(b for b in r['bodies'] if b['id']=='note-torus-proxy');expected=2*math.pi**2*152.4*25.4**2;self.assertAlmostEqual(torus['volumeMm3'],expected,2);self.assertNotIn('massKg',torus);self.assertLess(abs(r['nativeHoleCheck']['intersectionVolumeMm3']),1e-3);self.assertGreater(r['initialRollerGapMm'],0)
 def test_independent_native_distance_matches_ring_projection(self):
  from OCP.BRepExtrema import BRepExtrema_DistShapeShape
  for x in (-220.,0.,220.):
   c=config('nominal');c['noteProxy']['centerMm'][0]=x;c['roller']['axisOriginMm'][2]+=5
   parts=cad.shapes(c);query=BRepExtrema_DistShapeShape(parts[0][2],parts[2][2]);query.Perform();self.assertTrue(query.IsDone());u=max(-152.4,min(152.4,-x));expected=math.hypot(x+u,25.4-c['roller']['axisOriginMm'][2])-76.2;self.assertAlmostEqual(query.Value(),expected,5)
 def test_schema_provenance_and_scope_promotions_reject(self):
  for edit in (lambda c:c['noteProxy'].update(minorRadiusMm=0),lambda c:c['noteProxy'].update(nativeMassKg=.65),lambda c:c.update(assemblyComplete=True),lambda c:c.update(totalAssemblyMassKg=45),lambda c:c.update(captureEstablished=True),lambda c:c.update(contactCoefficients={'mu':.5}),lambda c:c['roller'].update(axisUnitVector=[False,True,False]),lambda c:c['roller'].update(gearRatio=1),lambda c:c['parentCadConfigPin'].update(sha256='0'*64),lambda c:c['supports'][0]['maxMm'].__setitem__(2,150)):
   c=config();edit(c)
   with self.assertRaises(ValueError):cad.validate(c)
 def test_wrong_native_variant_rejects(self):
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'fixture.step';cad.generate(config(),path)
   with self.assertRaises(ValueError):cad.extract(config('nominal'),path)
 def test_step_mutation_rejects(self):
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'fixture.step';cad.generate(config(),path);before=cad.sha(path);original=cad.sha
   def changing(p):
    if pathlib.Path(p)==path:
     changing.count+=1;return before if changing.count==1 else '0'*64
    return original(p)
   changing.count=0
   with patch.object(cad,'sha',side_effect=changing):
    with self.assertRaisesRegex(ValueError,'STEP changed'):cad.extract(config(),path)
 def test_actual_receipt_is_cad_only_and_output_cannot_be_reused(self):
  with tempfile.TemporaryDirectory() as td:
   out=pathlib.Path(td)/'run';p=ROOT/'case-studies/2024/note-fixture-compressed.json';cad.run(p,out);r=json.loads((out/'receipt.json').read_text());self.assertEqual(r['status'],'passed');self.assertEqual(r['cadSha256'],cad.sha(out/'fixture.step'));self.assertIn('no-IO-contact-or-capture',r['scope'])
   with self.assertRaises(FileExistsError):cad.run(p,out)
if __name__=='__main__':
 result=unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(FixtureTests));report={'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped)}
 if os.getenv('FRC_NOTE_CAD_TEST_REPORT'):pathlib.Path(os.environ['FRC_NOTE_CAD_TEST_REPORT']).write_text(json.dumps(report)+'\n')
 sys.exit(0 if report=={'tests':9,'failures':0,'errors':0,'skipped':0} else 1)
