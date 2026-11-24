/**
 * @lane merge
 * @subject scripts/gate-record.mjs
 */
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {contentSha, gateDifferences, sameRecords} from '../scripts/gate-record.mjs';
import {sha, write} from './fixtures/preliminary-release.mjs';

// Synthetic teaching fixture: invented files with no relation to any game.
test('a gate record stands for the files it judged: a changed or missing one is named, and a Git LFS pointer stands for its file', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gate-record-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const gate = {files: {source: {'cad/1.0/design.json': sha('source')}, parts: {'cad/1.0/design.step': sha('step')}, judgement: {}, records: {'cad/1.0/records/a.json': sha('record')}}};
  write(root, 'cad/1.0/design.json', 'source');
  write(root, 'cad/1.0/design.step', 'step');
  write(root, 'cad/1.0/records/a.json', 'record');
  assert.deepEqual(gateDifferences(root, gate), []);
  const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + sha('step') + '\nsize 4\n';
  assert.equal(contentSha(Buffer.from(pointer)), sha('step'));
  write(root, 'cad/1.0/design.step', pointer);
  assert.deepEqual(gateDifferences(root, gate), [], 'a part kept in Git LFS is compared by the digest its pointer names');
  write(root, 'cad/1.0/design.json', 'another source');
  rmSync(path.join(root, 'cad/1.0/records/a.json'));
  assert.deepEqual(gateDifferences(root, gate), ['cad/1.0/design.json changed', 'cad/1.0/records/a.json is missing']);
});

test('two designs are the same when their gates judged the same records, wherever their folders are and whatever their files are called', () => {
  const gate = (folder, records) => ({files: {records: Object.fromEntries(Object.entries(records).map(([name, text]) => [folder + '/' + name, sha(text)]))}});
  const a = gate('cad/1.0', {'records/a.json': 'a', 'records/trials.json': 't'});
  assert.equal(sameRecords(a, 'cad/1.0', gate('cad/1.1', {'records/a.json': 'a', 'records/trials.json': 't'}), 'cad/1.1'), true);
  assert.equal(sameRecords(a, 'cad/1.0', gate('cad/1.1', {'records/a.json': 'b', 'records/trials.json': 't'}), 'cad/1.1'), false);
  assert.equal(sameRecords(a, 'cad/1.0', gate('cad/1.1', {'records/a.json': 'a'}), 'cad/1.1'), false);
  assert.equal(sameRecords(a, 'cad/1.0', null, 'cad/1.1'), false);
  assert.equal(sameRecords(gate('x', {}), 'x', gate('y', {}), 'y'), false, 'two gates of no record are not one design');
});
