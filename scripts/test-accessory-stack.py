import unittest,json,pathlib,importlib.util
p=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('a',p/'inspect-accessory-stack.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
class NativeAccessoryTests(unittest.TestCase):
 def test_overlap_control(self):
  box=BRepPrimAPI_MakeBox(2,3,4).Shape()
  self.assertAlmostEqual(a.overlap(box,box)['volumeMm3'],24)
 def test_pose_preserves_volume(self):
  box=BRepPrimAPI_MakeBox(2,3,4).Shape()
  for side in [-1,1]:self.assertAlmostEqual(a.b.volume(a.pose(box,4,5,side)),24)
 def test_recorded_results_not_fresh_replay(self):
  r=json.loads((p.parent/'case-studies/2026/native-accessory-interference.json').read_text(encoding='utf-8-sig'))
  self.assertGreater(r['spacerScrew']['volumeMm3'],.6)
  self.assertGreater(r['socketSpacer']['volumeMm3'],2.8)
  self.assertLess(abs(r['socketEntryHub']['volumeMm3']),1e-7)
  self.assertLess(abs(r['analyticSpacer']['socketCommon']['volumeMm3']),1e-7)
  self.assertEqual(r['engineeringAcceptance'],'blocked')
if __name__=='__main__':unittest.main()
