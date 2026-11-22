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

const onlyKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(k => keys.includes(k));

// Closing torque magnitude toward the stop. A linear law reaches zero at zeroAtRad on the opening side
// of contact and continues to rise through compression; a constant law acts throughout the interval.
function preloadLaw(spec, contactRad, direction) {
  if (spec === undefined) return {at: () => 0, integral: () => 0};
  requireValue(onlyKeys(spec, ['law','torqueNm','zeroAtRad','basis']) && label(spec.basis)
    && Number.isFinite(spec.torqueNm) && spec.torqueNm > 0,
    'A preload needs its law, a positive torque toward the stop at contact and its basis.');
  const T = spec.torqueNm;
  if (spec.law === 'constant') {
    requireValue(spec.zeroAtRad === undefined, 'A constant preload has no zero position; use a linear law.');
    return {at: () => T, integral: (a, b) => T*(b-a)};
  }
  requireValue(spec.law === 'linear', 'A preload law must be constant or linear.');
  const z = spec.zeroAtRad;
  requireValue(Number.isFinite(z) && Math.sign(z-contactRad) === -direction,
    'A linear preload needs zeroAtRad on the opening side of the stop contact.');
  const slope = T/(contactRad-z);
  return {at: q => Math.max(0, slope*(q-z)),
    integral(a, b) {
      const [u1, u2] = slope > 0 ? [Math.max(a, z), b] : [a, Math.min(b, z)];
      return u2 > u1 ? slope/2*((u2-z)**2 - (u1-z)**2) : 0;
    }, slope, z};
}

// Minimum of preload minus the stop-direction holding demand over [a, b]. Positive means the
// joint is driven toward the stop throughout. The preload is linear on each side of its zero.
function minimumDrive(preload, direction, A, B, a, b) {
  const holdingNm = q => -A*Math.sin(q) + B*Math.cos(q);
  const drive = q => preload.at(q) - direction*holdingNm(q);
  const cuts = [a, b];
  if (preload.z !== undefined && preload.z > a && preload.z < b) cuts.push(preload.z);
  cuts.sort((x, y) => x-y);
  const candidates = [...cuts];
  const M = Math.hypot(A, B), phase = Math.atan2(B, A);
  for (let i = 1; i < cuts.length; i++) {
    const [s0, s1] = [cuts[i-1], cuts[i]];
    const mid = (s0+s1)/2, slope = preload.slope !== undefined && preload.at(mid) > 0 ? preload.slope : 0;
    // d/dq drive = slope + direction*M*cos(q - phase)
    if (!(M > 0) || Math.abs(slope/M) > 1) continue;
    const root = Math.acos(-direction*slope/M);
    for (const base of [phase+root, phase-root]) {
      for (let k = Math.ceil((s0-base)/(2*Math.PI)); base+2*Math.PI*k <= s1; k++) candidates.push(base+2*Math.PI*k);
    }
  }
  return Math.min(...candidates.map(drive));
}

const STOP_KEYS = ['freeRad','compressionRad','preload','compliance','history'];
function evaluateStop(stop, {A, B, lo, hi, changeJ}, read) {
  requireValue(onlyKeys(stop, STOP_KEYS),
    'A stop record accepts only freeRad, compressionRad, preload, compliance and history.');
  const {freeRad, compressionRad} = stop;
  const end = freeRad + compressionRad;
  const endpointRoundoff = 4*Number.EPSILON*Math.abs(end);
  requireValue(Number.isFinite(freeRad) && Number.isFinite(compressionRad) && compressionRad !== 0 &&
    (freeRad === 0 || Math.sign(freeRad) === Math.sign(compressionRad)) &&
    lo-endpointRoundoff <= end && end <= hi+endpointRoundoff,
    'Stop free travel and compression must share one signed direction within the interval. Use freeRad 0 for a stop seated at the registered pose.');
  const direction = Math.sign(compressionRad);
  const preload = preloadLaw(stop.preload, freeRad, direction);
  if (stop.compliance !== undefined) {
    const c = stop.compliance;
    requireValue(onlyKeys(c, ['stiffnessNmPerRad','dampingNmSPerRad','basis']) && label(c.basis) &&
      Number.isFinite(c.stiffnessNmPerRad) && c.stiffnessNmPerRad > 0 &&
      Number.isFinite(c.dampingNmSPerRad) && c.dampingNmSPerRad >= 0,
      'Stop compliance needs positive stiffness, non-negative damping and its basis.');
  }
  const holdingAtContactNm = -A*Math.sin(freeRad) + B*Math.cos(freeRad);
  const preloadAtContactNm = preload.at(freeRad);
  // The unilateral stop can only push opposite its compression direction.
  const restingReactionNm = preloadAtContactNm - direction*holdingAtContactNm;
  const [a, b] = [Math.min(0, end), Math.max(0, end)];
  const downhill = minimumDrive(preload, direction, A, B, a, b) > 0;
  const preloadWorkToEndJ = preload.integral(a, b);
  const gravityWorkToEndJ = -changeJ(end);
  const result = {freeRad, compressionRad, direction, seated: freeRad === 0,
    preload: stop.preload ?? null, compliance: stop.compliance ?? null,
    gravityWorkToContactJ: -changeJ(freeRad), gravityWorkToEndJ, preloadAtContactNm, preloadWorkToEndJ,
    holdingAtContactNm, restingReactionNm,
    restingMarginNm: {registeredGravity: restingReactionNm,
      reversedGravity: preloadAtContactNm + direction*holdingAtContactNm},
    unresolvedAwayFromStopNm: Math.max(0, -restingReactionNm),
    custodyAtRest: restingReactionNm > 0 ? 'stop' : 'unresolved',
    staticCompressionRad: stop.compliance && restingReactionNm > 0 ? restingReactionNm/stop.compliance.stiffnessNmPerRad : null,
    downhillThroughout: downhill,
    meanResistingMagnitudeNmFromRest: downhill ? (gravityWorkToEndJ + preloadWorkToEndJ)/Math.abs(compressionRad) : null};
  if (stop.history !== undefined) result.duty = evaluateHistory(stop.history, direction, freeRad, read);
  return result;
}

