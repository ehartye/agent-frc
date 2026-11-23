/**
 * @lane merge
 * @subject scripts/design-publication.mjs
 * @subject scripts/detailed-design-release.mjs
 * @subject templates/preliminary-review/review.html
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {checkProject} from '../scripts/design-publication.mjs';
import {copyInputs, markEffective, relink, remove, stageInProgress, supersede} from '../scripts/detailed-design-release.mjs';
import {folderReceipt, issueRelease, sha, write} from './fixtures/preliminary-release.mjs';

// Synthetic teaching fixtures: two invented architectures, "Tilting carriage" and "Swinging arm", with no relation to any game.
const script = fileURLToPath(new URL('../scripts/detailed-design-release.mjs', import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const detail = 'docs/detailed-design', prelim = 'docs/preliminary-design';
const dated = index => JSON.parse(JSON.stringify(index).replace(/"\d{4}-\d{2}-\d{2}"/g, '"DATE"'));

/**
 * A project whose preliminary index lists the given releases, and a helper that writes checked inputs for a detailed
 * design on the layout of one of them.
 */
function project(t, {releases = {'1.0': 'effective'}, names = {1: {name: 'Tilting carriage'}}} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'detailed-versions-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const listing = (statuses, designs = names) => write(root, prelim + '/releases.json', {releases: Object.keys(statuses), ...(designs ? {designs} : {}), designStatus: statuses,
    current: Object.keys(statuses).find(id => statuses[id] === 'effective') ?? Object.keys(statuses).at(-1)});
  for (const id of Object.keys(releases)) issueRelease(path.join(root, 'docs'), id);
  listing(releases);
  /** Checked inputs for design `id`, on the layout and STEP of preliminary release `on`. `page` stands for an edit. */
  function inputs(id, {on = '1.0', page = '<html>Detailed review of ' + id + '</html>'} = {}) {
    const published = path.join(root, prelim, 'releases', on), folder = 'cad/detailed-design/designs/' + id;
    const receipt = read(path.join(published, 'receipt.json')), ledger = {...read(path.join(published, 'budgets.json')), requirements: {file: 'package-limits.json'}};
    const plan = JSON.stringify({view: 'review/index.html', motion: {file: 'paths.json'}, budgets: {file: 'budgets.json'}});
    write(root, folder + '/layout.json', plan);
    write(root, folder + '/receipt.json', folderReceipt(root, folder, receipt, plan, ledger, on));
    write(root, folder + '/missions.json', {missionCases: read(path.join(published, 'release.json')).missionCases});
    write(root, folder + '/paths.json', readFileSync(path.join(published, 'motion.json')));
    write(root, folder + '/budgets.json', ledger);
    write(root, folder + '/package-limits.json', readFileSync(path.join(published, 'limits.json')));
    write(root, folder + '/review/index.html', page);
    cpSync(path.join(published, 'review-scene.json.gz'), path.join(root, folder, 'review/review-scene.json.gz'));
    return {folder, step: receipt.step.sha256};
  }
  const stage = (id, {on = '1.0', page, ...options} = {}) => {
    const made = inputs(id, {on, page});
    return stageInProgress({project: root, design: id, inputs: made.folder, preliminary: on, authority: 'cad/fusion-authority.json', lineage: 'cad/lineage.json',
      replay: () => ({archiveSha256: sha('archive'), stepSha256: made.step, configuration: 'Invented stowed assembly'}), ...options});
  };
  const review = (on = '1.0', verdict = 'pass') => {
    write(root, 'cad/detailed-design/readiness-result.json', {schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly',
      stepSha256: read(path.join(root, prelim, 'releases', on, 'receipt.json')).step.sha256, archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict, findings: []});
    return 'cad/detailed-design/readiness-result.json';
  };
  return {root, inputs, stage, review, listing, index: () => dated(read(path.join(root, detail, 'designs.json')))};
}
const errors = root => checkProject(root, {skipRerun: true}).errors;

