import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import {checkProject, compareVerdicts, pluginVersion} from '../scripts/design-publication.mjs';
import {issueRelease, listing, sha, write} from './fixtures/preliminary-release.mjs';

// Synthetic teaching fixtures: invented releases, cases and objectives with no relation to any game.
const script = fileURLToPath(new URL('../scripts/design-publication.mjs', import.meta.url));
const prelim = 'docs/preliminary-design', detail = 'docs/detailed-design';
const read = file => JSON.parse(readFileSync(file, 'utf8'));

/** Commit the inputs of a release: its plan and the files its receipt names, with the bytes the receipt recorded. */
function commitInputs(root, id, options = {}) {
  const folder = 'cad/preliminary-design/releases/' + id + '/', published = path.join(root, prelim, 'releases', id);
  write(root, folder + 'layout.json', 'plan ' + id);
  write(root, folder + 'package.step', 'step ' + (options.basis ?? id));
  for (const [name, from] of [['paths.json', 'motion.json'], ['budgets.json', 'budgets.json'], ['limits.json', 'limits.json']]) write(root, folder + name, readFileSync(path.join(published, from)));
}
/**
 * A project with committed inputs for each release and a layout check that returns what `rerun` makes of the
 * published receipt. `check` runs the publication check as a push does; `rerunAll` reruns every live design.
 */
function project(t, releases = {'layout-001': {}}, statuses = undefined) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [id, options] of Object.entries(releases)) {
    issueRelease(path.join(root, 'docs'), id, options);
    commitInputs(root, id, options);
  }
  const ids = Object.keys(releases);
  listing(path.join(root, 'docs'), ids.at(-1), ids, statuses);
  const calls = [];
  const run = (rerun = r => r) => ({project: dir, plan}) => {
    calls.push(path.basename(dir));
    const id = path.basename(dir), published = dir.includes('detailed-design') ? path.join(root, detail, 'designs', id) : path.join(root, prelim, 'releases', id);
    return rerun({...read(path.join(published, 'receipt.json')), physicsOnly: true}, plan);
  };
  const receiptFile = id => path.join(root, prelim, 'releases', id, 'receipt.json');
  const check = (options = {}) => checkProject(root, {run: run(), log: () => {}, ...options});
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  /** Commit everything and return the commit, the base of a later check. */
  const commit = (message = 'change') => { if (!existsSync(path.join(root, '.git'))) git('init', '-q'); git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); return git('rev-parse', 'HEAD'); };
  /** Set the design statuses of the preliminary index and the release it opens. */
  const setStatus = (designStatus, more = {}) => editJson(path.join(root, prelim, 'releases.json'), i => {
    const next = {...i, ...more, designStatus: {...i.designStatus, ...designStatus}}, of = s => next.releases.filter(r => (next.designStatus[r] ?? 'in-progress') === s);
    return {...next, current: of('effective')[0] ?? of('in-progress').at(-1) ?? next.releases.at(-1)};
  });
  return {root, calls, run, receiptFile, check, rerunAll: (options = {}) => check({rerun: 'all', ...options}), commit, setStatus};
}
const editJson = (file, edit) => writeFileSync(file, JSON.stringify(edit(read(file)), null, 2));
const errorsOf = result => result.errors.join('\n');
const rerunsOf = result => result.preliminary.releases.map(r => r.rerun);
const whyOf = (result, name) => result.reruns.find(r => r.design.includes(name))?.why;
/**
 * Write a release's layout plan as a record with labels and physics, and bind the published receipt to it. The
 * invented plan names its files by path, as an authored plan does.
 */
function authorPlan(p, id, {issue = 'synthetic-' + id, title = 'Invented title', phase = 'cycle', purpose = 'operating'} = {}) {
  const plan = JSON.stringify({schema: 'agent-frc/preliminary-layout@1', issue, step: {file: 'package.step'}, motion: {file: 'paths.json'}, budgets: {file: 'budgets.json'},
    stages: {'loaded-turn': {purpose, phase}}, view: 'package-motion.html', presentation: {title}});
  write(p.root, 'cad/preliminary-design/releases/' + id + '/layout.json', plan);
  editJson(p.receiptFile(id), r => ({...r, planSha256: sha(plan)}));
}

test('the informational attachment report is no part of the verdict: an older receipt without it still reproduces', t => {
  const p = project(t);
  const report = {informational: true, case: 'raise', gapMm: 3, floating: [{solid: 'invented-panel', group: 'panel', nearest: 'frame', gapMm: 12}], fixturesOffFloor: []};
  // The committed receipt predates the report; the rerun, from a newer plugin, carries it.
  assert.equal(read(p.receiptFile('layout-001')).attachment, undefined);
  assert.deepEqual(p.rerunAll({run: p.run(r => ({...r, attachment: report}))}).errors, []);
  // And the other way round: a committed receipt that lists floating solids is still one to publish.
  editJson(p.receiptFile('layout-001'), r => ({...r, attachment: report}));
  assert.deepEqual(p.rerunAll({run: p.run(r => { const {attachment, ...rest} = r; return rest; })}).errors, []);
  assert.equal(p.calls.length, 2);
  const receipt = read(p.receiptFile('layout-001'));
  assert.deepEqual(compareVerdicts(receipt, {...receipt, attachment: {...report, floating: []}}), []);
});

