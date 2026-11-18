"""Actual ideal torus NOTE fixture and offline IO; no capture or scoring."""
import argparse,pathlib,json,hashlib,os,subprocess,shutil,sys,time,importlib.util,unittest,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
EXPECTED={'schema': 'frc-note-contact-experiment/v1', 'basis': 'unvalidated-fixed-exterior-contact-hypothesis', 'orientation': 'flat-axis-Z-locked-at-Y0-external-zero-angular-work-constraint', 'massSelection': 'source-interval-midpoint-not-native-volume-or-measured', 'floorMu': [0, 0.2, 0.4, 0.8], 'floorStiffnessNpm': 50000, 'rollerStiffnessNpm': 5000, 'dissipationSpm': 5, 'rollerMu': 0.8, 'regularizationMps': 0.01, 'initial': {'xM': -0.22, 'zM': 0.0254, 'vxMps': 0.15}, 'controller': {'periodSeconds': 0.02, 'duty': -0.12, 'beamXM': 0.0, 'requiredCompletePulses': 2}, 'horizonSeconds': 4.4, 'dtSeconds': [0.0001, 5e-05], 'contactScope': 'full-span-exterior-ring-projection; aggregate-law-no-double-count; tilt/lateral/endcaps unsupported', 'constants': 'fixed-source-pinned-model-not-general-JSON-parameter-API', 'capture': None, 'score': None, 'engineeringAcceptance': 'blocked'}

def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def check(ok,msg):
 if not ok:raise ValueError(msg)
def exact(a,b):
 if type(b) in (int,float):return type(a) in (int,float) and a==b
 if type(b) is dict:return type(a) is dict and set(a)==set(b) and all(exact(a[k],b[k]) for k in b)
 if type(b) is list:return type(a) is list and len(a)==len(b) and all(exact(x,y) for x,y in zip(a,b))
 return type(a) is type(b) and a==b
