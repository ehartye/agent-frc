"""Actual native fixed fixture plus offline IO. Held-in-nip only; release remains unsupported."""
import argparse,pathlib,json,hashlib,os,subprocess,shutil,sys,time,importlib.util,unittest,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
EXPECTED=json.loads(r''' {
 "schema":"frc-fuel-intake-experiment/v1",
 "basis":"uncalibrated-original-fixed-planar-contact-experiment",
 "massSelection":"manual-range-midpoint-not-measured",
 "sphereInertia":"assumed-uniform-solid-sphere",
 "normalLaw":"k*positive(overlap)*positive(1+d*overlapRate)",
 "tangentLaw":"-mu*normalForce*tanh(slip/regularizationSpeed)",
 "gravityMps2":9.80665,
 "floor":{"stiffnessNpm":50000,"dissipationSpm":5,"mu":0.4},
 "wall":{"stiffnessNpm":50000,"dissipationSpm":5,"mu":0.2},
 "roller":{"stiffnessNpm":5000,"dissipationSpm":5,"mu":0.8},
 "regularizationMps":0.01,
 "initial":{"xM":-0.06,"zM":0.075,"vxMps":0.15,"vzMps":0,"sphereOmegaRadps":0,"rollerOmegaRadps":0},
 "supply":{"openCircuitVolts":12,"resistanceOhm":0.02,"motor":"WPILib-2026.2.1-getNEO-1","neutral":"ideal-short-brake","regeneration":"unsupported-reject"},
 "controller":{"periodSeconds":0.02,"acquireDuty":-0.12,"reverseDuty":0.12,"nipBeamXM":0.072,"exitBeamXM":-0.10},
 "holdObservation":{"startSeconds":0.72,"endSeconds":1.30,"xAbsMaxM":0.005,"vxAbsMaxMps":0.002,"rollerNormalMinN":5},
 "integration":{"stepSeconds":0.0001,"refinementStepSeconds":0.00005,"maxOverlapM":0.008},
 "perturbationEnvelope":"none-tested; one declared incoming-state trajectory only",
 "releaseStatus":"unsupported-regeneration; expected rejection is not successful release",
 "capture":null,
 "backstopRetentionEstablished":false,
 "engineeringAcceptance":"blocked"
}
''')
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
 files=[ROOT/p for p in ['scripts/run-fuel-intake.py','scripts/test-fuel-intake-contract.py','scripts/intake-fixture-cad.py','scripts/test-intake-fixture-cad.py','scripts/season-mechanism-cad.py','docs/fuel-intake-contact.md','references/fuel-intake-experiment.json','case-studies/2026/intake-fixture-compressed.json','case-studies/2026/intake-fixture-nominal.json']]+list((project/'src').rglob('*.java'))+[project/p for p in ['build.gradle','settings.gradle','gradle.properties','gradle.lockfile','gradlew.bat','gradle/wrapper/gradle-wrapper.jar','gradle/wrapper/gradle-wrapper.properties']]
 pins={str(p.relative_to(ROOT)):sha(p) for p in files};receipt={'schema':'frc-fuel-intake-execution/v1','status':'running','sourcePins':pins,'python':sys.version,'javaExecutableSha256':sha(pathlib.Path(a.java_home)/'bin/java.exe'),'engineeringAcceptance':'blocked','actualRobotIoExecuted':False,'fieldGeometryUsed':False,'wholeRobotValidated':False,'capture':None,'score':None,'hold':'one-bounded-held-in-nip-trajectory','release':'unsupported-regeneration','backstopRetentionEstablished':False,'calibration':'none','requiredDomains':{'physics':'partial-assumed-compliant-point-contact','voltage':'partial-ideal-bridge-no-regeneration','heat':'unsupported','friction':'assumed-unvalidated','weightDistribution':'unsupported-fixed-fixture'}}
 def save():(out/'execution-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  e=json.loads((ROOT/'references/fuel-intake-experiment.json').read_text(encoding='utf-8-sig'));validate(e);shutil.copyfile(ROOT/'references/fuel-intake-experiment.json',out/'experiment.json')
  spec=importlib.util.spec_from_file_location('contract',ROOT/'scripts/test-fuel-intake-contract.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with (out/'contract-tests.log').open('w') as log:r=unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromModule(module))
  counts={'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped)};check(counts=={'tests':4,'failures':0,'errors':0,'skipped':0},'Contract checks missing/failed');(out/'contract-tests.json').write_text(json.dumps(counts))
  env=os.environ.copy();env.update(JAVA_HOME=a.java_home,GRADLE_USER_HOME=a.gradle_home,FRC_INTAKE_OUTPUT=str(out),FRC_INTAKE_CAD_TEST_REPORT=str(out/'native-tests.json'))
  with (out/'native-tests.log').open('w') as log:subprocess.run([sys.executable,str(ROOT/'scripts/test-intake-fixture-cad.py')],env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
  check(json.loads((out/'native-tests.json').read_text())=={'tests':7,'failures':0,'errors':0,'skipped':0},'Native checks missing/failed')
  native={};native_pins={}
  for variant in ('compressed','nominal'):
   with (out/(variant+'.log')).open('w') as log:subprocess.run([sys.executable,str(ROOT/'scripts/intake-fixture-cad.py'),str(ROOT/f'case-studies/2026/intake-fixture-{variant}.json'),str(out/variant)],env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
   nr=json.loads((out/variant/'receipt.json').read_text());check(nr['status']=='passed','Native execution required');check(nr['sourceSha256']==sha(ROOT/'scripts/intake-fixture-cad.py'),'Native source mismatch');check(all(sha(ROOT/k)==v for k,v in nr['contextFileHashes'].items()),'Native context changed');native[variant]=json.loads((out/variant/'properties.json').read_text());check(nr['cadSha256']==sha(out/variant/'fixture.step') and nr['propertiesSha256']==sha(out/variant/'properties.json'),'Native output mismatch')
   native_pins.update({str(p.relative_to(out)):sha(p) for p in (out/variant).rglob('*') if p.is_file()})
  c=native['compressed'];n=native['nominal'];r=c['roller'];piece=c['pieceSource'];check(c['variant']=='compressed' and n['variant']=='nominal' and c['assemblyComplete'] is False and c['captureEstablished'] is False,'Native scope mismatch');check(piece['type']=='FUEL' and piece['geometryMm']=={'diameter':150.0} and piece['source']['sha256']=='5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139','Reviewed FUEL source required');check(abs(r['shaftInertiaKgM2']-n['roller']['shaftInertiaKgM2'])<1e-12,'Control inertia differs')
  params={'schema':'frc-fuel-intake-input/v1','massKg':(piece['massMinKg']+piece['massMaxKg'])/2,'sphereRadiusM':piece['geometryMm']['diameter']/2000,'rollerRadiusM':r['outerRadiusMm']/1000,'rollerInertiaKgM2':r['shaftInertiaKgM2'],'rollerZM':r['axisOriginMm'][2]/1000,'nominalRollerZM':n['roller']['axisOriginMm'][2]/1000,'wallXM':next(f for f in c['analyticContactFaces'] if f['id']=='backstop-inner')['pointMm'][0]/1000,'gear':r['gearRatio'],'compressedPropertiesSha256':sha(out/'compressed/properties.json'),'nominalPropertiesSha256':sha(out/'nominal/properties.json'),'experimentSha256':sha(out/'experiment.json')};(out/'input.properties').write_text(''.join(f'{k}={v}\n' for k,v in params.items()));input_hash=sha(out/'input.properties')
  with (out/'java.log').open('w') as log:subprocess.run(['cmd','/c',str(project/'gradlew.bat'),'fuelIntakeTest','dependencyManifest','--offline','--rerun-tasks'],cwd=project,env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
  xml=project/'build/test-results/fuelIntakeTest/TEST-org.agentfrc.lesson.FuelIntakeTest.xml';x=ET.parse(xml).getroot();check(int(x.attrib['tests'])==9 and all(int(x.attrib.get(k,0))==0 for k in ['failures','errors','skipped']),'Required Java checks missing/failed');shutil.copyfile(xml,out/'tests.xml');shutil.copyfile(project/'build/dependency-manifest.json',out/'dependency-manifest.json')
  observed=dict(line.split('=',1) for line in (out/'result.properties').read_text().splitlines() if line and not line.startswith('#'));check(observed['inputSha256']==input_hash==sha(out/'input.properties'),'Consumed input mismatch')
  for name in ('FuelIntakeController','FuelIntakePlant','FuelIntakeRig'):check(observed[name+'ClassSha256']==sha(project/f'build/classes/java/main/org/agentfrc/lesson/{name}.class'),'Executed class mismatch')
  check(observed['release']=='unsupported-regeneration' and observed['capture']=='unestablished','Outcome promotion forbidden');check(pins=={p:sha(ROOT/p) for p in pins} and native_pins=={p:sha(out/p) for p in native_pins},'Source/native inputs changed')
  for variant in ('compressed','nominal'):
   nr=json.loads((out/variant/'receipt.json').read_text());check(all(sha(ROOT/k)==v for k,v in nr['contextFileHashes'].items()),'Native context changed after consumption')
  check(sha(out/'experiment.json')==sha(ROOT/'references/fuel-intake-experiment.json'),'Retained experiment differs from reviewed source')
  receipt.update(status='executed-development-checks',actualRobotIoExecuted=True,nativeFiles=native_pins,outputs={str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and p!=out/'execution-receipt.json'})
 except Exception as error:receipt.update(status='failed',errorType=type(error).__name__);raise
 finally:receipt['finishedUnixSeconds']=time.time();save()
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
