"""Execute original native sleeves through compiled WPILib IO; all physical acceptance blocked."""
import math
import argparse, hashlib, json, pathlib, os, subprocess, sys, time, importlib.util, unittest, xml.etree.ElementTree as ET, shutil
ROOT = pathlib.Path(__file__).resolve().parents[1]

def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()

def load(name, path):
    s = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m

def check(ok, message):
    if not ok:
        raise ValueError(message)

def validate_experiment(e):
    check(type(e) is dict and set(e) == set('schema basis normalPerRollerN frictionCoefficient massSelection orientation seasons engineeringAcceptance'.split()), 'Closed experiment schema')
    check(e['schema'] == 'frc-prescribed-season-contact/v1' and e['basis'] == 'unvalidated-experiment-not-geometry-derived-contact' and (e['engineeringAcceptance'] == 'blocked'), 'Unvalidated experiment required')
    check(e['massSelection'] == 'midpoint-of-manual-range-not-measured' and e['orientation'] == 'externally-constrained-no-rotation-or-gravity-work', 'Supported mass/orientation semantics required')

    def finite(x, lo, hi):
        return type(x) in (int, float) and math.isfinite(x) and (lo <= x <= hi)
    check(finite(e['normalPerRollerN'], 0, 100) and finite(e['frictionCoefficient'], 0, 2), 'Bounded finite contact assumptions')
    check(type(e['seasons']) is dict and set(e['seasons']) == {'2024', '2025', '2026'}, 'Exactly three seasons required')
    for c in e['seasons'].values():
        check(type(c) is dict and set(c) == {'windowHalfWidthM', 'initialPieceXM'}, 'Closed season experiment')
        check(finite(c['windowHalfWidthM'], 0.001, 0.5) and finite(c['initialPieceXM'], -0.5, 0.5) and (abs(c['initialPieceXM']) < c['windowHalfWidthM']), 'Bounded preloaded piece window')