// Piecewise-linear history clipped to one signed direction, with exact zero crossings and running integral.
function component(t, y, sense) {
  const u = [t[0]], v = [Math.max(0, sense*y[0])];
  for (let i = 1; i < t.length; i++) {
    const p = sense*y[i-1], q = sense*y[i];
    if (p*q < 0) { u.push(t[i-1] + (t[i]-t[i-1])*p/(p-q)); v.push(0); }
    u.push(t[i]); v.push(Math.max(0, q));
  }
  const C = [0];
  for (let k = 1; k < u.length; k++) C.push(C[k-1] + (u[k]-u[k-1])*(v[k]+v[k-1])/2);
  return {u, v, C};
}
function sample({u, v, C}, x) {
  let lo = 0, hi = u.length-1;
  if (x >= u[hi]) lo = hi-1;
  else while (hi-lo > 1) { const m = (lo+hi) >> 1; if (u[m] <= x) lo = m; else hi = m; }
  const f = (x-u[lo])/(u[lo+1]-u[lo]), value = v[lo] + (v[lo+1]-v[lo])*f;
  return {value, integral: C[lo] + (x-u[lo])*(v[lo]+value)/2};
}
// Largest mean over any window of the stated length. The window integral is piecewise quadratic in its
// start, so its maximum lies at a knot, a knot minus the window or a root of the linear derivative.
function sustained(c, windowS) {
  const first = c.u[0], lastStart = c.u.at(-1) - windowS;
  if (lastStart < first) return {windowS, meanNm: null, startS: null, reason: 'window exceeds the record'};
  const starts = new Set([first, lastStart]);
  for (const k of c.u) for (const s of [k, k-windowS]) if (s >= first && s <= lastStart) starts.add(s);
  const sorted = [...starts].sort((x, y) => x-y);
  const slope = s => sample(c, s+windowS).value - sample(c, s).value;
  const candidates = [...sorted];
  for (let i = 1; i < sorted.length; i++) {
    const [d0, d1] = [slope(sorted[i-1]), slope(sorted[i])];
    if (d0 > 0 && d1 < 0) candidates.push(sorted[i-1] + (sorted[i]-sorted[i-1])*d0/(d0-d1));
  }
  let best = {meanNm: -Infinity, startS: null};
  for (const s of candidates) {
    const meanNm = (sample(c, s+windowS).integral - sample(c, s).integral)/windowS;
    if (meanNm > best.meanNm) best = {meanNm, startS: s};
  }
  return {windowS, ...best};
}
function oneDirection(t, y, sense, windowsS) {
  const c = component(t, y, sense);
  const peak = c.v.reduce((k, x, i) => x > c.v[k] ? i : k, 0);
  return {peakNm: c.v[peak], peakTimeS: c.u[peak], sustained: windowsS.map(w => sustained(c, w))};
}

function contactHistory(t, q, contactRad, stopDirection, toleranceRad, settle) {
  const gap = q.map(x => stopDirection*(x-contactRad) + toleranceRad); // >= 0 while in contact
  let firstContactS = gap[0] >= 0 ? t[0] : null, contactDurationS = 0, separations = 0, maxReboundRad = 0;
  for (let i = 1; i < t.length; i++) {
    const [p, r, h] = [gap[i-1], gap[i], t[i]-t[i-1]];
    if (p >= 0 && r >= 0) contactDurationS += h;
    else if (p >= 0) { contactDurationS += h*p/(p-r); separations++; }
    else if (r >= 0) { const at = t[i-1] + h*(-p)/(r-p); contactDurationS += t[i]-at; firstContactS ??= at; }
    if (separations) maxReboundRad = Math.max(maxReboundRad, stopDirection*(contactRad-q[i]));
  }
  let last = -1;
  q.forEach((x, i) => { if (Math.abs(x-settle.targetRad) > settle.toleranceRad) last = i; });
  let settleS = null;
  if (last < 0) settleS = t[0];
  else if (last < q.length-1) {
    const edge = settle.targetRad + settle.toleranceRad*Math.sign(q[last]-settle.targetRad);
    settleS = t[last] + (t[last+1]-t[last])*(edge-q[last])/(q[last+1]-q[last]);
  }
  return {contactRad, toleranceRad, firstContactS, contactDurationS, separations, maxReboundRad,
    settle, settleS,
    returnAfterFirstContactS: settleS !== null && firstContactS !== null ? Math.max(0, settleS-firstContactS) : null};
}

