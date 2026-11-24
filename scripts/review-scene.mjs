/**
 * Validate an Agent FRC preliminary review scene against its schema, cross-check it, and compare it with the verdict
 * judged from the design library's records.
 *
 *   node review-scene.mjs validate SCENE.json[.gz]|- [--verdict VERDICT.json]
 *
 * A verdict is the JSON that design preliminary-check --judge-only --json prints (agent-frc/layout-verdict@1).
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const sceneSchemaId = 'agent-frc/preliminary-review-scene@2';
export const controlCase = 'package-displacement-control';
/** No legitimate scene approaches this; it bounds decompression. */
export const maxSceneBytes = 128 * 1024 * 1024;
export const schema = JSON.parse(readFileSync(new URL('../templates/preliminary-review/scene.schema.json', import.meta.url), 'utf8'));

const kind = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const typeOk = (v, t) => [t].flat().some(x => x === kind(v) || (x === 'number' && typeof v === 'number' && Number.isFinite(v)));

/** The subset of JSON Schema that the scene schema uses. Returns error strings with JSON pointers. */
export function checkSchema(value, node = schema, at = '', errors = []) {
  if (node.$ref) node = node.$ref.replace('#/$defs/', '').split('/').reduce((n, k) => n[k], schema.$defs);
  if ('const' in node && value !== node.const) errors.push(at + ' must be ' + JSON.stringify(node.const));
  if (node.enum && !node.enum.includes(value)) errors.push(at + ' must be one of ' + node.enum.map(String).join(', '));
  if (node.type && !typeOk(value, node.type)) { errors.push(at + ' must be ' + [node.type].flat().join(' or ')); return errors; }
  if (value === null) return errors;
  if (typeof value === 'string') {
    if (node.minLength && value.length < node.minLength) errors.push(at + ' must not be empty');
    if (node.pattern && !new RegExp(node.pattern).test(value)) errors.push(at + ' must match ' + node.pattern);
  }
  if (typeof value === 'number') {
    if ('minimum' in node && value < node.minimum) errors.push(at + ' must be at least ' + node.minimum);
    if ('exclusiveMinimum' in node && value <= node.exclusiveMinimum) errors.push(at + ' must exceed ' + node.exclusiveMinimum);
  }
  if (Array.isArray(value)) {
    if (node.minItems && value.length < node.minItems) errors.push(at + ' needs at least ' + node.minItems + ' items');
    if (node.maxItems && value.length > node.maxItems) errors.push(at + ' allows at most ' + node.maxItems + ' items');
    if (node.items) value.forEach((v, i) => checkSchema(v, node.items, at + '/' + i, errors));
  } else if (kind(value) === 'object') {
    for (const key of node.required || []) if (!(key in value)) errors.push((at || '/') + ' is missing ' + key);
    if (node.minProperties && Object.keys(value).length < node.minProperties) errors.push(at + ' needs at least ' + node.minProperties + ' entries');
    for (const [key, v] of Object.entries(value)) {
      if (node.properties?.[key]) checkSchema(v, node.properties[key], at + '/' + key, errors);
      else if (node.additionalProperties === false) errors.push(at + '/' + key + ' is not a scene field');
      else if (node.additionalProperties && typeof node.additionalProperties === 'object') checkSchema(v, node.additionalProperties, at + '/' + key, errors);
    }
  }
  return errors;
}

const PAGE_FIELDS = ['title', 'context', 'architecture', 'focus', 'notes'];

