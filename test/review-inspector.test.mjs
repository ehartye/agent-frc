import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The player's pure inspector helpers, loaded from the shipped template.
const html = readFileSync(new URL('../scripts/package-view.html', import.meta.url), 'utf8');
const source = html.split('<script id="review-logic">')[1].split('</script>')[0];
const { inspectorFields, visibleBodies, findComponent, MISSING } =
  new Function(source + '\nreturn {inspectorFields, visibleBodies, findComponent, MISSING};')();

const head = {
  id: 'head', name: 'Turning head', category: 'mechanism', role: 'mechanism', subsystem: 'Carrier', motionGroup: 'carrier',
  material: 'Aluminum', volumeMm3: 64, volumeType: 'material', purpose: 'Carry the sample during the turn.',
  rationale: 'A single rotating carrier connects pickup to release.', loads: ['carrier'], movesIn: ['loaded-turn', 'park-loaded'],
  mass: [{ id: 'mechanisms', kg: [2, 2.4], basis: 'Invented subtotal', sharedWith: ['gate'], note: 'Shared with gate; unallocated until the line is split' }],
  missing: []
};
const field = (fields, label) => fields.find(f => f[0] === label);

test('the inspector shows identity, classification, volume, mass basis, loads and moving cases', () => {
  const fields = inspectorFields(head);
  assert.deepEqual(fields.map(f => f[0]), ['Category', 'Subsystem', 'Motion group', 'Material', 'Occupied volume',
    'Mass line and basis', 'Purpose', 'Why it is included', 'Electrical load lines', 'Moves in']);
  assert.equal(field(fields, 'Category')[3], 'swatch');
  assert.equal(field(fields, 'Subsystem')[1], 'Carrier');
  assert.equal(field(fields, 'Motion group')[1], 'carrier', 'subsystem and motion group stay separate');
  assert.equal(field(fields, 'Occupied volume')[1], '0.06 cm³ · material volume');
  assert.deepEqual(field(fields, 'Mass line and basis')[1],
    ['mechanisms: 2.00–2.40 kg · Invented subtotal · Shared with gate; unallocated until the line is split']);
  assert.deepEqual(field(fields, 'Electrical load lines')[1], ['carrier']);
  assert.deepEqual(field(fields, 'Moves in')[1], ['loaded-turn', 'park-loaded']);
  assert.ok(fields.every(f => f[2] === false), 'a complete entry has no missing field');
});

test('missing explanations and accounts stay visible as missing', () => {
  const gap = { ...head, purpose: undefined, subsystem: undefined, volumeType: undefined, mass: [], loads: [], movesIn: [],
    missing: ['purpose', 'subsystem', 'volume type', 'mass line'] };
  const fields = inspectorFields(gap);
  assert.deepEqual(field(fields, 'Purpose').slice(1, 3), [MISSING, true]);
  assert.deepEqual(field(fields, 'Subsystem').slice(1, 3), [MISSING, true]);
  assert.equal(field(fields, 'Occupied volume')[2], true);
  assert.deepEqual(field(fields, 'Mass line and basis').slice(1, 3), ['No mass line includes this component', true]);
  assert.equal(field(fields, 'Moves in')[1], 'Stationary in every commissioned case');
  assert.equal(field(inspectorFields({ ...gap, mass: [], massExcluded: 'Excluded from inspection weight (payload)', missing: [] }), 'Mass line and basis')[1],
    'Excluded from inspection weight (payload)');
  assert.deepEqual(inspectorFields(undefined), [['Component', MISSING, true]]);
});

test('isolate shows only the focused bodies and restore brings back the full assembly', () => {
  const names = ['battery', 'gate', 'head', 'rail'];
  assert.deepEqual(visibleBodies(names, new Set(['head', 'rail'])), ['head', 'rail']);
  assert.deepEqual(visibleBodies(names, null), names);
  assert.deepEqual(visibleBodies(names, new Set()), names);
});

test('search selects by stable ID or display name', () => {
  const inspector = { head, gate: { ...head, id: 'gate', name: 'Sliding gate' } };
  assert.equal(findComponent('HEAD', inspector), 'head');
  assert.equal(findComponent('sliding gate', inspector), 'gate');
  assert.equal(findComponent('turn', inspector), 'head');
  assert.equal(findComponent('nothing', inspector), null);
  assert.equal(findComponent('  ', inspector), null);
  assert.equal(findComponent('turn', inspector, true), null, 'leaving the box accepts only an exact match');
  assert.equal(findComponent('Sliding gate', inspector, true), 'gate');
  const tie = { arm2: { id: 'arm2', name: 'Second arm' }, arm: { id: 'arm', name: 'First arm' } };
  assert.equal(findComponent('arm', tie), 'arm', 'an exact ID beats an earlier substring match');
});

test('the page digest falls back to a pure-JS SHA-256 where crypto.subtle is unavailable', async () => {
  const { createHash } = await import('node:crypto');
  const { sha256Pure, digestHex } = new Function(source + '\nreturn {sha256Pure, digestHex};')();
  assert.ok(sha256Pure && digestHex, 'the review logic exports the digest helpers');
  const cases = ['', 'abc', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'é'.repeat(70), 'x'.repeat(1000)];
  for (const text of cases) {
    const bytes = new TextEncoder().encode(text);
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256Pure(bytes), expected, 'pure SHA-256 of ' + bytes.length + ' bytes');
    assert.equal(await digestHex(bytes, undefined), expected, 'digest without crypto.subtle');
    assert.equal(await digestHex(bytes.buffer, undefined), expected, 'an ArrayBuffer is accepted');
    assert.equal(await digestHex(bytes, globalThis.crypto.subtle), expected, 'digest with crypto.subtle');
  }
  const big = new Uint8Array(3 * 1024 * 1024 + 77).map((_, k) => (k * 31) & 255);
  const view = big.subarray(13, big.length - 5);
  assert.equal(await digestHex(view, undefined), createHash('sha256').update(view).digest('hex'), 'a multi-megabyte offset view hashes in place');
  assert.equal(sha256Pure(new DataView(view.buffer, view.byteOffset, view.byteLength)), createHash('sha256').update(view).digest('hex'), 'any ArrayBuffer view');
  for (const n of [55, 56, 63, 64, 119, 120]) { const b = new Uint8Array(n).fill(97); assert.equal(sha256Pure(b), createHash('sha256').update(b).digest('hex'), n + ' bytes'); }
});
