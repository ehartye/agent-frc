import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const named = value => typeof value === 'string' && value.trim().length > 0;
const finite = Number.isFinite;
function requireInput(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, label) {
  requireInput(values.every(named) && new Set(values).size === values.length, 'Invalid or duplicate ' + label);
}

function interval(value, label) {
  requireInput(finite(value?.fromS) && finite(value.toS) && value.fromS <= value.toS, 'Invalid ' + label);
}

// Compare decimal clock labels without subtracting large binary timestamps or admitting an epoch-sized tolerance.
function decimalParts(value) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const coefficient = (whole + fraction).replace(/^(-?)0+/, '$1');
  const digits = coefficient.replace(/0+$/, '');
  if (digits === '' || digits === '-') return {digits:'0',power:0};
  return {digits,power:Number(exponent) - fraction.length + coefficient.length - digits.length};
}

function withinPeriod(row, period) {
  const parts = [row.fromS, row.toS, period].map(decimalParts);
  const power = Math.min(...parts.map(p => p.power));
  const [start, end, limit] = parts.map(p => BigInt(p.digits) * 10n ** BigInt(p.power - power));
  return end - start <= limit;
}

function checkClockLabels(values, labels, keys) {
  for (const key of keys) {
    const value = values?.[key], label = labels?.[key];
    if (typeof value !== 'number' || typeof label !== 'string') continue;
    const original = decimalParts(label), rounded = decimalParts(value);
    requireInput(finite(value) && original.digits === rounded.digits && original.power === rounded.power,
      'Clock precision lost in ' + key + ' at ' + label + '. Use seconds from a local time origin.');
  }
}

function parseDocument(bytes) {
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  const doc = JSON.parse(text);
  // Older Node versions do not expose number lexemes to JSON.parse's reviver. Consume quoted
  // strings as entire tokens so escaped quotes, property names and embedded examples stay intact.
  let hasAlternateLabels = false;
  const raw = text.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
    if (token[0] === '"' || String(Number(token)) === token) return token;
    hasAlternateLabels = true;
    return '"' + token + '"';
  });
  if (!hasAlternateLabels) return doc;
  const labels = JSON.parse(raw);
  if (doc?.schema === 'frc-power-comparison/v1') {
    checkClockLabels(doc, labels, ['maxSampleIntervalS']);
    checkClockLabels(doc.window, labels.window, ['fromS','toS']);
  } else if (doc?.schema === 'frc-power-trace/v1' && Array.isArray(doc.rows)) {
    for (const [i, row] of doc.rows.entries()) {
      checkClockLabels(row, labels.rows[i], ['fromS','toS']);
      if (Array.isArray(row?.voltages)) row.voltages.forEach((v,j) =>
        checkClockLabels(v, labels.rows[i].voltages[j], ['atS']));
    }
  }
  return doc;
}

function validateComparison(c) {
  requireInput(c?.schema === 'frc-power-comparison/v1', 'Expected frc-power-comparison/v1');
  for (const key of ['actionId', 'busId', 'clockId']) requireInput(named(c[key]), 'Missing ' + key);
  interval(c.window, 'action window');
  requireInput(finite(c.maxSampleIntervalS) && c.maxSampleIntervalS > 0, 'Expected positive maximum sample interval');
  requireInput(Array.isArray(c.requiredLoads), 'Expected requiredLoads');
  unique(c.requiredLoads, 'load identity');
  requireInput(Array.isArray(c.locations) && c.locations.length, 'Declare voltage locations');
  unique(c.locations.map(v => v?.id), 'voltage location');
  for (const location of c.locations) {
    requireInput(!Object.hasOwn(location, 'maxV'),
      'Location ' + location.id + ' declares maxV. This format checks minimum voltage only. Review the device ceiling separately.');
    requireInput(location.minV == null || finite(location.minV), 'Invalid minimum voltage');
  }
  requireInput(Array.isArray(c.trials) && c.trials.length === 2, 'Compare exactly two trials');
  unique(c.trials.map(t => t?.id), 'trial identity');
  for (const trial of c.trials) {
    requireInput(named(trial.condition) && named(trial.trace?.file) && !path.win32.parse(trial.trace.file).root,
      'A source condition and relative trace file are required');
    requireInput(/^[a-f0-9]{64}$/.test(trial.trace.sha256), 'A trace SHA-256 is required');
  }
  if (c.fallback !== undefined) {
    requireInput(named(c.fallback?.description) && (c.fallback.trialId === undefined || named(c.fallback.trialId)),
      'Invalid fallback');
  }
}

// Duration rows use [fromS, toS). Equal endpoints represent a single instant.
function contains(range, t) {
  return range.fromS === range.toS ? t === range.fromS : t >= range.fromS && t < range.toS;
}

function overlap(a, b) {
  if (a.fromS === a.toS) return contains(b, a.fromS) ? a : null;
  if (b.fromS === b.toS) return contains(a, b.fromS) ? b : null;
  const fromS = Math.max(a.fromS, b.fromS), toS = Math.min(a.toS, b.toS);
  return fromS < toS ? {fromS, toS} : null;
}

