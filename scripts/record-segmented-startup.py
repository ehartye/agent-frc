"""Record measured startup-contract tests and the geometry/model connection limit."""
import pathlib,importlib.util,json,hashlib,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('p',ROOT/'scripts/prepare-segmented-replay.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def record():
 xml=ROOT/'examples/java-2026-sim/build/test-results/test/TEST-org.agentfrc.lesson.SegmentedStartupContractTest.xml'
 tests=ET.parse(xml).getroot()
 if tests.attrib['tests']!='3' or any(tests.attrib[k]!='0' for k in ['failures','errors','skipped']):raise ValueError('startup tests not clean')
 names=[t.attrib['name'] for t in tests.findall('testcase')]
 expected={'preloadedCoralCenterIsRejected()','preloadedFuelCenterIsRejected()','noteHoleOrEmptyEntranceStartsButCannotCompleteWithoutBeamEvents()'}
 if set(names)!=expected:raise ValueError('unexpected test inventory')
 code=['scripts/prepare-segmented-replay.py','scripts/segmented-force-model.py','scripts/record-segmented-startup.py','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/SeasonRollerController.java','examples/java-2026-sim/src/test/java/org/agentfrc/lesson/SegmentedStartupContractTest.java']
 classes=['SeasonRollerController','SegmentedStartupContractTest']
 return dict(schema='frc-segmented-startup-boundary/v1',status='executed-controller-startup-tests',
  tests=names,xmlSha256=sha(xml),sourceCodeSha256={n:hashlib.sha256((ROOT/n).read_text(encoding='utf-8-sig').encode()).hexdigest() for n in code},
  classSha256={n:sha(ROOT/f'examples/java-2026-sim/build/classes/java/{"main" if n==classes[0] else "test"}/org/agentfrc/lesson/{n}.class') for n in classes},
  geometryEvidenceSha256=p.evidence(),poses={str(y):dict(centerBeamOccupied=p.occupied(y,0),centerGapBracketMm=p.gaps(y,0,5),outsideBeamOccupied=p.occupied(y,-250),outsideGapBracketMm=p.gaps(y,-250,5)) for y in p.SEASONS},
  conclusion='Preloaded CORAL/FUEL center triggers startup fault; NOTE hole begins clear but requires future beam events. Outside rest cannot self-start with zero geometric contact in the reduced tangential model.',
  derivation='Outside rest conclusion is an induction from zero contact impulse and zero initial velocity, not a controller-coupled trajectory test.',
  nextRequirements=['Define upstream feeder or approach initial conditions','Resolve CORAL partial-end contact before full crossing','Choose and review startup/beam policy without bypassing fault checks','Supply normal reactions and drive topology for physical force coupling'],
  controllerForceCoupled=False,engineeringAcceptance='blocked',calibration=None)
if __name__=='__main__':
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);a=ap.parse_args();out=pathlib.Path(a.output)
 if out.exists():raise ValueError('refuse evidence overwrite')
 out.write_text(json.dumps(record(),indent=2,allow_nan=False)+'\n',encoding='utf-8')
