/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bodyExample } from '../examples/field-route/make-body-example.mjs';
import { writePinned } from '../examples/field-route/make-example.mjs';
import { reviewFieldRoute } from '../scripts/field-route-evidence.mjs';

async function run(t, edit = () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'body-observation-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await bodyExample(dir);
  const read = async name => JSON.parse(await readFile(path.join(dir, name)));
  const save = (name, value) => writePinned(dir, name, value);
  const req = await read('request.json');
  const s = await read('scenario.json'), robot = await read('robot.json'), route = await read('route.json');
  const d = await read('detector.json'), journal = await read('observer.json');
  const controls = {};
  await edit({s, robot, route, d, journal, controls, save});
  s.sources.robot = await save('robot.json', robot);
  req.scenario = await save('scenario.json', s);
  route.scenarioSha256 = d.scenarioSha256 = journal.scenarioSha256 = req.scenario.sha256;
  if (controls.hit) {
    const pair = {fromS: 0, toS: 2, moving: 'frame', obstacle: 'column', method: 'material-intersection',
      timeS: 1, backend: 'fixture', volumeMm3: 5, toleranceMm3: 0.01, sourceEvidence: s.sources.trajectory,
      clock: s.clock, scenarioSha256: req.scenario.sha256};
    route.refinements = [await save('contact.json', pair)];
  }
  d.sourceEvidence = await save('observer.json', journal);
  req.detector = await save('detector.json', d);
  req.route = await save('route.json', route);
  await save('request.json', req);
  return (await reviewFieldRoute(path.join(dir, 'request.json'))).events[0];
}

test('body observation survives a clear, incomplete or obstructed route with zero pieces', async t => {
  const clear = await run(t);
  const incomplete = await run(t, ({route}) => { delete route.intervals[0].moving.frame; });
  const hit = await run(t, ({route, controls}) => {
    route.intervals[0].obstacles.column = [.9, 0, 0, 3, 1, 2]; controls.hit = true;
  });
  assert.deepEqual([clear, incomplete, hit].map(row => row.routeStatus), ['supported', 'pending', 'infeasible']);
  assert.deepEqual(hit.detectorEvent, clear.detectorEvent);
  assert.equal(clear.bodyObservation.value, .25);
  assert.equal(clear.bodyObservation.unit, 'm³');
  assert.equal(clear.wholeFieldStatus, 'supported');
  const local = await run(t, ({robot}) => { robot.scope = 'subassembly'; });
  assert.equal(local.routeStatus, 'supported');
  assert.equal(local.wholeFieldStatus, 'pending');
});

test('body identity, time, geometry, numeric measurement and exclusivity stay bound', async t => {
  for (const [edit, error] of [
    [({d}) => { d.events[0].robotBody = 'wheel'; }, /subject/],
    [({d}) => { d.events[0].piece = 'parcel'; }, /subject/],
    [({s}) => { s.robotBodies = ['other']; }, /body list/],
    [({journal}) => { journal.observations[0].timeS = 1.5; }, /time/],
    [({journal}) => { journal.geometrySha256 = '0'.repeat(64); }, /geometry/],
    [({journal}) => { journal.observations[0].threshold = .25; }, /threshold/],
    [({journal}) => { journal.observations[0].measurement.sha256 = '0'.repeat(64); }, /Changed input/],
    [({journal}) => { journal.observations = []; }, /subject/],
    [({journal}) => { journal.observations.push(journal.observations[0]); }, /Duplicate/],
  ]) await assert.rejects(run(t, edit), error);
  const boundary = await run(t, ({journal}) => {
    Object.assign(journal.observations[0], {comparison: 'at-most', threshold: .25});
  });
  assert.equal(boundary.routeStatus, 'supported');
});
