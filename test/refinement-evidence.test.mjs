import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessContactConvergence } from '../scripts/contact-convergence.mjs';

const fixture = fileURLToPath(new URL('../examples/refinement-evidence/', import.meta.url));
const cli = fileURLToPath(new URL('../scripts/check-refinement-evidence.mjs', import.meta.url));
const names = ['manifest', 'receipt', 'request', 'evidence'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = fs.readFileSync(path.join(fixture, 'request.sha256'), 'utf8').trim();

function evaluate(dir, pin = frozen) {
  const paths = names.map(name => path.join(dir, name + '.json'));
  const args = pin === null ? paths : [...paths, '--request-sha256', pin];
  const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', shell: false });
  assert.doesNotThrow(() => JSON.parse(run.stdout), run.stderr);
  return { code: run.status, report: JSON.parse(run.stdout) };
}

function copyFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frc-refinement-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = names.map(name => path.join(dir, name + '.json'));
  const docs = names.map((name, i) => {
    fs.copyFileSync(path.join(fixture, name + '.json'), files[i]);
    return JSON.parse(fs.readFileSync(files[i], 'utf8'));
  });
  const [manifest, receipt, request, evidence] = docs;
  function save() {
    for (let i = 0; i < files.length; i++) {
      const bytes = JSON.stringify(docs[i]) + '\n';
      fs.writeFileSync(files[i], bytes);
      if (i < 3) evidence[names[i] + 'Sha256'] = digest(bytes);
    }
    return evidence.requestSha256;
  }
  return { dir, files, manifest, receipt, request, evidence, save };
}

test('two refinement axes share a run and reproduce the complete legacy verdict', () => {
  const before = names.map(name => fs.readFileSync(path.join(fixture, name + '.json')));
  const [manifest, receipt] = before.map(bytes => JSON.parse(bytes));
  const { report } = evaluate(fixture);
  assert.deepEqual(report.numerical, assessContactConvergence(manifest, receipt));
  assert.equal(report.engineeringAcceptance, 'blocked');
  assert.deepEqual(report.studies.map(s => s.schedule.status), ['matched', 'matched']);
  assert.equal(report.studies.every(s => s.schedule.runs.length === 3), true);
  assert.deepEqual(names.map(n => fs.readFileSync(path.join(fixture, n + '.json'))), before);
});

for (const [label, mutate, field] of [
  ['shift a tick', s => { s.events[1].tick++; }, 'events'],
  ['switch equal-tick order', s => s.events.reverse(), 'events'],
  ['change a phase', s => { s.events[0].phase = 'off'; }, 'events'],
  ['change an uneventful held channel', s => { s.entry[1].target = 0; }, 'entry'],
  ['remove a recorded event', s => s.events.pop(), 'events']
]) {
  test(label + ' identifies the differing run and location', t => {
    const f = copyFixture(t);
    mutate(f.evidence.runs[0].schedule);
    const { report } = evaluate(f.dir, f.save());
    const result = report.studies[0].schedule.runs[0];
    assert.equal(result.id, 'coarse-time');
    assert.equal(result.status, 'different-inputs');
    assert.match(result.issue, new RegExp(field));
    assert.equal(report.studies[1].schedule.status, 'matched');
  });
}

for (const [label, mutate] of [
  ['incompatible units', f => { f.evidence.runs[0].schedule.channels[0].units = 'mV'; }],
  ['missing run', f => f.evidence.runs.shift()],
  ['missing held state', f => f.evidence.runs[0].schedule.entry.pop()],
  ['missing expectation', f => { delete f.request.studies[0].schedule; }],
  ['noninteger tick', f => { f.evidence.runs[0].schedule.events[0].tick = 1.5; }],
  ['out-of-window event', f => { f.evidence.runs[0].schedule.events[1].tick = 10; }]
]) {
  test(label + ' prevents a valid comparison', t => {
    const f = copyFixture(t);
    mutate(f);
    const { report, code } = evaluate(f.dir, f.save());
    assert.equal(code, 2);
    assert.equal(report.studies[0].schedule.status, 'unknown');
    assert.equal(report.numerical.status, 'within-declared-bounds');
  });
}

test('receipt and manifest are bound as exact raw bytes', t => {
  for (const name of ['receipt','manifest']) {
    const f = copyFixture(t);
    fs.appendFileSync(f.files[names.indexOf(name)], ' ');
    const { code, report } = evaluate(f.dir);
    assert.equal(code, 2);
    assert.match(JSON.stringify(report.issues), new RegExp(name));
  }
});

test('changing observations and the expected request cannot replace an independent pin', t => {
  const f = copyFixture(t);
  for (const study of f.request.studies) study.schedule.events[0].target = 8;
  for (const run of f.evidence.runs) run.schedule.events[0].target = 8;
  f.save();
  for (const pin of [frozen, null]) {
    const { code, report } = evaluate(f.dir, pin);
    assert.equal(code, 2);
    assert.match(JSON.stringify(report.issues), /request/i);
  }
});