test('a draft is checked for what it publishes and is not rerun; a rerun on request reproduces the committed receipt', t => {
  const p = project(t);
  const pushed = p.check();
  assert.deepEqual(pushed.errors, []);
  assert.deepEqual(pushed.warnings, []);
  assert.deepEqual(pushed.preliminary, {current: 'layout-001', releases: [{release: 'layout-001', status: 'in-progress', rerun: 'not needed'}]});
  assert.deepEqual(pushed.reruns, [{design: 'Preliminary release layout-001', status: 'in-progress', rerun: 'not needed',
    why: 'It is in progress. A draft is not rerun here: its author runs the local layout check on what changed.'}]);
  assert.deepEqual(p.calls, []);
  const result = p.rerunAll();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.preliminary, {current: 'layout-001', releases: [{release: 'layout-001', status: 'in-progress', rerun: 'pass'}]});
  assert.equal(result.reruns[0].why, 'Rerun on request (--rerun all). The layout check ran on the committed inputs and reproduced the receipt.');
  assert.deepEqual(p.calls, ['layout-001']);
  assert.equal(result.plugin, pluginVersion);
});

test('fails when the rerun does not pass, the control is not rejected or a verdict differs', t => {
  const p = project(t);
  const fails = (rerun, pattern) => assert.match(errorsOf(p.rerunAll({run: p.run(rerun)})), pattern);
  fails(r => ({...r, status: 'blocked'}), /layout-001 \(rerun\) needs a layout-checked receipt; found blocked/);
  fails(r => ({...r, cases: r.cases.map(c => ({...c, status: 'fail'}))}), /\(rerun\) needs every clearance case to pass/);
  fails(r => ({...r, control: {...r.control, witness: null}}), /\(rerun\) needs the displaced control to be rejected/);
  fails(r => ({...r, partial: true}), /partial --fail-fast receipt/);
  fails(r => ({...r, step: {...r.step, sha256: sha('another step')}}), /rerun differs from the committed receipt in stepSha256/);
  fails(r => ({...r, cases: [...r.cases, {case: 'extra', status: 'pass'}]}), /rerun differs from the committed receipt in cases/);
  fails(() => { throw Error('the layout check exceeded its 45 minute budget'); }, /layout-001: the layout check exceeded its 45 minute budget/);
});

test('a hand-edited receipt or a stale one is refused without a rerun', t => {
  const p = project(t), folder = 'cad/preliminary-design/releases/layout-001/';
  // The published receipt claims a plan that is not the committed one.
  write(p.root, folder + 'layout.json', 'an edited plan');
  assert.match(errorsOf(p.check()), /published receipt is of a different layout plan than cad\/preliminary-design\/releases\/layout-001\/layout\.json/);
  write(p.root, folder + 'layout.json', 'plan layout-001');
  // An input changed after the check: the plan bytes are the same, and the committed file is not the one the receipt recorded.
  const study = readFileSync(path.join(p.root, folder + 'paths.json'));
  write(p.root, folder + 'paths.json', '{"cases":[],"edited":true}');
  assert.match(errorsOf(p.check()), /layout-001: the committed motion study \(cad\/preliminary-design\/releases\/layout-001\/paths\.json\) is not the file its receipt checked/);
  write(p.root, folder + 'paths.json', study);
  write(p.root, folder + 'package.step', 'another step');
  assert.match(errorsOf(p.check({skipRerun: true})), /the committed STEP \(.*package\.step\) is not the file its receipt checked/);
  // A STEP kept in Git LFS is compared by the digest its pointer names.
  write(p.root, folder + 'package.step', 'version https://git-lfs.github.com/spec/v1\noid sha256:' + sha('step layout-001') + '\nsize 14\n');
  assert.deepEqual(p.check().errors, []);
  // A file the receipt names that is not committed is reported: the gate could not rerun without it.
  rmSync(path.join(p.root, folder + 'package.step'));
  const missing = p.check();
  assert.deepEqual(missing.errors, []);
  assert.deepEqual(missing.warnings, ['Preliminary release layout-001: its receipt names files that are not committed (package.step). The layout check cannot be rerun without them.']);
  assert.deepEqual(p.calls, []);
  // A receipt marked as a physics-only rerun is not one to publish.
  editJson(p.receiptFile('layout-001'), r => ({...r, physicsOnly: true}));
  assert.match(errorsOf(p.check()), /publish the receipt of a full check/);
});

test('a live release needs committed inputs; history is neither rerun nor required to keep its files', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {}, 'layout-003': {}, 'layout-004': {}},
    {'layout-001': 'withdrawn', 'layout-002': 'superseded', 'layout-003': 'effective', 'layout-004': 'in-progress'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: 'layout-003'}));
  for (const id of ['layout-001', 'layout-002']) rmSync(path.join(p.root, 'cad/preliminary-design/releases', id), {recursive: true});
  rmSync(path.join(p.root, prelim, 'releases/layout-001'), {recursive: true});
  let result = p.rerunAll();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(p.calls, ['layout-003', 'layout-004']);
  assert.deepEqual(rerunsOf(result), [undefined, undefined, 'pass', 'pass']);
  // Without a base commit nothing reruns, and the report says how to ask for it.
  assert.deepEqual(rerunsOf(p.check()), [undefined, undefined, 'not needed', 'not needed']);
  assert.match(whyOf(p.check(), 'layout-003'), /no base commit to compare with.*Pass --rerun all to rerun it on demand/);
  assert.equal(p.calls.length, 2);
  assert.equal(result.reports.length, 1, 'the effective release prints its readiness report');
  assert.match(result.reports[0].title, /layout-003 \(effective\)/);
  // A withdrawal is a status with a reason. The index also keeps the last commit that held the files.
  assert.deepEqual(result.warnings, ['Preliminary release layout-001 is withdrawn without a reason in the index']);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, reason: {'layout-001': 'Invented reason: the carrier changed.'}, lastCommit: {'layout-001': 'a'.repeat(40)}}));
  assert.deepEqual(p.check().warnings, []);
  rmSync(path.join(p.root, 'cad/preliminary-design/releases/layout-004'), {recursive: true});
  result = p.check();
  assert.match(errorsOf(result), /layout-004: commit its check inputs at cad\/preliminary-design\/releases\/layout-004/);
  rmSync(path.join(p.root, prelim, 'releases/layout-002'), {recursive: true});
  assert.match(errorsOf(p.check()), /Release layout-002 is listed but has no directory/);
});

