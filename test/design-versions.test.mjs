/**
 * @lane merge
 * @subject scripts/stage_preliminary_review.py
 * @subject scripts/stage-gate.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inputsOf, paged, writeInputs } from './fixtures/preliminary-release.mjs';

// The staging command is the plugin's: an agent runs it from the plugin and names the project's design folder. These
// invented releases hold no solid, so the layout judgement is stood in for.
const stagingCommand = fileURLToPath(new URL('./fixtures/stage_stand_in.py', import.meta.url));
// Synthetic teaching fixtures: two invented architectures, "Tilting carriage" and "Swinging arm", each a one-case layout.
async function season(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'design-versions-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = path.join(root, 'cad', 'preliminary-design'), site = path.join(root, 'docs', 'preliminary-design');
  await mkdir(author, { recursive: true });
  /** The measured inputs of one release with its page. `step` stands for the part its records are of. */
  async function fixture(id, {page = '<html>Review of ' + id + '</html>', step = 'step of ' + id} = {}) {
    writeInputs(root, inputsOf(id), {issue: 'synthetic-' + id, page, step});
    return path.join(root, inputsOf(id));
  }
  const stage = (...args) => spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', stagingCommand, '--base', author, ...args], {encoding: 'utf8'});
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
  assert.match(s.ok(s.stage('1.0', '--design-name', 'Tilting  carriage')), /^Staged preliminary design Tilting carriage 1\.0 \(draft 1, in progress\)\r?\nBefore pushing, run the publication check: node PLUGIN\/scripts\/design-publication\.mjs check \.\r?\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  assert.deepEqual(await s.index(), {releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, revision: {'1.0': rev(1)},
    designStatus: {'1.0': 'in-progress'}, current: '1.0'});
  const record = JSON.parse(await readFile(path.join(s.site, 'releases', '1.0', 'release.json')));
  assert.deepEqual([record.release, record.check], ['1.0', {project: 'cad/preliminary-design/releases/1.0'}]);

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
  assert.match(accepted, /Effective-readiness report for Tilting carriage 1\.0 \(/);
  assert.match(accepted, /^\[gate\] Preliminary design Tilting carriage 1\.0: layout-checked on 5 current records, 3 of 3 readiness criteria met, in \d+\.\d s \(status 1\.0 s of it\)\. Nothing was measured\.$/m);
  assert.match(accepted, /On push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  await s.fixture('1.0', {page: '<html>Edited after acceptance</html>'});
  assert.match(s.stage('1.0').stderr, /Tilting carriage 1\.0 is effective and no longer changes\. Work toward its next baseline is 1\.1, staged as a draft/);

  // An accepted revision: 1.1 is drafted beside the effective 1.0, then supersedes it.
  assert.match(s.ok(s.stage('1.1')), /^Staged preliminary design Tilting carriage 1\.1 \(draft 1, in progress\)\r?\nBefore pushing, run the publication check: node PLUGIN\/scripts\/design-publication\.mjs check \.\r?\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
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

test('a release is removed after its design is staged under another ID, with no redirect', async t => {
  const s = await season(t);
  // An in-progress release: stage the same design as 2.0, then remove 1.0.
  await s.fixture('1.0', {step: 'the carriage'});
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  await s.fixture('2.0', {step: 'the carriage'});
  s.ok(s.stage('2.0', '--design-name', 'Swinging arm'));
  assert.match(s.stage('--remove', '9.0').stderr, /Unknown release: 9\.0/);
  assert.match(s.stage('--remove', '1.0', '--replaced-by', '1.0').stderr, /--replaced-by names a listed release other than the one removed/);
  assert.match(s.stage('2.0', '--replaced-by', '1.0').stderr, /--replaced-by goes with --remove/);
  const removed = s.ok(s.stage('--remove', '1.0'));
  assert.match(removed, /Removed preliminary design Tilting carriage 1\.0\. Its folders docs\/preliminary-design\/releases\/1\.0 and cad\/preliminary-design\/releases\/1\.0 are deleted and no redirect is left/);
  assert.ok(!existsSync(path.join(s.site, 'releases', '1.0')) && !existsSync(path.join(s.author, 'releases', '1.0')));
  // Removing the last version of an architecture frees its number and name.
  assert.deepEqual(await s.index(), {releases: ['2.0'], designs: {2: {name: 'Swinging arm'}}, revision: {'2.0': rev(1)},
    designStatus: {'2.0': 'in-progress'}, current: '2.0'});
  // An empty index names no current release.
  s.ok(s.stage('--remove', '2.0'));
  assert.deepEqual(await s.index(), {releases: []});

  // An effective release is removed only once the same design is effective under the new ID.
  await s.fixture('1.0', {step: 'the carriage'});
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  s.ok(s.stage('--set-status', '1.0', 'effective'));
  await s.edit(i => ({...i, accepted: {'1.0': '2001-02-03'}}));
  assert.match(s.stage('--remove', '1.0').stderr, /Preliminary design Tilting carriage 1\.0 is or was the effective design\. Remove it only to rename it/);
  await s.fixture('2.0', {step: 'a changed carriage'});
  s.ok(s.stage('2.0', '--design-name', 'Swinging arm'));
  assert.match(s.stage('--remove', '1.0', '--replaced-by', '2.0').stderr, /Release 2\.0 is in-progress\. Mark it effective before it replaces 1\.0/);
  s.ok(s.stage('--set-status', '2.0', 'effective'));
  assert.equal((await s.index()).designStatus['1.0'], 'superseded');
  assert.match(s.stage('--remove', '1.0').stderr, /is or was the effective design/, 'a superseded baseline that was accepted is guarded too');
  assert.match(s.stage('--remove', '1.0', '--replaced-by', '2.0').stderr, /were not judged on the same records/);
  assert.ok(existsSync(path.join(s.site, 'releases', '1.0', 'judgement.json')), 'a refused removal deletes nothing');
});

test('an effective release is removed once the same design is effective under its new ID', async t => {
  const s = await season(t);
  await s.fixture('1.0', {step: 'the carriage'});
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  s.ok(s.stage('--set-status', '1.0', 'effective'));
  await s.edit(i => ({...i, accepted: {'1.0': '2001-02-03'}}));
  await s.fixture('2.0', {step: 'the carriage'});
  s.ok(s.stage('2.0', '--design-name', 'Swinging arm'));
  s.ok(s.stage('--set-status', '2.0', 'effective'));
  await mkdir(path.join(s.root, 'docs', 'detailed-design'), {recursive: true});
  await writeFile(path.join(s.root, 'docs', 'detailed-design', 'designs.json'), JSON.stringify({preliminary: {'1.0': '1.0'}}));
  const renamed = s.ok(s.stage('--remove', '1.0', '--replaced-by', '2.0'));
  assert.match(renamed, /Removed preliminary design Tilting carriage 1\.0, replaced by preliminary design Swinging arm 2\.0\./);
  assert.match(renamed, /Note: detailed design 1\.0 names preliminary release 1\.0\. Stage it again with --preliminary 2\.0\./);
  const after = JSON.parse(await readFile(path.join(s.site, 'releases.json'), 'utf8'));
  assert.deepEqual(after, {releases: ['2.0'], designs: {2: {name: 'Swinging arm'}}, revision: after.revision,
    designStatus: {'2.0': 'effective'}, accepted: {'2.0': '2001-02-03'}, current: '2.0'});
  assert.deepEqual(Object.keys(after.revision), ['2.0'], 'the index keeps no entry of the removed release');
  assert.ok(!existsSync(path.join(s.site, 'releases', '1.0')) && !existsSync(path.join(s.author, 'releases', '1.0')));
});

test('the inputs of a release are copied to a new release folder with its own paths, and its records stay current', async t => {
  const s = await season(t);
  const dir = await s.fixture('1.0'), old = inputsOf('1.0'), fresh = inputsOf('1.1'), at = name => path.join(s.root, fresh, name), text = file => readFile(file, 'utf8');
  await mkdir(path.join(dir, 'notes'), {recursive: true});
  await writeFile(path.join(dir, 'notes/lane.md'), 'Invented lane note');
  await writeFile(path.join(dir, 'notes/lane.json'), JSON.stringify({drawn: {file: old + '/design.step'}, outside: {file: 'README.md'}}));
  const copied = s.ok(s.stage('--copy-inputs', '1.0', '1.1'));
  assert.match(copied, /Copied the inputs of release 1\.0 to cad\/preliminary-design\/releases\/1\.1 with its records and wrote the paths of 2 files for the new folder\./);
  assert.match(copied, /preliminary-check \. cad\/preliminary-design\/releases\/1\.1\/judgement\.json --require-checked[^]*preliminary-page \. cad\/preliminary-design\/releases\/1\.1\/judgement\.json/);
  // The scene is built for its own folder; the page, the source, its parts and every record keep their bytes.
  assert.ok(!existsSync(at('review-scene.json.gz')), 'the page builder writes the scene of the new folder');
  for (const name of ['review.html', 'design.json', 'subsystems/arm.json', 'design.step', 'page.json', 'notes/lane.md', 'records/trials.json', 'records/measurements/mass.drawn.json'])
    assert.equal(await text(at(name)), await text(path.join(dir, name)), name);
  const judgement = JSON.parse(await text(at('judgement.json')));
  assert.deepEqual([judgement.source.file, judgement.records.folder, judgement.page.file, judgement.narrative.file, judgement.premises[0].file, judgement.requirements.file],
    [fresh + '/design.json', fresh + '/records', fresh + '/page.json', fresh + '/narrative.md', fresh + '/premises/robot-mass.json', 'cad/preliminary-design/requirements.json']);
  assert.deepEqual(JSON.parse(await text(at('notes/lane.json'))), {drawn: {file: fresh + '/design.step'}, outside: {file: 'README.md'}}, 'a path outside the release folder is left as it is');
  assert.ok(existsSync(path.join(dir, 'review-scene.json.gz')), 'the source release is untouched');
  // The copy is judged on the records it came with, and stages once its page is built.
  paged(s.root, fresh + '/judgement.json');
  s.ok(s.stage('1.1', '--design-name', 'Tilting carriage'));
  // An existing folder is not overwritten, and a folder with no judgement file is refused.
  assert.match(s.stage('--copy-inputs', '1.0', '1.1').stderr, /cad\/preliminary-design\/releases\/1\.1 already exists/);
  assert.match(s.stage('--copy-inputs', '9.0', '2.0').stderr, /No judgement file at cad\/preliminary-design\/releases\/9\.0/);
});

test('the view of an effective release is republished while its stage gate stands for its files', async t => {
  const s = await season(t), published = name => readFile(path.join(s.site, 'releases', '1.0', name), 'utf8');
  await s.fixture('1.0');
  s.ok(s.stage('1.0', '--design-name', 'Tilting carriage'));
  // A draft is revised by staging it again; the refresh is for the release that no longer changes.
  assert.match(s.stage('--refresh-view', '1.0').stderr, /--refresh-view republishes the view of the effective release\. Preliminary design Tilting carriage 1\.0 is in-progress; stage it to publish or revise it: stage_preliminary_review\.py 1\.0/);
  s.ok(s.stage('--set-status', '1.0', 'effective'));
  const before = await s.index();
  // A rebuilt review page of the same records: published, and the index keeps its status, accepted date and draft count.
  await s.fixture('1.0', {page: '<html>Rebuilt review of 1.0</html>'});
  assert.match(s.stage('1.0').stderr, /Tilting carriage 1\.0 is effective and no longer changes/);
  assert.match(s.ok(s.stage('--refresh-view', '1.0')), /^Refreshed the view of preliminary design Tilting carriage 1\.0 \(effective\)\. Its physics, status, accepted date and draft count are unchanged\r?\nBefore pushing, run the publication check: node PLUGIN\/scripts\/design-publication\.mjs check \.\r?\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\r?\n$/);
  assert.equal(await published('index.html'), '<html>Rebuilt review of 1.0</html>');
  // The refresh is recorded as a refresh. It is no draft: the status, the accepted date and the draft count stay.
  const refreshed = {...before, refreshed: {'1.0': {date: 'DATE'}}};
  assert.ok(existsSync(path.join(s.site, 'releases', '1.0', 'gate.json')), 'the record of the stage gate stays with the effective release');
  assert.deepEqual([before.designStatus, before.accepted, before.revision], [{'1.0': 'effective'}, {'1.0': 'DATE'}, {'1.0': rev(1)}]);
  assert.deepEqual(await s.index(), refreshed);
  assert.match(s.ok(s.stage('--refresh-view', '1.0')), /Preliminary design Tilting carriage 1\.0 is unchanged \(effective\)/);
  // Records of another part are a changed design: refused, with the version that work belongs to, and nothing is published.
  await s.fixture('1.0', {page: '<html>Review of a changed design</html>', step: 'a changed step'});
  assert.match(s.stage('--refresh-view', '1.0').stderr,
    /Tilting carriage 1\.0 is effective, and what its stage gate judged has changed: cad\/preliminary-design\/releases\/1\.0\/design\.step changed[^]* Work that changes it belongs to 1\.1, staged as a draft/);
  assert.equal(await published('index.html'), '<html>Rebuilt review of 1.0</html>');
  assert.deepEqual(await s.index(), refreshed);
  assert.match(s.stage('--refresh-view', '1.0', '--design-name', 'Another name').stderr, /a view refresh changes no name/);
});