test('a version is staged under MAJOR.MINOR and takes the name of its preliminary design', t => {
  const p = project(t);
  const staged = p.stage('1.0');
  assert.equal(staged.report, 'Staged detailed design Tilting carriage 1.0 (draft 1 · in progress)\nOn push: CI runs the publication checks. The layout check is not rerun for a draft; the local check you ran is its check.\n');
  assert.deepEqual(p.index(), {schema: 'agent-frc/detailed-design-index@1', preliminaryIndex: '../preliminary-design/releases.json', current: '1.0', beside: null,
    designs: ['1.0'], designStatus: {'1.0': 'in-progress'}, architectures: {1: {name: 'Tilting carriage'}}, preliminary: {'1.0': '1.0'}, revision: {'1.0': {number: 1, date: 'DATE'}}});
  const record = read(path.join(p.root, detail, 'designs/1.0/design.json'));
  assert.deepEqual([record.design, record.preliminary, record.check], ['1.0', {release: '1.0'}, {project: 'cad/detailed-design/designs/1.0', plan: 'layout.json'}]);
  const checked = checkProject(p.root, {skipRerun: true});
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(checked.detailed.designs, [{design: '1.0', title: 'Tilting carriage 1.0', state: 'draft 1 · in progress', status: 'in-progress', rerun: 'skipped'}]);

  // A draft is a publish of the same version: it counts in the index and takes no number.
  assert.equal(p.stage('1.0', {page: '<html>Second draft</html>'}).report, 'Revised detailed design Tilting carriage 1.0 in place (draft 2 · in progress)\nOn push: CI runs the publication checks. The layout check is not rerun for a draft; the local check you ran is its check.\n');
  assert.equal(p.stage('1.0', {page: '<html>Second draft</html>'}).report, 'Detailed design Tilting carriage 1.0 is unchanged (draft 2)\n');
  assert.equal(p.stage('1.0', {page: '<html>Third draft</html>'}).revision['1.0'].number, 3);
  assert.deepEqual(p.index().designs, ['1.0']);
  assert.equal(readFileSync(path.join(p.root, detail, 'designs/1.0/index.html'), 'utf8'), '<html>Third draft</html>');

  // The name is the preliminary design's. A different one is refused; the same one is accepted.
  assert.throws(() => p.stage('1.0', {designName: 'Sliding gate'}), /Design 1 is named "Tilting carriage"\. A name stays with its architecture/);
  assert.doesNotThrow(() => p.stage('1.0', {page: '<html>Third draft</html>', designName: 'Tilting carriage'}));
  // A second in-progress version of one architecture is refused.
  assert.throws(() => p.stage('1.1'), /Tilting carriage 1\.0 is already in progress \(draft 3\)\. Revise it in place: stage 1\.0 again\. A draft takes no number/);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/1.1')));
  assert.throws(() => p.stage('1.x'), /Use a version as the design ID: MAJOR\.MINOR, such as 1\.0/);
});

test('a name is required the first time a major number appears, and must equal the preliminary name', t => {
  // The preliminary release keeps an earlier ID, so no name is known for design 1.
  const p = project(t, {releases: {'layout-001': 'effective'}, names: null});
  assert.throws(() => p.stage('1.0', {on: 'layout-001'}), /Name design 1 with --design-name "NAME": a short name in words for the architecture/);
  assert.throws(() => p.stage('1.0', {on: 'layout-001', designName: ' '}), /Give the design a short name in words/);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs.json')), 'an unnamed design publishes nothing');
  assert.equal(p.stage('1.0', {on: 'layout-001', designName: 'Tilting  carriage'}).architectures[1].name, 'Tilting carriage');
  assert.deepEqual(errors(p.root), []);
  assert.throws(() => p.stage('detail-001', {on: 'layout-001', designName: 'Tilting carriage'}), /--design-name names the architecture of a version ID/);

  const q = project(t);
  assert.throws(() => q.stage('1.0', {designName: 'Sliding gate'}), /Preliminary design 1 is named "Tilting carriage"\. A detailed design takes the same name as its preliminary design and its own version/);
  // The major number is the architecture: a detailed 2.0 cannot be built on preliminary 1.0.
  assert.throws(() => q.stage('2.0', {designName: 'Swinging arm'}), /Detailed design 2\.0 cannot be built on preliminary design 1\.0: the major number is the architecture/);
  // The check holds a hand-edited index to the same rules.
  q.stage('1.0');
  const file = path.join(q.root, detail, 'designs.json'), index = read(file);
  write(q.root, detail + '/designs.json', {...index, architectures: undefined});
  assert.match(errors(q.root).join('\n'), /Detailed design 1 has no name: add architectures\.1\.name to the detailed design index, or stage a version with --design-name/);
});

test('minor is the detailed effective baseline: a newly effective minor supersedes the previous one', t => {
  const p = project(t);
  p.stage('1.0');
  const first = markEffective({project: p.root, design: '1.0', readiness: p.review()});
  assert.match(first.report, /Work toward the next baseline of Tilting carriage is 1\.1, staged as drafts until it is accepted\. A different architecture is 2\.0 with its own name\.\nOn push: this is the stage gate\. CI reruns the full layout check once on the committed design, on each push of the branch that carries this change\. Make it the last commit of its pull request\.\n$/);
  assert.deepEqual([first.designStatus, first.accepted && Object.keys(first.accepted)], [{'1.0': 'effective'}, ['1.0']]);
  // An effective design stops changing; work toward the next baseline is the next minor.
  assert.throws(() => p.stage('1.0', {page: '<html>Late edit</html>'}), /Detailed design Tilting carriage 1\.0 is effective and no longer changes\. Work toward its next baseline is 1\.1, staged as a draft/);
});