test('the index holds at most one effective release, a computed current release and every directory', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {}}, {'layout-001': 'effective', 'layout-002': 'effective'});
  assert.match(errorsOf(p.check()), /At most one preliminary design release is effective/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, designStatus: {'layout-001': 'effective', 'layout-002': 'in-progress'}}));
  assert.match(errorsOf(p.check()), /set current to layout-001/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: 'layout-001', designStatus: {'layout-001': 'effective', 'layout-002': 'paused'}}));
  assert.match(errorsOf(p.check()), /designStatus maps listed release IDs to in-progress, effective, superseded, withdrawn/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({current: 'layout-001', releases: ['layout-001']}));
  assert.match(errorsOf(p.check()), /Release directory layout-002 is not in the preliminary release index/);
  // Listing a release as legacy, or calling its record a historical review, exempts nothing while its status is live.
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({current: 'layout-002', releases: ['layout-001', 'layout-002'], legacy: ['layout-001'],
    designStatus: {'layout-001': 'in-progress', 'layout-002': 'in-progress'}}));
  editJson(path.join(p.root, prelim, 'releases/layout-002/release.json'), r => ({...r, status: 'historical-review'}));
  assert.deepEqual(p.rerunAll().errors, []);
  assert.deepEqual(p.calls.slice(-2), ['layout-001', 'layout-002']);
});

test('a version ID is checked with the name of its architecture; an earlier ID beside it is unchanged', t => {
  // Synthetic index: an invented architecture, "Tilting carriage", with an effective 1.0 and a draft of 1.1.
  const p = project(t, {'layout-004': {}, '1.0': {}, '1.1': {}}, {'layout-004': 'superseded', '1.0': 'effective', '1.1': 'in-progress'});
  const file = path.join(p.root, prelim, 'releases.json');
  editJson(file, i => ({...i, current: '1.0'}));
  assert.match(errorsOf(p.check()), /Design 1 has no name: add designs\.1\.name to the preliminary release index, or stage a version with --design-name/);
  editJson(file, i => ({...i, designs: {one: {name: 'Tilting carriage'}}}));
  assert.match(errorsOf(p.check()), /designs maps each major number to its architecture name/);
  editJson(file, i => ({...i, designs: {1: {name: 'Tilting carriage'}}, revision: {'1.1': {number: 3, date: '2001-02-03'}}, accepted: {'1.0': '2001-01-02'}}));
  const result = p.rerunAll();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.preliminary, {current: '1.0', releases: [{release: 'layout-004', status: 'superseded'},
    {release: '1.0', design: 'Tilting carriage 1.0', status: 'effective', rerun: 'pass'}, {release: '1.1', design: 'Tilting carriage 1.1', status: 'in-progress', rerun: 'pass'}]});
  assert.deepEqual(p.calls.slice(-2), ['1.0', '1.1'], 'the layout check is rerun in each version folder');
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
  // An ID that is neither a version nor an earlier ID is refused.
  editJson(file, i => ({...i, releases: [...i.releases, '1.0.1']}));
  assert.match(errorsOf(p.check()), /unique release IDs: a version, MAJOR\.MINOR, or an earlier ID/);
});

test('the review scene must repeat the receipt and a mission case must play a represented objective', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {missions: []}, 'layout-003': {trial: '{"transport":{"case":"loaded-turn"}}',
    missions: [{case: 'loaded-turn', kind: 'field-interaction-trial', accomplishes: 'delivered', objective: 'Carry the sample to the bin',
      trial: {file: 'acquire-trial.json', sha256: sha('{"transport":{"case":"loaded-turn"}}')}}]},
    'layout-004': {missions: [{case: 'loaded-turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Hang from the bar'}]}});
  const scene = path.join(p.root, prelim, 'releases/layout-001/review-scene.json.gz');
  const shown = JSON.parse(gunzipSync(readFileSync(scene)));
  writeFileSync(scene, gzipSync(JSON.stringify({...shown, mass: {...shown.mass, remainingKg: 9}})));
  let errors = errorsOf(p.check());
  assert.match(errors, /layout-001: the review scene shows results that differ from the receipt: Scene mass differs from the receipt/);
  assert.match(errors, /layout-002 declares no mission case/);
  assert.match(errors, /layout-004 mission case loaded-turn must accomplish a represented narrative objective/);
  assert.doesNotMatch(errors, /layout-003/);
  // A trial the receipt does not name is not mission evidence.
  write(p.root, prelim + '/releases/layout-003/acquire-trial.json', '{"transport":{"case":"loaded-turn"},"edited":true}');
  assert.match(errorsOf(p.check()), /layout-003 mission case loaded-turn: the published trial is not one the receipt names/);
});

test('a mission case counts when a mission animation plays it; a scene written before animations is unchanged', t => {
  const p = project(t), scene = path.join(p.root, prelim, 'releases/layout-001/review-scene.json.gz');
  const shown = JSON.parse(gunzipSync(readFileSync(scene)));
  assert.equal(shown.animations, undefined, 'the fixture scene predates the animation list');
  assert.equal(errorsOf(p.check()), '');
  const mission = read(path.join(p.root, prelim, 'releases/layout-001/release.json')).missionCases[0].case;
  const animations = (headline, cases = shown.cases.map(c => c.id).filter(id => id !== 'package-displacement-control')) =>
    writeFileSync(scene, gzipSync(JSON.stringify({...shown, animations: [{id: 'cycle', title: 'Whole cycle', mission: headline, cases}]})));
  animations(true);
  assert.equal(errorsOf(p.check()), '', 'a headline phase that plays the case, among its other segments, is a mission animation');
  animations(false);
  assert.match(errorsOf(p.check()), new RegExp('mission case ' + mission + ' is not played by a mission animation of the review'));
});

