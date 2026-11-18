"""Separate passive neutral-mode hypothesis; baseline and rejected reverse remain executed evidence."""
import argparse,pathlib,json,hashlib,os,subprocess,shutil,sys,time,importlib.util,unittest,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
EXPECTED=json.loads(r''' {
  "schema": "frc-passive-unload/v1",
  "basis": "separate-unvalidated-ideal-neutral-interface",
  "baselineCommit": "97b81e528fc8bc924f509c3abf9a1ea3fa4ea522",
  "baselineCanonicalLfSourcePins": {
    "examples/java-2026-sim/src/main/java/org/agentfrc/lesson/FuelIntakePlant.java": "747f05bb77da2f990ad84d113b8c200c2440a9384a6a847134c3e7cf4b1163fd",
    "examples/java-2026-sim/src/main/java/org/agentfrc/lesson/FuelIntakeController.java": "4f70ee9dbefe590f6b986ac5e520e0783f8ee382c7d9b36c0f2c90341215b3d6",
    "examples/java-2026-sim/src/main/java/org/agentfrc/lesson/FuelIntakeRig.java": "8b46696e311dbd27492dd23b36e2c0df6ea5a748bd337e290b780fe85239bc4f"
  },
  "policies": [
    "BRAKE",
    "OPEN"
  ],
  "commandDelayTicks": [
    0,
    1
  ],
  "controllerPeriodSeconds": 0.02,
  "requestTimeSeconds": 1.2,
  "horizonSeconds": 3.9,
  "dtSeconds": [
    0.0001,
    5e-05
  ],
  "modeInterface": "simulation-only-no-REV-CAN-adapter",
  "openRule": "duty-zero-required; armature-current/bus-current/electromagnetic-torque-zero",
  "disableRule": "immediate-priority-ideal-brake-and-latched-fault; not-hardware-safe-proof",
  "assessment": {
    "clearanceM": 0.005,
    "minimumSeparatingSpeedMps": 0.01,
    "noRecontactSeconds": 0.2,
    "sampling": "every-integrated-substep; not-physical-continuity-proof"
  },
  "manufacturerSource": {
    "url": "https://docs.revrobotics.com/brushless/spark-max/operating-modes",
    "inspected": "2026-11-16",
    "supports": "neutral short/disconnect distinction only",
    "notEstablished": "firmware timing, body-diode/overvoltage behavior, regeneration or calibration"
  },
  "perturbationEnvelope": "none; paired declared initial state only",
  "poweredReverseRelease": "baseline-unsupported-preserved",
  "capture": null,
  "engineeringAcceptance": "blocked"
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
def validate(e):
 check(exact(e,EXPECTED),'Only exact separately reviewed mode experiment supported')
 for p,h in e['baselineCanonicalLfSourcePins'].items():check(hashlib.sha256((ROOT/p).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==h,'Original baseline source changed')
def verify_baseline_sources(out,baseline):
 check(all(sha(ROOT/k)==v for k,v in baseline['sourcePins'].items()),'Live baseline source changed')
 for variant in ('compressed','nominal'):
  nr=json.loads((out/'baseline'/variant/'receipt.json').read_text());check(all(sha(ROOT/k)==v for k,v in nr['contextFileHashes'].items()),'Live native context changed after consumption')
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--java-home',required=True);ap.add_argument('--gradle-home',required=True);a=ap.parse_args();out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=False);project=ROOT/'examples/java-2026-sim'
 files=[ROOT/p for p in ['scripts/run-passive-unload.py','scripts/test-passive-unload-contract.py','scripts/run-fuel-intake.py','docs/passive-unload.md','references/passive-unload.json']]+list((project/'src').rglob('*.java'))+[project/'build.gradle'];pins={str(p.relative_to(ROOT)):sha(p) for p in files}
 receipt={'schema':'frc-passive-unload-execution/v1','status':'running','sourcePins':pins,'baselineIoExecuted':False,'newExperimentIoExecuted':False,'vendorNeutralModeExecuted':False,'wholeRobotValidated':False,'fieldGeometryUsed':False,'modeInterface':'simulation-only-no-hardware-adapter','capture':None,'score':None,'engineeringAcceptance':'blocked','requiredDomains':{'physics':'partial-unvalidated-contact','voltage':'ideal-neutral-modes-no-regeneration-calibration','heat':'unsupported','friction':'assumed-unvalidated','weightDistribution':'unsupported-fixed-fixture'},'python':sys.version,'javaExecutableSha256':sha(pathlib.Path(a.java_home)/'bin/java.exe')}
 def save():(out/'execution-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  e=json.loads((ROOT/'references/passive-unload.json').read_text());validate(e);shutil.copyfile(ROOT/'references/passive-unload.json',out/'experiment.json')
  spec=importlib.util.spec_from_file_location('contract',ROOT/'scripts/test-passive-unload-contract.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with (out/'contract-tests.log').open('w') as log:r=unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromModule(module))
  counts={'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'skipped':len(r.skipped)};check(counts=={'tests':5,'failures':0,'errors':0,'skipped':0},'Mode contract checks missing/failed');(out/'contract-tests.json').write_text(json.dumps(counts))
  with (out/'baseline.log').open('w') as log:subprocess.run([sys.executable,str(ROOT/'scripts/run-fuel-intake.py'),'--output',str(out/'baseline'),'--java-home',a.java_home,'--gradle-home',a.gradle_home],check=True,stdout=log,stderr=subprocess.STDOUT)
  baseline=json.loads((out/'baseline/execution-receipt.json').read_text());check(baseline['status']=='executed-development-checks' and baseline['actualRobotIoExecuted'] is True and baseline['release']=='unsupported-regeneration','Actual original baseline must remain executed and unsupported');check(all(sha(ROOT/k)==v for k,v in baseline['sourcePins'].items()),'Baseline source mismatch');baseline_pins={str(p.relative_to(out)):sha(p) for p in (out/'baseline').rglob('*') if p.is_file()};receipt['baselineIoExecuted']=True;save()
  original=(out/'baseline/input.properties').read_bytes();(out/'input.properties').write_bytes(original+f'passiveSchema=frc-passive-unload/v1\npassiveExperimentSha256={sha(out/"experiment.json")}\n'.encode());input_hash=sha(out/'input.properties')
  env=os.environ.copy();env.update(JAVA_HOME=a.java_home,GRADLE_USER_HOME=a.gradle_home,FRC_PASSIVE_OUTPUT=str(out))
  with (out/'java.log').open('w') as log:subprocess.run(['cmd','/c',str(project/'gradlew.bat'),'passiveUnloadTest','dependencyManifest','--offline','--rerun-tasks'],cwd=project,env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
  xml=project/'build/test-results/passiveUnloadTest/TEST-org.agentfrc.lesson.PassiveUnloadTest.xml';x=ET.parse(xml).getroot();check(int(x.attrib['tests'])==8 and all(int(x.attrib.get(k,0))==0 for k in ['failures','errors','skipped']),'Required passive checks missing/failed');shutil.copyfile(xml,out/'tests.xml');shutil.copyfile(project/'build/dependency-manifest.json',out/'dependency-manifest.json')
  observed=dict(line.split('=',1) for line in (out/'passive-result.properties').read_text().splitlines() if line and not line.startswith('#'));check(observed['inputSha256']==input_hash==sha(out/'input.properties'),'Consumed mode inputs changed')
  for name in ('PassiveUnloadController','PassiveUnloadPlant','PassiveUnloadRig','NipExitAssessor'):check(observed[name+'ClassSha256']==sha(project/f'build/classes/java/main/org/agentfrc/lesson/{name}.class'),'Actual class mismatch')
  check(observed['vendorNeutralModeExecuted']=='false' and observed['capture']=='unestablished','No vendor/capture promotion');check(pins=={p:sha(ROOT/p) for p in pins} and baseline_pins=={p:sha(out/p) for p in baseline_pins},'Source/baseline changed');check(sha(out/'experiment.json')==sha(ROOT/'references/passive-unload.json'),'Retained experiment mismatch');validate(e)
  verify_baseline_sources(out,baseline)
  receipt.update(status='executed-development-checks',newExperimentIoExecuted=True,baselineFiles=baseline_pins,outcomes={k:v for k,v in observed.items() if k.endswith('.outcome') or k.endswith('.sensorSequence') or k.endswith('.verificationTime')},outputs={str(p.relative_to(out)):sha(p) for p in out.iterdir() if p.is_file() and p.name!='execution-receipt.json'})
 except Exception as error:receipt.update(status='failed',errorType=type(error).__name__);raise
 finally:receipt['finishedUnixSeconds']=time.time();save()
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
