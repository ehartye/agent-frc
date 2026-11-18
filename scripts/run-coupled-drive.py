"""Explicit offline development run. No hardware, publication or engineering acceptance."""
import argparse, hashlib, json, os, pathlib, subprocess, sys, time
import xml.etree.ElementTree as ET
import shutil
ROOT=pathlib.Path(__file__).resolve().parent.parent
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--step',required=True);parser.add_argument('--density',type=float,required=True);parser.add_argument('--output',required=True);parser.add_argument('--java-home',required=True);parser.add_argument('--gradle-home',required=True);a=parser.parse_args()
    out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=False)
    java=pathlib.Path(a.java_home)/'bin'/'java.exe'
    if not java.is_file(): raise ValueError('Existing Java runtime required; no installation performed')
    step=pathlib.Path(a.step).resolve();project=ROOT/'examples'/'java-2026-sim'
    files=['scripts/extract-wheel-io.py','scripts/run-coupled-drive.py','examples/java-2026-sim/build.gradle','examples/java-2026-sim/gradle.lockfile','examples/java-2026-sim/gradle/wrapper/gradle-wrapper.properties','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/CandidateIoController.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/CandidateIoRig.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/CoupledDriveTest.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/CandidateIoTest.java']
    files += ['examples/java-2026-sim/src/main/java/org/agentfrc/lesson/NeutralDrivetrainSim.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/SharedSupply.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/CoupledDriveController.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/CoupledDriveRig.java','examples/java-2026-sim/src/main/resources/coupled-drive-assumptions.properties','scripts/test-wheel-extraction.py','docs/wheel-code-io.md','docs/coupled-drive-io.md','examples/java-2026-sim/settings.gradle','examples/java-2026-sim/gradle.properties','examples/java-2026-sim/gradlew.bat','examples/java-2026-sim/gradle/wrapper/gradle-wrapper.jar']
    pins={f:sha(ROOT/f) for f in files}
    shutil.copyfile(project/'src/main/resources/coupled-drive-assumptions.properties',out/'assumptions.properties')
    receipt={'schema':'frc-coupled-drive-execution/v1','status':'not-completed','engineeringAcceptance':'blocked','fixtureRole':'hypothetical-chassis-with-authentic-bare-wheel-auxiliary','chassisCadBinding':'unavailable','neutralMode':'baseline-short-circuit-dynamic-brake','neutralComparison':'explicit-ideal-brake-versus-open-coast','unsupportedControllerFeatures':['firmware-neutral-timing','phase-current-limit-control','regeneration'],'sourcePins':pins,'cadSourceSha256':sha(step),'assumedDensityKgM3':a.density,'javaExecutableSha256':sha(java),'requiredDomains':{'physics':'partial','voltage':'partial-ideal-averaged-shared-supply','heat':'unsupported','friction':'unsupported-contact-model','weightDistribution':'unsupported-chassis'},'calibration':'none','pythonVersion':sys.version.split()[0],'invocation':['gradlew.bat','test','--tests','*CandidateIoTest','coupledDriveTest','dependencyManifest','--offline','--rerun-tasks'],'robotOperationAuthorized':False,'startedUnixSeconds':time.time()}
    try:
        with (out/'execution.log').open('w',encoding='utf-8') as log:
            checkenv=os.environ.copy();checkenv['FRC_WHEEL_STEP']=str(step);checkenv['FRC_WHEEL_TEST_REPORT']=str(out/'extraction-tests.json')
            subprocess.run([sys.executable,str(ROOT/'scripts'/'test-wheel-extraction.py')],env=checkenv,check=True,stdout=log,stderr=subprocess.STDOUT)
            if json.loads((out/'extraction-tests.json').read_text())!={'tests':3,'failures':0,'errors':0,'skipped':0}: raise ValueError('Native extraction tests missing, failed or skipped')
            subprocess.run([sys.executable,str(ROOT/'scripts'/'extract-wheel-io.py'),str(step),str(a.density),str(out)],check=True,stdout=log,stderr=subprocess.STDOUT)
            env=os.environ.copy();env.update({'JAVA_HOME':a.java_home,'GRADLE_USER_HOME':a.gradle_home,'FRC_CAD_STEP':str(step),'FRC_CAD_PROPERTIES':str(out/'cad.properties'),'FRC_IO_OUTPUT':str(out),'FRC_DRIVE_ASSUMPTIONS':str(out/'assumptions.properties')})
            subprocess.run(['cmd','/c',str(project/'gradlew.bat'),'test','--tests','*CandidateIoTest','coupledDriveTest','dependencyManifest','--offline','--rerun-tasks'],cwd=project,env=env,check=True,stdout=log,stderr=subprocess.STDOUT)
        if pins!={f:sha(ROOT/f) for f in files}: raise ValueError('Source changed during execution')
        if receipt['cadSourceSha256']!=sha(step): raise ValueError('CAD changed during execution')
        reports={}
        for task in ['test','coupledDriveTest']:
            for file in (project/'build'/'test-results'/task).glob('TEST-*.xml'): reports[f'{task}/{file.name}']=sha(file)
        if len(reports)!=2: raise ValueError('Expected candidate IO and CAD IO test reports')
        (out/'test-reports').mkdir()
        for rel in reports:
            dest=out/'test-reports'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(project/'build'/'test-results'/rel,dest)
        shutil.copyfile(project/'build'/'dependency-manifest.json',out/'dependency-manifest.json')
        for task,name,count in [('test','CandidateIoTest',3),('coupledDriveTest','CoupledDriveTest',13)]:
            xml=ET.parse(project/'build'/'test-results'/task/('TEST-org.agentfrc.lesson.'+name+'.xml')).getroot()
            if int(xml.attrib['tests'])!=count or any(int(xml.attrib.get(k,0)) for k in ['failures','errors','skipped']): raise ValueError('Required tests missing, failed or skipped')
        observed=dict(line.split('=',1) for line in (out/'io-result.properties').read_text().splitlines() if line and not line.startswith('#'))
        if observed['cadPropertiesSha256']!=sha(out/'cad.properties'): raise ValueError('CAD property bytes changed after consumption')
        if observed['controllerClassSha256']!=sha(project/'build'/'classes'/'java'/'main'/'org'/'agentfrc'/'lesson'/'CoupledDriveController.class'): raise ValueError('Loaded controller class differs from compiled output')
        if observed['assumptionsSha256']!=sha(project/'src/main/resources/coupled-drive-assumptions.properties') or observed['assumptionsSha256']!=sha(out/'assumptions.properties'): raise ValueError('Consumed assumptions mismatch')
        receipt.update(status='executed-development-checks',testReportHashes=reports,outputs={f:sha(out/f) for f in ['neutral-refinement.properties','neutral-comparison.csv','assumptions.properties','extraction-tests.json','cad.properties','cad-properties.json','io-trace.csv','io-result.properties','execution.log']},dependencyManifestSha256=sha(project/'build'/'dependency-manifest.json'))
    except Exception as error:
        receipt['status']='failed';receipt['errorType']=type(error).__name__
        raise
    finally:
        receipt['finishedUnixSeconds']=time.time();(out/'execution-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()
