import importlib.util,pathlib,json,unittest,math
ROOT=pathlib.Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('a',ROOT/'scripts/acquisition-contract.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Acquisition(unittest.TestCase):
 def test_fresh(self):self.assertEqual(m.report(),json.loads((ROOT/'case-studies/acquisition-contract.json').read_text(encoding='utf-8-sig')))
 def test_energy_and_continuity(self):
  for row in m.report()['cases']:
   self.assertAlmostEqual(row['energyResidualJ'],0,places=12)
   t=row['trace'];inp=row['inputs'];dt=t[1]['timeS'];acc=-m.G*math.sin(inp['pitchRad'])-inp['dragN']/inp['massKg']
   self.assertAlmostEqual(t[1]['qM'],t[0]['qM']+t[0]['vMps']*dt+.5*acc*dt*dt)
   self.assertAlmostEqual(t[1]['vMps'],t[0]['vMps']+acc*dt)
   if len(t)>2:
    self.assertEqual(t[1]['timeS'],t[2]['timeS']);self.assertEqual(t[1]['qM'],t[2]['qM'])
    self.assertAlmostEqual(row['requiredImpulseNs'],inp['massKg']*(t[2]['vMps']-t[1]['vMps']))
 def test_controls(self):
  rows=m.report()['cases'];self.assertEqual(sum(r['scenario']=='nominal' and r['conditionalStateEligible'] for r in rows),4)
  for r in rows:
   if r['scenario'] in ('no-stop','elastic-no-damping','excess-speed','missing-retention','uncertain-retention'):self.assertFalse(r['conditionalStateEligible'])
   self.assertFalse(r['javaHandoffExecuted'])
 def test_rebound_and_stop_loss(self):
  elastic=m.acquire(.5,0,restitution=1,drag=0);self.assertEqual(elastic['impactLossJ'],0);self.assertLess(elastic['terminalState']['vMps'],0)
  r=m.acquire(.5,0,drag=0);self.assertAlmostEqual(r['impactLossJ'],.09);self.assertEqual(r['terminalState'],dict(qM=0,vMps=0))
 def test_domain(self):
  for v in (True,float('nan'),float('inf'),0,-1):
   with self.assertRaises(ValueError):m.acquire(v,0)
 def test_mass_bounds(self):
  e=json.loads((ROOT/'case-studies/coral-mass-evidence.json').read_text());actual=sorted({r['inputs']['massKg'] for r in m.report()['cases'] if r['season']==2025})
  for x,y in zip(actual,e['massBoundsKg']):self.assertAlmostEqual(x,y)
if __name__=='__main__':unittest.main()
