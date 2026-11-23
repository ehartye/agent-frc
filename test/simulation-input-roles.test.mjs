/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const example = fileURLToPath(new URL('../examples/simulation-input-roles/', import.meta.url));
const tool = path.join(example, 'produce.mjs');
const file = name => path.join(example, name);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const roles = ['--source', file('source/receipt.json'), '--trajectory', file('trajectory/receipt.json')];
const base = ['--base', file('base.json')];
const fast = ['--override', file('fast.json')], slow = ['--override', file('slow.json')];
function run(...args) {
  return spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', shell: false });
}
function report(...args) {
  const result = run(...args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('same-basename inputs preserve raw bytes in distinct roles and files stay untouched', () => {
  const paths = [roles[1], roles[3], base[1], fast[1], slow[1]];
  const before = paths.map(p => fs.readFileSync(p));
  const result = report(...roles, ...base, ...fast, ...slow);
  assert.equal(result.inputs.sourceReceipt.sha256, hash(before[0]));
  assert.equal(result.inputs.trajectoryReceipt.sha256, hash(before[1]));
  assert.notEqual(result.inputs.sourceReceipt.sha256, result.inputs.trajectoryReceipt.sha256);
  assert.equal(result.baseSha256, hash(before[2]));
  assert.deepEqual(result.overrides, [
    { id: 'fast', sha256: hash(before[3]) }, { id: 'slow', sha256: hash(before[4]) }
  ]);
  assert.deepEqual(paths.map(p => fs.readFileSync(p)), before);
});

test('ordered overrides produce a deterministic effective digest with separately visible provenance', () => {
  const baseline = report(...roles, ...base);
  const first = report(...roles, ...base, ...fast, ...slow);
  const second = report(...roles, ...base, ...slow, ...fast);
  assert.equal(first.baseSha256, second.baseSha256);
  assert.notEqual(first.effectiveSha256, second.effectiveSha256);
  assert.equal(first.effective.speedLimitMps, 0.3);
  assert.equal(second.effective.speedLimitMps, 0.8);
  assert.equal(first.effectiveSha256, hash('{"brakeEnabled":true,"speedLimitMps":0.3}'));
  assert.equal(first.effectiveSha256, baseline.effectiveSha256);
  assert.notDeepEqual(first.overrides, baseline.overrides);
});

test('missing and repeated named roles fail with a specific diagnosis', () => {
  for (const [args, issue] of [
    [[...base, ...roles.slice(0, 2)], /trajectory/i],
    [[...base, ...roles.slice(2)], /source/i],
    [[...roles], /base/i],
    [[...roles, ...roles.slice(0, 2), ...base], /source/i]
  ]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, issue);
  }
});

test('unsupported flat config keys and invalid value types cannot affect the digest silently', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frc-role-input-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const location = path.join(dir, 'override.json');
  for (const changes of [{ typo: 1 }, { speedLimitMps: [1] }, { brakeEnabled: 'true' }]) {
    fs.writeFileSync(location, JSON.stringify({ id: 'case', changes }));
    const runResult = run(...roles, ...base, '--override', location);
    assert.equal(runResult.status, 2);
    assert.match(runResult.stderr, /override|changes/i);
  }
});