test('an accepted revision is 1.1; it supersedes 1.0, and an earlier number is refused', t => {
  const p = project(t);
  p.stage('1.0');
  markEffective({project: p.root, design: '1.0', readiness: p.review()});
  const draft = p.stage('1.1');
  assert.equal(draft.report, 'Staged detailed design Tilting carriage 1.1 (draft 1 · in progress)\nOn push: CI runs the publication checks. The layout check is not rerun for a draft; the local check you ran is its check.\n');
  assert.deepEqual([draft.current, draft.beside], ['1.0', '1.1']);
  assert.deepEqual(errors(p.root), []);
  const accepted = markEffective({project: p.root, design: '1.1', readiness: p.review()});
  assert.deepEqual(accepted.designStatus, {'1.0': 'superseded', '1.1': 'effective'});
  assert.deepEqual(accepted.supersededBy, {'1.0': '1.1'});
  assert.deepEqual(errors(p.root), []);
  const skipped = p.stage('1.3');
  assert.match(skipped.report, /Note: the version after 1\.1 is 1\.2; 1\.3 skips a number\./);
  supersede({project: p.root, design: '1.3'});
  assert.throws(() => p.stage('1.2'), /Version 1\.2 comes before 1\.3, which is already listed\. The next version of Tilting carriage is 1\.4/);
});

test('when the next preliminary baseline is accepted the detailed draft is re-linked and keeps its ID', t => {
  const p = project(t, {releases: {'1.0': 'effective', '1.1': 'in-progress'}});
  p.stage('1.0');
  // Preliminary 1.1 is accepted: 1.0 is superseded, and the check asks for a re-link.
  p.listing({'1.0': 'superseded', '1.1': 'effective'});
  const before = checkProject(p.root, {skipRerun: true});
  assert.deepEqual(before.errors, []);
  assert.match(before.warnings.join('\n'), /Detailed design Tilting carriage 1\.0 names preliminary release 1\.0, which is now superseded\. Re-link it[\s\S]*relink PROJECT --design 1\.0 --preliminary RELEASE/);
  const linked = relink({project: p.root, design: '1.0', preliminary: '1.1'});
  assert.equal(linked.report, 'Detailed design Tilting carriage 1.0 is now built on preliminary 1.1 (was 1.0) and keeps its ID\nOn push: CI runs the publication checks. The layout check is not rerun: no physics changed.\n');
  assert.deepEqual([linked.designs, linked.preliminary, linked.revision['1.0'].number], [['1.0'], {'1.0': '1.1'}, 1]);
  assert.deepEqual(read(path.join(p.root, detail, 'designs/1.0/design.json')).preliminary, {release: '1.1'});
  const after = checkProject(p.root, {skipRerun: true});
  assert.deepEqual([after.errors, after.warnings], [[], []]);
  // A release that is not effective is refused and nothing changes.
  p.listing({'1.0': 'superseded', '1.1': 'effective', '1.2': 'in-progress'});
  issueRelease(path.join(p.root, 'docs'), '1.2');
  assert.throws(() => relink({project: p.root, design: '1.0', preliminary: '1.2'}), /must name an effective preliminary release; 1\.2 is in-progress/);
  assert.deepEqual(read(path.join(p.root, detail, 'designs/1.0/design.json')).preliminary, {release: '1.1'});
  assert.equal(p.index().preliminary['1.0'], '1.1');
});

test('a different architecture is the next major number with its own name', t => {
  const p = project(t, {releases: {'1.0': 'superseded', '2.0': 'effective'}, names: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}}});
  // Detailed 1.0 was published while preliminary 1.0 was effective.
  p.listing({'1.0': 'effective', '2.0': 'in-progress'}, {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}});
  p.stage('1.0');
  p.listing({'1.0': 'superseded', '2.0': 'effective'}, {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}});
  assert.throws(() => relink({project: p.root, design: '1.0', preliminary: '2.0'}), /Preliminary design 2\.0 is a different architecture\. The major number is the architecture: its detailed design is 2\.0/);
  const arm = p.stage('2.0', {on: '2.0'});
  assert.match(arm.report, /^Staged detailed design Swinging arm 2\.0 \(draft 1 · in progress\)\nNote: Tilting carriage 1\.0 is still in progress\. If the team has left that architecture, mark it superseded or withdraw it\.\nOn push: CI runs the publication checks\. The layout check is not rerun for a draft; the local check you ran is its check\.\n$/);
  assert.deepEqual(arm.architectures, {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}});
  assert.equal(supersede({project: p.root, design: '1.0', by: '2.0'}).designStatus['1.0'], 'superseded');
  assert.deepEqual(errors(p.root), []);
});

