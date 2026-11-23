/**
 * @lane merge
 * @subject scripts/design-publication.mjs
 * @subject scripts/stage-gate.mjs
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
import {gzipSync, gunzipSync} from 'node:zlib';
import {checkProject, compareVerdicts, pluginVersion} from '../scripts/design-publication.mjs';
import {gatePhysics, preliminaryGate, stageGate, writeGate} from '../scripts/stage-gate.mjs';
import {commitInputs, issueRelease, listing, sha, write} from './fixtures/preliminary-release.mjs';

// The staging command is the plugin's: an agent runs it from the plugin, at the project root.
const stagingCommand = fileURLToPath(new URL('../scripts/stage_preliminary_review.py', import.meta.url));
// Synthetic teaching fixtures: invented releases, cases and objectives with no relation to any game.
const script = fileURLToPath(new URL('../scripts/design-publication.mjs', import.meta.url));
const prelim = 'docs/preliminary-design', detail = 'docs/detailed-design';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
// The invented architectures of these indexes, by major number.
const names = {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}, 3: {name: 'Sliding gate'}, 4: {name: 'Rolling cradle'}};

/**
 * A project with committed inputs for each release. `check` runs the publication check; `run` is a layout check for
 * the stage gate that returns what `rerun` makes of the published receipt; `gate` runs the gate of a release and
 * writes its record, as the command that marks it effective does.
 */
function project(t, releases = {'1.0': {}}, statuses = undefined, designs = names) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [id, options] of Object.entries(releases)) {
    issueRelease(path.join(root, 'docs'), id, options);
    commitInputs(root, id, options);
  }
  const ids = Object.keys(releases);
  listing(path.join(root, 'docs'), ids.at(-1), ids, statuses, designs && Object.fromEntries(Object.entries(designs).filter(([major]) => ids.some(id => id.startsWith(major + '.')))));
  const calls = [];
  const run = (rerun = r => r) => ({project: dir, plan}) => {
    calls.push(path.basename(dir));
    const id = path.basename(dir), published = dir.includes('detailed-design') ? path.join(root, detail, 'designs', id) : path.join(root, prelim, 'releases', id);
    return rerun({...read(path.join(published, 'receipt.json')), physicsOnly: true}, plan);
  };
  const receiptFile = id => path.join(root, prelim, 'releases', id, 'receipt.json');
  const check = (options = {}) => checkProject(root, {log: () => {}, ...options});
  const gate = (id, options = {}) => { const done = preliminaryGate({project: root, release: id, run: run(), ...options}); writeGate(done.published, done.gate); return done; };
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  /** Commit everything and return the commit, the base of a later check. */
  const commit = (message = 'change') => { if (!existsSync(path.join(root, '.git'))) git('init', '-q'); git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); return git('rev-parse', 'HEAD'); };
  /** Set the design statuses of the preliminary index and the release it opens. */
  const setStatus = (designStatus, more = {}) => editJson(path.join(root, prelim, 'releases.json'), i => {
    const next = {...i, ...more, designStatus: {...i.designStatus, ...designStatus}}, of = s => next.releases.filter(r => (next.designStatus[r] ?? 'in-progress') === s);
    return {...next, current: of('effective')[0] ?? of('in-progress').at(-1) ?? next.releases.at(-1)};
  });
  return {root, calls, run, receiptFile, check, gate, git, commit, setStatus};
}
const editJson = (file, edit) => writeFileSync(file, JSON.stringify(edit(read(file)), null, 2));
const errorsOf = result => result.errors.join('\n');
const noteOf = (result, name) => result.designs.find(r => r.design.includes(name))?.note;
/**
 * Write a release's judgement file as a record with labels and physics, and bind the published receipt to it. The
 * invented file names its files by path, as an authored one does.
 */
function authorPlan(p, id, {issue = 'synthetic-' + id, title = 'Invented title', phase = 'cycle', purpose = 'operating'} = {}) {
  const plan = JSON.stringify({schema: 'agent-frc/layout-judgement@1', issue, source: {file: 'design.json'}, budgets: {file: 'budgets.json'},
    stages: {'loaded-turn': {purpose, phase}}, view: 'package-motion.html', presentation: {title}});
  write(p.root, 'cad/preliminary-design/releases/' + id + '/judgement.json', plan);
  editJson(p.receiptFile(id), r => ({...r, planSha256: sha(plan)}));
}

test('the informational attachment report is no part of the verdict: an older receipt without it still reproduces at the gate', t => {
  const p = project(t);
  const report = {informational: true, case: 'raise', gapMm: 3, floating: [{solid: 'invented-panel', group: 'panel', nearest: 'frame', gapMm: 12}], fixturesOffFloor: []};
  // The committed receipt predates the report; the gate, from a newer plugin, carries it.
  assert.equal(read(p.receiptFile('1.0')).attachment, undefined);
  assert.equal(p.gate('1.0', {run: p.run(r => ({...r, attachment: report}))}).gate.verdict, 'pass');
  // And the other way round: a committed receipt that lists floating solids is still one to publish.
  editJson(p.receiptFile('1.0'), r => ({...r, attachment: report}));
  assert.equal(p.gate('1.0', {run: p.run(r => { const {attachment, ...rest} = r; return rest; })}).gate.verdict, 'pass');
  const receipt = read(p.receiptFile('1.0'));
  assert.deepEqual(compareVerdicts(receipt, {...receipt, attachment: {...report, floating: []}}), []);
});

test('a draft is checked for what it publishes; the publication check never runs the layout check', t => {
  const p = project(t);
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.preliminary, {current: '1.0', releases: [{release: '1.0', design: 'Tilting carriage 1.0', status: 'in-progress'}]});
  assert.deepEqual(result.designs, [{design: 'Preliminary design Tilting carriage 1.0', status: 'in-progress',
    note: 'draft, published on its local layout check. The layout check is not run here.'}]);
  assert.equal(result.comparedWith, null, 'a project outside Git has no default branch to compare with');
  assert.equal(result.plugin, pluginVersion);
  // The check has no way to run the layout check: it takes no such option.
  assert.deepEqual(checkProject(p.root, {log: () => {}, run: () => { throw Error('the layout check ran'); }}).errors, [], 'a layout check handed to it is never called');
});

