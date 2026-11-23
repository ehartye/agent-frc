import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Synthetic teaching fixtures: two invented architectures, "Tilting carriage" and "Swinging arm", each a one-case layout.
async function season(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'design-versions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = path.join(root, 'cad', 'preliminary-design'), site = path.join(root, 'docs', 'preliminary-design');
  await mkdir(author, { recursive: true });
  const script = path.join(author, 'stage.py');
  await writeFile(script, await readFile(fileURLToPath(new URL('../templates/stage-preliminary-review.py', import.meta.url))));
  /** The checked inputs of one release. `step` stands for the STEP the layout was checked on. */
  async function fixture(id, {page = '<html>Review of ' + id + '</html>', step = 'step of ' + id} = {}) {
    const dir = path.join(author, 'releases', id);
    await mkdir(dir, { recursive: true });
    const pin = async (file, content) => {
      await writeFile(path.join(dir, file), content);
      return { file, sha256: createHash('sha256').update(content).digest('hex') };
    };
    const motion = await pin('paths.json', '{"cases":[]}');
    await pin('viewer.html', page);
    await pin('review-scene.json.gz', gzipSync(JSON.stringify({schema: 'agent-frc/preliminary-review-scene@1', issue: 'synthetic-' + id, fieldInteractions: []})));
    const limits = await pin('package-limits.json', '{"inspectionLimitKg":14}');
    const budgets = await pin('budgets.json', JSON.stringify({requirements: limits, masses: [], electricalCases: {}}));
    const plan = await pin('layout.json', JSON.stringify({motion, budgets, view: 'viewer.html'}));
    await pin('receipt.json', JSON.stringify({planSha256: plan.sha256, issue: 'synthetic-' + id, status: 'layout-checked',
      step: {file: 'package.step', sha256: createHash('sha256').update(step).digest('hex')}}));
    await pin('missions.json', JSON.stringify({missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample'}]}));
    return dir;
  }
  const stage = (...args) => spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [script, ...args], {encoding: 'utf8'});
  const listing = path.join(site, 'releases.json');
  const index = async () => JSON.parse((await readFile(listing, 'utf8')).replace(/"\d{4}-\d{2}-\d{2}"/g, '"DATE"'));
  const edit = async change => writeFile(listing, JSON.stringify(change(JSON.parse(await readFile(listing, 'utf8')))));
  const ok = run => { assert.equal(run.status, 0, run.stderr); return run.stdout; };
  return {root, author, site, fixture, stage, index, edit, ok};
}
const rev = number => ({number, date: 'DATE'});

test('a version is staged under MAJOR.MINOR and its architecture is named once', async t => {
  const s = await season(t);
  await s.fixture('1.0');
  assert.match(s.stage('1.0').stderr, /Name design 1 with --design-name "NAME": a short name in words for the architecture/);
  assert.match(s.stage('1.0', '--design-name', ' ').stderr, /Give the design a short name in words/);
  assert.ok(!existsSync(path.join(s.site, 'releases')), 'an unnamed design publishes nothing');
  assert.match(s.ok(s.stage('1.0', '--design-name', 'Tilting  carriage')), /^Staged preliminary design Tilting carriage 1\.0 \(draft 1, in progress\)\r?\n$/);
  assert.deepEqual(await s.index(), {releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, revision: {'1.0': rev(1)},
    designStatus: {'1.0': 'in-progress'}, current: '1.0'});
  const record = JSON.parse(await readFile(path.join(s.site, 'releases', '1.0', 'release.json')));
  assert.deepEqual([record.release, record.check], ['1.0', {project: 'cad/preliminary-design/releases/1.0', plan: 'layout.json'}]);

  // A draft is a publish of the same version: it counts in the index and takes no number. The name is not asked for again.
  await s.fixture('1.0', {page: '<html>Second draft</html>'});
  assert.match(s.ok(s.stage('1.0')), /Revised preliminary design Tilting carriage 1\.0 in place \(draft 2, in progress\)/);
  assert.match(s.ok(s.stage('1.0', '--design-name', 'Tilting carriage')), /Preliminary design Tilting carriage 1\.0 is unchanged \(draft 2\)/);
  assert.deepEqual((await s.index()).revision, {'1.0': rev(2)});
  // The name stays with the architecture.
  assert.match(s.stage('1.0', '--design-name', 'Swinging arm').stderr, /Design 1 is named "Tilting carriage"\. A name stays with its architecture/);
  for (const id of ['1.0.1', '01.0', '1.00', 'One.0']) assert.match(s.stage(id).stderr, /Use a version as the release ID: MAJOR\.MINOR, such as 1\.0/, id);
  assert.match(s.stage('--set-status', '1.0', 'effective', '--design-name', 'x').stderr, /--design-name goes with staging a version/);
});

test('drafts take no number: one in-progress version per architecture, and a new effective minor supersedes the last', async t => {
  const s = await season(t);
  await s.fixture('1.0');
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  // A second in-progress version of the same architecture is a draft under another number.
  await s.fixture('1.1');
  assert.match(s.stage('1.1').stderr, /Tilting carriage 1\.0 is already in progress \(draft 1\)\. Revise it in place: stage 1\.0 again\. A draft takes no number; a new number is for a new effective baseline or a new architecture/);
  assert.ok(!existsSync(path.join(s.site, 'releases', '1.1')));
  assert.deepEqual((await s.index()).releases, ['1.0']);

  // First effective baseline: 1.0. The command says which numbers come next and titles the readiness report.
  const accepted = s.ok(s.stage('--set-status', '1.0', 'effective'));
  assert.match(accepted, /Preliminary design Tilting carriage 1\.0 is effective; the site opens 1\.0/);
  assert.match(accepted, /Work toward the next baseline of Tilting carriage is 1\.1, staged as drafts until it is accepted\. A different architecture is 2\.0 with its own name\./);
  assert.match(accepted, /effective-readiness \S+ --design "Tilting carriage 1\.0"/);
  await s.fixture('1.0', {page: '<html>Edited after acceptance</html>'});
  assert.match(s.stage('1.0').stderr, /Tilting carriage 1\.0 is effective and no longer changes\. Work toward its next baseline is 1\.1, staged as a draft/);

  // An accepted revision: 1.1 is drafted beside the effective 1.0, then supersedes it.
  assert.match(s.ok(s.stage('1.1')), /^Staged preliminary design Tilting carriage 1\.1 \(draft 1, in progress\)\r?\n$/);
  await s.fixture('1.1', {page: '<html>Second draft of 1.1</html>'});
  assert.match(s.ok(s.stage('1.1')), /\(draft 2, in progress\)/);
  assert.deepEqual([(await s.index()).designStatus, (await s.index()).current], [{'1.0': 'effective', '1.1': 'in-progress'}, '1.0']);
  s.ok(s.stage('--set-status', '1.1', 'effective'));
  assert.deepEqual(await s.index(), {releases: ['1.0', '1.1'], designs: {1: {name: 'Tilting carriage'}}, revision: {'1.0': rev(1), '1.1': rev(2)},
    designStatus: {'1.0': 'superseded', '1.1': 'effective'}, accepted: {'1.0': 'DATE', '1.1': 'DATE'}, current: '1.1'});

  // Guidance that does not refuse: a skipped number is staged with a note.
  await s.fixture('1.3');
  assert.match(s.ok(s.stage('1.3')), /Note: the version after 1\.1 is 1\.2; 1\.3 skips a number\./);
  // A version behind one already listed is refused, and so is a second in-progress version made by a status change.
  await s.fixture('1.2');
  s.ok(s.stage('--set-status', '1.3', 'effective'));
  assert.match(s.stage('1.2').stderr, /Version 1\.2 comes before 1\.3, which is already listed\. The next version of Tilting carriage is 1\.4/);
  await s.fixture('1.4');
  s.ok(s.stage('1.4'));
  assert.match(s.stage('--set-status', '1.1', 'in-progress').stderr, /Tilting carriage 1\.4 is already in progress\. One architecture has one in-progress version/);

  // A start-over: a different architecture takes the next major number and its own name.
  await s.fixture('2.0');
  assert.match(s.stage('2.0').stderr, /Name design 2 with --design-name/);
  const restarted = s.ok(s.stage('2.0', '--design-name', 'Swinging arm'));
  assert.match(restarted, /Staged preliminary design Swinging arm 2\.0 \(draft 1, in progress\)/);
  assert.match(restarted, /Note: Tilting carriage 1\.4 is still in progress\. If the team has left that architecture, mark it superseded or withdraw it\./);
  assert.deepEqual((await s.index()).designs, {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}});
  await s.fixture('4.1');
  const skipped = s.ok(s.stage('4.1', '--design-name', 'Swinging arm'));
  assert.match(skipped, /Note: design 2 is also named "Swinging arm"/);
  assert.match(skipped, /Note: the first version of an architecture is 4\.0/);
  assert.match(skipped, /Note: the next architecture after design 2 is 3\.0; 4\.1 skips a number\./);
});

test('an earlier ID is renamed to a version by staging it again and removing the old ID, with no redirect', async t => {
  const s = await season(t);
  // An in-progress release under an earlier ID: stage the same design as 1.0, then remove the old ID.
  await s.fixture('layout-004', {step: 'the carriage'});
  s.ok(s.stage('layout-004'));
  await s.fixture('1.0', {step: 'the carriage'});
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  assert.match(s.stage('--remove', 'layout-009').stderr, /Unknown release: layout-009/);
  assert.match(s.stage('--remove', 'layout-004', '--replaced-by', 'layout-004').stderr, /--replaced-by names a listed release other than the one removed/);
  assert.match(s.stage('1.0', '--replaced-by', 'layout-004').stderr, /--replaced-by goes with --remove/);
  const removed = s.ok(s.stage('--remove', 'layout-004'));
  assert.match(removed, /Removed preliminary release layout-004\. Its folders docs\/preliminary-design\/releases\/layout-004 and cad\/preliminary-design\/releases\/layout-004 are deleted and no redirect is left/);
  assert.ok(!existsSync(path.join(s.site, 'releases', 'layout-004')) && !existsSync(path.join(s.author, 'releases', 'layout-004')));
  assert.deepEqual(await s.index(), {releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, revision: {'1.0': rev(1)},
    designStatus: {'1.0': 'in-progress'}, current: '1.0'});
  // Removing the last version of an architecture frees its number and name; an empty index names no current release.
  s.ok(s.stage('--remove', '1.0'));
  assert.deepEqual(await s.index(), {releases: []});

  // An effective release under an earlier ID is removed only once the same STEP is effective under the new ID.
  await s.fixture('layout-004', {step: 'the carriage'});
  s.ok(s.stage('layout-004'));
  s.ok(s.stage('--set-status', 'layout-004', 'effective'));
  await s.edit(i => ({...i, accepted: {'layout-004': '2001-02-03'}}));
  assert.match(s.stage('--remove', 'layout-004').stderr, /Preliminary release layout-004 is or was the effective design\. Remove it only to rename it/);
  await s.fixture('1.0', {step: 'a changed carriage'});
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  assert.match(s.stage('--remove', 'layout-004', '--replaced-by', '1.0').stderr, /Release 1\.0 is in-progress\. Mark it effective before it replaces layout-004/);
  s.ok(s.stage('--set-status', '1.0', 'effective'));
  assert.equal((await s.index()).designStatus['layout-004'], 'superseded');
  assert.match(s.stage('--remove', 'layout-004').stderr, /is or was the effective design/, 'a superseded baseline that was accepted is guarded too');
  assert.match(s.stage('--remove', 'layout-004', '--replaced-by', '1.0').stderr, /checked on different STEP files/);
  assert.ok(existsSync(path.join(s.site, 'releases', 'layout-004', 'receipt.json')), 'a refused removal deletes nothing');
});

test('an effective release is renamed once the same STEP is effective under its version', async t => {
  const s = await season(t);
  await s.fixture('layout-004', {step: 'the carriage'});
  s.ok(s.stage('layout-004'));
  s.ok(s.stage('--set-status', 'layout-004', 'effective'));
  await s.edit(i => ({...i, accepted: {'layout-004': '2001-02-03'}}));
  await s.fixture('1.0', {step: 'the carriage'});
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  s.ok(s.stage('--set-status', '1.0', 'effective'));
  await mkdir(path.join(s.root, 'docs', 'detailed-design'), {recursive: true});
  await writeFile(path.join(s.root, 'docs', 'detailed-design', 'designs.json'), JSON.stringify({preliminary: {'detail-001': 'layout-004'}}));
  const renamed = s.ok(s.stage('--remove', 'layout-004', '--replaced-by', '1.0'));
  assert.match(renamed, /Removed preliminary release layout-004, replaced by preliminary design Tilting carriage 1\.0\./);
  assert.match(renamed, /Note: detailed design detail-001 names preliminary release layout-004\. Stage it again with --preliminary 1\.0\./);
  const after = JSON.parse(await readFile(path.join(s.site, 'releases.json'), 'utf8'));
  assert.deepEqual(after, {releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, revision: after.revision,
    designStatus: {'1.0': 'effective'}, accepted: {'1.0': '2001-02-03'}, current: '1.0'});
  assert.ok(!JSON.stringify(after).includes('layout-004'), 'the index keeps no trace of the old ID');
  assert.ok(!existsSync(path.join(s.site, 'releases', 'layout-004')) && !existsSync(path.join(s.author, 'releases', 'layout-004')));
});

test('the inputs of a release are copied to a new release folder with their pins written for the new paths', async t => {
  const s = await season(t), sha = bytes => createHash('sha256').update(bytes).digest('hex');
  // A release checked from the repository root: its records name their own folder in every pin.
  const old = 'cad/preliminary-design/releases/layout-004/', dir = path.join(s.root, old);
  await mkdir(path.join(dir, 'field'), {recursive: true});
  const put = async (name, content) => { await writeFile(path.join(dir, name), content); return {file: old + name, sha256: sha(content)}; };
  const step = await put('package.step', 'invented solid');
  const motion = await put('paths.json', JSON.stringify({step, cases: []}));
  const held = await put('held.json', JSON.stringify({schema: 'agent-frc/preliminary-layout-result@1', step}));
  await put('field/lane.html', '<html>Invented lane</html>');
  await put('layout.json', JSON.stringify({step, motion, view: old + 'viewer.html', outside: {file: 'README.md', sha256: 'f'.repeat(64)}}));
  await put('missions.json', JSON.stringify({missionCases: [], trial: step}));
  for (const name of ['viewer.html', 'review-scene.json.gz', 'receipt.json']) await put(name, 'written by the check for the old folder');

  const copied = s.ok(s.stage('--copy-inputs', 'layout-004', '1.0'));
  assert.match(copied, /Copied the inputs of release layout-004 to cad\/preliminary-design\/releases\/1\.0 and wrote 3 pinning records for the new paths\. The STEP is unchanged\./);
  assert.match(copied, /preliminary-check \. cad\/preliminary-design\/releases\/1\.0\/layout\.json --write-view --require-checked --output cad\/preliminary-design\/releases\/1\.0\/receipt\.json/);
  const fresh = 'cad/preliminary-design/releases/1.0/', at = name => path.join(s.root, fresh, name), json = async name => JSON.parse(await readFile(at(name), 'utf8'));
  for (const name of ['viewer.html', 'review-scene.json.gz', 'receipt.json']) assert.ok(!existsSync(at(name)), name + ' is left for the layout check to write');
  assert.equal(await readFile(at('package.step'), 'utf8'), 'invented solid');
  assert.equal(await readFile(at('field/lane.html'), 'utf8'), '<html>Invented lane</html>');
  assert.equal(sha(await readFile(at('held.json'))), held.sha256, 'a held receipt is evidence of an earlier check and keeps its bytes');
  const plan = await json('layout.json'), paths = await json('paths.json');
  assert.deepEqual(paths.step, {file: fresh + 'package.step', sha256: step.sha256});
  assert.deepEqual(plan.step, paths.step);
  assert.deepEqual(plan.motion, {file: fresh + 'paths.json', sha256: sha(await readFile(at('paths.json')))}, 'a rewritten record is pinned by its new digest');
  assert.notEqual(plan.motion.sha256, motion.sha256);
  assert.equal(plan.view, fresh + 'viewer.html');
  assert.deepEqual(plan.outside, {file: 'README.md', sha256: 'f'.repeat(64)}, 'a pin outside the release folder is left as it is');
  assert.deepEqual((await json('missions.json')).trial, paths.step);
  assert.ok(existsSync(path.join(dir, 'receipt.json')), 'the source release is untouched');

  // An existing folder is not overwritten, and a pin that was already stale is not given a fresh digest.
  assert.match(s.stage('--copy-inputs', 'layout-004', '1.0').stderr, /cad\/preliminary-design\/releases\/1\.0 already exists/);
  await writeFile(path.join(dir, 'package.step'), 'a changed solid');
  assert.match(s.stage('--copy-inputs', 'layout-004', '2.0').stderr, /pins cad\/preliminary-design\/releases\/layout-004\/package\.step, which is missing or differs from its pinned SHA-256\. Resolve it in release layout-004 before copying/);
  assert.ok(!existsSync(path.join(s.author, 'releases', '2.0')), 'a refused copy leaves no folder');
  assert.match(s.stage('--copy-inputs', 'absent', '2.0').stderr, /No layout plan at cad\/preliminary-design\/releases\/absent\/layout\.json/);
});

test('the view of an effective release is republished while its receipt records the same physics', async t => {
  const s = await season(t), published = name => readFile(path.join(s.site, 'releases', '1.0', name), 'utf8');
  await s.fixture('1.0');
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  // A draft is revised by staging it again; the refresh is for the release that no longer changes.
  assert.match(s.stage('--refresh-view', '1.0').stderr, /--refresh-view republishes the view of the effective release\. Preliminary design Tilting carriage 1\.0 is in-progress; stage it to publish or revise it: stage\.py 1\.0/);
  s.ok(s.stage('--set-status', '1.0', 'effective'));
  const before = await readFile(path.join(s.site, 'releases.json'), 'utf8');
  // A rebuilt review page on the same STEP: published, and the index keeps its status, accepted date and draft count.
  await s.fixture('1.0', {page: '<html>Rebuilt review of 1.0</html>'});
  assert.match(s.stage('1.0').stderr, /Tilting carriage 1\.0 is effective and no longer changes/);
  assert.match(s.ok(s.stage('--refresh-view', '1.0')), /^Refreshed the view of preliminary design Tilting carriage 1\.0 \(effective\)\. Its physics, status and accepted date are unchanged\r?\n$/);
  assert.equal(await published('index.html'), '<html>Rebuilt review of 1.0</html>');
  assert.equal(await readFile(path.join(s.site, 'releases.json'), 'utf8'), before);
  assert.match(s.ok(s.stage('--refresh-view', '1.0')), /Preliminary design Tilting carriage 1\.0 is unchanged \(effective\)/);
  // A receipt of another STEP is a changed design: refused, with the version that work belongs to, and nothing is published.
  await s.fixture('1.0', {page: '<html>Review of a changed design</html>', step: 'a changed step'});
  assert.match(s.stage('--refresh-view', '1.0').stderr,
    /Tilting carriage 1\.0 is effective and this receipt differs from the published one in the STEP\. A view refresh keeps the physics\. Work that changes it belongs to 1\.1, staged as a draft/);
  assert.equal(await published('index.html'), '<html>Rebuilt review of 1.0</html>');
  assert.equal(await readFile(path.join(s.site, 'releases.json'), 'utf8'), before);
  assert.match(s.stage('--refresh-view', '1.0', '--design-name', 'Another name').stderr, /a view refresh changes no name/);
});