test('the layout check reruns once, when the change under check makes a design effective', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {}}, {'layout-001': 'effective', 'layout-002': 'in-progress'});
  p.setStatus({});
  const base = p.commit('base');
  // A draft increment: nothing reruns, whatever it edits.
  write(p.root, 'cad/preliminary-design/releases/layout-002/notes.md', 'changed input');
  write(p.root, '.github/workflows/design-publication.yml', 'name: changed pins');
  p.commit('draft increment and a workflow change');
  let result = p.check({base});
  assert.deepEqual([result.errors, rerunsOf(result), p.calls], [[], ['not needed', 'not needed'], []]);
  assert.equal(whyOf(result, 'layout-001'), 'It was effective before this change, and the change leaves its physics as it was.');
  assert.match(whyOf(result, 'layout-002'), /^It is in progress\. A draft is not rerun here/);
  // The stage gate: the status change reruns the design that becomes effective, and only that one.
  p.setStatus({'layout-001': 'superseded', 'layout-002': 'effective'});
  const promoted = p.commit('mark effective');
  result = p.check({base});
  assert.deepEqual([result.errors, result.warnings, rerunsOf(result), p.calls], [[], [], [undefined, 'pass'], ['layout-002']]);
  assert.equal(whyOf(result, 'layout-002'), 'This change makes it effective. The layout check ran on the committed inputs and reproduced the receipt.');
  assert.equal(result.reports.length, 1, 'the readiness report is printed for the reviewer');
  // A gate that does not reproduce the receipt fails the change.
  assert.match(errorsOf(p.check({base, run: p.run(r => ({...r, cases: r.cases.map(c => ({...c, status: 'fail'}))}))})), /layout-002 \(rerun\) needs every clearance case to pass/);
  // The default branch after the merge: its base is the commit before, and it does not repeat the gate of the branch.
  p.calls.length = 0;
  result = p.check({base, skipRerun: true});
  assert.deepEqual([result.errors, rerunsOf(result), p.calls], [[], [undefined, 'skipped'], []]);
  assert.equal(whyOf(result, 'layout-002'), 'This change makes it effective. Not rerun: --skip-rerun. The gate is the push of the branch that carries the change.');
  // The next change finds it effective already.
  write(p.root, 'notes.md', 'unrelated');
  p.commit('unrelated');
  result = p.check({base: promoted});
  assert.deepEqual([result.errors, rerunsOf(result), p.calls], [[], [undefined, 'not needed'], []]);
  // A base that is not a commit is no base.
  assert.match(whyOf(p.check({base: 'f'.repeat(40)}), 'layout-002'), /no base commit to compare with/);
});

test('an effective design keeps its physics: labels and the view may change, the checked inputs and results may not', t => {
  const p = project(t, {'layout-001': {}, '1.0': {}}, {'layout-001': 'superseded', '1.0': 'effective'});
  p.setStatus({}, {designs: {1: {name: 'Tilting carriage'}}});
  authorPlan(p, '1.0');
  const base = p.commit('base'), folder = 'cad/preliminary-design/releases/1.0/';
  const passes = message => { p.commit(message); const result = p.check({base}); assert.deepEqual([result.errors, result.warnings, rerunsOf(result), p.calls], [[], [], [undefined, 'not needed'], []], message); };
  const refused = (message, pattern) => { p.commit(message); assert.match(errorsOf(p.check({base})), pattern, message); assert.deepEqual(p.calls, []); };
  // A presentation refresh: new titles and phases in the plan, a rebuilt page, and the receipt of that plan.
  authorPlan(p, '1.0', {title: 'Invented new title', phase: 'Invented phase'});
  write(p.root, prelim + '/releases/1.0/index.html', '<html>Rebuilt review page</html>');
  editJson(p.receiptFile('1.0'), r => ({...r, view: {...r.view, sha256: sha('rebuilt')}}));
  passes('view refresh');
  // A new issue name, a status word and an accepted date are labels too.
  authorPlan(p, '1.0', {issue: 'invented-new-name'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, accepted: {'1.0': '2001-01-02'}}));
  passes('labels');
  // The plan's physics: a stage that changes purpose.
  authorPlan(p, '1.0', {purpose: 'park'});
  refused('stage purpose', /Preliminary design Tilting carriage 1\.0 is effective, and this change alters its physics: layout\.json\. An effective design does not change in place\. Open 1\.1 as a draft and make the change there\./);
  authorPlan(p, '1.0');
  // A file the plan names, with a receipt that agrees with it: a budget line.
  const ledger = readFileSync(path.join(p.root, folder + 'budgets.json'), 'utf8'), heavier = ledger.replace('"masses"', '"edited":true,"masses"');
  write(p.root, folder + 'budgets.json', heavier);
  editJson(p.receiptFile('1.0'), r => ({...r, budgets: {...r.budgets, source: {...r.budgets.source, sha256: sha(heavier)}}}));
  refused('budget ledger', /alters its physics: budgets.json./);
  write(p.root, folder + 'budgets.json', ledger);
  // A verdict.
  editJson(p.receiptFile('1.0'), r => ({...r, budgets: {...r.budgets, source: {...r.budgets.source, sha256: sha(ledger)}}, cycle: ['loaded-turn']}));
  refused('cycle', /alters its physics: the cycle result./);
  // An earlier ID has no next minor to name.
  const q = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  authorPlan(q, 'layout-001');
  const before = q.commit('base');
  authorPlan(q, 'layout-001', {purpose: 'park'});
  q.commit('physics');
  assert.match(errorsOf(q.check({base: before})), /Preliminary release layout-001 is effective, and this change alters its physics: layout\.json\. .* Publish the change as a new design, staged as a draft\./);
  // Demoted to a draft in the same change, the design may change again.
  q.setStatus({'layout-001': 'in-progress'});
  q.commit('reopened');
  assert.deepEqual(q.check({base: before}).errors, []);
});

