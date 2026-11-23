/** @lane merge */
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProfile} from '../scripts/kickoff.mjs';

const example = fileURLToPath(new URL('../examples/kickoff/training-field.json', import.meta.url));
const series = fileURLToPath(new URL('../scripts/rehearsal-series.mjs', import.meta.url));

// Full saved results produced before wait-cycle handling existed, for the unmodified invented training
// field and for its first match with the blue slot-1 and slot-2 duties exchanged.
// Re-pinned when the training profile gained optional entry/robotLimits fields; results otherwise byte-identical (verified).
const EXAMPLE_RESULT_SHA256 = '68046fbde097ca3f60b80d0f254742f939ef9923868a9c83d134dd06f86bfe1a';
// Re-pinned when the training profile gained optional entry/robotLimits fields; results otherwise byte-identical (verified).
const SWAPPED_RESULT_SHA256 = 'cd6b89a55d29b1919df4a694b52a0a43bc127c8efc3c8897bb3bbd660bb49ea9';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function profileFile(t, {swap = false, waitCycles} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'wait-cycle-'));
  t.after(() => rmSync(root, {force: true, recursive: true}));
  const profile = JSON.parse(readFileSync(example));
  if (swap) {
    // Exchange the duties of two adjacent blue start slots. Their routes now meet head-on.
    const [match] = profile.rehearsal.series.matches;
    const a = match.roster.find(r => r.side === 'blue' && r.slot === 1), b = match.roster.find(r => r.side === 'blue' && r.slot === 2);
    [a.plans, b.plans] = [b.plans, a.plans];
    profile.rehearsal.series.matches = [match];
  }
  if (waitCycles) profile.rehearsal.waitCycles = waitCycles;
  const file = path.join(root, 'profile.json');
  writeFileSync(file, JSON.stringify(profile, null, 2));
  return file;
}

const run = (...args) => spawnSync(process.execPath, [series, ...args], {encoding: 'utf8'});
const robots = period => Object.fromEntries(period.robots.map(r => [r.id, r]));

test('the unmodified training field reproduces its earlier saved result and reports no wait cycle', () => {
  const bytes = execFileSync(process.execPath, [series, example]);
  assert.equal(sha(bytes), EXAMPLE_RESULT_SHA256);
  const report = JSON.parse(execFileSync(process.execPath, [series, example, '--report-deadlocks']));
  assert.deepEqual([report.cycleCount, report.resultSha256, report.waitCycles], [0, EXAMPLE_RESULT_SHA256, 'report']);
});

test('by default a permanent wait cycle is reported without changing the saved bytes', t => {
  const file = profileFile(t, {swap: true});
  const plain = run(file);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(sha(plain.stdout), SWAPPED_RESULT_SHA256);
  const [match] = JSON.parse(plain.stdout).matches;
  assert.ok(match.periods.every(p => robots(p).B1.visits === 0 && robots(p).B2.visits === 0 && !('deadlocks' in p)));
  assert.match(plain.stderr, /\[rehearsal\] trial-1 Opening wait cycle B1 -> B2 -> B1 from 0\.40 s for 9\.60 s \(held to period end\)/);
  assert.match(plain.stderr, /\[rehearsal\] trial-1 Main play wait cycle B1 -> B2 -> B1 from 0\.00 s for 45\.00 s \(held to period end\)/);
  const reported = run(file, '--report-deadlocks');
  const report = JSON.parse(reported.stdout);
  assert.equal(report.resultSha256, SWAPPED_RESULT_SHA256);
  assert.deepEqual([report.cycleCount, report.permanentCount, report.matchesWithCycles], [2, 2, ['trial-1']]);
  assert.deepEqual(report.cycles[0], {match: 'trial-1', phase: 'Opening', cycle: ['B1', 'B2'], startS: 0.4, durationS: 9.6, ended: 'period-end'});
});

test('opting in to yield resolves the swapped cycle deterministically', t => {
  const file = profileFile(t, {swap: true, waitCycles: 'yield'});
  const first = run(file);
  assert.equal(first.status, 0, first.stderr);
  const [match] = JSON.parse(first.stdout).matches;
  for (const period of match.periods) {
    const {B1, B2} = robots(period);
    assert.ok(B1.visits > 0 && B2.visits > 0 && B1.waitSeconds < 5 && B2.waitSeconds < 5, period.phase);
  }
  // B2 is latest in roster order and tries first, but its supply stop lies inside B1's footprint, so B1 detours.
  assert.deepEqual(match.periods[0].deadlocks, [{phase: 'Opening', timeS: 1.4, sinceS: 0.4, cycle: ['B1', 'B2'], yielded: 'B1'}]);
  assert.match(first.stderr, /trial-1 Opening wait cycle B1 -> B2 -> B1 from 0\.40 s for 1\.0\d s \(cleared\); B1 yielded/);
  assert.equal(run(file).stdout, first.stdout);
});

test('opting in leaves a series without wait cycles unchanged apart from its profile hash', t => {
  const strip = text => ({...JSON.parse(text), profileSha256: null});
  const optedIn = run(profileFile(t, {waitCycles: 'yield'}));
  assert.equal(optedIn.status, 0, optedIn.stderr);
  assert.deepEqual(strip(optedIn.stdout), strip(execFileSync(process.execPath, [series, example], {encoding: 'utf8'})));
});

test('only the yield setting is accepted', () => {
  const profile = JSON.parse(readFileSync(example));
  profile.rehearsal.waitCycles = 'priority';
  assert.throws(() => validateProfile(profile), /Set rehearsal.waitCycles to "yield" or omit it/);
});
