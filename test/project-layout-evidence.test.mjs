import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspect} from '../scripts/project-layout.mjs';

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