test('a rename keeps the design: the same physics under a new ID is not rerun', t => {
  const p = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  authorPlan(p, 'layout-001');
  const base = p.commit('base');
  // The same STEP and motion study, staged under a version with its own issue name and folder; the earlier ID is removed.
  const rename = () => {
    issueRelease(path.join(p.root, 'docs'), '1.0', {basis: 'layout-001'});
    commitInputs(p.root, '1.0', {basis: 'layout-001'});
    authorPlan(p, '1.0', {title: 'Tilting carriage, renamed'});
    for (const dir of [prelim + '/releases/layout-001', 'cad/preliminary-design/releases/layout-001']) rmSync(path.join(p.root, dir), {recursive: true, force: true});
    write(p.root, prelim + '/releases.json', {current: '1.0', releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.0': 'effective'}});
  };
  rename();
  p.commit('rename');
  let result = p.check({base});
  assert.deepEqual([result.errors, result.warnings, rerunsOf(result), p.calls], [[], [], ['not needed'], []]);
  assert.equal(whyOf(result, '1.0'), 'It replaces layout-001, which was effective before this change, with the same physics under a new ID.');
  // A rename that also changes the plan's physics is a new design, and the gate reruns it.
  authorPlan(p, '1.0', {purpose: 'park'});
  p.commit('renamed and changed');
  result = p.check({base});
  assert.deepEqual([result.errors, rerunsOf(result), p.calls], [[], ['pass'], ['1.0']]);
  assert.match(whyOf(result, '1.0'), /^This change makes it effective\./);
});

test('a project in a subfolder of its repository is compared by its own paths', t => {
  const p = project(t);
  const outer = mkdtempSync(path.join(os.tmpdir(), 'publication-repo-'));
  t.after(() => rmSync(outer, {recursive: true, force: true}));
  cpSync(p.root, path.join(outer, 'robot'), {recursive: true});
  const git = (...args) => execFileSync('git', ['-C', outer, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD'), root = path.join(outer, 'robot');
  write(root, 'cad/preliminary-design/releases/layout-001/notes.md', 'changed input');
  git('add', '-A'); git('commit', '-q', '-m', 'input');
  const run = ({project: dir}) => ({...read(path.join(root, prelim, 'releases', path.basename(dir), 'receipt.json')), physicsOnly: true});
  assert.deepEqual(rerunsOf(checkProject(root, {base, run, log: () => {}})), ['not needed']);
  // The index at the base commit is read by the project's own path: the status change is seen and gated.
  editJson(path.join(root, prelim, 'releases.json'), i => ({...i, designStatus: {'layout-001': 'effective'}}));
  git('add', '-A'); git('commit', '-q', '-m', 'effective');
  assert.deepEqual(rerunsOf(checkProject(root, {base, run, log: () => {}})), ['pass']);
  assert.deepEqual(rerunsOf(checkProject(root, {base: git('rev-parse', 'HEAD'), run, log: () => {}})), ['not needed']);
});

/** Publish a detailed design from the files of a preliminary release. */
function design(root, id, status, {from = 'layout-001', record = r => r, index = i => i, readiness} = {}) {
  const dir = path.join(root, detail, 'designs', id), source = path.join(root, prelim, 'releases', from);
  cpSync(source, dir, {recursive: true});
  const release = read(path.join(dir, 'release.json')), receipt = read(path.join(dir, 'receipt.json'));
  rmSync(path.join(dir, 'release.json'));
  write(dir, 'design.json', record({schema: 'agent-frc/detailed-design@1', design: id, issue: receipt.issue, preliminary: {release: from},
    fusion: {stepSha256: receipt.step.sha256, archiveSha256: sha('archive'), configuration: 'Invented stowed assembly'}, missionCases: release.missionCases}));
  if (readiness) write(dir, 'readiness.json', readiness(receipt));
  const file = path.join(root, detail, 'designs.json');
  const prior = (() => { try { return read(file); } catch { return {schema: 'agent-frc/detailed-design-index@1', designs: [], designStatus: {}}; } })();
  const next = {...prior, designs: [...prior.designs, id], designStatus: {...prior.designStatus, [id]: status}};
  const of = s => next.designs.filter(d => next.designStatus[d] === s).at(-1) ?? null;
  write(root, detail + '/designs.json', index({...next, current: of('effective') ?? of('in-progress'), beside: of('effective') ? of('in-progress') : null}));
  cpSync(path.join(root, 'cad/preliminary-design/releases', from), path.join(root, 'cad/detailed-design/designs', id), {recursive: true});
}

test('an in-progress detailed design names an effective preliminary release and is checked on its Fusion export', t => {
  const p = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  design(p.root, 'detail-001', 'in-progress');
  let result = p.rerunAll();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.detailed, {current: 'detail-001', beside: null, designs: [{design: 'detail-001', status: 'in-progress', rerun: 'pass'}]});
  assert.equal(p.check().detailed.designs[0].rerun, 'not needed');
  // Inputs not committed: the design still shows, with a warning that nothing can rerun.
  rmSync(path.join(p.root, 'cad/detailed-design'), {recursive: true});
  result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /detail-001: the layout check cannot be rerun because its inputs are not committed/);
  editJson(path.join(p.root, detail, 'designs/detail-001/design.json'), r => ({...r, fusion: {...r.fusion, stepSha256: sha('another export')}}));
  assert.match(errorsOf(p.check()), /detail-001: the layout check ran on a STEP other than the Fusion export/);
});

test('the preliminary link must be effective; a superseded link only warns', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {}}, {'layout-001': 'in-progress', 'layout-002': 'in-progress'});
  design(p.root, 'detail-001', 'in-progress');
  assert.match(errorsOf(p.check()), /detail-001 must name an effective preliminary release; layout-001 is in-progress/);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, designStatus: {'layout-001': 'superseded', 'layout-002': 'effective'}}));
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /detail-001 names preliminary release layout-001, which is now superseded/);
});

