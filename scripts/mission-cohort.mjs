import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readViewerBytes } from './native-viewer-cli.mjs';

const roles = ['controller', 'scorer', 'geometry', 'observationPolicy'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const named = (value) => typeof value === 'string' && value.trim().length > 0;
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const natural = (n) => Number.isSafeInteger(n) && n > 0;
const time = (n) => Number.isFinite(n) && n >= 0;
function requireValue(condition, reason) {
  if (!condition) throw new Error(reason);
}
function names(list, label) {
  requireValue(
    Array.isArray(list) && list.every(named) && new Set(list).size === list.length,
    'Invalid or repeated ' + label,
  );
  return list;
}
function keys(value, expected) {
  return (
    object(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((k) => Object.hasOwn(value, k))
  );
}
function identicalMap(a, b) {
  return keys(a, Object.keys(b)) && Object.entries(b).every(([k, v]) => a[k] === v);
}
function parse(bytes) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function reader(directory) {
  const root = fs.realpathSync(directory);
  const cache = new Map();
  return async function read(ref, json = false) {
    requireValue(object(ref) && named(ref.file) && digest(ref.sha256), 'Invalid artifact reference');
    requireValue(
      !path.isAbsolute(ref.file) &&
        !path.win32.isAbsolute(ref.file) &&
        !ref.file.split(/[\\/]/).includes('..'),
      'Artifact must be relative to the manifest directory',
    );
    const file = fs.realpathSync(path.resolve(root, ref.file));
    const rel = path.relative(root, file);
    requireValue(
      rel &&
        !rel.startsWith('..' + path.sep) &&
        rel !== '..' &&
        !path.isAbsolute(rel) &&
        fs.statSync(file).isFile(),
      'Artifact is outside project or not a regular file',
    );
    const cacheKey = JSON.stringify([file, json]);
    if (!cache.has(cacheKey)) {
      if (json) {
        const bytes = readViewerBytes(file);
        cache.set(cacheKey, { sha: hash(bytes), value: parse(bytes) });
      } else {
        const accumulator = createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) accumulator.update(chunk);
        cache.set(cacheKey, { sha: accumulator.digest('hex') });
      }
    }
    const entry = cache.get(cacheKey);
    requireValue(entry.sha === ref.sha256, 'Digest mismatch: ' + ref.file);
    return entry.value;
  };
}

async function freeze(m, read) {
  requireValue(
    m?.schema === 'agent-frc/mission-cohort@1' && named(m.id) && ['modeled', 'measured'].includes(m.basis),
    'Invalid mission cohort',
  );
  requireValue(
    keys(m.revisions, roles),
    'Declare controller, scorer, geometry and observation policy revisions',
  );
  for (const role of roles) await read(m.revisions[role]);
  requireValue(Array.isArray(m.inputs) && m.inputs.length > 0, 'Declare varied inputs');
  const inputs = names(
    m.inputs.map((i) => i.id),
    'input identity',
  );
  for (const i of m.inputs) {
    requireValue(
      named(i.unit) && named(i.provenance) && [i.min, i.max].every(Number.isFinite) && i.min <= i.max,
      'Invalid unit, source or bounds for ' + i.id,
    );
    requireValue(
      keys(i.access, ['simulator', 'controller', 'scorer']),
      'Declare all input observers for ' + i.id,
    );
    for (const access of Object.values(i.access)) {
      requireValue(
        object(access) && ['initial', 'observed', 'hidden'].includes(access.when) && named(access.basis),
        'Declare observation timing and source for ' + i.id,
      );
    }
  }
  requireValue(
    Array.isArray(m.attempts) &&
      m.attempts.length > 0 &&
      natural(m.requiredPasses) &&
      m.requiredPasses <= m.attempts.length,
    'Invalid attempt threshold',
  );
  const ids = names(
    m.attempts.map((a) => a.id),
    'attempt ID',
  );
  const tuning = names(m.tuningIds, 'tuning ID');
  requireValue(
    tuning.every((id) => !ids.includes(id)),
    'Tuning case is in the evaluation roster',
  );
  const variants = new Set(),
    starts = new Set();
  for (const a of m.attempts) {
    requireValue(
      keys(a.values, inputs) &&
        m.inputs.every(
          (i) => Number.isFinite(a.values[i.id]) && a.values[i.id] >= i.min && a.values[i.id] <= i.max,
        ),
      'Missing or out-of-range start for ' + a.id,
    );
    const variant = JSON.stringify(inputs.map((id) => a.values[id]));
    requireValue(
      m.basis === 'measured' || !variants.has(variant),
      'Repeated deterministic evaluation inputs; declare any independently varied seed',
    );
    variants.add(variant);
    await read(a.initial);
    requireValue(!starts.has(a.initial.sha256), 'Repeated initial state in evaluation roster');
    starts.add(a.initial.sha256);
  }
  names(m.stages, 'stage');
  names(m.itemChecks, 'item check');
  names(m.missionChecks, 'mission check');
  requireValue(
    m.stages.length &&
      (m.itemChecks.length || m.missionChecks.length) &&
      natural(m.requiredItems) &&
      time(m.deadlineS),
    'Missing mission criteria',
  );
}

function passedChecks(observed, required) {
  return keys(observed, required) && required.every((id) => observed[id] === true);
}
function terminal(m, decision, atS) {
  requireValue(object(decision), 'Missing project scorer verdict');
  if (decision.verdict === 'mission-failure') {
    requireValue(
      named(decision.firstFailedCheck) && time(decision.failureTimeS) && decision.failureTimeS <= atS,
      'Missing first failure evidence',
    );
    return {
      status: 'mission-failure',
      firstFailedCheck: decision.firstFailedCheck,
      failureTimeS: decision.failureTimeS,
    };
  }
  requireValue(
    decision.verdict === 'pass' && passedChecks(decision.checks, m.missionChecks),
    'Unsupported mission verdict or missing mission check',
  );
  requireValue(
    Array.isArray(decision.items) && decision.items.length >= m.requiredItems,
    'Insufficient credited item observations',
  );
  names(
    decision.items.map((i) => i.id),
    'credited item',
  );
  const timestamps = decision.items.map((i) => i.timeS);
  requireValue(
    decision.items.every((i) => time(i.timeS) && i.timeS <= atS && passedChecks(i.checks, m.itemChecks)),
    'Missing item timing or required checks',
  );
  const completion = [...timestamps].sort((a, b) => a - b)[m.requiredItems - 1];
  requireValue(
    completion <= m.deadlineS &&
      time(decision.completionS) &&
      decision.completionS >= completion &&
      decision.completionS <= atS &&
      decision.completionS <= m.deadlineS,
    'Completion misses the deadline or conflicts with its evidence',
  );
  return { status: 'pass', completionS: decision.completionS, items: decision.items.map((i) => i.id) };
}

async function assessRun(m, manifestSha, a, ref, read) {
  const run = await read(ref, true);
  requireValue(
    run?.schema === 'agent-frc/mission-attempt@1' &&
      run.attemptId === a.id &&
      named(run.runId) &&
      run.manifestSha256 === manifestSha,
    'Receipt belongs to another attempt or freeze',
  );
  const pins = Object.fromEntries(roles.map((role) => [role, m.revisions[role].sha256]));
  requireValue(
    identicalMap(run.revisions, pins) &&
      run.initialSha256 === a.initial.sha256 &&
      identicalMap(run.values, a.values),
    'Different revision or initial condition',
  );
  const visible = Object.fromEntries(
    m.inputs.filter((i) => i.access.controller.when === 'initial').map((i) => [i.id, a.values[i.id]]),
  );
  requireValue(
    identicalMap(run.controllerInitialInputs, visible),
    'Starting variation exposed or withheld contrary to the controller policy',
  );
  if (run.status === 'infrastructure-failure') {
    requireValue(
      named(run.reason) && run.source,
      'Infrastructure failure requires an incident and its source',
    );
    await read(run.source);
    return { status: run.status, runId: run.runId, reason: run.reason, sources: [] };
  }
  requireValue(
    run.status === 'finished' &&
      Array.isArray(run.chain) &&
      run.chain.length > 0 &&
      run.chain.length <= m.stages.length,
    'Incomplete attempt trace chain',
  );
  let parent = a.initial.sha256,
    state = a.initial.sha256,
    previous = 0,
    last;
  const sources = [];
  for (const [i, link] of run.chain.entries()) {
    const stage = await read(link, true);
    requireValue(
      stage?.schema === 'agent-frc/mission-stage@1' &&
        stage.attemptId === a.id &&
        stage.runId === run.runId &&
        stage.stage === m.stages[i] &&
        stage.parentSha256 === parent,
      'Trace stage, ownership or predecessor differs',
    );
    requireValue(stage.inputStateSha256 === state, 'Stage consumed a different achieved state');
    requireValue(time(stage.timeS) && stage.timeS >= previous, 'Nonmonotonic attempt clock');
    requireValue(i === run.chain.length - 1 || stage.decision === undefined, 'Premature terminal verdict');
    await read(stage.source);
    await read(stage.outputState);
    requireValue(!sources.includes(stage.source.sha256), 'A raw trace is reused for different stages');
    sources.push(stage.source.sha256);
    previous = stage.timeS;
    parent = link.sha256;
    state = stage.outputState.sha256;
    last = stage;
  }
  requireValue(
    last.decision?.verdict === 'mission-failure' || run.chain.length === m.stages.length,
    'Missing required stages',
  );
  return { ...terminal(m, last.decision, last.timeS), runId: run.runId, sources };
}

export async function reviewCohort(manifestFile, journalFile, independentSha) {
  const bytes = readViewerBytes(manifestFile);
  requireValue(
    digest(independentSha) && hash(bytes) === independentSha,
    'Manifest differs from independently retained pre-run digest',
  );
  const m = parse(bytes),
    read = reader(path.dirname(path.resolve(manifestFile)));
  await freeze(m, read);
  const journal = parse(readViewerBytes(journalFile));
  requireValue(
    journal?.schema === 'agent-frc/mission-journal@1' &&
      journal.manifestSha256 === independentSha &&
      Array.isArray(journal.entries),
    'Journal is not bound to the cohort',
  );
  const byId = new Map(m.attempts.map((a) => [a.id, []]));
  for (const entry of journal.entries) {
    requireValue(
      object(entry) && byId.has(entry.attemptId),
      'Journal contains a tuning or unregistered attempt',
    );
    byId.get(entry.attemptId).push(entry.receipt);
  }
  const rows = [],
    ownership = new Map(),
    executionOwners = new Map();
  for (const a of m.attempts) {
    const row = { id: a.id, status: 'missing', attempts: [], replayedReceipts: 0, issues: [] };
    const seen = new Set(),
      runs = new Set();
    for (const ref of byId.get(a.id)) {
      try {
        if (seen.has(ref?.sha256)) {
          await read(ref, true);
          row.replayedReceipts++;
          continue;
        }
        requireValue(
          ['missing', 'infrastructure-failure'].includes(row.status),
          'A final or unresolved result cannot be replaced',
        );
        const result = await assessRun(m, independentSha, a, ref, read);
        requireValue(!runs.has(result.runId), 'Retry reused its execution ID');
        runs.add(result.runId);
        seen.add(ref.sha256);
        const executed = executionOwners.get(result.runId) ?? new Set();
        executed.add(a.id);
        executionOwners.set(result.runId, executed);
        row.attempts.push({ receiptSha256: ref.sha256, ...result });
        row.status = result.status;
        for (const value of result.sources) {
          const owners = ownership.get(value) ?? new Set();
          owners.add(a.id);
          ownership.set(value, owners);
        }
      } catch (e) {
        row.issues.push(e.message);
        if (row.status !== 'mission-failure') row.status = 'unsupported';
      }
    }
    rows.push(row);
  }
  const reused = new Set([...ownership.values()].filter((ids) => ids.size > 1).flatMap((ids) => [...ids]));
  for (const row of rows)
    if (reused.has(row.id)) {
      row.issues.push('A raw execution trace is shared with another evaluation attempt');
      row.status = 'unsupported';
    }
  const duplicatedRuns = new Set(
    [...executionOwners.values()].filter((ids) => ids.size > 1).flatMap((ids) => [...ids]),
  );
  for (const row of rows)
    if (duplicatedRuns.has(row.id)) {
      row.issues.push('Execution ID attributed to multiple evaluation attempts');
      row.status = 'unsupported';
    }
  const counts = Object.fromEntries(
    ['pass', 'mission-failure', 'missing', 'infrastructure-failure', 'unsupported'].map((key) => [
      key,
      rows.filter((r) => r.status === key).length,
    ]),
  );
  const unresolved = counts.missing + counts['infrastructure-failure'] + counts.unsupported;
  const verdict =
    counts.pass >= m.requiredPasses
      ? 'met'
      : counts.pass + unresolved < m.requiredPasses
        ? 'missed'
        : 'open';
  return {
    schema: 'agent-frc/mission-cohort-review@1',
    id: m.id,
    basis: m.basis,
    manifestSha256: independentSha,
    denominator: rows.length,
    requiredPasses: m.requiredPasses,
    counts,
    verdict,
    attempts: rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    requireValue(
      args.length === 4 && args[2] === '--manifest-sha256',
      'Usage: mission-cohort.mjs manifest.json journal.json --manifest-sha256 HEX',
    );
    const result = await reviewCohort(args[0], args[1], args[3]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.verdict === 'met' ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
}
