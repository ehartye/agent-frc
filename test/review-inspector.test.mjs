import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reviewScene } from './fixtures/review-scene.mjs';

// The stock page's pure helpers, loaded from the shipped template.
const html = readFileSync(new URL('../templates/preliminary-review/review.html', import.meta.url), 'utf8');
const source = html.split('<script id="review-logic">')[1].split('</script>')[0];
const logic = new Function(source + '\nreturn {inspectorFields, visibleBodies, findComponent, partition, frameCount, massLinesFor, sha256Pure, digestHex, MISSING, NOT_SUPPLIED};')();
const field = (fields, label) => fields.find(f => f[0] === label);

test('the inspector shows identity, classification, volume, mass basis, support, loads and moving cases from the scene', () => {
  const scene = reviewScene();
  const fields = logic.inspectorFields('arm', scene);
  assert.deepEqual(fields.map(f => f[0]), ['Category', 'Subsystem', 'Motion group', 'Material', 'Occupied volume', 'Mass line and basis',
    'Support and load path', 'Purpose', 'Why it is included', 'Electrical load lines', 'Moves in']);
  assert.equal(field(fields, 'Category')[3], 'swatch');
  assert.equal(field(fields, 'Subsystem')[1], 'Invented arm');
  assert.equal(field(fields, 'Motion group')[1], 'arm', 'subsystem and motion group stay separate');
  assert.equal(field(fields, 'Occupied volume')[1], '64.0 cm³ · material volume');
  assert.deepEqual(field(fields, 'Mass line and basis')[1], ['mechanisms: 3.00–3.60 kg · Invented estimate · Allocated to this component alone']);
  assert.equal(field(fields, 'Support and load path')[1], 'Pivot shaft into the frame plate.');
  assert.deepEqual(field(fields, 'Electrical load lines')[1], ['arm']);
  assert.deepEqual(field(fields, 'Moves in')[1], ['raise', 'package-displacement-control']);
  assert.ok(fields.every(f => f[2] === false), 'a complete entry has no missing field');
});

test('missing explanations, support paths and mass lines stay visible as missing', () => {
  const scene = reviewScene();
  Object.assign(scene.bodies.frame, {purpose: null, subsystem: null, volumeType: null, support: null, missing: ['purpose', 'subsystem', 'volume type']});
  scene.mass.lines = scene.mass.lines.filter(l => l.id !== 'structure');
  const fields = logic.inspectorFields('frame', scene);
  assert.deepEqual(field(fields, 'Purpose').slice(1, 3), [logic.MISSING, true]);
  assert.deepEqual(field(fields, 'Subsystem').slice(1, 3), [logic.MISSING, true]);
  assert.equal(field(fields, 'Occupied volume')[2], true);
  assert.deepEqual(field(fields, 'Support and load path').slice(1, 3), [logic.NOT_SUPPLIED, true]);
  assert.deepEqual(field(fields, 'Mass line and basis').slice(1, 3), ['No mass line includes this component', true]);
  assert.equal(field(fields, 'Moves in')[1], 'Stationary in every commissioned case');
  assert.equal(field(logic.inspectorFields('target', scene), 'Mass line and basis')[1], 'Field fixture; not robot mass');
  assert.equal(field(logic.inspectorFields('target', scene), 'Support and load path')[1], 'Field fixture');
  assert.deepEqual(logic.inspectorFields('ghost', scene), [['Component', logic.MISSING, true]]);
  scene.mass.runningAdditions = [{name: 'carried article', kg: [0.5, 0.75], members: ['frame']}];
  assert.deepEqual(logic.massLinesFor('frame', scene), ['carried article: 0.50–0.75 kg · running addition, excluded from inspection weight']);
});

test('focus shows only the selected bodies and Show assembly restores every body', () => {
  const names = ['battery', 'arm', 'frame', 'target'];
  assert.deepEqual(logic.visibleBodies(names, new Set(['arm', 'battery'])), ['battery', 'arm']);
  assert.deepEqual(logic.visibleBodies(names, null), names);
});

test('search selects by stable ID or display name, and leaving the box accepts only an exact match', () => {
  const bodies = {arm: {name: 'Pivot arm'}, arm2: {name: 'Second arm'}, gate: {name: 'Sliding gate'}};
  assert.equal(logic.findComponent('ARM', bodies), 'arm');
  assert.equal(logic.findComponent('sliding gate', bodies), 'gate');
  assert.equal(logic.findComponent('pivot', bodies), 'arm');
  assert.equal(logic.findComponent('pivot', bodies, true), null);
  assert.equal(logic.findComponent('nothing', bodies), null);
});

test('budget partition keeps shared lines separate until they are split', () => {
  const lines = [{id: 'a', members: ['arm']}, {id: 'b', members: ['arm', 'frame']}, {id: 'c', members: ['battery']}];
  const sel = new Set(['arm']);
  assert.deepEqual(logic.partition(lines, sel, false), {included: [lines[0]], shared: [lines[1]]});
  assert.deepEqual(logic.partition(lines, sel, true).included.length, 3);
  assert.equal(logic.frameCount(reviewScene().cases[0]), 25);
});

test('the scene digest falls back to a pure-JS SHA-256 where crypto.subtle is unavailable', async () => {
  for (const text of ['', 'abc', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'é'.repeat(70), 'x'.repeat(1000)]) {
    const bytes = new TextEncoder().encode(text), expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(logic.sha256Pure(bytes), expected);
    assert.equal(await logic.digestHex(bytes, undefined), expected, 'without crypto.subtle');
    assert.equal(await logic.digestHex(bytes.buffer, undefined), expected);
    assert.equal(await logic.digestHex(bytes, globalThis.crypto.subtle), expected, 'with crypto.subtle');
  }
  const big = new Uint8Array(3 * 1024 * 1024 + 77).map((_, k) => (k * 31) & 255), view = big.subarray(13, big.length - 5);
  assert.equal(await logic.digestHex(view, undefined), createHash('sha256').update(view).digest('hex'), 'a multi-megabyte offset view hashes in place');
  for (const n of [55, 56, 63, 64, 119, 120]) { const b = new Uint8Array(n).fill(97); assert.equal(logic.sha256Pure(b), createHash('sha256').update(b).digest('hex'), n + ' bytes'); }
});