test('the stage gate reruns the layout check on the committed design and refuses what does not reproduce', t => {
  const p = project(t);
  const done = p.gate('1.0');
  assert.deepEqual(p.calls, ['1.0'], 'the gate ran the layout check itself');
  const {elapsedSeconds, date, ...record} = read(path.join(p.root, prelim, 'releases/1.0/gate.json'));
  assert.deepEqual(record, {schema: 'agent-frc/stage-gate@1', phase: 'preliminary-design', design: '1.0', verdict: 'pass',
    planSha256: read(p.receiptFile('1.0')).planSha256, physics: gatePhysics(read(p.receiptFile('1.0'))), readinessReport: done.report});
  assert.match(done.report, /^Effective-readiness report for /);
  const fails = (rerun, pattern) => assert.throws(() => p.gate('1.0', {run: p.run(rerun)}), pattern);
  fails(r => ({...r, status: 'blocked'}), /1\.0 \(stage gate\) needs a layout-checked receipt; found blocked\. It is not marked effective/);
  fails(r => ({...r, cases: r.cases.map(c => ({...c, status: 'fail'}))}), /\(stage gate\) needs every clearance case to pass/);
  fails(r => ({...r, control: {...r.control, witness: null}}), /\(stage gate\) needs the displaced control to be rejected/);
  fails(r => ({...r, partial: true}), /receipt is not a checked layout/);
  fails(r => ({...r, step: {...r.step, sha256: sha('another step')}}), /the stage gate differs from the published receipt in stepSha256/);
  fails(r => ({...r, cases: [...r.cases, {case: 'extra', status: 'pass'}]}), /the stage gate differs from the published receipt in cases/);
  fails(() => { throw Error('the layout check exceeded its 45 minute budget'); }, /1\.0 is not marked effective: the layout check exceeded its 45 minute budget/);
  // A stale receipt is not trusted: the gate compares the committed files with it before it runs anything.
  const before = p.calls.length, folder = 'cad/preliminary-design/releases/1.0/';
  write(p.root, folder + 'design.json', '{"cases":[],"edited":true}');
  assert.throws(() => p.gate('1.0'), /the committed design source \(.*design\.json\) is not the file its receipt checked/);
  rmSync(path.join(p.root, folder + 'design.json'));
  assert.throws(() => p.gate('1.0'), /is not marked effective: its receipt names files that are not in cad\/preliminary-design\/releases\/1\.0 \(design\.json\)/);
  assert.equal(p.calls.length, before);
  // The gate says how long it took against its guideline, and says so when it ran long.
  commitInputs(p.root, '1.0');
  const clock = minutes => { let calls = 0; return () => calls++ ? minutes * 60000 : 0; };
  assert.equal(p.gate('1.0', {now: clock(22)}).gate.elapsedSeconds, 22 * 60);
});

test('the stage gate refuses a design whose inputs have uncommitted changes', t => {
  const p = project(t), folder = 'cad/preliminary-design/releases/1.0/';
  p.commit('draft');
  assert.equal(p.gate('1.0').gate.commit.length, 40, 'the record names the commit the gate ran on');
  // An edited input, and a new file, each stop the gate before it runs.
  const calls = p.calls.length, plan = readFileSync(path.join(p.root, folder + 'judgement.json'));
  write(p.root, folder + 'notes.md', 'a new note');
  assert.throws(() => p.gate('1.0'), /1\.0 is not marked effective: its inputs have uncommitted changes \(\?\? cad\/preliminary-design\/releases\/1\.0\/notes\.md\)\. The stage gate runs on the committed design\. Commit cad\/preliminary-design\/releases\/1\.0, then mark it effective/);
  p.commit('note');
  write(p.root, folder + 'budgets.json', readFileSync(path.join(p.root, folder + 'budgets.json'), 'utf8') + ' ');
  assert.throws(() => p.gate('1.0'), /its inputs have uncommitted changes \(M cad\/preliminary-design\/releases\/1\.0\/budgets\.json\)/);
  assert.equal(p.calls.length, calls);
  assert.ok(plan.length);
  // A change elsewhere in the project does not stop it.
  p.git('checkout', '--', folder);
  write(p.root, 'README.md', 'an unrelated edit');
  assert.equal(p.gate('1.0').gate.verdict, 'pass');
});

test('a hand-edited receipt or a stale one is refused', t => {
  const p = project(t), folder = 'cad/preliminary-design/releases/1.0/';
  // The published receipt claims a plan that is not the committed one.
  write(p.root, folder + 'judgement.json', 'an edited plan');
  assert.match(errorsOf(p.check()), /published receipt is of a different layout plan than cad\/preliminary-design\/releases\/1\.0\/judgement\.json/);
  write(p.root, folder + 'judgement.json', 'plan 1.0');
  // An input changed after the check: the plan bytes are the same, and the committed file is not the one the receipt recorded.
  const study = readFileSync(path.join(p.root, folder + 'design.json'));
  write(p.root, folder + 'design.json', '{"cases":[],"edited":true}');
  assert.match(errorsOf(p.check()), /1\.0: the committed design source \(cad\/preliminary-design\/releases\/1\.0\/design\.json\) is not the file its receipt checked/);
  write(p.root, folder + 'design.json', study);
  write(p.root, folder + 'design.step', 'another step');
  assert.match(errorsOf(p.check()), /the committed generated STEP \(.*design\.step\) is not the file its receipt checked/);
  // A STEP kept in Git LFS is compared by the digest its pointer names.
  write(p.root, folder + 'design.step', 'version https://git-lfs.github.com/spec/v1\noid sha256:' + sha('step 1.0') + '\nsize 14\n');
  assert.deepEqual(p.check().errors, []);
  // A file the receipt names that is not committed is reported: the gate could not rerun without it.
  rmSync(path.join(p.root, folder + 'design.step'));
  const missing = p.check();
  assert.deepEqual(missing.errors, []);
  assert.deepEqual(missing.warnings, ['Preliminary design Tilting carriage 1.0: its receipt names files that are not committed (design.step). The stage gate cannot run without them.']);
  // A receipt marked as a physics-only rerun is not one to publish.
  editJson(p.receiptFile('1.0'), r => ({...r, physicsOnly: true}));
  assert.match(errorsOf(p.check()), /publish the receipt of a full check/);
});

