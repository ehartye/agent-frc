import importlib.util,unittest,pathlib,math,json
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
P=pathlib.Path(__file__).with_name('inspect-wheel-stack.py')
s=importlib.util.spec_from_file_location('stack',P);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class StackTests(unittest.TestCase):
 def test_transform_preserves_volume(self):
  box=BRepPrimAPI_MakeBox(2,3,8).Shape()
  for side in [-1,1]:
   for phase in [0,30,180]:
    result=m.transformed(box,side,phase)
    self.assertAlmostEqual(m.volume(result),48,places=8)
 def test_outward_axis_and_shoulder_placement(self):
  box=BRepPrimAPI_MakeBox(2,3,6.35).Shape()
  left=m.bounds(m.transformed(box,-1,0));right=m.bounds(m.transformed(box,1,180))
  self.assertAlmostEqual(left[0],-11.90625,places=6)
  self.assertAlmostEqual(right[3],11.90625,places=6)
 def test_common_positive_control(self):
  box=BRepPrimAPI_MakeBox(2,3,8).Shape()
  self.assertAlmostEqual(m.common(box,box),48,places=8)
 def test_recorded_native_control_discriminates_clocking(self):
  r=json.loads((P.parent.parent/'case-studies/2026/native-wheel-stack-exploration.json').read_text())
  self.assertEqual(r['sourceRecords']['wheel']['solidCount'],2)
  self.assertEqual(r['sourceRecords']['hub']['solidCount'],1)
  self.assertEqual(r['trials'][0]['wheelLeftCommonMm3'],0)
  self.assertGreater(r['trials'][1]['wheelLeftCommonMm3'],480)
  self.assertEqual(r['engineeringAcceptance'],'blocked')
  self.assertFalse(r['fastenerSelected'])
  self.assertFalse(r['assemblyExported'])
if __name__=='__main__':unittest.main(verbosity=2)