function validateTrace(c, trial, trace) {
  requireInput(trace?.schema === 'frc-power-trace/v1', 'Expected frc-power-trace/v1');
  for (const key of ['actionId', 'busId', 'clockId']) requireInput(trace[key] === c[key], 'Incompatible ' + key);
  requireInput(trace.trialId === trial.id && trace.condition === trial.condition, 'Incompatible trial or condition');
  requireInput(trace.units?.time === 's' && trace.units.voltage === 'V' && trace.units.current === 'A', 'Incompatible units');
  requireInput(['modeled','measured'].includes(trace.provenance?.kind) && named(trace.provenance.source), 'Missing provenance');
  if (trace.outcome !== undefined) {
    requireInput(named(trace.outcome?.description) && ['observed-success','observed-failure','unknown'].includes(trace.outcome.status),
      'Invalid functional outcome');
  }
  requireInput(Array.isArray(trace.rows), 'Expected trace rows');
  const locations = new Set(c.locations.map(v => v.id));
  let previous;
  for (const row of trace.rows) {
    interval(row, 'sample interval');
    requireInput(!previous || (row.fromS >= previous.toS && row.fromS > previous.fromS), 'Overlapping or unordered rows');
    requireInput(row.fresh === undefined || typeof row.fresh === 'boolean', 'Invalid freshness flag');
    requireInput(Array.isArray(row.voltages) && Array.isArray(row.currents), 'Expected voltage and current channels');
    unique(row.voltages.map(v => v?.location), 'voltage channel');
    for (const v of row.voltages) {
      requireInput(locations.has(v.location) && ['point','minimum','lower-bound'].includes(v.kind) && finite(v.valueV),
        'Invalid voltage location, evidence kind or value');
      if (v.atS !== undefined || v.kind === 'point') {
        requireInput(v.kind !== 'lower-bound' && finite(v.atS) && contains(row, v.atS), 'Invalid witness time');
      }
    }
    const channels = new Set();
    for (const current of row.currents) {
      requireInput(named(current?.id) && ['source','phase','bus-total'].includes(current.kind) && finite(current.valueA),
        'Invalid current channel');
      requireInput(current.kind !== 'bus-total' || current.id === c.busId, 'Total current location differs from busId');
      const channel = JSON.stringify([current.kind, current.id]);
      requireInput(!channels.has(channel), 'Duplicate current channel');
      channels.add(channel);
    }
    previous = row;
  }
}

// Coverage advances only with evidence for this particular requirement.
function coverage(window) {
  let through = window.fromS, instant = false;
  return {
    add(part) {
      if (window.fromS === window.toS) instant = true;
      else if (part.fromS <= through) through = Math.max(through, part.toS);
    },
    complete() { return window.fromS === window.toS ? instant : through >= window.toS; }
  };
}

function lowerMargin(previous, value) {
  if (!previous || value.marginV < previous.marginV) return value;
  return previous;
}

function assess(c, trial, trace) {
  validateTrace(c, trial, trace);
  const coverageByLoad = new Map(c.requiredLoads.map(id => [id, coverage(c.window)]));
  const locations = new Map(c.locations.map(({id, minV}) => [id, {
    id, minV:minV ?? null, coverage:coverage(c.window), lowestEvidence:null, violation:null
  }]));
  const unknowns = new Set();
  const instant = c.window.fromS === c.window.toS;
  let limiting = null, violation = null;
  for (const row of trace.rows) {
    const part = overlap(row, c.window);
    if (!part) continue;
    if (row.fresh === false) {
      unknowns.add('Stale sample within the action window');
      continue;
    }
    const resolved = withinPeriod(row, c.maxSampleIntervalS);
    if (!resolved && (!instant || coverageByLoad.size)) unknowns.add('Sample exceeds maximum interval');
    for (const [id, evidence] of coverageByLoad) {
      if (row.currents.some(v => v.id === id && v.kind === 'source')) {
        if (resolved) evidence.add(part);
      } else if (row.currents.some(v => v.id === id && v.kind === 'phase')) {
        unknowns.add('Only phase current available for ' + id);
      }
    }
    for (const v of row.voltages) {
      const endpoint = locations.get(v.location);
      const witnessed = v.atS !== undefined && contains(c.window, v.atS);
      const entireRow = row.fromS === part.fromS && row.toS === part.toS;
      if (v.kind === 'point' && !witnessed) continue;
      // On a clipped interval an unlocalized attained minimum only bounds the voltage.
      const kind = v.kind === 'minimum' && !witnessed && !entireRow ? 'lower-bound' : v.kind;
      const sample = {location:v.location, fromS:part.fromS, toS:part.toS, kind, valueV:v.valueV,
        minV:endpoint.minV, marginV:endpoint.minV === null ? null : v.valueV - endpoint.minV,
        currents:row.currents};
      requireInput(sample.marginV === null || finite(sample.marginV), 'Voltage margin must be finite at ' + v.location);
      if (witnessed) sample.atS = v.atS;
      if (!endpoint.lowestEvidence || v.valueV < endpoint.lowestEvidence.valueV) endpoint.lowestEvidence = sample;
      if (endpoint.minV === null) continue;
      limiting = lowerMargin(limiting, sample);
      if (sample.marginV < 0) {
        if (kind === 'lower-bound') {
          unknowns.add('Lower bound alone cannot establish a violation at ' + v.location);
        } else {
          endpoint.violation = lowerMargin(endpoint.violation, sample);
          violation = lowerMargin(violation, sample);
        }
      }
      if ((instant && witnessed) || (resolved && (kind === 'minimum' ||
          (kind === 'lower-bound' && sample.marginV >= 0) || (kind === 'point' && instant)))) {
        endpoint.coverage.add(part);
      } else if (!resolved) {
        unknowns.add('Sample exceeds maximum interval');
      }
    }
  }

  for (const [id, evidence] of coverageByLoad) {
    if (!evidence.complete()) unknowns.add('Missing coincident source-current coverage for ' + id);
  }
  const endpoints = [];
  for (const endpoint of locations.values()) {
    if (endpoint.minV === null) unknowns.add('No project voltage floor for ' + endpoint.id);
    if (!endpoint.coverage.complete() && endpoint.minV !== null) {
      unknowns.add('Missing qualifying voltage coverage at ' + endpoint.id);
    }
    endpoints.push({id:endpoint.id,minV:endpoint.minV,lowestEvidence:endpoint.lowestEvidence,
      status:endpoint.violation ? 'violated' : endpoint.coverage.complete() ? 'complete' : 'incomplete',
      violation:endpoint.violation});
  }
  const status = violation ? 'violated' : unknowns.size ? 'incomplete' : 'complete';
  return {id:trial.id,condition:trial.condition,status,provenance:trace.provenance,trace:trial.trace,
    endpoints,limiting:violation ?? limiting,unknowns:[...unknowns],
    outcome:trace.outcome ?? {status:'unknown',description:'No functional outcome supplied'}};
}

