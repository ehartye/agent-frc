import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { checkSchema, validateScene, readScene, compareWithReceipt } from '../scripts/review-scene.mjs';
import { reviewScene } from './fixtures/review-scene.mjs';

test('the synthetic scene satisfies the schema and cross-checks', () => {
  const {errors, warnings} = validateScene(reviewScene());
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => /1 component without subsystem/.test(w)), 'a fixture without a subsystem is reported: ' + warnings);
});

test('schema errors name the field and its pointer', () => {
  const scene = reviewScene();
  delete scene.parked;
  scene.bodies.arm.color = 'teal';
  scene.cases[0].kind = 'hopeful';
  const errors = checkSchema(scene);
  assert.ok(errors.some(e => e === '/ is missing parked'), errors.join('\n'));
  assert.ok(errors.some(e => e.startsWith('/bodies/arm/color must match')));
  assert.ok(errors.some(e => e.startsWith('/cases/0/kind must be one of')));
  assert.ok(checkSchema({...reviewScene(), schema: 'other@1'}).some(e => e.startsWith('/schema must be')));
});

test('cross-checks catch references to bodies, meshes and frames that do not exist', () => {
  const scene = reviewScene();
  scene.mass.lines[0].members.push('ghost');
  scene.power[0].lines[1].members = ['phantom'];
  scene.cases[0].bodies.arm.mesh = 9;
  scene.cases[0].time.pop();
  scene.openingCase = 'missing';
  scene.cutaway.hides = ['frame'];
  const {errors} = validateScene(scene);
  for (const pattern of [/mass\/lines\/structure names an unknown body: ghost/, /power\/raise-weak\/arm names an unknown body: phantom/,
    /cases\/0\/bodies\/arm mesh out of range/, /cases\/0\/time needs one entry per frame \(25\)/, /openingCase names an unknown case/, /cutaway\/hides names a body that is not a fixture: frame/])
    assert.ok(errors.some(e => pattern.test(e)), pattern + ' in ' + errors.join('\n'));
});

test('an incomplete roster, an overweight robot and a low-voltage duty stay valid and visible as warnings', () => {
  const scene = reviewScene();
  scene.required.push({role: 'Drive wheels', ids: ['wheel-1', 'wheel-2']});
  scene.mass.remainingKg = -1.25;
  scene.power[0].marginV = -0.4;
  scene.power[0].status = 'fail';
  const {errors, warnings} = validateScene(scene);
  assert.deepEqual(errors, []);
  assert.ok(warnings.includes('Required role Drive wheels is missing wheel-1, wheel-2'));
  assert.ok(warnings.includes('Inspection weight exceeds the limit by 1.250 kg'));
  assert.ok(warnings.includes('raise-weak falls 0.40 V below its required voltage'));
});

test('missing project-authored fields validate with a warning naming where to supply them', () => {
  const scene = reviewScene({context: null, architecture: null, focus: null, notes: null});
  scene.mass.runningAdditions = null;
  scene.bodies.arm.purpose = null;
  scene.bodies.arm.missing = ['purpose'];
  const {errors, warnings} = validateScene(scene);
  assert.deepEqual(errors, []);
  for (const w of ['Not supplied: presentation.context', 'Not supplied: presentation.architecture', 'Not supplied: presentation.focus',
    'Not supplied: presentation.notes', 'Running additions are not itemized (presentation.runningAdditions)', '1 component without purpose'])
    assert.ok(warnings.includes(w), w + ' in ' + warnings.join('\n'));
  const optional = reviewScene();
  delete optional.cutaway;
  delete optional.cases[0].time;
  delete optional.cases[0].measure;
  assert.deepEqual(validateScene(optional), {errors: [], warnings: validateScene(optional).warnings}, 'optional features may be absent');
  assert.ok(!validateScene(optional).warnings.some(w => /cutaway|time|measure/.test(w)), 'absent optional features are not warnings');
});

test('the receipt must pin the served scene bytes and repeat its results', () => {
  const scene = reviewScene();
  const content = Buffer.from(JSON.stringify(scene));
  const served = gzipSync(content);
  const receipt = {issue: scene.issue, step: scene.sources.step, motion: scene.sources.motion, narrativeReview: scene.narrativeReview,
    cases: [{case: 'raise', status: 'pass'}], control: {witness: {pair: ['arm', 'battery'], status: 'fail'}},
    budgets: {inspectionKg: scene.mass.inspectionKg, remainingKg: scene.mass.remainingKg, electricalCases: [{case: 'raise-weak', status: 'pass'}]},
    view: {scene: {file: 'review-scene.json.gz', sha256: sha(served), contentSha256: sha(content), bytes: content.length}}};
  const read = readScene(served);
  assert.deepEqual(compareWithReceipt(read, receipt), []);
  assert.deepEqual(compareWithReceipt(read, {...receipt, cases: [{case: 'raise', status: 'fail'}]}), ['Scene case results differ from the receipt']);
  assert.deepEqual(compareWithReceipt(readScene(gzipSync(Buffer.from(JSON.stringify({...scene, issue: 'other'})))), receipt).slice(0, 2),
    ['The receipt does not pin these scene bytes', 'Scene issue differs from the receipt']);
  assert.throws(() => readScene(gzipSync(Buffer.alloc(2048, 32)), 1024), /Cannot create a Buffer larger|maxOutputLength|larger than/i, 'decompression is bounded');
});

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
