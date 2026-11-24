/**
 * @lane merge
 * @subject scripts/design-publication.mjs
 * @subject scripts/detailed-design-release.mjs
 * @subject scripts/mechanical_readiness.py
 * @subject templates/preliminary-review/review.html
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkProject as checkWithJudgement} from '../scripts/design-publication.mjs';
import {markEffective as markEffectiveWithGate, refresh, stageInProgress as stageWithJudgement, withdraw} from '../scripts/detailed-design-release.mjs';
import {writeGate} from '../scripts/gate-record.mjs';
import {preliminaryGate} from '../scripts/stage-gate.mjs';
import {editJson, issueRelease, listing, paged, sha, standIn, write, writeInputs} from './fixtures/preliminary-release.mjs';

// These invented designs hold no solid, so the layout judgement is stood in for.
const standInCli = fileURLToPath(new URL('./fixtures/stand-in-cli.mjs', import.meta.url));
const markEffective = options => markEffectiveWithGate({judge: standIn, ...options});
const stageInProgress = options => stageWithJudgement({judge: standIn, ...options});
const checkProject = (root, options) => checkWithJudgement(root, {judge: standIn, ...options});
/** Record the stage gate of a preliminary release, as the command that marks it effective does. */
const gated = (root, id) => { const done = preliminaryGate({project: root, release: id, judge: standIn}); writeGate(done.published, done.gate); };

// Synthetic teaching fixtures: invented releases, cases and objectives with no relation to any game.
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const detail = 'docs/detailed-design';

/** A project with one effective preliminary release and checked inputs for a detailed design on the same invented layout. */
function project(t, {status = 'effective'} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'detailed-release-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  issueRelease(root, '1.0');
  listing(root, '1.0', ['1.0'], {'1.0': status}, {1: {name: 'Tilting carriage'}});
  if (status === 'effective') gated(root, '1.0');
  const inputs = 'cad/detailed-design/designs/1.0', stepSha256 = sha('step 1.0');
  // The design source places its solids from the STEP that stands for the registered Fusion export.
  writeInputs(root, inputs, {issue: 'synthetic-1.0', step: 'step 1.0', page: '<html>Detailed review</html>'});
  const replay = () => ({archiveSha256: sha('archive'), stepSha256: stepSha256, configuration: 'Invented stowed assembly', revision: 'review-r1'});
  const review = (verdict = 'pass', step = stepSha256) => {
    write(root, 'cad/detailed-design/readiness-result.json', {schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly',
      stepSha256: step, archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict,
      findings: verdict === 'pass' ? [] : [{domain: 'service', status: 'open', subject: 'invented cover', reason: 'removal path not shown'}]});
    return 'cad/detailed-design/readiness-result.json';
  };
  const stage = (options = {}) => stageInProgress({project: root, design: '1.0', inputs, preliminary: '1.0', authority: 'cad/fusion-authority.json',
    lineage: 'cad/lineage.json', replay, ...options});
  return {root, inputs, stepSha256, stage, review, index: () => read(path.join(root, detail, 'designs.json'))};
}
const passes = root => assert.deepEqual(checkProject(root, {log: () => {}}).errors, []);

test('stage publishes an in-progress design that the publication check accepts', t => {
  const p = project(t);
  const {report, revision, ...index} = p.stage();
  assert.deepEqual(index, {schema: 'agent-frc/detailed-design-index@1', preliminaryIndex: '../preliminary-design/releases.json', current: '1.0', beside: null,
    designs: ['1.0'], architectures: {1: {name: 'Tilting carriage'}}, designStatus: {'1.0': 'in-progress'}, preliminary: {'1.0': '1.0'}});
  // Its publishes are counted as drafts.
  assert.equal(revision['1.0'].number, 1);
  assert.equal(report, 'Staged detailed design Tilting carriage 1.0 (draft 1 · in progress)\nBefore pushing, run the publication check: node PLUGIN/scripts/design-publication.mjs check .\nOn push: the project\'s workflow publishes the page. Nothing is rerun.\n');
  const dir = path.join(p.root, detail, 'designs/1.0');
  assert.deepEqual(read(path.join(dir, 'design.json')), {schema: 'agent-frc/detailed-design@1', design: '1.0', issue: 'synthetic-1.0',
    preliminary: {release: '1.0'}, fusion: {archiveSha256: sha('archive'), stepSha256: p.stepSha256, configuration: 'Invented stowed assembly', revision: 'review-r1'},
    check: {project: p.inputs}});
  assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), '<html>Detailed review</html>');
  assert.ok(existsSync(path.join(p.root, detail, 'index.html')), 'the stock catalog is written when the tree has none');
  assert.ok(existsSync(path.join(p.root, detail, 'fonts/fonts.css')), 'the review page finds its theme fonts in the detailed tree');
  // The source, the judgement, the page file and the records sit beside the record, under names of their own.
  for (const [name, from] of [['source.json', 'design.json'], ['subsystems/arm.json', 'subsystems/arm.json'], ['judgement.json', 'judgement.json'], ['page.json', 'page.json'],
    ['records/trials.json', 'records/trials.json'], ['records/measurements/mass.drawn.json', 'records/measurements/mass.drawn.json']])
    assert.ok(readFileSync(path.join(dir, name)).equals(readFileSync(path.join(p.root, p.inputs, from))), name);
  passes(p.root);
  // Staging again after a fix replaces the design while it is in progress.
  write(p.root, p.inputs + '/review.html', '<html>Corrected review</html>');
  p.stage();
  assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), '<html>Corrected review</html>');
});

