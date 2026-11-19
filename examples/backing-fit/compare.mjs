// Check evidence for one installed support against an independently inventoried assembly.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { nativeBodyKey } from '../../scripts/native-identity.mjs';

const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isFinite(value) && value > 0;
const nonnegative = value => Number.isFinite(value) && value >= 0;
function key(id) {
  if (!Array.isArray(id) || id.length !== 2) throw Error('Expected occurrence path and local body ID');
  return nativeBodyKey(...id);
}
function index(rows, field) {
  if (!Array.isArray(rows)) throw Error('Expected observations array');
  const map = new Map();
  for (const row of rows) {
    const id = key(row[field]);
    if (map.has(id)) throw Error('Duplicate physical identity: ' + id);
    map.set(id, row);
  }
  return map;
}
function box(value) {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite)
    && value.slice(0, 3).every((v, i) => v < value[i + 3]);
}
function checkPlan(plan) {
  if (plan?.schema !== 'backing-fit-plan@1' || !positive(plan.intersectionThresholdMm3)
      || plan.intersectionThresholdMm3 >= 1 || !positive(plan.locationToleranceMm)) throw Error('Invalid fit plan or thresholds');
  const bodies = index(plan.installed, 'id');
  const bearings = index(plan.bearing, 'id');
  const support = key(plan.support);
  if (bodies.get(support)?.role !== 'structure' || !bearings.size || !plan.installed.some(x => x.role === 'cover')) {
    throw Error('Expected physical cover, support and bearing interfaces');
  }
  for (const body of bodies.values()) {
    if (body.expectedDisplay && !['bodyBulb', 'occurrenceVisible'].every(k => typeof body.expectedDisplay[k] === 'boolean')) {
      throw Error('Expected explicit display states');
    }
    if (!['cover', 'backing', 'structure', 'other'].includes(body.role) || !box(body.expectedBoundsMm)) {
      throw Error('Expected installed role and independently placed solid bounds');
    }
  }
  for (const [id, bearing] of bearings) {
    if (bodies.get(id)?.role !== 'backing' || !positive(bearing.minimumMm2)
        || ('maximumMm2' in bearing && (!positive(bearing.maximumMm2) || bearing.maximumMm2 < bearing.minimumMm2))) throw Error('Invalid backing area requirement');
  }
  for (const area of ['dimensions', 'attachment', 'impact']) {
    if (typeof plan.scopeNotes?.[area] !== 'string' || !plan.scopeNotes[area].trim()) {
      throw Error('Provide an evidence pointer or explicit unknown for ' + area);
    }
  }
  const stages = plan.replacement ? ['candidate', 'successor'] : ['candidate'];
  if (plan.replacement) {
    const old = key(plan.replacement.remove);
    if (old === support || bodies.get(old)?.role !== 'structure' || key(plan.replacement.replaceWith) !== support) {
      throw Error('Invalid old and replacement physical identities');
    }
  }
  if (stages.some(stage => !digest(plan.archives?.[stage])) || new Set(stages.map(x=>plan.archives[x])).size !== stages.length) {
    throw Error('Independently pin distinct reviewed archive revisions');
  }
  return { bodies, bearings, support, stages };
}

