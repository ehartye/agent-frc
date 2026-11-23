import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { checkSchema, validateScene, readScene, compareWithReceipt, compareWithLedger } from '../scripts/review-scene.mjs';
import { reviewScene, replayScene, phasedScene } from './fixtures/review-scene.mjs';

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

test('the scene must repeat the receipt results, however it was compressed', () => {
  const scene = reviewScene();
  const content = Buffer.from(JSON.stringify(scene));
  const served = gzipSync(content);
  const receipt = {issue: scene.issue, step: scene.sources.step, motion: scene.sources.motion, narrativeReview: scene.narrativeReview,
    cases: [{case: 'raise', status: 'pass'}], control: {witness: {pair: ['arm', 'battery'], status: 'fail'}},
    budgets: {inspectionKg: scene.mass.inspectionKg, remainingKg: scene.mass.remainingKg, runningKg: scene.mass.runningKg,
      electricalCases: scene.power.map(({case: c, status, batteryCondition, requiredMinV, marginV, loadedBusV, batterySideA}) => ({case: c, status, batteryCondition, requiredMinV, marginV, loadedBusV, batterySideA}))},
    parked: scene.parked};
  const read = readScene(served);
  assert.deepEqual(compareWithReceipt(read, receipt), []);
  assert.deepEqual(compareWithReceipt(readScene(gzipSync(content, {level: 1})), receipt), [], 'the comparison is of content, not of compressed bytes');
  assert.deepEqual(compareWithReceipt(read, {...receipt, cases: [{case: 'raise', status: 'fail'}]}), ['Scene case results differ from the receipt']);
  assert.deepEqual(compareWithReceipt(read, {...receipt, parked: {...scene.parked, screenedPairs: 7}}), ['Scene parked-assembly result differs from the receipt']);
  assert.deepEqual(compareWithReceipt(read, {...receipt, budgets: {...receipt.budgets, electricalCases: [{...receipt.budgets.electricalCases[0], marginV: 0.2}]}}),
    ['Scene duties differ from the receipt'], 'the figures the page draws are the receipt figures');
  const claim = {...scene, decision: {status: 'layout-checked', firstUnmet: null}};
  assert.ok(compareWithReceipt(readScene(gzipSync(Buffer.from(JSON.stringify(claim)))), receipt).includes('Scene decision may not claim a checked result'));
  assert.deepEqual(compareWithReceipt(readScene(gzipSync(Buffer.from(JSON.stringify({...scene, issue: 'other'})))), receipt), ['Scene issue differs from the receipt']);
  assert.throws(() => readScene(gzipSync(Buffer.alloc(2048, 32)), 1024), /Cannot create a Buffer larger|maxOutputLength|larger than/i, 'decompression is bounded');
});


test('links, extra fields and a misnamed or second displaced control are refused', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '//host/x', '/root', 'http://plain', ' ../x', '..\\x']) {
    const errors = checkSchema(reviewScene({links: [{label: 'x', href}]}));
    assert.ok(errors.some(e => e.startsWith('/links/0/href must match')), href + ': ' + errors);
  }
  for (const href of ['../../', 'https://example.org/season', 'field/lane.html']) assert.deepEqual(checkSchema(reviewScene({links: [{label: 'x', href}]})), [], href);
  assert.ok(checkSchema({...reviewScene(), payload: 'extra'}).includes('/payload is not a scene field'));
  const scene = reviewScene();
  scene.cases.push({...scene.cases[1], id: 'second-control', status: 'pass'});
  assert.ok(validateScene(scene).errors.includes('/cases may hold one displaced control, with id package-displacement-control'));
  const renamed = reviewScene();
  renamed.cases[1].kind = 'nominal';
  assert.ok(validateScene(renamed).errors.includes('/cases/package-displacement-control must be the displaced control'));
});

