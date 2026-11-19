import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePinned } from './make-example.mjs';

export async function bodyExample(dir) {
  await mkdir(dir, { recursive: true });
  const save = (name, data) => writePinned(dir, name, data);
  const collections = [{ path: ['fixtures'], format: 'ids', initial: 'placed' }];
  const field = await save('field.json', {fixtures: ['column'], fieldRouteInventory: {complete: true, unresolved: [], collections}});
  const geometry = await save('carriage.json', {units: 'm', body: {frame: [0, 0, 0, 1, 1, 1]}});
  const robot = await save('robot.json', {schema: 'field-route/robot@1', scope: 'assembly', geometry,
    catalog: geometry, collection: {path: ['body'], format: 'keys'}});
  const transform = await save('transform.json', {units: 'm', origin: [0, 0, 0]});
  const trajectory = await save('trajectory.json', {clock: 'bench', linearFrameTranslationM: [[0, 0], [2, 1]]});
  const interval = {fromS: 0, toS: 2, carried: []};
  const scenario = await save('scenario.json', {schema: 'field-route/scenario@1', clock: 'bench', startS: 0,
    marginM: 0, robotBodies: ['frame'], obstacles: ['column'], pieces: [], sources: {robot, field, transform, trajectory},
    intervals: [interval]});
  const binding = {scenarioSha256: scenario.sha256, clock: 'bench'};
  const route = await save('route.json', {schema: 'field-route/sweep@1', ...binding, sourceEvidence: trajectory,
    intervals: [{...interval, method: 'continuous-swept-enclosures',
      moving: {frame: [0, 0, 0, 2, 1, 1]}, obstacles: {column: [3, 0, 0, 4, 1, 2]}}]});
  const event = {id: 'arrival', robotBody: 'frame', timeS: 2};
  // At t=2 the frame occupies x=[1,2]. The last 0.25 m lies in the end bay.
  const measurement = await save('overlap.json', {overlapVolumeM3: 0.25});
  const sourceEvidence = await save('observer.json', {schema: 'field-route/body-observations@1', ...binding,
    geometrySha256: geometry.sha256, observations: [{...event, criterion: 'frame overlaps the end bay', unit: 'm³', measurement,
      path: ['overlapVolumeM3'], comparison: 'above', threshold: 0}]});
  const detector = await save('detector.json', {schema: 'field-route/events@1', ...binding, sourceEvidence, events: [event]});
  const inventory = await save('inventory.json', {schema: 'field-route/inventory@1', fieldSha256: field.sha256,
    clock: 'bench', startS: 0, scope: {kind: 'whole-field', name: 'tabletop field', unresolved: []}, collections});
  await save('request.json', {scenario, route, detector, inventory});
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw Error('Supply a fresh example directory.');
  await bodyExample(process.argv[2]);
}