test('a live release needs committed inputs; history is not required to keep its files', t => {
  const p = project(t, {'1.0': {}, '2.0': {}, '3.0': {}, '4.0': {}},
    {'1.0': 'withdrawn', '2.0': 'superseded', '3.0': 'effective', '4.0': 'in-progress'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: '3.0'}));
  for (const id of ['1.0', '2.0']) rmSync(path.join(p.root, 'cad/preliminary-design/releases', id), {recursive: true});
  rmSync(path.join(p.root, prelim, 'releases/1.0'), {recursive: true});
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.designs.map(d => d.design), ['Preliminary design Sliding gate 3.0', 'Preliminary design Rolling cradle 4.0'], 'only live designs are checked');
  assert.equal(noteOf(result, '3.0'), 'effective. No default branch of the remote to compare with, so its physics was not compared.');
  assert.equal(result.reports.length, 1, 'the effective release prints its readiness report');
  assert.match(result.reports[0].title, /3\.0 \(effective\)/);
  // A withdrawal is a status with a reason. The index also keeps the last commit that held the files.
  assert.deepEqual(result.warnings, ['Preliminary release Tilting carriage 1.0 is withdrawn without a reason in the index']);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, reason: {'1.0': 'Invented reason: the carrier changed.'}, lastCommit: {'1.0': 'a'.repeat(40)}}));
  assert.deepEqual(p.check().warnings, []);
  rmSync(path.join(p.root, 'cad/preliminary-design/releases/4.0'), {recursive: true});
  result = p.check();
  assert.match(errorsOf(result), /4\.0: commit its check inputs at cad\/preliminary-design\/releases\/4\.0/);
  rmSync(path.join(p.root, prelim, 'releases/2.0'), {recursive: true});
  assert.match(errorsOf(p.check()), /Release 2\.0 is listed but has no directory/);
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
  assert.match(result.reports[0].text, /^Effective-readiness report for Tilting carriage 1\.0 \(/);
  // A failing version is named the same way.
  editJson(p.receiptFile('1.1'), r => ({...r, status: 'provisional'}));
  assert.match(errorsOf(p.check()), /Preliminary design Tilting carriage 1\.1 needs a layout-checked receipt/);
  editJson(p.receiptFile('1.1'), r => ({...r, status: 'layout-checked'}));
  // Two in-progress versions of one architecture are two drafts under two numbers: a warning for the reviewer.
  editJson(file, i => ({...i, current: '1.1', designStatus: {...i.designStatus, '1.0': 'in-progress'}}));
  const two = p.check();
  assert.deepEqual(two.errors, []);
  assert.match(two.warnings.join(' '), /Tilting carriage has 2 in-progress versions \(1\.0, 1\.1\)\. A draft takes no number/);
  // An ID that is not a version is refused.
  editJson(file, i => ({...i, releases: [...i.releases, '1.0.1']}));
  assert.match(errorsOf(p.check()), /unique release IDs, each a version MAJOR\.MINOR/);
});

test('the review scene must repeat the receipt and a mission case must play a represented objective', t => {
  const p = project(t, {'1.0': {}, '2.0': {missions: []}, '3.0': {trial: '{"transport":{"case":"loaded-turn"}}',
    missions: [{case: 'loaded-turn', kind: 'field-interaction-trial', accomplishes: 'delivered', objective: 'Carry the sample to the bin',
      trial: {file: 'acquire-trial.json', sha256: sha('{"transport":{"case":"loaded-turn"}}')}}]},
    '4.0': {missions: [{case: 'loaded-turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Hang from the bar'}]}});
  const scene = path.join(p.root, prelim, 'releases/1.0/review-scene.json.gz');
  const shown = JSON.parse(gunzipSync(readFileSync(scene)));
  writeFileSync(scene, gzipSync(JSON.stringify({...shown, mass: {...shown.mass, remainingKg: 9}})));
  let errors = errorsOf(p.check());
  assert.match(errors, /1\.0: the review scene shows results that differ from the receipt: Scene mass differs from the receipt/);
  assert.match(errors, /2\.0 declares no mission case/);
  assert.match(errors, /4\.0 mission case loaded-turn must accomplish a represented narrative objective/);
  assert.doesNotMatch(errors, /Sliding gate 3\.0/);
  // A trial the receipt does not name is not mission evidence.
  write(p.root, prelim + '/releases/3.0/acquire-trial.json', '{"transport":{"case":"loaded-turn"},"edited":true}');
  assert.match(errorsOf(p.check()), /3\.0 mission case loaded-turn: the published trial is not one the receipt names/);
});