test('an effective detailed design is a status change that carries its readiness review', t => {
  const p = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  const review = verdict => receipt => ({schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly', stepSha256: receipt.step.sha256,
    archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict,
    findings: verdict === 'pass' ? [] : [{domain: 'service', status: 'open', subject: 'invented cover', reason: 'removal path not shown'}]});
  design(p.root, 'detail-001', 'effective');
  assert.match(errorsOf(p.check()), /detail-001 is effective: commit its mechanical-readiness review result as designs\/detail-001\/readiness\.json/);
  write(p.root, detail + '/designs/detail-001/readiness.json', review('pass')(read(p.receiptFile('layout-001'))));
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.match(result.reports.find(r => /detail-001/.test(r.title)).text, /Showcase eligibility: pass\nFindings not passing: 0/);
  // A review that does not pass blocks the status. Its findings are printed for the reviewer.
  write(p.root, detail + '/designs/detail-001/readiness.json', review('open')(read(p.receiptFile('layout-001'))));
  result = p.check();
  assert.match(errorsOf(result), /detail-001 cannot be effective: its mechanical-readiness review reports open/);
  assert.match(result.reports.find(r => /detail-001/.test(r.title)).text, /service: invented cover: open: removal path not shown/);
  // The same review beside an in-progress design blocks nothing.
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, designStatus: {'detail-001': 'in-progress'}}));
  assert.deepEqual(p.check().errors, []);
  // The stage gate of a detailed design: the change that makes it effective reruns its layout check.
  const base = p.commit('in progress');
  write(p.root, detail + '/designs/detail-001/readiness.json', review('pass')(read(p.receiptFile('layout-001'))));
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, designStatus: {'detail-001': 'effective'}}));
  const promoted = p.commit('effective');
  result = p.check({base});
  assert.deepEqual([result.errors, result.detailed.designs, p.calls], [[], [{design: 'detail-001', status: 'effective', rerun: 'pass'}], ['detail-001']]);
  assert.equal(rerunsOf(result)[0], 'not needed', 'the preliminary release was effective already');
  // Effective already, its STEP may not change in place.
  editJson(path.join(p.root, detail, 'designs/detail-001/receipt.json'), r => ({...r, cycle: ['loaded-turn']}));
  p.commit('changed result');
  assert.match(errorsOf(p.check({base: promoted})), /Detailed design detail-001 is effective, and this change alters its physics: the cycle result\./);
  editJson(path.join(p.root, detail, 'designs/detail-001/readiness.json'), r => ({...r, stepSha256: sha('another step')}));
  assert.match(errorsOf(p.check()), /readiness review is of a different STEP/);
});

test('the detailed primary view is computed: the effective design, with the newest in-progress one beside it', t => {
  const p = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  design(p.root, 'detail-001', 'withdrawn');
  design(p.root, 'detail-002', 'in-progress');
  rmSync(path.join(p.root, detail, 'designs/detail-001'), {recursive: true});
  assert.deepEqual(p.check().errors, []);
  assert.deepEqual(p.check().warnings, ['Detailed design detail-001 is withdrawn without a reason in the index']);
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, reason: {'detail-001': 'Invented reason.'}}));
  assert.deepEqual(p.check().warnings, []);
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, current: 'detail-001'}));
  assert.match(errorsOf(p.check()), /set current to detail-002 and beside to null/);
  editJson(path.join(p.root, detail, 'designs.json'), i => ({...i, current: 'detail-002', designStatus: {'detail-001': 'effective', 'detail-002': 'effective'}}));
  assert.match(errorsOf(p.check()), /At most one detailed design is effective/);
});

test('verdicts compare inputs and results, not measured values', () => {
  const receipt = {status: 'layout-checked', planSha256: 'a', step: {sha256: 'b'}, motion: {sha256: 'c'}, cycle: ['x'],
    cases: [{case: 'x', status: 'pass', minimumGapMm: 4.2000001}], control: {case: 'x', displaced: 'rail', witness: {status: 'fail'}},
    budgets: {massStatus: 'pass', electricalCases: [{case: 'weak', status: 'pass', marginV: 0.31}]}};
  const rounded = structuredClone(receipt);
  rounded.cases[0].minimumGapMm = 4.2; rounded.budgets.electricalCases[0].marginV = 0.3100001;
  assert.deepEqual(compareVerdicts(receipt, rounded), []);
  rounded.budgets.massStatus = 'fail';
  assert.deepEqual(compareVerdicts(receipt, rounded), ['massStatus']);
});