def validate(e):check(exact(e,EXPECTED),'Only the explicit reviewed experiment is supported; changes require new review')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--java-home',required=True);ap.add_argument('--gradle-home',required=True);a=ap.parse_args();out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=False);project=ROOT/'examples/java-2026-sim'
 files=[ROOT/p for p in ['scripts/run-note-contact.py','scripts/test-note-contact-runner.py','scripts/note-fixture-cad.py','scripts/test-note-fixture-cad.py','scripts/season-mechanism-cad.py','docs/note-contact.md','case-studies/2024/note-contact-experiment.json','case-studies/2024/note-fixture-compressed.json','case-studies/2024/note-fixture-nominal.json']]+list((project/'src').rglob('*.java'))+[project/p for p in ['build.gradle','settings.gradle','gradle.properties','gradle.lockfile','gradlew.bat','gradle/wrapper/gradle-wrapper.jar','gradle/wrapper/gradle-wrapper.properties']]
 pins={str(p.relative_to(ROOT)):sha(p) for p in files};receipt={'schema':'frc-note-contact-execution/v1','status':'running','sourcePins':pins,'python':sys.version,'javaExecutableSha256':sha(pathlib.Path(a.java_home)/'bin/java.exe'),'engineeringAcceptance':'blocked','actualRobotIoExecuted':False,'fieldGeometryUsed':False,'wholeRobotValidated':False,'capture':None,'score':None,'outcomeScope':'bounded-axial-advance-not-capture-or-scoring','calibration':'none','requiredDomains':{'physics':'partial-assumed-compliant-point-contact','voltage':'partial-ideal-bridge-no-regeneration','heat':'unsupported','friction':'assumed-unvalidated','weightDistribution':'unsupported-fixed-fixture'}}
 def save():(out/'execution-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  e=json.loads((ROOT/'case-studies/2024/note-contact-experiment.json').read_text(encoding='utf-8-sig'));validate(e);shutil.copyfile(ROOT/'case-studies/2024/note-contact-experiment.json',out/'experiment.json')
  spec=importlib.util.spec_from_file_location('contract',ROOT/'scripts/test-note-contact-runner.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with (out/'contract-tests.log').open('w') as log:r=unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromModule(module))
  counts={'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped)};check(counts=={'tests':4,'failures':0,'errors':0,'skipped':0},'Contract checks missing/failed');(out/'contract-tests.json').write_text(json.dumps(counts))
  env=os.environ.copy();env.update(JAVA_HOME=a.java_home,GRADLE_USER_HOME=a.gradle_home,FRC_NOTE_OUTPUT=str(out),FRC_NOTE_CAD_TEST_REPORT=str(out/'native-tests.json'))
  with (out/'native-tests.log').open('w') as log:subprocess.run([sys.executable,str(ROOT/'scripts/test-note-fixture-cad.py')],env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
  check(json.loads((out/'native-tests.json').read_text())=={'tests':9,'failures':0,'errors':0,'skipped':0},'Native checks missing/failed')
  native={};native_pins={}
  for variant in ('compressed','nominal'):
   with (out/(variant+'.log')).open('w') as log:subprocess.run([sys.executable,str(ROOT/'scripts/note-fixture-cad.py'),str(ROOT/f'case-studies/2024/note-fixture-{variant}.json'),str(out/variant)],env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
   nr=json.loads((out/variant/'receipt.json').read_text());check(nr['status']=='passed','Native execution required');check(nr['sourceSha256']==sha(ROOT/'scripts/note-fixture-cad.py'),'Native source mismatch');check(all(sha(ROOT/k)==v for k,v in nr['contextFileHashes'].items()),'Native context changed');native[variant]=json.loads((out/variant/'properties.json').read_text());check(nr['cadSha256']==sha(out/variant/'fixture.step') and nr['propertiesSha256']==sha(out/variant/'properties.json'),'Native output mismatch')
   native_pins.update({str(p.relative_to(out)):sha(p) for p in (out/variant).rglob('*') if p.is_file()})
  c=native['compressed'];n=native['nominal'];r=c['roller'];piece=c['pieceSource'];proxy=c['noteProxy'];floor=c['analyticContactFaces'][0]['domainMm']['x']
  check(c['variant']=='compressed' and n['variant']=='nominal' and c['assemblyComplete'] is False and c['captureEstablished'] is False,'Native scope mismatch')
  check(piece['type']=='NOTE' and piece['source']['sha256']=='1b7e1dc3fe1b1bd64d97a482d7e78eb419ec77d611a15226a16b0c7011069b94' and proxy['nativeMassKg'] is None and proxy['densityKgM3'] is None,'Reviewed torus NOTE source and independent mass required')
  check(abs(r['shaftInertiaKgM2']-n['roller']['shaftInertiaKgM2'])<1e-12,'Control inertia differs')
  params={'schema':'frc-note-contact-input/v1','massKg':(piece['massMinKg']+piece['massMaxKg'])/2,'majorRadiusM':proxy['majorRadiusMm']/1000,'minorRadiusM':proxy['minorRadiusMm']/1000,'rollerSpanM':r['lengthMm']/1000,'initialXM':proxy['centerMm'][0]/1000,'initialZM':proxy['centerMm'][2]/1000,'rollerRadiusM':r['outerRadiusMm']/1000,'rollerInertiaKgM2':r['shaftInertiaKgM2'],'rollerZM':r['axisOriginMm'][2]/1000,'nominalRollerZM':n['roller']['axisOriginMm'][2]/1000,'nominalRollerInertiaKgM2':n['roller']['shaftInertiaKgM2'],'gear':r['gearRatio'],'floorMinXM':floor[0]/1000,'floorMaxXM':floor[1]/1000,'compressedPropertiesSha256':sha(out/'compressed/properties.json'),'nominalPropertiesSha256':sha(out/'nominal/properties.json'),'experimentSha256':sha(out/'experiment.json')};(out/'input.properties').write_text(''.join(f'{k}={v}\n' for k,v in params.items()));input_hash=sha(out/'input.properties')
  with (out/'java.log').open('w') as log:subprocess.run(['cmd','/c',str(project/'gradlew.bat'),'noteContactTest','dependencyManifest','--offline','--rerun-tasks'],cwd=project,env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
  xml=project/'build/test-results/noteContactTest/TEST-org.agentfrc.lesson.NoteContactTest.xml';x=ET.parse(xml).getroot();check(int(x.attrib['tests'])==10 and all(int(x.attrib.get(k,0))==0 for k in ['failures','errors','skipped']),'Required Java checks missing/failed');shutil.copyfile(xml,out/'tests.xml');shutil.copyfile(project/'build/dependency-manifest.json',out/'dependency-manifest.json')
  observed=dict(line.split('=',1) for line in (out/'result.properties').read_text().splitlines() if line and not line.startswith('#'));check(observed['inputSha256']==input_hash==sha(out/'input.properties'),'Consumed input mismatch')
  for name in ('NoteAdvanceController','NoteContactPlant','NoteContactRig'):check(observed[name+'ClassSha256']==sha(project/f'build/classes/java/main/org/agentfrc/lesson/{name}.class'),'Executed class mismatch')
  check(observed['capture']=='unestablished' and observed['engineeringAcceptance']=='blocked','Outcome promotion forbidden');check(pins=={p:sha(ROOT/p) for p in pins} and native_pins=={p:sha(out/p) for p in native_pins},'Source/native inputs changed')
  for variant in ('compressed','nominal'):
   nr=json.loads((out/variant/'receipt.json').read_text());check(all(sha(ROOT/k)==v for k,v in nr['contextFileHashes'].items()),'Native context changed after consumption')
  check(sha(out/'experiment.json')==sha(ROOT/'case-studies/2024/note-contact-experiment.json'),'Retained experiment differs from reviewed source')
  receipt.update(status='executed-development-checks',actualRobotIoExecuted=True,nativeFiles=native_pins,outputs={str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and p!=out/'execution-receipt.json'})
 except Exception as error:receipt.update(status='failed',errorType=type(error).__name__);raise
 finally:receipt['finishedUnixSeconds']=time.time();save()
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
