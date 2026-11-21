import {atPointer, label} from './study-evidence.mjs';

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const requireValue = (ok, message) => { if (!ok) throw Error(message); };

// A cos(q) + B sin(q) repeats. Inspect its endpoints and the first interior
// extremum of each sign, even on intervals spanning multiple revolutions.
function extrema(A, B, lo, hi) {
  const value = q => A*Math.cos(q) + B*Math.sin(q);
  const angles = [lo, hi];
  const period = 2*Math.PI;
  for (const phase of [Math.atan2(B, A), Math.atan2(B, A) + Math.PI]) {
    const q = phase + period*Math.ceil((lo-phase)/period);
    if (q >= lo && q <= hi) angles.push(q);
  }
  const rows = angles.map(angleRad => ({angleRad, value: value(angleRad)})).sort((a,b) => a.value-b.value);
  return {min: rows[0], max: rows.at(-1)};
}

function calculate(pose, gravity) {
  const {id, axisUnit: axis, originM, intervalRad, members, omissions} = pose;
  requireValue(label(id) && label(pose.frame) && label(pose.custody) && label(pose.otherAxesHeld),
    'Identify the case, common world frame, payload custody and held-axis configuration.');
  requireValue(vector(originM) && vector(axis) && Math.abs(Math.hypot(...axis)-1) < 1e-12,
    'Supply the pivot and a signed unit axis in the common frame.');
  requireValue(Array.isArray(intervalRad) && intervalRad.length === 2 && intervalRad.every(Number.isFinite)
    && intervalRad[0] <= 0 && intervalRad[1] >= 0, 'The signed interval must include the registered zero pose.');
  requireValue(Array.isArray(omissions) && omissions.every(label), 'List omitted or unquantified moving stock.');
  requireValue(Array.isArray(members) && members.length && new Set(members.map(m => m.id)).size === members.length,
    'Supply distinct registered members.');
  const firstMoment = [0,0,0];
  let movingMassKg = 0;
  for (const member of members) {
    requireValue(label(member.id) && label(member.basis) && ['fixed','moving'].includes(member.role),
      'Identify each article, mass/position basis and fixed or moving role.');
    if (member.role === 'fixed') continue;
    requireValue(vector(member.cgM) && Number.isFinite(member.massKg) && member.massKg > 0,
      'Each moving article needs positive mass and a center in the common frame.');
    movingMassKg += member.massKg;
    for (let i = 0; i < 3; i++) firstMoment[i] += member.massKg*(member.cgM[i]-originM[i]);
  }
  requireValue(movingMassKg > 0, 'No moving mass was registered.');
  const along = dot(firstMoment, axis);
  const radial = firstMoment.map((v,i) => v - along*axis[i]);
  // Potential relative to the registered start: A*(cos(q)-1) + B*sin(q).
  const A = -dot(gravity, radial);
  const B = -dot(gravity, cross(axis, radial));
  const changeJ = q => -2*A*Math.sin(q/2)**2 + B*Math.sin(q);
  const [lo, hi] = intervalRad;
  const holding = extrema(B, -A, lo, hi);
  const result = {id, frame: pose.frame, custody: pose.custody, otherAxesHeld: pose.otherAxesHeld,
    omissions, movingMassKg, startHoldingNm: B, holdingExtremaNm: holding,
    potentialChangeAtEndsJ: [changeJ(lo),changeJ(hi)], intervalRad};
  if (pose.stop) {
    const {freeRad, compressionRad} = pose.stop;
    const end = freeRad + compressionRad;
    const endpointRoundoff = 4*Number.EPSILON*Math.abs(end);
    requireValue(Number.isFinite(freeRad) && Number.isFinite(compressionRad) && freeRad !== 0 &&
      Math.sign(freeRad) === Math.sign(compressionRad) && lo-endpointRoundoff <= end && end <= hi+endpointRoundoff,
      'Stop free travel and compression must share one signed direction within the interval.');
    const torque = extrema(B, -A, Math.min(0,end), Math.max(0,end));
    const downhill = freeRad > 0 ? torque.max.value < 0 : torque.min.value > 0;
    result.stop = {freeRad, compressionRad, gravityWorkToContactJ: -changeJ(freeRad),
      gravityWorkToEndJ: -changeJ(end), downhillThroughout: downhill,
      meanResistingMagnitudeNmFromRest: downhill ? -changeJ(end)/Math.abs(compressionRad) : null};
  }
  requireValue([movingMassKg,A,B,holding.min.value,holding.max.value,...result.potentialChangeAtEndsJ,
    result.stop?.gravityWorkToContactJ ?? 0,result.stop?.gravityWorkToEndJ ?? 0,
    result.stop?.meanResistingMagnitudeNmFromRest ?? 0].every(Number.isFinite),'Numerically unbounded result.');
  return result;
}

export function reviewRotaryHolding(input, read) {
  requireValue(input?.schema === 'agent-frc/rotary-holding-study@1','Expected rotary-holding-study@1.');
  const model = atPointer(read(input.source), input.source.pointer);
  requireValue(label(model.revision) && vector(model.gravityMps2) && Math.hypot(...model.gravityMps2) > 0 &&
    Array.isArray(model.poses) && model.poses.length && new Set(model.poses.map(p => p.id)).size === model.poses.length,
    'Supply one identified revision, world gravity vector and distinct registered poses.');
  return {schema:'agent-frc/rotary-holding-result@1', revision:model.revision, source:input.source,
    cases:model.poses.map(pose => calculate(pose, model.gravityMps2)),
    scope:'Analytic gravity demand for the listed rigid members about one fixed axis. A stop mean assumes release from rest and only gravity work. Moving disable, achieved clearance, peak loads and installed holding capacity require separate evidence.'};
}