test('the command reports every error, exits nonzero and passes a project with nothing published', t => {
  const p = project(t);
  const run = (...args) => spawnSync(process.execPath, [script, 'check', p.root, ...args], {encoding: 'utf8', env: {...process.env, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: ''}});
  const skipped = run('--skip-rerun');
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.equal(JSON.parse(skipped.stdout).preliminary.releases[0].rerun, 'skipped');
  assert.match(skipped.stderr, /\[rerun\] Preliminary release layout-001: skipped\. It is in progress\..* Not rerun: --skip-rerun\./);
  // A workflow copied before results stopped being kept still passes --cache: it is accepted and ignored.
  const old = run('--cache', path.join(p.root, '.cache'), '--budget-minutes', '45');
  assert.equal(old.status, 0, old.stderr);
  assert.match(old.stderr, /Note: --cache is no longer used and is ignored/);
  assert.ok(!existsSync(path.join(p.root, '.cache')));
  assert.equal(JSON.parse(old.stdout).preliminary.releases[0].rerun, 'not needed');
  assert.equal(run('--rerun', 'sometimes').status, 2);
  // The step summary says for each design whether the layout check reran, and why.
  const summary = path.join(p.root, 'summary.md');
  spawnSync(process.execPath, [script, 'check', p.root], {encoding: 'utf8', env: {...process.env, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: summary}});
  assert.match(readFileSync(summary, 'utf8'), /### Layout check reruns\n\n\| Design \| Status \| Layout check \| Why \|\n.*\n\| Preliminary release layout-001 \| in-progress \| not rerun \(not needed\) \| It is in progress\./);
  rmSync(summary);
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: 'layout-009'}));
  const failed = run('--skip-rerun');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Error: The preliminary index must open/);
  rmSync(path.join(p.root, 'docs'), {recursive: true});
  const empty = run();
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout).preliminary, null);
  assert.equal(spawnSync(process.execPath, [script, 'check', p.root, '--budget-minutes'], {encoding: 'utf8'}).status, 2);
});

test('the real layout check reruns a committed synthetic release and rejects a forged receipt',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, t => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'publication-real-'));
    t.after(() => rmSync(temp, {recursive: true, force: true}));
    const season = path.join(temp, 'season'), py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('../examples/preliminary-design/create.py', import.meta.url)), season, '--project-review'], {stdio: 'pipe'});
    // The starter publishes a version: the invented architecture "Turning carrier", 1.0.
    const result = checkProject(season, {budgetMinutes: 5, rerun: 'all'});
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.preliminary.releases, [{release: '1.0', design: 'Turning carrier 1.0', status: 'in-progress', rerun: 'pass'}]);
    // The example names every file by path: no author types a hash, and the receipt holds the digests the check read.
    const authored = 'cad/preliminary-design/releases/1.0';
    for (const name of ['layout.json', 'paths.json', 'budgets.json', 'missions.json', 'release-lane-replay.json'])
      assert.doesNotMatch(readFileSync(path.join(season, authored, name), 'utf8'), /sha256/i, name);
    assert.equal(read(path.join(season, prelim, 'releases/1.0/receipt.json')).motion.sha256, sha(readFileSync(path.join(season, authored, 'paths.json'))));
    // The readiness report of an effective release resolves its trial pins from the repository root, where the check ran.
    editJson(path.join(season, prelim, 'releases.json'), i => ({...i, designStatus: {'1.0': 'effective'}}));
    const report = checkProject(season, {skipRerun: true}).reports.map(r => r.text).join(' ');
    assert.match(report, /Effective-readiness report for Turning carrier 1\.0 \(synthetic-package-1\.0\)/);
    assert.match(report, /trial cad\/preliminary-design\/releases\/1\.0\/release-lane-trial\.json has no qualification record/);
    assert.doesNotMatch(report, /the motion is prescribed/);
    assert.match(report, /release-lane-trial\.json \(read; no SHA-256 given to compare\)/);
    // An input changed without a new check and stage: the plan bytes are the same, and the rerun's digest differs from the receipt.
    const studyFile = path.join(season, authored, 'paths.json'), study = readFileSync(studyFile);
    editJson(studyFile, s => ({...s, cases: s.cases.map((c, i) => i ? c : {...c, basis: 'Invented reworded basis'})}));
    assert.match(errorsOf(checkProject(season, {budgetMinutes: 5, rerun: 'all'})), /the rerun differs from the committed receipt in motionSha256/);
    writeFileSync(studyFile, study);
    editJson(path.join(season, prelim, 'releases.json'), i => ({...i, designStatus: {'1.0': 'in-progress'}}));
    // An edit to the in-progress design is staged under the same ID: one entry, a counted revision, and the rerun on the revised inputs.
    const folder = 'cad/preliminary-design/releases/1.0';
    editJson(path.join(season, folder, 'layout.json'), l => ({...l, presentation: {...l.presentation, focus: 'Invented revised focus.'}}));
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/design.mjs', import.meta.url)), 'preliminary-check', season, folder + '/layout.json',
      '--write-view', '--require-checked', '--quiet', '--output', folder + '/receipt.json'], {stdio: 'pipe'});
    assert.match(execFileSync(py, ['-B', path.join(season, 'cad/preliminary-design/stage.py'), '1.0'], {encoding: 'utf8'}), /Revised preliminary design Turning carrier 1\.0 in place \(draft 2, in progress\)/);
    const revised = checkProject(season, {budgetMinutes: 5, rerun: 'all'});
    assert.deepEqual(revised.errors, []);
    assert.deepEqual(revised.preliminary.releases, [{release: '1.0', design: 'Turning carrier 1.0', status: 'in-progress', rerun: 'pass'}]);
    assert.equal(JSON.parse(readFileSync(path.join(season, prelim, 'releases.json'))).revision['1.0'].number, 2);
    // Move the displaced control so it no longer collides, then forge the receipt's plan digest by hand.
    const plan = path.join(season, 'cad/preliminary-design/releases/1.0/layout.json');
    editJson(plan, l => ({...l, control: {...l.control, offsetMm: [0, 50, 0]}}));
    editJson(path.join(season, prelim, 'releases/1.0/receipt.json'), r => ({...r, planSha256: sha(readFileSync(plan))}));
    assert.match(errorsOf(checkProject(season, {budgetMinutes: 5, rerun: 'all'})), /Preliminary design Turning carrier 1\.0 \(rerun\) needs a layout-checked receipt; found provisional/);
  });

