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

// Synthetic teaching fixture: an invented layout with one case and one objective.
test('the season script publishes a checked release, records where its inputs are and sets design statuses', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'preliminary-releases-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = path.join(root, 'cad', 'preliminary-design');
  const site = path.join(root, 'docs', 'preliminary-design');
  await mkdir(author, { recursive: true });
  const script = path.join(author, 'stage.py');
  await writeFile(script, await readFile(fileURLToPath(new URL('../templates/stage-preliminary-review.py', import.meta.url))));
  async function fixture(id, {receipt = {}, scene: shown = {}, page = '<html>Project review of ' + id + '</html>'} = {}) {
    const dir = path.join(author, 'releases', id);
    await mkdir(path.join(dir, 'field'), { recursive: true });
    async function pin(file, content) {
      await writeFile(path.join(dir, file), content);
      return { file, sha256: createHash('sha256').update(content).digest('hex') };
    }
    const motion = await pin('paths.json', '{"cases":[]}');
    await pin('viewer.html', page);
    const trial = await pin('lane-trial.json', '{"case":"turn"}');
    await pin('field/lane.html', '<html>Invented lane</html>');
    await pin('review-scene.json.gz', gzipSync(JSON.stringify({schema: 'agent-frc/preliminary-review-scene@1', issue: 'synthetic-' + id, fieldInteractions: [], ...shown})));
    const limits = await pin('package-limits.json', '{"inspectionLimitKg":14}');
    const budgets = await pin('budgets.json', JSON.stringify({requirements: limits, masses: [], electricalCases: {}}));
    const plan = await pin('layout.json', JSON.stringify({motion, budgets, view: 'viewer.html'}));
    await pin('receipt.json', JSON.stringify({planSha256: plan.sha256, issue: 'synthetic-' + id, status: 'layout-checked', ...receipt}));
    await pin('missions.json', JSON.stringify({missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample'}]}));
    return {dir, trial};
  }
  const stage = (...args) => spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [script, ...args], {encoding: 'utf8'});
  const listing = path.join(site, 'releases.json'), index = async () => JSON.parse((await readFile(listing, 'utf8')).replace(/"\d{4}-\d{2}-\d{2}"/g, '"DATE"'));
  const rev = number => ({number, date: 'DATE'});

  // Staging refuses what the publication check would refuse for an obvious reason.
  const a = await fixture('a');
  await writeFile(path.join(a.dir, 'missions.json'), JSON.stringify({missionCases: []}));
  assert.match(stage('a').stderr, /mission-task case/);
  await fixture('a', {receipt: {status: 'provisional'}});
  assert.match(stage('a').stderr, /layout-checked receipt of a full check/);
  await fixture('a', {receipt: {physicsOnly: true}});
  assert.match(stage('a').stderr, /layout-checked receipt of a full check/);
  await fixture('a', {receipt: {planSha256: 'f'.repeat(64)}});
  assert.match(stage('a').stderr, /receipt belongs to a different layout/);
  await fixture('a');
  await rm(path.join(a.dir, 'review-scene.json.gz'));
  assert.match(stage('a').stderr, /Generate the review with --write-view/);
  assert.ok(!existsSync(path.join(site, 'releases', 'a')), 'a refused release publishes nothing');

  // A project's own review page is published as it is.
  await fixture('a', {page: '<html>Our own review page</html>'});
  const staged = stage('a');
  assert.equal(staged.status, 0, staged.stderr);
  assert.match(staged.stdout, /Staged preliminary release a \(in-progress, revision 1\)/);
  assert.equal(await readFile(path.join(site, 'releases', 'a', 'index.html'), 'utf8'), '<html>Our own review page</html>');
  assert.deepEqual(JSON.parse(await readFile(path.join(site, 'releases', 'a', 'release.json'))), {
    schema: 'agent-frc/preliminary-release@1', release: 'a', issue: 'synthetic-a', phase: 'preliminary-design',
    check: {project: 'cad/preliminary-design/releases/a', plan: 'layout.json'},
    missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample'}]});
  for (const name of ['receipt.json', 'review-scene.json.gz', 'motion.json', 'budgets.json', 'limits.json'])
    assert.ok(existsSync(path.join(site, 'releases', 'a', name)), name);
  assert.deepEqual(await index(), {releases: ['a'], revision: {a: rev(1)}, designStatus: {a: 'in-progress'}, current: 'a'});

  // A field player the review links ships with the trial behind it.
  const b = await fixture('b', {scene: {fieldInteractions: [{title: 'Invented lane', href: 'field/lane.html', objective: 'Move the sample', evidence: {file: 'lane-trial.json'}}]}});
  assert.equal(stage('b').status, 0);
  assert.deepEqual(JSON.parse(await readFile(path.join(site, 'releases', 'b', 'release.json'))).fieldPlayers,
    [{file: 'field/lane.html', trial: {file: 'lane-trial.json'}, objective: 'Move the sample'}]);
  assert.equal(await readFile(path.join(site, 'releases', 'b', 'field', 'lane.html'), 'utf8'), '<html>Invented lane</html>');
  assert.ok(existsSync(path.join(site, 'releases', 'b', b.trial.file)));
  assert.deepEqual(await index(), {releases: ['a', 'b'], revision: {a: rev(1), b: rev(1)}, designStatus: {a: 'in-progress', b: 'in-progress'}, current: 'b'});

  // An in-progress release is revised in place: the same ID, no new entry, and a revision counted in the index.
  await fixture('a', {page: '<html>Corrected page</html>'});
  assert.match(stage('a').stdout, /Revised preliminary release a in place \(in-progress, revision 2\)/);
  assert.equal(await readFile(path.join(site, 'releases', 'a', 'index.html'), 'utf8'), '<html>Corrected page</html>');
  assert.deepEqual((await index()).releases, ['a', 'b']);
  assert.deepEqual((await index()).revision, {a: rev(2), b: rev(1)});
  // Staging the same files again changes nothing and counts nothing.
  const before = await readFile(listing, 'utf8');
  assert.match(stage('a').stdout, /Preliminary release a is unchanged \(revision 2\)/);
  assert.equal(await readFile(listing, 'utf8'), before);
  // An index written before revisions were counted starts the count at the release it already published.
  await writeFile(listing, JSON.stringify({...JSON.parse(before), revision: undefined}));
  await fixture('b', {page: '<html>Edited b</html>'});
  assert.match(stage('b').stdout, /Revised preliminary release b in place \(in-progress, revision 2\)/);
  await writeFile(listing, JSON.stringify({...JSON.parse(before), revision: {a: {number: 2, date: '2000-01-01'}, b: {number: 2, date: '2000-01-01'}}}));

  // Status changes edit the index only. An effective release supersedes the one that was; the site opens the effective one.
  assert.equal(stage('--set-status', 'a', 'effective').status, 0);
  const counted = {a: rev(2), b: rev(2)};
  assert.deepEqual(await index(), {releases: ['a', 'b'], revision: counted, designStatus: {a: 'effective', b: 'in-progress'}, accepted: {a: 'DATE'}, current: 'a'});
  // An effective release no longer changes.
  await fixture('a', {page: '<html>Edited after acceptance</html>'});
  assert.match(stage('a').stderr, /Release a is effective and no longer changes\. Only an in-progress release is revised in place; publish the design that follows it under a new release ID/);
  assert.equal(await readFile(path.join(site, 'releases', 'a', 'index.html'), 'utf8'), '<html>Corrected page</html>');
  const promoted = stage('--set-status', 'b', 'effective');
  assert.equal(promoted.status, 0, promoted.stderr);
  assert.match(promoted.stdout, /Preliminary release b is effective; the site opens b/);
  assert.match(promoted.stdout, /effective-readiness/, 'the reviewer is pointed at the readiness report');
  assert.deepEqual(await index(), {releases: ['a', 'b'], revision: counted, designStatus: {a: 'superseded', b: 'effective'}, accepted: {a: 'DATE', b: 'DATE'}, current: 'b'});
  assert.ok(existsSync(path.join(site, 'releases', 'a', 'receipt.json')), 'superseding a release keeps its published files');
  assert.match(stage('--set-status', 'b', 'paused').stderr, /in-progress, effective, superseded, withdrawn/);
  assert.match(stage('--set-status', 'zzz', 'effective').stderr, /Unknown release/);

  // A withdrawal is a status change with a reason. The index keeps the last commit that held the published files,
  // the files leave the site and the checked inputs stay.
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'publish');
  const published = git('rev-parse', 'HEAD');
  assert.match(stage('--set-status', 'b', 'withdrawn').stderr, /Give the reason for a withdrawal with --reason/);
  assert.match(stage('--set-status', 'a', 'effective', '--reason', 'x').stderr, /--reason applies to a withdrawal/);
  const withdrawn = stage('--set-status', 'b', 'withdrawn', '--reason', 'Invented reason: the lane moved.');
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  assert.deepEqual(await index(), {releases: ['a', 'b'], revision: counted, designStatus: {a: 'superseded', b: 'withdrawn'}, accepted: {a: 'DATE', b: 'DATE'},
    reason: {b: 'Invented reason: the lane moved.'}, lastCommit: {b: published}, current: 'a'});
  assert.ok(!existsSync(path.join(site, 'releases', 'b')), 'the published files leave the site; nothing is archived there');
  assert.ok(existsSync(path.join(author, 'releases', 'b', 'layout.json')), 'the checked inputs stay');
  assert.match(stage('b').stderr, /Release b is withdrawn and no longer changes/);
  assert.match(stage('a').stderr, /Release a is superseded and no longer changes/);

  // An in-progress release that a later release replaced is marked superseded directly; the site keeps opening the later one.
  await fixture('c');
  await fixture('d');
  assert.equal(stage('c').status, 0);
  // A revision staged inside a Git checkout records the commit it was staged from.
  assert.deepEqual((await index()).revision.c, {number: 1, date: 'DATE', commit: published});
  assert.equal(stage('d').status, 0);
  assert.equal(stage('--set-status', 'c', 'superseded').status, 0);
  assert.deepEqual([(await index()).designStatus.c, (await index()).designStatus.d, (await index()).current], ['superseded', 'in-progress', 'd']);
  assert.ok(existsSync(path.join(site, 'releases', 'c', 'receipt.json')));
});