test('numerical and discrete disagreement survive matching schedules', t => {
  for (const mutate of [
    run => { run.metrics[0].value = 20; },
    run => { run.outcome = 'contact-at-horizon'; }
  ]) {
    const f = copyFixture(t);
    mutate(f.receipt.runs.find(run => run.id === 'shared'));
    const { report } = evaluate(f.dir, f.save());
    assert.equal(report.numerical.status, 'not-converged');
    assert.equal(report.studies[0].schedule.status, 'matched');
  }
});

const poseIds = ['low', 'rising', 'middle', 'high', 'tipping', 'airborne'];
const localScope = () => [
  { kind: 'continuation', origin: 'model-start', units: 's', interval: [0.3, 1],
    checkpoint: { id: 'stopped', sha256: 'b'.repeat(64) } },
  { kind: 'poses', origin: 'model-start', units: 's', poseIds: [...poseIds] }
];
function recordLocal(f) {
  for (const run of f.evidence.runs) {
    run.coverage = localScope().map(item => ({ ...item, findings: [] }));
    run.coverage[1].findings.push({ poseId: 'airborne', outcome: 'failed', detail: 'Support bound below weight' });
  }
}

test('the four unchanged published files and independently frozen digest pass', () => {
  const { code, report } = evaluate(fixture);
  assert.equal(code, 0);
  assert.equal(report.studies.every(study => study.coverage.status === 'covered'), true);
  assert.equal(report.engineeringAcceptance, 'blocked');
});

test('a shared temporal checkpoint and six poses cannot demonstrate an independently replayed whole cycle', t => {
  const f = copyFixture(t);
  recordLocal(f);
  for (const study of f.request.studies) {
    study.coverage.push({ kind: 'poses', origin: 'model-start', units: 's', poseIds: [...poseIds, 'landing'] });
  }
  f.evidence.runs[0].schedule.events[1].tick++;
  const { code, report } = evaluate(f.dir, f.save());
  assert.equal(code, 2);
  assert.equal(report.studies[0].schedule.status, 'different-inputs');
  const row = report.studies[0].coverage.runs[0];
  assert.match(row.issues.join(' '), /startup/);
  assert.match(row.issues.join(' '), /landing/);
  assert.deepEqual(row.observations, f.evidence.runs[0].coverage);
});

test('matching local scope remains covered even when a sampled finding or numerical comparison fails', t => {
  const f = copyFixture(t);
  recordLocal(f);
  for (const study of f.request.studies) study.coverage = localScope();
  const positive = evaluate(f.dir, f.save());
  assert.equal(positive.code, 0);
  assert.equal(positive.report.studies[1].coverage.runs[0].observations[1].findings[0].outcome, 'failed');
  f.receipt.runs[2].metrics[0].value = 30;
  const numerical = evaluate(f.dir, f.save());
  assert.equal(numerical.code, 1);
  assert.equal(numerical.report.studies[0].coverage.status, 'covered');
});

for (const [label, mutate] of [
  ['different checkpoint bytes', rows => { rows[0].checkpoint.sha256 = 'c'.repeat(64); }],
  ['different checkpoint identity', rows => { rows[0].checkpoint.id = 'previous'; }],
  ['incompatible time origin', rows => { rows[0].origin = 'other'; }],
  ['missing start of requested interval', rows => { rows[0].interval[0] = 0.4; }],
  ['reversed observed interval', rows => rows[0].interval.reverse()],
  ['duplicate pose', rows => { rows[1].poseIds[2] = rows[1].poseIds[3]; }],
  ['failed finding at a pose outside the observed set', rows => { rows[1].findings[0].poseId = 'absent'; }],
  ['temporal finding outside observation', rows => rows[0].findings.push({ interval: [0,1], outcome: 'failed', detail: 'Load' })],
  ['missing pose', rows => rows[1].poseIds.shift()]
]) {
  test(label + ' leaves requested coverage unsatisfied', t => {
    const f = copyFixture(t);
    recordLocal(f);
    for (const study of f.request.studies) study.coverage = localScope();
    mutate(f.evidence.runs[0].coverage);
    const { code, report } = evaluate(f.dir, f.save());
    assert.equal(code, 2);
    assert.equal(report.studies[0].coverage.status, 'unknown');
    assert.equal(report.studies[0].schedule.status, 'matched');
  });
}

test('complete coverage preserves schedule, metric and discrete disagreement exit 1', t => {
  for (const mutate of [
    f => f.evidence.runs[0].schedule.events[1].tick++,
    f => { f.receipt.runs[2].metrics[0].value = 3; },
    f => { f.receipt.runs[2].outcome = 'contact-at-horizon'; }
  ]) {
    const f = copyFixture(t);
    mutate(f);
    assert.equal(evaluate(f.dir, f.save()).code, 1);
  }
});