function visibility(row) {
  const keys = ['bodyBulb', 'occurrenceBulb', 'occurrenceVisible'];
  return keys.every(k => typeof row.before?.[k] === 'boolean' && row.before[k] === row.after?.[k]);
}
function evaluate(stage, observed, plan, model) {
  const expected = new Map(model.bodies);
  if (stage === 'successor') expected.delete(key(plan.replacement.remove));
  const result = { status: 'INCOMPLETE', complete:false, expectedBacking: [...expected.values()].filter(r=>r.role==='backing').length,
    recoveredBacking: [], missing: [], unexpected: [], unresolved: [], collisions: [], belowThreshold: [], bearingShortfalls: [], pairs: [] };
  if (!observed) { result.unresolved.push('No observed archive'); return result; }
  if (observed.archiveSha256 !== plan.archives[stage] || observed.reopened !== true) {
    result.unresolved.push('Reopened archive identity unverified'); return result;
  }
  const physical = index(observed.physical, 'id');
  const pairs = index(observed.pairs, 'other');
  const controls = observed.controls;
  const reference = {known1Mm3:1,disjointMm3:0,known2Mm2:2,coplanarApartMm2:0};
  const validControls = Object.entries(reference).every(([field,value]) => nonnegative(controls?.[field])
    && Math.abs(controls[field]-value) <= 1e-7);
  if (!validControls) result.unresolved.push('Failed positive, disjoint or trimmed-face control');
  for (const [id, entry] of physical) if (!expected.has(id)) result.unexpected.push(entry.id);
  for (const [id, pair] of pairs) if (!expected.has(id) || id === model.support) result.unexpected.push(pair.other);
  for (const [id, entry] of expected) {
    const row = physical.get(id);
    if (!row) { result.missing.push(entry.id); continue; }
    if (!visibility(row) || (entry.expectedDisplay && ['bodyBulb', 'occurrenceVisible'].some(k => row.before[k] !== entry.expectedDisplay[k]))) {
      result.unresolved.push({id:entry.id, reason:'Unexpected or changed display state'});
    }
    if (!box(row.boundsMm) || row.boundsMm.some((v,i)=>Math.abs(v-entry.expectedBoundsMm[i]) > plan.locationToleranceMm)) {
      result.unresolved.push({id:entry.id, reason:'Unregistered body placement'});
    }
    if (entry.role === 'backing') result.recoveredBacking.push({id:entry.id, boundsMm:row.boundsMm, display:row.before});
    if (id === model.support) continue;
    const pair = pairs.get(id);
    if (!pair || 'unknown' in pair || !nonnegative(pair.intersectionMm3) || !nonnegative(pair.minimumDistanceMm)) {
      result.unresolved.push({id:entry.id, reason:'Unresolved pair geometry'}); continue;
    }
    result.pairs.push(pair);
    if (pair.intersectionMm3 > 0 && pair.minimumDistanceMm > plan.locationToleranceMm) {
      result.unresolved.push({id:entry.id, reason:'Positive material conflicts with separation'});
    }
    if (pair.intersectionMm3 > plan.intersectionThresholdMm3) result.collisions.push(pair);
    else if (pair.intersectionMm3 > 0) result.belowThreshold.push(pair);
    const demand = model.bearings.get(id);
    if (demand) {
      if (!nonnegative(pair.opposedPlanarTrimAreaMm2) || (pair.opposedPlanarTrimAreaMm2 > 0 && pair.minimumDistanceMm > 1e-6)) {
        result.unresolved.push({id:entry.id, reason:'Missing or conflicting finite mating area'});
      } else if (demand.maximumMm2 !== undefined && pair.opposedPlanarTrimAreaMm2 > demand.maximumMm2) {
        result.unresolved.push({id:entry.id, reason:'Area exceeds the independently expected trimmed footprint'});
      } else if (pair.opposedPlanarTrimAreaMm2 < demand.minimumMm2) {
        result.bearingShortfalls.push({id:entry.id, requiredMm2:demand.minimumMm2, observedMm2:pair.opposedPlanarTrimAreaMm2});
      }
    }
  }
  const complete = !result.missing.length && !result.unexpected.length && !result.unresolved.length;
  if (validControls && result.collisions.length) result.status = 'MATERIAL_INTERFERENCE';
  else if (complete) result.status = result.bearingShortfalls.length ? 'INSUFFICIENT_BEARING_AREA' : 'GEOMETRIC_CHECK_COMPLETE';
  result.complete = complete;
  return result;
}

export function checkFit(plan, observations) {
  const model = checkPlan(plan);
  if (observations?.schema !== 'backing-fit-observations@1') throw Error('Unknown observation format');
  const result = {};
  for (const stage of model.stages) result[stage] = evaluate(stage, observations[stage], plan, model);
  const review = model.stages.at(-1);
  const priorComplete = review === 'candidate' || result.candidate.complete === true;
  return { studies:result, intersectionThresholdMm3:plan.intersectionThresholdMm3, readyForGeometryReview:priorComplete && result[review].status === 'GEOMETRIC_CHECK_COMPLETE',
    inspection:plan.scopeNotes ?? {}, scope:'Installed pose and reported geometric interfaces only' };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [plan, observed] = process.argv.slice(2).map(x=>JSON.parse(readFileSync(x, 'utf8')));
    const result = checkFit(plan, observed);
    console.log(JSON.stringify(result, null, 2));
    if (!result.readyForGeometryReview) process.exitCode=1;
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