test('a mission case counts when a mission animation plays it', t => {
  const p = project(t), scene = path.join(p.root, prelim, 'releases/1.0/review-scene.json.gz');
  const shown = JSON.parse(gunzipSync(readFileSync(scene)));
  assert.equal(errorsOf(p.check()), '');
  const mission = read(path.join(p.root, prelim, 'releases/1.0/release.json')).missionCases[0].case;
  const animations = (headline, cases = shown.cases.map(c => c.id).filter(id => id !== 'package-displacement-control')) =>
    writeFileSync(scene, gzipSync(JSON.stringify({...shown, animations: [{id: 'cycle', title: 'Whole cycle', mission: headline, cases}]})));
  animations(true);
  assert.equal(errorsOf(p.check()), '', 'a headline phase that plays the case, among its other segments, is a mission animation');
  animations(false);
  assert.match(errorsOf(p.check()), new RegExp('mission case ' + mission + ' is not played by a mission animation of the review'));
  // Control: a scene without its animation list cannot load on the page, so it is refused.
  const {animations: dropped, ...bare} = shown;
  writeFileSync(scene, gzipSync(JSON.stringify(bare)));
  assert.match(errorsOf(p.check()), /1\.0: the review scene lists no animations, so the page cannot play it/);
});

test('a design this change makes effective carries the record of its stage gate', t => {
  const p = project(t, {'1.0': {}, '2.0': {}}, {'1.0': 'effective', '2.0': 'in-progress'});
  p.setStatus({});
  const base = p.commit('base');
  // A draft increment: checked for what it publishes, whatever it edits.
  write(p.root, 'cad/preliminary-design/releases/2.0/notes.md', 'changed input');
  p.commit('draft increment');
  let result = p.check({base});
  assert.deepEqual([result.errors, result.designs.map(d => d.note)], [[], ['effective, physics unchanged since ' + base + '.', 'draft, published on its local layout check. The layout check is not run here.']]);
  // The status set by hand, with no gate: refused, with the command that runs it.
  p.setStatus({'1.0': 'superseded', '2.0': 'effective'});
  p.commit('status by hand');
  assert.match(errorsOf(p.check({base})), /^Preliminary design Swinging arm 2\.0 is marked effective without a stage gate of this design\. Mark it effective with the plugin's command, which runs the full layout check on the committed design and writes docs\/preliminary-design\/releases\/2\.0\/gate\.json: python PLUGIN\/scripts\/stage_preliminary_review\.py --set-status 2\.0 effective$/);
  // The gate ran and wrote its record: the change passes, and the check runs nothing itself.
  p.gate('2.0');
  const promoted = p.commit('gate record');
  result = p.check({base});
  assert.deepEqual([result.errors, result.warnings], [[], []]);
  assert.equal(noteOf(result, '2.0'), 'becoming effective. Its stage gate record matches the committed receipt.');
  assert.equal(result.reports.length, 1, 'the readiness report is printed');
  // A gate record of other physics is not this design's gate.
  editJson(path.join(p.root, prelim, 'releases/2.0/gate.json'), g => ({...g, physics: sha('another design')}));
  assert.match(errorsOf(p.check({base})), /2\.0 is marked effective without a stage gate of this design/);
  p.git('checkout', '--', prelim + '/releases/2.0/gate.json');
  // The next change finds it effective already.
  write(p.root, 'notes.md', 'unrelated');
  p.commit('unrelated');
  result = p.check({base: promoted});
  assert.deepEqual([result.errors, noteOf(result, '2.0')], [[], 'effective, physics unchanged since ' + promoted + '.']);
});

test('without --base the check compares with the default branch of the remote', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  authorPlan(p, '1.0');
  p.commit('accepted');
  // An invented remote: the commit above is its default branch, as last fetched.
  p.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  p.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  p.git('checkout', '-q', '-b', 'revision');
  let result = p.check();
  assert.deepEqual([result.errors, result.comparedWith, noteOf(result, '1.0')], [[], 'origin/main', 'effective, physics unchanged since origin/main.']);
  authorPlan(p, '1.0', {purpose: 'park'});
  p.commit('physics');
  assert.match(errorsOf(p.check()), /1\.0 is effective, and this change alters its physics: judgement\.json\./);
});

test('an effective design keeps its physics: labels and the view may change, the checked inputs and results may not', t => {
  const p = project(t, {'1.0': {}, '1.1': {}}, {'1.0': 'superseded', '1.1': 'effective'});
  p.setStatus({});
  authorPlan(p, '1.1');
  const base = p.commit('base'), folder = 'cad/preliminary-design/releases/1.1/';
  const passes = message => { p.commit(message); const result = p.check({base}); assert.deepEqual([result.errors, result.warnings, noteOf(result, '1.1')], [[], [], 'effective, physics unchanged since ' + base + '.'], message); };
  const refused = (message, pattern) => { p.commit(message); assert.match(errorsOf(p.check({base})), pattern, message); };
  // A presentation refresh: new titles and phases in the plan, a rebuilt page, and the receipt of that plan.
  authorPlan(p, '1.1', {title: 'Invented new title', phase: 'Invented phase'});
  write(p.root, prelim + '/releases/1.1/index.html', '<html>Rebuilt review page</html>');
  editJson(p.receiptFile('1.1'), r => ({...r, view: {...r.view, sha256: sha('rebuilt')}}));
  passes('view refresh');
  // A new issue name, a status word and an accepted date are labels too.
  authorPlan(p, '1.1', {issue: 'invented-new-name'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, accepted: {'1.1': '2001-01-02'}}));
  passes('labels');
  // The plan's physics: a stage that changes purpose.
  authorPlan(p, '1.1', {purpose: 'park'});
  refused('stage purpose', /Preliminary design Tilting carriage 1\.1 is effective, and this change alters its physics: judgement\.json\. An effective design does not change in place\. Open 1\.2 as a draft and make the change there\./);
  authorPlan(p, '1.1');
  // A file the plan names, with a receipt that agrees with it: a budget line.
  const ledger = readFileSync(path.join(p.root, folder + 'budgets.json'), 'utf8'), heavier = ledger.replace('"masses"', '"edited":true,"masses"');
  write(p.root, folder + 'budgets.json', heavier);
  editJson(p.receiptFile('1.1'), r => ({...r, budgets: {...r.budgets, source: {...r.budgets.source, sha256: sha(heavier)}}}));
  refused('budget ledger', /alters its physics: budgets.json./);
  write(p.root, folder + 'budgets.json', ledger);
  // A verdict.
  editJson(p.receiptFile('1.1'), r => ({...r, budgets: {...r.budgets, source: {...r.budgets.source, sha256: sha(ledger)}}, cycle: ['loaded-turn']}));
  refused('cycle', /alters its physics: the cycle result./);
  // Demoted to a draft in the same change, the design may change again.
  const q = project(t, {'1.0': {}}, {'1.0': 'effective'});
  authorPlan(q, '1.0');
  const before = q.commit('base');
  authorPlan(q, '1.0', {purpose: 'park'});
  q.setStatus({'1.0': 'in-progress'});
  q.commit('reopened');
  assert.deepEqual(q.check({base: before}).errors, []);
});

