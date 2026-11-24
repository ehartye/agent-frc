/**
 * @lane merge
 * @subject scripts/review-scene.mjs
 * @subject templates/preliminary-review/review.html
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reviewScene, replayScene, phasedScene } from './fixtures/review-scene.mjs';
import { validateScene } from '../scripts/review-scene.mjs';

// The stock page's pure helpers, loaded from the shipped template.
const html = readFileSync(new URL('../templates/preliminary-review/review.html', import.meta.url), 'utf8');
const source = html.split('<script id="review-logic">')[1].split('</script>')[0];
const logic = new Function(source + '\nreturn {inspectorFields, attachmentNote, attachmentRows, visibleBodies, findComponent, partition, frameCount, animationsOf, clipOf, clipFrame, clipSeek, checkGroups, massLinesFor, sha256Pure, digestHex, fieldFitState, replayMotion, eventAt, tubeTriangles, triangleValues, alongCenterline, carriedValues, interactionRows, MISSING, NOT_SUPPLIED};')();
const field = (fields, label) => fields.find(f => f[0] === label);

test('the inspector shows identity, classification, volume, weight from the source, support, the drive a motor runs and the motions it moves in', () => {
  const scene = reviewScene();
  const fields = logic.inspectorFields('arm', scene);
  assert.deepEqual(fields.map(f => f[0]), ['Category', 'Subsystem', 'Motion group', 'Material', 'Occupied volume', 'Weight', 'Support and load path', 'Description', 'Motor of',
    'Moves in']);
  assert.equal(field(fields, 'Category')[3], 'swatch');
  assert.equal(field(fields, 'Subsystem')[1], 'arm');
  assert.equal(field(fields, 'Motion group')[1], 'arm', 'subsystem and motion group are separate fields');
  assert.equal(field(fields, 'Occupied volume')[1], '64.0 cm³');
  assert.equal(field(fields, 'Weight')[1], '1.50 kg, 1.40–1.70 kg · from the design source (massKg)');
  assert.equal(field(fields, 'Description')[1], 'Invented note on arm.');
  assert.equal(field(fields, 'Motor of')[1], 'Not a motor');
  assert.deepEqual(field(fields, 'Moves in')[1], ['Transfer', 'package-displacement-control']);
  assert.deepEqual(field(fields, 'Material').slice(1, 3), [logic.NOT_SUPPLIED, false], 'page text not supplied is shown as such and is not a gap');
  assert.ok(fields.every(f => f[2] === false), 'nothing the source states is missing');
  const motor = logic.inspectorFields('arm motor', scene);
  assert.deepEqual(field(motor, 'Motor of')[1], ['shoulder: turns arm (rotation) · up to 12.0 A per motor, 6.20 V needed in raise']);
});

test('a solid with no weight and a solid in a group lump say so; page text that is absent is not a gap', () => {
  const scene = reviewScene();
  Object.assign(scene.bodies.frame, {massKg: null, massRangeKg: null, massFrom: 'group', description: null});
  Object.assign(scene.bodies.arm, {massKg: null, massRangeKg: null, massFrom: null});
  assert.deepEqual(field(logic.inspectorFields('frame', scene), 'Weight').slice(1, 3), ['In the weight of its group, frame: 1.90 kg, 1.75–2.15 kg', false]);
  assert.deepEqual(field(logic.inspectorFields('frame', scene), 'Description').slice(1, 3), [logic.NOT_SUPPLIED, false]);
  assert.deepEqual(field(logic.inspectorFields('arm', scene), 'Weight').slice(1, 3), ['Unweighed: the design source gives it no massKg or densityKgM3', true]);
  assert.equal(field(logic.inspectorFields('target', scene), 'Weight')[1], 'Field fixture; not robot weight');
  assert.equal(field(logic.inspectorFields('target', scene), 'Support and load path')[1], 'Field fixture');
  assert.equal(field(logic.inspectorFields('target', scene), 'Moves in')[1], 'Stationary in every motion');
  assert.deepEqual(logic.inspectorFields('ghost', scene), [['Component', logic.MISSING, true]]);
  assert.deepEqual(logic.weightOf(['arm', 'arm motor'], scene), {kg: [1.75, 2.15], lumped: 0, unweighed: 1}, 'a selection adds the ranges of its weighed solids');
});

test('focus shows only the selected bodies and Show assembly restores every body', () => {
  const names = ['battery', 'arm', 'frame', 'target'];
  assert.deepEqual(logic.visibleBodies(names, new Set(['arm', 'battery'])), ['battery', 'arm']);
  assert.deepEqual(logic.visibleBodies(names, null), names);
});

test('search selects by stable ID or display name, and leaving the box accepts only an exact match', () => {
  const bodies = {arm: {name: 'Pivot arm'}, arm2: {name: 'Second arm'}, gate: {name: 'Sliding gate'}};
  assert.equal(logic.findComponent('ARM', bodies), 'arm');
  assert.equal(logic.findComponent('sliding gate', bodies), 'gate');
  assert.equal(logic.findComponent('pivot', bodies), 'arm');
  assert.equal(logic.findComponent('pivot', bodies, true), null);
  assert.equal(logic.findComponent('nothing', bodies), null);
});

test('a case has one frame per placement', () => {
  assert.equal(logic.frameCount(reviewScene().cases[0]), 25);
  assert.equal(logic.frameCount(reviewScene().cases[1]), 25);
});

test('the scene digest falls back to a pure-JS SHA-256 where crypto.subtle is unavailable', async () => {
  for (const text of ['', 'abc', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'é'.repeat(70), 'x'.repeat(1000)]) {
    const bytes = new TextEncoder().encode(text), expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(logic.sha256Pure(bytes), expected);
    assert.equal(await logic.digestHex(bytes, undefined), expected, 'without crypto.subtle');
    assert.equal(await logic.digestHex(bytes.buffer, undefined), expected);
    assert.equal(await logic.digestHex(bytes, globalThis.crypto.subtle), expected, 'with crypto.subtle');
  }
  const big = new Uint8Array(3 * 1024 * 1024 + 77).map((_, k) => (k * 31) & 255), view = big.subarray(13, big.length - 5);
  assert.equal(await logic.digestHex(view, undefined), createHash('sha256').update(view).digest('hex'), 'a multi-megabyte offset view hashes in place');
  for (const n of [55, 56, 63, 64, 119, 120]) { const b = new Uint8Array(n).fill(97); assert.equal(logic.sha256Pure(b), createHash('sha256').update(b).digest('hex'), n + ' bytes'); }
});

test('the field-interaction fit says why it is unavailable', () => {
  const scene = reviewScene();
  const withFixture = scene.cases.find(c => Object.keys(c.bodies).some(id => scene.bodies[id].fixture));
  const present = Object.keys(withFixture.bodies);
  assert.deepEqual(logic.fieldFitState(present, scene), {enabled: true, reason: ''});
  const without = present.filter(id => !scene.bodies[id].fixture);
  const some = logic.fieldFitState(without, scene);
  assert.equal(some.enabled, false);
  assert.match(some.reason, /This case places no field fixture/);
  for (const body of Object.values(scene.bodies)) body.fixture = false;
  const none = logic.fieldFitState(present, scene);
  assert.equal(none.enabled, false);
  assert.equal(none.reason, 'No case registers a field fixture, so Fit field interaction is off.');
  assert.match(html, /aria-describedby="fieldWhy"/);
  assert.doesNotMatch(html, /fieldFitState\(presentIds/, 'the cutaway does not change whether the case places a fixture');
  assert.match(html, /id="fieldWhy"/, 'the reason has a visible place on the page');
});

test('a mount the design source registers against a member leads its support and load path', () => {
  const scene = reviewScene();
  scene.bodies.arm.mounts = [{on: 'frame', pointMm: [10, -20.25, 30], basis: 'Invented right-hand pivot datum'}];
  const withMount = field(logic.inspectorFields('arm', scene), 'Support and load path');
  assert.deepEqual(withMount.slice(1, 3), [['Mounted on ' + scene.bodies.frame.name + ' at (10.0, -20.3, 30.0) mm · Invented right-hand pivot datum'], false]);
  assert.deepEqual(field(logic.inspectorFields('frame', scene), 'Support and load path').slice(1, 3), [logic.NOT_SUPPLIED, false], 'no attachment report and no mount');
  const {errors} = validateScene(scene);
  assert.deepEqual(errors, []);
  scene.bodies.arm.mounts = [{on: 'frame', pointMm: [10, 20], basis: 'Invented'}];
  assert.ok(validateScene(scene).errors.length, 'a mount point needs three coordinates');
  scene.bodies.arm.mounts = [{on: 'absent', pointMm: [10, 20, 30], basis: 'Invented'}];
  assert.deepEqual(validateScene(scene).errors, ['/bodies/arm/mounts names an unknown body: absent']);
});

test('a replay becomes one entry of the animation list: frames from its clock, events by frame, moving parts in the inspector', () => {
  const scene = replayScene(), motion = logic.replayMotion(scene.replays[0]);
  assert.deepEqual([motion.replay, motion.kind, motion.removed, motion.results], [true, 'replay', [], []]);
  assert.equal(logic.frameCount(motion), 5, 'a replay has one frame per clock entry');
  assert.equal(logic.frameCount(scene.cases[0]), 25);
  assert.equal(logic.eventAt(motion.events, 1), null, 'no event before the first');
  assert.deepEqual(logic.eventAt(motion.events, 2), [1, 'Halfway']);
  assert.deepEqual(logic.eventAt(motion.events, 4), [2, 'At the target']);
  assert.deepEqual(field(logic.inspectorFields('arm', scene), 'Moves in')[1], ['Transfer', 'package-displacement-control', 'lane-run']);
  assert.equal(field(logic.inspectorFields('target', scene), 'Moves in')[1], 'Stationary in every motion', 'a body a replay keeps in place does not move');
});

test('a tube is a closed ring of triangles at its radius, and a carried mesh moves with its centerline', () => {
  const tube = logic.tubeTriangles([[0, 0, 0], [100, 0, 0], [200, 0, 50]], 8, 6);
  assert.equal(tube.length, 2 * 6 * 36, 'two segments, six sides, two triangles a side, six numbers a vertex');
  for (let k = 0; k < 6 * 6; k++) assert.ok(Math.abs(Math.hypot(tube[6 * k + 1], tube[6 * k + 2]) - 8) < 1e-4 || tube[6 * k] > 1, 'the first ring sits at the radius');
  assert.equal(logic.tubeTriangles([[0, 0, 0]], 8).length, 0, 'a single point draws nothing');
  const rest = [[0, 0, 0], [100, 0, 0], [200, 0, 0]], now = [[0, 0, 0], [100, 0, -40], [200, 0, 0]];
  assert.equal(logic.alongCenterline([50, 5, 0], rest), 0.5);
  assert.equal(logic.alongCenterline([150, -5, 3], rest), 1.5);
  assert.equal(logic.alongCenterline([-30, 0, 0], rest), 0, 'a point before the start stays at the start');
  const mesh = {v: [[40, 0, 0], [60, 0, 0], [50, 10, 0]], f: [[0, 1, 2]]}, base = logic.triangleValues(mesh);
  assert.deepEqual([...base], [40, 0, 0, 0, 0, 1, 60, 0, 0, 0, 0, 1, 50, 10, 0, 0, 0, 1], 'position and face normal per vertex');
  const param = Float32Array.from([0, 1, 2], k => logic.alongCenterline([base[6 * k], base[6 * k + 1], base[6 * k + 2]], rest));
  const moved = logic.carriedValues(base, param, rest, now, base.slice());
  assert.deepEqual([moved[2], moved[8], moved[14]].map(z => Math.round(z)), [-16, -24, -20], 'each vertex drops with the nearest point of the centerline');
  assert.deepEqual([moved[0], moved[6], moved[13]], [40, 60, 10], 'and keeps its place along and across it');
  assert.deepEqual([...logic.carriedValues(base, param, rest, rest, base.slice())], [...base], 'the first centerline leaves the mesh as drawn');
});

test('the attachment report names each floating solid and labelled exception, and the inspector repeats it', () => {
  const scene = reviewScene();
  assert.equal(logic.attachmentNote('arm', scene), null, 'a scene without the report says nothing');
  assert.equal(field(logic.inspectorFields('frame', {...scene, attachment: {motion: 'raise', gapMm: 3, floating: []}}), 'Support and load path')[1],
    'Attached: contacts or registered mounts trace it to the frame', 'a solid the report does not list is attached');
  assert.deepEqual(logic.attachmentRows(scene), []);
  scene.attachment = {motion: 'raise', pose: 'start of the motion', gapMm: 3, robotSolids: 3,
    floating: [{solid: 'battery', group: 'battery', nearest: 'frame', gapMm: 41.26}], heldByMountOnly: ['arm'], onUnmountedAllowance: [],
    unmountedAllowances: [], fixturesOffFloor: [{fixture: 'target', lowestAboveFloorMm: 120}], suspendedFixtures: [], mountsOffHost: []};
  assert.deepEqual(validateScene(scene).errors, []);
  const rows = logic.attachmentRows(scene);
  assert.deepEqual(rows.map(r => [r[0], r[1], r[3]]), [['Floating', 'battery', true], ['Off floor', 'target', true], ['Mount only', 'arm', false]]);
  assert.match(rows[0][2], /nearest attached solid frame, 41\.3 mm away/);
  assert.deepEqual(rows[0][4], ['frame'], 'selecting a floating solid also marks its nearest attached solid');
  const support = field(logic.inspectorFields('battery', scene), 'Support and load path');
  assert.match(support[1][0], /^Floating: nothing holds it within 3 mm\. Nearest attached solid: frame, 41\.3 mm away/);
  assert.equal(support[2], true, 'a floating solid shows as a gap in the inspector');
  const held = field(logic.inspectorFields('arm', scene), 'Support and load path');
  assert.deepEqual(held[1], ['Held across a gap by a registered mount alone; no modelled solid touches it']);
  assert.equal(held[2], false);
  assert.match(field(logic.inspectorFields('target', scene), 'Support and load path')[1][0], /^Off the floor: lowest point 120\.0 mm above it/);
  // A labelled allowance shows its reason and is not a finding.
  scene.attachment.floating = [];
  scene.attachment.unmountedAllowances = [{solid: 'battery', group: 'battery', reason: 'Invented tray not drawn yet', reachesFrame: false}];
  scene.attachment.fixturesOffFloor = [];
  scene.attachment.suspendedFixtures = [{fixture: 'target', reason: 'Invented target hung from the roof', lowestAboveFloorMm: 120}];
  const allowance = field(logic.inspectorFields('battery', scene), 'Support and load path');
  assert.deepEqual([allowance[1][0], allowance[2]], ['Unmounted allowance: Invented tray not drawn yet', false]);
  assert.deepEqual(logic.attachmentRows(scene).map(r => [r[0], r[1], r[3]]), [['Allowance', 'battery', false], ['Mount only', 'arm', false], ['Suspended', 'target', false]]);
  assert.deepEqual(field(logic.inspectorFields('target', scene), 'Support and load path')[1], ['Suspended: Invented target hung from the roof', 'Field fixture']);
  // The report may only name bodies of the scene.
  scene.attachment.heldByMountOnly = ['ghost'];
  assert.ok(validateScene(scene).errors.some(e => /\/attachment names an unknown body: ghost/.test(e)));
});

test('a field fixture shows its own category without a robot role', () => {
  const scene = reviewScene();
  scene.bodies.target.category = 'field';
  assert.equal(field(logic.inspectorFields('target', scene), 'Category')[1], 'field');
  scene.bodies.arm.category = 'intake';
  assert.equal(field(logic.inspectorFields('arm', scene), 'Category')[1], 'intake (colour of role mechanism)');
});

test('an animation plays the motions of one phase of the cycle end to end as one clip', () => {
  const scene = phasedScene(), cases = new Map(scene.cases.map(c => [c.id, c]));
  const [raise, lower] = logic.animationsOf(scene).map(a => logic.clipOf(a, a.cases.map(id => cases.get(id))));
  assert.deepEqual([raise.id, raise.title, raise.mission, raise.segments.length], ['transfer', 'Raise the arm', true, 3]);
  assert.equal(raise.frames, 73, 'three segments of 25 frames share the frame where one ends and the next begins');
  assert.deepEqual(raise.offsets, [0, 24, 48]);
  assert.deepEqual([0, 23, 24, 47, 48, 72].map(t => logic.clipFrame(raise, t)), [[0, 0], [0, 23], [1, 0], [1, 23], [2, 0], [2, 24]]);
  assert.deepEqual([logic.clipSeek(raise, 1, 0.5), logic.clipSeek(raise, 2, 1), logic.clipSeek(raise, 0, 7)], [36, 72, 24]);
  assert.ok(raise.times.every((t, k) => !k || t > raise.times[k - 1]), 'the clip clock never stops at a joint');
  assert.ok(Math.abs(raise.times.at(-1) - 6) < 1e-9, 'a long untimed clip plays in six seconds, however many motions it holds');
  assert.ok(Math.abs(lower.times.at(-1) - 2.4) < 1e-9, 'a single untimed case keeps a tenth of a second a frame');
  for (const k of [0, 1]) {
    const end = raise.segments[k].bodies.arm.matrices.at(-1), next = raise.segments[k + 1].bodies.arm.matrices[0];
    assert.ok(end.every((v, i) => Math.abs(v - next[i]) < 1e-12), 'the fixture is continuous at each joint');
  }
  const timed = logic.clipOf({id: 'timed'}, [{...cases.get('raise-01'), time: Array.from({length: 25}, (_, k) => 3 + k * 0.05)}, cases.get('raise-02')]);
  assert.deepEqual([timed.times[0], +timed.times[24].toFixed(6), timed.timed], [3, 4.2, false], 'a segment keeps its own clock and the next continues from it');
  assert.deepEqual(field(logic.inspectorFields('arm', scene), 'Moves in')[1], ['Raise the arm', 'Park', 'package-displacement-control'], 'the inspector names phases, not motions');
});

test('check results group by phase: counts, the tightest clearance, the tolerance used and the case to jump to', () => {
  const scene = phasedScene(), groups = logic.checkGroups(scene);
  assert.deepEqual(groups.map(g => [g.title, g.rows.length, g.counts]), [['Raise the arm', 3, {pass: 3}], ['Park', 1, {pass: 1}],
    ['Displaced control and uncovered conditions', 2, {'rejected as expected': 1, 'out-of-scope': 1}]]);
  const [raise, lower, rest] = groups;
  assert.deepEqual([raise.tightest.case, raise.focus.case, raise.allowanceMm, raise.pathToleranceMm, raise.undeclaredTolerance, raise.attention], ['raise-03', 'raise-03', [5, 5], [2, 2], 0, false]);
  assert.deepEqual([lower.tightest, lower.pathToleranceMm, lower.undeclaredTolerance], [null, null, 1], 'a phase with no pair in range and no declared tolerance says so');
  assert.deepEqual([rest.phase, rest.id, rest.attention], [false, null, false]);
  scene.motionEvidence[0].result = 'fail';
  scene.motionEvidence[0].limitingValue = {gapMm: 0, volumeMm3: 30};
  const failed = logic.checkGroups(scene)[0];
  assert.deepEqual([failed.counts, failed.attention, failed.focus.case, failed.tightest.case], [{fail: 1, pass: 2}, true, 'raise-01', 'raise-01'], 'an overlap is tighter than any gap, and a failing case is the one to jump to');
  assert.deepEqual(logic.checkGroups(reviewScene()).map(g => [g.id, g.rows.length]), [['transfer', 1], [null, 1]], 'a scene of one phase groups the same way');
});

test('each interaction shows its verdict and why, its trial result, what it assumed and leans on, and its adjustment window', () => {
  const scene = reviewScene();
  scene.adjustments = [{name: 'lip height', kind: 'mechanical', input: 'parameters.lip', range: [10, 20], measured: true, findings: []}];
  scene.interactions = [
    {id: 'pickup', verdict: 'configurable', reasons: ['belt squeezes the piece by 15% of its thickness'], decides: 'Invented', cases: ['raise'],
      trial: {name: 'pickup', engine: 'planar', result: 'covered by adjustment', state: 'stale', changes: ['solid "belt" changed (boundsMm)'],
        assumptions: [{id: 'in-plane', text: 'Invented: the piece stays in the plane'}], inputs: [{path: 'materials.tread.friction', value: 0.6, source: 'assumed', range: [0.4, 0.8]}],
        sensitivity: ['materials.tread.friction'], adjustments: ['lip height'],
        coverage: [{input: 'materials.tread.friction', adjustment: 'lip height', someSettingPassesEach: true, oneSettingPassesBoth: true, setting: 14, atLow: [12, 20], atHigh: [10, 16]}]}},
    {id: 'release', verdict: 'planar is enough', screened: 'needs 3D', override: 'Invented: guides are drawn later', reasons: ['Invented'], noTrial: 'Invented: no result changes the design'}];
  const [pickup, release] = logic.interactionRows(scene);
  assert.equal(pickup.stale, true);
  assert.equal(pickup.trial, 'pickup · planar: covered by adjustment · stale: solid "belt" changed (boundsMm)');
  assert.deepEqual(pickup.inputs, ['materials.tread.friction = 0.6, assumed 0.4 to 0.8']);
  assert.deepEqual(pickup.sensitivity, ['materials.tread.friction']);
  assert.deepEqual(pickup.adjustment, ['lip height on materials.tread.friction: low end 12 to 20, high end 10 to 16; 14 passes at both', 'lip height 10 to 20: clear at both ends']);
  assert.equal(release.verdict, 'planar is enough (overridden from needs 3D: Invented: guides are drawn later)');
  assert.equal(release.trial, 'No trial: Invented: no result changes the design');
  assert.match(html, /<table id="interactionTable">/, 'the rows have a place on the page');
});
