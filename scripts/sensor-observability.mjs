import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const axes = ['x', 'y', 'z'];
const phases = ['approach', 'seated', 'early-exit', 'cleared'];
const finite = Number.isFinite;
const named = value => typeof value === 'string' && value.trim().length > 0;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(finite);
const positive = value => finite(value) && value > 0;

function requireValue(condition, message) {
  if (!condition) throw Error(message);
}

function checkSolid(solid) {
  requireValue(vector(solid?.center), 'Every solid needs a finite local center.');
  if (solid.kind === 'box') {
    requireValue(vector(solid.halfSize) && solid.halfSize.every(positive), 'Invalid box half sizes.');
  } else if (solid.kind === 'sphere') {
    requireValue(positive(solid.radius), 'Invalid sphere radius.');
  } else {
    requireValue(solid.kind === 'tube' && axes.includes(solid.axis) && positive(solid.halfLength)
      && positive(solid.radius) && finite(solid.bore) && solid.bore >= 0 && solid.bore < solid.radius,
    'Supply a box, sphere or finite axial tube with defined material dimensions.');
  }
}

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const basis = axis => axes.map((_, i) => Number(i === axis));
const identity = axes.map((_, i) => basis(i));

// Columns of the piece-to-carriage rotation. A missing attitude means aligned frames.
function rotation(quaternion) {
  if (quaternion === undefined) return identity;
  requireValue(Array.isArray(quaternion) && quaternion.length === 4 && quaternion.every(finite)
    && Math.abs(Math.hypot(...quaternion) - 1) <= 1e-8, 'Supply a unit quaternion in w,x,y,z order.');
  const norm = Math.hypot(...quaternion);
  const [w, x, y, z] = quaternion.map(v => v / norm);
  return [
    [1 - 2*(y*y + z*z), 2*(x*y + w*z), 2*(x*z - w*y)],
    [2*(x*y - w*z), 1 - 2*(x*x + z*z), 2*(y*z + w*x)],
    [2*(x*z + w*y), 2*(y*z - w*x), 1 - 2*(x*x + y*y)]
  ];
}

function extent(solid, direction) {
  if (solid.kind === 'box') return dot(solid.halfSize, direction.map(Math.abs));
  if (solid.kind === 'sphere') return solid.radius;
  const axis = axes.indexOf(solid.axis);
  return Math.abs(direction[axis]) * solid.halfLength
    + Math.hypot(...direction.filter((_, i) => i !== axis)) * solid.radius;
}

function slab(origin, direction, halfSize) {
  if (direction === 0) return Math.abs(origin) <= halfSize ? [-Infinity, Infinity] : null;
  const first = (-halfSize - origin) / direction;
  const last = (halfSize - origin) / direction;
  return [Math.min(first, last), Math.max(first, last)];
}

function common(a, b) {
  if (!a || !b) return null;
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
}

// Interval inside a disk (two components) or ball (three) on the same ray parameter.
function ball(origin, direction, radius) {
  const squareSpeed = dot(direction, direction);
  if (squareSpeed === 0) return Math.hypot(...origin) <= radius ? [-Infinity, Infinity] : null;
  const mid = -dot(origin, direction) / squareSpeed;
  const closest = Math.hypot(...origin.map((v, i) => v + mid * direction[i]));
  if (closest > radius) return null;
  const half = Math.sqrt((radius - closest) * (radius + closest) / squareSpeed);
  return [mid - half, mid + half];
}

function firstHit(solid, start, direction, range) {
  const origin = start.map((v, i) => v - solid.center[i]);
  let span = [0, range];
  if (solid.kind === 'box') {
    for (let i = 0; i < 3; i++) span = common(span, slab(origin[i], direction[i], solid.halfSize[i]));
  } else if (solid.kind === 'sphere') {
    span = common(span, ball(origin, direction, solid.radius));
  } else {
    const axis = axes.indexOf(solid.axis);
    const crossOrigin = origin.filter((_, i) => i !== axis);
    const crossDir = direction.filter((_, i) => i !== axis);
    span = common(span, slab(origin[axis], direction[axis], solid.halfLength));
    span = common(span, ball(crossOrigin, crossDir, solid.radius));
    if (span && solid.bore > 0) {
      const startRadius = Math.hypot(...crossOrigin.map((v, i) => v + span[0] * crossDir[i]));
      if (startRadius < solid.bore) {
        const boreExit = ball(crossOrigin, crossDir, solid.bore)?.[1];
        return boreExit <= span[1] ? boreExit : Infinity;
      }
    }
  }
  return span ? span[0] : Infinity;
}

