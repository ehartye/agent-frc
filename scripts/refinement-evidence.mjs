import { assessContactConvergence } from './contact-convergence.mjs';

function requireValue(condition, issue) {
  if (!condition) throw Error(issue);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function label(value, maxLength = 256) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function array(value, limit, name, min = 1) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= limit,
    name + ' must contain ' + min + ' to ' + limit + ' entries');
  return value;
}

function inventoryById(rows, limit, name, issues) {
  const index = new Map();
  if (!Array.isArray(rows) || rows.length > limit) {
    issues.push(name + ' must contain at most ' + limit + ' entries');
    return index;
  }
  for (const [position, row] of rows.entries()) {
    if (!record(row) || !label(row.id, 2000)) {
      issues.push(name + '[' + position + '] has an invalid id');
    } else if (index.has(row.id)) {
      // Reserve an ambiguous ID. A third copy must never make it usable again.
      if (index.get(row.id) !== null) issues.push(name + ' has duplicate id: ' + row.id);
      index.set(row.id, null);
    } else {
      index.set(row.id, row);
    }
  }
  return index;
}

function requirePair(value, check, name) {
  requireValue(Array.isArray(value) && value.length === 2 && value.every(check) && value[0] < value[1],
    name + ' must be an increasing interval');
}

function readSchedule(schedule, horizon) {
  requireValue(record(schedule), 'missing schedule');
  const { clock, window, channels, entry, events } = schedule;
  requireValue(record(clock) && Number.isFinite(clock.periodSeconds) && clock.periodSeconds > 0 &&
    Number.isFinite(clock.tickZeroSeconds) && label(clock.origin), 'invalid controller clock');
  requirePair(window, Number.isSafeInteger, 'tick window');
  const times = window.map(tick => clock.tickZeroSeconds + tick * clock.periodSeconds);
  // Allow rounding in the product and sum only. Cap the allowance well below one controller tick.
  const tolerance = (tick, bound) => Math.min(clock.periodSeconds * 1e-6,
    2 * Number.EPSILON * Math.max(Math.abs(clock.tickZeroSeconds), Math.abs(tick * clock.periodSeconds), Math.abs(bound)));
  requireValue(times.every(Number.isFinite) && times[0] >= -tolerance(window[0], 0) &&
    times[1] - horizon <= tolerance(window[1], horizon) && times[0] < times[1],
    'controller window outside declared numerical horizon');
  const units = new Map();
  for (const { id, units: unit } of array(channels, 64, 'channels')) {
    requireValue(label(id) && label(unit) && !units.has(id), 'invalid channel inventory or units');
    units.set(id, unit);
  }
  const held = new Map();
  for (const command of array(entry, 64, 'entry', 0)) {
    requireValue(record(command) && label(command.channel) && !held.has(command.channel),
      'entry contains an invalid or duplicate channel');
    held.set(command.channel, command);
  }
  requireValue(held.size === units.size, 'entry must supply every channel held at the start');
  const validCommand = command => record(command) && units.has(command.channel) &&
    Number.isFinite(command.target) && label(command.phase);
  for (const command of held.values()) requireValue(validCommand(command), 'invalid held entry command');
  let previous = window[0];
  for (const event of array(events, 16384, 'events', 0)) {
    requireValue(validCommand(event) && Number.isSafeInteger(event.tick) &&
      event.tick >= previous && event.tick < window[1], 'invalid or unordered event outside half-open tick window');
    previous = event.tick;
  }
  return { clock, window, units, held, events };
}

function compareSchedule(expected, observed) {
  const clock = expected.clock;
  requireValue(clock.origin === observed.clock.origin && clock.periodSeconds === observed.clock.periodSeconds &&
    clock.tickZeroSeconds === observed.clock.tickZeroSeconds, 'incompatible controller clock');
  requireValue(expected.window.every((tick, i) => tick === observed.window[i]), 'incompatible event window');
  requireValue(expected.units.size === observed.units.size, 'incompatible channel inventory');
  for (const [channel, units] of expected.units) {
    requireValue(observed.units.get(channel) === units, 'incompatible channel or units: ' + channel);
  }
  for (const channel of expected.units.keys()) {
    const first = expected.held.get(channel), second = observed.held.get(channel);
    if (first.target !== second.target || first.phase !== second.phase) {
      return { status: 'different-inputs', issue: 'entry state changed for ' + channel, expected: first, observed: second };
    }
  }
  const count = Math.max(expected.events.length, observed.events.length);
  for (let index = 0; index < count; index++) {
    const first = expected.events[index], second = observed.events[index];
    if (!first || !second || ['tick', 'channel', 'target', 'phase'].some(key => first[key] !== second[key])) {
      return { status: 'different-inputs', issue: 'events[' + index + '] differs', expected: first ?? null, observed: second ?? null };
    }
  }
  return { status: 'matched' };
}

