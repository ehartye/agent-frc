"""Run new supervisor HAL tests; bind fresh runtime classes, inputs and XML atomically."""
import pathlib,hashlib,json,subprocess,os,uuid,tempfile,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
MAIN=['PadConsistencyMonitor','PadConsistencyMonitor$Sample','VirtualCommandLease','VirtualCommandLease$Output','SeasonRollerController','StagedCatcherController','BoundedCatcherSupervisor','BoundedCatcherSupervisor$Pose','BoundedCatcherSupervisor$Pads','BoundedCatcherSupervisor$Verdict']
CLASSES=MAIN+['SegmentedEntryCouplingTest','CatcherContactModel','DiagnosticWorldCatcherTest']
CODE=['scripts/run-diagnostic-world.py','scripts/pose-clearance-contract.py','examples/java-2026-sim/build.gradle','examples/java-2026-sim/src/test/resources/catcher-contact-golden.csv','scripts/coral-entry-geometry.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py','scripts/unilateral-catcher-study.py','case-studies/native-catcher-envelopes.json','case-studies/time-resolved-catcher-closure.json']+[f'examples/java-2026-sim/src/{"main" if n in MAIN else "test"}/java/org/agentfrc/lesson/{n}.java' for n in CLASSES if '$' not in n]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def pins():return {n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in CODE}
def run(out,jdk,cache):
 out=pathlib.Path(out).resolve()
 if out.exists():raise ValueError('fresh destination required')
 java=pathlib.Path(jdk)/'bin/java.exe'
 if not java.is_file() or not pathlib.Path(cache).is_dir():raise ValueError('existing toolchain required')
 subprocess.run(['python',str(ROOT/'scripts/prepare-catcher-golden.py'),'--check'],check=True)
 out.parent.mkdir(parents=True,exist_ok=True);pending=pathlib.Path(tempfile.mkdtemp(prefix=out.name+'-pending-',dir=out.parent));token=str(uuid.uuid4());before=pins()
 env=os.environ.copy();env.update(JAVA_HOME=jdk,GRADLE_USER_HOME=cache,FRC_DIAGNOSTIC_RUN_ID=token,FRC_DIAGNOSTIC_RUNTIME=str(pending/'runtime.properties'));env['PATH']=str(java.parent)+os.pathsep+env['PATH'];project=ROOT/'examples/java-2026-sim'
 with (pending/'gradle.log').open('w') as log:r=subprocess.run([str(project/'gradlew.bat'),'test','--tests','org.agentfrc.lesson.DiagnosticWorldCatcherTest','--offline','--no-daemon','--rerun-tasks'],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
 if r.returncode:raise RuntimeError('native tests failed; pending diagnostics retained')
 runtime={line.split('=',1)[0]:line.split('=',1)[1] for line in (pending/'runtime.properties').read_text().splitlines() if '=' in line and not line.startswith('#')}
 classes={n:sha(project/f'build/classes/java/{"main" if n in MAIN else "test"}/org/agentfrc/lesson/{n}.class') for n in CLASSES}
 if runtime.get('runId')!=token or before!=pins() or any(runtime.get(n+'Sha256')!=h for n,h in classes.items()):raise ValueError('stale execution or changed inputs')
 xml=(project/'build/test-results/test/TEST-org.agentfrc.lesson.DiagnosticWorldCatcherTest.xml').read_bytes();tree=ET.fromstring(xml)
 expected={'continuousWorldHandoffAndRelease()','missingArrivalOrTailCannotCapture()','gateFeedbackOrDelayCannotClaimSuccess()','loadedReleaseIndicationKeepsGateCommanded()','absentApproachMomentumCannotInventTransport()','disabledCatcherCannotReportCapture()','modelPortMatchesIndependentPythonVectors()','virtualObservationAndPadFailuresCannotCapture()','missedUpdatesFaultOnReturnButDoNotStopDuringSilence()','independentReadbackRejectsStuckHighPadBits()','coordinatedFalseReadbacksStillFalselyAuthorizeHold()','staleIndependentReadbackDeniesAcceptance()','leaseExpiresAndRejectsReplayedFrames()','diagnosticRejectsMissingBaselineReplayAndNonfinite()','independentlyTickedLeaseChangesAppliedOutputDuringControllerSilence()'}
 names=[n.get('name') for n in tree.findall('testcase')]
 if set(names)!=expected or tree.get('tests')!='15' or any(tree.get(k)!='0' for k in ['failures','errors','skipped']):raise ValueError('test inventory incomplete')
 (pending/'tests.xml').write_bytes(xml)
 observations=[line.strip() for node in tree.findall('system-out') for line in (node.text or '').splitlines() if line.strip().startswith('DIAGNOSTIC_CATCHER')]
 if len(observations)!=66:raise ValueError('scenario inventory mismatch')
 report=dict(schema='frc-diagnostic-world-supervisor/v1',runId=token,status='fresh-virtual-diagnostic-and-lease-world-replay',tests=names,sourceCodeSha256=before,runtimeClassSha256=classes,javaExecutableSha256=sha(java),artifactsSha256={n:sha(pending/n) for n in ['runtime.properties','tests.xml','gradle.log']},observations=observations,physicalRobotIoExecuted=False,simulatedWpilibIoExecuted=True,calibration=None,engineeringAcceptance='blocked',limitations=['Independent analog travel/force readback is a virtual assumption, not demonstrated physical sensor independence','Initially retracted/unloaded self-check and contradiction checks reject single-channel faults; coordinated false readbacks still authorize false HOLD','Virtual lease ticks every2ms independently of20ms controller calls; no separate physical watchdog or clock installed','Lease zeros logical outputs after40ms without a fresh healthy sequence; zero-to-mechanics mappings are hypotheses','Six integrated missing-update paths contrast latched gate and unloaded spring-open response; raw PWM can retain closure while gated applied output differs','Original false-HOLD and persistent-command evidence remains unchanged; no real sensor calibration, physical safe stop or engineering acceptance'])
 (pending/'receipt.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');pending.rename(out);return report
if __name__=='__main__':
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);a.add_argument('--java-home',required=True);a.add_argument('--gradle-home',required=True);v=a.parse_args();print(json.dumps(run(v.output,v.java_home,v.gradle_home),indent=2))
