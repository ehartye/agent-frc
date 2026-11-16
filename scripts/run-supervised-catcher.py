"""Run new supervisor HAL tests; bind fresh runtime classes, inputs and XML atomically."""
import pathlib,hashlib,json,subprocess,os,uuid,tempfile,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
CLASSES=['CatcherHandoffController','BoundedCatcherSupervisor','BoundedCatcherSupervisor$Pose','BoundedCatcherSupervisor$Pads','BoundedCatcherSupervisor$Verdict','SupervisedCatcherAdapter','SupervisedCatcherTest']
CODE=['scripts/run-supervised-catcher.py','scripts/prepare-supervisor-golden.py','scripts/pose-clearance-contract.py','examples/java-2026-sim/build.gradle','examples/java-2026-sim/src/test/resources/supervisor-clearance-golden.csv']+[f'examples/java-2026-sim/src/{"test" if n=="SupervisedCatcherTest" else "main"}/java/org/agentfrc/lesson/{n}.java' for n in CLASSES if '$' not in n]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def pins():return {n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in CODE}
def run(out,jdk,cache):
 out=pathlib.Path(out).resolve()
 if out.exists():raise ValueError('fresh destination required')
 java=pathlib.Path(jdk)/'bin/java.exe'
 if not java.is_file() or not pathlib.Path(cache).is_dir():raise ValueError('existing toolchain required')
 subprocess.run(['python',str(ROOT/'scripts/prepare-supervisor-golden.py'),'--check'],check=True)
 out.parent.mkdir(parents=True,exist_ok=True);pending=pathlib.Path(tempfile.mkdtemp(prefix=out.name+'-pending-',dir=out.parent));token=str(uuid.uuid4());before=pins()
 env=os.environ.copy();env.update(JAVA_HOME=jdk,GRADLE_USER_HOME=cache,FRC_SUPERVISOR_RUN_ID=token,FRC_SUPERVISOR_RUNTIME=str(pending/'runtime.properties'));env['PATH']=str(java.parent)+os.pathsep+env['PATH'];project=ROOT/'examples/java-2026-sim'
 with (pending/'gradle.log').open('w') as log:r=subprocess.run([str(project/'gradlew.bat'),'test','--tests','org.agentfrc.lesson.SupervisedCatcherTest','--offline','--no-daemon','--rerun-tasks'],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
 if r.returncode:raise RuntimeError('native tests failed; pending diagnostics retained')
 runtime={line.split('=',1)[0]:line.split('=',1)[1] for line in (pending/'runtime.properties').read_text().splitlines() if '=' in line and not line.startswith('#')}
 classes={n:sha(project/f'build/classes/java/{"test" if n=="SupervisedCatcherTest" else "main"}/org/agentfrc/lesson/{n}.class') for n in CLASSES}
 if runtime.get('runId')!=token or before!=pins() or any(runtime.get(n+'Sha256')!=h for n,h in classes.items()):raise ValueError('stale execution or changed inputs')
 xml=(project/'build/test-results/test/TEST-org.agentfrc.lesson.SupervisedCatcherTest.xml').read_bytes();tree=ET.fromstring(xml)
 expected={'allSeasonsRequireIndependentPadsBeforeHoldAndPermitGuardedRelease()','invalidPadsDenyHoldEvenWithClosedFeedback()','lossAfterHoldCannotAuthorizeRelease()','staleFutureAndClockRegressionFailClosed()','geometricCounterexampleAndAgeHorizonAreNotBypassed()','pythonClearanceGoldenVectorsMatch()','invalidBoundsAndWrongSeasonNeverCommandClosure()'}
 names=[n.get('name') for n in tree.findall('testcase')]
 if set(names)!=expected or tree.get('tests')!='7' or any(tree.get(k)!='0' for k in ['failures','errors','skipped']):raise ValueError('test inventory incomplete')
 (pending/'tests.xml').write_bytes(xml)
 report=dict(schema='frc-bounded-virtual-supervisor/v1',runId=token,status='fresh-HAL-protocol-replay-only',tests=names,sourceCodeSha256=before,runtimeClassSha256=classes,javaExecutableSha256=sha(java),artifactsSha256={n:sha(pending/n) for n in ['runtime.properties','tests.xml','gradle.log']},physicalRobotIoExecuted=False,simulatedWpilibIoExecuted=True,calibration=None,engineeringAcceptance='blocked',limitations=['Virtual observations and error bounds supplied directly; no real pose sensor, contact switch or load sensor selected or implemented','HAL protocol tests replay beam/feedback events, not continuous world transport or force-coupled gate motion','Bounds include observation age plus20ms decision horizon; no guarantee after missed updates, unbounded acceleration or false validity bits','Requires fresh independent bilateral contact AND load-valid bits before HOLD and throughout HOLD; geometry and closure command never establish load','Denial latches protocol FAULT; existing fault behavior retains prior closure, not safe stopping or power-loss qualification','Adapter currently requires near-catcher pose domain from initialization, so it is not yet a replacement for the full upstream world rig','No capture or engineering qualification; native geometry, actual hardware, actuator forces and uncertainty calibration remain separate'])
 (pending/'receipt.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');pending.rename(out);return report
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);a.add_argument('--java-home',required=True);a.add_argument('--gradle-home',required=True);v=a.parse_args();print(json.dumps(run(v.output,v.java_home,v.gradle_home),indent=2))
