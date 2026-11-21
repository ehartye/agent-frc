import {atPointer, label} from './study-evidence.mjs';
import {studyRows} from './strategy-lab.mjs';

const finite = Number.isFinite;
const pair = v => Array.isArray(v) && v.length === 2 && v.every(finite);
const distinctRoster = ids => Array.isArray(ids) && ids.length > 0 && ids.every(label) && new Set(ids).size === ids.length;

// The plan selects a rigid body moving in the world XY plane. Only Fx, Fy and Mz are tested here.
export function planarSupport(plan, def, identity, observed, read) {
  try {
    return check(plan, def, identity, observed, read);
  } catch (error) {
    return {status:'open', reason:error.message};
  }
}

function check(plan, def, identity, observed, read) {
  const contract = plan.planarBoundary;
  const open = reason => ({status: 'open', reason});
  const {massLedger, motionByCase, memberIds, massToleranceKg, cgToleranceM} = contract;
  const motionRef = motionByCase?.[def.id];
  if (!massLedger || !motionRef || !distinctRoster(memberIds) || !finite(massToleranceKg) || massToleranceKg < 0
      || !finite(cgToleranceM) || cgToleranceM < 0)
    return open('Commission the complete mass roster, mass tolerance and a motion sample for this boundary case.');
  if (new Set([massLedger.sha256, motionRef.sha256, def.source.sha256]).size !== 3)
    return open('Register separate mass-property, kinematic and reaction evidence.');
  const ledger = atPointer(read(massLedger), massLedger.pointer);
  const motion = atPointer(read(motionRef), motionRef.pointer);
  if (![ledger, motion].every(r => r?.body === plan.body && r.revision === plan.revision && r.frame === plan.frame))
    return open('Mass, motion and reactions must describe the same body, configuration and world frame.');
  if (ledger.units !== 'kg,m,kg*m2' || motion.units !== 'm/s2,rad/s2' || motion.model !== 'rigid-world-xy'
      || !['kinematic-observation','prescribed-kinematics','force-derived-prediction'].includes(motion.basis) || !label(motion.provenance)
      || motion.runId !== identity?.runId || motion.caseId !== def.id || motion.timeS !== identity?.timeS
      || motion.mode !== identity?.mode || !pair(motion.cgAccelerationXY) || !finite(motion.yawAcceleration))
    return open('Identify the exact run, clock, planar model and independent signed acceleration at its mass center.');
  const members = studyRows(ledger.members, 'mass element', 1, 100000);
  const required = new Set(memberIds);
  if (members.length !== required.size || !members.every(m => required.has(m.id) && finite(m.massKg) && m.massKg > 0
      && pair(m.centerXYM) && finite(m.centroidYawKgM2) && m.centroidYawKgM2 >= 0))
    return open('Resolve every commissioned mass, centroid and centroidal polar inertia once.');
  const massKg = members.reduce((sum, m) => sum + m.massKg, 0);
  const cgXYM = [0,1].map(i => members.reduce((sum, m) => sum + m.massKg * m.centerXYM[i], 0) / massKg);
  const yawKgM2 = members.reduce((sum, m) => sum + m.centroidYawKgM2
    + m.massKg * ((m.centerXYM[0] - cgXYM[0]) ** 2 + (m.centerXYM[1] - cgXYM[1]) ** 2), 0);
  const forceXYN = motion.cgAccelerationXY.map(a => massKg * a);
  const momentAtCgNm = yawKgM2 * motion.yawAcceleration;
  const expected = {massKg, cgXYM, yawKgM2, forceXYN, momentAtCgNm};
  if (!(yawKgM2 > 0) || ![massKg, yawKgM2, ...cgXYM, ...forceXYN, momentAtCgNm].every(finite))
    return open('The mass ledger does not determine a finite planar inertia.');
  const checks = [
    [massKg, observed.mass, massToleranceKg],
    [momentAtCgNm, observed.inertialAtCg[2], plan.momentToleranceNm],
  ];
  for (const [reference, actual, tolerance] of [[cgXYM, observed.cg, cgToleranceM],
         [forceXYN, observed.inertialF, plan.forceToleranceN]]) {
    const delta = reference.map((v, i) => finite(actual[i]) ? actual[i] - v : null);
    checks.push([0, Math.hypot(...delta.filter(finite)), tolerance]);
    if (delta.includes(null)) checks.push([0, null, tolerance]);
  }
  const failed = checks.some(([ref, value, tolerance]) => finite(value) && Math.abs(value - ref) > tolerance);
  const consistency = failed ? 'fail' : checks.every(([, value]) => finite(value)) ? 'pass' : 'open';
  const status = consistency === 'pass' && motion.basis !== 'kinematic-observation' ? 'open' : consistency;
  return {status, consistency, basis:motion.basis, ...expected, massLedger, motion: motionRef, memberCount: members.length,
    reported:{massKg:observed.mass, cgXYM:observed.cg.slice(0,2), forceXYN:observed.inertialF.slice(0,2),
      momentAtCgNm:observed.inertialAtCg[2]}};
}