/** Cross-checks of a replay against the scene's bodies, meshes and its own frames. */
function replayErrors(scene, caseIds, animationIds, known, errors) {
  for (const [i, r] of (scene.replays || []).entries()) {
    const at = '/replays/' + i, frames = r.time.length;
    if (caseIds.has(r.id) || animationIds.has(r.id)) errors.push(at + ' repeats case or replay ' + r.id);
    caseIds.add(r.id);
    known(Object.keys(r.bodies), at + '/bodies');
    for (const [id, b] of Object.entries(r.bodies)) {
      if (b.mesh >= scene.meshes.length) errors.push(at + '/bodies/' + id + ' mesh out of range');
      if (b.group !== null && !Object.hasOwn(r.groups, b.group)) errors.push(at + '/bodies/' + id + ' names an unknown group: ' + b.group);
    }
    for (const [name, series] of Object.entries(r.groups)) if (series.length !== frames) errors.push(at + '/groups/' + name + ' needs one transform per frame (' + frames + ')');
    if (!Object.hasOwn(r.groups, r.follow)) errors.push(at + '/follow names an unknown group');
    else if (r.groups[r.follow].includes(null)) errors.push(at + '/follow group must be placed in every frame');
    if (r.time.some((t, k) => k && t < r.time[k - 1])) errors.push(at + '/time must never decrease');
    if (r.measure && r.measure.length !== frames) errors.push(at + '/measure needs one entry per frame (' + frames + ')');
    if ((r.events || []).some((e, k, all) => e.frame >= frames || k && e.frame < all[k - 1].frame)) errors.push(at + '/events must be in frame order within the replay');
    for (const [k, tube] of (r.tubes || []).entries()) {
      const where = at + '/tubes/' + k;
      if (tube.points.length !== 1 && tube.points.length !== frames) errors.push(where + ' needs one centerline, or one per frame (' + frames + ')');
      if (tube.points.some(line => line.length !== tube.points[0].length)) errors.push(where + ' needs the same number of points on every centerline');
      if (tube.body === undefined) {
        if (tube.radiusMm === undefined || tube.color === undefined || tube.mesh !== undefined) errors.push(where + ' needs radiusMm and color, or body and mesh');
      } else if (!scene.bodies[tube.body]?.fixture || Object.hasOwn(r.bodies, tube.body)) errors.push(where + '/body must be a field body that the replay does not also place');
      else if (!(tube.mesh < scene.meshes.length)) errors.push(where + ' mesh out of range');
    }
  }
}

/** Cross-checks of the cases and the animation list: every motion is played once, the control by none. Returns the case and animation IDs. */
function caseErrors(scene, known, errors) {
  const controls = scene.cases.filter(c => c.kind === 'displaced control');
  if (controls.length > 1 || controls.some(c => c.id !== controlCase)) errors.push('/cases may hold one displaced control, with id ' + controlCase);
  if (scene.cases.some(c => c.id === controlCase && c.kind !== 'displaced control')) errors.push('/cases/' + controlCase + ' must be the displaced control');
  const caseIds = new Set();
  for (const [i, c] of scene.cases.entries()) {
    const at = '/cases/' + i;
    if (caseIds.has(c.id)) errors.push(at + ' repeats case ' + c.id);
    caseIds.add(c.id);
    known(Object.keys(c.bodies), at + '/bodies');
    known(c.removed, at + '/removed');
    for (const r of c.results) known(r.pair, at + '/results');
    let frames = 1;
    for (const [id, b] of Object.entries(c.bodies)) {
      if (b.mesh >= scene.meshes.length) errors.push(at + '/bodies/' + id + ' mesh out of range');
      if (b.matrices.length > 1) {
        if (frames > 1 && b.matrices.length !== frames) errors.push(at + '/bodies/' + id + ' frame count differs within the case');
        frames = Math.max(frames, b.matrices.length);
      }
    }
    for (const key of ['time', 'measure'])
      if (c[key] && c[key].length !== frames) errors.push(at + '/' + key + ' needs one entry per frame (' + frames + ')');
  }
  const animationIds = new Set(), placed = new Map();
  for (const [i, a] of scene.animations.entries()) {
    const at = '/animations/' + i;
    if (animationIds.has(a.id) || a.id === controlCase) errors.push(at + ' repeats animation ' + a.id);
    animationIds.add(a.id);
    for (const id of a.cases) {
      if (!caseIds.has(id) || id === controlCase) errors.push(at + '/cases names ' + (id === controlCase ? 'the displaced control' : 'an unknown case: ' + id));
      else if (placed.has(id)) errors.push(at + '/cases repeats case ' + id + ' of animation ' + placed.get(id));
      placed.set(id, a.id);
    }
  }
  for (const id of caseIds) if (id !== controlCase && !placed.has(id)) errors.push('/animations plays no case ' + id);
  for (const id of animationIds) if (caseIds.has(id) && placed.get(id) !== id) errors.push('/animations/' + id + ' takes the ID of a case that another animation plays');
  return {caseIds, animationIds};
}

