import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkProject} from '../scripts/design-publication.mjs';
import {markEffective, refresh, stageInProgress, withdraw} from '../scripts/detailed-design-release.mjs';
import {issueRelease, listing, sha, write} from './fixtures/preliminary-release.mjs';

// Synthetic teaching fixtures: invented releases, cases and objectives with no relation to any game.
const script = fileURLToPath(new URL('../scripts/detailed-design-release.mjs', import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const detail = 'docs/detailed-design', prelim = 'docs/preliminary-design';

/** A project with one effective preliminary release and checked inputs for a detailed design on the same invented layout. */
function project(t, {status = 'effective'} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'detailed-release-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  issueRelease(path.join(root, 'docs'), 'layout-001');
  listing(path.join(root, 'docs'), 'layout-001', ['layout-001'], {'layout-001': status});
  const published = path.join(root, prelim, 'releases/layout-001'), inputs = 'cad/detailed-design/designs/detail-001';
  const receipt = read(path.join(published, 'receipt.json')), ledger = {...read(path.join(published, 'budgets.json')), requirements: {file: 'package-limits.json'}};
  const plan = JSON.stringify({view: 'review/index.html', motion: {file: 'paths.json'}, budgets: {file: 'budgets.json'}});
  write(root, inputs + '/layout.json', plan);
  write(root, inputs + '/receipt.json', {...receipt, planSha256: sha(plan), budgets: {...receipt.budgets}});
  write(root, inputs + '/missions.json', {missionCases: read(path.join(published, 'release.json')).missionCases});
  write(root, inputs + '/paths.json', readFileSync(path.join(published, 'motion.json')));
  write(root, inputs + '/budgets.json', ledger);
  write(root, inputs + '/package-limits.json', readFileSync(path.join(published, 'limits.json')));
  write(root, inputs + '/review/index.html', '<html>Detailed review</html>');
  cpSync(path.join(published, 'review-scene.json.gz'), path.join(root, inputs, 'review/review-scene.json.gz'));
  const replay = () => ({archiveSha256: sha('archive'), stepSha256: receipt.step.sha256, configuration: 'Invented stowed assembly', revision: 'review-r1'});
  const review = (verdict = 'pass', step = receipt.step.sha256) => {
    write(root, 'cad/detailed-design/readiness-result.json', {schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly',
      stepSha256: step, archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict,
      findings: verdict === 'pass' ? [] : [{domain: 'service', status: 'open', subject: 'invented cover', reason: 'removal path not shown'}]});
    return 'cad/detailed-design/readiness-result.json';
  };
  const stage = (options = {}) => stageInProgress({project: root, design: 'detail-001', inputs, preliminary: 'layout-001', authority: 'cad/fusion-authority.json',
    lineage: 'cad/lineage.json', replay, ...options});
  return {root, inputs, receipt, stage, review, index: () => read(path.join(root, detail, 'designs.json'))};
}
const passes = root => assert.deepEqual(checkProject(root, {skipRerun: true}).errors, []);

test('stage publishes an in-progress design that the publication check accepts', t => {
  const p = project(t);
  const index = p.stage();
  assert.deepEqual(index, {schema: 'agent-frc/detailed-design-index@1', preliminaryIndex: '../preliminary-design/releases.json', current: 'detail-001', beside: null,
    designs: ['detail-001'], designStatus: {'detail-001': 'in-progress'}, preliminary: {'detail-001': 'layout-001'}});
  const dir = path.join(p.root, detail, 'designs/detail-001');
  assert.deepEqual(read(path.join(dir, 'design.json')), {schema: 'agent-frc/detailed-design@1', design: 'detail-001', issue: p.receipt.issue,
    preliminary: {release: 'layout-001'}, fusion: {archiveSha256: sha('archive'), stepSha256: p.receipt.step.sha256, configuration: 'Invented stowed assembly', revision: 'review-r1'},
    check: {project: p.inputs, plan: 'layout.json'},
    missionCases: [{case: 'loaded-turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Carry the sample to the bin'}]});
  assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), '<html>Detailed review</html>');
  assert.ok(existsSync(path.join(p.root, detail, 'index.html')), 'the stock catalog is written when the tree has none');
  passes(p.root);
  // The rerun finds the committed inputs through the record.
  write(p.root, 'cad/preliminary-design/releases/layout-001/layout.json', 'plan layout-001');
  const committed = dir => existsSync(path.join(dir, 'receipt.json')) ? path.join(dir, 'receipt.json') : path.join(p.root, prelim, 'releases/layout-001/receipt.json');
  const rerun = checkProject(p.root, {log: () => {}, run: ({project: dir}) => ({...read(committed(dir)), physicsOnly: true})});
  assert.deepEqual(rerun.errors, []);
  assert.equal(rerun.detailed.designs[0].rerun, 'pass');
  // Staging again after a fix replaces the design while it is in progress.
  write(p.root, p.inputs + '/review/index.html', '<html>Corrected review</html>');
  p.stage();
  assert.equal(readFileSync(path.join(dir, 'index.html'), 'utf8'), '<html>Corrected review</html>');
});

