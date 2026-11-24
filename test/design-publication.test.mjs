/**
 * @lane merge
 * @subject scripts/design-publication.mjs
 * @subject scripts/stage-gate.mjs
 * @subject scripts/gate-record.mjs
 * @subject scripts/stage_preliminary_review.py
 * @subject templates/preliminary-review/review.html
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {checkProject, pluginVersion} from '../scripts/design-publication.mjs';
import {writeGate} from '../scripts/gate-record.mjs';
import {preliminaryGate, stageGate} from '../scripts/stage-gate.mjs';
import {editJson, inputsOf, issueRelease, listing, measured, paged, publish, publishedOf, read, republish, requirementsFile, sceneAt, sha, standIn, trialName, write, writeInputs} from './fixtures/preliminary-release.mjs';
import {openRisk} from './fixtures/ready.mjs';

// The staging command is the plugin's: an agent runs it from the plugin, at the project root. The invented releases of
// project() hold no solid to judge, so stageStandIn and standInCli run the same commands with the judgement stood in for.
const here = name => fileURLToPath(new URL(name, import.meta.url));
const stagingCommand = here('../scripts/stage_preliminary_review.py'), stageStandIn = here('./fixtures/stage_stand_in.py'), standInCli = here('./fixtures/stand-in-cli.mjs');
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
// Synthetic teaching fixtures: invented releases, motions and objectives with no relation to any game.
const prelim = 'docs/preliminary-design', detail = 'docs/detailed-design';
// The invented architectures of these indexes, by major number.
const names = {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}, 3: {name: 'Sliding gate'}, 4: {name: 'Rolling cradle'}};

/**
 * A project with committed inputs for each release. `check` runs the publication check and `gate` the stage gate of a
 * release, writing its record as the command that marks it effective does. `judged` lists the releases the layout
 * judgement was asked for. A release listed effective or superseded carries its gate record, unless `gates` is false.
 */
function project(t, releases = {'1.0': {}}, statuses = undefined, designs = names, {gates = true} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [id, options] of Object.entries(releases)) issueRelease(root, id, options);
  const ids = Object.keys(releases);
  listing(root, ids.at(-1), ids, statuses, designs && Object.fromEntries(Object.entries(designs).filter(([major]) => ids.some(id => id.startsWith(major + '.')))));
  const judged = [];
  const judge = (at, file, options) => { judged.push(path.basename(path.dirname(file))); return standIn(at, file, options); };
  const check = (options = {}) => checkProject(root, {log: () => {}, judge, ...options});
  const gate = (id, options = {}) => { const done = preliminaryGate({project: root, release: id, judge, ...options}); writeGate(done.published, done.gate); return done; };
  const gateFile = id => path.join(root, publishedOf(id), 'gate.json');
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  /** Commit everything and return the commit, the base of a later check. */
  const commit = (message = 'change') => { if (!existsSync(path.join(root, '.git'))) git('init', '-q'); git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); return git('rev-parse', 'HEAD'); };
  /** Set the design statuses of the preliminary index and the release it opens. */
  const setStatus = (designStatus, more = {}) => editJson(path.join(root, prelim, 'releases.json'), i => {
    const next = {...i, ...more, designStatus: {...i.designStatus, ...designStatus}}, of = s => next.releases.filter(r => (next.designStatus[r] ?? 'in-progress') === s);
    return {...next, current: of('effective')[0] ?? of('in-progress').at(-1) ?? next.releases.at(-1)};
  });
  const at = (id, name) => path.join(root, inputsOf(id), name);
  /** Override fields of the verdict the stood-in judgement gives a release. */
  const override = (id, fields) => write(root, inputsOf(id) + '/stand-in.json', fields);
  if (gates) for (const [id, status] of Object.entries(statuses ?? {})) if (['effective', 'superseded'].includes(status)) gate(id);
  judged.length = 0;
  return {root, judged, judge, check, gate, gateFile, git, commit, setStatus, at, override};
}
const errorsOf = result => result.errors.join('\n');
const noteOf = (result, name) => result.designs.find(r => r.design.includes(name))?.note;
const judgedNote = 'draft, judged layout-checked on its committed records in 1.4 s (status 1.0 s of it).';

test('a draft is judged on its committed records; the publication check measures nothing and writes nothing', t => {
  const p = project(t);
  const before = JSON.stringify(readdirSync(p.root, {recursive: true}).sort());
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.preliminary, {current: '1.0', releases: [{release: '1.0', design: 'Tilting carriage 1.0', status: 'in-progress'}]});
  assert.deepEqual(result.designs, [{design: 'Preliminary design Tilting carriage 1.0', status: 'in-progress', note: judgedNote}]);
  assert.deepEqual([p.judged, result.seconds.judging, result.seconds.status], [['1.0'], 1.4, 1], 'it says what judging took and the share of the staleness check');
  assert.equal(result.comparedWith, null, 'a project outside Git has no default branch to compare with');
  assert.equal(result.plugin, pluginVersion);
  assert.equal(JSON.stringify(readdirSync(p.root, {recursive: true}).sort()), before);
});

test('the stage gate judges the committed records, writes one verdict and refuses a stale or missing record, a stale trial and a design that is not layout-checked', t => {
  const p = project(t), folder = inputsOf('1.0') + '/';
  const done = p.gate('1.0');
  const {elapsedSeconds, date, ...record} = read(p.gateFile('1.0'));
  // Decision 5: the verdict, the first unmet requirement (none), the files judged by digest, the library, the time and the date.
  assert.deepEqual(record, {schema: 'agent-frc/stage-gate@2', phase: 'preliminary-design', design: '1.0', verdict: 'layout-checked', firstUnmet: null, readiness: {met: 3, of: 3},
    files: standIn(p.root, p.at('1.0', 'judgement.json')).files, library: {library: 'frc-design-kernel', version: '0.0.0', commit: null}});
  assert.deepEqual(Object.keys(record.files.source), [folder + 'design.json', folder + 'subsystems/arm.json'], 'every file of the source, subsystem files included');
  assert.equal(record.files.source[folder + 'design.json'], sha(readFileSync(p.at('1.0', 'design.json'))));
  assert.ok(record.files.records[folder + 'records/trials.json'] && record.files.judgement[requirementsFile]);
  assert.ok(Number.isFinite(elapsedSeconds) && /^\d{4}-\d{2}-\d{2}$/.test(date));
  assert.match(done.report, /^Effective-readiness report for /);
  assert.doesNotMatch(JSON.stringify(record), /receipt|budgets|missions/);
  // Each refusal names its reason and leaves no gate record.
  const refused = (name, edit, pattern) => {
    const q = project(t);
    edit(q);
    assert.throws(() => q.gate('1.0'), error => pattern.test(error.message) && /is not marked effective/.test(error.message) || assert.fail(name + ': ' + error.message));
    assert.equal(existsSync(q.gateFile('1.0')), false, name + ' leaves no gate record');
  };
  const inFile = (q, name, edit) => editJson(q.at('1.0', name), edit);
  refused('a stale job', q => inFile(q, 'subsystems/arm.json', s => ({...s, solids: [{name: 'arm', massKg: 9}]})), /measurements\/mass\.drawn\.json is stale: solid "arm" changed/);
  refused('a missing job', q => rmSync(q.at('1.0', 'records/measurements/electrical.loaded-turn.json')), /electrical\.loaded-turn\.json is missing/);
  refused('a stale trial', q => inFile(q, 'records/trials.json', r => ({trials: {[trialName]: {...r.trials[trialName], of: 'earlier'}}})), /trial "invented pull-in" is stale/);
  // Every record in the folder, not only the ones this judgement asks for.
  refused('a stale job the judgement does not ask for', q => write(q.root, folder + 'records/measurements/clearance.motion.gone.json', {of: 'earlier'}), /clearance\.motion\.gone\.json is stale/);
  refused('a stale trial the judgement does not use', q => inFile(q, 'records/trials.json', r => ({trials: {...r.trials, spare: {of: 'earlier'}}})), /trial "spare" is stale/);
  for (const status of ['blocked', 'reopen', 'provisional']) refused(status, q => q.override('1.0', {status, firstUnmet: {kind: 'clearance', text: 'invented: arm and battery overlap'}}),
    new RegExp('its records judge it ' + status + ': invented: arm and battery overlap'));
  refused('a first unmet requirement beside a passing status', q => q.override('1.0', {firstUnmet: {kind: 'weight', text: 'invented weight'}}), /invented weight/);
  refused('a verdict that names no judged files', q => q.override('1.0', {files: {source: {}, parts: {}, judgement: {}, records: {}}}), /names no judged files/);
  // The published release is what was judged: a copy that differs, or a scene that shows something else, is staged again first.
  refused('a published copy that is not the committed file', q => write(q.root, publishedOf('1.0') + '/judgement.json', '{}'), /published judgement\.json is not the committed .*judgement\.json. Stage it again/);
  refused('a scene of another verdict', q => {
    const file = path.join(q.root, publishedOf('1.0'), 'review-scene.json.gz'), shown = sceneAt(file);
    writeFileSync(file, gzipSync(JSON.stringify({...shown, weight: {...shown.weight, totalKg: 1}})));
  }, /Scene weight differs from the verdict/);
  refused('a design with no published release', q => rmSync(path.join(q.root, publishedOf('1.0')), {recursive: true}), /is not published: stage it first/);
});

