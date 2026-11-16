"""Pinned native accessory interference diagnostic; no acceptance or vendor CAD export."""
import importlib.util, pathlib, tempfile, urllib.request, hashlib, json, math
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
spec=importlib.util.spec_from_file_location('wheel_stack',pathlib.Path(__file__).with_name('inspect-wheel-stack.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
SOURCES={
 'socket':('REV-29-2922','53bf4bac9c31d0d7c47bdaf50315612161f04bce4011e6704b5c93064733df40'),
 'screw':('REV-29-2951','89e2b6ad909e8bdcb66fb86a7948298c159ffb0fd8c6b00bac022a7e54550ea2'),
 'spacer':('REV-21-2005','6d9c91b22f6f0bb71bde31882890f4228690834c05d70adc6369b0fb0cc8c482'),
 'hub':('REV-21-2037','994be447326c5e10fa86f4d9addd0abc218dd82b7bef9efbcac9e8259c268807')}

def pose(s,x,y=0,side=1):
 t=b.gp_Trsf();t.SetRotation(b.gp_Ax1(b.gp_Pnt(0,0,0),b.gp_Dir(0,1,0)),side*math.pi/2)
 s=b.BRepBuilderAPI_Transform(s,t,True).Shape()
 t=b.gp_Trsf();t.SetTranslation(b.gp_Vec(x,y,0))
 return b.BRepBuilderAPI_Transform(s,t,True).Shape()

def overlap(a,c):
 op=b.BRepAlgoAPI_Common(a,c);op.Build()
 if not op.IsDone():raise RuntimeError('Native common failed')
 s=op.Shape();v=b.volume(s)
 return dict(volumeMm3=v,boundsMm=b.bounds(s) if v>1e-8 else None)

def run():
 shapes={};records={}
 with tempfile.TemporaryDirectory(prefix='frc-accessory-') as td:
  for key,(part,pin) in SOURCES.items():
   url='https://www.revrobotics.com/content/cad/'+part+'.STEP'
   raw=urllib.request.urlopen(url,timeout=60).read();sha=hashlib.sha256(raw).hexdigest()
   if sha!=pin:raise ValueError('Source changed: '+part)
   path=pathlib.Path(td)/(part+'.step');path.write_bytes(raw)
   r=b.STEPControl_Reader()
   if r.ReadFile(str(path))!=b.IFSelect_RetDone or r.TransferRoots()!=1:raise RuntimeError('STEP transfer failed')
   shapes[key]=r.OneShape();records[key]=dict(url=url,sha256=sha,bytes=len(raw),boundsMm=b.bounds(shapes[key]))
  hub=b.transformed(shapes['hub'],1,180)
  spacer=pose(shapes['spacer'],17.4625)
  screw=pose(shapes['screw'],13.49375-11.4173,-12.7)
  socket=pose(shapes['socket'],-11.90625,-12.7,side=-1)
  # Original analytic spacer, not a modified supplier asset or purchasable SKU.
  cut=BRepAlgoAPI_Cut(BRepPrimAPI_MakeCylinder(8.5,6.35).Shape(),BRepPrimAPI_MakeCylinder(7.0,6.35).Shape());cut.Build()
  if not cut.IsDone():raise RuntimeError('Analytic spacer construction failed')
  analytic=pose(cut.Shape(),14.2875)
  return dict(schema='frc-accessory-interference/v1',sourceRecords=records,
   placement='original hypothesis: right hub phase180; screw axis y=-12.7, native underside z11.4173 seated x13.49375; spacer center x17.4625',
   sourceDatums='button tip z=-13.9827 and underside z11.4173; socket tip z0 and underside z-25.4, reversed to point head outward; hypothetical seating',
   screwBoundsMm=b.bounds(screw),spacerBoundsMm=b.bounds(spacer),
   analyticSpacer=dict(odMm=17,idMm=14,widthMm=6.35,provenance='original analytic hypothesis; no supplier SKU',socketCommon=overlap(analytic,socket),hubCommon=overlap(analytic,hub),manufacturingAcceptance='blocked'),
   socketBoundsMm=b.bounds(socket),socketSpacer=overlap(socket,spacer),socketEntryHub=overlap(socket,hub),
   spacerScrew=overlap(spacer,screw),spacerHub=overlap(spacer,hub),screwEntryHub=overlap(screw,hub),
   engineeringAcceptance='blocked',nativeThreadEngagementChecked=False,vendorAssetsRetained=False,
   limitations=['Rejected candidate placement, not a complete assembly','Threads are simplified CAD solids; no thread engagement or torque proof','No shaft or wheel or supports included in this diagnostic','No prior contact validity transferred'])
if __name__=='__main__':print(json.dumps(run(),indent=2))
