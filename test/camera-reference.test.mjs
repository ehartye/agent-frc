/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { review } from '../examples/sensor-study/camera-reference.mjs';

const read = () => JSON.parse(readFileSync(new URL('../examples/sensor-study/camera-frames.json', import.meta.url)));

test('same brightness after losing the calibrated scene cannot eliminate an empty tray', () => {
  const results = review(read());
  assert.deepEqual(results.map(r => r.decision), ['permit', 'hold', 'permit', 'hold']);
  assert.deepEqual(results.map(r => r.possible), [['seated'], ['empty', 'seated'], ['seated'], ['shifted']]);
  assert.equal(results[1].unknown.find(r => r.ray === 'side').reason, 'empty-view patch unregistered');
});

test('uninformative and contradictory images withhold the decision', () => {
  const fixture = read();
  const good = fixture.frames[2];
  for (const patch of [{ calibration: 'other-lens' }, { camera: 'other-head' }, { readings: {} }]) {
    const [result] = review({ ...fixture, frames: [{ ...good, ...patch }] });
    assert.deepEqual(result.possible, ['empty', 'seated', 'shifted']);
    assert.equal(result.decision, 'hold');
  }
  for (const value of [0, 255, 100]) {
    good.readings.center.value = value;
    const result = review(fixture)[2];
    assert.equal(result.decision, 'hold');
    assert.deepEqual(result.possible, value === 100 ? [] : ['empty', 'seated']);
  }
  good.readings.center.value = 175;
  good.readings.center.reference = 'same-tray-different-patch';
  assert.equal(review(fixture)[2].decision, 'hold');
});

test('overlapping calibration bands retain competing poses and invalid records are rejected', () => {
  const fixture = read();
  fixture.rays[1].empty = [30, 175];
  assert.deepEqual(review(fixture)[2].possible, ['empty', 'seated']);
  fixture.states[2].occupied.push('unregistered-ray');
  assert.throws(() => review(fixture), /Invalid ray pattern/);
  const sample = read();
  sample.frames[0].readings.side.value = 256;
  assert.throws(() => review(sample), /Invalid pixel/);
});

test('reopening the physical premise distinguishes lost coverage from an unobservable state', () => {
  const study = read();
  assert.deepEqual(review(study)[1].unresolvedPairs[0].candidateRays, ['side', 'center']);
  study.states = JSON.parse(readFileSync(new URL('../examples/sensor-study/retention-states.json', import.meta.url)));
  // Supply even the missing ray with its original registration and a bright sample.
  study.frames[2].readings.side = { reference: study.rays[0].reference, value: 180 };
  const frame = review(study)[2];
  assert.equal(frame.unknown.length, 0);
  assert.equal(frame.decision, 'hold');
  assert.deepEqual(frame.unresolvedPairs, [{ permitState: 'seated-and-secured', holdState: 'seated-but-loose',
    finding: 'same silhouette on every modeled ray', candidateRays: [] }]);
});
