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
import {checkProject as checkWithJudgement} from '../scripts/design-publication.mjs';
import {copyInputs, markEffective as markEffectiveWithGate, relink as relinkWithJudgement, remove, stageInProgress as stageWithJudgement, supersede} from '../scripts/detailed-design-release.mjs';
import {writeGate} from '../scripts/gate-record.mjs';
import {preliminaryGate} from '../scripts/stage-gate.mjs';
import {issueRelease, sha, standIn, write, writeInputs} from './fixtures/preliminary-release.mjs';

// These invented designs hold no solid, so the layout judgement is stood in for.
const standInCli = fileURLToPath(new URL('./fixtures/stand-in-cli.mjs', import.meta.url));
const markEffective = options => markEffectiveWithGate({judge: standIn, ...options});
const stageInProgress = options => stageWithJudgement({judge: standIn, ...options}), relink = options => relinkWithJudgement({judge: standIn, ...options});
const checkProject = (root, options) => checkWithJudgement(root, {judge: standIn, ...options});
/** Record the stage gate of a preliminary release, as the command that marks it effective does. */
const gated = (root, id) => { const done = preliminaryGate({project: root, release: id, judge: standIn}); writeGate(done.published, done.gate); };

// Synthetic teaching fixtures: two invented architectures, "Tilting carriage" and "Swinging arm", with no relation to any game.
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
  for (const id of Object.keys(releases)) issueRelease(root, id);
  listing(releases);
  for (const id of Object.keys(releases)) gated(root, id);
  /** Checked inputs for design `id`, on the layout and STEP of preliminary release `on`. `page` stands for an edit. */
  function inputs(id, {on = '1.0', page = '<html>Detailed review of ' + id + '</html>'} = {}) {
    const folder = 'cad/detailed-design/designs/' + id;
    writeInputs(root, folder, {issue: 'synthetic-' + on, step: 'step ' + on, page});
    return {folder, step: sha('step ' + on)};
  }
  const stage = (id, {on = '1.0', page, ...options} = {}) => {
    const made = inputs(id, {on, page});
    return stageInProgress({project: root, design: id, inputs: made.folder, preliminary: on, authority: 'cad/fusion-authority.json', lineage: 'cad/lineage.json',
      replay: () => ({archiveSha256: sha('archive'), stepSha256: made.step, configuration: 'Invented stowed assembly'}), ...options});
  };
  const review = (on = '1.0', verdict = 'pass') => {
    write(root, 'cad/detailed-design/readiness-result.json', {schema: 'agent-frc/mechanical-readiness-result@1', configuration: 'Invented stowed assembly',
      stepSha256: sha('step ' + on), archiveSha256: sha('archive'), buildReadiness: verdict, showcaseEligibility: verdict, findings: []});
    return 'cad/detailed-design/readiness-result.json';
  };
  return {root, inputs, stage, review, listing, index: () => dated(read(path.join(root, detail, 'designs.json')))};
}
const errors = root => checkProject(root, {log: () => {}}).errors;

test('a version is staged under MAJOR.MINOR and takes the name of its preliminary design', t => {
  const p = project(t);
  const staged = p.stage('1.0');
  assert.equal(staged.report, 'Staged detailed design Tilting carriage 1.0 (draft 1 · in progress)\nBefore pushing, run the publication check: node PLUGIN/scripts/design-publication.mjs check .\nOn push: the project\'s workflow publishes the page. Nothing is rerun.\n');
  assert.deepEqual(p.index(), {schema: 'agent-frc/detailed-design-index@1', preliminaryIndex: '../preliminary-design/releases.json', current: '1.0', beside: null,
    designs: ['1.0'], designStatus: {'1.0': 'in-progress'}, architectures: {1: {name: 'Tilting carriage'}}, preliminary: {'1.0': '1.0'}, revision: {'1.0': {number: 1, date: 'DATE'}}});
  const record = read(path.join(p.root, detail, 'designs/1.0/design.json'));
  assert.deepEqual([record.design, record.preliminary, record.check], ['1.0', {release: '1.0'}, {project: 'cad/detailed-design/designs/1.0'}]);
  const checked = checkProject(p.root, {log: () => {}});
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(checked.detailed.designs, [{design: '1.0', title: 'Tilting carriage 1.0', state: 'draft 1 · in progress', status: 'in-progress'}]);

  // A draft is a publish of the same version: it counts in the index and takes no number.
  assert.equal(p.stage('1.0', {page: '<html>Second draft</html>'}).report, 'Revised detailed design Tilting carriage 1.0 in place (draft 2 · in progress)\nBefore pushing, run the publication check: node PLUGIN/scripts/design-publication.mjs check .\nOn push: the project\'s workflow publishes the page. Nothing is rerun.\n');
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
  // The preliminary index does not name design 1 yet, so no name is known for it.
  const p = project(t, {names: null});
  assert.throws(() => p.stage('1.0'), /Name design 1 with --design-name "NAME": a short name in words for the architecture/);
  assert.throws(() => p.stage('1.0', {designName: ' '}), /Give the design a short name in words/);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs.json')), 'an unnamed design publishes nothing');
  // Once it does, the same name is accepted, written with single spaces.
  p.listing({'1.0': 'effective'}, {1: {name: 'Tilting carriage'}});
  assert.equal(p.stage('1.0', {designName: 'Tilting  carriage'}).architectures[1].name, 'Tilting carriage');
  assert.deepEqual(errors(p.root), []);

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
  assert.match(first.report, /Work toward the next baseline of Tilting carriage is 1\.1, staged as drafts until it is accepted\. A different architecture is 2\.0 with its own name\.\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\n$/);
  assert.deepEqual([first.designStatus, first.accepted && Object.keys(first.accepted)], [{'1.0': 'effective'}, ['1.0']]);
  // An effective design stops changing; work toward the next baseline is the next minor.
  assert.throws(() => p.stage('1.0', {page: '<html>Late edit</html>'}), /Detailed design Tilting carriage 1\.0 is effective and no longer changes\. Work toward its next baseline is 1\.1, staged as a draft/);
});

