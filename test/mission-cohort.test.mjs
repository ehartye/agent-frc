import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeDemo } from '../examples/cohort/make-demo.mjs';
import { reviewCohort } from '../scripts/mission-cohort.mjs';

function fixture(t) {
  const temp = mkdtempSync(path.join(tmpdir(), 'agent-frc-cohort-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const dir = path.join(temp, 'cases'),
    pin = makeDemo(dir);
  const get = (file) => JSON.parse(readFileSync(path.join(dir, file)));
  const put = (file, v) => {
    const bytes = Buffer.from(JSON.stringify(v));
    writeFileSync(path.join(dir, file), bytes);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const journal = get('journal.json');
  const review = async () => {
    put('journal.json', journal);
    return reviewCohort(path.join(dir, 'manifest.json'), path.join(dir, 'journal.json'), pin);
  };
  const mutate = (i, change) => {
    const e = journal.entries[i],
      r = get(e.receipt.file),
      s = get(r.chain[0].file);
    change(r, s);
    r.chain[0] = put(r.chain[0].file, s);
    e.receipt = put(e.receipt.file, r);
  };
  return { dir, pin, get, put, journal, review, mutate };
}

test('frozen evaluation counts every slot, admits a threshold tie and keeps exact replays out of the denominator', async (t) => {
  const f = fixture(t);
  f.journal.entries.push(f.journal.entries[0]);
  const r = await f.review();
  assert.equal(r.verdict, 'met');
  assert.equal(r.denominator, 20);
  assert.equal(r.counts.pass, 19);
  assert.equal(r.counts['mission-failure'], 1);
  assert.equal(r.attempts[0].replayedReceipts, 1);
  assert.equal(r.attempts.at(-1).attempts[0].failureTimeS, 4);
});
test('hidden setup, changed controller, copied restart, missed deadline and repeated item withhold credit', async (t) => {
  const f = fixture(t);
  f.mutate(0, (r) => {
    r.controllerInitialInputs = { offset: r.values.offset };
  });
  f.mutate(1, (r) => {
    r.revisions.controller = '0'.repeat(64);
  });
  f.mutate(2, (r, s) => {
    s.inputStateSha256 = f.get('manifest.json').attempts[0].initial.sha256;
  });
  f.mutate(3, (r, s) => {
    s.timeS = 5;
    s.decision.completionS = 4.01;
  });
  f.mutate(4, (r, s) => {
    s.decision.items[1].id = s.decision.items[0].id;
  });
  const r = await f.review();
  assert.equal(r.counts.unsupported, 5);
  assert.equal(r.counts.pass, 14);
  assert.equal(r.verdict, 'open');
});
test('borrowing another raw execution invalidates both claims; mismatched receipt never credits the slot', async (t) => {
  const f = fixture(t),
    source = f.get('trial-1-stage.json').source;
  f.mutate(1, (r, s) => {
    s.source = source;
  });
  f.journal.entries[2].receipt = f.journal.entries[3].receipt;
  const r = await f.review();
  assert.equal(r.counts.unsupported, 3);
  assert.equal(r.counts.pass, 16);
});
test('identical-input infrastructure retry can settle a slot; missing attempts and first mission failures remain visible', async (t) => {
  const f = fixture(t),
    e = f.journal.entries[0],
    r = f.get(e.receipt.file);
  const infra = f.put('incident.json', {
    ...r,
    runId: 'crashed',
    status: 'infrastructure-failure',
    reason: 'solver stopped',
    source: f.put('incident-log.json', { exit: 1 }),
  });
  f.journal.entries.unshift({ attemptId: e.attemptId, receipt: infra });
  f.journal.entries.splice(2, 1);
  const result = await f.review();
  assert.equal(result.counts.pass, 18);
  assert.equal(result.counts.missing, 1);
  assert.deepEqual(
    result.attempts[0].attempts.map((a) => a.status),
    ['infrastructure-failure', 'pass'],
  );
  f.journal.entries = f.journal.entries.filter((x) => x.receipt.sha256 !== e.receipt.sha256);
  assert.equal((await f.review()).counts['infrastructure-failure'], 1);
});
test('reordered manifest, tuning imports, stale files, switched parent, missing scores and duplicate raw pins fail closed', async (t) => {
  const f = fixture(t);
  const stage = f.get('trial-1-stage.json');
  f.put(stage.source.file, { changed: true });
  f.mutate(1, (r, s) => {
    s.parentSha256 = 'c'.repeat(64);
  });
  f.mutate(2, (r, s) => {
    s.decision.items = [];
  });
  assert.equal((await f.review()).counts.unsupported, 3);
  f.journal.entries.push({ attemptId: 'setup', receipt: f.journal.entries[0].receipt });
  await assert.rejects(f.review(), /unregistered/);
  f.journal.entries.pop();
  const manifest = f.get('manifest.json');
  manifest.attempts.reverse();
  f.put('manifest.json', manifest);
  await assert.rejects(f.review(), /pre-run digest/);
});
test('repeated failures can establish that the declared threshold is unreachable', async (t) => {
  const f = fixture(t);
  f.mutate(0, (r, s) => {
    s.decision = { verdict: 'mission-failure', firstFailedCheck: 'edge absent', failureTimeS: 3 };
  });
  f.journal.entries.push(f.journal.entries[0]);
  assert.equal((await f.review()).verdict, 'missed');
});

test('each handoff must consume the exact preceding output even with a matching stage envelope', async (t) => {
  const f = fixture(t),
    m = f.get('manifest.json');
  m.stages.push('observe');
  const pin = f.put('manifest.json', m).sha256;
  f.journal.manifestSha256 = pin;
  // Keep one registered attempt to exercise the two-stage seam directly.
  const e = f.journal.entries[0],
    run = f.get(e.receipt.file),
    first = f.get(run.chain[0].file);
  const decision = first.decision;
  delete first.decision;
  const firstRef = f.put('arrival.json', first);
  const next = {
    ...first,
    stage: 'observe',
    source: f.put('observer.json', { edges: [1, 3] }),
    decision,
    parentSha256: firstRef.sha256,
    inputStateSha256: first.outputState.sha256,
  };
  async function check() {
    run.chain = [firstRef, f.put('observed.json', next)];
    run.manifestSha256 = pin;
    e.receipt = f.put('combined.json', run);
    f.put('journal.json', { ...f.journal, entries: [e] });
    return (await reviewCohort(path.join(f.dir, 'manifest.json'), path.join(f.dir, 'journal.json'), pin))
      .attempts[0];
  }
  assert.equal((await check()).status, 'pass');
  next.inputStateSha256 = m.attempts[1].initial.sha256;
  assert.match((await check()).issues[0], /achieved state/);
});

test('execution keys cannot be assigned to two roster slots, and retries cannot erase a mission failure', async (t) => {
  const f = fixture(t);
  f.mutate(1, (r, s) => {
    r.runId = s.runId = 'execution-1';
  });
  const final = f.journal.entries.at(-1),
    failed = f.get(final.receipt.file);
  const fake = f.put('retry.json', {
    ...failed,
    runId: 'substitute',
    status: 'infrastructure-failure',
    reason: 'reclassified',
    source: f.put('incident.json', { code: 1 }),
  });
  f.journal.entries.push({ attemptId: final.attemptId, receipt: fake });
  const reviewed = await f.review();
  assert.equal(reviewed.counts.unsupported, 2);
  assert.equal(reviewed.attempts.at(-1).status, 'mission-failure');
  assert.match(reviewed.attempts.at(-1).issues[0], /cannot be replaced/);
});