test('a rename keeps the design: the same physics under a new ID needs no gate of its own', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  authorPlan(p, '1.0');
  const base = p.commit('base');
  // The same STEP and design source, staged under another version with its own issue name and folder; the first ID is removed.
  const rename = () => {
    issueRelease(path.join(p.root, 'docs'), '1.1', {basis: '1.0'});
    commitInputs(p.root, '1.1', {basis: '1.0'});
    authorPlan(p, '1.1', {title: 'Tilting carriage, renamed'});
    for (const dir of [prelim + '/releases/1.0', 'cad/preliminary-design/releases/1.0']) rmSync(path.join(p.root, dir), {recursive: true, force: true});
    write(p.root, prelim + '/releases.json', {current: '1.1', releases: ['1.1'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.1': 'effective'}});
  };
  rename();
  p.commit('rename');
  let result = p.check({base});
  assert.deepEqual([result.errors, result.warnings], [[], []]);
  assert.equal(noteOf(result, '1.1'), 'effective, the same physics as 1.0 under a new ID.');
  // A rename that also changes the plan's physics is a new design: it needs its own stage gate.
  authorPlan(p, '1.1', {purpose: 'park'});
  p.commit('renamed and changed');
  assert.match(errorsOf(p.check({base})), /Tilting carriage 1\.1 is marked effective without a stage gate of this design/);
  p.gate('1.1');
  p.commit('gate');
  assert.deepEqual(p.check({base}).errors, []);
});

test('a project in a subfolder of its repository is compared by its own paths', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  authorPlan(p, '1.0');
  const outer = mkdtempSync(path.join(os.tmpdir(), 'publication-repo-'));
  t.after(() => rmSync(outer, {recursive: true, force: true}));
  cpSync(p.root, path.join(outer, 'robot'), {recursive: true});
  const git = (...args) => execFileSync('git', ['-C', outer, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD'), root = path.join(outer, 'robot');
  write(root, 'notes.md', 'a change beside the design');
  git('add', '-A'); git('commit', '-q', '-m', 'notes');
  // The index and the inputs at the base commit are read by the project's own paths.
  assert.deepEqual(checkProject(root, {base, log: () => {}}).designs.map(d => d.note), ['effective, physics unchanged since ' + base + '.']);
  const plan = path.join(root, 'cad/preliminary-design/releases/1.0/judgement.json'), changed = readFileSync(plan, 'utf8').replace('"operating"', '"park"');
  writeFileSync(plan, changed);
  editJson(path.join(root, prelim, 'releases/1.0/receipt.json'), r => ({...r, planSha256: sha(changed)}));
  git('add', '-A'); git('commit', '-q', '-m', 'physics');
  assert.match(errorsOf(checkProject(root, {base, log: () => {}})), /1\.0 is effective, and this change alters its physics: judgement\.json\./);
});

/** Publish a detailed design from the files of a preliminary release. */
function design(root, id, status, {from = '1.0', record = r => r, index = i => i, readiness} = {}) {
  const dir = path.join(root, detail, 'designs', id), source = path.join(root, prelim, 'releases', from);
  cpSync(source, dir, {recursive: true});
  const release = read(path.join(dir, 'release.json')), receipt = read(path.join(dir, 'receipt.json'));
  rmSync(path.join(dir, 'release.json'));
  write(dir, 'design.json', record({schema: 'agent-frc/detailed-design@1', design: id, issue: receipt.issue, preliminary: {release: from},
    fusion: {stepSha256: receipt.step.sha256, archiveSha256: sha('archive'), configuration: 'Invented stowed assembly'}, missionCases: release.missionCases}));
  if (readiness) write(dir, 'readiness.json', readiness(receipt));
  const file = path.join(root, detail, 'designs.json');
  const prior = (() => { try { return read(file); } catch { return {schema: 'agent-frc/detailed-design-index@1', designs: [], architectures: {1: names[1]}, designStatus: {}}; } })();
  const next = {...prior, designs: [...prior.designs, id], designStatus: {...prior.designStatus, [id]: status}};
  const of = s => next.designs.filter(d => next.designStatus[d] === s).at(-1) ?? null;
  write(root, detail + '/designs.json', index({...next, current: of('effective') ?? of('in-progress'), beside: of('effective') ? of('in-progress') : null}));
  cpSync(path.join(root, 'cad/preliminary-design/releases', from), path.join(root, 'cad/detailed-design/designs', id), {recursive: true});
}

test('an in-progress detailed design names an effective preliminary release and is checked on its Fusion export', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  design(p.root, '1.0', 'in-progress');
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.detailed, {current: '1.0', beside: null, designs: [{design: '1.0', title: 'Tilting carriage 1.0', state: 'draft 1 · in progress', status: 'in-progress'}]});
  assert.equal(noteOf(result, 'Detailed design'), 'draft, published on its local layout check. The layout check is not run here.');
  // Inputs not committed: the design still shows, with a warning that its receipt was not compared.
  rmSync(path.join(p.root, 'cad/detailed-design'), {recursive: true});
  result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /1\.0: its inputs are not committed at cad\/detailed-design\/designs\/1\.0, so its receipt was not compared with them/);
  editJson(path.join(p.root, detail, 'designs/1.0/design.json'), r => ({...r, fusion: {...r.fusion, stepSha256: sha('another export')}}));
  assert.match(errorsOf(p.check()), /1\.0: the checked design source places no solid from the Fusion export the record names/);
});