function interpret(trial) {
  const v = trial.limiting;
  const lines = [trial.condition + ' (' + trial.provenance.kind + ' electrical evidence) is ' + trial.status + ' for the minimum-voltage check.'];
  if (v) {
    const when = v.atS === undefined ? v.fromS + '–' + v.toS + ' s' : v.atS + ' s';
    lines.push('At ' + v.location + ' (' + when + '), the ' + v.kind + ' is ' + v.valueV +
      ' V against a ' + v.minV + ' V floor.');
    if (v.currents.length) {
      const kinds = {source:'source current',phase:'phase current','bus-total':'bus total current'};
      const readings = v.currents.map(c => c.id + ' ' + kinds[c.kind] + ' ' + c.valueA + ' A');
      lines.push('Coincident readings were ' + readings.join(', ') + '.');
    } else lines.push('The limiting row supplies no current readings.');
  }
  for (const endpoint of trial.endpoints) {
    const sample = endpoint.lowestEvidence;
    if (!sample) lines.push(endpoint.id + ' has no voltage observation in the action window.');
    else if (endpoint.minV === null) lines.push(endpoint.id + ' has a ' + sample.kind + ' of ' + sample.valueV +
      ' V with no floor supplied. Its margin is unknown.');
  }
  lines.push('The ' + trial.provenance.kind + ' outcome (' + trial.outcome.status + ') for the action — ' +
    trial.outcome.description + '.');
  if (trial.unknowns.length) lines.push(trial.unknowns.join('. ') + '.');
  return lines.join(' ');
}

export async function reviewPower(file) {
  const c = parseDocument(await readFile(file));
  validateComparison(c);
  const trials = [];
  for (const trial of c.trials) {
    const bytes = await readFile(path.resolve(path.dirname(file), trial.trace.file));
    requireInput(createHash('sha256').update(bytes).digest('hex') === trial.trace.sha256,
      'SHA-256 mismatch for ' + trial.trace.file);
    trials.push(assess(c, trial, parseDocument(bytes)));
  }
  const report = {schema:'frc-power-review/v1',voltageAssessment:'minimum-only',actionId:c.actionId,busId:c.busId,clockId:c.clockId,
    window:c.window,requiredLoads:c.requiredLoads,maxSampleIntervalS:c.maxSampleIntervalS,
    trials,interpretation:trials.map(interpret).join(' ')};
  if (c.fallback) {
    const match = trials.find(t => t.id === c.fallback.trialId);
    report.fallback = {...c.fallback,status:match?.status === 'complete' && match.outcome.status === 'observed-success'
      ? 'supported' : 'unverified'};
    const basis = match ? ' in trial ' + match.id + ' (' + match.provenance.kind + ')' : ' with no matching trial';
    report.interpretation += ' Fallback “' + c.fallback.description + '” is ' + report.fallback.status + basis + '.';
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    requireInput(process.argv.length === 3, 'Usage: node scripts/power-review.mjs comparison.json');
    console.log(JSON.stringify(await reviewPower(process.argv[2]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
