"""Fresh-run startup evidence; never relabel a pre-existing passing XML file."""
import pathlib,importlib.util,json,hashlib,xml.etree.ElementTree as ET
import subprocess,os,uuid,tempfile,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('p',ROOT/'scripts/prepare-segmented-replay.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
CODE=['scripts/prepare-segmented-replay.py','scripts/segmented-force-model.py','scripts/record-segmented-startup.py','examples/java-2026-sim/build.gradle','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/SeasonRollerController.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/SegmentedStartupContractTest.java']
EXPECTED={'preloadedCoralCenterIsRejected()','preloadedFuelCenterIsRejected()','noteHoleOrEmptyEntranceStartsButCannotCompleteWithoutBeamEvents()'}
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def pins():return {n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in CODE}
def validate_binding(run_id,runtime,xml,source_before,source_after,compiled):
 if runtime.get('runId')!=run_id:raise ValueError('missing or stale native run token')
 if source_before!=source_after:raise ValueError('source changed during native run')
 for name,pin in compiled.items():
  if runtime.get(name+'Sha256')!=pin:raise ValueError('runtime class differs from current compiled class')
 tests=ET.fromstring(xml)
 if tests.attrib.get('tests')!='3' or any(tests.attrib.get(k)!='0' for k in ['failures','errors','skipped']):raise ValueError('startup tests not clean')
 names=[t.attrib['name'] for t in tests.findall('testcase')]
 if set(names)!=EXPECTED or len(names)!=3:raise ValueError('unexpected test inventory')
 return names

def run(out,java_home,gradle_home):
 out=pathlib.Path(out).resolve()
 if out.exists():raise ValueError('refuse overwrite of evidence directory')
 java=pathlib.Path(java_home)/'bin/java.exe'
 if not java.is_file() or not pathlib.Path(gradle_home).is_dir():raise ValueError('existing toolchain required')
 out.parent.mkdir(parents=True,exist_ok=True)
 pending=pathlib.Path(tempfile.mkdtemp(prefix=out.name+'-pending-',dir=out.parent))
 run_id=str(uuid.uuid4());before=pins();evidence_before=p.evidence()
 env=os.environ.copy();env.update(JAVA_HOME=str(pathlib.Path(java_home).resolve()),GRADLE_USER_HOME=str(pathlib.Path(gradle_home).resolve()),FRC_STARTUP_RUN_ID=run_id,FRC_STARTUP_RUNTIME=str(pending/'runtime.properties'))
 env['PATH']=str(java.parent)+os.pathsep+env['PATH']
 project=ROOT/'examples/java-2026-sim'
 command=[str(project/'gradlew.bat'),'test','--tests','org.agentfrc.lesson.SegmentedStartupContractTest','--offline','--no-daemon','--rerun-tasks']
 with (pending/'gradle.log').open('w',encoding='utf-8') as log:
  result=subprocess.run(command,cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError('native run failed; pending diagnostics retained')
 runtime={}
 for line in (pending/'runtime.properties').read_text().splitlines():
  if '=' in line and not line.startswith('#'):
   key,value=line.split('=',1);runtime[key]=value
 xml_path=project/'build/test-results/test/TEST-org.agentfrc.lesson.SegmentedStartupContractTest.xml'
 xml=xml_path.read_bytes()
 compiled={n:sha(project/f'build/classes/java/{"main" if n=="SeasonRollerController" else "test"}/org/agentfrc/lesson/{n}.class') for n in ['SeasonRollerController','SegmentedStartupContractTest']}
 names=validate_binding(run_id,runtime,xml,before,pins(),compiled)
 if evidence_before!=p.evidence():raise ValueError('geometry evidence changed during run')
 (pending/'tests.xml').write_bytes(xml)
 report=dict(schema='frc-segmented-startup-boundary/v2',status='fresh-executed-controller-startup-tests',runId=run_id,
  tests=names,sourceCodeSha256=before,runtimeClassSha256=compiled,javaExecutableSha256=sha(java),
  artifactsSha256={n:sha(pending/n) for n in ['runtime.properties','tests.xml','gradle.log']},
  geometryEvidenceSha256=evidence_before,poses={str(y):dict(centerBeamOccupied=p.occupied(y,0),centerGapBracketMm=p.gaps(y,0,5),outsideBeamOccupied=p.occupied(y,-250),outsideGapBracketMm=p.gaps(y,-250,5)) for y in p.SEASONS},
  conclusion='Preloaded CORAL/FUEL center triggers startup fault; NOTE hole begins clear but requires future beam events. Outside rest cannot self-start with zero geometric contact in the reduced tangential model.',
  derivation='Outside rest conclusion is an induction from zero contact impulse and zero initial velocity, not a controller-coupled trajectory test.',
  nextRequirements=['Define upstream feeder or approach initial conditions','Resolve CORAL partial-end contact before full crossing','Choose and review startup/beam policy without bypassing fault checks','Supply normal reactions and drive topology for physical force coupling'],
  controllerForceCoupled=False,engineeringAcceptance='blocked',calibration=None)
 (pending/'receipt.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n',encoding='utf-8')
 # Only publish the evidence directory after all bindings pass; preserve failures as pending diagnostics.
 pending.rename(out)
 return report
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--java-home',required=True);ap.add_argument('--gradle-home',required=True);a=ap.parse_args()
 print(json.dumps(run(a.output,a.java_home,a.gradle_home),indent=2))