test('marking a design effective is refused unless its readiness report meets every criterion on the committed design', t => {
  const p = project(t), judgement = p.at('1.0', 'judgement.json');
  const status = () => (read(path.join(p.root, prelim, 'releases.json')).designStatus ?? {})['1.0'] ?? 'in-progress';
  const mark = () => { const run = spawnSync(python, ['-B', stageStandIn, '--base', path.join(p.root, 'cad/preliminary-design'), '--set-status', '1.0', 'effective'], {encoding: 'utf8'}); return {...run, said: run.stdout + run.stderr}; };
  // 2 of 3: one open risk is neither closed by a design change nor carried as a bench test.
  editJson(judgement, j => ({...j, risks: [openRisk]}));
  republish(p.root, '1.0');
  const refused = mark();
  assert.notEqual(refused.status, 0);
  assert.match(refused.said, /Preliminary design Tilting carriage 1\.0 is not marked effective: its effective-readiness report meets 2 of 3 criteria on the committed design\. Not met: Every open risk closed by a design change or carried as a bench test with numbers/);
  assert.match(refused.said, /Risk invented-belt-slip has neither a closing design change/);
  assert.match(refused.said, /Release 1\.0 keeps its status: the stage gate did not pass/);
  assert.equal(existsSync(p.gateFile('1.0')), false, 'no gate record is written');
  assert.equal(status(), 'in-progress');
  assert.throws(() => p.gate('1.0'), /meets 2 of 3 criteria/);
  // A mission case whose trial did not run is short of the bar too: the judgement passes and readiness does not.
  editJson(judgement, j => ({...j, risks: [], missionCases: [{...j.missionCases[0], trial: 'never run'}]}));
  republish(p.root, '1.0');
  assert.throws(() => p.gate('1.0'), /meets 2 of 3 criteria .*trial never run is not run yet/);
  // Control: the same design meeting all three criteria is marked effective.
  editJson(judgement, j => ({...j, missionCases: [{...j.missionCases[0], trial: trialName}]}));
  republish(p.root, '1.0');
  const accepted = mark();
  assert.equal(accepted.status, 0, accepted.said);
  assert.match(accepted.said, /Result: 3 of 3 criteria met\./);
  assert.equal(read(p.gateFile('1.0')).verdict, 'layout-checked');
  assert.equal(status(), 'effective');
});

/** Publish a release as the plugin did before the records: a page, a summary of results and a release record, with no judgement. */
function earlierRelease(root, id) {
  for (const dir of [publishedOf(id), inputsOf(id)]) rmSync(path.join(root, dir), {recursive: true, force: true});
  write(root, publishedOf(id) + '/index.html', '<html>Invented earlier page</html>');
  write(root, publishedOf(id) + '/results.json', {schema: 'invented-earlier-result', status: 'layout-checked'});
  write(root, publishedOf(id) + '/release.json', {schema: 'agent-frc/preliminary-release@1', release: id, issue: 'earlier', phase: 'preliminary-design'});
  write(root, inputsOf(id) + '/judgement.json', {schema: 'agent-frc/layout-judgement@1', issue: 'earlier'});
}

test('the publication check validates only the releases the change touches', t => {
  // Effective 1.0 was published in an earlier format, which the check has no reader for.
  const p = project(t, {'1.0': {}, '1.1': {}}, {'1.0': 'effective', '1.1': 'in-progress'}, names, {gates: false});
  earlierRelease(p.root, '1.0');
  p.setStatus({});
  const base = p.commit('effective 1.0');
  // The change revises draft 1.1 and edits the index entry of 1.0. Neither touches a file in 1.0's own folders.
  write(p.root, inputsOf('1.1') + '/notes.md', 'Invented draft note');
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, accepted: {'1.0': '2001-01-02'}}));
  p.commit('draft revision');
  let result = p.check({base});
  assert.deepEqual(result.errors, []);
  assert.deepEqual(p.judged, ['1.1'], 'only the touched release is judged');
  assert.deepEqual(result.designs.map(d => [d.design, d.note]), [
    ['Preliminary design Tilting carriage 1.0', 'effective, untouched since ' + base + '.'],
    ['Preliminary design Tilting carriage 1.1', judgedNote]]);
  // A draft the change leaves alone is not judged either.
  const next = p.commit('nothing');
  write(p.root, 'README.md', 'Invented');
  p.judged.length = 0;
  result = p.check({base: next});
  assert.deepEqual([result.errors, p.judged, noteOf(result, '1.1')], [[], [], 'draft, untouched by this change, so it was not judged.']);
  // Control: a change to a file in its input folder touches it, and the earlier format is refused. No reader for it is added.
  write(p.root, inputsOf('1.0') + '/notes.md', 'Invented edited note');
  p.commit('touched inputs');
  assert.match(errorsOf(p.check({base})), /Tilting carriage 1\.0 was published in an earlier format \(agent-frc\/preliminary-release@1\)/);
  // So does a change to a file in its published folder.
  p.git('rm', '-q', inputsOf('1.0') + '/notes.md');
  write(p.root, publishedOf('1.0') + '/notes.txt', 'Invented published note');
  p.commit('touched published files');
  assert.match(errorsOf(p.check({base})), /Tilting carriage 1\.0 was published in an earlier format/);
});

