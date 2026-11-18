"""Native conservative swept-envelope and fixed-pose uncertainty screens."""
import pathlib,importlib.util,json,math,hashlib,sys,OCP
from OCP.gp import gp_Pnt,gp_Dir,gp_Ax1,gp_Ax2,gp_Trsf
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('n',ROOT/'scripts/native-catcher-envelopes.py');n=importlib.util.module_from_spec(s);s.loader.exec_module(n)
POSES=[('nominal',0,0,0,0),('nominal-tail-margin',-17,0,0,0),('yaw3-tight-margin',-17.9,0,3,0),('yaw5-tail-margin',-17,0,5,0),('yaw10',0,0,10,0),('lateral5',0,5,0,0),('lateral10',0,10,0,0),('pitch5',0,0,0,5),('pitch10',0,0,0,10),('combined',-17,5,5,5)]
def rotate(shape,axis,degrees):
 tr=gp_Trsf();tr.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(*axis)),math.radians(degrees));return BRepBuilderAPI_Transform(shape,tr,True).Shape()
def distance(a,b):
 d=BRepExtrema_DistShapeShape(a,b);d.Perform()
 if not d.IsDone():raise ValueError('distance failed')
 return d.Value()
def report():
 rows=[]
 for year,hx,hy,h in [(2024,177.8,177.8,50.8),(2025,150.8125,57.15,114.3),(2026,75,75,150)]:
  gateface=400-hx-20;frontface=400+hx;start=gateface-16;length=frontface+56-start;wide=2*(hy+10)
  gate_sweep=n.box(gateface-6,-hy-10,0,6,wide,2*h+30)
  pad_l=n.box(330,-hy-6,h/2-15,140,6,30);pad_r=n.box(330,hy,h/2-15,140,6,30)
  sweep_l=n.box(330,-hy-16,h/2-15,140,16,30);sweep_r=n.box(330,hy,h/2-15,140,16,30)
  left=n.BRepAlgoAPI_Cut(n.box(start,-hy-16,0,length,6,h+10),n.box(329,-hy-17,h/2-16,142,8,32)).Shape()
  right=n.BRepAlgoAPI_Cut(n.box(start,hy+10,0,length,6,h+10),n.box(329,hy+9,h/2-16,142,8,32)).Shape()
  for label,dx,dy,yaw,pitch in POSES:
   a=math.radians(pitch)
   if year==2024:piece=n.BRepPrimAPI_MakeTorus(gp_Ax2(gp_Pnt(0,0,0),gp_Dir(0,0,1)),152.4,25.4).Shape();z=25.4+152.4*abs(math.sin(a))
   elif year==2025:
    ax=gp_Ax2(gp_Pnt(-hx,0,0),gp_Dir(1,0,0));piece=n.BRepAlgoAPI_Cut(n.BRepPrimAPI_MakeCylinder(ax,57.15,2*hx).Shape(),n.BRepPrimAPI_MakeCylinder(ax,50.8,2*hx).Shape()).Shape();z=hx*abs(math.sin(a))+57.15*abs(math.cos(a))
   else:piece=n.BRepPrimAPI_MakeSphere(gp_Pnt(0,0,0),75).Shape();z=75
   piece=n.move(rotate(rotate(piece,(0,1,0),pitch),(0,0,1),yaw),400+dx,dy,z)
   intersections={name:n.common(piece,shape) for name,shape in [('gate-sweep',gate_sweep),('left-pad-sweep',sweep_l),('right-pad-sweep',sweep_r),('left-guide',left),('right-guide',right)]}
   rows.append(dict(season=year,pose=label,feedOffsetMm=dx,lateralOffsetMm=dy,yawDeg=yaw,pitchDeg=pitch,floorRestingCenterHeightMm=z,nominalOneDimensionalGateGuardWouldAllow=dx>-18,intersectionVolumesMm3=intersections,leftClosedPadGapMm=distance(piece,pad_l),rightClosedPadGapMm=distance(piece,pad_r)))
 return dict(schema='frc-catcher-native-swept-pose-screen/v1',status='executed-native-conservative-swept-envelope-screen',runtime=dict(python=sys.version,ocp=OCP.__version__),sourceCodeSha256={name:hashlib.sha256((ROOT/name).read_text(encoding='utf-8-sig').encode()).hexdigest() for name in ['scripts/native-catcher-sweep.py','scripts/native-catcher-envelopes.py','scripts/prepare-segmented-replay.py']},geometryEvidenceSha256=n.p.evidence(),layoutReceiptSha256=hashlib.sha256((ROOT/'case-studies/native-catcher-envelopes.json').read_text(encoding='utf-8-sig').encode()).hexdigest(),cases=rows,
  interpretation=['Gate and pad translational swept volumes are exact boxes for the prescribed straight strokes; tested against static posed rigid game-piece envelopes','Zero intersection certifies only static-pose swept-volume separation; positive intersection flags possible obstruction/compression, not a time-resolved collision','Yaw/pitch/lateral/feed offsets are hypothetical test inputs, not measured tolerances','Poses are raised to ideal floor tangency; gravity, deformation and moving-piece/gate timing not simulated','Pad gaps or overlaps challenge the assumed normal preload/friction; neither establishes actual force','This screen does not update the one-dimensional control/force model to full6DOF'],calibration=None,engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('new output required')
 r=report();out.write_text(json.dumps(r,indent=2,allow_nan=False)+'\n');print(json.dumps([x for x in r['cases'] if x['pose'] in ['yaw5-tail-margin','pitch10','lateral5']],indent=2))
