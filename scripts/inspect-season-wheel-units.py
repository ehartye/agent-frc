"""Pinned 2024/2025 representative wheel units; not entire assemblies."""
import importlib.util,pathlib,tempfile,urllib.request,hashlib,json,math
spec=importlib.util.spec_from_file_location('s',pathlib.Path(__file__).with_name('inspect-support-stack.py'));s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);a=s.a;b=s.b
SOURCES={
'note':('https://www.revrobotics.com/content/cad/Compliant-Wheel-4in-MAXSpline.STEP','408544394be77d3815d32ab360d8cbb975ccf847366f0d02c77499dc33fe3bb2'),
'coral':('https://www.revrobotics.com/content/cad/REV-21-2030.STEP','31c85aa9eb59711c3119e0089d2865bb243f82126007d15e49e4189892882150'),
'hub':b.SOURCES['hub']}

def run():
 shapes={};records={}
 with tempfile.TemporaryDirectory(prefix='frc-season-units-') as td:
  for key,(url,pin) in SOURCES.items():
   raw=urllib.request.urlopen(url,timeout=60).read();sha=hashlib.sha256(raw).hexdigest()
   if sha!=pin:raise ValueError('Changed source '+key)
   f=pathlib.Path(td)/(key+'.step');f.write_bytes(raw);r=b.STEPControl_Reader()
   if r.ReadFile(str(f))!=b.IFSelect_RetDone or r.TransferRoots()!=1:raise RuntimeError('STEP transfer failed')
   shapes[key]=r.OneShape();records[key]=dict(url=url,sha256=sha,bytes=len(raw),boundsMm=b.bounds(shapes[key]))
  rawshaft=s.shaft_envelope();rot=b.gp_Trsf();rot.SetRotation(b.gp_Ax1(b.gp_Pnt(0,0,0),b.gp_Dir(1,0,0)),math.pi/6);shaft=b.BRepBuilderAPI_Transform(rawshaft,rot,True).Shape()
  lh=b.transformed(shapes['hub'],-1,0);rh=b.transformed(shapes['hub'],1,180)
  return dict(schema='frc-season-wheel-units/v1',sourceRecords=records,
   NOTE=dict(wheelLeftHub=a.overlap(shapes['note'],lh),wheelRightHub=a.overlap(shapes['note'],rh),wheelShaft=a.overlap(shapes['note'],shaft)),
   CORAL=dict(wheelShaftPhase0=a.overlap(shapes['coral'],rawshaft),wheelShaftPhase30=a.overlap(shapes['coral'],shaft),wheelEndSpacer=a.overlap(shapes['coral'],s.ring(6.35,6.35))),
   engineeringAcceptance='blocked',limitations=['Representative units only, not full2024/2025 banks or housings','Original shaft external envelope, no threads or mass','No material identification, force calibration, tolerance or load acceptance','CORAL shaft phase trials require compatible support orientations'])
if __name__=='__main__':print(json.dumps(run(),indent=2))