test('the stage gate refuses a design whose inputs have uncommitted changes', t => {
  const p = project(t), folder = inputsOf('1.0') + '/';
  p.commit('draft');
  assert.equal(p.gate('1.0').gate.commit.length, 40, 'the record names the commit the gate ran on');
  // An edited input, and a new file, each stop the gate before it judges.
  p.judged.length = 0;
  write(p.root, folder + 'notes.md', 'a new note');
  assert.throws(() => p.gate('1.0'), /1\.0 is not marked effective: its inputs have uncommitted changes \(\?\? cad\/preliminary-design\/releases\/1\.0\/notes\.md\)\. The stage gate judges the committed design\. Commit cad\/preliminary-design\/releases\/1\.0, then mark it effective/);
  p.commit('note');
  write(p.root, folder + 'page.json', readFileSync(path.join(p.root, folder + 'page.json'), 'utf8') + ' ');
  assert.throws(() => p.gate('1.0'), /its inputs have uncommitted changes \(M cad\/preliminary-design\/releases\/1\.0\/page\.json\)/);
  assert.deepEqual(p.judged, []);
  p.git('checkout', '--', folder);
  // A judged file outside the release folder, the season's requirements, is committed too.
  const season = readFileSync(path.join(p.root, requirementsFile), 'utf8');
  write(p.root, requirementsFile, season.replace('20', '200'));
  assert.throws(() => p.gate('1.0'), /uncommitted changes \(M cad\/preliminary-design\/requirements\.json\)/);
  write(p.root, requirementsFile, season);
  // Records kept out of Git would judge here and be missing from the pull request.
  write(p.root, '.gitignore', 'records/\n');
  p.git('rm', '-r', '-q', '--cached', folder + 'records');
  p.commit('records ignored');
  assert.throws(() => p.gate('1.0'), /files it was judged on are not in Git \(cad\/preliminary-design\/releases\/1\.0\/records\/measurements\//);
  rmSync(path.join(p.root, '.gitignore'));
  p.commit('records committed');
  // A change elsewhere in the project does not stop it.
  write(p.root, 'README.md', 'an unrelated edit');
  assert.equal(p.gate('1.0').gate.verdict, 'layout-checked');
});

test('a draft is refused on a stale or missing record, an unmet verdict and published files that are not the committed ones', t => {
  const p = project(t), folder = inputsOf('1.0') + '/', source = readFileSync(p.at('1.0', 'subsystems/arm.json'));
  // A solid changed with no new measurement: the records are not of this design.
  write(p.root, folder + 'subsystems/arm.json', {schema: 'frc-design-kernel/subsystem@1', solids: [{name: 'arm', massKg: 9}]});
  republish(p.root, '1.0');
  assert.match(errorsOf(p.check()), /^Preliminary design Tilting carriage 1\.0: The layout judgement was refused: measurements\/clearance\.motion\.loaded-turn\.json is stale: solid "arm" changed/);
  write(p.root, folder + 'subsystems/arm.json', source);
  republish(p.root, '1.0');
  const job = p.at('1.0', 'records/measurements/mass.drawn.json'), held = readFileSync(job);
  rmSync(job);
  assert.match(errorsOf(p.check()), /measurements\/mass\.drawn\.json is missing/);
  writeFileSync(job, held);
  // A verdict that is not layout-checked names its first unmet requirement.
  p.override('1.0', {status: 'provisional', firstUnmet: {kind: 'coverage', text: 'invented: no service motion'}});
  assert.match(errorsOf(p.check()), /1\.0 needs a layout-checked design; its records judge it provisional: invented: no service motion/);
  rmSync(p.at('1.0', 'stand-in.json'));
  assert.deepEqual(p.check().errors, []);
  // The published copies are the committed files: an edited one, a missing one and one that the inputs no longer hold.
  const copy = path.join(p.root, publishedOf('1.0'), 'records/measurements/mass.drawn.json');
  writeFileSync(copy, '{}');
  assert.match(errorsOf(p.check()), /the published records\/measurements\/mass\.drawn\.json is not the committed cad\/preliminary-design\/releases\/1\.0\/records\/measurements\/mass\.drawn\.json\. Stage it again/);
  rmSync(copy);
  assert.match(errorsOf(p.check()), /the published records\/measurements\/mass\.drawn\.json is missing\. Stage it again/);
  republish(p.root, '1.0');
  write(p.root, publishedOf('1.0') + '/records/measurements/clearance.motion.gone.json', '{}');
  assert.match(errorsOf(p.check()), /the published records\/measurements\/clearance\.motion\.gone\.json is not a file of the committed design\. Stage it again/);
  rmSync(path.join(p.root, publishedOf('1.0'), 'records/measurements/clearance.motion.gone.json'));
  // A source kept outside the release folder would change without touching the release.
  editJson(p.at('1.0', 'judgement.json'), j => ({...j, records: {folder: 'cad/shared-records'}}));
  cpSync(p.at('1.0', 'records'), path.join(p.root, 'cad/shared-records'), {recursive: true});
  assert.match(errorsOf(p.check()), /keep cad\/shared-records\/measurements\/.* in its folder, cad\/preliminary-design\/releases\/1\.0/);
});

test('a live release needs committed inputs; history is not required to keep its files', t => {
  const p = project(t, {'1.0': {}, '2.0': {}, '3.0': {}, '4.0': {}},
    {'1.0': 'withdrawn', '2.0': 'superseded', '3.0': 'effective', '4.0': 'in-progress'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: '3.0'}));
  for (const id of ['1.0', '2.0']) rmSync(path.join(p.root, inputsOf(id)), {recursive: true});
  rmSync(path.join(p.root, publishedOf('1.0')), {recursive: true});
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.designs.map(d => d.design), ['Preliminary design Sliding gate 3.0', 'Preliminary design Rolling cradle 4.0'], 'only live designs are checked');
  assert.deepEqual(p.judged, ['4.0'], 'an effective release is read from its gate record');
  assert.match(noteOf(result, '3.0'), /^effective, its files as its stage gate judged them on \d{4}-\d{2}-\d{2}\. No default branch of the remote to compare with\.$/);
  assert.equal(result.reports.length, 1, 'the effective release prints its gate record');
  assert.match(result.reports[0].title, /3\.0 \(effective\)/);
  // A withdrawal is a status with a reason. The index also keeps the last commit that held the files.
  assert.deepEqual(result.warnings, ['Preliminary release Tilting carriage 1.0 is withdrawn without a reason in the index']);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, reason: {'1.0': 'Invented reason: the carrier changed.'}, lastCommit: {'1.0': 'a'.repeat(40)}}));
  assert.deepEqual(p.check().warnings, []);
  rmSync(path.join(p.root, inputsOf('4.0')), {recursive: true});
  result = p.check();
  assert.match(errorsOf(result), /4\.0: commit its check inputs at cad\/preliminary-design\/releases\/4\.0/);
  rmSync(path.join(p.root, publishedOf('2.0')), {recursive: true});
  assert.match(errorsOf(p.check()), /Release 2\.0 is listed but has no directory/);
});

test('an effective design this change leaves as it was stands on its published files; its inputs may not leave', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  const effective = p.commit('effective');
  write(p.root, 'README.md', 'Invented');
  p.commit('unrelated');
  let result = p.check({base: effective});
  assert.deepEqual([result.errors, p.judged, noteOf(result, '1.0')], [[], [], 'effective, untouched since ' + effective + '.']);
  // Its inputs removed: the files its gate judged are gone, so the gate no longer stands for them.
  rmSync(path.join(p.root, inputsOf('1.0')), {recursive: true});
  p.commit('inputs gone');
  assert.match(errorsOf(p.check({base: effective})), /1\.0 is effective, and what its stage gate judged has changed: cad\/preliminary-design\/releases\/1\.0\/design\.json is missing/);
  // Control: a draft without its inputs is refused too.
  p.setStatus({'1.0': 'in-progress'});
  assert.match(errorsOf(p.check({base: effective})), /1\.0: commit its check inputs at cad\/preliminary-design\/releases\/1\.0/);
});

test('a gate record that does not stand for the committed design is refused', t => {
  // Each edit is made to an effective release after its gate: a file the gate judged, or the record itself.
  const refused = (name, edit, pattern) => {
    const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
    assert.deepEqual(p.check().errors, [], name + ': control');
    edit(p);
    assert.match(errorsOf(p.check()), pattern, name);
    assert.deepEqual(p.judged, [], name + ': an effective design is not judged again');
  };
  const changed = name => new RegExp('1\\.0 is effective, and what its stage gate judged has changed: .*' + name.replaceAll('.', '\\.') + ' changed');
  const text = (p, name, from, to) => { const file = p.at('1.0', name); const was = readFileSync(file, 'utf8'); assert.ok(was.includes(from), name); writeFileSync(file, was.replace(from, to)); };
  refused('the source', p => text(p, 'design.json', 'Invented arm', 'Invented longer arm'), changed('design.json'));
  refused('a subsystem file', p => text(p, 'subsystems/arm.json', '1', '2'), changed('subsystems/arm.json'));
  refused('a part file', p => write(p.root, inputsOf('1.0') + '/design.step', 'another step'), changed('design.step'));
  refused('the judgement', p => text(p, 'judgement.json', '"minGapMm": 5', '"minGapMm": 0'), changed('judgement.json'));
  refused('a premise', p => text(p, 'premises/robot-mass.json', 'mass.rangeKg', 'mass.totalKg'), changed('premises/robot-mass.json'));
  refused('the season requirements', p => write(p.root, requirementsFile, readFileSync(path.join(p.root, requirementsFile), 'utf8').replace('20', '200')), changed('requirements.json'));
  refused('a record', p => text(p, 'records/measurements/mass.drawn.json', '{}', '{"totalKg":1}'), changed('records/measurements/mass.drawn.json'));
  refused('a trial record', p => text(p, 'records/trials.json', 'passed', 'passed '), changed('records/trials.json'));
  refused('a deleted record', p => rmSync(p.at('1.0', 'records/measurements/mass.drawn.json')), /mass\.drawn\.json is missing/);
  refused('a published copy', p => write(p.root, publishedOf('1.0') + '/judgement.json', '{}'), /the published judgement\.json is not the committed/);
  const inGate = edit => p => editJson(p.gateFile('1.0'), edit);
  refused('no gate record', p => rmSync(p.gateFile('1.0')), /1\.0 is marked effective without a stage gate of this design\. Mark it effective with the plugin's command/);
  refused('an earlier gate format', inGate(g => ({...g, schema: 'agent-frc/stage-gate@1'})), /without a stage gate of this design/);
  refused('another design\'s gate', inGate(g => ({...g, design: '1.1'})), /without a stage gate of this design/);
  refused('a verdict that is not layout-checked', inGate(g => ({...g, verdict: 'provisional'})), /without a stage gate of this design/);
  refused('an unmet requirement', inGate(g => ({...g, firstUnmet: {text: 'Invented'}})), /without a stage gate of this design/);
  refused('readiness below every criterion', inGate(g => ({...g, readiness: {met: 2, of: 3}})), /without a stage gate of this design/);
  refused('a gate that judged no records', inGate(g => ({...g, files: {...g.files, records: {}}})), /without a stage gate of this design/);
  refused('a gate of another folder', p => {
    writeInputs(p.root, 'cad/preliminary-design/releases/9.0', {issue: 'other'});
    inGate(g => ({...g, files: standIn(p.root, path.join(p.root, 'cad/preliminary-design/releases/9.0/judgement.json')).files}))(p);
  }, /without a stage gate of this design/);
});

test('the index holds at most one effective release, a computed current release and every directory', t => {
  const p = project(t, {'1.0': {}, '2.0': {}}, {'1.0': 'effective', '2.0': 'effective'});
  assert.match(errorsOf(p.check()), /At most one preliminary design release is effective/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, designStatus: {'1.0': 'effective', '2.0': 'in-progress'}}));
  assert.match(errorsOf(p.check()), /set current to 1\.0/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: '1.0', designStatus: {'1.0': 'effective', '2.0': 'paused'}}));
  assert.match(errorsOf(p.check()), /designStatus maps listed release IDs to in-progress, effective, superseded, withdrawn/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({current: '1.0', releases: ['1.0'], designs: i.designs}));
  assert.match(errorsOf(p.check()), /Release directory 2\.0 is not in the preliminary release index/);
  // Calling a release's record a historical review exempts nothing while its status is live.
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({current: '2.0', releases: ['1.0', '2.0'], designs: i.designs,
    designStatus: {'1.0': 'in-progress', '2.0': 'in-progress'}}));
  editJson(path.join(p.root, prelim, 'releases/2.0/release.json'), r => ({...r, status: 'historical-review'}));
  const live = p.check();
  assert.deepEqual([live.errors, live.designs.map(d => d.status)], [[], ['in-progress', 'in-progress']]);
});