test('invalid predeclared coverage, extra or duplicate run and oversized inputs fail closed', t => {
  for (const mutate of [
    f => { f.request.studies[0].coverage = []; },
    f => { f.request.studies[0].coverage[0].interval = [-1, 1]; },
    f => { f.evidence.runs.push(f.evidence.runs[0]); },
    f => { f.evidence.runs.push({ ...f.evidence.runs[0], id: 'extra' }); }
  ]) {
    const f = copyFixture(t);
    mutate(f);
    assert.equal(evaluate(f.dir, f.save()).code, 2);
  }
  const f = copyFixture(t);
  fs.appendFileSync(f.files[3], Buffer.alloc(5000001, 32));
  assert.equal(evaluate(f.dir).code, 2);
});

test('a later incompatible unit takes priority over an earlier held-state difference', t => {
  const f = copyFixture(t);
  f.evidence.runs[0].schedule.entry[0].target = 9;
  f.evidence.runs[0].schedule.channels[1].units = 'deg';
  const { code, report } = evaluate(f.dir, f.save());
  assert.equal(code, 2);
  assert.equal(report.studies[0].schedule.runs[0].status, 'unknown');
  assert.match(report.studies[0].schedule.runs[0].issue, /units/);
});

test('malformed sibling leaves a valid observed interval and local failed finding visible', t => {
  const f = copyFixture(t);
  const valid = { interval: [0, 0.1], outcome: 'failed', detail: 'Support below weight' };
  f.evidence.runs[0].coverage[0].findings = [valid, { ...valid, interval: [-0.1, 0.1] }];
  const { code, report } = evaluate(f.dir, f.save());
  const row = report.studies[0].coverage.runs[0];
  assert.equal(code, 2);
  assert.equal(row.status, 'unknown');
  assert.deepEqual(row.observations, [{ ...f.evidence.runs[0].coverage[0], findings: [valid] }]);
  assert.match(row.issues.join(' '), /finding/);
  assert.doesNotMatch(row.issues.join(' '), /missing startup/);
});

test('readable numerical result survives missing, malformed and unbound companions', t => {
  for (const fault of ['missing file', 'malformed request', 'missing flag', 'wrong digest']) {
    const f = copyFixture(t);
    if (fault === 'missing file') fs.unlinkSync(f.files[3]);
    if (fault === 'malformed request') fs.writeFileSync(f.files[2], '{');
    const pin = fault === 'missing flag' ? null : fault === 'wrong digest' ? 'f'.repeat(64) : frozen;
    const { report, code } = evaluate(f.dir, pin);
    assert.equal(code, 2);
    assert.deepEqual(report.numerical, assessContactConvergence(f.manifest, f.receipt));
    assert.equal(report.binding, 'unbound');
    assert.equal(report.studies.every(s => s.schedule.status === 'unknown' && s.coverage.status === 'unknown'), true);
  }
});

test('non-assessable numerical receipt leaves independently bound companion dimensions visible', t => {
  const f = copyFixture(t);
  f.receipt.runs[0].metrics[0].value = 'broken';
  const { report, code } = evaluate(f.dir, f.save());
  assert.equal(code, 2);
  assert.deepEqual(report.numerical, assessContactConvergence(f.manifest, f.receipt));
  assert.equal(report.binding, 'bound');
  assert.equal(report.studies[0].schedule.status, 'matched');
  assert.equal(report.studies[1].coverage.status, 'covered');
});

test('missing required numerical value outranks a discrete change while preserving both results', t => {
  const f = copyFixture(t);
  f.receipt.runs[2].metrics[0].value = null;
  f.receipt.runs[2].outcome = 'contact-at-horizon';
  const { report, code } = evaluate(f.dir, f.save());
  assert.equal(code, 2);
  assert.deepEqual(report.numerical, assessContactConvergence(f.manifest, f.receipt));
  assert.equal(report.numerical.status, 'not-converged');
  assert.match(report.issues.join(' '), /shared.*travel/);
  assert.equal(report.studies[0].schedule.status, 'matched');
});

test('binary rounding at a derived horizon is allowed, while an actual overrun is unknown', t => {
  const f = copyFixture(t);
  f.manifest.windowEndSeconds = 0.3;
  for (const run of f.receipt.runs) run.windowEndSeconds = 0.3;
  for (const row of [...f.request.studies, ...f.evidence.runs]) {
    row.schedule.clock.periodSeconds = 0.1;
    row.schedule.window[1] = 3;
    row.coverage[0].interval[1] = 0.3;
  }
  assert.equal(evaluate(f.dir, f.save()).code, 0);
  for (const row of [...f.request.studies, ...f.evidence.runs]) row.schedule.clock.periodSeconds = 0.10000000001;
  assert.equal(evaluate(f.dir, f.save()).code, 2);
});

test('a valid long v1 study and shared run identity remain addressable', t => {
  const f = copyFixture(t);
  const id = 'r'.repeat(1000), studyId = 's'.repeat(2000);
  f.manifest.studies[0].id = f.request.studies[0].id = studyId;
  for (const study of f.manifest.studies) study.levels.find(l => l.runId === 'shared').runId = id;
  f.receipt.runs.find(r => r.id === 'shared').id = id;
  f.evidence.runs.find(r => r.id === 'shared').id = id;
  const { code, report } = evaluate(f.dir, f.save());
  assert.equal(report.numerical.status, 'within-declared-bounds');
  assert.equal(code, 0);
});
