/**
 * @lane merge
 * @subject scripts/review-scene.mjs
 */
// The review scene's schema, its cross-checks and its comparison with the verdict judged from the records. Failure caught:
// a scene the page cannot play, or one that claims a result the records do not hold, is accepted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { checkSchema, validateScene, readScene, compareWithVerdict } from '../scripts/review-scene.mjs';
import { reviewScene, replayScene, phasedScene, verdictOf } from './fixtures/review-scene.mjs';

test('the synthetic scene satisfies the schema and cross-checks', () => {
  const {errors, warnings} = validateScene(reviewScene());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [], 'a complete scene warns of nothing');
});

test('schema errors name the field and its pointer', () => {
  const scene = reviewScene();
  delete scene.parked;
  scene.bodies.arm.color = 'teal';
  scene.cases[0].kind = 'hopeful';
  scene.decision.status = 'pending receipt';
  const errors = checkSchema(scene);
  assert.ok(errors.some(e => e === '/ is missing parked'), errors.join('\n'));
  assert.ok(errors.some(e => e.startsWith('/bodies/arm/color must match')));
  assert.ok(errors.some(e => e.startsWith('/cases/0/kind must be one of')));
  assert.ok(errors.some(e => e.startsWith('/decision/status must be one of layout-checked, provisional, blocked, reopen')), 'the decision is a verdict status');
  assert.ok(checkSchema({...reviewScene(), schema: 'agent-frc/preliminary-review-scene@1'}).some(e => e.startsWith('/schema must be')), 'an earlier scene format is not read');
  for (const gone of ['mass', 'purpose', 'rationale', 'missing', 'volumeType', 'support'])
    assert.ok(checkSchema({...reviewScene(), bodies: {...reviewScene().bodies, arm: {...reviewScene().bodies.arm, [gone]: null}}}).includes('/bodies/arm/' + gone + ' is not a scene field'), gone);
});

test('cross-checks catch references to bodies, meshes, frames and motions that do not exist', () => {
  const scene = reviewScene();
  scene.weight.groups.frame.members.push('ghost');
  scene.power.motions[0].drives[0].members = ['phantom'];
  scene.power.motions.push({...scene.power.motions[0], motion: 'spin'});
  scene.cases[0].bodies.arm.mesh = 9;
  scene.cases[0].time.pop();
  scene.openingCase = 'missing';
  scene.cutaway.hides = ['frame'];
  scene.required[0].ids.push('wheel');
  const {errors} = validateScene(scene);
  for (const pattern of [/weight\/groups\/frame names an unknown body: ghost/, /power\/raise\/shoulder names an unknown body: phantom/, /power\/motions\/1 names spin, which is not a case/,
    /cases\/0\/bodies\/arm mesh out of range/, /cases\/0\/time needs one entry per frame \(25\)/,
    /openingCase names an unknown case/, /cutaway\/hides names a body that is not a fixture: frame/, /required\/structure names an unknown body: wheel/])
    assert.ok(errors.some(e => pattern.test(e)), pattern + ' in ' + errors.join('\n'));
});

test('a failing weight limit, a sagging bus, a missing role and missing page text stay valid and visible as warnings', () => {
  const scene = reviewScene({context: null, architecture: null, focus: null, notes: null});
  scene.required.push({role: 'drive', ids: []});
  Object.assign(scene.weight.limits[0], {marginKg: -1.25, status: 'fail'});
  Object.assign(scene.power.motions[0], {marginV: -0.4, status: 'fail'});
  const {errors, warnings} = validateScene(scene);
  assert.deepEqual(errors, []);
  for (const w of ['No drive group in the design source', 'Weight limit inspection is exceeded by 1.250 kg', 'raise: the weak-pack bus falls 0.40 V below what it needs',
    'Not supplied: page.json context', 'Not supplied: page.json architecture', 'Not supplied: page.json focus', 'Not supplied: page.json notes'])
    assert.ok(warnings.includes(w), w + ' in ' + warnings.join('\n'));
  const optional = reviewScene();
  delete optional.cutaway;
  delete optional.cases[0].time;
  delete optional.cases[0].measure;
  assert.deepEqual(validateScene(optional).errors, [], 'optional features may be absent');
  assert.ok(!validateScene(optional).warnings.some(w => /cutaway|time|measure/.test(w)), 'absent optional features are not warnings');
  assert.ok(!validateScene(reviewScene()).warnings.some(w => /purpose|rationale/.test(w)), 'a component purpose is not asked for');
});