test('a version ID is checked with the name of its architecture', t => {
  // Synthetic index: an invented architecture, "Tilting carriage", with an effective 1.0 and a draft of 1.1.
  const p = project(t, {'1.0': {}, '1.1': {}}, {'1.0': 'effective', '1.1': 'in-progress'}, null);
  const file = path.join(p.root, prelim, 'releases.json');
  editJson(file, i => ({...i, current: '1.0'}));
  assert.match(errorsOf(p.check()), /Design 1 has no name: add designs\.1\.name to the preliminary release index, or stage a version with --design-name/);
  editJson(file, i => ({...i, designs: {one: {name: 'Tilting carriage'}}}));
  assert.match(errorsOf(p.check()), /designs maps each major number to its architecture name/);
  editJson(file, i => ({...i, designs: {1: {name: 'Tilting carriage'}}, revision: {'1.1': {number: 3, date: '2001-02-03'}}, accepted: {'1.0': '2001-01-02'}}));
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.preliminary, {current: '1.0', releases: [
    {release: '1.0', design: 'Tilting carriage 1.0', status: 'effective'}, {release: '1.1', design: 'Tilting carriage 1.1', status: 'in-progress'}]});
  assert.equal(result.reports.length, 1);
  assert.equal(result.reports[0].title, 'Preliminary design Tilting carriage 1.0 (effective)');
  assert.match(result.reports[0].text, /^Stage gate: layout-checked, 3 of 3 readiness criteria met, judged \d{4}-\d{2}-\d{2} on 6 records with frc-design-kernel 0\.0\.0/);
  // A failing version is named the same way.
  p.override('1.1', {status: 'provisional', firstUnmet: {kind: 'coverage', text: 'invented'}});
  assert.match(errorsOf(p.check()), /Preliminary design Tilting carriage 1\.1 needs a layout-checked design/);
  rmSync(p.at('1.1', 'stand-in.json'));
  // Two in-progress versions of one architecture are two drafts under two numbers: a warning for the reviewer.
  editJson(file, i => ({...i, current: '1.1', designStatus: {...i.designStatus, '1.0': 'in-progress'}}));
  const two = p.check();
  assert.deepEqual(two.errors, []);
  assert.match(two.warnings.join(' '), /Tilting carriage has 2 in-progress versions \(1\.0, 1\.1\)\. A draft takes no number/);
  // An ID that is not a version is refused.
  editJson(file, i => ({...i, releases: [...i.releases, '1.0.1']}));
  assert.match(errorsOf(p.check()), /unique release IDs, each a version MAJOR\.MINOR/);
});

test('the review scene must repeat the verdict and a mission case must serve a represented objective', t => {
  const p = project(t, {'1.0': {}, '3.0': {}, '4.0': {missions: [{name: 'return', trial: trialName, accomplishes: 'delivered', objective: 'Return to the start box'}]},
    '2.0': {missions: [{name: 'deliver', trial: trialName, accomplishes: 'applauded', objective: 'Carry the sample to the bin'}]}});
  const scene = path.join(p.root, publishedOf('1.0'), 'review-scene.json.gz'), shown = sceneAt(scene);
  const show = change => writeFileSync(scene, gzipSync(JSON.stringify({...shown, ...change})));
  show({weight: {...shown.weight, totalKg: 1}});
  let errors = errorsOf(p.check());
  assert.match(errors, /1\.0: the review scene does not repeat the verdict: Scene weight differs from the verdict\. Build the page again with design preliminary-page and stage it/);
  assert.match(errors, /4\.0 mission case return must serve a represented narrative objective/);
  assert.match(errors, /2\.0 mission case deliver accomplishes one of acquired, delivered, scored, climb-held/);
  assert.doesNotMatch(errors, /Sliding gate 3\.0/);
  // A scene the stock page cannot play is refused even where it repeats the verdict, and so is one built from other records.
  show({openingCase: 'nowhere'});
  assert.match(errorsOf(p.check()), /1\.0: the review page cannot play its scene: openingCase names an unknown case/);
  show({records: {...shown.records, jobs: shown.records.jobs.map((j, i) => i ? j : {...j, sha256: sha('earlier')})}});
  assert.match(errorsOf(p.check()), /1\.0: the review scene was built from another .*clearance\.motion\.loaded-turn\.json/);
  show({sources: {...shown.sources, design: {...shown.sources.design, sha256: sha('earlier source')}}});
  assert.match(errorsOf(p.check()), /1\.0: the review scene was built from another design source/);
  writeFileSync(scene, 'not a scene');
  assert.match(errorsOf(p.check()), /1\.0: unreadable review-scene\.json\.gz/);
  rmSync(scene);
  assert.match(errorsOf(p.check()), /1\.0 has no review-scene\.json\.gz: build the page with design preliminary-page and stage it/);
});

test('a release plays a mission phase: an operating motion of its cycle, passing, in a mission animation', t => {
  const p = project(t), scene = path.join(p.root, publishedOf('1.0'), 'review-scene.json.gz'), shown = sceneAt(scene);
  assert.equal(errorsOf(p.check()), '');
  const animations = list => writeFileSync(scene, gzipSync(JSON.stringify({...shown, animations: list})));
  const [turn, park] = shown.animations;
  animations([{id: 'cycle', title: 'Whole cycle', mission: true, cases: [...turn.cases, ...park.cases]}]);
  assert.equal(errorsOf(p.check()), '', 'a headline phase that plays the motion, among its other segments, is a mission animation');
  animations([{...turn, mission: false}, park]);
  assert.match(errorsOf(p.check()), /1\.0 plays no mission phase: no mission animation of its review plays a passing operating motion of its cycle/);
  // A park motion is no mission, whatever the page calls it.
  animations([{...turn, mission: false}, {...park, mission: true}]);
  assert.match(errorsOf(p.check()), /plays no mission phase/);
  // Control: a scene without its animation list cannot load on the page, so it is refused.
  const {animations: dropped, ...bare} = shown;
  writeFileSync(scene, gzipSync(JSON.stringify(bare)));
  assert.match(errorsOf(p.check()), /1\.0: the review page cannot play its scene/);
});

test('a design this change makes effective carries the record of its stage gate', t => {
  const p = project(t, {'1.0': {}, '2.0': {}}, {'1.0': 'effective', '2.0': 'in-progress'});
  p.setStatus({});
  const base = p.commit('base');
  // A draft increment: judged on its records, whatever it edits.
  write(p.root, inputsOf('2.0') + '/notes.md', 'changed input');
  p.commit('draft increment');
  let result = p.check({base});
  assert.deepEqual([result.errors, result.designs.map(d => d.note)], [[], ['effective, untouched since ' + base + '.', judgedNote]]);
  // The status set by hand, with no gate: refused, with the command that runs it.
  p.setStatus({'1.0': 'superseded', '2.0': 'effective'});
  p.commit('status by hand');
  assert.match(errorsOf(p.check({base})), /^Preliminary design Swinging arm 2\.0 is marked effective without a stage gate of this design\. Mark it effective with the plugin's command, which judges the committed design and writes docs\/preliminary-design\/releases\/2\.0\/gate\.json: python PLUGIN\/scripts\/stage_preliminary_review\.py --set-status 2\.0 effective$/);
  // The gate ran and wrote its record: the change passes, and the check judges nothing itself.
  p.gate('2.0');
  const promoted = p.commit('gate record');
  p.judged.length = 0;
  result = p.check({base});
  assert.deepEqual([result.errors, result.warnings, p.judged], [[], [], []]);
  assert.equal(noteOf(result, '2.0'), 'becoming effective. Its stage gate record matches the committed files.');
  assert.equal(result.reports.length, 1, 'the gate record is printed');
  // A gate record of another design is not this design's gate.
  editJson(p.gateFile('2.0'), () => read(p.gateFile('1.0')));
  assert.match(errorsOf(p.check({base})), /2\.0 is marked effective without a stage gate of this design/);
  p.git('checkout', '--', publishedOf('2.0') + '/gate.json');
  // A judged file edited after the gate: the record does not stand for it.
  editJson(p.at('2.0', 'judgement.json'), j => ({...j, rules: {...j.rules, minGapMm: 0}}));
  republish(p.root, '2.0');
  assert.match(errorsOf(p.check({base})), /2\.0 is effective, and what its stage gate judged has changed: cad\/preliminary-design\/releases\/2\.0\/judgement\.json changed/);
  p.git('checkout', '--', '.');
  // The next change finds it effective already.
  write(p.root, 'notes.md', 'unrelated');
  p.commit('unrelated');
  result = p.check({base: promoted});
  assert.deepEqual([result.errors, noteOf(result, '2.0')], [[], 'effective, untouched since ' + promoted + '.']);
});

test('without --base the check compares with the default branch of the remote', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  p.commit('accepted');
  // An invented remote: the commit above is its default branch, as last fetched.
  p.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  p.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  p.git('checkout', '-q', '-b', 'revision');
  let result = p.check();
  assert.deepEqual([result.errors, result.comparedWith, noteOf(result, '1.0')], [[], 'origin/main', 'effective, untouched since origin/main.']);
  editJson(p.at('1.0', 'judgement.json'), j => ({...j, purposes: {}}));
  p.commit('physics');
  assert.match(errorsOf(p.check()), /1\.0 is effective, and what its stage gate judged has changed: cad\/preliminary-design\/releases\/1\.0\/judgement\.json changed/);
});

