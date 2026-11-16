import importlib.util,pathlib,unittest,math
s=importlib.util.spec_from_file_location('model',pathlib.Path(__file__).with_name('segmented-force-model.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ForceTests(unittest.TestCase):
 def test_impulse_passivity_momentum_and_no_slip_reversal(self):
  for v in [-1,0,.3]:
   for u in [-.7,0,1]:
    for cap in [0,.001,.1,10]:
     vv,uu,j,de=m.contact_step(v,u,.5,.25,cap)
     self.assertLessEqual(de,1e-12);self.assertLessEqual(abs(j),cap)
     self.assertAlmostEqual(.5*v+.25*u,.5*vv+.25*uu)
     self.assertGreaterEqual((u-v)*(uu-vv),-1e-12)
 def test_invalid(self):
  for value in [True,float('nan'),float('inf'),'1']:
   with self.assertRaises(ValueError):m.simulate(2026,normal=value)
   with self.assertRaises(ValueError):m.contact_step(0,0,1,1,value)
  for kw in [dict(mass=0),dict(normal=-1),dict(dt=.1),dict(compression=2),dict(duration=.501)]:
   with self.assertRaises(ValueError):m.simulate(2026,**kw)
 def test_geometry_can_drive_all_three_and_energy_closes(self):
  for year in m.p.SEASONS:
   r=m.simulate(year,duration=.1)
   self.assertEqual(r['status'],'duration-complete');self.assertGreater(r['final']['xM'],0)
   self.assertLess(r['maxAbsEnergyResidualJ'],1e-12)
   for row in r['rows']:self.assertLessEqual(row['contactEnergyChangeJ'],1e-12)
 def test_negative_controls_not_prescribed_transport(self):
  for year in m.p.SEASONS:
   for kw in [dict(mu=0),dict(normal=0),dict(compression=0),dict(drive_limit=0)]:
    r=m.simulate(year,duration=.02,**kw)
    self.assertEqual(r['final']['xM'],0);self.assertEqual(r['final']['pieceMps'],0)
 def test_reverse_symmetry(self):
  for year in m.p.SEASONS:
   a=m.simulate(year,duration=.1);b=m.simulate(year,target=-.2,duration=.1)
   self.assertAlmostEqual(a['final']['xM'],-b['final']['xM'],places=10)
 def test_timestep_sensitivity_not_invariance(self):
  for year in m.p.SEASONS:
   a=m.simulate(year,duration=.1);b=m.simulate(year,duration=.1,dt=.0025)
   self.assertLess(abs(a['final']['xM']-b['final']['xM']),.001)
 def test_unknown_stops(self):
  # Deliberately substitute unsupported geometry to verify stop, not silent zero load.
  original=m.p.gaps
  try:
   m.p.gaps=lambda *args:(None,None)
   r=m.simulate(2025)
   self.assertEqual(r['status'],'unknown-geometry-stop');self.assertEqual(r['rows'],[])
  finally:m.p.gaps=original


class ReceiptTests(unittest.TestCase):
 def test_committed_cases_and_source_pins(self):
  import json,hashlib
  root=pathlib.Path(__file__).resolve().parents[1]
  r=json.loads((root/'case-studies/segmented-force-sensitivity.json').read_text())
  self.assertEqual(len(r['cases']),27)
  self.assertEqual(r['geometryEvidenceSha256'],m.p.evidence())
  for name,pin in r['sourceCodeSha256'].items():
   self.assertEqual(pin,hashlib.sha256((root/name).read_text(encoding='utf-8-sig').encode()).hexdigest())
  for name,case in r['cases'].items():
   self.assertEqual(case['status'],'duration-complete')
   self.assertLess(case['maxAbsEnergyResidualJ'],1e-12)
   self.assertEqual(len(case['rows']),round(case['parameters']['durationS']/case['parameters']['dtS']))
   for row in case['rows']:
    self.assertLessEqual(row['contactEnergyChangeJ'],1e-12)
    self.assertLessEqual(abs(row['impulseNs']),row['capacityNs']+1e-12)
    if row['geometry']=='separated':self.assertEqual(row['impulseNs'],0)
    self.assertLess(abs(row['energyResidualJ']),1e-12)

if __name__=='__main__':unittest.main()

