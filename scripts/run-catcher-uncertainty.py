"""Fresh native world-coordinate intake/catcher handoff evidence."""
import pathlib,importlib.util,json,hashlib,subprocess,os,uuid,tempfile,xml.etree.ElementTree as ET,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('p',ROOT/'scripts/prepare-segmented-replay.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
CODE=['scripts/run-catcher-uncertainty.py','scripts/coral-entry-geometry.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/SegmentedEntryCouplingTest.java','scripts/prepare-catcher-golden.py','scripts/unilateral-catcher-study.py','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/CatcherHandoffController.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/CatcherContactModel.java','examples/java-2026-sim/src/test/resources/catcher-contact-golden.csv','examples/java-2026-sim/build.gradle','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/SeasonRollerController.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/CatcherSensorUncertaintyTest.java']
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def pins():return {n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in CODE}
def run(out,jdk,cache):
 out=pathlib.Path(out).resolve()
 if out.exists():raise ValueError('new output directory required')
 java=pathlib.Path(jdk)/'bin/java.exe'
 if not java.is_file() or not pathlib.Path(cache).is_dir():raise ValueError('existing toolchain required')
 out.parent.mkdir(parents=True,exist_ok=True);pending=pathlib.Path(tempfile.mkdtemp(prefix=out.name+'-pending-',dir=out.parent));token=str(uuid.uuid4());before=pins();geom=p.evidence()
 env=os.environ.copy();env.update(JAVA_HOME=jdk,GRADLE_USER_HOME=cache,FRC_UNCERTAINTY_RUN_ID=token,FRC_UNCERTAINTY_RUNTIME=str(pending/'runtime.properties'));env['PATH']=str(java.parent)+os.pathsep+env['PATH']
 mechanical_names=['case-studies/native-catcher-envelopes.json','case-studies/unilateral-catcher-study.json']
 mechanical={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in mechanical_names}
 native=json.loads((ROOT/mechanical_names[0]).read_text())
 for c in native['cases'].values():
  if c['entryCenterXmm']!=400 or c['initialRearClearanceMm']!=20 or c['pinchPadFeedSpanMm']!=140:raise ValueError('mechanical interface changed')
 project=ROOT/'examples/java-2026-sim'
 with (pending/'gradle.log').open('w') as log:
  result=subprocess.run([str(project/'gradlew.bat'),'test','--tests','org.agentfrc.lesson.CatcherSensorUncertaintyTest','--offline','--no-daemon','--rerun-tasks'],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError('native test failure; pending diagnostics retained')
 runtime={line.split('=',1)[0]:line.split('=',1)[1] for line in (pending/'runtime.properties').read_text().splitlines() if '=' in line and not line.startswith('#')}
 if runtime.get('runId')!=token or before!=pins() or geom!=p.evidence() or mechanical!={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in mechanical_names}:raise ValueError('stale or changed execution inputs')
 classes={n:sha(project/f'build/classes/java/{"main" if n in ("SeasonRollerController","CatcherHandoffController") else "test"}/org/agentfrc/lesson/{n}.class') for n in ['SeasonRollerController','CatcherHandoffController','SegmentedEntryCouplingTest','CatcherContactModel','CatcherSensorUncertaintyTest']}
 if any(runtime.get(n+'Sha256')!=pin for n,pin in classes.items()):raise ValueError('runtime class mismatch')
 xml=(project/'build/test-results/test/TEST-org.agentfrc.lesson.CatcherSensorUncertaintyTest.xml').read_bytes();tree=ET.fromstring(xml)
 if tree.get('tests')!='4' or any(tree.get(k)!='0' for k in ['failures','errors','skipped']):raise ValueError('incomplete/failed tests')
 names=[t.get('name') for t in tree.findall('testcase')]
 expected={'longitudinalOffsetAndLatencyMatrix()','nominalControlStillCaptures()','lossAfterHoldCannotRemainAccepted()','spuriousTailPulseDoesNotAuthorizeClosure()'}
 if set(names)!=expected:raise ValueError('test inventory mismatch')
 (pending/'tests.xml').write_bytes(xml)
 observations=[line.strip() for node in tree.findall('system-out') for line in (node.text or '').splitlines() if line.strip().startswith('CATCHER_UNCERTAINTY')]
 if len(observations)!=90:raise ValueError('missing scenario observations')
 report=dict(schema='frc-catcher-sensor-uncertainty/v1',status='fresh-executed-axis-aligned-sensor-uncertainty',runId=token,tests=names,sourceCodeSha256=before,geometryEvidenceSha256=geom,mechanicalInterfaceEvidenceSha256=mechanical,runtimeClassSha256=classes,javaExecutableSha256=sha(java),artifactsSha256={n:sha(pending/n) for n in ['runtime.properties','tests.xml','gradle.log']},observations=observations,
  simulatedWpilibIoExecuted=True,physicalRobotIoExecuted=False,calibration=None,engineeringAcceptance='blocked',
  assumptions=['Single continuous piece position fromX=-250mm through intake into catcher datumX=400mm; rotor state and remaining roller contact retained',
   'Fixed0.2m/s feeder momentum externally supplied; no powered feeder model',
   'Hypothetical piece mass0.5kg, equivalent rotor mass0.25kg, normal10N, friction0.5 and scalar5N/duty drive retained',
   'Force-limited unilateral bumper/gate and2N-capped side damping retained; no actual preload or actuators selected',
   'Arrival ideal transverse beam5mm before front bumper; tail-clear ideal beam2mm beyond closed gate face; NOTE requires two tail pulses',
   '20ms controller updates,2ms plant steps; gate closes/opens after assumed20ms when collision/unloaded guards permit',
   'Virtual gate-closed and rear-unloaded feedback; logical0/1 PWM protocol is not motor wiring, actuator sizing or deployable firmware',
   'Fault retains requested closure if previously commanded; not a power-loss or zero-output hardware safety claim',
   'Disturbance0.2Ns one second after arrival; guarded release request after two seconds; external backward0.2Ns push after release',
   'Provisional capture window/dwell criterion only; release ends after50mm local rear clearance, not full return through intake',
   'Arrival and tail sensor shifts independently-20/0/+20mm; shared observation latency0/20/100ms; these are experiment inputs, not tolerances','Added gate-feedback loss after HOLD and spurious tail pulse controls; real sensor failure probabilities and filtering absent','Axis-aligned dynamic model only; separate native pose/sweep study is not six-degree-of-freedom coupling','No guide/floor resistance, contact deformation, gate swept motion, actuator dynamics or calibration'])
 (pending/'receipt.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');pending.rename(out);return report
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--java-home',required=True);ap.add_argument('--gradle-home',required=True);a=ap.parse_args();print(json.dumps(run(a.output,a.java_home,a.gradle_home),indent=2))
