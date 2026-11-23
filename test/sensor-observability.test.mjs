/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewSensors, runSensorStudy} from '../scripts/sensor-observability.mjs';

const modelFile = new URL('../examples/sensor-study/layout.json', import.meta.url);
const layout = JSON.parse(await readFile(modelFile));
const identity = {attempt: 'test-attempt', piece: 'test-piece'};
function study() {
  const model = structuredClone(layout);
  const samples = [
    ['approach', 0.11, false, true], ['seated', 0.06, true, true],
    ['early-exit', 0.125, false, false], ['cleared', 0.20, false, false]
  ].map(([phase, x, inner, outer], i) => ({
    ...identity, phase, timeS: i, translation: [x, 0, 0],
    readings: {inner: {...identity, timeS: i, occupied: inner}, outer: {...identity, timeS: i, occupied: outer}}
  }));
  const trace = {...identity, frame: model.frame, clock: model.clock, samples};
  const witness = {...identity, frame: model.frame, clock: model.clock, units: 'm', timeS: 3, gapM: 0.02,
    method: 'independent-geometry', source: 'separate material query'};
  return {model, trace, witness};
}
function sensor(model, trace, phase = 1) {
  return reviewSensors(model, trace).samples[phase].sensors[0];
}

test('clear readings can precede departure and only the same pose with separate evidence supports release', () => {
  const {model, trace, witness} = study();
  const result = reviewSensors(model, trace, witness);
  assert.equal(result.releaseSupportedInStudy, true);
  assert.equal(result.calibratedDetection, 'requires-device-qualification');
  assert.ok(Math.abs(result.samples[2].gapM + 0.055) < 1e-10);
  assert.ok(result.samples[2].sensors.every(s => s.geometry === 'clear'));
  for (const bad of [null, {...witness, timeS: 2.99}, {...witness, method: 'optical'}, {...witness, source: 'inner'},
    {...witness, piece: 'other'}, {...witness, attempt: 'prior'}, {...witness, frame: 'other'},
    {...witness, units: 'mm'}, {...witness, gapM: 0.002}]) {
    assert.equal(reviewSensors(model, trace, bad).releaseSupportedInStudy, false);
  }
  trace.samples[3].translation = [...trace.samples[2].translation];
  assert.equal(reviewSensors(model, trace, witness).releaseSupportedInStudy, false);
});
test('occluder before the piece, behind it, unreachable port and finite reverse beams', () => {
  const {model, trace} = study();
  const beam = model.sensors[0];
  model.obstacles = [{kind: 'box', center: [0.04, 0, -0.07], halfSize: [0.004, 0.004, 0.004]}];
  assert.equal(sensor(model, trace).geometry, 'obstructed');
  model.obstacles[0].center[2] = 0.046;
  assert.equal(sensor(model, trace).geometry, 'occupied');
  beam.mode = 'through';
  assert.equal(sensor(model, trace).geometry, 'obstructed');
  beam.mode = 'reflective';
  model.obstacles = [];
  beam.origin[0] = -0.1;
  assert.equal(sensor(model, trace).matchesDesign, false);
  beam.origin = [0.06, 0, 0.09];
  beam.direction = -1;
  beam.range = 0.02;
  assert.equal(sensor(model, trace).geometry, 'clear');
  beam.range = 0.09;
  assert.equal(sensor(model, trace).geometry, 'occupied');
});
test('a bore has no material on its axis and a ray can end inside a transverse bore', () => {
  const {model, trace} = study();
  const beam = model.sensors[0];
  beam.axis = 'y';
  beam.origin = [0.06, -0.1, 0];
  assert.equal(sensor(model, trace).geometry, 'clear');
  beam.origin[2] = 0.035;
  assert.equal(sensor(model, trace).geometry, 'occupied');
  beam.axis = 'z';
  beam.origin = [0.06, 0, 0];
  beam.range = 0.01;
  assert.equal(sensor(model, trace).geometry, 'clear');
  beam.range = 0.03;
  assert.equal(sensor(model, trace).geometry, 'occupied');
});
test('uses all solid extents and correctly reverses the exit direction', () => {
  const {model, trace} = study();
  model.pieceSolids = [{kind: 'sphere', center: [0, 0, 0], radius: 0.04}];
  assert.equal(sensor(model, trace).geometry, 'occupied');
  model.pieceSolids.push({kind: 'box', center: [-0.08, 0, 0], halfSize: [0.01, 0.02, 0.03]});
  assert.ok(Math.abs(reviewSensors(model, trace).samples[3].gapM + 0.03) < 1e-10);
  model.support = {axis: 'x', direction: -1, end: -0.14};
  trace.samples[3].translation = [-0.2, 0, 0];
  assert.ok(Math.abs(reviewSensors(model, trace).samples[3].gapM - 0.02) < 1e-10);
});
test('conflicting, stale, missing and misattributed signals keep the transition unresolved', () => {
  const {model, trace, witness} = study();
  const row = trace.samples[1].readings;
  for (const bad of [{...row.inner, occupied: false}, {...row.inner, timeS: 0.1}, {...row.inner, timeS: 2},
    {...row.inner, attempt: 'prior'}, {...row.inner, piece: 'other'}, null]) {
    row.inner = bad;
    assert.equal(reviewSensors(model, trace, witness).releaseSupportedInStudy, false);
  }
  trace.samples[1].piece = 'other';
  assert.throws(() => reviewSensors(model, trace, witness), /identity/);
});
test('rotated material and oblique beams use the registered pose', () => {
  const {model, trace} = study();
  model.pieceSolids[0] = {kind: 'tube', axis: 'y', radius: 0.04, bore: 0.025, halfLength: 0.11, center: [0, 0, 0]};
  const beam = model.sensors[0];
  beam.origin = [-0.13, 0, 0];
  delete beam.axis;
  delete beam.direction;
  beam.unitDirection = [1, 0, 0];
  beam.range = 0.3;
  assert.equal(sensor(model, trace).geometry, 'occupied');
  trace.samples[1].quaternion = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  assert.equal(sensor(model, trace).geometry, 'clear');
  assert.ok(Math.abs(reviewSensors(model, trace).samples[1].gapM + 0.19) < 1e-9);
  beam.unitDirection = [Math.sqrt(0.99), 0.1, 0];
  beam.origin[1] = 0.02;
  assert.equal(sensor(model, trace).geometry, 'occupied');
  trace.samples[1].quaternion = [0, 0, 0, 0];
  assert.throws(() => reviewSensors(model, trace), /quaternion/);
});
test('a self-consistent always-clear sensor cannot distinguish seating', () => {
  const {model, trace, witness} = study();
  for (const s of model.sensors) s.range = 0.0001;
  for (const sample of trace.samples) {
    for (const id of ['inner', 'outer']) {
      model.expected[sample.phase][id] = false;
      sample.readings[id].occupied = false;
    }
  }
  const result = reviewSensors(model, trace, witness);
  assert.ok(result.samples.every(s => s.meetsDesign && s.observationsAgree));
  assert.equal(result.seatDistinguishable, false);
  assert.equal(result.releaseSupportedInStudy, false);
});
test('a finite support can clear diagonally before the piece passes its front plane', () => {
  const {model, trace, witness} = study();
  model.support.material = [{kind: 'box', center: [0, 0, -0.015], halfSize: [0.14, 0.15, 0.015]}];
  trace.samples[3].translation = [0.167, 0, 0.036];
  witness.separatingDirection = [0.6, 0, 0.8];
  const result = reviewSensors(model, trace, witness);
  assert.ok(result.samples[3].gapM < 0);
  assert.ok(Math.abs(result.finiteSupportGapM - 0.005) < 1e-9);
  assert.equal(result.releaseSupportedInStudy, true);
  model.support.material.push({kind: 'sphere', center: [...trace.samples[3].translation], radius: 0.01});
  assert.equal(reviewSensors(model, trace, witness).releaseSupportedInStudy, false);
  delete witness.separatingDirection;
  assert.equal(reviewSensors(model, trace, witness).releaseSupportedInStudy, false);
});
test('CLI binds the witness, trace and request to the exact input bytes', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optical-fixture-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const script = fileURLToPath(new URL('../examples/sensor-study/make-example.mjs', import.meta.url));
  execFileSync(process.execPath, [script, dir]);
  const file = path.join(dir, 'request.json');
  assert.equal((await runSensorStudy(file)).releaseSupportedInStudy, true);
  const layoutPath = path.join(dir, 'layout.json');
  await writeFile(layoutPath, (await readFile(layoutPath, 'utf8')) + ' ');
  await assert.rejects(runSensorStudy(file), /digest mismatch/);
});