test('the scene must repeat the verdict judged from the records, however it was compressed', () => {
  const scene = reviewScene(), verdict = verdictOf(scene);
  const content = Buffer.from(JSON.stringify(scene)), read = readScene(gzipSync(content));
  assert.deepEqual(compareWithVerdict(read.scene, verdict), []);
  assert.deepEqual(compareWithVerdict(readScene(gzipSync(content, {level: 1})).scene, verdict), [], 'the comparison is of content, not of compressed bytes');
  const differ = (change, expected) => { const v = verdictOf(scene); change(v); assert.deepEqual(compareWithVerdict(scene, v), expected); };
  differ(v => { v.status = 'blocked'; }, ['Scene decision differs from the verdict']);
  differ(v => { v.motions.raise.status = 'fail'; }, ['Scene motion results differ from the verdict']);
  differ(v => { v.motions.spin = {status: 'pass'}; }, ['Scene motion results differ from the verdict']);
  differ(v => { v.control.rejected = false; }, ['Scene displaced control differs from the verdict']);
  differ(v => { v.weight.limits[0].marginKg = 3; }, ['Scene weight differs from the verdict']);
  differ(v => { v.electrical.motions.raise.marginV = 0.2; }, ['Scene power differs from the verdict']);
  differ(v => { v.issue = 'other'; }, ['Scene issue differs from the verdict']);
  differ(v => { v.records.jobs.pop(); }, ['Scene records differ from the verdict\'s']);
  differ(v => { v.narrative.objectives = []; }, ['Scene narrative objectives differ from the verdict']);
  differ(v => { v.interactions = [{id: 'x', verdict: 'needs 3D', reasons: []}]; }, ['Scene interactions or adjustments differ from the verdict']);
  // Control: a scene that claims a pass the records do not hold is refused, even when it is otherwise well formed.
  const claim = reviewScene();
  claim.cases[0].status = 'pass';
  const failed = verdictOf(claim);
  failed.motions.raise.status = 'fail';
  failed.status = 'blocked';
  assert.deepEqual(validateScene(claim).errors, []);
  assert.deepEqual(compareWithVerdict(claim, failed), ['Scene decision differs from the verdict', 'Scene motion results differ from the verdict']);
  assert.throws(() => readScene(gzipSync(Buffer.alloc(2048, 32)), 1024), /Cannot create a Buffer larger|maxOutputLength|larger than/i, 'decompression is bounded');
});

test('links, extra fields and a misnamed or second displaced control are refused', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '//host/x', '/root', 'http://plain', ' ../x', '..\\x']) {
    const errors = checkSchema(reviewScene({links: [{label: 'x', href}]}));
    assert.ok(errors.some(e => e.startsWith('/links/0/href must match')), href + ': ' + errors);
  }
  for (const href of ['../../', 'https://example.org/season', 'season/lane.html']) assert.deepEqual(checkSchema(reviewScene({links: [{label: 'x', href}]})), [], href);
  assert.ok(checkSchema({...reviewScene(), payload: 'extra'}).includes('/payload is not a scene field'));
  const scene = reviewScene();
  scene.cases.push({...scene.cases[1], id: 'second-control', status: 'pass'});
  assert.ok(validateScene(scene).errors.includes('/cases may hold one displaced control, with id package-displacement-control'));
  const renamed = reviewScene();
  renamed.cases[1].kind = 'nominal';
  assert.ok(validateScene(renamed).errors.includes('/cases/package-displacement-control must be the displaced control'));
});

