/**
 * The physics identity of a checked design: what the layout check read and what it found, with the labels left out.
 *
 * Two commits of one design have the same identity when a rerun of the layout check could not tell them apart: the
 * same STEP, editable design, motion study, stages, groups, mounts, displaced control, trials, fixtures, budgets and
 * limits, and the same verdicts. A rename, a moved folder, a reworded title and a rebuilt view leave it unchanged.
 *
 * Left out as labels: every `issue` field, the plan's `presentation`, `view` and `attachment` blocks, the `phase` a
 * stage plays in, and the folder part of each path. A record that embeds the issue name is digested without it, so a
 * rename does not change its digest here.
 */
import {createHash} from 'node:crypto';

const receiptSchema = 'agent-frc/preliminary-layout-result@1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const named = v => typeof v === 'string' && v.trim().length > 0;
const list = v => Array.isArray(v) ? v : [];
const canonical = v => Array.isArray(v) ? v.map(canonical) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const lfsPointer = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n(?:.*\r?\n)*?oid sha256:([0-9a-f]{64})\r?\n/;

/** The SHA-256 of a file's content. A Git LFS pointer names the digest of the file it stands for. */
export function contentSha(bytes) {
  const pointer = bytes.length < 1024 ? lfsPointer.exec(bytes.toString('utf8')) : null;
  return pointer ? pointer[1] : sha(bytes);
}

/** A stage without the phase it is shown in and without the folder of each trial it names. */
const stageOf = stage => canonical((function walk(node) {
  if (Array.isArray(node)) return node.map(walk);
  if (!object(node)) return node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => k !== 'file' && k !== 'phase').map(([k, v]) => [k, walk(v)]));
})(stage ?? null));

/** What the check found, by verdict. Measured values are left out; a kernel on another system may round them differently. */
function results(receipt) {
  const r = receipt ?? {};
  return {
    status: r.status ?? null, cycle: list(r.cycle), cases: list(r.cases).map(c => [c?.case, c?.status]).sort(),
    control: [r.control?.case ?? null, r.control?.displaced ?? null, r.control?.offsetMm ?? null, r.control?.witness?.status ?? null],
    massStatus: r.budgets?.massStatus ?? null, electricalCases: list(r.budgets?.electricalCases).map(c => [c?.case, c?.status]).sort(),
    objectives: list(r.narrativeReview?.objectives).map(o => [o?.objective, o?.disposition]).sort(),
    previousCheckpointSha256: r.previousCheckpointSha256 ?? null
  };
}

/**
 * The identity a receipt carries on its own: the digests it recorded and the plan it repeats. It sees a change to the
 * STEP, the motion study, the budgets, the stages or the control. The budget ledger and the premise records embed the
 * issue name, so this form also changes on a rename; it is the one to use when the issue name stays, as in a view
 * refresh, and the fallback when the layout plan is not committed. scripts/stage_preliminary_review.py repeats it.
 */
export function receiptIdentity(receipt) {
  const r = receipt ?? {};
  return canonical({
    ...results(r), step: r.step?.sha256 ?? null, motion: r.motion?.sha256 ?? null, design: r.design?.sha256 ?? null,
    budgets: r.budgets?.source?.sha256 ?? null, limits: r.budgets?.limits?.sha256 ?? null,
    stages: Object.fromEntries(Object.entries(r.stages ?? {}).map(([name, stage]) => [name, stageOf(stage)])),
    groups: r.groups ?? null, mounts: r.mounts ?? null, datum: r.datum ?? null
  });
}

/** The plan without its labels. */
function planPhysics({issue, presentation, view, attachment, stages, ...rest}) {
  return {...rest, ...(object(stages) ? {stages: Object.fromEntries(Object.entries(stages).map(([name, stage]) => {
    if (!object(stage)) return [name, stage];
    const {phase, ...physics} = stage;
    return [name, physics];
  }))} : {})};
}

/**
 * The identity of one design.
 *   receipt  its parsed receipt
 *   read     path => bytes or null, for a path as the plan writes it (relative to the folder the check ran in)
 *   plan     the plan's path in that form, or undefined when the inputs are not committed
 *   folder   the design's inputs folder in that form, '' when the check ran inside it
 *   extra    further records to follow from the same folder, such as missions.json
 * Returns {files, results, recorded}. `files` maps each file the plan reaches to a label-free digest and is null when
 * the plan cannot be read. A file that cannot be read is recorded as 'missing'.
 */
export function physicsIdentity({receipt, read, plan, folder = '', extra = []}) {
  const identity = {files: null, results: results(receipt), recorded: receiptIdentity(receipt)};
  const planBytes = named(plan) ? read(plan) : null;
  if (!planBytes) return identity;
  const prefix = folder ? folder.replace(/\/+$/, '') + '/' : '';
  const local = text => prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
  // The STEP is large and has no label in it: the digest the receipt recorded stands for its content.
  const known = new Map([receipt?.step].filter(p => named(p?.file) && named(p?.sha256) && !p.file.endsWith('.json')).map(p => [p.file, p.sha256]));
  const files = {};
  const visit = (file, {strip, typed, bytes} = {}) => {
    const key = local(file);
    if (key in files) return key;
    files[key] = 'pending';
    const json = file.endsWith('.json');
    if (!json && known.has(file)) { files[key] = known.get(file); return key; }
    bytes ??= read(file);
    if (!bytes) { files[key] = !json && named(typed) ? typed : 'missing'; return key; }
    let data;
    if (json) try { data = JSON.parse(bytes.toString('utf8').replace(/^﻿/, '')); } catch { /* digested as bytes */ }
    // A held receipt is evidence of an earlier check, compared whole.
    if (!object(data) && !Array.isArray(data) || data?.schema === receiptSchema) { files[key] = contentSha(bytes); return key; }
    files[key] = sha(JSON.stringify(canonical(walk(strip ? strip(data) : data))));
    return key;
  };
  const walk = node => {
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === 'string') return local(node);
    if (!object(node)) return node;
    const pinned = typeof node.file === 'string', out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'issue' || pinned && key === 'sha256') continue;
      if (pinned && key === 'file') out.pin = visit(value, {typed: node.sha256});
      else out[key] = walk(value);
    }
    return out;
  };
  visit(plan, {strip: data => object(data) ? planPhysics(data) : data, bytes: planBytes});
  for (const name of extra) if (read(prefix + name)) visit(prefix + name);
  identity.files = files;
  return identity;
}

/** What differs between two identities, in words a designer can act on. Empty when the physics is the same. */
export function identityDifferences(a, b) {
  const differs = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  const found = Object.keys(a.results).filter(key => differs(a.results[key], b.results[key])).map(key => 'the ' + key + ' result');
  if (a.files && b.files) {
    for (const name of [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].sort())
      if (a.files[name] !== b.files[name]) found.push(name + (a.files[name] === undefined ? ' (no longer read)' : b.files[name] === undefined ? ' (newly read)' : ''));
    return found;
  }
  // Without a committed plan on both sides, compare what the receipts recorded.
  for (const key of Object.keys(a.recorded)) if (!(key in a.results) && differs(a.recorded[key], b.recorded[key])) found.push('the recorded ' + key);
  return found;
}