test('a release whose plan types its hashes still reruns, and a wrong typed hash still fails',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, t => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'publication-pins-'));
    t.after(() => rmSync(temp, {recursive: true, force: true}));
    const season = path.join(temp, 'season'), py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('../examples/preliminary-design/create.py', import.meta.url)), season, '--project-review', '--pins'], {stdio: 'pipe'});
    const folder = path.join(season, 'cad/preliminary-design/releases/1.0');
    assert.match(readFileSync(path.join(folder, 'layout.json'), 'utf8'), /"sha256"/);
    assert.deepEqual(checkProject(season, {budgetMinutes: 5, rerun: 'all'}).errors, []);
    // The narrative changes under its typed hash: the checker refuses the committed plan with "Changed evidence".
    writeFileSync(path.join(folder, 'narrative.md'), 'Invented narrative, edited after the check.');
    assert.match(errorsOf(checkProject(season, {budgetMinutes: 5, rerun: 'all'})), /Turning carrier 1\.0: the layout check ended with an error \(exit 2\)/);
  });

test('on a real release a view refresh and a rename pass with no rerun, and a change to the physics is refused',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, t => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'publication-gate-'));
    t.after(() => rmSync(temp, {recursive: true, force: true}));
    const season = path.join(temp, 'season'), py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('../examples/preliminary-design/create.py', import.meta.url)), season, '--project-review'], {stdio: 'pipe'});
    const releases = 'cad/preliminary-design/releases/', stage = (...args) => execFileSync(py, ['-B', path.join(season, 'cad/preliminary-design/stage.py'), ...args], {encoding: 'utf8'});
    const layoutCheck = (id, ...flags) => execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/design.mjs', import.meta.url)), 'preliminary-check', season, releases + id + '/layout.json',
      '--write-view', '--require-checked', '--quiet', '--output', releases + id + '/receipt.json', ...flags], {stdio: 'pipe'});
    const git = (...args) => execFileSync('git', ['-C', season, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    const commit = message => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
    // No layout check may run in what follows: each of these changes is decided from the committed files.
    const pushed = base => checkProject(season, {base, log: () => {}, run: () => { throw Error('the layout check was rerun'); }});
    git('init', '-q');
    const draft = commit('draft');
    // The stage gate, for comparison: the change that makes 1.0 effective reruns the real check once.
    stage('--set-status', '1.0', 'effective');
    const effective = commit('effective');
    const gated = checkProject(season, {base: draft, budgetMinutes: 5, log: () => {}});
    assert.deepEqual([gated.errors, gated.preliminary.releases[0].rerun], [[], 'pass']);
    assert.equal(pushed(effective).preliminary.releases[0].rerun, 'not needed');
    // A presentation refresh: reworded focus, the view rebuilt from the receipt, and the view republished.
    editJson(path.join(season, releases, '1.0/layout.json'), l => ({...l, presentation: {...l.presentation, focus: 'Invented reworded focus.', title: 'Invented reworded title'}}));
    layoutCheck('1.0', '--view-only');
    assert.match(stage('--refresh-view', '1.0'), /Refreshed the view of preliminary design Turning carrier 1\.0 \(effective\)/);
    commit('view refresh');
    let result = pushed(effective);
    assert.deepEqual([result.errors, result.warnings, result.preliminary.releases[0].rerun], [[], [], 'not needed']);
    assert.equal(result.reruns[0].why, 'It was effective before this change, and the change leaves its physics as it was.');
    // A rename: the same design under another ID, folder and issue name, checked there and staged, and the earlier ID removed.
    stage('--copy-inputs', '1.0', '1.1');
    for (const name of ['layout.json', 'budgets.json', 'pickup-face-current.json', 'acquire-time-current.json']) {
      const file = path.join(season, releases, '1.1', name);
      assert.equal(read(file).issue, 'synthetic-package-1.0', name);
      editJson(file, record => ({...record, issue: 'invented-renamed-package'}));
    }
    layoutCheck('1.1');
    stage('1.1');
    stage('--set-status', '1.1', 'effective');
    stage('--remove', '1.0', '--replaced-by', '1.1');
    commit('rename');
    result = pushed(effective);
    assert.deepEqual([result.errors, result.warnings, result.preliminary.releases], [[], [], [{release: '1.1', design: 'Turning carrier 1.1', status: 'effective', rerun: 'not needed'}]]);
    assert.equal(result.reruns[0].why, 'It replaces 1.0, which was effective before this change, with the same physics under a new ID.');
    const renamed = git('rev-parse', 'HEAD');
    // A change to the physics of the effective design: a tolerance in its motion study, with a receipt that agrees.
    editJson(path.join(season, releases, '1.1/paths.json'), study => ({...study, cases: study.cases.map((c, i) => i ? c : {...c, minGapMm: 0.5})}));
    layoutCheck('1.1');
    assert.throws(() => execFileSync(py, ['-B', path.join(season, 'cad/preliminary-design/stage.py'), '--refresh-view', '1.1'], {encoding: 'utf8', stdio: 'pipe'}),
      /Turning carrier 1\.1 is effective and this receipt differs from the published one in the motion study\. A view refresh keeps the physics\. Work that changes it belongs to 1\.2, staged as a draft/);
    commit('changed tolerance');
    assert.match(errorsOf(pushed(renamed)), /Preliminary design Turning carrier 1\.1 is effective, and this change alters its physics: paths\.json\. An effective design does not change in place\. Open 1\.2 as a draft and make the change there\./);
  });
