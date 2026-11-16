"""Fresh native timestep/feed/stopping evidence, isolated from prescribed replay."""
import pathlib,importlib.util,json,hashlib,subprocess,os,uuid,tempfile,xml.etree.ElementTree as ET,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('p',ROOT/'scripts/prepare-segmented-replay.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
CODE=['scripts/run-segmented-stop.py','scripts/coral-entry-geometry.py','scripts/prepare-segmented-replay.py','scripts/segmented-fuel-contact.py','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/SegmentedEntryCouplingTest.java','examples/java-2026-sim/build.gradle','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/SeasonRollerController.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/SegmentedStopSensitivityTest.java']
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def pins():return {n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in CODE}
def run(out,jdk,cache):
 out=pathlib.Path(out).resolve()
 if out.exists():raise ValueError('new output directory required')
 java=pathlib.Path(jdk)/'bin/java.exe'
 if not java.is_file() or not pathlib.Path(cache).is_dir():raise ValueError('existing toolchain required')
 out.parent.mkdir(parents=True,exist_ok=True);pending=pathlib.Path(tempfile.mkdtemp(prefix=out.name+'-pending-',dir=out.parent));token=str(uuid.uuid4());before=pins();geom=p.evidence()
 env=os.environ.copy();env.update(JAVA_HOME=jdk,GRADLE_USER_HOME=cache,FRC_STOP_RUN_ID=token,FRC_STOP_RUNTIME=str(pending/'runtime.properties'));env['PATH']=str(java.parent)+os.pathsep+env['PATH']
 project=ROOT/'examples/java-2026-sim'
 with (pending/'gradle.log').open('w') as log:
  result=subprocess.run([str(project/'gradlew.bat'),'test','--tests','org.agentfrc.lesson.SegmentedStopSensitivityTest','--offline','--no-daemon','--rerun-tasks'],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
 if result.returncode:raise RuntimeError('native test failure; pending diagnostics retained')
 runtime={line.split('=',1)[0]:line.split('=',1)[1] for line in (pending/'runtime.properties').read_text().splitlines() if '=' in line and not line.startswith('#')}
 if runtime.get('runId')!=token or before!=pins() or geom!=p.evidence():raise ValueError('stale or changed execution inputs')
 classes={n:sha(project/f'build/classes/java/{"main" if n=="SeasonRollerController" else "test"}/org/agentfrc/lesson/{n}.class') for n in ['SeasonRollerController','SegmentedEntryCouplingTest','SegmentedStopSensitivityTest']}
 if any(runtime.get(n+'Sha256')!=pin for n,pin in classes.items()):raise ValueError('runtime class mismatch')
 xml=(project/'build/test-results/test/TEST-org.agentfrc.lesson.SegmentedStopSensitivityTest.xml').read_bytes();tree=ET.fromstring(xml)
 if tree.get('tests')!='4' or any(tree.get(k)!='0' for k in ['failures','errors','skipped']):raise ValueError('incomplete/failed tests')
 names=[t.get('name') for t in tree.findall('testcase')]
 expected={'timestepAndFeedSweep()','beamCompletionDoesNotCapture()','externalStoppingForceIsOnlyAHypotheticalScreen()','approachResistanceCanPreventAcquisition()'}
 if set(names)!=expected:raise ValueError('test inventory mismatch')
 (pending/'tests.xml').write_bytes(xml)
 observations=[line.strip() for node in tree.findall('system-out') for line in (node.text or '').splitlines() if line.strip().startswith('SEGMENTED_STOP')]
 if len(observations)!=42:raise ValueError('missing scenario observations')
 report=dict(schema='frc-segmented-stop-sensitivity/v1',status='fresh-executed-hypothetical-stop-sensitivity',runId=token,tests=names,sourceCodeSha256=before,geometryEvidenceSha256=geom,runtimeClassSha256=classes,javaExecutableSha256=sha(java),artifactsSha256={n:sha(pending/n) for n in ['runtime.properties','tests.xml','gradle.log']},observations=observations,
  simulatedWpilibIoExecuted=True,physicalRobotIoExecuted=False,calibration=None,engineeringAcceptance='blocked',
  assumptions=['External feeder supplies selected initial0.1/0.2/0.4m/s at X=-250mm; no ongoing prescribed translation','One equivalent roller coordinate with virtual complementary encoders, not physical dual-bank topology','Hypothetical piece mass0.5kg, rotor-equivalent mass0.25kg, aggregate normal10N, friction0.5, drive5N per unit duty','Wheel axes lowered5mm; fixed height/yaw/lateral pose; no normal reactions, rotation, floor, deformation or electrical drive model','2.5/5/10ms plant steps and20ms controller updates; NOTE interval refinement stops if unresolved','Feed speeds0.1/0.2/0.4m/s, external approach resistance0.1N, post-completion0.5/10N are hypothetical','One second after beam completion; 50mm and0.01m/s screen is illustrative, not a capture requirement or actual hardware','Initial feeder energy included; conservation only in modeled tangential coordinates','Zero-friction feeder coast can complete beams; completion alone is not motor transport or retention'])
 (pending/'receipt.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');pending.rename(out);return report
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--java-home',required=True);ap.add_argument('--gradle-home',required=True);a=ap.parse_args();print(json.dumps(run(a.output,a.java_home,a.gradle_home),indent=2))