test('an effective design is frozen: its page may change, the files its gate judged may not, and no second gate replaces the first', t => {
  const p = project(t, {'1.0': {}, '1.1': {}}, {'1.0': 'superseded', '1.1': 'effective'});
  p.setStatus({});
  const base = p.commit('base'), gate = read(p.gateFile('1.1')), judgement = inputsOf('1.1') + '/judgement.json';
  const passes = message => { p.commit(message); const result = p.check({base}); assert.deepEqual([result.errors, result.warnings, noteOf(result, '1.1')], [[], [], 'effective, its files as its stage gate judged them on ' + gate.date + '.'], message); };
  const refused = (message, pattern) => { p.commit(message); assert.match(errorsOf(p.check({base})), pattern, message); };
  // A view refresh: new page text, a rebuilt page and a rebuilt scene from the same records.
  editJson(p.at('1.1', 'page.json'), page => ({...page, title: 'Invented new title'}));
  paged(p.root, judgement);
  write(p.root, inputsOf('1.1') + '/review.html', '<html>Rebuilt review page</html>');
  republish(p.root, '1.1');
  passes('view refresh');
  // An accepted date is a label in the index.
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, accepted: {'1.1': '2001-01-02'}}));
  passes('labels');
  const open = / An effective design does not change in place\. Open 1\.2 as a draft and make the change there\. A rebuilt page and its page file pass\./;
  const was = readFileSync(path.join(p.root, judgement), 'utf8');
  editJson(path.join(p.root, judgement), j => ({...j, rules: {...j.rules, minGapMm: 0}}));
  republish(p.root, '1.1');
  refused('a looser rule', /Preliminary design Tilting carriage 1\.1 is effective, and what its stage gate judged has changed: cad\/preliminary-design\/releases\/1\.1\/judgement\.json changed\./);
  assert.match(errorsOf(p.check({base})), open);
  // Running the gate again on the changed design does not accept the change: an effective design does not change in place.
  p.gate('1.1');
  refused('a second gate', /1\.1 is effective, and its gate record is not the one it became effective on\./);
  assert.match(errorsOf(p.check({base})), open);
  writeFileSync(path.join(p.root, judgement), was);
  republish(p.root, '1.1');
  writeGate(path.join(p.root, publishedOf('1.1')), gate);
  passes('restored');
  // Demoted to a draft in the same change, the design may change again.
  const q = project(t, {'1.0': {}}, {'1.0': 'effective'}), before = q.commit('base');
  editJson(q.at('1.0', 'judgement.json'), j => ({...j, rules: {...j.rules, minGapMm: 0}}));
  republish(q.root, '1.0');
  q.setStatus({'1.0': 'in-progress'});
  q.commit('reopened');
  assert.deepEqual(q.check({base: before}).errors, []);
});

test('a rename is a new design to the gate: the same files under a new ID carry a gate record of their own', t => {
  const p = project(t, {'1.0': {step: 'the arm'}}, {'1.0': 'effective'});
  const base = p.commit('base');
  // The same source and records, staged under another version with its own issue name and folder; the first ID is removed.
  issueRelease(p.root, '1.1', {step: 'the arm'});
  cpSync(p.gateFile('1.0'), p.gateFile('1.1'));
  for (const dir of [publishedOf('1.0'), inputsOf('1.0')]) rmSync(path.join(p.root, dir), {recursive: true, force: true});
  write(p.root, prelim + '/releases.json', {current: '1.1', releases: ['1.1'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.1': 'effective'}});
  p.commit('rename');
  assert.match(errorsOf(p.check({base})), /Tilting carriage 1\.1 is marked effective without a stage gate of this design/, 'the first ID\'s record is not its own');
  // The gate takes seconds: it judges the records the design already holds.
  p.gate('1.1');
  p.commit('gate');
  const result = p.check({base});
  assert.deepEqual([result.errors, result.warnings, noteOf(result, '1.1')], [[], [], 'becoming effective. Its stage gate record matches the committed files.']);
});

test('a project in a subfolder of its repository is compared by its own paths', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  const outer = mkdtempSync(path.join(os.tmpdir(), 'publication-repo-'));
  t.after(() => rmSync(outer, {recursive: true, force: true}));
  cpSync(p.root, path.join(outer, 'robot'), {recursive: true});
  const git = (...args) => execFileSync('git', ['-C', outer, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD'), root = path.join(outer, 'robot');
  write(root, 'notes.md', 'a change beside the design');
  git('add', '-A'); git('commit', '-q', '-m', 'notes');
  // The index and the inputs at the base commit are read by the project's own paths.
  assert.deepEqual(checkProject(root, {base, log: () => {}, judge: standIn}).designs.map(d => d.note), ['effective, untouched since ' + base + '.']);
  editJson(path.join(root, inputsOf('1.0'), 'judgement.json'), j => ({...j, purposes: {}}));
  git('add', '-A'); git('commit', '-q', '-m', 'physics');
  assert.match(errorsOf(checkProject(root, {base, log: () => {}, judge: standIn})), /1\.0 is effective, and what its stage gate judged has changed: .*judgement\.json changed/);
});

const stepOf = id => sha('step ' + id), designInputs = id => 'cad/detailed-design/designs/' + id;
/** Publish a detailed design on the layout of a preliminary release: its own inputs, judgement and records in its own folder. */
function design(root, id, status, {from = '1.0', more = {}, index = i => i, readiness} = {}) {
  const dir = detail + '/designs/' + id, folder = designInputs(id);
  writeInputs(root, folder, {issue: 'synthetic-' + from, step: 'step ' + from, more});
  publish(root, folder, dir, {top: 'source.json'});
  write(root, dir + '/design.json', {schema: 'agent-frc/detailed-design@1', design: id, issue: 'synthetic-' + from, preliminary: {release: from},
    fusion: {stepSha256: stepOf(from), archiveSha256: sha('archive'), configuration: 'Invented stowed assembly'}, check: {project: folder}});
  if (readiness) write(root, dir + '/readiness.json', readiness(stepOf(from)));
  const file = path.join(root, detail, 'designs.json');
  const prior = (() => { try { return read(file); } catch { return {schema: 'agent-frc/detailed-design-index@1', designs: [], architectures: {1: names[1]}, designStatus: {}}; } })();
  const next = {...prior, designs: [...prior.designs, id], designStatus: {...prior.designStatus, [id]: status}};
  const of = s => next.designs.filter(d => next.designStatus[d] === s).at(-1) ?? null;
  write(root, detail + '/designs.json', index({...next, current: of('effective') ?? of('in-progress'), beside: of('effective') ? of('in-progress') : null}));
}

test('an in-progress detailed design names an effective preliminary release and is judged on its Fusion export', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  design(p.root, '1.0', 'in-progress');
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.detailed, {current: '1.0', beside: null, designs: [{design: '1.0', title: 'Tilting carriage 1.0', state: 'draft 1 · in progress', status: 'in-progress'}]});
  assert.equal(noteOf(result, 'Detailed design'), judgedNote);
  // A design the change leaves alone is not judged: a newer library must not fail an unrelated push.
  const base = p.commit('base');
  p.judged.length = 0;
  write(p.root, 'README.md', 'Invented');
  result = p.check({base});
  assert.deepEqual([result.errors, p.judged, noteOf(result, 'Detailed design')], [[], [], 'draft, untouched by this change, so it was not judged.']);
  // Its layout check covers what its preliminary design judged: the cycle's motions and the displaced control.
  for (const [more, pattern] of [[{cycle: read(p.at('1.0', 'judgement.json')).cycle.map(e => e.phase === 'transfer' ? {phase: 'transfer', notApplicable: 'Invented'} : e)}, /1\.0: its layout check must run the motions, cycle and displaced control of preliminary release 1\.0/],
    [{control: {...read(p.at('1.0', 'judgement.json')).control, displaced: 'frame'}}, /1\.0: its layout check must run the motions, cycle and displaced control of preliminary release 1\.0/]]) {
    const q = project(t, {'1.0': {}}, {'1.0': 'effective'});
    design(q.root, '1.0', 'in-progress', {more});
    assert.match(errorsOf(q.check()), pattern);
  }
  // Inputs not committed: there is nothing to judge.
  rmSync(path.join(p.root, 'cad/detailed-design'), {recursive: true});
  assert.match(errorsOf(p.check()), /1\.0: commit its check inputs at cad\/detailed-design\/designs\/1\.0/);
  editJson(path.join(p.root, detail, 'designs/1.0/design.json'), r => ({...r, fusion: {...r.fusion, stepSha256: sha('another export')}}));
  writeInputs(p.root, designInputs('1.0'), {issue: 'synthetic-1.0', step: 'step 1.0'});
  assert.match(errorsOf(p.check()), /1\.0: the checked design source places no solid from the Fusion export the record names/);
});

test('the preliminary link must be effective, with its gate record; a superseded link only warns', t => {
  const p = project(t, {'1.0': {}, '2.0': {}}, {'1.0': 'in-progress', '2.0': 'in-progress'});
  design(p.root, '1.0', 'in-progress');
  assert.match(errorsOf(p.check()), /1\.0 must name an effective preliminary release; 1\.0 is in-progress/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, designStatus: {'1.0': 'superseded', '2.0': 'effective'}}));
  // A preliminary design handed on without its gate met no criteria.
  assert.match(errorsOf(p.check()), /Detailed design Tilting carriage 1\.0 is built on preliminary release 1\.0, which carries no stage gate record of its committed design/);
  p.gate('1.0');
  p.gate('2.0');
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /1\.0 names preliminary release 1\.0, which is now superseded/);
});

