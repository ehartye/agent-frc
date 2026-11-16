"""Source-pinned bare wheel placement in original retained catcher envelopes."""
import pathlib,json,math,hashlib,OCP
from OCP.gp import gp_Pnt,gp_Dir,gp_Ax1,gp_Ax2,gp_Trsf,gp_Vec
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox,BRepPrimAPI_MakeTorus,BRepPrimAPI_MakeCylinder,BRepPrimAPI_MakeSphere
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common,BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
ROOT=pathlib.Path(__file__).resolve().parents[1]
PINS=['scripts/retained-pregrip-fit.py','case-studies/lateral-pregrip-evidence.json','case-studies/native-catcher-envelopes.json','case-studies/2024/note-fixture-nominal.json','case-studies/2025/coral-fixture-nominal.json','case-studies/2026/intake-fixture-nominal.json']
def box(x,y,z,a,b,c):return BRepPrimAPI_MakeBox(gp_Pnt(x,y,z),a,b,c).Shape()
def move(s,x,y,z):
 t=gp_Trsf();t.SetTranslation(gp_Vec(x,y,z));return BRepBuilderAPI_Transform(s,t,True).Shape()
def bounds(s):
 b=Bnd_Box();BRepBndLib.AddOptimal_s(s,b,False,False);a,c=b.CornerMin(),b.CornerMax();return [a.X(),a.Y(),a.Z(),c.X(),c.Y(),c.Z()]
def common(a,b):
 op=BRepAlgoAPI_Common(a,b);op.Build()
 if not op.IsDone():raise ValueError('native boolean failure')
 p=GProp_GProps();BRepGProp.VolumeProperties_s(op.Shape(),p);return p.Mass()
def distance(a,b):
 d=BRepExtrema_DistShapeShape(a,b);d.Perform()
 if not d.IsDone():raise ValueError('native distance failure')
 return d.Value()
def piece(y,hx,h):
 if y==2024:return BRepPrimAPI_MakeTorus(gp_Ax2(gp_Pnt(400,0,h/2),gp_Dir(0,0,1)),152.4,25.4).Shape()
 if y==2025:
  ax=gp_Ax2(gp_Pnt(400-hx,0,h/2),gp_Dir(1,0,0));return BRepAlgoAPI_Cut(BRepPrimAPI_MakeCylinder(ax,57.15,2*hx).Shape(),BRepPrimAPI_MakeCylinder(ax,50.8,2*hx).Shape()).Shape()
 return BRepPrimAPI_MakeSphere(gp_Pnt(400,0,h/2),75).Shape()
def environment(hx,hy,h,slot):
 start=400-hx-36;length=2*hx+92;wide=2*(hy+10)
 guides={}
 for sign in (-1,1):
  low=-hy-16 if sign<0 else hy+10;cutlow=-hy-17 if sign<0 else hy+9
  guides['guide'+str(sign)]=BRepAlgoAPI_Cut(box(start,low,0,length,6,h+10),box(329,cutlow,h/2-slot/2,142,8,slot)).Shape()
 return dict(floor=box(start,-hy-16,-6,length,wide+12,6),gate=box(400-hx-26,-hy-10,0,6,wide,h+10),bumper=box(400+hx,-hy-10,0,6,wide,h+10),**guides)