/**
 * Schema plus cross-checks. Errors make the scene unusable; warnings name page text the page will show as "Not
 * supplied in this review" and findings the page keeps on screen, such as a weight limit exceeded.
 */
export function validateScene(scene) {
  const errors = checkSchema(scene), warnings = [];
  if (errors.length) return {errors, warnings};
  const bodies = scene.bodies, ids = new Set(Object.keys(bodies));
  const known = (list, where) => { for (const id of list) if (!ids.has(id)) errors.push(where + ' names an unknown body: ' + id); };
  for (const [id, body] of Object.entries(bodies)) known((body.mounts || []).map(m => m.on), '/bodies/' + id + '/mounts');
  scene.meshes.forEach((m, i) => { if (m.f.some(face => face.some(k => k >= m.v.length))) errors.push('/meshes/' + i + ' face indexes a missing vertex'); });
  const {caseIds, animationIds} = caseErrors(scene, known, errors);
  replayErrors(scene, caseIds, animationIds, known, errors);
  if (!caseIds.has(scene.openingCase)) errors.push('/openingCase names an unknown case');
  for (const p of scene.parked.positive) known(p.pair, '/parked/positive');
  for (const p of scene.parked.unresolved) known(p, '/parked/unresolved');
  for (const [name, g] of Object.entries(scene.weight.groups)) known(g.members, '/weight/groups/' + name);
  for (const r of scene.required) known(r.ids, '/required/' + r.role);
  for (const [i, m] of scene.power.motions.entries()) {
    if (!caseIds.has(m.motion) || m.motion === controlCase) errors.push('/power/motions/' + i + ' names ' + m.motion + ', which is not a case');
    for (const d of [...m.drives, ...m.alsoRunning]) known(d.members, '/power/' + m.motion + '/' + d.drive);
  }
  if (scene.attachment) {
    const a = scene.attachment;
    known([...(a.floating || []).flatMap(r => [r.solid, r.nearest].filter(v => v !== null)), ...(a.unmountedAllowances || []).map(r => r.solid),
      ...(a.heldByMountOnly || []), ...(a.onUnmountedAllowance || []), ...[...(a.fixturesOffFloor || []), ...(a.suspendedFixtures || [])].map(r => r.fixture)], '/attachment');
  }
  if (scene.cutaway) for (const id of scene.cutaway.hides) if (!ids.has(id) || !bodies[id].fixture) errors.push('/cutaway/hides names a body that is not a fixture: ' + id);
  // Findings rather than errors: the page keeps them on screen.
  for (const r of scene.required) if (!r.ids.length) warnings.push('No ' + r.role + ' group in the design source');
  for (const l of scene.weight.limits) if (l.marginKg < 0) warnings.push('Weight limit ' + l.name + ' is exceeded by ' + (-l.marginKg).toFixed(3) + ' kg');
  for (const m of scene.power.motions) if (m.marginV < 0) warnings.push(m.motion + ': the weak-pack bus falls ' + (-m.marginV).toFixed(2) + ' V below what it needs');
  for (const key of PAGE_FIELDS) if (scene[key] === null || scene[key] === undefined) warnings.push('Not supplied: page.json ' + key);
  return {errors, warnings};
}

/** Decompress a served scene within a size bound and return its content and digests. */
export function readScene(bytes, maxBytes = maxSceneBytes) {
  maxBytes = Math.min(maxBytes, maxSceneBytes);
  const content = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, {maxOutputLength: maxBytes}) : Buffer.from(bytes);
  return {scene: JSON.parse(content.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex'),
    contentSha256: createHash('sha256').update(content).digest('hex'), bytes: content.length};
}

const canonical = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x);
const same = (a, b) => canonical(a) === canonical(b);