test('stage refuses a receipt on another STEP or a preliminary release that is not effective, and leaves the site as it was', t => {
  const p = project(t);
  assert.throws(() => p.stage({replay: () => ({archiveSha256: sha('archive'), stepSha256: sha('another export'), configuration: 'Invented'})}),
    /layout check ran on a STEP other than the registered Fusion export/);
  const q = project(t, {status: 'in-progress'});
  assert.throws(() => q.stage(), /detail-001 must name an effective preliminary release; layout-001 is in-progress/);
  assert.ok(!existsSync(path.join(q.root, detail, 'designs.json')) && !existsSync(path.join(q.root, detail, 'designs/detail-001')));
  assert.throws(() => p.stage({inputs: '../outside'}), /Detailed design input is missing|inside the project/);
});

test('effective is a status change that commits a passing readiness review and supersedes the earlier design', t => {
  const p = project(t);
  p.stage();
  assert.throws(() => markEffective({project: p.root, design: 'detail-001', readiness: p.review('pass', sha('another step'))}), /readiness review is of a different STEP/);
  // A review that does not pass is refused with its findings, and nothing changes.
  assert.throws(() => markEffective({project: p.root, design: 'detail-001', readiness: p.review('open')}),
    /detail-001 cannot be effective: its mechanical-readiness review reports open\n[\s\S]*Findings not passing: 1\n  - service: invented cover: open: removal path not shown/);
  assert.deepEqual(p.index().designStatus, {'detail-001': 'in-progress'});
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/detail-001/readiness.json')));
  const first = markEffective({project: p.root, design: 'detail-001', readiness: p.review('pass')});
  assert.match(first.report, /Showcase eligibility: pass\nFindings not passing: 0/);
  assert.deepEqual(first.designStatus, {'detail-001': 'effective'});
  assert.equal(first.current, 'detail-001');
  assert.equal(read(path.join(p.root, detail, 'designs/detail-001/readiness.json')).showcaseEligibility, 'pass');
  passes(p.root);
  // A design that was never shown in progress is recorded from its review.
  const second = markEffective({project: p.root, design: 'detail-002', readiness: p.review('pass')});
  assert.deepEqual(second.designStatus, {'detail-001': 'superseded', 'detail-002': 'effective'});
  assert.deepEqual(second.supersededBy, {'detail-001': 'detail-002'});
  assert.equal(second.current, 'detail-002');
  assert.deepEqual(read(path.join(p.root, detail, 'designs/detail-002/design.json')).fusion,
    {archiveSha256: sha('archive'), stepSha256: p.receipt.step.sha256, configuration: 'Invented stowed assembly'});
  passes(p.root);
  assert.throws(() => markEffective({project: p.root, design: 'detail-001', readiness: p.review('pass')}), /Only a new or in-progress design can become effective/);
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
    const marked = spawnSync(process.execPath, [script, 'effective', p.root, '--design', 'detail-001', '--readiness', result], {encoding: 'utf8', env});
    assert.equal(marked.status, 0, marked.stderr);
    assert.deepEqual(p.index().designStatus, {'detail-001': 'effective'});
    const checked = checkProject(p.root, {skipRerun: true});
    assert.deepEqual(checked.errors, []);
    assert.match(checked.reports.find(r => /detail-001/.test(r.title)).text, /Showcase eligibility: pass\nFindings not passing: 0/);
    // A failing duty in the same study is refused by the review command and by the status change.
    const study = read(path.join(mechanical, 'readiness-study.json'));
    study.duties.at(-1).max = .7;
    write(mechanical, 'blocked-study.json', study);
    const blocked = spawnSync(py, ['-B', reviewCommand, 'review', mechanical, 'blocked-study.json', '--require-publication', '--output', path.join(mechanical, 'blocked-result.json')], {encoding: 'utf8', env});
    assert.equal(blocked.status, 1, blocked.stderr);
    assert.equal(read(path.join(mechanical, 'blocked-result.json')).showcaseEligibility, 'fail');
    assert.throws(() => markEffective({project: p.root, design: 'detail-002', readiness: 'cad/mechanical/blocked-result.json'}), /detail-002 cannot be effective: its mechanical-readiness review reports fail/);
  });

