import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { checkStudy } from '../examples/fusion-volume/compare.mjs';

const fixture = new URL('../examples/fusion-volume/observed.json', import.meta.url);
const source = new URL('./study.py', fixture);
const hash = createHash('sha256').update(readFileSync(source)).digest('hex');
const read = () => JSON.parse(readFileSync(fixture, 'utf8'));

test('the CLI compares the source-bound live observation, including real temporary-body measurement failures', () => {
  const cli = fileURLToPath(new URL('./compare.mjs', fixture));
  const output = spawnSync(process.execPath, [cli, fileURLToPath(fixture)], { encoding: 'utf8' });
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.equal(result.status, 'EXAMPLE_CONTROLS_REPRODUCED');
  assert.deepEqual(result.unusableVeryHighVolumeReadings, ['untransformedCopy', 'transformedCopy', 'positiveIntersection']);
  assert.equal(result.disjointBoolean, 'empty-face-set');
  assert.equal(result.independentDisjointGapCm, 2);
});

test('an independently bounded gap retains an unresolved Boolean when its own operation failed', () => {
  for (const outcome of [{ returned: false }, { returned: null, error: 'kernel failure' }]) {
    const evidence = read();
    const pair = evidence.targetOnly.primitive.separate;
    evidence.targetOnly.primitive.separate = { toolBoundsCm: pair.toolBoundsCm, ...outcome };
    const result = checkStudy(evidence, hash);
    assert.equal(result.status, 'DISJOINT_BOOLEAN_UNRESOLVED');
    assert.equal(result.independentDisjointGapCm, 2);
  }
});

test('a different host may supply positive temporary physical properties on every operand', () => {
  const evidence = read();
  const p = evidence.targetOnly.primitive;
  for (const b of [p.untransformedCopy, p.transformedCopy, p.overlap.measurement]) b.veryHighCm3 = b.directCm3;
  assert.deepEqual(checkStudy(evidence, hash).unusableVeryHighVolumeReadings, []);
});

const contradictions = {
  'unchanged volume at the wrong placement': r => {r.targetOnly.primitive.transformedCopy.boundsCm = r.targetOnly.primitive.native.boundsCm;},
  'wrong native source volume': r => {r.targetOnly.primitive.native.veryHighCm3 = 0;},
  'source drift': r => {r.sourceSha256 = 'f'.repeat(64);},
  'wrong units': r => {r.volumeUnits = 'mm3';},
  'stale Boolean target mistaken for an intersection': r => {r.targetOnly.primitive.overlap.measurement.directCm3 = 24;},
  'disjoint case reporting material': r => {r.targetOnly.primitive.separate.faceCount = 6;},
  'missing topology for a successful Boolean': r => {delete r.targetOnly.primitive.separate.faceCount;},
  'unknown neighbor after reopening': r => {delete r.targetOnly.reopened.neighbor;},
  'wrong neighboring cut despite unchanged bounds': r => {r.targetOnly.reopened.neighbor = r.allParticipants.reopened.neighbor;},
  'unrestricted cut negative control missing': r => {r.allParticipants.reopened.neighbor = r.targetOnly.reopened.neighbor;}
};
for (const [description, change] of Object.entries(contradictions)) {
  test(description, () => {
    const evidence = read();
    change(evidence);
    assert.throws(() => checkStudy(evidence, hash));
  });
}
