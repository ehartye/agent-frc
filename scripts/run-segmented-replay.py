"""Run pinned prescribed-motion segmented geometry through offline WPILib IO."""
import argparse,pathlib,os,sys,json,hashlib,subprocess,shutil,importlib.util,unittest,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def code_sha(p):return hashlib.sha256(pathlib.Path(p).read_text(encoding='utf-8-sig').encode('utf-8')).hexdigest()
def check(ok,msg):
 if not ok:raise ValueError(msg)
def properties(p):return dict(line.split('=',1) for line in pathlib.Path(p).read_text().splitlines() if line and not line.startswith('#'))
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--java-home',required=True);ap.add_argument('--gradle-home',required=True);args=ap.parse_args()
 out=pathlib.Path(args.output).resolve();project=ROOT/'examples/java-2026-sim'
 files=['scripts/run-segmented-replay.py','scripts/prepare-segmented-replay.py','scripts/test-segmented-replay.py','scripts/segmented-fuel-contact.py','examples/java-2026-sim/build.gradle','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/SegmentedReplayTest.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/SeasonRollerController.java']
 pins={n:code_sha(ROOT/n) for n in files}
 spec=importlib.util.spec_from_file_location('prepare',ROOT/'scripts/prepare-segmented-replay.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);prepared=m.prepare(out)
 receipt=dict(schema='frc-segmented-replay-execution/v1',status='running',sourceCodeSha256=pins,sourceCodePinBasis='UTF-8 without BOM and normalized LF',javaExecutableSha256=sha(pathlib.Path(args.java_home)/'bin/java.exe'),simulatedWpilibIoExecuted=False,physicalRobotIoExecuted=False,contactCausedTransport=False,calibration=None,engineeringAcceptance='blocked',geometryCounts=prepared['counts'],geometryEvidenceSha256=prepared['geometryEvidenceSha256'])
 def save():(out/'execution-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  spec=importlib.util.spec_from_file_location('tests',ROOT/'scripts/test-segmented-replay.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  with (out/'python-tests.log').open('w') as log:r=unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromModule(m))
  check(r.testsRun==6 and r.wasSuccessful() and not r.skipped,'Six Python checks required')
  env=os.environ.copy();env.update(JAVA_HOME=args.java_home,GRADLE_USER_HOME=args.gradle_home,FRC_SEGMENTED_REPLAY=str(out))
  with (out/'java.log').open('w') as log:subprocess.run(['cmd','/c',str(project/'gradlew.bat'),'segmentedReplayTest','dependencyManifest','--offline','--no-daemon','--rerun-tasks'],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
  xml=project/'build/test-results/segmentedReplayTest/TEST-org.agentfrc.lesson.SegmentedReplayTest.xml';x=ET.parse(xml).getroot();check(int(x.attrib['tests'])==5 and all(int(x.attrib.get(n,0))==0 for n in ['failures','errors','skipped']),'Five executed Java checks required')
  result=properties(out/'result.properties');check(result['inputSha256']==prepared['inputSha256']==sha(out/'input.properties'),'Input changed')
  inputs=properties(out/'input.properties')
  for y in [2024,2025,2026]:
   for v in ['nominal','compressed']:check(sha(out/f'{y}-{v}.csv')==inputs[f'{y}-{v}.sha256'],'CSV changed')
  check(result['controllerClassSha256']==sha(project/'build/classes/java/main/org/agentfrc/lesson/SeasonRollerController.class'),'Controller binding')
  check(result['testClassSha256']==sha(project/'build/classes/java/test/org/agentfrc/lesson/SegmentedReplayTest.class'),'Executed test binding')
  check(result['engineeringAcceptance']=='blocked' and result['contactCausedTransport']=='false','Unsupported promotion')
  check(pins=={n:code_sha(ROOT/n) for n in files},'Source changed')
  check(prepared['geometryEvidenceSha256']=={n:code_sha(ROOT/n) for n in prepared['geometryEvidenceSha256']},'Geometry context changed')
  shutil.copyfile(xml,out/'tests.xml');shutil.copyfile(project/'build/dependency-manifest.json',out/'dependency-manifest.json')
  receipt.update(status='executed-prescribed-geometry-io-replay',simulatedWpilibIoExecuted=True,pythonTests=6,javaTests=5,compiledBindings={k:result[k] for k in ['controllerClassSha256','testClassSha256']},outputs={str(p.relative_to(out)):sha(p) for p in out.iterdir() if p.is_file() and p.name!='execution-receipt.json'})
 except Exception as e:receipt.update(status='failed',errorType=type(e).__name__);raise
 finally:save()
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
