import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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

/** A project with committed inputs for each release and a layout check that returns what `rerun` makes of the published receipt. */
function project(t, releases = {'layout-001': {}}, statuses = undefined) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [id, options] of Object.entries(releases)) {
    issueRelease(path.join(root, 'docs'), id, options);
    write(root, 'cad/preliminary-design/releases/' + id + '/layout.json', 'plan ' + id);
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
  return {root, calls, run, receiptFile, check: (options = {}) => checkProject(root, {run: run(), log: () => {}, ...options})};
}
const editJson = (file, edit) => writeFileSync(file, JSON.stringify(edit(read(file)), null, 2));
const errorsOf = result => result.errors.join('\n');

test('passes a release whose rerun reproduces the committed receipt', t => {
  const p = project(t);
  const result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.preliminary, {current: 'layout-001', releases: [{release: 'layout-001', status: 'in-progress', rerun: 'pass'}]});
  assert.deepEqual(p.calls, ['layout-001']);
  assert.equal(result.plugin, pluginVersion);
});

test('fails when the rerun does not pass, the control is not rejected or a verdict differs', t => {
  const p = project(t);
  const fails = (rerun, pattern) => assert.match(errorsOf(p.check({run: p.run(rerun)})), pattern);
  fails(r => ({...r, status: 'blocked'}), /layout-001 \(rerun\) needs a layout-checked receipt; found blocked/);
  fails(r => ({...r, cases: r.cases.map(c => ({...c, status: 'fail'}))}), /\(rerun\) needs every clearance case to pass/);
  fails(r => ({...r, control: {...r.control, witness: null}}), /\(rerun\) needs the displaced control to be rejected/);
  fails(r => ({...r, partial: true}), /partial --fail-fast receipt/);
  fails(r => ({...r, step: {...r.step, sha256: sha('another step')}}), /rerun differs from the committed receipt in stepSha256/);
  fails(r => ({...r, cases: [...r.cases, {case: 'extra', status: 'pass'}]}), /rerun differs from the committed receipt in cases/);
  fails(() => { throw Error('the layout check exceeded its 45 minute budget'); }, /layout-001: the layout check exceeded its 45 minute budget/);
});

test('a hand-edited receipt cannot stand in for the check', t => {
  const p = project(t);
  // The published receipt claims a plan that is not the committed one.
  write(p.root, 'cad/preliminary-design/releases/layout-001/layout.json', 'an edited plan');
  assert.match(errorsOf(p.check()), /published receipt is of a different layout plan than cad\/preliminary-design\/releases\/layout-001\/layout\.json/);
  assert.deepEqual(p.calls, []);
  // A receipt marked as a physics-only rerun is not one to publish.
  write(p.root, 'cad/preliminary-design/releases/layout-001/layout.json', 'plan layout-001');
  editJson(p.receiptFile('layout-001'), r => ({...r, physicsOnly: true}));
  assert.match(errorsOf(p.check()), /publish the receipt of a full check/);
});

test('a live release needs committed inputs; history is neither rerun nor required to keep its files', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {}, 'layout-003': {}, 'layout-004': {}},
    {'layout-001': 'withdrawn', 'layout-002': 'superseded', 'layout-003': 'effective', 'layout-004': 'in-progress'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: 'layout-003'}));
  for (const id of ['layout-001', 'layout-002']) rmSync(path.join(p.root, 'cad/preliminary-design/releases', id), {recursive: true});
  rmSync(path.join(p.root, prelim, 'releases/layout-001'), {recursive: true});
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(p.calls, ['layout-003', 'layout-004']);
  assert.deepEqual(result.preliminary.releases.map(r => r.rerun), [undefined, undefined, 'pass', 'pass']);
  assert.equal(result.reports.length, 1, 'the effective release prints its readiness report');
  assert.match(result.reports[0].title, /layout-003 \(effective\)/);
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
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({current: 'layout-001', releases: ['layout-001'], effectiveHistory: ['layout-001']}));
  assert.match(errorsOf(p.check()), /Release directory layout-002 is not in the preliminary release index/);
  // Listing a release as legacy, or calling its record a historical review, exempts nothing while its status is live.
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({current: 'layout-002', releases: ['layout-001', 'layout-002'], legacy: ['layout-001'],
    designStatus: {'layout-001': 'in-progress', 'layout-002': 'in-progress'}}));
  editJson(path.join(p.root, prelim, 'releases/layout-002/release.json'), r => ({...r, status: 'historical-review'}));
  assert.deepEqual(p.check().errors, []);
  assert.deepEqual(p.calls.slice(-2), ['layout-001', 'layout-002']);
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

