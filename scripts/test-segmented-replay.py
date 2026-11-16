import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).with_name('prepare-segmented-replay.py');sp=importlib.util.spec_from_file_location('p',p);p=importlib.util.module_from_spec(sp);sp.loader.exec_module(p)
class ReplayGeometryTests(unittest.TestCase):
 def test_nominal_never_confirmed_overlap_at_center(self):
  for y in p.SEASONS:self.assertGreaterEqual(p.gaps(y,0,0)[1],0)
 def test_compressed_center_confirmed_overlap(self):
  for y in p.SEASONS:self.assertLess(p.gaps(y,0,5)[1],0)
 def test_coral_end_unknown(self):self.assertEqual(p.gaps(2025,150,5),(None,None))
 def test_note_hole_beam(self):
  self.assertFalse(p.occupied(2024,0));self.assertTrue(p.occupied(2024,150));self.assertFalse(p.occupied(2024,200))
 def test_geometry_evidence_chain(self):self.assertEqual(len(p.evidence()),5)
 def test_invalid(self):
  for x in [float('nan'),float('inf'),True,'1']:
   with self.assertRaises(ValueError):p.gaps(2025,x,0)
  with self.assertRaises(ValueError):p.gaps(2023,0,0)
  with self.assertRaises(ValueError):p.gaps(2024,0,7)
if __name__=='__main__':unittest.main()
