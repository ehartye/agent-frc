"""Three season segmented-wheel geometric probes, not a calibrated contact law."""
import importlib.util,pathlib,math,json,hashlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sp=importlib.util.spec_from_file_location('fuel',pathlib.Path(__file__).with_name('segmented-fuel-contact.py'));f=importlib.util.module_from_spec(sp);sp.loader.exec_module(f)

def torus_gap_interval(wheel_y,wheel_z,wheel_r,half_width,major=152.4,minor=25.4,piece_z=25.4,n=36000):
 # Torus is union of radius-minor spheres over its circular centerline. Distance is1-Lipschitz.
 if isinstance(n,bool) or not isinstance(n,int) or n<4:raise ValueError('integer sample count >=4')
 for v in (wheel_y,wheel_z,wheel_r,half_width,major,minor,piece_z):f.finite_number(v)
 if min(wheel_r,half_width,major,minor)<=0 or wheel_z-wheel_r<piece_z+minor:raise ValueError('upper-exterior probe only')
 upper=min(f.sphere_wheel_gap((major*math.cos(i*math.tau/n),major*math.sin(i*math.tau/n),piece_z),minor,wheel_y,wheel_z,wheel_r,half_width) for i in range(n))
 error=major*math.pi/n
 return dict(lowerMm=upper-error,upperMm=upper,sampleCount=n,geometricErrorBoundMm=error)

def transverse_coral_gap(wheel_y,wheel_z,wheel_r,half_width,tube_r=57.15,tube_z=57.15):
 # Restricted to tube axisX spanning the complete wheel X envelope; external upper tube surface.
 for v in (wheel_y,wheel_z,wheel_r,half_width,tube_r,tube_z):f.finite_number(v)
 if min(wheel_r,half_width,tube_r)<=0 or wheel_z-wheel_r<tube_z:raise ValueError('exterior upper scope required')
 return math.hypot(max(abs(wheel_y)-half_width,0),wheel_z-wheel_r-tube_z)-tube_r

def report():
 note_centers=[-175,-125,-75,-25,25,75,125,175]
 coral_centers=[(i-3.5)*19.05 for i in range(8)]
 paths=['case-studies/2024/note-fixture-nominal.json','case-studies/2025/coral-fixture-nominal.json','case-studies/2026/intake-fixture-nominal.json']
 return dict(schema='frc-segmented-season-probes/v1',fixtureContextSha256={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths},
  basis='original constrained-pose geometric probes; source-sized gamepiece idealizations, cylindrical wheel envelopes, no mechanics acceptance',
  NOTE=dict(wheelCentersYmm=note_centers,wheelHalfWidthMm=12.00625,wheelRadiusMm=50.8,wheelZmm=101.6,torusMajorMm=152.4,torusMinorMm=25.4,torusCenterMm=[0,0,25.4],gaps=[torus_gap_interval(y,101.6,50.8,12.00625) for y in note_centers]),
  CORAL=dict(wheelCentersYmm=coral_centers,wheelHalfWidthMm=6.35,wheelRadiusMm=25.4,wheelZmm=139.7,tubeOuterRadiusMm=57.15,tubeInnerRadiusMm=50.8,tubeLengthMm=301.625,tubeCenterMm=[0,0,57.15],gapsMm=[transverse_coral_gap(y,139.7,25.4,6.35) for y in coral_centers],restriction='tube axisX centered atX0, spans wheel X envelope; only upper exterior, no bore/end-face contact'),
  FUEL=f.report(),forceLaw=None,calibration=None,engineeringAcceptance='blocked',
  limitations=['No prior continuous-sleeve validity transferred','Native CAD envelope is not exact wheel tread geometry','No force stiffness/damping/friction, effective patch weighting or material identified','Fixed orientations and lateral positions are external constraints, not demonstrated guidance'])

class ProbesTests(unittest.TestCase):
 def test_coral_center_tangent(self):self.assertAlmostEqual(transverse_coral_gap(0,139.7,25.4,6.35),0)
 def test_coral_segment_gap(self):self.assertGreater(transverse_coral_gap(9.525,139.7,25.4,6.35),.08)
 def test_torus_bound_refinement(self):
  coarse=torus_gap_interval(175,101.6,50.8,12.00625,n=360)
  fine=torus_gap_interval(175,101.6,50.8,12.00625,n=720)
  self.assertLessEqual(fine['upperMm'],coarse['upperMm']+1e-10)
  self.assertLess(fine['geometricErrorBoundMm'],coarse['geometricErrorBoundMm'])
  self.assertLessEqual(coarse['lowerMm'],fine['upperMm'])
 def test_invalid(self):
  with self.assertRaises(ValueError):torus_gap_interval(0,0,50.8,12)
  with self.assertRaises(ValueError):transverse_coral_gap(True,139.7,25.4,6.35)
if __name__=='__main__':
 import sys
 if sys.argv[1:]==['--test']:unittest.main(argv=[sys.argv[0]])
 elif not sys.argv[1:]:print(json.dumps(report(),indent=2,allow_nan=False))
 else:raise ValueError('no arguments or --test')
