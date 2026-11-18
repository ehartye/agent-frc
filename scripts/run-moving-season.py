"""Run three actual season IO baselines, then their constrained moving composition. No hardware."""
import argparse,pathlib,json,hashlib,subprocess,sys,os,shutil,time,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def check(ok,msg):
 if not ok:raise ValueError(msg)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--java-home',required=True);parser.add_argument('--gradle-home',required=True);a=parser.parse_args();out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=False);project=ROOT/'examples/java-2026-sim'
 paths=[ROOT/'docs/moving-season-prototypes.md',ROOT/'scripts/run-moving-season.py',ROOT/'scripts/run-season-io.py',project/'src/main/resources/moving-season-assumptions.properties']+list((project/'src').rglob('*.java'))+[project/'build.gradle'];pins={str(p.relative_to(ROOT)):sha(p) for p in paths}
 receipt={'schema':'frc-moving-season-execution/v1','status':'running','sourcePins':pins,'seasons':[2024,2025,2026],'engineeringAcceptance':'blocked','wholeRobotValidated':False,'score':None,'captureReliability':None,'physicalScope':'Straight constrained translation; prescribed piece engagement; no field collision, pitch, weight transfer or thermal calibration','requiredDomains':{'physics':'partial-coupled-longitudinal','voltage':'partial-four-branch-ideal-supply','heat':'unsupported','friction':'unvalidated-assumed','weightDistribution':'unsupported'}}
 def save():(out/'execution-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 save()
 try:
  base=out/'stationary';moving=out/'moving';moving.mkdir()
  with (out/'baseline.log').open('w') as log:subprocess.run([sys.executable,str(ROOT/'scripts/run-season-io.py'),'--output',str(base),'--java-home',a.java_home,'--gradle-home',a.gradle_home],check=True,stdout=log,stderr=subprocess.STDOUT)
  baseline=json.loads((base/'execution-receipt.json').read_text());check(baseline['status']=='executed-development-checks' and baseline['seasons']==[2024,2025,2026],'Actual baseline execution required');inputpins={str(p.relative_to(out)):sha(p) for p in base.rglob('*') if p.is_file()}
  shutil.copyfile(project/'src/main/resources/moving-season-assumptions.properties',moving/'assumptions.properties');assumed=dict(line.split('=',1) for line in (moving/'assumptions.properties').read_text().splitlines() if line and not line.startswith('#'))
  for y in [2024,2025,2026]:
   native=json.loads((base/str(y)/'native/properties.json').read_text());check(float(assumed['massKg'])>sum(r['massKg'] for r in native['rollers']),'Assumed translating body must include sleeve mass, not add it twice')
  env=os.environ.copy();env.update(JAVA_HOME=a.java_home,GRADLE_USER_HOME=a.gradle_home,FRC_SEASON_IO_ROOT=str(base),FRC_MOVING_OUTPUT=str(moving))
  with (out/'moving.log').open('w') as log:subprocess.run(['cmd','/c',str(project/'gradlew.bat'),'movingSeasonTest','dependencyManifest','--offline','--rerun-tasks'],cwd=project,env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
  xml=project/'build/test-results/movingSeasonTest/TEST-org.agentfrc.lesson.MovingSeasonTest.xml';x=ET.parse(xml).getroot();check(int(x.attrib['tests'])==10 and all(int(x.attrib.get(k,0))==0 for k in ['failures','errors','skipped']),'Required moving tests missing/failed');shutil.copyfile(xml,moving/'tests.xml');shutil.copyfile(project/'build/dependency-manifest.json',moving/'dependency-manifest.json')
  observed=dict(line.split('=',1) for line in (moving/'moving-result.properties').read_text().splitlines() if line and not line.startswith('#'))
  check(observed['assumptionsSha256']==sha(moving/'assumptions.properties')==sha(project/'src/main/resources/moving-season-assumptions.properties'),'Consumed moving assumptions differ')
  for key,name in [('driveControllerClassSha256','CoupledDriveController'),('mechanismControllerClassSha256','SeasonRollerController'),('supervisorClassSha256','MovingPrototypeController')]:check(observed[key]==sha(project/f'build/classes/java/main/org/agentfrc/lesson/{name}.class'),'Compiled controller binding mismatch')
  for y in [2024,2025,2026]:check(observed[f'{y}.inputSha256']==sha(base/str(y)/'io.properties'),'Season binding mismatch')
  check(pins=={p:sha(ROOT/p) for p in pins},'Moving source changed');check(baseline['sourcePins']=={p:sha(ROOT/p) for p in baseline['sourcePins']},'Baseline source changed');check(inputpins=={p:sha(out/p) for p in inputpins},'Baseline consumed inputs changed')
  receipt.update(status='executed-development-checks',baselineReceiptSha256=sha(base/'execution-receipt.json'),baselineFiles=inputpins,outputs={str(p.relative_to(out)):sha(p) for p in moving.rglob('*') if p.is_file()})
 except Exception as error:receipt.update(status='failed',errorType=type(error).__name__);raise
 finally:receipt['finishedUnixSeconds']=time.time();save()
 print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
