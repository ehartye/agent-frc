import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeBodyKey } from '../scripts/native-identity.mjs';
import { prepareNativeStudy, prepareNativeStudyTransition } from '../scripts/prepare-native-study.mjs';

function fixture() {
  const bytes = Buffer.from('invented source evidence');
  const approval = {
    destination: { projectId: 'P', folderId: 'F', fileId: 'design', versionId: 'revision', versionNumber: 1 },
    sourceReceiptSha256: createHash('sha256').update(bytes).digest('hex'),
  };
  const occurrenceId = '[]', localBodyId = 'Invented block';
  const key = nativeBodyKey(occurrenceId, localBodyId);
  const reference = { schema: 'agent-frc/native-study-reference@1', joints: {}, occurrences: { [occurrenceId]: {} },
    bodies: { [key]: { occurrenceId, localBodyId, revisionId: 'R' } } };
  return { bytes, approval, reference, key };
}

test('prepares independently pinned, instance-qualified bindings and refuses changed source evidence', () => {
  const { bytes, approval, reference, key } = fixture();
  assert.equal(prepareNativeStudy(approval, reference, bytes).reference.bodies[key].revisionId, 'R');
  assert.throws(() => prepareNativeStudy(approval, reference, Buffer.from('replaced')), /receipt/);
  const body = reference.bodies[key];
  delete reference.bodies[key];
  reference.bodies[body.localBodyId] = body;
  assert.throws(() => prepareNativeStudy(approval, reference, bytes), /body identity/);
});

test('project binding CLI preserves an existing binding and never overwrites the reference', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-study-binding-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { bytes, approval, reference } = fixture();
  fs.writeFileSync(path.join(dir, 'approval.json'), JSON.stringify(approval));
  fs.writeFileSync(path.join(dir, 'reference.json'), JSON.stringify(reference));
  fs.writeFileSync(path.join(dir, 'source'), bytes);
  const cli = fileURLToPath(new URL('../scripts/prepare-native-study.mjs', import.meta.url));
  const args = [cli, 'approval.json', 'reference.json', 'source', 'binding.json'];
  assert.equal(spawnSync(process.execPath, args, { cwd: dir }).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'binding.json'))).schema, 'agent-frc/native-study-binding@1');
  assert.equal(spawnSync(process.execPath, args, { cwd: dir }).status, 2);
});

test('explicit transition keeps the component revision map and refuses every other reference change', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-save-transition-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const { approval, reference, key } = fixture();
  const bytes = Buffer.from('synthetic source archive');
  const archive = path.join(dir, 'archive');
  fs.writeFileSync(archive, bytes);
  const receipt = Buffer.from(JSON.stringify({ 'source/records': [{ '~hash': digest(bytes) }] }));
  Object.assign(approval, { archiveSha256: digest(bytes), sourceReceiptSha256: digest(receipt),
    archiveDigestPointer: '/source~1records/0/~0hash' });
  const localTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  reference.occurrences['[]'] = { componentId:'definition', revisionId:'before', localTransform };
  const original = { schema:'agent-frc/native-study-transition-reference@1', destination:null, savedUnmodified:false,
    reference, solids: { [key]: { areaCm2:6, volumeCm3:1, boundsCm:[[0,0,0],[1,1,1]], topology:[1,6,12,8] } } };
  const saved = structuredClone(original);
  Object.assign(saved, { destination:approval.destination, savedUnmodified:true });
  saved.reference.occurrences['[]'].revisionId = 'after';
  const data = obj => Buffer.from(JSON.stringify(obj));
  const originalBytes = data(original);
  approval.originalReferenceSha256 = digest(originalBytes);
  const convert = (candidate, overrides = {}) => {
    const savedBytes = data(candidate);
    return prepareNativeStudyTransition({ ...approval, savedReferenceSha256:digest(savedBytes), ...overrides },
      originalBytes, savedBytes, receipt, archive);
  };
  const result = await convert(saved);
  assert.deepEqual(result.transition.componentRevisions, [{ occurrenceId:'[]', componentId:'definition',
    originalRevisionId:'before', savedRevisionId:'after' }]);
  assert.equal(result.reference.occurrences['[]'].revisionId, 'after');
  for (const [label, mutate] of [
    ['occurrences', c => { c.reference.occurrences['[]'].localTransform[3] = 2; }],
    ['bodies', c => { c.reference.bodies[key].revisionId = 'swapped'; }],
    ['joints', c => { c.reference.joints['[]'] = { added:'joint' }; }],
    ['solid measurements', c => { c.solids[key].volumeCm3 += 0.01; }],
    ['witness', c => { delete c.solids[key]; }],
    ['unmodified destination', c => { c.destination.fileId = 'copy'; }],
  ]) {
    const changed = structuredClone(saved);
    mutate(changed);
    await assert.rejects(convert(changed), new RegExp(label));
  }
  for (const pointer of ['', 'bad', '/source~2records', '/source~1records/00', '/source~1records/0']) {
    await assert.rejects(convert(saved, { archiveDigestPointer:pointer }), /[Pp]ointer|digest/);
  }
  await assert.rejects(convert(saved, { originalReferenceSha256:'a'.repeat(64) }), /bytes differ/);
  await assert.rejects(convert(saved, { sourceReceiptSha256:'a'.repeat(64) }), /receipt bytes/);
  fs.writeFileSync(archive, 'changed file');
  await assert.rejects(convert(saved), /Original archive/);
});

test('Fusion adapter verifies a reused source and executes temporary queries against a synthetic host', (t) => {
  const interpreters = process.platform === 'win32' ? [['python'], ['py', '-3']] : [['python3']];
  const suite = fileURLToPath(new URL('./native_study_replay_checks.py', import.meta.url));
  for (const [command, ...args] of interpreters) {
    const result = spawnSync(command, [...args, '-B', suite, '-v'], { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') continue;
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return;
  }
  t.skip('Python 3 is required to run the synthetic Fusion host tests');
});