test('the preliminary link must be effective; a superseded link only warns', t => {
  const p = project(t, {'1.0': {}, '2.0': {}}, {'1.0': 'in-progress', '2.0': 'in-progress'});
  design(p.root, '1.0', 'in-progress');
  assert.match(errorsOf(p.check()), /1\.0 must name an effective preliminary release; 1\.0 is in-progress/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, designStatus: {'1.0': 'superseded', '2.0': 'effective'}}));
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /1\.0 names preliminary release 1\.0, which is now superseded/);
});

test('an effective detailed design is a status change that carries its readiness review', t => {
  const p = project(t, {'1.0': {}}, {'1.0': 'effective'});
  const review = verdict => receipt => ({schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly', stepSha256: receipt.step.sha256,
    archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict,
    findings: verdict === 'pass' ? [] : [{domain: 'service', status: 'open', subject: 'invented cover', reason: 'removal path not shown'}]});
  design(p.root, '1.0', 'effective');
  assert.match(errorsOf(p.check()), /1\.0 is effective: commit its mechanical-readiness review result as designs\/1\.0\/readiness\.json/);
  write(p.root, detail + '/designs/1.0/readiness.json', review('pass')(read(p.receiptFile('1.0'))));
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.match(result.reports.find(r => /Detailed design/.test(r.title)).text, /Showcase eligibility: pass\nFindings not passing: 0/);
  // A review that does not pass blocks the status. Its findings are printed for the reviewer.
  write(p.root, detail + '/designs/1.0/readiness.json', review('open')(read(p.receiptFile('1.0'))));
  result = p.check();
  assert.match(errorsOf(result), /1\.0 cannot be effective: its mechanical-readiness review reports open/);
  assert.match(result.reports.find(r => /Detailed design/.test(r.title)).text, /service: invented cover: open: removal path not shown/);
  // The same review beside an in-progress design blocks nothing.
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, designStatus: {'1.0': 'in-progress'}}));
  assert.deepEqual(p.check().errors, []);
  // A detailed design this change makes effective needs the record of its stage gate, like a preliminary one.
  const base = p.commit('in progress');
  write(p.root, detail + '/designs/1.0/readiness.json', review('pass')(read(p.receiptFile('1.0'))));
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, designStatus: {'1.0': 'effective'}}));
  p.commit('status by hand');
  assert.match(errorsOf(p.check({base})), /Detailed design Tilting carriage 1\.0 is marked effective without a stage gate of this design\. .* node PLUGIN\/scripts\/detailed-design-release\.mjs effective \. --design 1\.0 --readiness REVIEW_RESULT\.json$/);
  const published = path.join(p.root, detail, 'designs/1.0');
  writeGate(published, stageGate({root: p.root, where: 'Detailed design Tilting carriage 1.0', id: '1.0', phase: 'detailed-design', inputs: path.join(p.root, 'cad/detailed-design/designs/1.0'),
    published, record: read(path.join(published, 'design.json')), run: p.run()}));
  const promoted = p.commit('gate');
  result = p.check({base});
  assert.deepEqual([result.errors, result.detailed.designs, p.calls], [[], [{design: '1.0', title: 'Tilting carriage 1.0', state: 'effective', status: 'effective'}], ['1.0']]);
  assert.equal(noteOf(result, '1.0'), 'effective, physics unchanged since ' + base + '.', 'the preliminary release was effective already');
  // Effective already, its STEP may not change in place.
  editJson(path.join(p.root, detail, 'designs/1.0/receipt.json'), r => ({...r, cycle: ['loaded-turn']}));
  p.commit('changed result');
  assert.match(errorsOf(p.check({base: promoted})), /Detailed design Tilting carriage 1\.0 is effective, and this change alters its physics: the cycle result\./);
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

test('verdicts compare inputs and results, not measured values', () => {
  const receipt = {status: 'layout-checked', planSha256: 'a', step: {sha256: 'b'}, design: {sha256: 'c'}, cycle: ['x'],
    cases: [{case: 'x', status: 'pass', minimumGapMm: 4.2000001}], control: {case: 'x', displaced: 'rail', witness: {status: 'fail'}},
    budgets: {massStatus: 'pass', electricalCases: [{case: 'weak', status: 'pass', marginV: 0.31}]}};
  const rounded = structuredClone(receipt);
  rounded.cases[0].minimumGapMm = 4.2; rounded.budgets.electricalCases[0].marginV = 0.3100001;
  assert.deepEqual(compareVerdicts(receipt, rounded), []);
  rounded.budgets.massStatus = 'fail';
  assert.deepEqual(compareVerdicts(receipt, rounded), ['massStatus']);
});