test('the ledger files must match the figures the page draws', () => {
  const scene = reviewScene();
  const ledger = {masses: scene.mass.lines.map(l => ({...l})), electricalCases: {'raise-weak': {openCircuitV: [11.6, 12], resistanceOhm: [0.02, 0.03], batterySideA: {drive: [15, 35], arm: [5, 15]}}}};
  assert.deepEqual(compareWithLedger(scene, ledger, {inspectionLimitKg: 20}), []);
  assert.deepEqual(compareWithLedger(scene, ledger, {inspectionLimitKg: 99}), ['Scene inspection limit differs from limits.json']);
  ledger.masses[0].kg = [1, 2];
  ledger.electricalCases['raise-weak'].batterySideA.arm = [5, 25];
  assert.deepEqual(compareWithLedger(scene, ledger, {inspectionLimitKg: 20}), ['Scene mass lines differ from budgets.json', 'Scene duty raise-weak differs from budgets.json']);
});

test('field interactions without any registered field fixture are reported', () => {
  const linked = reviewScene();
  linked.fieldInteractions = [{title: 'Invented lane', href: 'field/lane.html', objective: 'Invented objective', evidence: 'Invented trial'}];
  const finding = /no case registers a field fixture/;
  assert.ok(!validateScene(linked).warnings.some(w => finding.test(w)), 'a case that places a fixture has nothing to report');
  for (const body of Object.values(linked.bodies)) body.fixture = false;
  linked.cutaway = null;
  const {errors, warnings} = validateScene(linked);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => finding.test(w) && /fixtures/.test(w)), warnings.join('\n'));
  linked.fieldInteractions = [];
  assert.ok(!validateScene(linked).warnings.some(w => finding.test(w)), 'no linked interaction, no finding');
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
  assert.ok(checkSchema({...replayScene(), replays: [{...replayScene().replays[0], evidence: []}]}).some(e => /evidence needs at least 1 items/.test(e)), 'a replay pins the trial it plays back');
});

test('a replay is playback: the receipt comparison still covers exactly the checked cases', () => {
  const scene = replayScene(), content = Buffer.from(JSON.stringify(scene)), served = gzipSync(content), read = readScene(served);
  const receipt = {issue: scene.issue, step: scene.sources.step, motion: scene.sources.motion, cases: [{case: 'raise', status: 'pass'}],
    control: {witness: {}}, narrativeReview: scene.narrativeReview};
  assert.deepEqual(compareWithReceipt(read, receipt, {pins: false}), [], 'a replay adds no case to compare');
  assert.ok(compareWithReceipt(read, {...receipt, cases: [...receipt.cases, {case: 'lane-run', status: 'pass'}]}, {pins: false})
    .includes('Scene case results differ from the receipt'), 'a receipt cannot credit a replay as a checked case');
});

test('animations play every checked case exactly once, by mission phase, and never the displaced control', () => {
  assert.deepEqual(validateScene(phasedScene()).errors, []);
  assert.deepEqual(validateScene(reviewScene()).errors, [], 'a scene written before the animation list still validates');
  const broken = phasedScene();
  broken.animations[0].cases = ['raise-01', 'raise-02', 'ghost'];
  broken.animations[1].cases = ['lower', 'raise-01', 'package-displacement-control'];
  broken.animations.push({id: 'raise', title: 'Again', mission: false, cases: ['lower']});
  const {errors} = validateScene(broken);
  for (const pattern of [/animations\/0\/cases names an unknown case: ghost/, /animations\/1\/cases repeats case raise-01 of animation raise/,
    /animations\/1\/cases names the displaced control/, /animations\/2 repeats animation raise/, /animations plays no case raise-03/])
    assert.ok(errors.some(e => pattern.test(e)), pattern + ' in ' + errors.join('\n'));
  assert.ok(checkSchema({...phasedScene(), animations: [{id: 'raise', cases: ['raise-01']}]}).some(e => /animations\/0 is missing title/.test(e)));
  const replay = replayScene();
  replay.animations = [{id: 'lane-run', title: 'Raise', mission: true, cases: ['raise']}];
  assert.ok(validateScene(replay).errors.some(e => /replays\/0 repeats case or replay lane-run/.test(e)), 'a replay may not take an animation ID');
});
