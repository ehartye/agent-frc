import importlib.util,pathlib,unittest,math,json
s=importlib.util.spec_from_file_location('impact',pathlib.Path(__file__).with_name('impact-load-envelope.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_equal_mass(self):
  a=m.scenario(50,50,4,.05);self.assertEqual(a['reducedMassKg'],25);self.assertEqual(a['relativeEnergyJ'],200);self.assertEqual(a['centralInelasticImpulseNs'],100);self.assertEqual(a['averageCompressionForceN'],4000);self.assertEqual(a['ownDeltaVMps'],2)
 def test_momentum_energy(self):
  for row in m.report()['cases']:
   a=row['ownMassKg'];b=row['opponentMassKg'];v=row['closingSpeedMps'];w=a*v/(a+b)
   self.assertAlmostEqual(a*v,(a+b)*w);self.assertAlmostEqual(.5*a*v*v-.5*(a+b)*w*w,row['relativeEnergyJ']);self.assertAlmostEqual(row['averageCompressionForceN']*row['constantForceDurationS'],row['centralInelasticImpulseNs'])
 def test_scalings(self):
  a=m.scenario(45,60,2,.05);b=m.scenario(45,60,4,.05);c=m.scenario(45,60,4,.1)
  self.assertEqual(b['relativeEnergyJ'],4*a['relativeEnergyJ']);self.assertEqual(b['centralInelasticImpulseNs'],2*a['centralInelasticImpulseNs']);self.assertEqual(c['averageCompressionForceN'],b['averageCompressionForceN']/2)
 def test_wall_limit(self):
  a=m.scenario(50,1e6,4,.05);self.assertLess(abs(a['reducedMassKg']-50),.003)
 def test_invalid(self):
  for field in range(5):
   for bad in (1e308,True,False,float('nan'),float('inf'),-1,'50',None):
    args=[50,60,4,.05,.25];args[field]=bad
    with self.assertRaises(ValueError):m.scenario(*args)
  for field in (0,1,3):
   args=[50,60,4,.05,.25];args[field]=0
   with self.assertRaises(ValueError):m.scenario(*args)
 def test_rest_and_no_acceptance(self):
  a=m.scenario(50,60,0,.05);self.assertEqual(a['relativeEnergyJ'],0);self.assertIsNone(a['constantForceDurationS']);r=m.report();self.assertEqual(r['scenarioCount'],108);json.dumps(r,allow_nan=False)
  for a in r['cases']:self.assertIsNone(a['peakForceN']);self.assertIsNone(a['structuralPass'])
if __name__=='__main__':unittest.main()