function evaluateHistory(spec, stopDirection, contactRad, read) {
  requireValue(onlyKeys(spec, ['source','windowsS','contactToleranceRad','settle']) && spec.source &&
    typeof spec.source.pointer === 'string' && Array.isArray(spec.windowsS) && spec.windowsS.length &&
    spec.windowsS.every(w => Number.isFinite(w) && w > 0),
    'A stop history needs a pinned source with a JSON pointer and positive sustained windows in seconds.');
  const data = atPointer(read(spec.source), spec.source.pointer);
  const {units, timeS: t, restraintTorqueNm: y, angleRad: q} = data ?? {};
  requireValue(units?.time === 's' && units?.torque === 'N·m' && (q === undefined || units?.angle === 'rad'),
    'Declare history units as time s, torque N·m and angle rad.');
  requireValue(Array.isArray(t) && t.length >= 2 && t.every((x, i) => Number.isFinite(x) && (i === 0 || x > t[i-1])),
    'History time must be finite and strictly increasing.');
  requireValue(Array.isArray(y) && y.length === t.length && y.every(Number.isFinite),
    'Each history sample needs a finite signed restraint torque.');
  let contact = null;
  if (q === undefined) {
    requireValue(spec.contactToleranceRad === undefined && spec.settle === undefined,
      'Contact and settling settings need a recorded angle.');
  } else {
    const s = spec.settle;
    requireValue(Array.isArray(q) && q.length === t.length && q.every(Number.isFinite) &&
      Number.isFinite(spec.contactToleranceRad) && spec.contactToleranceRad >= 0 &&
      onlyKeys(s, ['targetRad','toleranceRad']) && Number.isFinite(s.targetRad) &&
      Number.isFinite(s.toleranceRad) && s.toleranceRad > 0,
      'A pose history needs finite angles, a contact tolerance and a settling target and band.');
    contact = contactHistory(t, q, contactRad, stopDirection, spec.contactToleranceRad, s);
  }
  const directions = {positive: oneDirection(t, y, 1, spec.windowsS), negative: oneDirection(t, y, -1, spec.windowsS)};
  const stopServes = stopDirection < 0 ? 'positive' : 'negative';
  const opposite = stopServes === 'positive' ? 'negative' : 'positive';
  return {source: spec.source, samples: t.length, startS: t[0], endS: t.at(-1), windowsS: spec.windowsS,
    stopServes, directions, unresolvedByStop: directions[opposite].peakNm > 0, contact};
}

function calculate(pose, gravity, read) {
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
  if (pose.stop) result.stop = evaluateStop(pose.stop, {A, B, lo, hi, changeJ}, read);
  const s = result.stop;
  requireValue([movingMassKg,A,B,holding.min.value,holding.max.value,...result.potentialChangeAtEndsJ,
    s?.gravityWorkToContactJ ?? 0,s?.gravityWorkToEndJ ?? 0,s?.preloadWorkToEndJ ?? 0,s?.restingReactionNm ?? 0,
    s?.meanResistingMagnitudeNmFromRest ?? 0].every(Number.isFinite),'Numerically unbounded result.');
  return result;
}

export function reviewRotaryHolding(input, read) {
  requireValue(input?.schema === 'agent-frc/rotary-holding-study@1','Expected rotary-holding-study@1.');
  const model = atPointer(read(input.source), input.source.pointer);
  requireValue(label(model.revision) && vector(model.gravityMps2) && Math.hypot(...model.gravityMps2) > 0 &&
    Array.isArray(model.poses) && model.poses.length && new Set(model.poses.map(p => p.id)).size === model.poses.length,
    'Supply one identified revision, world gravity vector and distinct registered poses.');
  return {schema:'agent-frc/rotary-holding-result@1', revision:model.revision, source:input.source,
    cases:model.poses.map(pose => calculate(pose, model.gravityMps2, read)),
    scope:'Analytic gravity demand for the listed rigid members about one fixed axis. A stop mean assumes release from rest and only gravity and declared preload work. A recorded stop duty summarizes only the supplied history. Moving disable, achieved clearance, installed holding capacity and pad or spring ratings require separate evidence.'};
}
