import { assessContactConvergence } from './contact-convergence.mjs';

function requireValue(condition, issue) {
  if (!condition) throw Error(issue);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function label(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

function array(value, limit, name, min = 1) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= limit,
    name + ' must contain ' + min + ' to ' + limit + ' entries');
  return value;
}

function indexBy(rows, key, limit, name) {
  const index = new Map();
  for (const row of array(rows, limit, name, 0)) {
    requireValue(record(row) && label(row[key]) && !index.has(row[key]), name + ' contains an invalid or duplicate ' + key);
    index.set(row[key], row);
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
  requireValue(times.every(Number.isFinite) && times[0] >= 0 && times[1] <= horizon && times[0] < times[1],
    'controller window outside declared numerical horizon');
  const units = new Map();
  for (const { id, units: unit } of array(channels, 64, 'channels')) {
    requireValue(label(id) && label(unit) && !units.has(id), 'invalid channel inventory or units');
    units.set(id, unit);
  }
  const held = indexBy(entry, 'channel', 64, 'entry');
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

export function assessRefinementEvidence({ manifest, receipt, request, evidence }, digests, independentDigest) {
  const numerical = assessContactConvergence(manifest, receipt);
  const result = { schema: 'agent-frc/refinement-result@1', exitCode: 2,
    engineeringAcceptance: 'blocked', numerical, studies: [], issues: [] };
  if (numerical.status === 'invalid') return result;
  try {
    requireValue(evidence?.schema === 'agent-frc/refinement-evidence@1', 'invalid evidence schema');
    requireValue(request?.schema === 'agent-frc/refinement-request@1', 'invalid request schema');
    requireValue(digests.request === independentDigest, 'request differs from independently retained digest');
    for (const name of ['manifest', 'receipt', 'request']) {
      requireValue(evidence[name + 'Sha256'] === digests[name], 'evidence is not bound to supplied ' + name + ' bytes');
    }
    const requests = indexBy(request.studies, 'id', 32, 'requested studies');
    const observations = indexBy(evidence.runs, 'id', 1024, 'observed runs');
    const studyIds = new Set(manifest.studies.map(study => study.id));
    const runIds = new Set(manifest.studies.flatMap(study => study.levels.map(level => level.runId)));
    for (const id of requests.keys()) if (!studyIds.has(id)) result.issues.push('unexpected requested study: ' + id);
    for (const id of observations.keys()) if (!runIds.has(id)) result.issues.push('unexpected run: ' + id);
    for (const study of manifest.studies) {
      const schedule = schedulesFor(study, requests.get(study.id), observations, manifest.windowEndSeconds);
      result.studies.push({ id: study.id, schedule, coverage: { status: 'unassessed' } });
    }
  } catch (error) {
    result.issues.push(error.message);
  }
  return result;
}