test('a rerun result is cached by the digest of every input file and the plugin version', t => {
  const p = project(t), cache = path.join(p.root, '.cache');
  assert.deepEqual(p.check({cache}).preliminary.releases[0].rerun, 'pass');
  assert.deepEqual(p.check({cache}).preliminary.releases[0].rerun, 'cached');
  assert.deepEqual(p.calls, ['layout-001']);
  // A cached result is still compared with the committed receipt.
  editJson(p.receiptFile('layout-001'), r => ({...r, budgets: {...r.budgets, source: {...r.budgets.source, sha256: sha('other ledger')}}}));
  assert.match(errorsOf(p.check({cache})), /rerun differs from the committed receipt in budgetsSha256/);
  // An input the plan pins changes while the plan does not: the cache must miss, so the layout check sees the changed file.
  const r = project(t), again = path.join(r.root, '.cache');
  write(r.root, 'cad/preliminary-design/releases/layout-001/paths.json', '{"cases":[]}');
  r.check({cache: again});
  write(r.root, 'cad/preliminary-design/releases/layout-001/paths.json', '{"cases":[],"edited":true}');
  assert.deepEqual(r.check({cache: again}).preliminary.releases[0].rerun, 'pass');
  assert.deepEqual(r.calls, ['layout-001', 'layout-001']);
  // A failing rerun is never cached.
  const q = project(t), failing = path.join(q.root, '.cache');
  q.check({cache: failing, run: q.run(r => ({...r, status: 'blocked'}))});
  assert.deepEqual(q.check({cache: failing}).preliminary.releases[0].rerun, 'pass');
});

test('with a base commit only a changed design is rerun, and a workflow change reruns all', t => {
  const p = project(t, {'layout-001': {}, 'layout-002': {}}, {'layout-001': 'effective', 'layout-002': 'in-progress'});
  editJson(path.join(p.root, prelim, 'releases.json'), i => ({...i, current: 'layout-001'}));
  const git = (...args) => execFileSync('git', ['-C', p.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  write(p.root, 'notes.md', 'unrelated');
  git('add', '-A'); git('commit', '-q', '-m', 'unrelated');
  assert.deepEqual(p.check({base}).preliminary.releases.map(r => r.rerun), ['unchanged', 'unchanged']);
  write(p.root, 'cad/preliminary-design/releases/layout-002/notes.md', 'changed input');
  git('add', '-A'); git('commit', '-q', '-m', 'input');
  assert.deepEqual(p.check({base}).preliminary.releases.map(r => r.rerun), ['unchanged', 'pass']);
  write(p.root, '.github/workflows/design-publication.yml', 'name: changed');
  git('add', '-A'); git('commit', '-q', '-m', 'workflow');
  assert.deepEqual(p.check({base}).preliminary.releases.map(r => r.rerun), ['pass', 'pass']);
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
  assert.deepEqual(checkProject(root, {base, run, log: () => {}}).preliminary.releases.map(r => r.rerun), ['pass']);
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
  write(root, 'cad/detailed-design/designs/' + id + '/layout.json', 'plan ' + from);
}

test('an in-progress detailed design names an effective preliminary release and is checked on its Fusion export', t => {
  const p = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  design(p.root, 'detail-001', 'in-progress');
  let result = p.check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.detailed, {current: 'detail-001', beside: null, designs: [{design: 'detail-001', status: 'in-progress', rerun: 'pass'}]});
  // Inputs not committed: the design still shows, with a warning that nothing reran.
  rmSync(path.join(p.root, 'cad/detailed-design'), {recursive: true});
  result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /detail-001: the layout check was not rerun because its inputs are not committed/);
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
  // The verdict is printed for the reviewer, not judged here.
  write(p.root, detail + '/designs/detail-001/readiness.json', review('open')(read(p.receiptFile('layout-001'))));
  result = p.check();
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /detail-001 is effective while its readiness review reports open/);
  assert.match(result.reports.find(r => /detail-001/.test(r.title)).text, /service: invented cover: open: removal path not shown/);
  editJson(path.join(p.root, detail, 'designs/detail-001/readiness.json'), r => ({...r, stepSha256: sha('another step')}));
  assert.match(errorsOf(p.check()), /readiness review is of a different STEP/);
});

test('the detailed primary view is computed: the effective design, with the newest in-progress one beside it', t => {
  const p = project(t, {'layout-001': {}}, {'layout-001': 'effective'});
  design(p.root, 'detail-001', 'withdrawn');
  design(p.root, 'detail-002', 'in-progress');
  rmSync(path.join(p.root, detail, 'designs/detail-001'), {recursive: true});
  assert.deepEqual(p.check().errors, []);
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
    const result = checkProject(season, {budgetMinutes: 5});
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.preliminary.releases, [{release: 'layout-001', status: 'in-progress', rerun: 'pass'}]);
    // Move the displaced control so it no longer collides, then forge the receipt's plan digest by hand.
    const plan = path.join(season, 'cad/preliminary-design/releases/layout-001/layout.json');
    editJson(plan, l => ({...l, control: {...l.control, offsetMm: [0, 50, 0]}}));
    editJson(path.join(season, prelim, 'releases/layout-001/receipt.json'), r => ({...r, planSha256: sha(readFileSync(plan))}));
    assert.match(errorsOf(checkProject(season, {budgetMinutes: 5})), /layout-001 \(rerun\) needs a layout-checked receipt; found provisional/);
  });