test('stage refuses a design source that places no solid from the Fusion export or a preliminary release that is not effective, and leaves the site as it was', t => {
  const p = project(t);
  assert.throws(() => p.stage({replay: () => ({archiveSha256: sha('archive'), stepSha256: sha('another export'), configuration: 'Invented'})}),
    /The design source places no solid from the registered Fusion export/);
  const q = project(t, {status: 'in-progress'});
  assert.throws(() => q.stage(), /1\.0 must name an effective preliminary release; 1\.0 is in-progress/);
  assert.ok(!existsSync(path.join(q.root, detail, 'designs.json')) && !existsSync(path.join(q.root, detail, 'designs/1.0')));
  assert.throws(() => p.stage({inputs: '../outside'}), /Detailed design input is missing|inside the project/);
  // It judges the committed records: a stale one, a verdict that is not layout-checked and a scene of another verdict are refused.
  const r = project(t), at = name => path.join(r.root, r.inputs, name);
  editJson(at('subsystems/arm.json'), s => ({...s, solids: [{name: 'arm', massKg: 9}]}));
  assert.throws(() => r.stage(), /is stale: solid "arm" changed/);
  editJson(at('subsystems/arm.json'), s => ({...s, solids: [{name: 'arm', massKg: 1}]}));
  write(r.root, r.inputs + '/stand-in.json', {status: 'blocked', firstUnmet: {kind: 'weight', text: 'invented weight'}});
  assert.throws(() => r.stage(), /its records judge it blocked: invented weight/);
  rmSync(at('stand-in.json'));
  paged(r.root, r.inputs + '/judgement.json', scene => ({...scene, weight: {...scene.weight, totalKg: 1}}));
  assert.throws(() => r.stage(), /the review scene does not repeat the verdict: Scene weight differs from the verdict/);
  assert.ok(!existsSync(path.join(r.root, detail, 'designs.json')));
});

test('effective is a status change that commits a passing readiness review and supersedes the earlier design', t => {
  const p = project(t);
  p.stage();
  assert.throws(() => markEffective({project: p.root, design: '1.0', readiness: p.review('pass', sha('another step'))}), /readiness review is of a different STEP/);
  // A review that does not pass is refused with its findings, and nothing changes.
  assert.throws(() => markEffective({project: p.root, design: '1.0', readiness: p.review('open')}),
    /1\.0 cannot be effective: its mechanical-readiness review reports open\n[\s\S]*Findings not passing: 1\n  - service: invented cover: open: removal path not shown/);
  assert.deepEqual(p.index().designStatus, {'1.0': 'in-progress'});
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/1.0/readiness.json')));
  const first = markEffective({project: p.root, design: '1.0', readiness: p.review('pass')});
  assert.match(first.report, /Showcase eligibility: pass\nFindings not passing: 0/);
  assert.deepEqual(first.designStatus, {'1.0': 'effective'});
  assert.equal(first.current, '1.0');
  assert.equal(read(path.join(p.root, detail, 'designs/1.0/readiness.json')).showcaseEligibility, 'pass');
  passes(p.root);
  // A design that was never shown in progress is recorded from its review.
  const second = markEffective({project: p.root, design: '1.1', readiness: p.review('pass')});
  assert.deepEqual(second.designStatus, {'1.0': 'superseded', '1.1': 'effective'});
  assert.deepEqual(second.supersededBy, {'1.0': '1.1'});
  assert.equal(second.current, '1.1');
  assert.deepEqual(read(path.join(p.root, detail, 'designs/1.1/design.json')).fusion,
    {archiveSha256: sha('archive'), stepSha256: p.stepSha256, configuration: 'Invented stowed assembly'});
  passes(p.root);
  assert.throws(() => markEffective({project: p.root, design: '1.0', readiness: p.review('pass')}), /Only a new or in-progress design can become effective/);
});

