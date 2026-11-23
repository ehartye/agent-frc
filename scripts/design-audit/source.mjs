/**
 * What a design source says about its escape hatches and its judgement data: the custom registry and what uses it,
 * physical inputs without a stated source, trials without a control or brackets, typed numbers that restate a
 * parameter, and the share of solids that are custom. Reads the JSON only; the library is not needed.
 */
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

export const designSchema = 'frc-design-kernel/design@1';

/** The physical inputs that must state a source, as the library's schemas mark them ("sourced"). */
const sourced = {
  pieces: ['massKg', 'inertiaKgM2'],
  materials: ['stiffnessNPerM', 'restitution', 'dampingRatio', 'friction'],
  motors: ['ktNmPerA', 'ohm', 'keVsPerRad'],
  drives: ['efficiency', 'movingKg', 'inertiaKgM2', 'dragNm'],
};
const sourcedFlap = ['inertiaKgM2', 'preloadNm', 'springNmPerRad', 'dampingNmSPerRad', 'stopRestitution'];

/** A finder for the line of a JSON entry: each needle is searched for after the one before it. */
export function lineFinder(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (...needles) => {
    let at = 0;
    for (const needle of needles) { const found = text.indexOf(needle, at); if (found < 0) break; at = found; }
    let low = 0, high = starts.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= at) low = mid; else high = mid - 1; }
    return low + 1;
  };
}
const key = name => JSON.stringify(name) + ':';
const quoted = name => JSON.stringify(name);

/** Every custom name a shape entry uses, inside unions, differences and intersections too. */
export function customUses(shape) {
  if (!shape || typeof shape !== 'object') return [];
  if (shape.kind === 'custom') return typeof shape.use === 'string' ? [shape.use] : [];
  return [...(shape.of ?? []), ...(shape.from ? [shape.from] : []), ...(shape.cut ?? [])].flatMap(customUses);
}
const rows = entry => Array.isArray(entry?.each) && entry.each.length ? entry.each.length : 1;

/** The trials of a source, each read from the source or from the file it names. */
export function trialsOf(source) {
  const trials = {};
  for (const [name, entry] of Object.entries(source.json.trials ?? {})) {
    if (entry && Object.keys(entry).length === 1 && typeof entry.file === 'string') {
      const file = path.posix.join(path.posix.dirname(source.file), entry.file), full = path.join(source.root, file);
      if (!existsSync(full)) { trials[name] = {missing: file}; continue; }
      const text = readFileSync(full, 'utf8');
      try { trials[name] = {file, text, definition: JSON.parse(text)}; } catch { trials[name] = {missing: file + ' (not readable JSON)'}; }
    } else trials[name] = {file: source.file, text: source.text, definition: entry, inline: true};
  }
  return trials;
}

/** A value with no stated source: a plain number or expression, or an object with neither measured nor assumed. */
const unsourced = value => typeof value === 'number' || typeof value === 'string' ||
  (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value && !value.measured && !Array.isArray(value.assumed));
const hasRange = value => value && typeof value === 'object' && Array.isArray(value.assumed);

/** Parameter values worked out from the source, where its arithmetic is plain: {name: number}. */
export function parameterValues(parameters = {}) {
  const known = {}, functions = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'radians', 'degrees']);
  const math = {radians: x => x * Math.PI / 180, degrees: x => x * 180 / Math.PI};
  for (const [name, value] of Object.entries(parameters)) {
    if (typeof value === 'number') { known[name] = value; continue; }
    if (typeof value !== 'string' || !value.startsWith('=')) continue;
    const tokens = value.slice(1).match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[A-Za-z_]\w*|\*\*|[-+*/(),]|\S/gi) ?? [];
    if (!tokens.every(token => /^[\d.]/.test(token) || /^(?:\*\*|[-+*/(),])$/.test(token) || token === 'pi' || functions.has(token) || token in known)) continue;
    const expression = tokens.map(token => token === 'pi' ? 'Math.PI' : functions.has(token) ? (math[token] ? 'm.' + token : 'Math.' + token) : token in known ? 'k[' + JSON.stringify(token) + ']' : token).join(' ');
    try { const result = Function('k', 'm', '"use strict"; return (' + expression + ');')(known, math); if (Number.isFinite(result)) known[name] = result; } catch { /* left out */ }
  }
  return known;
}