def report(cad_dir):
 e=json.loads((ROOT/PINS[1]).read_text());layout=json.loads((ROOT/PINS[2]).read_text());records=[];sweeps=[];vertical=[];belts=[]
 for y in (2024,2025,2026):
  source=e['wheelSources'][str(y)];p=pathlib.Path(cad_dir)/f'{y}-wheel.step'
  if hashlib.sha256(p.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('CAD revision mismatch')
  reader=STEPControl_Reader()
  if reader.ReadFile(str(p))!=IFSelect_RetDone or reader.TransferRoots()!=1:raise ValueError('CAD import')
  raw=reader.OneShape();raw_bounds=bounds(raw);tr=gp_Trsf();tr.SetRotation(gp_Ax1(gp_Pnt(0,0,0),gp_Dir(0,1,0)),-math.pi/2);wheel=BRepBuilderAPI_Transform(raw,tr,True).Shape();wb=bounds(wheel);radius=max(abs(wb[0]),abs(wb[3]),abs(wb[1]),abs(wb[4]));half_width=max(abs(wb[2]),abs(wb[5]));c=layout['cases'][str(y)];hx=c['gamePieceHalfExtentXmm'];hy=c['gamePieceHalfExtentYmm'];h=c['pieceHeightMm'];body=piece(y,hx,h);closed=hy+radius-1
  env=environment(hx,hy,h,32)
  for sign in (-1,1):
   placed=move(wheel,400,sign*closed,h/2);oldpad=box(330,-hy-6 if sign<0 else hy,h/2-15,140,6,30)
   records.append(dict(season=y,side=sign,wheelSourceSha256=source['sha256'],nativeUnrotatedBoundsMm=raw_bounds,bodyCenterMm=[400,0,h/2],wheelCenterMm=[400,sign*closed,h/2],nativeBodyIntersectionMm3=common(body,placed),nativeOldPadIntersectionMm3=common(oldpad,placed),nativeFloorDistanceMm=distance(placed,env['floor']),nativeOriginalGuideDistanceMm=distance(placed,env['guide'+str(sign)]),forceValidity=None))
   # AABB contains every translated orientation-fixed wheel;4mm expands for2mm total translation error and2mm required clearance.
   ymin=-closed-60-radius-4 if sign<0 else closed-radius-4
   sweep=box(400-radius-4,ymin,h/2-half_width-4,2*radius+8,60+2*radius+8,2*half_width+8)
   for slot in (32,40):
    parts=environment(hx,hy,h,slot);intersections={name:common(sweep,part) for name,part in parts.items()}
    sweeps.append(dict(season=y,side=sign,slotHeightMm=slot,retractionMm=60,translationErrorNormMm=2,requiredClearanceMm=2,conservativeSweptBoxMm=bounds(sweep),obstructionVolumesMm3=intersections,envelopePass=all(v<1e-5 for v in intersections.values()),padRemoved=True,hardwareAcceptance=None))
  # The previous full-span top/bottom bank envelope is not the laterally mounted bare wheel.
  bottom=BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(400,-200,1-radius),gp_Dir(0,1,0)),radius,400).Shape()
  vertical.append(dict(season=y,previousBottomBankFloorIntersectionMm3=common(bottom,env['floor']),scope='continuous400mm bank hypothesis, not bare-wheel assembly'))
  belt=e['beltCandidates'][str(y)];spacing=(belt['pitchLengthMm']-100)/2;limit=spacing/2-40;belts.append(dict(season=y,part=belt['part'],pitchLengthMm=belt['pitchLengthMm'],pulleyCenterDistanceMm=spacing,openCarriageCenterAbsYmm=closed+60,maxCarriageCenterAbsYmm=limit,nominalPositionMarginMm=limit-closed-60,rollerOuterWidthMm=2*(closed+60+radius),installedLinkageFit=None))
 return dict(schema='frc-retained-lateral-pregrip-fit/v1',wheelRecords=records,sweptEnvelopes=sweeps,verticalNipCounterexamples=vertical,beltLayouts=belts,sourceCodeSha256={p:hashlib.sha256((ROOT/p).read_text(encoding='utf-8-sig').encode()).hexdigest() for p in PINS},runtimeOcp=OCP.__version__,limitations=['Actual pinned bare wheels only; hubs, shafts, bearings, motor mounts, guide rails and belt clamps are NOT assembled','Original catcher world retained at400mm and floor-resting body center; no relocation of the existing catcher','Side-pad volumes must be removed/replaced, so earlier pad-retention dynamics and control validation do not carry over','Swept AABB proof is conservative for fixed wheel orientation and60mm lateral translation;2mm total translation error plus2mm clearance only','32/40mm slot comparison is original modification, not manufacturing drawing or structural qualification','Body-wheel intersection is assumed rigid interference, not friction, preload or force acceptance','Belt path and footprint estimates do not establish actual opposed-leg linkage or packaging fit','Original FUEL moving-nip no-contact counterexample remains unchanged; retained pregrip is a different architecture needing fresh control/contact integration','No installed target transform or scoring'],engineeringAcceptance='blocked')
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--cad-dir',required=True);a.add_argument('--output',required=True);v=a.parse_args();p=pathlib.Path(v.output)
 with p.open('x',encoding='utf-8') as f:json.dump(report(v.cad_dir),f,indent=2,allow_nan=False);f.write('\n')