test('withdraw is a status change: the index keeps the reason and the last commit, and the files leave with no archive', t => {
  const p = project(t);
  p.stage();
  const git = (...args) => execFileSync('git', ['-C', p.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'publish detail-001');
  const published = git('rev-parse', 'HEAD');
  write(p.root, 'notes.md', 'unrelated');
  git('add', '-A'); git('commit', '-q', '-m', 'unrelated');
  assert.throws(() => withdraw({project: p.root, design: 'detail-001'}), /Give the reason/);
  const index = withdraw({project: p.root, design: 'detail-001', reason: 'Invented reason: the carrier changed.'});
  assert.deepEqual(index.designStatus, {'detail-001': 'withdrawn'});
  assert.deepEqual(index.reason, {'detail-001': 'Invented reason: the carrier changed.'});
  assert.deepEqual(index.lastCommit, {'detail-001': published}, 'the commit where the published files can still be read');
  assert.match(git('show', '--stat', '--format=', published), /designs\/detail-001\/design\.json/);
  assert.equal(index.current, null);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/detail-001')) && !existsSync(path.join(p.root, detail, 'archive')));
  passes(p.root);
  assert.throws(() => withdraw({project: p.root, design: 'detail-001', reason: 'again'}), /already withdrawn/);
  assert.throws(() => withdraw({project: p.root, design: 'detail-009', reason: 'x'}), /not in the index/);
});

test('a model published before the index is withdrawn by naming its files', t => {
  const p = project(t);
  write(p.root, 'docs/models/robot.glb', 'invented rough-draft model');
  write(p.root, 'docs/media/robot-still.png', 'invented still');
  const git = (...args) => execFileSync('git', ['-C', p.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'rough draft');
  const published = git('rev-parse', 'HEAD');
  p.stage();
  assert.throws(() => withdraw({project: p.root, design: 'draft-001', reason: 'x', files: 'docs/models/missing.glb'}), /No published file at docs\/models\/missing\.glb/);
  assert.throws(() => withdraw({project: p.root, design: 'draft-001', reason: 'x', files: '../outside.glb'}), /No published file/);
  assert.throws(() => withdraw({project: p.root, design: 'detail-001', reason: 'x', files: 'docs/models/robot.glb'}), /--files applies to a model the index does not list yet/);
  const index = withdraw({project: p.root, design: 'draft-001', reason: 'Invented rough draft from before the status index.', files: 'docs/models/robot.glb, docs/media/robot-still.png'});
  assert.deepEqual(index.designs, ['draft-001', 'detail-001'], 'the earlier model is listed first');
  assert.deepEqual(index.designStatus, {'draft-001': 'withdrawn', 'detail-001': 'in-progress'});
  assert.deepEqual(index.lastCommit, {'draft-001': published});
  assert.equal(index.current, 'detail-001');
  assert.ok(!existsSync(path.join(p.root, 'docs/models/robot.glb')) && !existsSync(path.join(p.root, 'docs/media/robot-still.png')));
  const result = checkProject(p.root, {skipRerun: true});
  assert.deepEqual([result.errors, result.warnings], [[], []]);
});

test('refresh recomputes the primary view of an index edited by hand', t => {
  const p = project(t);
  p.stage();
  write(p.root, detail + '/designs.json', {...p.index(), current: null, beside: 'detail-001'});
  assert.match(checkProject(p.root, {skipRerun: true}).errors.join('\n'), /set current to detail-001 and beside to null/);
  assert.equal(refresh({project: p.root}).current, 'detail-001');
  passes(p.root);
});

test('the command line runs each command and reports a refusal', t => {
  const p = project(t);
  p.stage();
  const run = (...args) => spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
  const effective = run('effective', p.root, '--design', 'detail-001', '--readiness', p.review('pass'));
  assert.equal(effective.status, 0, effective.stderr);
  assert.match(effective.stderr, /Showcase eligibility: pass/);
  assert.equal(JSON.parse(effective.stdout).current, 'detail-001');
  const withdrawn = run('withdraw', p.root, '--design', 'detail-001', '--reason', 'Invented reason.', '--site', 'docs');
  assert.equal(JSON.parse(withdrawn.stdout).designStatus['detail-001'], 'withdrawn');
  const refused = run('withdraw', p.root, '--design', 'detail-001', '--reason', 'again');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already withdrawn[\s\S]*Usage: detailed-design-release\.mjs stage PROJECT/);
});
