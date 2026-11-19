// Offline review of calibrated rays against a finite set of project-supplied poses.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function named(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function distinct(rows, label) {
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !named(row?.id)) ||
      new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('Expected distinct named ' + label);
  }
  return new Set(rows.map(row => row.id));
}

function band(value) {
  return Array.isArray(value) && value.length === 2 &&
    value.every(v => Number.isInteger(v) && v > 0 && v < 255) && value[0] <= value[1];
}

function unresolvedPairs(states, rays) {
  const pairs = [];
  for (const allowed of states.filter(s => s.permit)) {
    for (const unsafe of states.filter(s => !s.permit)) {
      const different = rays.filter(ray => allowed.occupied.includes(ray.id) !== unsafe.occupied.includes(ray.id));
      const distinctBands = different.filter(ray => ray.empty[1] < ray.occupied[0] || ray.occupied[1] < ray.empty[0]);
      let finding = 'registered ray could distinguish';
      if (!different.length) finding = 'same silhouette on every modeled ray';
      else if (!distinctBands.length) finding = 'intensity ranges overlap on every differing ray';
      pairs.push({ permitState: allowed.id, holdState: unsafe.id, finding, candidateRays: distinctBands.map(r => r.id) });
    }
  }
  return pairs;
}

export function review(study) {
  const { camera, calibration, rays, states, frames } = study;
  if (!named(camera) || !named(calibration)) throw new Error('Name the camera and its calibration');
  const rayIds = distinct(rays, 'calibrated rays');
  distinct(states, 'candidate states');
  distinct(frames, 'exposures');
  for (const ray of rays) {
    if (!named(ray.reference) || !band(ray.empty) || !band(ray.occupied)) {
      throw new Error('Supply a registered empty-view patch and unsaturated intensity bounds for ' + ray.id);
    }
  }
  for (const state of states) {
    if (typeof state.permit !== 'boolean' || !Array.isArray(state.occupied) ||
        new Set(state.occupied).size !== state.occupied.length || state.occupied.some(id => !rayIds.has(id))) {
      throw new Error('Invalid ray pattern for ' + state.id);
    }
  }
  if (!states.some(s => !s.permit && !s.occupied.length) || !states.some(s => s.permit && s.occupied.length)) {
    throw new Error('Include an empty hold and a visible permitted state');
  }
  return frames.map(frame => {
    if (![frame.camera, frame.calibration, frame.pose].every(named) || !frame.readings ||
        typeof frame.readings !== 'object' || Array.isArray(frame.readings) ||
        Object.keys(frame.readings).some(id => !rayIds.has(id))) throw new Error('Invalid exposure ' + frame.id);
    const unknown = [];
    let possible = [...states];
    for (const ray of rays) {
      const sample = Object.hasOwn(frame.readings, ray.id) ? frame.readings[ray.id] : undefined;
      if (sample != null && (typeof sample !== 'object' || Array.isArray(sample) ||
          (sample.reference !== null && !named(sample.reference)) ||
          (sample.value !== null && (!Number.isInteger(sample.value) || sample.value < 0 || sample.value > 255)))) {
        throw new Error('Invalid pixel at ' + frame.id + '/' + ray.id);
      }
      let reason;
      if (camera !== frame.camera || calibration !== frame.calibration) reason = 'camera or calibration changed';
      else if (!sample || sample.value === null) reason = 'missing sample';
      else if (sample.reference !== ray.reference) reason = 'empty-view patch unregistered';
      else if (sample.value === 0 || sample.value === 255) reason = 'saturated sample';
      if (reason) {
        unknown.push({ ray: ray.id, reason });
        continue;
      }
      possible = possible.filter(state => {
        const [lo, hi] = state.occupied.includes(ray.id) ? ray.occupied : ray.empty;
        return lo <= sample.value && sample.value <= hi;
      });
    }
    const permit = possible.length > 0 && possible.every(state => state.permit);
    return { frame: frame.id, pose: frame.pose, unknown, possible: possible.map(state => state.id),
      decision: permit ? 'permit' : 'hold', unresolvedPairs: unresolvedPairs(possible, rays) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file, flag, statesFile, ...extra] = process.argv.slice(2);
    if (!file || extra.length || (flag !== undefined && (flag !== '--states' || !statesFile))) {
      throw new Error('Supply study.json [--states alternative-states.json]');
    }
    const study = JSON.parse(readFileSync(file, 'utf8'));
    if (statesFile) study.states = JSON.parse(readFileSync(statesFile, 'utf8'));
    console.log(JSON.stringify(review(study), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