def main():
    a = argparse.ArgumentParser()
    a.add_argument('--output', required=True)
    a.add_argument('--java-home', required=True)
    a.add_argument('--gradle-home', required=True)
    args = a.parse_args()
    out = pathlib.Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=False)
    project = ROOT / 'examples/java-2026-sim'
    years = [2024, 2025, 2026]
    files = list((ROOT / 'scripts').glob('*.mjs')) + [ROOT / p for p in ['scripts/run-season-io.py', 'scripts/season-mechanism-cad.py', 'scripts/test-season-mechanism-cad.py', 'scripts/test-season-io-contract.py', 'references/season-contact-experiment.json', 'docs/season-prescribed-contact-io.md']] + list((project / 'src').rglob('*.java')) + [project / p for p in ['build.gradle', 'settings.gradle', 'gradle.properties', 'gradle.lockfile', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties']]
    for y in years:
        files += [ROOT / f'case-studies/{y}/{n}' for n in ['roller-mechanism.json', 'case.json', 'prototype-study.json']]
    pins = {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in files}
    receipt = {'schema': 'frc-season-prescribed-contact-execution/v1', 'status': 'running', 'sourcePins': pins, 'seasons': years, 'engineeringAcceptance': 'blocked', 'score': None, 'gripReliability': None, 'calibration': 'none', 'physicalScope': 'Externally constrained piece, prescribed finite contact window and force; not collision or capture', 'requiredDomains': {'physics': 'partial-1D-prescribed-contact', 'voltage': 'partial-ideal-shared-bus', 'heat': 'unsupported', 'friction': 'unvalidated-assumed', 'weightDistribution': 'unsupported'}, 'python': sys.version, 'javaExecutableSha256': sha(pathlib.Path(args.java_home) / 'bin/java.exe')}

    def save():
        (out / 'execution-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    save()
    try:
        cad = load('season_cad', ROOT / 'scripts/season-mechanism-cad.py')
        tests = load('native_tests', ROOT / 'scripts/test-season-mechanism-cad.py')
        suite = unittest.defaultTestLoader.loadTestsFromModule(tests)
        with (out / 'native-tests.log').open('w') as log:
            result = unittest.TextTestRunner(stream=log).run(suite)
        report = {'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors), 'skipped': len(result.skipped)}
        (out / 'native-tests.json').write_text(json.dumps(report))
        if not report == {'tests': 7, 'failures': 0, 'errors': 0, 'skipped': 0}:
            raise ValueError('Required native checks failed/missing')
        contracts=load('io_contract_tests',ROOT/'scripts/test-season-io-contract.py')
        with (out/'contract-tests.log').open('w') as log:
            cr=unittest.TextTestRunner(stream=log).run(unittest.defaultTestLoader.loadTestsFromModule(contracts))
        ct={'tests':cr.testsRun,'failures':len(cr.failures),'errors':len(cr.errors),'skipped':len(cr.skipped)}
        (out/'contract-tests.json').write_text(json.dumps(ct))
        check(ct=={'tests':3,'failures':0,'errors':0,'skipped':0},'Required contract gates failed/missing')
        exp = json.loads((ROOT / 'references/season-contact-experiment.json').read_text())
        validate_experiment(exp)
        if not (exp['basis'] == 'unvalidated-experiment-not-geometry-derived-contact' and exp['engineeringAcceptance'] == 'blocked'):
            raise ValueError('Required execution/provenance check failed')
        (out / 'experiment.json').write_bytes((ROOT / 'references/season-contact-experiment.json').read_bytes())
        (out / 'index.properties').write_text('years=' + ','.join(map(str, years)) + '\n')
        for y in years:
            directory = out / str(y)
            directory.mkdir()
            config = ROOT / f'case-studies/{y}/roller-mechanism.json'
            c = json.loads(config.read_text())
            native = cad.run(config, directory / 'native')
            r = native['rollers'][0]
            other = native['rollers'][1]
            for k in ['shaftInertiaKgM2', 'contactRadiusMm', 'gearRatio', 'motorCount']:
                if not abs(r[k] - other[k]) < 1e-10:
                    raise ValueError('Symmetric sleeve properties required')
            if not [x['contactVelocitySign'] for x in native['rollers']] == [-1, 1]:
                raise ValueError('Required execution/provenance check failed')
            g = c['piece']['geometryMm']
            e = exp['seasons'][str(y)]
            q = {'schema': 'frc-season-io-input/v1', 'engineeringAcceptance': 'blocked', 'type': c['piece']['type'], 'mass': (c['piece']['massMinKg'] + c['piece']['massMaxKg']) / 2, 'radius': r['contactRadiusMm'] / 1000, 'inertia': r['shaftInertiaKgM2'], 'gear': r['gearRatio'], 'motors': r['motorCount'], 'outer': g.get('outerDiameter', g.get('diameter')) / 2000, 'inner': g.get('innerDiameter', 0) / 2000, 'length': g.get('length', 0) / 1000, 'window': e['windowHalfWidthM'], 'start': e['initialPieceXM'], 'normal': exp['normalPerRollerN'], 'mu': exp['frictionCoefficient'], 'beam': c['transport']['sensorPlanesXmm'][-1] / 1000, 'nativePropertiesSha256': sha(directory / 'native/properties.json'), 'cadSha256': native['cadSha256']}
            (directory / 'io.properties').write_text(''.join((f'{k}={v}\n' for k, v in q.items())))
        inputpins = {str(p.relative_to(out)): sha(p) for p in out.rglob('*') if p.is_file() and p.name not in ['execution-receipt.json', 'native-tests.log']}
        env = os.environ.copy()
        env.update(JAVA_HOME=args.java_home, GRADLE_USER_HOME=args.gradle_home, FRC_SEASON_IO_ROOT=str(out))
        with (out / 'java.log').open('w') as log:
            subprocess.run(['cmd', '/c', str(project / 'gradlew.bat'), 'seasonRollerTest', 'dependencyManifest', '--offline', '--rerun-tasks'], cwd=project, env=env, check=True, stdout=log, stderr=subprocess.STDOUT)
        xml = project / 'build/test-results/seasonRollerTest/TEST-org.agentfrc.lesson.SeasonRollerTest.xml'
        x = ET.parse(xml).getroot()
        if not (int(x.attrib['tests']) == 8 and all((int(x.attrib.get(k, 0)) == 0 for k in ['failures', 'errors', 'skipped']))):
            raise ValueError('Required IO tests failed/missing')
        shutil.copyfile(xml, out / 'tests.xml')
        shutil.copyfile(project / 'build/dependency-manifest.json', out / 'dependency-manifest.json')
        props = dict((line.split('=', 1) for line in (out / 'io-result.properties').read_text().splitlines() if line and (not line.startswith('#'))))
        if not props['controllerClassSha256'] == sha(project / 'build/classes/java/main/org/agentfrc/lesson/SeasonRollerController.class'):
            raise ValueError('Required execution/provenance check failed')
        for y in years:
            if not props[f'{y}.inputSha256'] == sha(out / str(y) / 'io.properties'):
                raise ValueError('Required execution/provenance check failed')
        if not pins == {p: sha(ROOT / p) for p in pins}:
            raise ValueError('Source changed during run')
        if not inputpins == {p: sha(out / p) for p in inputpins}:
            raise ValueError('Consumed inputs changed during run')
        receipt.update(status='executed-development-checks', inputs=inputpins, outputs={str(p.relative_to(out)): sha(p) for p in out.rglob('*') if p.is_file() and p.name != 'execution-receipt.json'})
    except Exception as error:
        receipt.update(status='failed', errorType=type(error).__name__)
        raise
    finally:
        receipt['finishedUnixSeconds'] = time.time()
        save()
    print(json.dumps(receipt, indent=2))
if __name__ == '__main__':
    main()
