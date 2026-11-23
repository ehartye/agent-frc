/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { arcCheck, standOffBand } from '../scripts/concept-arc.mjs';

// Every fixture here is invented. Inches, seconds, degrees; z up; gravity 386.09 in/s².
const g = 386.09, rad = d => d * Math.PI / 180;
const close = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} differs from ${expected} by more than ${tolerance}`);
// Closed form: the launch speed at elevation e whose drag-free arc rises h over a horizontal run D.
const speedThrough = (D, h, e) => Math.sqrt(g * D * D / (2 * Math.cos(rad(e)) ** 2 * (D * Math.tan(rad(e)) - h)));
const port = (speed, elevation) => ({launchSpeedInS:{min:speed[0], max:speed[1]}, elevationDeg:{min:elevation[0], max:elevation[1]}});

test('reference window arc: fixed 45° elevation threads the opening centre at the closed-form speed', () => {
  // The window faces the release point (facing 180°, toward -x) 120 in away and 30 in above it.
  const target = {kind:'window', centerIn:[120, 0, 50], widthIn:20, heightIn:20, facingDeg:180, pieceRadiusIn:3};
  const result = arcCheck({positionIn:[0, 0, 20]}, target, port([100, 600], [45, 45]));
  const speed = speedThrough(120, 30, 45); // sqrt(386.09·120²/90) = 248.545 in/s
  assert.equal(result.feasible, true);
  close(result.elevationDeg, 45, 1e-9, 'elevation');
  close(result.speedInS, speed, 0.01, 'speed');
  close(result.flightS, 120 / (speed * Math.cos(rad(45))), 1e-4, 'flight time'); // 0.6828 s
  // Controls: the same arc arriving from behind the window, or with the opening shrunk below the piece, fails.
  assert.equal(arcCheck({positionIn:[0, 0, 20]}, {...target, facingDeg:0}, port([100, 600], [45, 45])).feasible, false);
  assert.equal(arcCheck({positionIn:[0, 0, 20]}, {...target, heightIn:5}, port([100, 600], [45, 45])).feasible, false);
});

test('reference ring arc: fixed 55° elevation descends through the ring centre at the closed-form speed', () => {
  const target = {kind:'ring', centerIn:[90, 120, 100], radiusIn:12, pieceRadiusIn:5}; // 150 in away in plan, 70 in up
  const result = arcCheck({positionIn:[0, 0, 30]}, target, port([100, 800], [55, 55]));
  const speed = speedThrough(150, 70, 55);
  assert.equal(result.feasible, true);
  close(result.speedInS, speed, 0.01, 'speed');
  close(result.flightS, 150 / (speed * Math.cos(rad(55))), 1e-4, 'flight time');
  // Control: a speed range too low to reach the ring on its descent.
  assert.equal(arcCheck({positionIn:[0, 0, 30]}, target, port([100, speed - 15], [55, 55])).feasible, false);
});

test('an entry above the reachable apex or outside the elevation range is infeasible and says why', () => {
  const apex = 30 + (300 * Math.sin(rad(60))) ** 2 / (2 * g); // 117.4 in
  const high = arcCheck({positionIn:[0, 0, 30]}, {kind:'ring', centerIn:[100, 0, 500], radiusIn:12, pieceRadiusIn:5},
    port([100, 300], [20, 60]));
  assert.equal(high.feasible, false);
  assert.match(high.reason, /apex/);
  assert.match(high.reason, new RegExp(apex.toFixed(1)));
  // A close, high window is reachable only by a steep arc; a fixed flat launcher cannot make it.
  const steep = {kind:'window', centerIn:[30, 0, 50], widthIn:12, heightIn:12, facingDeg:180, pieceRadiusIn:2};
  const flat = arcCheck({positionIn:[0, 0, 10]}, steep, port([100, 600], [20, 20]));
  assert.equal(flat.feasible, false);
  assert.match(flat.reason, /outside elevation range/);
  assert.equal(arcCheck({positionIn:[0, 0, 10]}, steep, port([100, 600], [20, 80])).feasible, true);
});

test('adjustable elevation gives a strictly wider stand-off band than a fixed elevation inside it', () => {
  const entry = {kind:'window', centerIn:[300, 100, 60], widthIn:24, heightIn:18, facingDeg:180, factId:'invented-window'};
  const speeds = {launchSpeedInS:{min:150, max:350}};
  const adjustable = standOffBand(entry, 4, {...speeds, elevationDeg:{min:20, max:60}}, 24);
  const fixed = standOffBand(entry, 4, {...speeds, elevationDeg:{min:40, max:40}}, 24);
  const inches = r => r.bands.flatMap(b => Array.from({length:b.maxIn - b.minIn + 1}, (_, i) => b.minIn + i));
  assert.equal(adjustable.feasibleAny, true);
  assert.equal(fixed.feasibleAny, true);
  assert.ok(inches(fixed).every(d => inches(adjustable).includes(d)), 'every fixed-elevation distance stays feasible');
  assert.ok(inches(adjustable).length > inches(fixed).length, 'the adjustable band covers more distances');
  // Each band distance passes the arc check on its own, and the band edge does not.
  const [first] = fixed.bands, release = d => ({positionIn:[300 - d, 100, 24]}); // in front of the opening, which faces -x
  assert.equal(arcCheck(release(first.minIn), {...entry, pieceRadiusIn:4}, {...speeds, elevationDeg:{min:40, max:40}}).feasible, true);
  assert.equal(arcCheck(release(first.minIn - 1), {...entry, pieceRadiusIn:4}, {...speeds, elevationDeg:{min:40, max:40}}).feasible, false);
  // No elevation or speed in range reaches an opening far above every arc.
  assert.deepEqual(standOffBand({...entry, centerIn:[300, 100, 900]}, 4, {...speeds, elevationDeg:{min:20, max:60}}, 24),
    {bands:[], feasibleAny:false});
});

test('the robot velocity adds to the launch velocity: a moving release lands on the hand-computed vector sum', () => {
  const s = 250, e = 45, vx = 40, vy = 30, pz = 30, cz = 40;
  const vz = s * Math.sin(rad(e)), T = (vz + Math.sqrt(vz * vz + 2 * g * (pz - cz))) / g; // descending crossing of z = 40
  const landing = [(s * Math.cos(rad(e)) + vx) * T, vy * T]; // horizontal launch velocity + robot velocity, times T
  const ring = {kind:'ring', centerIn:[landing[0], landing[1], cz], radiusIn:10, pieceRadiusIn:4};
  const fixed = {...port([s, s], [e, e]), azimuthDeg:0};
  const moving = arcCheck({positionIn:[0, 0, pz]}, ring, fixed, [vx, vy]);
  assert.equal(moving.feasible, true);
  close(moving.flightS, T, 1e-6, 'flight time');
  close(moving.speedInS, s, 1e-9, 'launch speed');
  // Stationary, the same launch falls short by the robot's contribution, (40, 30)·T ≈ 43 in, well outside the ring.
  assert.equal(arcCheck({positionIn:[0, 0, pz]}, ring, fixed).feasible, false);
  assert.equal(arcCheck({positionIn:[0, 0, pz]}, ring, fixed, [0, 0]).feasible, false);
});

test('invalid arc inputs are rejected', () => {
  const ok = [{positionIn:[0, 0, 20]}, {kind:'ring', centerIn:[100, 0, 40], radiusIn:10, pieceRadiusIn:4}, port([100, 400], [20, 60])];
  assert.equal(arcCheck(...ok).feasible, true);
  for (const [release, target, p, v] of [
    [{positionIn:[0, 0]}, ok[1], ok[2]],
    [ok[0], {...ok[1], kind:'hoop'}, ok[2]],
    [ok[0], {...ok[1], pieceRadiusIn:-1}, ok[2]],
    [ok[0], {...ok[1], kind:'window', widthIn:10, heightIn:10}, ok[2]],
    [ok[0], ok[1], port([400, 100], [20, 60])],
    [ok[0], ok[1], port([100, 400], [20, 95])],
    [ok[0], ok[1], {...ok[2], azimuthDeg:'north'}],
    [ok[0], ok[1], ok[2], [1]]
  ]) assert.throws(() => arcCheck(release, target, p, v), /Supply/);
  assert.throws(() => standOffBand(ok[1], 4, ok[2], -1), /Supply/);
});