test('the command says what it checked and what a push will do', t => {
  const p = project(t);
  const run = (...args) => spawnSync(process.execPath, [script, 'check', p.root, ...args], {encoding: 'utf8'});
  const ready = run();
  assert.equal(ready.status, 0, ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout).preliminary.releases, [{release: '1.0', design: 'Tilting carriage 1.0', status: 'in-progress'}]);
  // The lines an agent reads: one for each design, then what a push will do.
  assert.match(ready.stderr, /^\[publication\] Preliminary design Tilting carriage 1\.0: draft, published on its local layout check\. The layout check is not run here\.$/m);
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
/** The synthetic example project in a Git repository, with the commands an agent runs on it. */
function example(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'publication-real-'));
  t.after(() => rmSync(temp, {recursive: true, force: true}));
  const season = path.join(temp, 'season'), py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'), releases = 'cad/preliminary-design/releases/';
  execFileSync(py, ['-B', fileURLToPath(new URL('../examples/design-source/create.py', import.meta.url)), season, '--project-review'], {stdio: 'pipe'});
  // Run from the project root, as an agent does. Both streams are returned: the commands speak on each.
  const stage = (...args) => { const run = spawnSync(py, ['-B', stagingCommand, ...args], {cwd: season, encoding: 'utf8'}); return {...run, said: run.stdout + run.stderr}; };
  const layoutCheck = (id, ...more) => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/design.mjs', import.meta.url)), 'preliminary-check', season, releases + id + '/judgement.json',
    '--write-view', '--require-checked', '--quiet', '--output', releases + id + '/receipt.json', ...more], {stdio: 'pipe'});
  const git = (...args) => execFileSync('git', ['-C', season, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  const commit = message => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  const status = id => read(path.join(season, prelim, 'releases.json')).designStatus[id];
  const build = id => execFileSync(py, ['-m', 'frc_design_kernel', 'build', releases + id + '/design.json', '--out', releases + id + '/generated'], {cwd: season, stdio: 'pipe'});
  git('init', '-q');
  return {season, releases, stage, layoutCheck, build, git, commit, status, check: base => checkProject(season, {base, log: () => {}})};
}

test('marking a real release effective runs the stage gate, and refuses uncommitted inputs, a stale receipt and a forged one', kernel, t => {
  const e = example(t), authored = e.releases + '1.0/';
  // The project the starter writes holds data, published output and its own CI, which names no plugin.
  assert.doesNotMatch(readFileSync(path.join(e.season, '.github/workflows/ci.yml'), 'utf8'), /agent-frc|plugin\//);
  for (const check of [['scan.mjs', '.'], ['site-check.mjs', 'docs']]) execFileSync(process.execPath, [path.join(e.season, 'scripts/ci', check[0]), check[1]], {cwd: e.season, stdio: 'pipe'});
  // The example names every file by path: no author types a hash, and the receipt holds the digests the check read.
  for (const name of ['judgement.json', 'design.json', 'budgets.json', 'missions.json'])
    assert.doesNotMatch(readFileSync(path.join(e.season, authored, name), 'utf8'), /sha256/i, name);
  // Uncommitted inputs: the gate does not run, and the status stays.
  let refused = e.stage('--set-status', '1.0', 'effective');
  assert.notEqual(refused.status, 0);
  assert.match(refused.said, /Preliminary design Turning carrier 1\.0 is not marked effective: its inputs have uncommitted changes .*The stage gate runs on the committed design\./);
  assert.match(refused.said, /Release 1\.0 keeps its status: the stage gate did not pass/);
  assert.equal(e.status('1.0'), 'in-progress');
  const draft = e.commit('draft');
  assert.deepEqual(e.check().errors, []);
  // A stale receipt: the design source changed and was committed with no new check. The gate does not trust the receipt.
  const sourceFile = path.join(e.season, authored, 'design.json'), source = readFileSync(sourceFile);
  editJson(sourceFile, s => ({...s, frame: 'Invented reworded frame'}));
  e.commit('edited source');
  refused = e.stage('--set-status', '1.0', 'effective');
  assert.match(refused.said, /the committed design source \(cad\/preliminary-design\/releases\/1\.0\/design\.json\) is not the file its receipt checked/);
  assert.match(errorsOf(e.check()), /the committed design source .* is not the file its receipt checked/, 'the publication check sees it too, with no layout check');
  assert.equal(e.status('1.0'), 'in-progress');
  writeFileSync(sourceFile, source);
  // A forged receipt: the displaced control moved so it no longer collides, and the receipt's plan digest edited by hand.
  const plan = path.join(e.season, authored, 'judgement.json'), held = readFileSync(plan), receipt = path.join(e.season, prelim, 'releases/1.0/receipt.json'), issued = readFileSync(receipt);
  editJson(plan, l => ({...l, control: {...l.control, offsetMm: [0, 50, 0]}}));
  editJson(receipt, r => ({...r, planSha256: sha(readFileSync(plan))}));
  e.commit('forged');
  refused = e.stage('--set-status', '1.0', 'effective');
  assert.match(refused.said, /Turning carrier 1\.0 \(stage gate\) needs a layout-checked receipt; found provisional\. It is not marked effective/);
  assert.equal(e.status('1.0'), 'in-progress');
  writeFileSync(plan, held); writeFileSync(receipt, issued);
  e.commit('restored');
  // Generated solids regenerated from another source and left uncommitted: the gate runs only on what is committed.
  const generated = path.join(e.season, authored, 'generated'), kept = path.join(e.season, '..', 'generated-kept');
  cpSync(generated, kept, {recursive: true});
  editJson(sourceFile, s => ({...s, parameters: {...s.parameters, slide: 11}}));
  e.build('1.0');
  writeFileSync(sourceFile, source);
  refused = e.stage('--set-status', '1.0', 'effective');
  assert.match(refused.said, /its inputs have uncommitted changes \([^)]*generated\//);
  // Committed, they are stale: the layout check the gate runs refuses solids generated from another design source.
  e.commit('stale solids');
  refused = e.stage('--set-status', '1.0', 'effective');
  assert.match(refused.said, /The generated solids are of an earlier design source[^]*Turning carrier 1\.0 is not marked effective: the layout check ended with an error/);
  assert.equal(e.status('1.0'), 'in-progress');
  rmSync(generated, {recursive: true, force: true});
  cpSync(kept, generated, {recursive: true});
  e.commit('regenerated');
  // The gate passes: the command reports what it ran and how long it took, prints the readiness report and sets the status.
  const accepted = e.stage('--set-status', '1.0', 'effective');
  assert.equal(accepted.status, 0, accepted.said);
  assert.match(accepted.said, /^\[gate\] Running the full layout check on the committed design\. Guideline: about 15 minutes\.$/m);
  assert.match(accepted.said, /^\[gate\] Preliminary design Turning carrier 1\.0: the full layout check ran on the committed design and reproduced the published receipt in \d+ s \(guideline: about 15 minutes at a stage gate\)\.$/m);
  assert.match(accepted.said, /Effective-readiness report for Turning carrier 1\.0 \(invented-design-1\.0\)/);
  assert.match(accepted.said, /Preliminary design Turning carrier 1\.0 is effective; the site opens 1\.0/);
  assert.match(accepted.stdout, /On push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  assert.equal(e.status('1.0'), 'effective');
  const gate = read(path.join(e.season, prelim, 'releases/1.0/gate.json'));
  assert.deepEqual([gate.verdict, gate.design, gate.commit], ['pass', '1.0', e.git('rev-parse', 'HEAD')]);
  e.commit('effective');
  const result = e.check(draft);
  assert.deepEqual([result.errors, result.designs[0].note], [[], 'becoming effective. Its stage gate record matches the committed receipt.']);
});

test('a release whose judgement file types a hash passes the gate, and a wrong typed hash fails it', kernel, t => {
  const e = example(t), folder = path.join(e.season, e.releases, '1.0');
  // The author types the hash of the narrative; the check verifies it wherever it reads the file.
  const narrative = readFileSync(path.join(folder, 'narrative.md'));
  editJson(path.join(folder, 'judgement.json'), l => ({...l, narrativeReview: {...l.narrativeReview, source: {...l.narrativeReview.source, sha256: sha(narrative)}}}));
  e.layoutCheck('1.0');
  assert.equal(e.stage('1.0').status, 0);
  e.commit('draft');
  // The narrative changes under its typed hash: the checker refuses the committed judgement file with "Changed evidence".
  writeFileSync(path.join(folder, 'narrative.md'), 'Invented narrative, edited after the check.');
  e.commit('edited narrative');
  const refused = e.stage('--set-status', '1.0', 'effective');
  assert.match(refused.said, /Turning carrier 1\.0 is not marked effective: the layout check ended with an error \(exit 2\)/);
  assert.equal(e.status('1.0'), 'in-progress');
  writeFileSync(path.join(folder, 'narrative.md'), narrative);
  e.commit('restored');
  assert.equal(e.stage('--set-status', '1.0', 'effective').status, 0);
});

test('on a real release a draft revision, a view refresh and a rename are checked with no layout check, and a change to the physics is refused', kernel, t => {
  const e = example(t), {season, releases} = e;
  // An edit to the in-progress design is staged under the same ID: one entry and a counted draft.
  editJson(path.join(season, releases, '1.0/judgement.json'), l => ({...l, presentation: {...l.presentation, focus: 'Invented revised focus.'}}));
  e.layoutCheck('1.0');
  const revised = e.stage('1.0');
  assert.match(revised.said, /^Revised preliminary design Turning carrier 1\.0 in place \(draft 2, in progress\)\r?\nBefore pushing, run the publication check: node PLUGIN\/scripts\/design-publication\.mjs check \.\r?\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  assert.equal(read(path.join(season, prelim, 'releases.json')).revision['1.0'].number, 2);
  e.commit('draft 2');
  assert.equal(e.stage('--set-status', '1.0', 'effective').status, 0);
  const effective = e.commit('effective');
  // A presentation refresh: reworded focus, the view rebuilt from the receipt, and the view republished. The gate record stays.
  editJson(path.join(season, releases, '1.0/judgement.json'), l => ({...l, presentation: {...l.presentation, focus: 'Invented reworded focus.', title: 'Invented reworded title'}}));
  e.layoutCheck('1.0', '--view-only');
  assert.match(e.stage('--refresh-view', '1.0').said, /Refreshed the view of preliminary design Turning carrier 1\.0 \(effective\)/);
  assert.ok(existsSync(path.join(season, prelim, 'releases/1.0/gate.json')));
  e.commit('view refresh');
  let result = e.check(effective);
  assert.deepEqual([result.errors, result.warnings, result.designs[0].note], [[], [], 'effective, physics unchanged since ' + effective + '.']);
  // A rename: the same design under another ID, folder and issue name, checked there, staged and marked effective, and the first ID removed.
  e.stage('--copy-inputs', '1.0', '1.1');
  for (const name of ['judgement.json', 'budgets.json', 'acquire-time-current.json']) {
    const file = path.join(season, releases, '1.1', name);
    assert.equal(read(file).issue, 'invented-design-1.0', name);
    editJson(file, record => ({...record, issue: 'invented-renamed-design'}));
  }
  e.layoutCheck('1.1');
  e.stage('1.1');
  e.commit('renamed draft');
  assert.equal(e.stage('--set-status', '1.1', 'effective').status, 0);
  e.stage('--remove', '1.0', '--replaced-by', '1.1');
  const renamed = e.commit('rename');
  result = e.check(effective);
  assert.deepEqual([result.errors, result.warnings, result.preliminary.releases], [[], [], [{release: '1.1', design: 'Turning carrier 1.1', status: 'effective'}]]);
  assert.equal(result.designs[0].note, 'effective, the same physics as 1.0 under a new ID.');
  // A change to the physics of the effective design: a tolerance in its judgement file, with a receipt that agrees.
  editJson(path.join(season, releases, '1.1/judgement.json'), l => ({...l, stages: {...l.stages, acquire: {...l.stages.acquire, minGapMm: 0.5}}}));
  e.layoutCheck('1.1');
  assert.match(e.stage('--refresh-view', '1.1').said,
    /Turning carrier 1\.1 is effective and this receipt differs from the published one in the stages\. A view refresh keeps the physics\. Work that changes it belongs to 1\.2, staged as a draft/);
  e.commit('changed tolerance');
  assert.match(errorsOf(e.check(renamed)), /Preliminary design Turning carrier 1\.1 is effective, and this change alters its physics: judgement\.json\. An effective design does not change in place\. Open 1\.2 as a draft and make the change there\./);
});