test('a detailed design becomes effective end to end from the review command, with no key or variable',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, t => {
    const p = project(t), py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    // Nothing the retired signature, key or held-plan checks read is present.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^FRC_(NATIVE_WITNESS|OPERATING|REVIEWER|MODEL)_/.test(name)));
    const mechanical = path.join(p.root, 'cad/mechanical'), result = 'cad/mechanical/readiness-result.json';
    execFileSync(py, ['-B', fileURLToPath(new URL('./readiness_study.py', import.meta.url)), mechanical], {stdio: 'pipe', env});
    const reviewCommand = fileURLToPath(new URL('../scripts/mechanical_readiness.py', import.meta.url));
    execFileSync(py, ['-B', reviewCommand, 'review', mechanical, 'readiness-study.json', '--require-publication', '--output', path.join(p.root, result)], {stdio: 'pipe', env});
    const review = read(path.join(p.root, result));
    assert.deepEqual([review.showcaseEligibility, review.buildReadiness, review.findings], ['pass', 'pass', []]);
    // The status change records the design from its review: the reviewed STEP and archive.
    const marked = spawnSync(process.execPath, [standInCli, 'detailed-design-release.mjs', 'effective', p.root, '--design', '1.0', '--readiness', result], {encoding: 'utf8', env});
    assert.equal(marked.status, 0, marked.stderr);
    assert.deepEqual(p.index().designStatus, {'1.0': 'effective'});
    const checked = checkProject(p.root, {log: () => {}});
    assert.deepEqual(checked.errors, []);
    assert.match(checked.reports.find(r => /Detailed design/.test(r.title)).text, /Showcase eligibility: pass\nFindings not passing: 0/);
    // A failing duty in the same study is refused by the review command and by the status change.
    const study = read(path.join(mechanical, 'readiness-study.json'));
    study.duties.at(-1).max = .7;
    write(mechanical, 'blocked-study.json', study);
    const blocked = spawnSync(py, ['-B', reviewCommand, 'review', mechanical, 'blocked-study.json', '--require-publication', '--output', path.join(mechanical, 'blocked-result.json')], {encoding: 'utf8', env});
    assert.equal(blocked.status, 1, blocked.stderr);
    assert.equal(read(path.join(mechanical, 'blocked-result.json')).showcaseEligibility, 'fail');
    assert.throws(() => markEffective({project: p.root, design: '1.1', readiness: 'cad/mechanical/blocked-result.json'}), /1\.1 cannot be effective: its mechanical-readiness review reports fail/);
  });

test('withdraw is a status change: the index keeps the reason and the last commit, and the files leave with no archive', t => {
  const p = project(t);
  p.stage();
  const git = (...args) => execFileSync('git', ['-C', p.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'publish 1.0');
  const published = git('rev-parse', 'HEAD');
  write(p.root, 'notes.md', 'unrelated');
  git('add', '-A'); git('commit', '-q', '-m', 'unrelated');
  assert.throws(() => withdraw({project: p.root, design: '1.0'}), /Give the reason/);
  const index = withdraw({project: p.root, design: '1.0', reason: 'Invented reason: the carrier changed.'});
  assert.deepEqual(index.designStatus, {'1.0': 'withdrawn'});
  assert.deepEqual(index.reason, {'1.0': 'Invented reason: the carrier changed.'});
  assert.deepEqual(index.lastCommit, {'1.0': published}, 'the commit where the published files can still be read');
  assert.match(git('show', '--stat', '--format=', published), /designs\/1\.0\/design\.json/);
  assert.equal(index.current, null);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/1.0')) && !existsSync(path.join(p.root, detail, 'archive')));
  passes(p.root);
  assert.throws(() => withdraw({project: p.root, design: '1.0', reason: 'again'}), /already withdrawn/);
  assert.throws(() => withdraw({project: p.root, design: '9.0', reason: 'x'}), /not in the index/);
});

test('refresh recomputes the primary view of an index edited by hand', t => {
  const p = project(t);
  p.stage();
  write(p.root, detail + '/designs.json', {...p.index(), current: null, beside: '1.0'});
  assert.match(checkProject(p.root, {log: () => {}}).errors.join('\n'), /set current to 1\.0 and beside to null/);
  assert.equal(refresh({project: p.root}).current, '1.0');
  passes(p.root);
});

test('the command line runs each command and reports a refusal', t => {
  const p = project(t);
  p.stage();
  const run = (...args) => spawnSync(process.execPath, [standInCli, 'detailed-design-release.mjs', ...args], {encoding: 'utf8'});
  const effective = run('effective', p.root, '--design', '1.0', '--readiness', p.review('pass'));
  assert.equal(effective.status, 0, effective.stderr);
  assert.match(effective.stderr, /Showcase eligibility: pass/);
  assert.equal(JSON.parse(effective.stdout).current, '1.0');
  const withdrawn = run('withdraw', p.root, '--design', '1.0', '--reason', 'Invented reason.', '--site', 'docs');
  assert.equal(JSON.parse(withdrawn.stdout).designStatus['1.0'], 'withdrawn');
  const refused = run('withdraw', p.root, '--design', '1.0', '--reason', 'again');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already withdrawn[\s\S]*Usage: detailed-design-release\.mjs stage PROJECT/);
});
