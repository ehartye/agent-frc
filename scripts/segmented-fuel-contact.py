"""Exact ideal sphere/finite-wheel geometry; deliberately no force law."""
import math,json,unittest

def finite_number(v):
 if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v):raise ValueError('finite real required')
 return v

def sphere_wheel_gap(center,radius,wheel_y,wheel_z,wheel_radius,half_width):
 # World X feed, Y shaft, Z up. Distance to a solid finite cylinder, not infinite sleeve.
 if len(center)!=3:raise ValueError('3D center required')
 x,y,z=[finite_number(v) for v in center]
 radius,wheel_y,wheel_z,wheel_radius,half_width=[finite_number(v) for v in (radius,wheel_y,wheel_z,wheel_radius,half_width)]
 if min(radius,wheel_radius,half_width)<=0:raise ValueError('positive sizes required')
 radial=math.hypot(x,z-wheel_z);axial=abs(y-wheel_y)
 # This exterior-contact kernel rejects center-inside-solid states rather than inventing normals.
 if radial<=wheel_radius and axial<=half_width:raise ValueError('sphere center inside wheel unsupported')
 return math.hypot(max(radial-wheel_radius,0),max(axial-half_width,0))-radius

def report():
 centers=[-87.3125,-52.3875,-17.4625,17.4625,52.3875,87.3125]
 nominal=[sphere_wheel_gap((0,0,75),75,y,188.1,38.1,12.00625) for y in centers]
 compressed=[sphere_wheel_gap((0,0,75),75,y,183.1,38.1,12.00625) for y in centers]
 return dict(schema='frc-segmented-fuel-contact-geometry/v1',units='mm',basis='original ideal finite cylinders using pinned native full wheel bounds; not exact tread contact',
  wheelCentersY=centers,wheelHalfWidth=12.00625,pieceRadius=75,nominalWheelZ=188.1,compressedWheelZ=183.1,
  nominalSignedGaps=nominal,compressedSignedGaps=compressed,
  priorInfiniteSleeveNominalGap=0,forceLaw=None,material=None,friction=None,calibrated=False,engineeringAcceptance='blocked',
  limitations=['Geometric gaps only; negative gap is an imposed compliant-overlap hypothesis','Full-bound cylinder envelope overfills actual tread grooves and may overpredict contact','No summing six copies of previous aggregate sleeve stiffness','Lateral dynamics, spinning sphere, floor, motor and thermal coupling absent'])

class ContactTests(unittest.TestCase):
 def test_radial_tangent(self):self.assertAlmostEqual(sphere_wheel_gap((0,0,75),75,0,188.1,38.1,12),0)
 def test_segment_gap(self):self.assertGreater(sphere_wheel_gap((0,0,75),75,17.4625,188.1,38.1,12.00625),.19)
 def test_symmetry(self):self.assertAlmostEqual(sphere_wheel_gap((3,2,75),75,17.4625,188.1,38.1,12.00625),sphere_wheel_gap((3,-2,75),75,-17.4625,188.1,38.1,12.00625))
 def test_side_tangent(self):self.assertAlmostEqual(sphere_wheel_gap((0,87,188.1),75,0,188.1,38.1,12),0)
 def test_invalid(self):
  for v in [float('nan'),float('inf'),True,'1']:
   with self.assertRaises(ValueError):sphere_wheel_gap((v,0,75),75,0,188.1,38.1,12)
  with self.assertRaises(ValueError):sphere_wheel_gap((0,0,188.1),75,0,188.1,38.1,12)
if __name__=='__main__':
 import sys
 if sys.argv[1:]==['--test']:unittest.main(argv=[sys.argv[0]])
 elif not sys.argv[1:]:print(json.dumps(report(),indent=2,allow_nan=False))
 else:raise ValueError('no arguments or --test')
