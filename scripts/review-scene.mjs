/** Validate an Agent FRC preliminary review scene against its schema, cross-check it and compare it with a receipt. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const sceneSchemaId = 'agent-frc/preliminary-review-scene@1';
export const controlCase = 'package-displacement-control';
/** No legitimate scene approaches this; it bounds decompression even when a receipt claims more. */
export const maxSceneBytes = 512 * 1024 * 1024;
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

const PROJECT_FIELDS = {context: 'presentation.context', architecture: 'presentation.architecture', focus: 'presentation.focus', notes: 'presentation.notes'};

/**
 * Schema plus cross-checks. Errors make the scene unusable; warnings name project-authored fields that the
 * page will show as "Not supplied in this review" and evidence the page will flag, such as a missing role.
 */
export function validateScene(scene) {
  const errors = checkSchema(scene), warnings = [];
  if (errors.length) return {errors, warnings};
  const bodies = scene.bodies, ids = new Set(Object.keys(bodies));
  const known = (list, where) => { for (const id of list) if (!ids.has(id)) errors.push(where + ' names an unknown body: ' + id); };
  for (const [id, body] of Object.entries(bodies)) if (body.mesh !== undefined && !(body.mesh < scene.meshes.length)) errors.push('/bodies/' + id + ' mesh out of range');
  scene.meshes.forEach((m, i) => { if (m.f.some(face => face.some(k => k >= m.v.length))) errors.push('/meshes/' + i + ' face indexes a missing vertex'); });
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
    for (const key of ['time', 'measure', 'positions'])
      if (c[key] && c[key].length !== frames) errors.push(at + '/' + key + ' needs one entry per frame (' + frames + ')');
  }
  if (!caseIds.has(scene.openingCase)) errors.push('/openingCase names an unknown case');
  for (const p of scene.parked.positive) known(p.pair, '/parked/positive');
  for (const p of scene.parked.unresolved) known(p, '/parked/unresolved');
  if (scene.mass) for (const l of scene.mass.lines) known(l.members, '/mass/lines/' + l.id);
  if (scene.mass?.runningAdditions) for (const l of scene.mass.runningAdditions) known(l.members, '/mass/runningAdditions/' + l.name);
  for (const d of scene.power) for (const l of d.lines) known(l.members, '/power/' + d.case + '/' + l.name);
  if (scene.cutaway) for (const id of scene.cutaway.hides) if (!ids.has(id) || !bodies[id].fixture) errors.push('/cutaway/hides names a body that is not a fixture: ' + id);
  // Visible findings rather than errors: the page keeps them on screen.
  for (const r of scene.required) {
    const absent = r.ids.filter(id => !ids.has(id));
    if (absent.length) warnings.push('Required role ' + r.role + ' is missing ' + absent.join(', '));
  }
  if (!scene.required.length) warnings.push('No required roles are commissioned (presentation.required)');
  if (scene.mass && scene.mass.remainingKg < 0) warnings.push('Inspection weight exceeds the limit by ' + (-scene.mass.remainingKg).toFixed(3) + ' kg');
  for (const d of scene.power) if (d.marginV < 0) warnings.push(d.case + ' falls ' + (-d.marginV).toFixed(2) + ' V below its required voltage');
  if (!scene.mass) warnings.push('Weight and power budgets are not supplied (plan budgets)');
  else if (scene.mass.runningAdditions === null) warnings.push('Running additions are not itemized (presentation.runningAdditions)');
  for (const [key, source] of Object.entries(PROJECT_FIELDS)) if (scene[key] === null || scene[key] === undefined) warnings.push('Not supplied: ' + source);
  const gaps = {};
  for (const body of Object.values(bodies)) for (const field of body.missing) gaps[field] = (gaps[field] || 0) + 1;
  for (const [field, n] of Object.entries(gaps)) warnings.push(n + ' component' + (n > 1 ? 's' : '') + ' without ' + field);
  return {errors, warnings};
}

/** Decompress a served scene within a size bound and return its content and digests. */
export function readScene(bytes, maxBytes = maxSceneBytes) {
  maxBytes = Math.min(maxBytes, maxSceneBytes);
  const content = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, {maxOutputLength: maxBytes}) : Buffer.from(bytes);
  return {scene: JSON.parse(content.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex'),
    contentSha256: createHash('sha256').update(content).digest('hex'), bytes: content.length};
}

