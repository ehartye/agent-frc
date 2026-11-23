/** @lane merge
 * @subject scripts/concept-check.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conceptCheck } from '../scripts/concept-check.mjs';
import { standOffBand } from '../scripts/concept-arc.mjs';

const read = rel => JSON.parse(readFileSync(new URL('../' + rel, import.meta.url)));
const cli = fileURLToPath(new URL('../scripts/concept-check.mjs', import.meta.url));
const turret = read('examples/concept-bots/turret-shooter.json'), placer = read('examples/concept-bots/front-intake-placer.json');
const profile = read('examples/kickoff/training-field.json');
const q = value => ({value, label:'assumed', basis:'Invented test value.'});
const variant = (doc, edit) => { const copy = structuredClone(doc); edit(copy); return copy; };

function run(t, files, ...args) {
  const dir = mkdtempSync(path.join(tmpdir(), 'concept-check-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  for (const [name, value] of Object.entries(files)) writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
  const result = spawnSync(process.execPath, [cli, ...args], {cwd:dir, encoding:'utf8'});
  return {...result, report:result.stdout ? JSON.parse(result.stdout) : null};
}

test('the command reports a valid concept with its label count, and exits 2 naming the invalid field', t => {
  const ok = run(t, {'concept.json':turret}, 'concept.json');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.report.valid, true);
  assert.deepEqual(Object.keys(ok.report.labels).sort(), ['assumed', 'observed', 'required']);
  assert.ok(ok.report.labels.assumed > 0 && ok.report.labels.required > 0);
  assert.deepEqual(ok.report.ports, [], 'no profile, no stations');
  const missing = run(t, {'concept.json':variant(turret, c => { delete c.drive.topSpeedInS; })}, 'concept.json');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /drive\.topSpeedInS/);
  assert.equal(missing.report.valid, false);
  const tank = run(t, {'concept.json':variant(turret, c => { c.drive.type = 'tank'; })}, 'concept.json');
  assert.equal(tank.status, 2);
  assert.match(tank.stderr, /drive\.type.*only swerve/);
  assert.equal(run(t, {'concept.json':'{not json'}, 'concept.json').status, 2);
  assert.equal(run(t, {}, 'absent.json').status, 2);
  assert.equal(run(t, {'concept.json':turret, 'p.json':{...profile, units:'m'}}, 'concept.json', '--profile', 'p.json').status, 2);
  assert.equal(run(t, {'concept.json':turret}, 'concept.json', '--profile').status, 2);
  // An exceeded limit is a finding, not an invalid input.
  const wide = variant(turret, c => { c.body.frameLengthIn = q(30); c.body.frameWidthIn = q(30); delete c.body.frameProfile; });
  const exceeds = run(t, {'concept.json':wide, 'p.json':profile}, 'concept.json', '--profile', 'p.json');
  assert.equal(exceeds.status, 0, exceeds.stderr);
  assert.equal(exceeds.report.limits.perimeter, 'exceeds');
});

test('limits compare the frame outline perimeter, heights and extension with the profile robot limits', () => {
  // turret-shooter: 28 x 28 frame with two rear chamfers cut back 2.8 in on each side.
  const chamfered = 4 * 28 - 2 * (2 * 2.8 - Math.hypot(2.8, 2.8));
  const report = conceptCheck(turret, profile);
  assert.deepEqual(report.limits, {perimeter:'within', startingHeight:'within', maxHeight:'within', extension:'within', mass:'within'});
  assert.ok(Math.abs(report.limitValues.perimeter.conceptIn - chamfered) < 1e-9);
  assert.deepEqual(report.limitValues.perimeter.limit, {value:116, factId:'robot-perimeter'});
  const square = variant(turret, c => { c.body.frameLengthIn = q(30); c.body.frameWidthIn = q(30); delete c.body.frameProfile; });
  assert.equal(conceptCheck(square, profile).limits.perimeter, 'exceeds'); // 120 in > 116 in
  assert.equal(conceptCheck(square, profile).limitValues.perimeter.conceptIn, 120);
  const tall = variant(turret, c => { c.body.stowedHeightIn = q(50); c.body.maxHeightIn = q(70); c.body.maxReachIn = q(20); });
  assert.deepEqual(conceptCheck(tall, profile).limits,
    {perimeter:'within', startingHeight:'exceeds', maxHeight:'exceeds', extension:'exceeds', mass:'within'});
  const unlimited = variant(profile, p => { delete p.rehearsal.robotLimits; });
  assert.deepEqual(conceptCheck(square, unlimited).limits,
    {perimeter:'unresolved', startingHeight:'unresolved', maxHeight:'unresolved', extension:'unresolved', mass:'unresolved'});
  const partly = variant(profile, p => { p.rehearsal.robotLimits.perimeterIn = null; });
  assert.equal(conceptCheck(square, partly).limits.perimeter, 'unresolved');
  assert.equal(conceptCheck(square).limits.perimeter, 'unresolved');
});

test('mass defaults to 75–95% of the inspection limit, keeps a stated range and is unresolved without either', () => {
  const assumed = conceptCheck(turret, profile).mass;
  assert.deepEqual({...assumed, basis:undefined}, {min:75, max:95, label:'assumed', basis:undefined, default:true, shareOfLimit:0.95});
  assert.match(assumed.basis, /robot-mass/);
  const stated = conceptCheck(placer, profile);
  assert.deepEqual({...stated.mass, basis:undefined}, {min:90, max:110, label:'assumed', basis:undefined, default:false, shareOfLimit:1.1});
  assert.equal(stated.limits.mass, 'exceeds');
  const unlimited = variant(profile, p => { p.rehearsal.robotLimits.massLb = null; });
  const none = conceptCheck(turret, unlimited);
  assert.equal(none.limits.mass, 'unresolved');
  assert.deepEqual(none.mass, {min:null, max:null, label:null, basis:null, default:false, shareOfLimit:null});
  assert.equal(conceptCheck(placer, unlimited).limits.mass, 'unresolved', 'a stated range without a limit');
  assert.equal(conceptCheck(placer, unlimited).mass.shareOfLimit, null);
});

test('each ranged output gets a stand-off band per entry station it can serve, or "no entry region"', () => {
  const report = conceptCheck(turret, profile);
  const bays = profile.rehearsal.stations.filter(s => s.kind === 'scoring' && s.piece === 'tile');
  assert.deepEqual(report.ports.map(p => [p.output, p.station]), bays.map(s => ['shooter', s.id]));
  const shooter = turret.outputs[0].ranged;
  for (const [i, row] of report.ports.entries()) {
    assert.deepEqual(row.standOffBand, standOffBand(bays[i].entry, row.pieceRadiusIn,
      {launchSpeedInS:shooter.launchSpeedInS, elevationDeg:shooter.elevationDeg}, shooter.releaseHeightIn.value));
    assert.equal(row.standOffBand.feasibleAny, true);
  }
  const bare = variant(profile, p => { delete p.rehearsal.stations.find(s => s.id === 'red-bay').entry; });
  assert.deepEqual(conceptCheck(turret, bare).ports.find(p => p.station === 'red-bay'),
    {output:'shooter', station:'red-bay', status:'unresolved', reason:'no entry region'});
  assert.deepEqual(conceptCheck(placer, profile).ports, [], 'a place output has no stand-off band');
  const other = variant(turret, c => { c.outputs[0].pieces = ['marker']; c.storage.capacity = {tile:c.storage.capacity.tile, marker:q(1)}; });
  assert.deepEqual(conceptCheck(other, profile).ports, [], 'no scoring station accepts its pieces');
});