test('an accepted revision is 1.1; it supersedes 1.0, and an earlier number is refused', t => {
  const p = project(t);
  p.stage('1.0');
  markEffective({project: p.root, design: '1.0', readiness: p.review()});
  const draft = p.stage('1.1');
  assert.equal(draft.report, 'Staged detailed design Tilting carriage 1.1 (draft 1 · in progress)\nBefore pushing, run the publication check: node PLUGIN/scripts/design-publication.mjs check .\nOn push: the project\'s workflow publishes the page. Nothing is rerun.\n');
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
  const before = checkProject(p.root, {log: () => {}});
  assert.deepEqual(before.errors, []);
  assert.match(before.warnings.join('\n'), /Detailed design Tilting carriage 1\.0 names preliminary release 1\.0, which is now superseded\. Re-link it[\s\S]*relink PROJECT --design 1\.0 --preliminary RELEASE/);
  const linked = relink({project: p.root, design: '1.0', preliminary: '1.1'});
  assert.equal(linked.report, 'Detailed design Tilting carriage 1.0 is now built on preliminary 1.1 (was 1.0) and keeps its ID\nOn push: the project\'s workflow publishes the page. Nothing is rerun.\n');
  assert.deepEqual([linked.designs, linked.preliminary, linked.revision['1.0'].number], [['1.0'], {'1.0': '1.1'}, 1]);
  assert.deepEqual(read(path.join(p.root, detail, 'designs/1.0/design.json')).preliminary, {release: '1.1'});
  const after = checkProject(p.root, {log: () => {}});
  assert.deepEqual([after.errors, after.warnings], [[], []]);
  // A release that is not effective is refused and nothing changes.
  p.listing({'1.0': 'superseded', '1.1': 'effective', '1.2': 'in-progress'});
  issueRelease(p.root, '1.2');
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
  assert.match(arm.report, /^Staged detailed design Swinging arm 2\.0 \(draft 1 · in progress\)\nNote: Tilting carriage 1\.0 is still in progress\. If the team has left that architecture, mark it superseded or withdraw it\.\nBefore pushing, run the publication check: node PLUGIN\/scripts\/design-publication\.mjs check \.\nOn push: the project's workflow publishes the page\. Nothing is rerun\.\n$/);
  assert.deepEqual(arm.architectures, {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}});
  assert.equal(supersede({project: p.root, design: '1.0', by: '2.0'}).designStatus['1.0'], 'superseded');
  assert.deepEqual(errors(p.root), []);
});