function schedulesFor(study, requirement, runs, horizon) {
  let expected;
  try {
    expected = readSchedule(requirement?.schedule, horizon);
  } catch (error) {
    return { status: 'unknown', issue: 'request: ' + error.message, runs: [] };
  }
  const results = study.levels.map(({ runId: id }) => {
    try {
      const run = runs.get(id);
      requireValue(run, 'missing run: ' + id);
      return { id, ...compareSchedule(expected, readSchedule(run.schedule, horizon)) };
    } catch (error) {
      return { id, status: 'unknown', issue: error.message };
    }
  });
  const statuses = new Set(results.map(row => row.status));
  const status = statuses.has('unknown') ? 'unknown' : statuses.has('different-inputs') ? 'different-inputs' : 'matched';
  return { status, runs: results };
}

function validateScope(scope, observation, horizon) {
  requireValue(record(scope) && label(scope.origin) && scope.units === 's', 'invalid coverage time origin or units');
  const keys = ['kind', 'origin', 'units'];
  if (scope.kind === 'poses') {
    const ids = array(scope.poseIds, 256, 'pose inventory');
    requireValue(ids.every(id => label(id)) && new Set(ids).size === ids.length, 'invalid or duplicate pose IDs');
    keys.push('poseIds');
  } else {
    requireValue(scope.kind === 'startup' || scope.kind === 'continuation', 'unknown coverage kind');
    requirePair(scope.interval, Number.isFinite, 'trajectory interval');
    requireValue(scope.interval[0] >= 0 && scope.interval[1] <= horizon, 'trajectory interval outside numerical horizon');
    keys.push('interval');
    if (scope.kind === 'startup' && observation) {
      requireValue(scope.interval[0] === 0, 'independent startup observation must include its origin');
    }
    if (scope.kind === 'continuation') {
      requireValue(record(scope.checkpoint) && label(scope.checkpoint.id) &&
        typeof scope.checkpoint.sha256 === 'string' && /^[a-f0-9]{64}$/.test(scope.checkpoint.sha256),
        'continuation requires named checkpoint and SHA-256');
      keys.push('checkpoint');
    }
  }
  if (observation) keys.push('findings');
  requireValue(Object.keys(scope).every(key => keys.includes(key)), 'unsupported coverage field');
}

function retainObservation(scope, horizon, row) {
  validateScope(scope, true, horizon);
  const accepted = { ...scope, findings: [] };
  row.observations.push(accepted);
  for (const [index, finding] of array(scope.findings, 256, 'findings', 0).entries()) {
    try {
      requireValue(record(finding) && label(finding.outcome) && label(finding.detail), 'invalid local finding');
      if (scope.kind === 'poses') {
        requireValue(scope.poseIds.includes(finding.poseId), 'finding outside observed pose inventory');
      } else {
        requirePair(finding.interval, Number.isFinite, 'finding interval');
        requireValue(encloses(scope.interval, finding.interval), 'finding outside observed interval');
      }
      accepted.findings.push(finding);
    } catch (error) {
      row.issues.push('findings[' + index + ']: ' + error.message);
    }
  }
}

function encloses(outer, inner) {
  return outer[0] <= inner[0] && outer[1] >= inner[1];
}

function scopeGap(required, observations) {
  const scoped = observations.filter(row => row.kind === required.kind &&
    row.origin === required.origin && row.units === required.units);
  if (required.kind === 'poses') {
    const poses = new Set(scoped.flatMap(row => row.poseIds));
    const missing = required.poseIds.filter(id => !poses.has(id));
    return missing.length ? 'missing pose coverage: ' + missing.join(', ') : null;
  }
  const covered = scoped.some(row => encloses(row.interval, required.interval) &&
    (row.kind === 'startup' ||
      (row.checkpoint.id === required.checkpoint.id && row.checkpoint.sha256 === required.checkpoint.sha256)));
  return covered ? null : 'missing ' + required.kind + ' coverage at ' + required.origin +
    ' [' + required.interval.join(', ') + ']' +
    (required.checkpoint ? ' from checkpoint ' + required.checkpoint.id : '');
}

