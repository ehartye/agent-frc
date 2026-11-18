"""Combined original six-station FUEL layout; no physical/engineering acceptance."""
import importlib.util,pathlib,tempfile,urllib.request,hashlib,json,math,sys,importlib.metadata
spec=importlib.util.spec_from_file_location('support',pathlib.Path(__file__).with_name('inspect-support-stack.py'));s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);a=s.a;b=s.b
SOURCES={key:('https://www.revrobotics.com/content/cad/'+part+'.STEP',pin) for key,(part,pin) in s.SOURCES.items()}
SOURCES['wheel']=b.SOURCES['wheel']

def run():
 code_files=['inspect-combined-bank.py','inspect-support-stack.py','inspect-accessory-stack.py','inspect-wheel-stack.py']
 def code_pins():return {n:hashlib.sha256(pathlib.Path(__file__).with_name(n).read_text(encoding='utf-8-sig').encode('utf-8')).hexdigest() for n in code_files}
 pins=code_pins();shapes={};records={};parts={}
 with tempfile.TemporaryDirectory(prefix='frc-combined-') as td:
  for key,(url,pin) in SOURCES.items():
   raw=urllib.request.urlopen(url,timeout=60).read();sha=hashlib.sha256(raw).hexdigest()
   if sha!=pin:raise ValueError('Changed source '+key)
   f=pathlib.Path(td)/(key+'.step');f.write_bytes(raw);r=b.STEPControl_Reader()
   if r.ReadFile(str(f))!=b.IFSelect_RetDone or r.TransferRoots()!=1:raise RuntimeError('STEP transfer failed')
   shapes[key]=r.OneShape();records[key]=dict(url=url,sha256=sha,bytes=len(raw))
  templates={'w':shapes['wheel'],'hL':b.transformed(shapes['hub'],-1,0),'hR':b.transformed(shapes['hub'],1,180),'sR':a.pose(shapes['socket'],-11.90625,-12.7,side=-1),'sL':a.pose(shapes['socket'],11.90625,12.7,side=1)}
  shaft=s.shaft_envelope();rot=b.gp_Trsf();rot.SetRotation(b.gp_Ax1(b.gp_Pnt(0,0,0),b.gp_Dir(1,0,0)),math.pi/6)
  parts['shaft']=b.BRepBuilderAPI_Transform(shaft,rot,True).Shape()
  centers=[-87.3125,-52.3875,-17.4625,17.4625,52.3875,87.3125]
  for i,c in enumerate(centers):
   parts[f'w{i}']=s.translate(shapes['wheel'],c)
   parts[f'hL{i}']=s.translate(b.transformed(shapes['hub'],-1,0),c)
   parts[f'hR{i}']=s.translate(b.transformed(shapes['hub'],1,180),c)
   parts[f'sR{i}']=a.pose(shapes['socket'],c-11.90625,-12.7,side=-1)
   parts[f'sL{i}']=a.pose(shapes['socket'],c+11.90625,12.7,side=1)
   if i<5:parts[f'spacer{i}']=s.ring(6.35,c+14.2875)
  parts['endR']=s.ring(19.43125,101.6);parts['endL']=s.ring(19.43125,-121.03125)
  for side in [-1,1]:
   parts[f'bearing{side}']=a.pose(shapes['bearing'],side*125,side=side)
   parts[f'collar{side}']=a.pose(shapes['collar'],side*132.14375,side=side)
  # Explicit translation equivalence metadata: only repeated wheel/hub/screw units.
  repeat={}
  for i,c in enumerate(centers):
   for kind in ['w','hL','hR','sL','sR']:repeat[f'{kind}{i}']=(kind,c)
  cache={};reused=0
  bounds={k:b.bounds(v) for k,v in parts.items()};tested=[];culled=0;expected=[];unexpected=[]
  names=list(parts)
  for i,k in enumerate(names):
   for m in names[i+1:]:
    lo=bounds[k];hi=bounds[m]
    if any(lo[j+3]<hi[j]-1e-6 or hi[j+3]<lo[j]-1e-6 for j in range(3)):
     culled+=1;continue
    signature=None;anchor=None;reuse_basis='rigid-translation'
    if k=='shaft' and m in repeat and bounds[m][0]>-150 and bounds[m][3]<150:
     signature=('uniform-original-shaft',repeat[m][0]);anchor=repeat[m][1];reuse_basis='uniform-prism-local-intersection-with-part-strictly-inside-shaft-ends'
    elif k in repeat and m in repeat:
     tk,xk=repeat[k];tm,xm=repeat[m];signature=(tk,tm,round(xm-xk,8));anchor=xk
    if signature is not None and signature in cache:
     source_pair,source_x,source_ov=cache[signature];delta=anchor-source_x
     ov=dict(source_ov)
     if ov['boundsMm'] is not None:ov['boundsMm']=[v+delta if j in [0,3] else v for j,v in enumerate(ov['boundsMm'])]
     reused+=1;item=dict(parts=[k,m],**ov,reusedRigidTranslationOf=source_pair,translationXMm=delta,reuseBasis=reuse_basis)
    else:
     print('native pair',k,m,flush=True,file=__import__('sys').stderr)
     if k in repeat and m in repeat:
      tk,xk=repeat[k];tm,xm=repeat[m]
      ov=a.overlap(templates[tk],s.translate(templates[tm],xm-xk));normalization=xk
     elif k=='shaft' and m in repeat and signature is not None:
      ov=a.overlap(parts['shaft'],templates[repeat[m][0]]);normalization=repeat[m][1]
     else:
      ov=a.overlap(parts[k],parts[m]);normalization=0
     if ov['boundsMm'] is not None:ov['boundsMm']=[v+normalization if j in [0,3] else v for j,v in enumerate(ov['boundsMm'])]
     item=dict(parts=[k,m],**ov,localFrameTranslatedXMm=normalization)
     if signature is not None:cache[signature]=([k,m],anchor,dict(ov))
    # Only modeled screw major-diameter solid inside intended tapped counterpart is classified separately.
    intentional=any(set([k,m])==set(pair) for n in range(6) for pair in [(f'sR{n}',f'hL{n}'),(f'sL{n}',f'hR{n}')])
    item['classification']='thread-proxy-pair-not-engagement-proof' if intentional else 'nonthread-interface'
    tested.append(item)
    if ov['volumeMm3']>1e-6:(expected if intentional else unexpected).append(item)
  if pins!=code_pins():raise RuntimeError('Source code changed during execution')
  return dict(sourceCodeSha256=pins,sourceCodePinBasis='UTF-8 text without BOM, universal newlines normalized to LF',runtime=dict(python=sys.version,ocp=importlib.metadata.version('cadquery-ocp')),instanceBoundsMm=bounds,nativeCommonCalls=len(tested)-reused,schema='frc-combined-fuel-local-frame-evidence/v1',sourceRecords=records,partCount=len(parts),pairCount=len(names)*(len(names)-1)//2,boundingBoxCulled=culled,equivalenceReused=reused,pairEvidence=tested,threadProxyOverlaps=expected,unexpectedOverlaps=unexpected,
    geometryGate='rejected' if unexpected else 'no-unexpected-nominal-solid-intersections',engineeringAcceptance='blocked',
    originalSpacers='17mmOD/14mmID with6.35mm inter-wheel and19.43125mm end lengths; no material/SKU/tolerances',
    limitations=['Nominal external shaft only, no hollow bore, mass or end features','No housings, retainer, drivetrain or mounting screws','No thread engagement, axial preload, fit tolerances, face contact or tool access accepted','Wheel material/hardness source conflict unresolved','No contact validity transferred; no dynamic simulation or real fit proven'],vendorAssetsRetained=False,priorAttempt='Global-coordinate booleans did not complete in bounded attempts; stopped without result. This run evaluates source templates in local frames, with rigid-translation/unit and uniform-prism local-section equivalence. It is not a completed global-coordinate exhaustive replay.')
if __name__=='__main__':print(json.dumps(run(),indent=2))
