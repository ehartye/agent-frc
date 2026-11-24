/**
 * @lane merge
 * @subject scripts/project-structure.mjs
 * @subject scripts/project-layout.mjs
 * @subject templates/project-structure.json
 */
// Failure caught: a design judged with a file missing, moved or read from somewhere else (a scratch copy, an older rules
// folder), or a setup skill that tells a student another structure than the one that is checked.
// Synthetic teaching fixture: an invented project with no relation to any game.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {structure, structureOf, structureTable} from '../scripts/project-structure.mjs';

const cli = fileURLToPath(new URL('../scripts/project-layout.mjs', import.meta.url)), release = 'cad/preliminary-design/releases/1.0';
const layout = (mode, root) => spawnSync(process.execPath, [cli, mode, root], {encoding: 'utf8'});
const git = (root, ...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.autocrlf=false', ...args],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
const write = (root, name, data) => {
  mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
  writeFileSync(path.join(root, name), typeof data === 'string' ? data : JSON.stringify(data) + '\n');
};
const commit = root => { git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Invented'); };

function initialized(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'structure-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  git(root, 'init', '-q');
  const run = layout('init', root);
  assert.equal(run.status, 0, run.stderr);
  return root;
}
/** Every prescribed file of one release that uses each kind of file, and where it is. */
const files = {
  rules: 'kickoff/rules/2001-01-06/rules.json', narrative: 'kickoff/strategic-narrative.md', criteria: 'cad/design-criteria.json',
  design: release + '/design.json', judgement: release + '/judgement.json', subsystems: release + '/subsystems/arm.json',
  parts: release + '/parts/gear.step', custom: release + '/custom/notch.py', trials: release + '/trials/seat.json', field: 'cad/field/ramp.step',
};
function withRelease(t) {
  const root = initialized(t);
  write(root, files.rules, {weightLimits: []});
  write(root, files.narrative, 'Invented.\n');
  write(root, files.criteria, {minBusV: 9, basis: 'Invented'});
  write(root, files.design, {subsystems: [{file: 'subsystems/arm.json'}], fixtures: [{name: 'ramp', part: {field: 'ramp.step', solid: 'ramp'}}],
    trials: {seat: {file: 'trials/seat.json'}}, custom: {notch: {reason: 'Invented', limits: 'Invented'}}});
  write(root, files.subsystems, {solids: [{name: 'gear', part: {file: 'parts/gear.step', solid: 'gear'}}]});
  write(root, files.judgement, {});
  for (const id of ['parts', 'custom', 'field']) write(root, files[id], 'invented\n');
  write(root, files.trials, {});
  commit(root);
  return root;
}
const texts = found => found.problems.map(row => row.text);

test('a project made by init passes the check, with the folders of the structure in place', t => {
  const root = initialized(t);
  for (const folder of ['kickoff/rules', 'cad/field', 'cad/preliminary-design/releases', 'docs']) assert.ok(statSync(path.join(root, folder)).isDirectory(), folder);
  git(root, 'add', '-A');
  const run = layout('check', root);
  assert.equal(run.status, 0, run.stderr);
  // With a release, the same check passes while everything prescribed is there.
  const held = withRelease(t), ok = layout('check', held);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(texts(structureOf(held, '1.0')), []);
});

test('every prescribed file removed or moved is listed by name, by the check and to the judge', t => {
  for (const [id, file] of Object.entries(files)) {
    const root = withRelease(t), away = path.join(root, 'docs', path.basename(file));
    renameSync(path.join(root, file), away);
    const found = structureOf(root, '1.0');
    assert.ok(found.problems.some(row => row.id === id && row.text.startsWith(file + ' is missing')), id + ' moved: ' + texts(found).join('; '));
    const run = layout('check', root);
    assert.equal(run.status, 1, id);
    assert.ok(run.stderr.includes(file + ' is missing'), run.stderr);
    rmSync(away);
    assert.ok(texts(structureOf(root, '1.0')).some(text => text.startsWith(file + ' is missing')), id + ' removed');
  }
});

test('several things wrong are listed at once, and a file outside its place or unreadable is one of them', t => {
  const root = withRelease(t);
  rmSync(path.join(root, files.narrative));
  rmSync(path.join(root, 'kickoff/rules'), {recursive: true});
  write(root, files.judgement, '{not json');
  write(root, files.subsystems, {solids: [{name: 'gear', part: {file: 'models/gear.step', solid: 'gear'}}, {name: 'away', part: {file: '../2.0/parts/gear.step', solid: 'gear'}}]});
  const found = structureOf(root, '1.0');
  assert.deepEqual(found.problems.map(row => row.id).sort(), ['judgement', 'narrative', 'parts', 'parts', 'rules']);
  const said = texts(found).join('\n');
  assert.match(said, /kickoff\/rules\/<yyyy-mm-dd>\/rules\.json is missing.*Case study comes before this step: do it first/);
  assert.match(said, /judgement\.json is not readable JSON/);
  assert.match(said, /The part file models\/gear\.step is misplaced: it belongs in cad\/preliminary-design\/releases\/1\.0\/parts\//);
  assert.match(said, /The part file \.\.\/2\.0\/parts\/gear\.step is misplaced/);
});

test('the newest rules folder by name is the one that is read', t => {
  const root = withRelease(t);
  write(root, 'kickoff/rules/2001-04-20/rules.json', {});
  write(root, 'kickoff/rules/notes/rules.json', {});
  assert.equal(structureOf(root, '1.0').files.rulesFolder, 'kickoff/rules/2001-04-20');
  // The newest folder is the current one even when its file is missing: an older one is never read in its place.
  rmSync(path.join(root, 'kickoff/rules/2001-04-20/rules.json'));
  const found = structureOf(root, '1.0');
  assert.equal(found.files.rulesFolder, undefined);
  assert.match(texts(found).join('\n'), /^kickoff\/rules\/2001-04-20\/rules\.json is missing/);
});

test('an extra file is a note and stops nothing; a full judgement also needs a premise', t => {
  const root = withRelease(t);
  write(root, release + '/scratch.txt', 'invented');
  write(root, release + '/premises/notes.txt', 'invented');
  write(root, release + '/results/measurements/x.json', {});
  const found = structureOf(root, '1.0');
  assert.deepEqual(texts(found), []);
  assert.deepEqual(found.notes.map(note => note.split(' is not')[0]), [release + '/premises/notes.txt', release + '/scratch.txt']);
  assert.match(texts(structureOf(root, '1.0', {full: true})).join('\n'), /premises\/\*\.json is missing: the accepted premises/);
  write(root, release + '/premises/mass.json', {});
  assert.deepEqual(texts(structureOf(root, '1.0', {full: true})), []);
});

test('outside a Git checkout, or in a partial copy, everything missing is listed; a worktree of the same commit lacks nothing', t => {
  const root = withRelease(t), elsewhere = mkdtempSync(path.join(os.tmpdir(), 'structure-'));
  t.after(() => rmSync(elsewhere, {recursive: true, force: true}));
  // The control this catches: a design copied to a scratch folder, without the project around it.
  cpSync(path.join(root, release), path.join(elsewhere, 'copy', release), {recursive: true});
  const copy = structureOf(path.join(elsewhere, 'copy'), '1.0');
  assert.equal(copy.git, false);
  assert.deepEqual(copy.problems.map(row => row.id).sort(), ['criteria', 'field', 'git', 'narrative', 'rules']);
  assert.match(texts(copy).join('\n'), /not inside a Git checkout.*A separate workspace is a Git worktree/);
  git(root, 'worktree', 'add', '-q', '--detach', path.join(elsewhere, 'tree'));
  const tree = structureOf(path.join(elsewhere, 'tree', 'cad'), '1.0');
  assert.deepEqual([tree.git, texts(tree)], [true, []]);
  // A path in place of a release is refused: nothing names another location.
  assert.match(texts(structureOf(root, '../1.0')).join('\n'), /Name the release by its version/);
});

test('the setup skill shows the structure that is checked', () => {
  const skill = readFileSync(new URL('../skills/frc-project-setup/SKILL.md', import.meta.url), 'utf8');
  const block = /<!-- project-structure:start -->\n([\s\S]*?)\n<!-- project-structure:end -->/.exec(skill);
  assert.ok(block, 'the skill holds the generated tables between its two marker lines');
  assert.equal(block[1], structureTable(), 'run node scripts/project-layout.mjs table and put its output between the marker lines');
  // Each entry says where, what, who and when.
  for (const row of structure.entries) for (const key of ['id', 'path', 'holds', 'by', 'when']) assert.ok(row[key], JSON.stringify(row));
});