function coverageFor(study, requirement, runs, horizon) {
  const issues = [];
  const required = [];
  try {
    for (const scope of array(requirement?.coverage, 32, 'required coverage')) {
      validateScope(scope, false, horizon);
      required.push(scope);
    }
  } catch (error) {
    issues.push('request: ' + error.message);
  }
  const results = study.levels.map(({ runId: id }) => {
    const row = { id, status: 'covered', observations: [], issues: [] };
    try {
      for (const scope of array(runs.get(id)?.coverage, 64, 'observed coverage', 0)) {
        try {
          retainObservation(scope, horizon, row);
        } catch (error) {
          row.issues.push(error.message);
        }
      }
      for (const scope of required) {
        const gap = scopeGap(scope, row.observations);
        if (gap) row.issues.push(gap);
      }
    } catch (error) {
      row.issues.push(error.message);
    }
    if (row.issues.length || issues.length) row.status = 'unknown';
    return row;
  });
  return { status: results.every(row => row.status === 'covered') ? 'covered' : 'unknown', issues, runs: results };
}

export function assessRefinementEvidence({ manifest, receipt, request, evidence }, digests, independentDigest, inputIssues = []) {
  const result = { schema: 'agent-frc/refinement-result@1', exitCode: 2, binding: 'unbound',
    engineeringAcceptance: 'blocked', studies: [], issues: [...inputIssues] };
  // Retain the unmodified legacy verdict even when reading or binding a companion input fails.
  try {
    result.numerical = assessContactConvergence(manifest, receipt);
  } catch (error) {
    result.numerical = { status: 'invalid', issues: [error.message] };
  }
  const { numerical } = result;
  if (evidence?.schema !== 'agent-frc/refinement-evidence@1') result.issues.push('invalid evidence schema');
  if (request?.schema !== 'agent-frc/refinement-request@1') result.issues.push('invalid request schema');
  if (!independentDigest || digests.request !== independentDigest) result.issues.push('request differs from independently retained digest');
  for (const name of ['manifest', 'receipt', 'request']) {
    if (!digests[name] || evidence?.[name + 'Sha256'] !== digests[name]) {
      result.issues.push('evidence is not bound to supplied ' + name + ' bytes');
    }
  }
  if (!result.issues.length) result.binding = 'bound';
  try {
    // The legacy receipt can be malformed while the manifest still identifies the expected studies.
    if (numerical.status === 'invalid') {
      const manifestCheck = assessContactConvergence(manifest,
        { schema: 'agent-frc/contact-convergence-receipt@1', basis: 'synthetic', runs: [] });
      if (manifestCheck.status === 'invalid') return result;
    } else {
      for (const run of receipt.runs) {
        for (const metric of run.metrics) {
          if (metric.value === null) result.issues.push('missing required numerical value: ' + run.id + '/' + metric.id);
        }
      }
    }
    const requests = result.binding === 'bound' ? inventoryById(request.studies, 32, 'requested studies', result.issues) : new Map();
    const observations = evidence?.schema === 'agent-frc/refinement-evidence@1'
      ? inventoryById(evidence.runs, 1024, 'observed runs', result.issues) : new Map();
    const studyIds = new Set(manifest.studies.map(study => study.id));
    const runIds = new Set(manifest.studies.flatMap(study => study.levels.map(level => level.runId)));
    for (const id of requests.keys()) if (!studyIds.has(id)) result.issues.push('unexpected requested study: ' + id);
    for (const id of observations.keys()) if (!runIds.has(id)) result.issues.push('unexpected run: ' + id);
    for (const study of manifest.studies) {
      const schedule = schedulesFor(study, requests.get(study.id), observations, manifest.windowEndSeconds);
      const coverage = coverageFor(study, requests.get(study.id), observations, manifest.windowEndSeconds);
      result.studies.push({ id: study.id, schedule, coverage });
    }
    const incomplete = result.issues.length > 0 || numerical.status === 'invalid' || numerical.status === 'unknown' ||
      result.studies.some(study => study.schedule.status === 'unknown' || study.coverage.status === 'unknown');
    if (!incomplete) {
      const differs = numerical.status === 'not-converged' || result.studies.some(study => study.schedule.status === 'different-inputs');
      result.exitCode = differs ? 1 : 0;
    }
  } catch (error) {
    result.issues.push(error.message);
  }
  return result;
}