/** The records a scene was built from that are not the ones judged, by name. `files` names the judged ones with their digests. */
export function builtFromOthers(scene, files) {
  const shown = [...(scene.records?.jobs ?? []).map(job => [scene.records.folder + '/' + job.file, job.sha256]), ...(scene.records?.trials ? [[scene.records.trials.file, scene.records.trials.sha256]] : [])];
  return shown.filter(([name, sha256]) => files.records?.[name] !== sha256).map(([name]) => 'Scene was built from another ' + name);
}

/**
 * The verdict fields the scene must repeat exactly: the decision, each motion's result, the displaced control, the
 * weight, each powered motion's bus, the attachment report, the interactions and adjustments, the narrative
 * objectives and the records it was judged from, by digest. A scene that claims what the records do not hold differs here.
 */
export function compareWithVerdict(scene, verdict) {
  const errors = [];
  if (scene.issue !== verdict.issue) errors.push('Scene issue differs from the verdict');
  if (scene.decision?.status !== verdict.status || !same(scene.decision?.firstUnmet ?? null, verdict.firstUnmet ?? null)) errors.push('Scene decision differs from the verdict');
  const shown = Object.fromEntries((scene.cases || []).filter(c => c.kind !== 'displaced control').map(c => [c.id, c.status]));
  const judged = Object.fromEntries(Object.entries(verdict.motions || {}).map(([m, r]) => [m, r.status]));
  if (!same(shown, judged)) errors.push('Scene motion results differ from the verdict');
  const control = (scene.cases || []).find(c => c.kind === 'displaced control');
  if (!!control !== !!verdict.control || control && (control.status === 'fail') !== verdict.control.rejected) errors.push('Scene displaced control differs from the verdict');
  const w = scene.weight, v = verdict.weight;
  if (!w || !v || !same([w.totalKg, w.rangeKg, w.notRobotWeight, w.limits], [v.totalKg, v.rangeKg, v.notRobotWeight, v.limits])) errors.push('Scene weight differs from the verdict');
  const bus = m => [m.status, m.busV, m.requiredV, m.marginV, m.governs, m.clamped];
  const power = Object.fromEntries((scene.power?.motions || []).map(m => [m.motion, bus(m)]));
  const judgedPower = Object.fromEntries(Object.entries(verdict.electrical?.motions || {}).map(([m, r]) => [m, bus(r)]));
  if (!same(power, judgedPower) || scene.power?.minBusV !== verdict.electrical?.minBusV) errors.push('Scene power differs from the verdict');
  if (verdict.attachment && !same(scene.attachment ?? null, verdict.attachment)) errors.push('Scene attachment differs from the verdict');
  if (!same(scene.interactions ?? [], verdict.interactions ?? []) || !same(scene.adjustments ?? [], verdict.adjustments ?? [])) errors.push('Scene interactions or adjustments differ from the verdict');
  if (!same(scene.narrativeReview?.objectives ?? [], verdict.narrative?.objectives ?? [])) errors.push('Scene narrative objectives differ from the verdict');
  const jobs = list => (list || []).map(j => [j.id, j.file]);
  if (scene.records?.folder !== verdict.records?.folder || !same(jobs(scene.records?.jobs), jobs(verdict.records?.jobs))) errors.push('Scene records differ from the verdict\'s');
  if (verdict.files) errors.push(...builtFromOthers(scene, verdict.files));
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, file, flag, verdictFile, ...rest] = process.argv.slice(2);
    if (mode !== 'validate' || !file || rest.length || (flag && flag !== '--verdict') || (flag && !verdictFile)) throw Error('Usage: review-scene.mjs validate SCENE.json[.gz]|- [--verdict VERDICT.json]');
    const read = readScene(readFileSync(file === '-' ? 0 : file));
    const result = validateScene(read.scene);
    if (verdictFile) result.errors.push(...compareWithVerdict(read.scene, JSON.parse(readFileSync(verdictFile, 'utf8'))));
    console.log(JSON.stringify({scene: sceneSchemaId, contentSha256: read.contentSha256, ...result}, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