test('an effective detailed design is a status change that carries its readiness review', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  const review = (verdict, step = stepOf('1.0')) => ({schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly', stepSha256: step,
    archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict,
    findings: verdict === 'pass' ? [] : [{domain: 'service', status: 'open', subject: 'invented cover', reason: 'removal path not shown'}]});
  const published = path.join(p.root, detail, 'designs/1.0'), inputs = path.join(p.root, designInputs('1.0'));
  const gate = (judge = p.judge) => { const made = stageGate({root: p.root, where: 'Detailed design Tilting carriage 1.0', id: '1.0', phase: 'detailed-design', inputs, published, judge}); writeGate(published, made); return made; };
  design(p.root, '1.0', 'in-progress');
  assert.deepEqual(p.check().errors, []);
  const draft = p.commit('in progress');
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, designStatus: {'1.0': 'effective'}}));
  assert.match(errorsOf(p.check({base: draft})), /1\.0 is effective: commit its mechanical-readiness review result as designs\/1\.0\/readiness\.json/);
  // A review that does not pass blocks the status. Its findings are printed for the reviewer.
  write(p.root, detail + '/designs/1.0/readiness.json', review('open'));
  let result = p.check({base: draft});
  assert.match(errorsOf(result), /1\.0 cannot be effective: its mechanical-readiness review reports open/);
  assert.match(result.reports.find(r => /Detailed design/.test(r.title)).text, /service: invented cover: open: removal path not shown/);
  // A detailed design this change makes effective needs the record of its stage gate, like a preliminary one.
  write(p.root, detail + '/designs/1.0/readiness.json', review('pass'));
  assert.match(errorsOf(p.check({base: draft})), /Detailed design Tilting carriage 1\.0 is marked effective without a stage gate of this design\. .* node PLUGIN\/scripts\/detailed-design-release\.mjs effective \. --design 1\.0 --readiness REVIEW_RESULT\.json$/);
  // Its gate refuses a stale record as a preliminary one does.
  const arm = path.join(inputs, 'subsystems/arm.json'), held = readFileSync(arm);
  editJson(arm, s => ({...s, solids: [{name: 'arm', massKg: 9}]}));
  assert.throws(() => gate(), /is not marked effective: its inputs have uncommitted changes/);
  p.commit('stale');
  assert.throws(() => gate(), /Detailed design Tilting carriage 1\.0 is not marked effective: .*is stale: solid "arm" changed/);
  writeFileSync(arm, held);
  p.commit('restored');
  assert.equal(gate().readiness, undefined, 'its readiness is the mechanical review it carries');
  const promoted = p.commit('gate');
  result = p.check({base: draft});
  assert.deepEqual([result.errors, result.detailed.designs], [[], [{design: '1.0', title: 'Tilting carriage 1.0', state: 'effective', status: 'effective'}]]);
  assert.match(result.reports.find(r => /Detailed design/.test(r.title)).text, /Showcase eligibility: pass\nFindings not passing: 0/);
  assert.equal(noteOf(result, 'Detailed'), 'becoming effective. Its stage gate record matches the committed files.');
  // Effective already, what its gate judged may not change in place.
  editJson(path.join(inputs, 'judgement.json'), j => ({...j, rules: {...j.rules, minGapMm: 0}}));
  publish(p.root, designInputs('1.0'), detail + '/designs/1.0', {top: 'source.json'});
  p.commit('changed rule');
  assert.match(errorsOf(p.check({base: promoted})), /Detailed design Tilting carriage 1\.0 is effective, and what its stage gate judged has changed: cad\/detailed-design\/designs\/1\.0\/judgement\.json changed/);
  editJson(path.join(p.root, detail, 'designs/1.0/readiness.json'), r => ({...r, stepSha256: sha('another step')}));
  assert.match(errorsOf(p.check()), /readiness review is of a different STEP/);
});

test('the detailed primary view is computed: the effective design, with the newest in-progress one beside it', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  design(p.root, '1.0', 'withdrawn');
  design(p.root, '1.1', 'in-progress');
  rmSync(path.join(p.root, detail, 'designs/1.0'), {recursive: true});
  assert.deepEqual(p.check().errors, []);
  assert.deepEqual(p.check().warnings, ['Detailed design Tilting carriage 1.0 is withdrawn without a reason in the index']);
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, reason: {'1.0': 'Invented reason.'}}));
  assert.deepEqual(p.check().warnings, []);
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, current: '1.0'}));
  assert.match(errorsOf(p.check()), /set current to 1\.1 and beside to null/);
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, current: '1.1', designStatus: {'1.0': 'effective', '1.1': 'effective'}}));
  assert.match(errorsOf(p.check()), /At most one detailed design is effective/);
});

test('the command says what it checked and what a push will do', t => {
  const p = project(t);
  const run = (...args) => spawnSync(process.execPath, [standInCli, 'design-publication.mjs', 'check', p.root, ...args], {encoding: 'utf8'});
  const ready = run();
  assert.equal(ready.status, 0, ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout).preliminary.releases, [{release: '1.0', design: 'Tilting carriage 1.0', status: 'in-progress'}]);
  // The lines an agent reads: one for each design, the time, then what a push will do.
  assert.match(ready.stderr, /^\[publication\] Preliminary design Tilting carriage 1\.0: draft, judged layout-checked on its committed records in 1\.4 s \(status 1\.0 s of it\)\.$/m);
  assert.match(ready.stderr, /^\[publication\] Checked in \d+\.\d s; judging 1\.4 s, status 1\.0 s of it\.$/m);
  assert.match(ready.stderr, /Ready to push\. On push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: '9.0'}));
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Error: The preliminary index must open/);
  rmSync(path.join(p.root, 'docs'), {recursive: true});
  const empty = run();
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout).preliminary, null);
  assert.equal(run('--base').status, 2);
  // The shipped commands take nothing that stands in for the judgement.
  for (const [command, args] of [['../scripts/stage-gate.mjs', ['preliminary', p.root, '--release', '1.0', '--check', standInCli]], ['../scripts/detailed-design-release.mjs', ['refresh', p.root, '--check', standInCli]]])
    assert.notEqual(spawnSync(process.execPath, [here(command), ...args], {encoding: 'utf8'}).status, 0, command);
  assert.match(spawnSync(python, ['-B', stagingCommand, '--set-status', '1.0', 'effective', '--gate-check', standInCli], {encoding: 'utf8'}).stderr, /unrecognized arguments: --gate-check/);
});

