import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {effectiveProblems, handedOver, recordResult, seed, status, verdict} from '../scripts/bench-tests.mjs';
import {checkProject} from '../scripts/design-publication.mjs';
import {markEffective, stageInProgress} from '../scripts/detailed-design-release.mjs';
import {folderReceipt, issueRelease, sha, write} from './fixtures/preliminary-release.mjs';

// Synthetic teaching fixtures: an invented "Tilting carriage" whose preliminary design hands over four invented bench tests.
const script = fileURLToPath(new URL('../scripts/bench-tests.mjs', import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const detail = 'docs/detailed-design', prelim = 'docs/preliminary-design';
const risks = [
  {id: 'B1', risk: 'The latch may not hold the sample through a turn', benchTest: {measure: 'Pull-out force of the latch', pass: 40, fail: 25, unit: 'N'}},
  {id: 'B2', risk: 'The carriage may bind at full tilt', benchTest: {measure: 'Drag at full tilt', pass: 3, fail: 6, unit: 'N', tag: 'before-build'}},
  {id: 'B3', risk: 'The sample may bounce out on release', benchTest: {measure: 'Samples retained of ten releases', pass: 9, fail: 6, tag: 'on-robot'}},
  {id: 'B4', risk: 'The guide may mark the sample', benchTest: {measure: 'Visible marking after ten cycles', pass: 'none', fail: 'any'}},
  {id: 'R5', risk: 'The rail overlapped the head', closedBy: 'The rail moved outboard in draft 3'},
  {id: 'R6', risk: 'A risk with no numbers yet', benchTest: {measure: 'Unknown'}}];

/** A project with effective preliminary 1.0, its risk register committed, and a staged detailed design 1.0. */
function project(t, {register = risks, stage = true} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bench-tests-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  issueRelease(path.join(root, 'docs'), '1.0');
  write(root, prelim + '/releases.json', {releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.0': 'effective'}, current: '1.0'});
  const published = path.join(root, prelim, 'releases/1.0'), folder = 'cad/detailed-design/designs/1.0';
  if (register) write(root, 'cad/preliminary-design/releases/1.0/missions.json', {missionCases: read(path.join(published, 'release.json')).missionCases, risks: register});
  const receipt = read(path.join(published, 'receipt.json')), ledger = {...read(path.join(published, 'budgets.json')), requirements: {file: 'package-limits.json'}}, plan = JSON.stringify({view: 'review/index.html', motion: {file: 'paths.json'}, budgets: {file: 'budgets.json'}});
  write(root, folder + '/layout.json', plan);
  write(root, folder + '/receipt.json', folderReceipt(root, folder, receipt, plan, ledger, '1.0'));
  write(root, folder + '/missions.json', {missionCases: read(path.join(published, 'release.json')).missionCases});
  write(root, folder + '/paths.json', readFileSync(path.join(published, 'motion.json')));
  write(root, folder + '/budgets.json', ledger);
  write(root, folder + '/package-limits.json', readFileSync(path.join(published, 'limits.json')));
  write(root, folder + '/review/index.html', '<html>Detailed review</html>');
  cpSync(path.join(published, 'review-scene.json.gz'), path.join(root, folder, 'review/review-scene.json.gz'));
  const staging = () => stageInProgress({project: root, design: '1.0', inputs: folder, preliminary: '1.0', authority: 'cad/fusion-authority.json', lineage: 'cad/lineage.json',
    replay: () => ({archiveSha256: sha('archive'), stepSha256: receipt.step.sha256, configuration: 'Invented stowed assembly'})});
  if (stage) staging();
  write(root, 'cad/detailed-design/readiness-result.json', {schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly',
    stepSha256: receipt.step.sha256, archiveSha256: sha('archive'), buildReadiness: 'pass', showcaseEligibility: 'pass', findings: []});
  const file = path.join(root, folder, 'bench-tests.json');
  const edit = change => { const record = read(file); change(Object.fromEntries(record.tests.map(t => [t.id, t])), record); write(root, folder + '/bench-tests.json', record); };
  const effective = () => markEffective({project: root, design: '1.0', readiness: 'cad/detailed-design/readiness-result.json'});
  return {root, folder, file, edit, effective, stage: staging, record: () => read(file)};
}
/** Resolve every test of the fixture the way a team would. */
function resolve(p) {
  p.edit(t => {
    t.B1.tag = 'before-build'; t.B4.tag = 'on-robot';
    Object.assign(t.B3, {owner: 'Drive team', plan: 'Ten releases on the practice field after the first drive'});
    Object.assign(t.B4, {owner: 'Build team', plan: 'Inspect the sample after ten cycles on the robot'});
  });
  recordResult({project: p.root, design: '1.0', test: 'B1', value: 46, date: '2001-02-03'});
  recordResult({project: p.root, design: '1.0', test: 'B2', value: 2.5, date: '2001-02-03', note: 'Invented fixture run'});
}

test('seed writes one record for each bench test the preliminary design hands over', t => {
  const p = project(t);
  assert.deepEqual(handedOver(p.root, '1.0').tests.map(x => x.id), ['B1', 'B2', 'B3', 'B4'], 'a closed risk and a risk without numbers are not handed over');
  const seeded = seed({project: p.root, design: '1.0'});
  assert.equal(seeded.file, 'cad/detailed-design/designs/1.0/bench-tests.json');
  assert.match(seeded.report, /^Wrote cad\/detailed-design\/designs\/1\.0\/bench-tests\.json from cad\/preliminary-design\/releases\/1\.0\/missions\.json: 4 bench tests: 0 of 1 before-build passed, 0 of 1 on-robot with an owner and a plan, 2 not tagged\./);
  const record = p.record();
  assert.deepEqual([record.schema, record.design, record.preliminary, record.source], ['agent-frc/bench-tests@1', '1.0', '1.0', 'cad/preliminary-design/releases/1.0/missions.json']);
  assert.deepEqual(record.tests[0], {id: 'B1', risk: 'The latch may not hold the sample through a turn', measure: 'Pull-out force of the latch', pass: 40, fail: 25, unit: 'N',
    tag: null, owner: '', plan: '', result: null});
  assert.deepEqual(record.tests.map(x => x.tag), [null, 'before-build', 'on-robot', null], 'a tag the handoff gives is kept; the others are left to tag');
  assert.doesNotMatch(readFileSync(p.file, 'utf8'), /sha256|[0-9a-f]{64}/, 'the record holds no hash');

  // Seeding again keeps what the team wrote, takes changed handed-over numbers and marks a test no longer handed over.
  p.edit(x => { x.B1.tag = 'before-build'; x.B1.owner = 'Build team'; x.B1.result = {value: 44, passed: true, date: '2001-02-03'}; });
  const changed = risks.filter(r => r.id !== 'B4').map(r => r.id === 'B2' ? {...r, benchTest: {...r.benchTest, pass: 2}} : r);
  write(p.root, 'cad/preliminary-design/releases/1.0/missions.json', {risks: [...changed, {id: 'B7', risk: 'Invented new risk', benchTest: {measure: 'Stroke', pass: 120, fail: 100, unit: 'mm'}}]});
  const again = seed({project: p.root, design: '1.0'});
  assert.match(again.report, /^Refreshed .* \(1 added\)\./);
  const by = Object.fromEntries(p.record().tests.map(x => [x.id, x]));
  assert.deepEqual([by.B1.owner, by.B1.result.value, by.B2.pass, by.B7.pass, by.B4.handedOver], ['Build team', 44, 2, 120, false]);
  assert.throws(() => seed({project: p.root, design: '1.0', preliminary: '9.9'}), /No missions\.json for preliminary release 9\.9 in the project/);
});

test('effective refuses, naming each test, until every before-build test passed and every on-robot test has an owner and a plan', t => {
  const p = project(t);
  // No record at all: the handed-over tests are named with the command that seeds them.
  assert.throws(p.effective, /Detailed design Tilting carriage 1\.0 cannot be effective until its bench tests are resolved:\n  - Design 1\.0 has no bench-test record, and preliminary design 1\.0 hands over 4 bench tests \(B1, B2, B3, B4\)\. Seed the record: node PLUGIN\/scripts\/bench-tests\.mjs seed PROJECT --design 1\.0/);
  seed({project: p.root, design: '1.0'});
  let refused;
  try { p.effective(); } catch (error) { refused = error.message; }
  assert.deepEqual(refused.split('\n').slice(1), [
    '  - Bench test B1 has no tag: set tag to before-build or on-robot',
    '  - Bench test B2 (before-build) has no recorded result: run it and record the result (pass 3, fail 6 N)',
    '  - Bench test B3 (on-robot) has no owner and plan',
    '  - Bench test B4 has no tag: set tag to before-build or on-robot']);
  assert.equal(read(path.join(p.root, detail, 'designs.json')).designStatus['1.0'], 'in-progress', 'nothing changed');
  // A failing result, a value between the limits and a half-planned on-robot test are each named.
  p.edit(x => {
    x.B1.tag = 'before-build'; x.B1.result = {value: 20, date: '2001-02-03'};
    x.B2.result = {value: 4.5, date: '2001-02-03'};
    x.B3.owner = 'Drive team'; x.B4.tag = 'before-build'; x.B4.result = {note: 'Looked fine'};
  });
  assert.deepEqual(effectiveProblems(p.record(), handedOver(p.root, '1.0').tests), [
    'Bench test B1 (before-build) did not pass: recorded 20 against pass 40, fail 25 N',
    'Bench test B2 (before-build) did not pass: recorded 4.5 against pass 3, fail 6 N, between the two limits',
    'Bench test B3 (on-robot) has no plan',
    'Bench test B4 (before-build) records a result that does not say whether it passed: give result.value as a number, or result.passed']);
  // A test dropped from the record, or handed-over numbers edited in it, is named too.
  p.edit((x, record) => { x.B1.pass = 10; record.tests = record.tests.filter(row => row.id !== 'B3'); });
  const edited = effectiveProblems(p.record(), handedOver(p.root, '1.0').tests);
  assert.ok(edited.includes('Bench test B1 differs from the handed-over numbers (Pull-out force of the latch: pass 40, fail 25 N)'));
  assert.ok(edited.includes('Bench test B3 was handed over by the preliminary design and is not in the record'));

  seed({project: p.root, design: '1.0'});
  resolve(p);
  assert.equal(status({project: p.root, design: '1.0'}).ready, true);
  const marked = p.effective();
  assert.match(marked.report, /Bench tests: 4 bench tests: 2 of 2 before-build passed, 2 of 2 on-robot with an owner and a plan\n/);
  assert.equal(marked.designStatus['1.0'], 'effective');
  assert.deepEqual(read(path.join(p.root, detail, 'designs/1.0/bench-tests.json')), p.record(), 'the record is published beside the design');
});

test('the publication check holds an effective design to its bench-test record', t => {
  const p = project(t);
  seed({project: p.root, design: '1.0'});
  resolve(p);
  p.effective();
  const passing = checkProject(p.root, {skipRerun: true});
  assert.deepEqual(passing.errors, []);
  assert.match(passing.reports.find(r => /^Detailed design Tilting carriage 1\.0/.test(r.title)).text, /Bench tests: 4 bench tests: 2 of 2 before-build passed/);
  const published = detail + '/designs/1.0/bench-tests.json', record = read(path.join(p.root, published));
  write(p.root, published, {...record, tests: record.tests.map(x => x.id === 'B2' ? {...x, result: null} : x)});
  assert.match(checkProject(p.root, {skipRerun: true}).errors.join('\n'),
    /Detailed design Tilting carriage 1\.0 cannot be effective until its bench tests are resolved: Bench test B2 \(before-build\) has no recorded result/);
  rmSync(path.join(p.root, published));
  assert.match(checkProject(p.root, {skipRerun: true}).errors.join('\n'), /its preliminary design 1\.0 hands over 4 bench tests and the design publishes no record \(designs\/1\.0\/bench-tests\.json\)/);
  // An on-robot result recorded after the design is effective updates the published record too.
  write(p.root, published, record);
  recordResult({project: p.root, design: '1.0', test: 'B3', value: 10, date: '2001-03-04'});
  assert.equal(read(path.join(p.root, published)).tests.find(x => x.id === 'B3').result.value, 10);
  assert.deepEqual(checkProject(p.root, {skipRerun: true}).errors, []);
});

test('a design whose preliminary design hands over no bench test, and an in-progress draft, are not held to a record', t => {
  // No risk register is committed, as for a project from before the register: nothing is required.
  const legacy = project(t, {register: null});
  assert.equal(legacy.effective().designStatus['1.0'], 'effective');
  assert.deepEqual(checkProject(legacy.root, {skipRerun: true}).errors, []);
  // A register whose risks are all closed hands over nothing.
  const closed = project(t, {register: [risks[4]]});
  assert.equal(closed.effective().designStatus['1.0'], 'effective');
  // A draft publishes its record and says what is outstanding; staging is not refused.
  const draft = project(t, {stage: false});
  assert.match(draft.stage().report, /Note: Design 1\.0 has no bench-test record, and preliminary design 1\.0 hands over 4 bench tests/);
  seed({project: draft.root, design: '1.0'});
  const staged = draft.stage();
  assert.match(staged.report, /Note: bench tests: 4 bench tests: 0 of 1 before-build passed, 0 of 1 on-robot with an owner and a plan, 2 not tagged\. Before effective: 4 to resolve \(bench-tests\.mjs check\)\./);
  assert.ok(existsSync(path.join(draft.root, detail, 'designs/1.0/bench-tests.json')));
  assert.deepEqual(checkProject(draft.root, {skipRerun: true}).errors, []);
});

test('a result is judged against the handed-over numbers, in either direction', t => {
  const higher = {pass: 40, fail: 25}, lower = {pass: 3, fail: 6}, words = {pass: 'none', fail: 'any'};
  assert.deepEqual([46, 40, 30, 25, 10].map(v => verdict(higher, {value: v})), ['pass', 'pass', 'between', 'fail', 'fail']);
  assert.deepEqual([2, 3, 4, 6, 9].map(v => verdict(lower, {value: v})), ['pass', 'pass', 'between', 'fail', 'fail']);
  assert.deepEqual([verdict(words, {value: 'none'}), verdict(words, {passed: true}), verdict(words, {passed: false}), verdict(higher, null)], ['unstated', 'pass', 'fail', 'unstated']);
  const p = project(t);
  seed({project: p.root, design: '1.0'});
  assert.match(recordResult({project: p.root, design: '1.0', test: 'B2', value: '2.5', date: '2001-02-03'}).report, /^Bench test B2: 2\.5 against pass 3, fail 6 N — pass\.\n$/);
  assert.deepEqual(p.record().tests[1].result, {value: 2.5, date: '2001-02-03', passed: true});
  assert.match(recordResult({project: p.root, design: '1.0', test: 'B2', value: 5}).report, /between the limits, not a pass/);
  assert.throws(() => recordResult({project: p.root, design: '1.0', test: 'B2', value: 9, passed: 'true'}), /--passed true contradicts the value 9 against pass 3, fail 6 N/);
  assert.throws(() => recordResult({project: p.root, design: '1.0', test: 'B4', value: 'none'}), /limits that are not both numbers \(pass none, fail any\): say --passed true or --passed false/);
  assert.equal(recordResult({project: p.root, design: '1.0', test: 'B4', value: 'none', passed: 'true'}).record.tests[3].result.passed, true);
  assert.throws(() => recordResult({project: p.root, design: '1.0', test: 'B9', value: 1}), /No bench test B9/);
});

test('the command line seeds, records a result and reports what is left', t => {
  const p = project(t);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
  const seeded = run('seed', p.root, '--design', '1.0');
  assert.equal(seeded.status, 0, seeded.stderr);
  assert.equal(JSON.parse(seeded.stdout).file, 'cad/detailed-design/designs/1.0/bench-tests.json');
  const left = run('check', p.root, '--design', '1.0');
  assert.equal(left.status, 1);
  assert.match(left.stderr, /Before this design can be effective:\n  - Bench test B1 has no tag/);
  assert.deepEqual(JSON.parse(left.stdout).summary, {tests: 4, beforeBuild: 1, beforeBuildPassed: 0, onRobot: 1, onRobotPlanned: 0, untagged: 2});
  const result = run('result', p.root, '--design', '1.0', '--test', 'B2', '--value', '2.5', '--note', 'Invented run');
  assert.equal(result.status, 0, result.stderr);
  resolve(p);
  const ready = run('check', p.root, '--design', '1.0');
  assert.equal(ready.status, 0, ready.stderr);
  assert.match(ready.stderr, /Every before-build test has a passing result and every on-robot test has an owner and a plan\./);
  const refused = run('seed', p.root);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /Supply --design[\s\S]*Usage: bench-tests\.mjs seed PROJECT --design ID/);
});