test('an earlier free-form ID keeps working beside versions, with no name and no forced migration', t => {
  const p = project(t);
  const legacy = p.stage('detail-001');
  assert.equal(legacy.report, 'Staged detailed design detail-001 (draft 1 · in progress)\nOn push: CI runs the publication checks. The layout check is not rerun for a draft; the local check you ran is its check.\n');
  assert.equal(legacy.architectures, undefined);
  assert.equal(p.stage('detail-001', {page: '<html>Edit</html>'}).revision['detail-001'].number, 2);
  // An index written before drafts and names, with only the earlier fields, still passes the check and still stages.
  const file = detail + '/designs.json', {revision, ...earlier} = read(path.join(p.root, file));
  write(p.root, file, earlier);
  const checked = checkProject(p.root, {skipRerun: true});
  assert.deepEqual([checked.errors, checked.warnings], [[], []]);
  assert.deepEqual(checked.detailed.designs, [{design: 'detail-001', status: 'in-progress', rerun: 'skipped'}]);
  assert.equal(p.stage('detail-001', {page: '<html>Another edit</html>'}).revision['detail-001'].number, 2, 'one staged before drafts were counted is at 1');
  markEffective({project: p.root, design: 'detail-001', readiness: p.review()});
  assert.throws(() => p.stage('detail-001', {page: '<html>Late</html>'}), /Design detail-001 is effective; choose a new ID/);
  // A version is staged beside it.
  assert.deepEqual(p.stage('1.0').designStatus, {'detail-001': 'effective', '1.0': 'in-progress'});
  assert.deepEqual(errors(p.root), []);
});

test('an earlier ID is renamed to a version with no redirect: copy the inputs, stage, mark effective, remove', t => {
  const p = project(t);
  p.stage('detail-001');
  markEffective({project: p.root, design: 'detail-001', readiness: p.review()});
  // The earlier inputs pin a file by a path that names their own folder, as a design checked from the repository root does.
  const old = 'cad/detailed-design/designs/detail-001', pinned = readFileSync(path.join(p.root, old, 'paths.json'));
  write(p.root, old + '/study.json', {motion: {file: old + '/paths.json', sha256: sha(pinned)}, note: 'invented'});
  const copied = copyInputs({project: p.root, from: 'detail-001', to: '1.0'});
  assert.deepEqual([copied.inputs, copied.rewritten], ['cad/detailed-design/designs/1.0', ['study.json']]);
  assert.match(copied.report, /Now run the layout check there, then stage 1\.0:\n  node PLUGIN\/scripts\/design\.mjs preliminary-check \. cad\/detailed-design\/designs\/1\.0\/layout\.json --write-view --require-checked/);
  const target = path.join(p.root, 'cad/detailed-design/designs/1.0');
  assert.deepEqual(read(path.join(target, 'study.json')).motion, {file: 'cad/detailed-design/designs/1.0/paths.json', sha256: sha(pinned)});
  assert.ok(!existsSync(path.join(target, 'receipt.json')) && !existsSync(path.join(target, 'review/index.html')) && existsSync(path.join(target, 'missions.json')),
    'the page, scene and receipt are left for the layout check to write');
  assert.throws(() => copyInputs({project: p.root, from: 'detail-001', to: '1.0'}), /cad\/detailed-design\/designs\/1\.0 already exists/);
  // A pin that no longer matches its file is refused before anything is copied.
  write(p.root, old + '/study.json', {motion: {file: old + '/paths.json', sha256: sha('another file')}});
  assert.throws(() => copyInputs({project: p.root, from: 'detail-001', to: '1.5'}), /pins cad\/detailed-design\/designs\/detail-001\/paths\.json, which is missing or differs from its pinned SHA-256/);
  assert.ok(!existsSync(path.join(p.root, 'cad/detailed-design/designs/1.5')));

  // The effective design is removed only once the same STEP is effective under the new ID.
  assert.throws(() => remove({project: p.root, design: 'detail-001'}), /is or was the effective design\. Remove it only to rename it/);
  p.stage('1.0');
  assert.throws(() => remove({project: p.root, design: 'detail-001', replacedBy: '1.0'}), /Design 1\.0 is in-progress\. Mark it effective before it replaces detail-001/);
  markEffective({project: p.root, design: '1.0', readiness: p.review()});
  const removed = remove({project: p.root, design: 'detail-001', replacedBy: '1.0'});
  assert.match(removed.report, /^Removed detailed design detail-001, replaced by detailed design Tilting carriage 1\.0\. Its folders docs\/detailed-design\/designs\/detail-001 and cad\/detailed-design\/designs\/detail-001 are deleted and no redirect is left/);
  assert.deepEqual([removed.designs, removed.designStatus, removed.supersededBy, removed.current], [['1.0'], {'1.0': 'effective'}, undefined, '1.0']);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/detail-001')) && !existsSync(path.join(p.root, old)));
  assert.deepEqual(errors(p.root), []);
  // A changed design is not a rename.
  const q = project(t, {releases: {'1.0': 'effective', 'layout-001': 'superseded'}});
  q.stage('detail-001');
  markEffective({project: q.root, design: 'detail-001', readiness: q.review()});
  q.listing({'layout-001': 'effective', '1.0': 'superseded'});
  markEffective({project: q.root, design: 'detail-002', readiness: q.review('layout-001')});
  assert.throws(() => remove({project: q.root, design: 'detail-001', replacedBy: 'detail-002'}), /are of different STEP files/);
  // An in-progress design that was never accepted is removed outright.
  const r = project(t);
  r.stage('detail-001');
  assert.deepEqual(remove({project: r.root, design: 'detail-001'}).designs, []);
});

