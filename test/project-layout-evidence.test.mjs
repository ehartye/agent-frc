/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {designChecksBlock, inspect, writeDesignChecks} from '../scripts/project-layout.mjs';

function project(config) {
  const root = mkdtempSync(path.join(tmpdir(), 'layout-evidence-'));
  execFileSync('git', ['init', '-q', root]);
  mkdirSync(path.join(root, 'trial-records'));
  writeFileSync(path.join(root, 'trial-records', 'run.json'), '{}');
  if (config) writeFileSync(path.join(root, 'project-layout.json'), JSON.stringify(config));
  return root;
}
const problems = result => Array.isArray(result) ? result : [...(result.problems ?? result)];

test('an unregistered top-level folder is reported', () => {
  assert.ok(problems(inspect(project())).some(line => line === 'Unexpected root entry: trial-records'));
});

test('a registered evidence folder is accepted', () => {
  assert.ok(!problems(inspect(project({evidenceFolders: ['trial-records']}))).some(line => line.includes('trial-records')));
});

test('evidenceFolders cannot rename a standard folder or hold a path', () => {
  assert.throws(() => inspect(project({evidenceFolders: ['cad']})), /evidenceFolders/);
  assert.throws(() => inspect(project({evidenceFolders: ['a/b']})), /evidenceFolders/);
});

test('the ignore list of the path and secret scan is an expected root file', () => {
  const root = project({evidenceFolders: ['trial-records']});
  writeFileSync(path.join(root, '.branch-scan.json'), JSON.stringify({ignore: ['tests/fixtures/']}));
  writeFileSync(path.join(root, 'stray-notes.json'), '{}');
  // The control: another root file is still reported, so the acceptance is of this one name.
  assert.deepEqual(problems(inspect(root)).filter(line => line.startsWith('Unexpected root entry')), ['Unexpected root entry: stray-notes.json']);
});

test('the Design checks block is written into AGENTS.md once and refreshed in place', () => {
  const root = project(), file = path.join(root, 'AGENTS.md'), cli = fileURLToPath(new URL('../scripts/project-layout.mjs', import.meta.url));
  const agents = () => execFileSync(process.execPath, [cli, 'agents', root], {encoding: 'utf8'}).trim();
  // A project with its own instructions keeps them: the block is added after them.
  writeFileSync(file, '# Invented robot\n\nKeep the pit tidy.\n');
  assert.equal(agents(), 'Design checks block in AGENTS.md: written.');
  assert.equal(readFileSync(file, 'utf8'), '# Invented robot\n\nKeep the pit tidy.\n\n' + designChecksBlock + '\n');
  assert.equal(agents(), 'Design checks block in AGENTS.md: current.');
  // An earlier or hand-edited block is replaced in place; the text around it stays.
  writeFileSync(file, '# Invented robot\n\n<!-- agent-frc:design-checks:start -->\nAn earlier block.\n<!-- agent-frc:design-checks:end -->\n\n## Pit rules\n');
  assert.equal(writeDesignChecks(root), 'updated');
  assert.equal(readFileSync(file, 'utf8'), '# Invented robot\n\n' + designChecksBlock + '\n\n## Pit rules\n');
  assert.equal(readFileSync(file, 'utf8').split('agent-frc:design-checks:start').length, 2, 'one block');
  // A block with one marker missing is refused, not doubled.
  writeFileSync(file, '<!-- agent-frc:design-checks:start -->\nHalf a block.\n');
  assert.throws(() => writeDesignChecks(root), /unfinished Design checks block/);
  // The block says what to run for each kind of change, and never asks for the layout check on a page change.
  for (const line of ['| Geometry, a motion, a tolerance or reserve, a fixture, a trial, a mass or voltage budget | The local layout check, on the phases the change affects |',
    'Never the layout check |', '| The physics of an effective design | Do not edit it in place. Open the next minor version as a draft |',
    '- Time guidelines: about 1 minute while editing, 5 before merging, 15 at a stage gate.', 'docs/testing-methodology.md'])
    assert.ok(designChecksBlock.includes(line), line);
  // A new project gets the file.
  const fresh = project();
  assert.equal(writeDesignChecks(fresh), 'written');
  assert.equal(readFileSync(path.join(fresh, 'AGENTS.md'), 'utf8'), '# Agent instructions\n\n' + designChecksBlock + '\n');
});