/** Plain numbers under a millimetre key in a trial: [{path, value}]. */
function typedLengths(value, at = '') {
  if (Array.isArray(value)) return value.flatMap((item, i) => typedLengths(item, at + '[' + i + ']'));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, item]) => /Mm$/.test(name)
    ? numbers(item).map(number => ({path: at + '.' + name, value: number}))
    : typedLengths(item, at + '.' + name));
}
const numbers = item => typeof item === 'number' ? [item] : Array.isArray(item) ? item.flatMap(numbers) : item && typeof item === 'object' ? Object.values(item).flatMap(numbers) : [];

/** The engine words a trial must not carry: settings that belong to an engine, not physical inputs. */
const engineWord = /^(?:solref|solimp|condim|margin|gap|kp|kv|erp|cfm|timeconst|dampratio|iterations|noslip\w*|integrator|substeps|solver|contactStiffness\w*|penalty\w*|cor)$/i;
function engineKeys(value, at = '') {
  if (Array.isArray(value)) return value.flatMap((item, i) => engineKeys(item, at + '[' + i + ']'));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, item]) => engineWord.test(name) ? [at + '.' + name] : engineKeys(item, at + '.' + name));
}

/** The inputs a trial draws on that carry an assumed range: its piece, the materials it names, its drives and flaps. */
function assumedInputs(design, trial) {
  const found = [], look = (section, name) => { for (const [field, value] of Object.entries(design[section]?.[name] ?? {})) if (hasRange(value)) found.push(section + '.' + name + '.' + field); };
  if (trial.piece?.use) look('pieces', trial.piece.use);
  for (const surface of [...(trial.surfaces ?? []), ...(trial.flaps ?? [])]) if (surface.material) look('materials', surface.material);
  for (const name of [...(trial.surfaces ?? []).map(surface => surface.drive), ...Object.keys(trial.commands ?? {})].filter(Boolean)) {
    look('drives', name);
    if (design.drives?.[name]?.motor) look('motors', design.drives[name].motor);
  }
  for (const flap of trial.flaps ?? []) for (const field of sourcedFlap) if (hasRange(flap[field])) found.push('flap ' + flap.name + '.' + field);
  return found;
}

/**
 * The findings and information of one design source. source is {root, file, text, json}. Returns
 * {findings, info, registry: {name: {kind, reason, limits, usedBy}}, solids, customSolids, trials}.
 */
