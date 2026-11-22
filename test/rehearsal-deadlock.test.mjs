import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const example = fileURLToPath(new URL('../examples/kickoff/training-field.json', import.meta.url));
const series = fileURLToPath(new URL('../scripts/rehearsal-series.mjs', import.meta.url));

// Full saved result of the unmodified invented training field before deadlock handling existed.
const EXAMPLE_RESULT_SHA256 = '000ac2e2c9a4f9a394c6545412b399956d00f6cd66a9285f7eecef1fc652bba1';

function swapped(t) {
  // Exchange the duties of two adjacent blue start slots. Their routes now meet head-on.
  const root = mkdtempSync(path.join(tmpdir(), 'lane-deadlock-'));
  t.after(() => rmSync(root, {force: true, recursive: true}));
  const profile = JSON.parse(readFileSync(example));
  const [match] = profile.rehearsal.series.matches;
  const a = match.roster.find(r => r.side === 'blue' && r.slot === 1), b = match.roster.find(r => r.side === 'blue' && r.slot === 2);
  [a.plans, b.plans] = [b.plans, a.plans];
  profile.rehearsal.series.matches = [match];
  const file = path.join(root, 'swapped.json');
  writeFileSync(file, JSON.stringify(profile, null, 2));
  return file;
}

test('non-deadlocked series results are byte-identical to their earlier saved result', () => {
  const bytes = execFileSync(process.execPath, [series, example]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EXAMPLE_RESULT_SHA256);
  const result = JSON.parse(bytes);
  assert.ok(result.matches.every(m => m.periods.every(p => !('deadlocks' in p))));
});

test('a head-on wait cycle between swapped adjacent robots yields deterministically and reports the cycle', t => {
  const file = swapped(t);
  const run = spawnSync(process.execPath, [series, file], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  const [match] = JSON.parse(run.stdout).matches;
  for (const period of match.periods) {
    const robots = Object.fromEntries(period.robots.map(r => [r.id, r]));
    assert.ok(robots.B1.visits > 0 && robots.B2.visits > 0, period.phase + ' ' + JSON.stringify([robots.B1, robots.B2]));
    assert.ok(robots.B1.waitSeconds < 5 && robots.B2.waitSeconds < 5, period.phase);
  }
  const [first] = match.periods[0].deadlocks;
  assert.deepEqual(first.cycle, ['B1', 'B2']);
  // B2 is latest in roster order and tries first, but its supply stop lies inside B1's footprint, so B1 detours.
  assert.equal(first.yielded, 'B1');
  assert.equal(first.phase, 'Opening');
  assert.ok(first.timeS > 0 && first.sinceS < first.timeS);
  assert.match(run.stderr, /\[rehearsal\] trial-1 Opening .*wait cycle B1 -> B2 -> B1; B1 yields/);
  // The same profile yields identically on every run.
  assert.equal(execFileSync(process.execPath, [series, file], {encoding: 'utf8'}), run.stdout);
});