function beamDirection(sensor) {
  if (sensor.unitDirection !== undefined) {
    requireValue(vector(sensor.unitDirection) && Math.abs(Math.hypot(...sensor.unitDirection) - 1) <= 1e-8
      && sensor.axis === undefined && sensor.direction === undefined, 'Supply one normalized sensor direction.');
    return sensor.unitDirection.map(v => v / Math.hypot(...sensor.unitDirection));
  }
  requireValue(axes.includes(sensor.axis) && [1, -1].includes(sensor.direction), 'Invalid sensor direction.');
  return basis(axes.indexOf(sensor.axis)).map(v => v * sensor.direction);
}

function firstMaterial(sensor, solids, translation, orientation) {
  const offset = sensor.origin.map((v, i) => v - translation[i]);
  const start = orientation.map(column => dot(column, offset));
  const beam = beamDirection(sensor);
  const direction = orientation.map(column => dot(column, beam));
  return solids.reduce((nearest, solid) => Math.min(nearest, firstHit(solid, start, direction, sensor.range)), Infinity);
}

function validate(model, trace) {
  requireValue(model?.units === 'm' && named(model.frame) && trace?.frame === model.frame
    && trace.clock === model.clock && named(model.clock), 'Declare the same frame and clock.');
  requireValue(named(trace.attempt) && named(trace.piece) && positive(model.clearanceM)
    && finite(model.maxAgeS) && model.maxAgeS >= 0, 'Identify the attempt, piece and timing/clearance limits.');
  requireValue(axes.includes(model.support?.axis) && [1, -1].includes(model.support.direction)
    && finite(model.support.end), 'Invalid support exit plane.');
  requireValue(Array.isArray(model.pieceSolids) && model.pieceSolids.length > 0
    && Array.isArray(model.obstacles), 'Supply piece material and an explicit obstruction inventory.');
  [...model.pieceSolids, ...model.obstacles].forEach(checkSolid);
  if (model.support.material !== undefined) {
    requireValue(Array.isArray(model.support.material) && model.support.material.length > 0,
      'Finite-support separation needs the material bounds of every support body.');
    model.support.material.forEach(checkSolid);
  }
  requireValue(Array.isArray(model.sensors) && model.sensors.length > 0, 'Supply at least one mounted sensor.');
  const names = new Set();
  for (const s of model.sensors) {
    requireValue(named(s?.id) && !names.has(s.id) && vector(s.origin)
      && positive(s.range) && ['reflective', 'through'].includes(s.mode),
    'Invalid or duplicate mounted sensor.');
    beamDirection(s);
    names.add(s.id);
  }
  for (const phase of phases) {
    const expected = model.expected?.[phase];
    requireValue(expected && Object.keys(expected).length === names.size
      && [...names].every(id => Object.hasOwn(expected, id) && typeof expected[id] === 'boolean'),
    'Declare each expected sensor state for ' + phase);
  }
  requireValue(Array.isArray(trace.samples) && trace.samples.length === phases.length,
    'Supply ordered approach, seated, early-exit and cleared samples.');
  let previous = -Infinity;
  for (const [i, sample] of trace.samples.entries()) {
    requireValue(sample?.phase === phases[i] && finite(sample.timeS) && sample.timeS >= 0 && sample.timeS > previous
      && vector(sample.translation) && sample.attempt === trace.attempt && sample.piece === trace.piece,
    'Sample phase, time, pose or attempt/piece identity is inconsistent.');
    previous = sample.timeS;
  }
}

function current(observation, sample, maxAgeS) {
  return observation && observation.attempt === sample.attempt && observation.piece === sample.piece
    && finite(observation.timeS) && observation.timeS >= 0 && observation.timeS <= sample.timeS
    && sample.timeS - observation.timeS <= maxAgeS;
}

