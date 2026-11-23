/**
 * @lane merge
 * @subject scripts/stage_preliminary_review.py
 * @subject scripts/stage-gate.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// The staging command is the plugin's: an agent runs it from the plugin and names the project's design folder.
const stagingCommand = fileURLToPath(new URL('../scripts/stage_preliminary_review.py', import.meta.url));
// These invented releases hold no solid, so the layout check of the stage gate is stood in for: it reproduces the receipt.
const gateCheck = fileURLToPath(new URL('./fixtures/gate-reproduces.mjs', import.meta.url));
// Synthetic teaching fixture: an invented layout with one case and one objective.
test('the season script publishes a checked release, records where its inputs are and sets design statuses', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'preliminary-releases-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = path.join(root, 'cad', 'preliminary-design');
  const site = path.join(root, 'docs', 'preliminary-design');
  await mkdir(author, { recursive: true });
  async function fixture(id, {receipt = {}, scene: shown = {}, page = '<html>Project review of ' + id + '</html>'} = {}) {
    const dir = path.join(author, 'releases', id);
    await mkdir(dir, { recursive: true });
    async function pin(file, content) {
      await writeFile(path.join(dir, file), content);
      return { file, sha256: createHash('sha256').update(content).digest('hex') };
    }
    const motion = await pin('design.json', '{"cases":[]}');
    await pin('viewer.html', page);
    await pin('review-scene.json.gz', gzipSync(JSON.stringify({schema: 'agent-frc/preliminary-review-scene@1', issue: 'synthetic-' + id, ...shown})));
    const limits = await pin('package-limits.json', '{"inspectionLimitKg":14}');
    const budgets = await pin('budgets.json', JSON.stringify({requirements: limits, masses: [], electricalCases: {}}));
    const plan = await pin('judgement.json', JSON.stringify({source: motion, budgets, view: 'viewer.html'}));
    await pin('receipt.json', JSON.stringify({schema: 'agent-frc/preliminary-layout-result@1', missingInputs: [], reopen: [], cases: [{case: 'turn', status: 'pass'}], control: {witness: {status: 'fail'}},
      budgets: {massStatus: 'pass', electricalCases: [{case: 'weak', status: 'pass'}]}, planSha256: plan.sha256, issue: 'synthetic-' + id, status: 'layout-checked', ...receipt}));
    await pin('missions.json', JSON.stringify({missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample'}]}));
    return {dir};
  }
  const stage = (...args) => spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [stagingCommand, '--base', author, ...args, ...(args.includes('effective') ? ['--gate-check', gateCheck] : [])], {encoding: 'utf8'});
  const listing = path.join(site, 'releases.json'), index = async () => JSON.parse((await readFile(listing, 'utf8')).replace(/"\d{4}-\d{2}-\d{2}"/g, '"DATE"'));
  const rev = number => ({number, date: 'DATE'});
  const designs = {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}};

  // Staging refuses what the publication check would refuse for an obvious reason.
  const a = await fixture('1.0');
  await writeFile(path.join(a.dir, 'missions.json'), JSON.stringify({missionCases: []}));
  assert.match(stage('1.0').stderr, /mission-task case/);
  await fixture('1.0', {receipt: {status: 'provisional'}});
  assert.match(stage('1.0').stderr, /layout-checked receipt of a full check/);
  await fixture('1.0', {receipt: {physicsOnly: true}});
  assert.match(stage('1.0').stderr, /layout-checked receipt of a full check/);
  await fixture('1.0', {receipt: {planSha256: 'f'.repeat(64)}});
  assert.match(stage('1.0').stderr, /receipt belongs to a different layout/);
  await fixture('1.0');
  await rm(path.join(a.dir, 'review-scene.json.gz'));
  assert.match(stage('1.0').stderr, /Generate the review with --write-view/);
  assert.ok(!existsSync(path.join(site, 'releases', '1.0')), 'a refused release publishes nothing');

  // A project's own review page is published as it is.
  await fixture('1.0', {page: '<html>Our own review page</html>'});
  const staged = stage('1.0', '--design-name', 'Tilting carriage');
  assert.equal(staged.status, 0, staged.stderr);
  assert.match(staged.stdout, /Staged preliminary design Tilting carriage 1\.0 \(draft 1, in progress\)/);
  assert.equal(await readFile(path.join(site, 'releases', '1.0', 'index.html'), 'utf8'), '<html>Our own review page</html>');
  assert.deepEqual(JSON.parse(await readFile(path.join(site, 'releases', '1.0', 'release.json'))), {
    schema: 'agent-frc/preliminary-release@1', release: '1.0', issue: 'synthetic-1.0', phase: 'preliminary-design',
    check: {project: 'cad/preliminary-design/releases/1.0'},
    missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample'}]});
  for (const name of ['receipt.json', 'review-scene.json.gz', 'design.json', 'budgets.json', 'limits.json'])
    assert.ok(existsSync(path.join(site, 'releases', '1.0', name)), name);
  assert.deepEqual(await index(), {releases: ['1.0'], designs: {1: designs[1]}, revision: {'1.0': rev(1)}, designStatus: {'1.0': 'in-progress'}, current: '1.0'});

  // A second architecture takes the next major number and its own name.
  await fixture('2.0');
  assert.equal(stage('2.0', '--design-name', 'Swinging arm').status, 0);
  assert.deepEqual(await index(), {releases: ['1.0', '2.0'], designs, revision: {'1.0': rev(1), '2.0': rev(1)}, designStatus: {'1.0': 'in-progress', '2.0': 'in-progress'}, current: '2.0'});

  // An in-progress release is revised in place: the same ID, no new entry, and a revision counted in the index.
  await fixture('1.0', {page: '<html>Corrected page</html>'});
  assert.match(stage('1.0').stdout, /Revised preliminary design Tilting carriage 1\.0 in place \(draft 2, in progress\)/);
  assert.equal(await readFile(path.join(site, 'releases', '1.0', 'index.html'), 'utf8'), '<html>Corrected page</html>');
  assert.deepEqual((await index()).releases, ['1.0', '2.0']);
  assert.deepEqual((await index()).revision, {'1.0': rev(2), '2.0': rev(1)});
  // Staging the same files again changes nothing and counts nothing.
  const before = await readFile(listing, 'utf8');
  assert.match(stage('1.0').stdout, /Preliminary design Tilting carriage 1\.0 is unchanged \(draft 2\)/);
  assert.equal(await readFile(listing, 'utf8'), before);
  // An index written before revisions were counted starts the count at the release it already published.
  await writeFile(listing, JSON.stringify({...JSON.parse(before), revision: undefined}));
  await fixture('2.0', {page: '<html>Edited b</html>'});
  assert.match(stage('2.0').stdout, /Revised preliminary design Swinging arm 2\.0 in place \(draft 2, in progress\)/);
  await writeFile(listing, JSON.stringify({...JSON.parse(before), revision: {'1.0': {number: 2, date: '2000-01-01'}, '2.0': {number: 2, date: '2000-01-01'}}}));

  // Status changes edit the index only. An effective release supersedes the one that was; the site opens the effective one.
  assert.equal(stage('--set-status', '1.0', 'effective').status, 0);
  const counted = {'1.0': rev(2), '2.0': rev(2)};
  assert.deepEqual(await index(), {releases: ['1.0', '2.0'], designs, revision: counted, designStatus: {'1.0': 'effective', '2.0': 'in-progress'}, accepted: {'1.0': 'DATE'}, current: '1.0'});
  // An effective release no longer changes.
  await fixture('1.0', {page: '<html>Edited after acceptance</html>'});
  assert.match(stage('1.0').stderr, /Tilting carriage 1\.0 is effective and no longer changes\. Work toward its next baseline is 1\.1, staged as a draft/);
  assert.equal(await readFile(path.join(site, 'releases', '1.0', 'index.html'), 'utf8'), '<html>Corrected page</html>');
  const promoted = stage('--set-status', '2.0', 'effective');
  assert.equal(promoted.status, 0, promoted.stderr);
  assert.match(promoted.stdout, /Preliminary design Swinging arm 2\.0 is effective; the site opens 2\.0/);
  assert.match(promoted.stdout, /Effective-readiness report for Swinging arm 2\.0 \(synthetic-2\.0\)/, 'the reviewer is shown the readiness report of the installed plugin');
  assert.match(promoted.stdout, /^\[gate\] Preliminary design Swinging arm 2\.0: the full layout check ran on the committed design and reproduced the published receipt in \d+ s/m, 'the command reports the gate it just ran');
  assert.match(promoted.stdout, /On push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/, 'the command says what a push will do');
  assert.deepEqual(await index(), {releases: ['1.0', '2.0'], designs, revision: counted, designStatus: {'1.0': 'superseded', '2.0': 'effective'}, accepted: {'1.0': 'DATE', '2.0': 'DATE'}, current: '2.0'});
  assert.ok(existsSync(path.join(site, 'releases', '1.0', 'receipt.json')), 'superseding a release keeps its published files');
  assert.match(stage('--set-status', '2.0', 'paused').stderr, /in-progress, effective, superseded, withdrawn/);
  assert.match(stage('--set-status', '9.0', 'effective').stderr, /Unknown release/);

  // A withdrawal is a status change with a reason. The index keeps the last commit that held the published files,
  // the files leave the site and the checked inputs stay.
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'publish');
  const published = git('rev-parse', 'HEAD');
  assert.match(stage('--set-status', '2.0', 'withdrawn').stderr, /Give the reason for a withdrawal with --reason/);
  assert.match(stage('--set-status', '1.0', 'effective', '--reason', 'x').stderr, /--reason applies to a withdrawal/);
  const withdrawn = stage('--set-status', '2.0', 'withdrawn', '--reason', 'Invented reason: the lane moved.');
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  assert.deepEqual(await index(), {releases: ['1.0', '2.0'], designs, revision: counted, designStatus: {'1.0': 'superseded', '2.0': 'withdrawn'}, accepted: {'1.0': 'DATE', '2.0': 'DATE'},
    reason: {'2.0': 'Invented reason: the lane moved.'}, lastCommit: {'2.0': published}, current: '1.0'});
  assert.ok(!existsSync(path.join(site, 'releases', '2.0')), 'the published files leave the site; nothing is archived there');
  assert.ok(existsSync(path.join(author, 'releases', '2.0', 'judgement.json')), 'the checked inputs stay');
  assert.match(stage('2.0').stderr, /Swinging arm 2\.0 is withdrawn and no longer changes/);
  assert.match(stage('1.0').stderr, /Tilting carriage 1\.0 is superseded and no longer changes/);

  // An in-progress release that a later release replaced is marked superseded directly; the site keeps opening the later one.
  await fixture('3.0');
  await fixture('4.0');
  assert.equal(stage('3.0', '--design-name', 'Sliding gate').status, 0);
  // A revision staged inside a Git checkout records the commit it was staged from.
  assert.deepEqual((await index()).revision['3.0'], {number: 1, date: 'DATE', commit: published});
  assert.equal(stage('4.0', '--design-name', 'Rolling cradle').status, 0);
  assert.equal(stage('--set-status', '3.0', 'superseded').status, 0);
  assert.deepEqual([(await index()).designStatus['3.0'], (await index()).designStatus['4.0'], (await index()).current], ['superseded', 'in-progress', '4.0']);
  assert.ok(existsSync(path.join(site, 'releases', '3.0', 'receipt.json')));
});