export function sourceFindings(source, guidelines) {
  const findings = [], info = [], design = source.json, line = lineFinder(source.text);
  const add = (form, at, detail, file = source.file) => findings.push({form, file, line: at, detail});
  // The custom registry and what uses it.
  const registry = {};
  for (const [name, entry] of Object.entries(design.custom ?? {})) {
    registry[name] = {kind: entry?.kind ?? 'shape', reason: entry?.reason, limits: entry?.limits, usedBy: []};
    for (const field of ['reason', 'limits']) {
      const text = typeof entry?.[field] === 'string' ? entry[field].trim() : '';
      if (!text) add('custom-no-reason', line(key('custom'), key(name)), 'custom "' + name + '" has no ' + field);
      else if (text.length < 20 || /^(?:tbd|todo|n\/?a|none|needed|required|custom|see code|-+|\.+)$/i.test(text))
        add('custom-no-reason', line(key('custom'), key(name), key(field)), 'custom "' + name + '" gives ' + field + ' "' + text + '", which says nothing: say ' + (field === 'reason' ? 'why no listed shape or law can do it' : 'what it leaves out and how far it may be off'));
    }
  }
  let solids = 0, customSolids = 0;
  for (const section of ['solids', 'fixtures']) for (const solid of design[section] ?? []) {
    const uses = customUses(solid.shape), count = rows(solid);
    if (section === 'solids') { solids += count; if (uses.length) customSolids += count; }
    for (const use of uses) registry[use]?.usedBy.push(solid.name);
  }
  const trials = trialsOf(source);
  for (const [name, trial] of Object.entries(trials)) {
    if (trial.missing) { info.push({file: source.file, line: line(key('trials'), key(name)), text: 'trial "' + name + '" names ' + trial.missing + ', which is not there: the audit could not read it'}); continue; }
    const t = trial.definition;
    for (const use of [...(t.forces ?? []), ...(t.pass?.custom ? [t.pass.custom] : [])]) registry[use?.use]?.usedBy.push('trial ' + name);
  }
  for (const [name, entry] of Object.entries(registry)) if (!entry.usedBy.length) add('custom-unused', line(key('custom'), key(name)), 'custom "' + name + '" is registered but nothing uses it: remove it');

  // Physical inputs with no stated source.
  for (const [section, fields] of Object.entries(sourced)) for (const [name, entry] of Object.entries(design[section] ?? {})) for (const field of fields)
    if (entry && field in entry && unsourced(entry[field])) add('input-no-source', line(key(section), key(name), key(field)), section + '.' + name + '.' + field + ' states no source: write {"value": v, "assumed": [low, high]} or {"value": v, "measured": "where"}');
  for (const section of ['solids', 'fixtures']) for (const solid of design[section] ?? []) if (solid.material && 'stiffnessNPerM' in solid.material && unsourced(solid.material.stiffnessNPerM))
    add('input-no-source', line(quoted(solid.name), key('stiffnessNPerM')), 'the material of "' + solid.name + '" states its stiffness with no source');

  // Trials: method, sources, typed numbers.
  const values = parameterValues(design.parameters);
  for (const [name, trial] of Object.entries(trials)) {
    if (trial.missing) continue;
    const t = trial.definition, at = trial.inline ? (...more) => line(key('trials'), key(name), ...more) : lineFinder(trial.text), file = trial.file;
    const change = t.control?.change;
    if (!t.control || !change || typeof change === 'object' && !Object.keys(change).length) add('trial-no-control', at(), 'trial "' + name + '" has no control: nothing shows that it can fail', file);
    if (!(t.brackets ?? []).length && !(t.grid?.inputs ?? []).length && !assumedInputs(design, t).length)
      add('trial-no-brackets', at(), 'trial "' + name + '" has no brackets and draws on no input with an assumed range: nothing is varied, so no edge is found', file);
    for (const flap of t.flaps ?? []) for (const field of sourcedFlap) if (field in flap && unsourced(flap[field])) add('input-no-source', at(key('flaps'), quoted(flap.name), key(field)), 'trial "' + name + '" flap ' + flap.name + '.' + field + ' states no source', file);
    for (const where of engineKeys(t)) add('engine-setting-in-trial', at(key(where.split('.').pop().replace(/\[\d+\]$/, ''))), 'trial "' + name + '" sets ' + where.slice(1) + ', an engine setting: state the physical input (stiffness, damping, friction) in the design source instead', file);
    for (const {path: where, value} of typedLengths(t)) {
      if (Math.abs(value) < 10) continue;
      const same = Object.entries(values).find(([, number]) => Math.abs(number - value) < 1e-6);
      if (same) add('restated-dimension', at(key(where.split('.').pop())), 'trial "' + name + '" writes ' + value + ' at ' + where.slice(1) + ', the value of the parameter "' + same[0] + '": if it is that dimension, write "=' + same[0] + '"', file);
    }
    const typed = (t.surfaces ?? []).filter(surface => surface.segmentsMm || surface.circleMm).map(surface => surface.name ?? '(unnamed)');
    if (typed.length) info.push({file, line: at(key('surfaces')), text: 'trial "' + name + '" types in ' + typed.length + ' surface' + (typed.length === 1 ? '' : 's') + ' (' + typed.join(', ') + ') instead of naming solids: a 3D engine cannot run them against the design'});
  }
  // How much of the design is custom, against the plugin's guidelines.
  const share = solids ? customSolids / solids : 0;
  info.push({file: source.file, text: customSolids + ' of ' + solids + ' robot solids are custom shapes (' + Math.round(share * 100) + '%; guideline at most ' + Math.round(guidelines.customSolidShare * 100) + '%)'});
  if (share > guidelines.customSolidShare) add('custom-share', line(key('solids')), customSolids + ' of ' + solids + ' robot solids are custom shapes, past the guideline of ' + Math.round(guidelines.customSolidShare * 100) + '%: draw them from listed shapes, or check in with the owner');
  return {findings, info, registry, solids, customSolids, trials};
}

/** Screen verdict overrides in a judgement file, written as interactions.NAME.override: [{at, verdict, reason}]. */
export function overridesIn(judgement) {
  const interactions = judgement?.interactions;
  if (!interactions || typeof interactions !== 'object' || Array.isArray(interactions)) return [];
  return Object.entries(interactions).filter(([, entry]) => entry && typeof entry === 'object' && 'override' in entry)
    .map(([name, entry]) => ({at: 'interactions.' + name + '.override', verdict: entry.override?.verdict ?? null,
      reason: typeof entry.override?.reason === 'string' ? entry.override.reason.trim() : ''}));
}