export function reviewSensors(model, trace, witness = null) {
  validate(model, trace);
  const axis = axes.indexOf(model.support.axis);
  const sign = model.support.direction;
  const sensorIds = model.sensors.map(s => s.id);
  const samples = trace.samples.map(sample => {
    const orientation = rotation(sample.quaternion);
    const axisInPiece = orientation.map(column => column[axis]);
    const sensors = model.sensors.map(sensor => {
      const piece = firstMaterial(sensor, model.pieceSolids, sample.translation, orientation);
      const obstacle = firstMaterial(sensor, model.obstacles, [0, 0, 0], identity);
      const blocked = finite(obstacle) && (sensor.mode === 'through' || obstacle <= piece);
      const geometry = blocked ? 'obstructed' : finite(piece) ? 'occupied' : 'clear';
      const expected = model.expected[sample.phase][sensor.id] ? 'occupied' : 'clear';
      const reading = sample.readings?.[sensor.id];
      let observation = 'missing-or-stale';
      if (current(reading, sample, model.maxAgeS) && typeof reading.occupied === 'boolean') {
        observation = geometry === (reading.occupied ? 'occupied' : 'clear') ? 'agrees' : 'disagrees';
      }
      return {id: sensor.id, geometry, expected, observation, matchesDesign: geometry === expected};
    });
    const gapM = model.pieceSolids.reduce((min, solid) => Math.min(min,
      sign * (dot(solid.center, axisInPiece) + sample.translation[axis] - model.support.end)
      - extent(solid, axisInPiece)), Infinity);
    requireValue(finite(gapM), 'Projection overflowed.');
    return {phase: sample.phase, timeS: sample.timeS, sensors, gapM,
      meetsDesign: sensors.every(s => s.matchesDesign), observationsAgree: sensors.every(s => s.observation === 'agrees')};
  });
  const last = trace.samples.at(-1);
  let finiteSupportGapM = null;
  if (model.support.material && witness?.separatingDirection !== undefined) {
    const n = witness.separatingDirection;
    requireValue(vector(n) && Math.abs(Math.hypot(...n) - 1) <= 1e-8, 'Invalid finite-support separating direction.');
    const direction = n.map(v => v / Math.hypot(...n));
    const local = rotation(last.quaternion).map(column => dot(column, direction));
    const nearest = model.pieceSolids.reduce((min, solid) => Math.min(min,
      dot(last.translation, direction) + dot(solid.center, local) - extent(solid, local)), Infinity);
    const furthest = model.support.material.reduce((max, solid) => Math.max(max,
      dot(solid.center, direction) + extent(solid, direction)), -Infinity);
    finiteSupportGapM = nearest - furthest;
    requireValue(finite(finiteSupportGapM), 'Finite support projection overflowed.');
  }
  // Require a witness at the pose being assessed. A fresh earlier gap can close again.
  const independentClearance = witness?.clock === model.clock && witness.frame === model.frame
    && witness.units === 'm' && witness.timeS === last.timeS && current(witness, last, 0)
    && ['independent-geometry', 'independent-measurement'].includes(witness.method)
    && named(witness.source) && !sensorIds.includes(witness.source)
    && finite(witness.gapM) && witness.gapM >= model.clearanceM;
  const seated = samples.find(sample => sample.phase === 'seated');
  const seatDistinguishable = seated.sensors.some(s => s.geometry === 'occupied')
    && samples.filter(s => s !== seated).every(other => seated.sensors.some((s, i) =>
      s.geometry !== 'obstructed' && other.sensors[i].geometry !== 'obstructed' && s.geometry !== other.sensors[i].geometry));
  const designConsistent = seatDistinguishable && samples.every(s => s.meetsDesign);
  const observationsConsistent = samples.every(s => s.observationsAgree);
  const clearsSupport = model.support.material
    ? finiteSupportGapM !== null && finiteSupportGapM >= model.clearanceM
    : samples.at(-1).gapM >= model.clearanceM;
  return {samples, finiteSupportGapM, seatDistinguishable, designConsistent, observationsConsistent,
    releaseScope: {geometry: model.support.material ? 'declared-support-material' : 'declared-exit-plane',
      wholeRobotClearance: 'requires-separate-assembly-evidence'},
    independentClearance: Boolean(independentClearance),
    releaseSupportedInStudy: Boolean(independentClearance && designConsistent && observationsConsistent
      && clearsSupport),
    calibratedDetection: 'requires-device-qualification'};
}

async function pinned(base, ref) {
  requireValue(named(ref?.file) && /^[a-f0-9]{64}$/.test(ref.sha256), 'Supply the file and its SHA-256 digest.');
  const bytes = await readFile(path.resolve(base, ref.file));
  requireValue(createHash('sha256').update(bytes).digest('hex') === ref.sha256, 'Source digest mismatch for ' + ref.file);
  return JSON.parse(bytes);
}

export async function runSensorStudy(file) {
  const request = JSON.parse(await readFile(file, 'utf8'));
  const base = path.dirname(path.resolve(file));
  const model = await pinned(base, request.model);
  const trace = await pinned(base, request.trace);
  const witness = request.witness ? await pinned(base, request.witness) : null;
  requireValue(trace.modelSha256 === request.model.sha256, 'Trace was recorded against another model.');
  if (witness) requireValue(witness.modelSha256 === request.model.sha256 && witness.traceSha256 === request.trace.sha256,
    'Clearance witness refers to different model or trace bytes.');
  return {modelSha256: request.model.sha256, traceSha256: request.trace.sha256,
    witnessSha256: request.witness?.sha256 ?? null, ...reviewSensors(model, trace, witness)};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    requireValue(process.argv.length === 3, 'Usage: node scripts/sensor-observability.mjs request.json');
    console.log(JSON.stringify(await runSensorStudy(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