test('a design is removed after it is staged under another ID, with no redirect: copy the inputs, stage, mark effective, remove', t => {
  const p = project(t);
  p.stage('1.0');
  markEffective({project: p.root, design: '1.0', readiness: p.review()});
  // The inputs pin a file by a path that names their own folder, as a design checked from the repository root does.
  const old = 'cad/detailed-design/designs/1.0', pinned = readFileSync(path.join(p.root, old, 'design.json'));
  write(p.root, old + '/study.json', {source: {file: old + '/design.json', sha256: sha(pinned)}, note: 'invented'});
  const copied = copyInputs({project: p.root, from: '1.0', to: '1.1'});
  assert.deepEqual([copied.inputs, copied.rewritten], ['cad/detailed-design/designs/1.1', ['judgement.json', 'study.json']]);
  assert.match(copied.report, /Now run the layout check there, then stage 1\.1:\n  node PLUGIN\/scripts\/design\.mjs preliminary-check \. cad\/detailed-design\/designs\/1\.1\/judgement\.json --require-checked\n  node PLUGIN\/scripts\/design\.mjs preliminary-page \. cad\/detailed-design\/designs\/1\.1\/judgement\.json\n/);
  const target = path.join(p.root, 'cad/detailed-design/designs/1.1');
  assert.deepEqual(read(path.join(target, 'study.json')).source, {file: 'cad/detailed-design/designs/1.1/design.json', sha256: sha(pinned)});
  assert.ok(!existsSync(path.join(target, 'review-scene.json.gz')) && existsSync(path.join(target, 'review.html')) && existsSync(path.join(target, 'records/trials.json')),
    'the records and the page come along; the scene is left for the page builder');
  assert.equal(read(path.join(target, 'judgement.json')).records.folder, 'cad/detailed-design/designs/1.1/records');
  assert.throws(() => copyInputs({project: p.root, from: '1.0', to: '1.1'}), /cad\/detailed-design\/designs\/1\.1 already exists/);
  // A pin that no longer matches its file is refused before anything is copied.
  write(p.root, old + '/study.json', {source: {file: old + '/design.json', sha256: sha('another file')}});
  assert.throws(() => copyInputs({project: p.root, from: '1.0', to: '1.5'}), /pins cad\/detailed-design\/designs\/1\.0\/design\.json, which is missing or differs from its pinned SHA-256/);
  assert.ok(!existsSync(path.join(p.root, 'cad/detailed-design/designs/1.5')));

  // The effective design is removed only once the same STEP is effective under the new ID.
  assert.throws(() => remove({project: p.root, design: '1.0'}), /is or was the effective design\. Remove it only to rename it/);
  p.stage('1.1');
  assert.throws(() => remove({project: p.root, design: '1.0', replacedBy: '1.1'}), /Design 1\.1 is in-progress\. Mark it effective before it replaces 1\.0/);
  markEffective({project: p.root, design: '1.1', readiness: p.review()});
  const removed = remove({project: p.root, design: '1.0', replacedBy: '1.1'});
  assert.match(removed.report, /^Removed detailed design Tilting carriage 1\.0, replaced by detailed design Tilting carriage 1\.1\. Its folders docs\/detailed-design\/designs\/1\.0 and cad\/detailed-design\/designs\/1\.0 are deleted and no redirect is left/);
  assert.deepEqual([removed.designs, removed.designStatus, removed.supersededBy, removed.current], [['1.1'], {'1.1': 'effective'}, undefined, '1.1']);
  assert.ok(!existsSync(path.join(p.root, detail, 'designs/1.0')) && !existsSync(path.join(p.root, old)));
  assert.deepEqual(errors(p.root), []);
  // A changed design is not a rename.
  const q = project(t, {releases: {'1.0': 'effective', '1.1': 'superseded'}});
  q.stage('1.0');
  markEffective({project: q.root, design: '1.0', readiness: q.review()});
  q.listing({'1.1': 'effective', '1.0': 'superseded'});
  markEffective({project: q.root, design: '1.1', readiness: q.review('1.1')});
  assert.throws(() => remove({project: q.root, design: '1.0', replacedBy: '1.1'}), /are of different STEP files/);
  // An in-progress design that was never accepted is removed outright.
  const r = project(t);
  r.stage('1.0');
  assert.deepEqual(remove({project: r.root, design: '1.0'}).designs, []);
});

test('the check warns on two in-progress versions of one architecture and on a major number that differs from the preliminary design', t => {
  const p = project(t);
  p.stage('1.0');
  const file = detail + '/designs.json', index = read(path.join(p.root, file));
  cpSync(path.join(p.root, detail, 'designs/1.0'), path.join(p.root, detail, 'designs/1.1'), {recursive: true});
  write(p.root, detail + '/designs/1.1/design.json', {...read(path.join(p.root, detail, 'designs/1.0/design.json')), design: '1.1'});
  write(p.root, file, {...index, designs: ['1.0', '1.1'], designStatus: {'1.0': 'in-progress', '1.1': 'in-progress'}, current: '1.1'});
  const two = checkProject(p.root, {log: () => {}});
  assert.deepEqual(two.errors, []);
  assert.match(two.warnings.join('\n'), /Detailed design Tilting carriage has 2 in-progress versions \(1\.0, 1\.1\)\. A draft takes no number/);
  cpSync(path.join(p.root, detail, 'designs/1.0'), path.join(p.root, detail, 'designs/2.0'), {recursive: true});
  write(p.root, detail + '/designs/2.0/design.json', {...read(path.join(p.root, detail, 'designs/1.0/design.json')), design: '2.0'});
  write(p.root, file, {...index, designs: ['1.0', '2.0'], designStatus: {'1.0': 'superseded', '2.0': 'in-progress'}, current: '2.0',
    architectures: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}}});
  assert.match(checkProject(p.root, {log: () => {}}).errors.join('\n'), /Detailed design Swinging arm 2\.0 names preliminary design 1\.0, a different architecture/);
});

test('the command line stages a version, re-links it and reports each refusal', t => {
  const p = project(t, {releases: {'1.0': 'effective', '1.1': 'in-progress'}});
  p.stage('1.0');
  const run = (...args) => spawnSync(process.execPath, [standInCli, 'detailed-design-release.mjs', ...args], {encoding: 'utf8'});
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
  assert.ok(existsSync(path.join(p.root, 'cad/detailed-design/designs/1.1/judgement.json')));
});