/** The receipt fields the scene must repeat exactly. */
export function compareWithReceipt(read, receipt) {
  const errors = [], pin = receipt?.view?.scene;
  const canonical = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x);
  const same = (a, b) => canonical(a) === canonical(b);
  if (!pin || pin.sha256 !== read.sha256 || pin.contentSha256 !== read.contentSha256 || pin.bytes !== read.bytes) errors.push('The receipt does not pin these scene bytes');
  const s = read.scene;
  if (s.issue !== receipt.issue) errors.push('Scene issue differs from the receipt');
  if (!same(s.sources?.step, receipt.step) || !same(s.sources?.motion, receipt.motion)) errors.push('Scene STEP or motion pin differs from the receipt');
  const shown = Object.fromEntries((s.cases || []).filter(c => c.id !== controlCase).map(c => [c.id, c.status]));
  const checked = Object.fromEntries((receipt.cases || []).map(c => [c.case, c.status]));
  if (!same(Object.keys(shown).sort(), Object.keys(checked).sort()) || Object.keys(checked).some(k => shown[k] !== checked[k])) errors.push('Scene case results differ from the receipt');
  const control = (s.cases || []).find(c => c.id === controlCase);
  if ((receipt.control?.witness || control) && (control?.status !== 'fail' || control.kind !== 'displaced control'))
    errors.push('Scene must show the rejected displaced control');
  if (receipt.parked && !same(s.parked, receipt.parked)) errors.push('Scene parked-assembly result differs from the receipt');
  if (!['pending receipt', 'blocked'].includes(s.decision?.status)) errors.push('Scene decision may not claim a checked result');
  if (!same(s.narrativeReview?.objectives ?? [], receipt.narrativeReview?.objectives ?? [])) errors.push('Scene narrative objectives differ from the receipt');
  const budgets = receipt.budgets;
  if (budgets) {
    const duty = r => [r.case, r.status, r.batteryCondition, r.requiredMinV, r.marginV, r.loadedBusV, r.batterySideA];
    if (!same((s.power || []).map(duty), budgets.electricalCases.map(duty))) errors.push('Scene duties differ from the receipt');
    if (!s.mass || !same(s.mass.inspectionKg, budgets.inspectionKg) || !same(s.mass.remainingKg, budgets.remainingKg) || !same(s.mass.runningKg, budgets.runningKg))
      errors.push('Scene mass differs from the receipt');
  }
  return errors;
}

/** The figures the page draws from the published ledger files: the limit, the mass lines and each duty's loads and pack. */
export function compareWithLedger(scene, ledger, limits, loadMembers) {
  const errors = [], same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!scene.mass) return ['Scene omits the published budgets'];
  if (scene.mass.limitKg !== limits?.inspectionLimitKg) errors.push('Scene inspection limit differs from limits.json');
  const lines = (ledger?.masses || []).map(r => [r.id, r.kg, r.members, r.basis]);
  if (!same(scene.mass.lines.map(r => [r.id, r.kg, r.members, r.basis]), lines)) errors.push('Scene mass lines differ from budgets.json');
  for (const d of scene.power) {
    const source = ledger?.electricalCases?.[d.case];
    if (!source || d.openCircuitV !== source.openCircuitV?.[0] || d.resistanceOhm !== source.resistanceOhm?.[1]
        || !same(d.lines.map(l => [l.name, l.amps]), Object.entries(source.batterySideA || {})))
      errors.push('Scene duty ' + d.case + ' differs from budgets.json');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, file, flag, receiptFile, ...rest] = process.argv.slice(2);
    if (mode !== 'validate' || !file || rest.length || (flag && flag !== '--receipt') || (flag && !receiptFile)) throw Error('Usage: review-scene.mjs validate SCENE.json[.gz]|- [--receipt receipt.json]');
    const read = readScene(readFileSync(file === '-' ? 0 : file));
    const result = validateScene(read.scene);
    if (receiptFile) result.errors.push(...compareWithReceipt(read, JSON.parse(readFileSync(receiptFile, 'utf8'))));
    console.log(JSON.stringify({scene: sceneSchemaId, contentSha256: read.contentSha256, ...result}, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
