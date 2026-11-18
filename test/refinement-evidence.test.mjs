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