test('the publication check scans tracked files for a personal path or a credential', t => {
  const p = project(t);
  p.commit('clean');
  assert.deepEqual(p.check().errors, []);
  // Invented values, assembled here so this file holds neither.
  write(p.root, 'docs/notes.md', 'Built at ' + ['C:', 'Users', 'invented-student', 'robot'].join('\\') + '\n');
  p.commit('a path');
  assert.match(errorsOf(p.check()), /^docs\/notes\.md:1: a personal machine path; write paths relative to the repository: /);
  assert.deepEqual(p.check({scan: false}).errors, []);
});

const kernel = {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'};
let built;
/** The invented starter, made ready, measured and staged as its first draft: built once, copied for each test. */
function starter() {
  if (built) return built;
  built = path.join(mkdtempSync(path.join(os.tmpdir(), 'publication-real-')), 'season');
  execFileSync(python, ['-B', here('../examples/design-source/create.py'), built, '--project-review', '--no-check'], {stdio: 'pipe'});
  // The starter gains an interaction, its trial and an adjustment, so it can meet every readiness criterion.
  execFileSync(python, ['-B', here('./fixtures/ready_example.py'), built, '1.0', 'Turning carrier'], {stdio: 'pipe'});
  // Counts every call that measures or runs a trial, in any Python process a command starts with its folder on PYTHONPATH.
  write(path.dirname(built), 'count/sitecustomize.py', ['import os', 'from frc_design_kernel.measure import records, run', 'from frc_design_kernel.trials import campaign', 'def counted(module, name):',
    '    real = getattr(module, name)', '    def call(*args, **kwargs):', '        with open(os.environ["FRC_COUNT"], "a") as out:', '            out.write(name + "\\n")', '        return real(*args, **kwargs)',
    '    setattr(module, name, call)', 'counted(records, "record")', 'counted(run, "completed")', 'counted(campaign, "run_campaign")', ''].join('\n'));
  return built;
}
test.after(() => { if (built) rmSync(path.dirname(built), {recursive: true, force: true}); });
/** A copy of the starter project in a Git repository, with the commands an agent runs on it. */
function example(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'publication-real-')), season = path.join(temp, 'season'), calls = path.join(temp, 'calls.txt');
  t.after(() => rmSync(temp, {recursive: true, force: true}));
  cpSync(starter(), season, {recursive: true});
  const env = {...process.env, FRC_COUNT: calls, PYTHONPATH: [path.join(path.dirname(built), 'count'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
  // Run from the project root, as an agent does. Both streams are returned: the commands speak on each.
  const spoken = (command, args) => { const run = spawnSync(command, args, {cwd: season, encoding: 'utf8', env, maxBuffer: 1 << 28}); return {...run, said: run.stdout + run.stderr}; };
  const stage = (...args) => spoken(python, ['-B', stagingCommand, ...args]);
  const design = (...args) => spoken(process.execPath, [here('../scripts/design.mjs'), ...args]);
  const judgement = id => inputsOf(id) + '/judgement.json';
  const layoutCheck = (id, ...more) => design('preliminary-check', '.', judgement(id), '--require-checked', '--quiet', ...more);
  const page = id => design('preliminary-page', '.', judgement(id), '--quiet');
  const check = (...args) => { const run = spoken(process.execPath, [here('../scripts/design-publication.mjs'), 'check', '.', ...args]); return {...run, ...(run.stdout ? JSON.parse(run.stdout) : {})}; };
  const git = (...args) => execFileSync('git', ['-C', season, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  const commit = message => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  const status = id => read(path.join(season, prelim, 'releases.json')).designStatus[id];
  /** The calls that measured or ran a trial since the last time this was asked. */
  const measuredSince = () => { const found = existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean) : []; rmSync(calls, {force: true}); return found; };
  const at = (id, name) => path.join(season, inputsOf(id), name);
  git('init', '-q');
  return {season, stage, design, layoutCheck, page, git, commit, status, check, at, measuredSince, gateFile: id => path.join(season, publishedOf(id), 'gate.json')};
}

test('marking a real release effective judges its records, measures nothing and runs no trial; a stale job, a missing job, a stale trial and readiness below 3 of 3 each refuse and leave no gate record', kernel, t => {
  const e = example(t);
  // The project the starter writes holds data, published output and its own CI, which names no plugin.
  assert.doesNotMatch(readFileSync(path.join(e.season, '.github/workflows/ci.yml'), 'utf8'), /agent-frc|plugin\//);
  for (const check of [['scan.mjs', '.'], ['site-check.mjs', 'docs']]) execFileSync(process.execPath, [path.join(e.season, 'scripts/ci', check[0]), check[1]], {cwd: e.season, stdio: 'pipe'});
  // The published folder: the source, the judgement, the page file, the records and the page, and nothing of the earlier formats.
  const published = readdirSync(path.join(e.season, publishedOf('1.0')), {recursive: true}).map(String).map(n => n.split(path.sep).join('/')).filter(n => /\.\w+$/.test(n)).sort();
  for (const name of ['design.json', 'index.html', 'judgement.json', 'page.json', 'records/adjustments.json', 'records/trials.json', 'records/measurements/mass.drawn.json', 'release.json', 'review-scene.json.gz'])
    assert.ok(published.includes(name), name + ' in ' + published);
  assert.equal(published.filter(n => /budget|limits|mission|receipt|requirements/i.test(n)).join(), '');
  assert.deepEqual(read(path.join(e.season, publishedOf('1.0'), 'release.json')), {schema: 'agent-frc/preliminary-release@2', release: '1.0', issue: 'invented-design-1.0', phase: 'preliminary-design',
    check: {project: inputsOf('1.0')}, requirements: requirementsFile});
  // Uncommitted inputs: the gate does not judge, and the status stays.
  let refused = e.stage('--set-status', '1.0', 'effective');
  assert.notEqual(refused.status, 0);
  assert.match(refused.said, /Preliminary design Turning carrier 1\.0 is not marked effective: its inputs have uncommitted changes .*The stage gate judges the committed design\./);
  assert.match(refused.said, /Release 1\.0 keeps its status: the stage gate did not pass/);
  const draft = e.commit('draft');
  assert.deepEqual(e.check().errors, []);
  // Each control is committed, refused with its reason, and undone.
  const control = (name, edit, pattern) => {
    edit();
    e.commit(name);
    const run = e.stage('--set-status', '1.0', 'effective');
    assert.notEqual(run.status, 0, name);
    assert.match(run.said, /Turning carrier 1\.0 is not marked effective/, name);
    assert.match(run.said, pattern, name);
    assert.equal(existsSync(e.gateFile('1.0')), false, name + ' leaves no gate record');
    assert.equal(e.status('1.0'), 'in-progress', name);
    e.git('checkout', '-q', draft, '--', '.');
    e.git('commit', '-q', '-m', 'restored ' + name);
  };
  control('a stale job', () => editJson(e.at('1.0', 'design.json'), s => ({...s, solids: s.solids.map(x => x.name === 'rail' ? {...x, shape: {...x.shape, fromMm: [19, 72, 18], toMm: [24, 77, 23]}} : x)})),
    /measurements\/clearance\.motion\.loaded-turn\.json is stale: .*solid "rail" changed/);
  control('a missing job', () => rmSync(e.at('1.0', 'records/measurements/mass.drawn.json')), /mass\.drawn\.json is missing/);
  control('a stale trial', () => editJson(e.at('1.0', 'design.json'), s => ({...s, materials: {...s.materials, felt: {...s.materials.felt, friction: {value: 0.6, assumed: [0.3, 0.8]}}}})),
    /trial "ball stays at the wall" is stale: the trial definition changed/);
  control('readiness below 3 of 3', () => editJson(e.at('1.0', 'judgement.json'), j => ({...j, risks: [openRisk]})), /meets 2 of 3 criteria on the committed design\. Not met: Every open risk/);
  control('a displaced control that does not collide', () => {
    editJson(e.at('1.0', 'judgement.json'), j => ({...j, control: {...j.control, offsetMm: [0, 50, 0]}}));
    e.layoutCheck('1.0');
  }, /its records judge it provisional: .*displaced control/i);
  // Control for the count: a check that measures is counted, here the one above.
  assert.ok(e.measuredSince().includes('record'));
  // The gate passes: it judges the records as they are. Nothing is measured and no trial runs.
  const accepted = e.stage('--set-status', '1.0', 'effective');
  assert.equal(accepted.status, 0, accepted.said);
  assert.deepEqual(e.measuredSince(), [], 'the measuring entry point is called 0 times and no trial is run');
  assert.match(accepted.said, /^\[gate\] Preliminary design Turning carrier 1\.0: layout-checked on \d+ current records, 3 of 3 readiness criteria met, in \d+\.\d s \(status \d+\.\d s of it\)\. Nothing was measured\.$/m);
  assert.match(accepted.said, /Effective-readiness report for Turning carrier 1\.0 \(invented-design-1\.0\)/);
  assert.match(accepted.said, /Result: 3 of 3 criteria met\./);
  assert.match(accepted.said, /Preliminary design Turning carrier 1\.0 is effective; the site opens 1\.0/);
  assert.match(accepted.stdout, /On push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  assert.equal(e.status('1.0'), 'effective');
  const gate = read(e.gateFile('1.0'));
  assert.deepEqual([gate.schema, gate.verdict, gate.firstUnmet, gate.readiness, gate.design, gate.commit, gate.library.library],
    ['agent-frc/stage-gate@2', 'layout-checked', null, {met: 3, of: 3}, '1.0', e.git('rev-parse', 'HEAD'), 'frc-design-kernel']);
  // Every design file, the judgement with what it reads, and every record judged, each by its digest.
  const digest = name => sha(readFileSync(path.join(e.season, name)));
  for (const group of Object.values(gate.files)) for (const [name, recorded] of Object.entries(group)) assert.equal(recorded, digest(name), name);
  assert.deepEqual(Object.keys(gate.files.source), [inputsOf('1.0') + '/design.json']);
  assert.deepEqual(Object.keys(gate.files.judgement).sort(), [requirementsFile, inputsOf('1.0') + '/judgement.json', inputsOf('1.0') + '/premises/robot-mass.json'].sort());
  assert.deepEqual(Object.keys(gate.files.records).map(n => path.posix.basename(n)).sort(),
    [...sceneAt(path.join(e.season, publishedOf('1.0'), 'review-scene.json.gz')).records.jobs.map(j => path.posix.basename(j.file)), 'adjustments.json', 'trials.json'].sort());
  e.commit('effective');
  const result = e.check('--base', draft);
  assert.deepEqual([result.errors, result.designs[0].note], [[], 'becoming effective. Its stage gate record matches the committed files.']);
  // A judged file edited after the gate: the publication check refuses the effective release.
  editJson(e.at('1.0', 'judgement.json'), j => ({...j, rules: {...j.rules, minGapMm: 0}}));
  assert.match(e.check('--base', draft).errors.join('\n'), /1\.0 is effective, and what its stage gate judged has changed: cad\/preliminary-design\/releases\/1\.0\/judgement\.json changed/);
});

test('a draft whose records were carried is staged and passes the gate, which measures nothing', kernel, t => {
  const e = example(t);
  // One solid moves, clear of everything: its records are measured again and the rest are carried.
  editJson(e.at('1.0', 'design.json'), s => ({...s, solids: s.solids.map(x => x.name === 'rail' ? {...x, shape: {...x.shape, fromMm: [19, 71, 18], toMm: [24, 76, 23]}} : x)}));
  // Until then the draft is not published: staging judges the records and refuses a stale one.
  const stale = e.stage('1.0');
  assert.notEqual(stale.status, 0);
  assert.match(stale.said, /clearance\.motion\.loaded-turn\.json is stale: .*solid "rail" changed/);
  const carried = e.design('preliminary-check', '.', inputsOf('1.0') + '/judgement.json', '--require-checked');
  assert.equal(carried.status, 0, carried.said);
  assert.match(carried.said, /measured [1-9]\d* and carried [1-9]\d* of \d+ record/);
  // A page built from the earlier records is refused too.
  assert.match(e.stage('1.0').said, /review scene does not repeat the verdict|was built from another/);
  assert.equal(e.page('1.0').status, 0);
  e.measuredSince();
  const staged = e.stage('1.0');
  assert.equal(staged.status, 0, staged.said);
  e.commit('draft on carried records');
  const checked = e.check();
  assert.deepEqual(checked.errors, []);
  assert.match(checked.designs[0].note, /^draft, judged layout-checked on its committed records in \d+\.\d s \(status \d+\.\d s of it\)\.$/);
  const accepted = e.stage('--set-status', '1.0', 'effective');
  assert.equal(accepted.status, 0, accepted.said);
  assert.deepEqual(e.measuredSince(), [], 'staging, the publication check and the gate measure nothing');
});

test('a judgement file that types a digest is refused by staging and by the gate', kernel, t => {
  const e = example(t), judgement = e.at('1.0', 'judgement.json'), was = readFileSync(judgement);
  editJson(judgement, j => ({...j, source: {...j.source, sha256: sha(readFileSync(e.at('1.0', 'design.json')))}}));
  assert.match(e.stage('1.0').said, /A file reference is \{file\}: source holds sha256/);
  e.commit('typed digest');
  const refused = e.stage('--set-status', '1.0', 'effective');
  assert.match(refused.said, /Turning carrier 1\.0 is not marked effective: .*A file reference is \{file\}: source holds sha256/s);
  assert.equal(e.status('1.0'), 'in-progress');
  writeFileSync(judgement, was);
  e.commit('restored');
  assert.equal(e.stage('--set-status', '1.0', 'effective').status, 0);
});

test('on a real release a draft revision, a view refresh and a rename measure nothing, and a change to the design is refused', kernel, t => {
  const e = example(t), {season} = e;
  // An edit to the in-progress design's page is staged under the same ID: one entry and a counted draft.
  editJson(e.at('1.0', 'page.json'), p => ({...p, focus: 'Invented revised focus.'}));
  assert.equal(e.page('1.0').status, 0);
  const revised = e.stage('1.0');
  assert.match(revised.said, /^Revised preliminary design Turning carrier 1\.0 in place \(draft 2, in progress\)\r?\nBefore pushing, run the publication check: node PLUGIN\/scripts\/design-publication\.mjs check \.\r?\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  assert.equal(read(path.join(season, prelim, 'releases.json')).revision['1.0'].number, 2);
  e.commit('draft 2');
  assert.equal(e.stage('--set-status', '1.0', 'effective').status, 0);
  const effective = e.commit('effective');
  // A view refresh: reworded page text, the page rebuilt from the records and republished. The gate record stays.
  editJson(e.at('1.0', 'page.json'), p => ({...p, focus: 'Invented reworded focus.', title: 'Invented reworded title'}));
  e.page('1.0');
  assert.match(e.stage('--refresh-view', '1.0').said, /Refreshed the view of preliminary design Turning carrier 1\.0 \(effective\)/);
  assert.ok(existsSync(e.gateFile('1.0')));
  e.commit('view refresh');
  let result = e.check('--base', effective);
  assert.deepEqual([result.errors, result.warnings], [[], []]);
  assert.match(result.designs[0].note, /^effective, its files as its stage gate judged them on /);
  // A rename: the same design under another ID, folder and issue name, with its records, staged and marked effective, and the first ID removed.
  assert.match(e.stage('--copy-inputs', '1.0', '1.1').said, /Copied the inputs of release 1\.0 to cad\/preliminary-design\/releases\/1\.1/);
  editJson(e.at('1.1', 'judgement.json'), j => { assert.equal(j.issue, 'invented-design-1.0'); return {...j, issue: 'invented-renamed-design'}; });
  assert.equal(e.design('preliminary-check', '.', inputsOf('1.1') + '/judgement.json', '--judge-only', '--require-checked', '--quiet').status, 0, 'the copied records are current: nothing is measured again');
  e.page('1.1');
  assert.equal(e.stage('1.1').status, 0);
  e.commit('renamed draft');
  assert.equal(e.stage('--set-status', '1.1', 'effective').status, 0);
  const removed = e.stage('--remove', '1.0', '--replaced-by', '1.1');
  assert.equal(removed.status, 0, removed.said);
  const renamed = e.commit('rename');
  result = e.check('--base', effective);
  assert.deepEqual([result.errors, result.warnings, result.preliminary.releases], [[], [], [{release: '1.1', design: 'Turning carrier 1.1', status: 'effective'}]]);
  assert.equal(result.designs[0].note, 'becoming effective. Its stage gate record matches the committed files.');
  assert.deepEqual(e.measuredSince(), [], 'none of it measured or ran a trial');
  // A change to the effective design: a looser rule, measured and paged again.
  editJson(e.at('1.1', 'judgement.json'), j => ({...j, rules: {...j.rules, minGapMm: 0.5}}));
  e.layoutCheck('1.1');
  e.page('1.1');
  assert.match(e.stage('--refresh-view', '1.1').said,
    /Turning carrier 1\.1 is effective, and what its stage gate judged has changed: .*judgement\.json changed.* Work that changes it belongs to 1\.2, staged as a draft/s);
  e.commit('changed tolerance');
  assert.match(e.check('--base', renamed).errors.join('\n'), /Preliminary design Turning carrier 1\.1 is effective, and what its stage gate judged has changed: .* An effective design does not change in place\. Open 1\.2 as a draft and make the change there\./s);
});