test('the check warns on two in-progress versions of one architecture and on a major number that differs from the preliminary design', t => {
  const p = project(t);
  p.stage('1.0');
  const file = detail + '/designs.json', index = read(path.join(p.root, file));
  cpSync(path.join(p.root, detail, 'designs/1.0'), path.join(p.root, detail, 'designs/1.1'), {recursive: true});
  write(p.root, detail + '/designs/1.1/design.json', {...read(path.join(p.root, detail, 'designs/1.0/design.json')), design: '1.1'});
  write(p.root, file, {...index, designs: ['1.0', '1.1'], designStatus: {'1.0': 'in-progress', '1.1': 'in-progress'}, current: '1.1'});
  const two = checkProject(p.root, {skipRerun: true});
  assert.deepEqual(two.errors, []);
  assert.match(two.warnings.join('\n'), /Detailed design Tilting carriage has 2 in-progress versions \(1\.0, 1\.1\)\. A draft takes no number/);
  cpSync(path.join(p.root, detail, 'designs/1.0'), path.join(p.root, detail, 'designs/2.0'), {recursive: true});
  write(p.root, detail + '/designs/2.0/design.json', {...read(path.join(p.root, detail, 'designs/1.0/design.json')), design: '2.0'});
  write(p.root, file, {...index, designs: ['1.0', '2.0'], designStatus: {'1.0': 'superseded', '2.0': 'in-progress'}, current: '2.0',
    architectures: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}}});
  assert.match(checkProject(p.root, {skipRerun: true}).errors.join('\n'), /Detailed design Swinging arm 2\.0 names preliminary design 1\.0, a different architecture/);
});

test('the command line stages a version, re-links it and reports each refusal', t => {
  const p = project(t, {releases: {'1.0': 'effective', '1.1': 'in-progress'}});
  p.stage('1.0');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
  p.listing({'1.0': 'superseded', '1.1': 'effective'});
  const linked = run('relink', p.root, '--design', '1.0', '--preliminary', '1.1');
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stderr, /is now built on preliminary 1\.1 \(was 1\.0\) and keeps its ID/);
  assert.equal(JSON.parse(linked.stdout).preliminary['1.0'], '1.1');
  const effective = run('effective', p.root, '--design', '1.0', '--readiness', p.review());
  assert.equal(effective.status, 0, effective.stderr);
  assert.match(effective.stderr, /Work toward the next baseline of Tilting carriage is 1\.1/);
  const refused = run('relink', p.root, '--design', '1.0', '--preliminary', '1.1');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Only an in-progress design is re-linked; work on a new preliminary baseline is detailed design 1\.1[\s\S]*Usage: detailed-design-release\.mjs stage PROJECT --design MAJOR\.MINOR \[--design-name "NAME"\]/);
  const copied = run('copy-inputs', p.root, '--from', '1.0', '--to', '1.1');
  assert.equal(copied.status, 0, copied.stderr);
  assert.ok(existsSync(path.join(p.root, 'cad/detailed-design/designs/1.1/layout.json')));
});