test('a trial replay validates beside the cases and shares their ID namespace', () => {
  assert.deepEqual(validateScene(replayScene()).errors, []);
  const breaks = [
    [r => { r.id = 'raise'; }, /replays\/0 repeats case or replay raise/],
    [r => { r.bodies.ghost = {mesh: 0, group: 'robot'}; }, /replays\/0\/bodies names an unknown body: ghost/],
    [r => { r.bodies.arm.group = 'wrist'; }, /bodies\/arm names an unknown group: wrist/],
    [r => { r.bodies.arm.mesh = 40; }, /replays\/0\/bodies\/arm mesh out of range/],
    [r => { r.groups.arm.pop(); }, /groups\/arm needs one transform per frame \(5\)/],
    [r => { r.follow = 'nobody'; }, /follow names an unknown group/],
    [r => { r.groups.robot[2] = null; }, /follow group must be placed in every frame/],
    [r => { r.time[3] = 0.1; }, /time must never decrease/],
    [r => { r.measure.pop(); }, /measure needs one entry per frame \(5\)/],
    [r => { r.events.reverse(); }, /events must be in frame order/],
    [r => { r.events[1].frame = 9; }, /events must be in frame order/],
    [r => { r.tubes[0].points.pop(); }, /tubes\/0 needs one centerline, or one per frame \(5\)/],
    [r => { r.tubes[0].points[1].pop(); }, /tubes\/0 needs the same number of points on every centerline/],
    [r => { delete r.tubes[0].radiusMm; }, /tubes\/0 needs radiusMm and color, or body and mesh/],
    [r => { r.tubes[1].body = 'frame'; }, /tubes\/1\/body must be a field body that the replay does not also place/],
    [r => { r.tubes[1].body = 'target'; }, /tubes\/1\/body must be a field body that the replay does not also place/],
    [r => { r.tubes[1].mesh = 40; }, /tubes\/1 mesh out of range/]];
  for (const [change, pattern] of breaks) {
    const scene = replayScene();
    change(scene.replays[0]);
    const {errors} = validateScene(scene);
    assert.ok(errors.some(e => pattern.test(e)), pattern + ' in ' + errors.join('\n'));
  }
  const hidden = replayScene();
  hidden.replays[0].groups.arm[1] = null;
  hidden.replays[0].tubes[0].points.length = 1;
  assert.deepEqual(validateScene(hidden).errors, [], 'a null frame hides a group, and one centerline serves a fixed tube');
  const extra = replayScene();
  extra.replays[0].surprise = true;
  assert.ok(checkSchema(extra).some(e => e === '/replays/0/surprise is not a scene field'));
  assert.ok(checkSchema({...replayScene(), replays: [{...replayScene().replays[0], evidence: []}]}).some(e => /evidence needs at least 1 items/.test(e)), 'a replay names the record it plays back');
  // A replay is playback: the verdict comparison covers exactly the judged motions.
  const scene = replayScene();
  assert.deepEqual(compareWithVerdict(scene, verdictOf(scene)), [], 'a replay adds no motion to compare');
});

test('animations play every motion exactly once, by phase of the cycle, and never the displaced control', () => {
  assert.deepEqual(validateScene(phasedScene()).errors, []);
  const broken = phasedScene();
  broken.animations[0].cases = ['raise-01', 'raise-02', 'ghost'];
  broken.animations[1].cases = ['lower', 'raise-01', 'package-displacement-control'];
  broken.animations.push({id: 'transfer', title: 'Again', mission: false, cases: ['lower']});
  const {errors} = validateScene(broken);
  for (const pattern of [/animations\/0\/cases names an unknown case: ghost/, /animations\/1\/cases repeats case raise-01 of animation transfer/,
    /animations\/1\/cases names the displaced control/, /animations\/2 repeats animation transfer/, /animations plays no case raise-03/])
    assert.ok(errors.some(e => pattern.test(e)), pattern + ' in ' + errors.join('\n'));
  assert.ok(checkSchema({...phasedScene(), animations: [{id: 'transfer', cases: ['raise-01']}]}).some(e => /animations\/0 is missing title/.test(e)));
  const replay = replayScene();
  replay.animations = [{id: 'lane-run', title: 'Raise', mission: true, cases: ['raise']}];
  assert.ok(validateScene(replay).errors.some(e => /replays\/0 repeats case or replay lane-run/.test(e)), 'a replay may not take an animation ID');
});
