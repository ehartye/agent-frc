#!/usr/bin/env node
/**
 * Audit how a robot project uses the design library, and above all its escape hatches. Advice for the coding agent:
 * it reports and never blocks, and it exits 0 whatever it finds.
 *
 *   node design-audit.mjs PROJECT [PROJECT...] [--skip FOLDER]... [--no-run] [--python COMMAND] [--json]
 *
 * A project holds its design as data, a design source, which the library turns into solids, measurements and trial
 * records. The audit reports, by file and line and under a form name:
 *
 *   1. going around the door: the CAD kernel called outside custom/; STEP files, manifests, measurement or trial
 *      records written by project code; the library's internals or the plugin imported;
 *   2. outputs that do not regenerate: generated files made from an earlier source, or whose content disagrees with
 *      their own stamp (the library rebuilds and states them when it can be run; "not run" says why when not);
 *   3. a hatch doing too much: a custom shape that returns several solids, places itself, reads or writes files or
 *      imports past its contract; custom trial code that tells the method's runs apart, keeps state, steers the
 *      piece or always passes; registrations with no reason or limits, or that nothing uses;
 *   4. a MuJoCo scene kept as a file, engine settings typed into a trial;
 *   5. drift back toward a builder: the share of custom solids and the size of custom/ against the plugin's
 *      guidelines (scripts/design-audit/guidelines.json), trial numbers that restate a parameter, a custom shape a
 *      listed shape could make;
 *   6. judgement data: screen overrides with their reasons, inputs with no stated source, trials with no control or
 *      no brackets;
 *   7. across projects (given several): custom code that looks alike in more than one, as library candidates.
 *
 * It also lists, as information, every motion no motor drives, with the cause it states (by hand, spring, gravity or
 * piece), from the top file and its subsystem files: the motions whose movement no motor, current or bus voltage stands behind.
 *
 * A project declares folders to skip and known exceptions in .design-audit.json at its root:
 *
 *   {"skip": ["archive/"], "exceptions": [{"path": "cad/assembly/", "form": "kernel-outside-custom", "reason": "Why."}]}
 *
 * Every run lists each exception with its reason and what it covers. An exception without a reason covers nothing.
 */
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {foreignNames, projectFiles, usesIn} from './project-ci-audit.mjs';
import {libraryCandidates} from './design-audit/across.mjs';
import {codeFindings, dedupe, sceneFileFindings} from './design-audit/code.mjs';
import {findLibrary, generatedFindings} from './design-audit/generated.mjs';
import {customFindings} from './design-audit/hatch.mjs';
import {designSchema, overridesIn, sourceFindings} from './design-audit/source.mjs';

export const exceptionsFile = '.design-audit.json';
export const guidelines = JSON.parse(readFileSync(fileURLToPath(new URL('./design-audit/guidelines.json', import.meta.url)), 'utf8'));

/** Every form, in report order, with the heading it is reported under. */
export const forms = {
  'kernel-outside-custom': 'Calls the CAD kernel outside custom/. The library builds and measures; draw the solid in the design source, or as a custom shape',
  'writes-model': 'Writes a STEP file itself. The library writes the STEP from the design source',
  'writes-library-record': 'Writes a library record itself. Only the library writes manifests, measurements, screens and trial records',
  'own-record': 'Writes its own trial or measurement record. Define the trial as data in the design source; the library measures and tries, and writes the records',
  'library-internals': 'Imports the design library\'s internals. Use its public calls (load, build, export, placements, sampled, measure, motion) or its commands',
  'plugin-code': 'Runs or imports plugin code. Project code never runs the plugin (project-ci-audit.mjs gives the full report)',
  'stale-output': 'Generated output that does not regenerate from the current source. Regenerate it with the library',
  'hand-edited-output': 'Generated output that disagrees with its own stamp. A generated file is never edited: change the source and regenerate',
  'custom-several-solids': 'A custom shape that makes several solids. It returns exactly one',
  'custom-places-itself': 'A custom shape that places itself. Placement belongs to "place" and poses',
  'custom-reads-or-writes': 'Custom code that reads or writes files, the clock or the environment',
  'custom-imports': 'Custom code that imports past its contract',
  'custom-hidden-numbers': 'Custom code that keeps its numbers. They belong in parameters',
  'custom-not-registered': 'Code in custom/ that no registration names',
  'custom-no-reason': 'A custom registration with no reason or limits, or filler',
  'custom-unused': 'A custom registration nothing uses',
  'custom-trial-method': 'Custom trial code that can tell the control, a bracket or the half-step run apart',
  'custom-trial-state': 'Custom trial code that keeps state between calls',
  'custom-criterion-always': 'A custom criterion that always passes',
  'custom-guide-force': 'A custom force law that steers the piece',
  'custom-stands-in': 'A custom force law that stands in for a contact, drive or load the library has',
  'engine-scene-file': 'A physics engine scene kept as a file. The library makes it from the design source',
  'engine-setting-in-trial': 'Engine settings typed into a trial instead of physical inputs',
  'custom-share': 'More custom solids than the guideline',
  'custom-size': 'More custom code than the guideline',
  'restated-dimension': 'A trial number that restates a design parameter',
  'custom-listed-shape': 'A custom shape a listed shape could make',
  'override-no-reason': 'A screen override with no reason',
  'override-unknown-verdict': 'A screen override to a verdict the check does not know: planar is enough, needs 3D or configurable',
  'interaction-no-trial': 'An interaction in the judgement file that names neither one trial nor the reason it needs none (noTrial)',
  'trial-not-in-source': 'A trial the judgement file names that its design source does not define',
  'input-no-source': 'A physical input with no stated source',
  'trial-no-control': 'A trial with no control',
  'trial-no-brackets': 'A trial with no brackets and nothing with an assumed range',
};

/** The forms that only mean going around the door once a design source exists. */
const beforeConversion = ['kernel-outside-custom', 'writes-model', 'own-record'];
const codeFile = /\.(?:pyw?|[cm]?js|ts)$/i;
const plural = (count, one, many = one + 's') => count + ' ' + (count === 1 ? one : many);
const readText = (root, file, limit = 32 * 1024 * 1024) => { const full = path.join(root, file); return statSync(full).size > limit ? null : readFileSync(full, 'utf8'); };
const folderOf = name => name.replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '') + '/';

/** The project's declared skips and exceptions, and the findings about the file itself. */
function declared(root) {
  const findings = [], full = path.join(root, exceptionsFile);
  if (!existsSync(full)) return {skip: [], exceptions: [], findings};
  let data;
  try { data = JSON.parse(readFileSync(full, 'utf8')); } catch { return {skip: [], exceptions: [], findings: [exceptionsFile + ' is not readable JSON, so no exception or skipped folder in it applies.']}; }
  const exceptions = [];
  for (const entry of Array.isArray(data.exceptions) ? data.exceptions : []) {
    if (typeof entry?.path === 'string' && typeof entry.reason === 'string' && entry.reason.trim()) exceptions.push({path: entry.path.replace(/\\/g, '/').replace(/^\.\//, ''), form: entry.form ?? null, reason: entry.reason.trim(), covers: []});
    else findings.push(exceptionsFile + ' holds an exception without a path and a reason (' + JSON.stringify(entry) + '). It covers nothing until it has both.');
  }
  for (const entry of exceptions) if (entry.form && !forms[entry.form]) findings.push(exceptionsFile + ' names the form "' + entry.form + '", which the audit does not report. The exception for ' + entry.path + ' covers nothing.');
  return {skip: (Array.isArray(data.skip) ? data.skip : []).filter(name => typeof name === 'string' && name.trim()), exceptions, findings};
}

/** The design sources among the project's JSON files, with published copies under docs/ set apart. */
function sourcesIn(root, files) {
  const sources = [], copies = [];
  for (const file of files.filter(name => name.endsWith('.json'))) {
    const text = readText(root, file);
    if (!text?.includes(designSchema)) continue;
    let json;
    try { json = JSON.parse(text); } catch { continue; }
    if (json?.schema !== designSchema) continue;
    const entry = {root, file, text, json, sha256: createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')};
    (file.startsWith('docs/') ? copies : sources).push(entry);
  }
  return {sources, copies};
}

/** The custom/ folder of each source, and the findings and sizes of the code in it. */
function customCode(root, files, sources, registryOf) {
  const findings = [], info = [], customs = [];
  for (const source of sources) {
    const folder = path.posix.join(path.posix.dirname(source.file), 'custom') + '/', registry = registryOf.get(source) ?? {};
    const code = files.filter(file => file.startsWith(folder) && file.endsWith('.py'));
    let total = 0;
    for (const file of code) {
      const name = path.posix.basename(file, '.py'), entry = registry[name], text = readText(root, file);
      const {findings: found, lines} = customFindings(file, text, entry?.kind ?? 'shape');
      findings.push(...found);
      total += lines;
      if (!entry && file === folder + name + '.py') findings.push({form: 'custom-not-registered', file, line: null, detail: name + '.py is in custom/ but the design source registers no custom "' + name + '": register it with a reason and limits, or remove it'});
      else if (!entry) findings.push({form: 'custom-not-registered', file, line: null, detail: 'is below custom/, where the library loads only custom/NAME.py: custom code cannot import it'});
      if (lines > guidelines.customFileLines) findings.push({form: 'custom-size', file, line: null, detail: plural(lines, 'line') + ' of code, past the guideline of ' + guidelines.customFileLines + ' for one custom file: check in with the owner'});
      customs.push({name, kind: entry?.kind ?? 'shape', file, text, lines});
    }
    for (const [name, entry] of Object.entries(registry)) if (!code.includes(folder + name + '.py')) findings.push({form: 'custom-not-registered', file: source.file, line: null, detail: 'registers custom "' + name + '" but ' + folder + name + '.py is not there'});
    const mine = customs.filter(item => item.file.startsWith(folder)), shapes = mine.filter(item => item.kind === 'shape').length, laws = mine.length - shapes;
    const said = plural(shapes, 'custom shape') + ' and ' + plural(laws, 'custom force law or criterion', 'custom force laws or criteria') + ', ' + plural(total, 'line') + ' of code';
    const limits = 'at most ' + guidelines.customShapes + ' shapes, ' + guidelines.customTrialFiles + ' laws or criteria and ' + guidelines.customLines + ' lines';
    if (code.length) info.push({file: folder, text: said + ' (guidelines: ' + limits + ')'});
    if (shapes > guidelines.customShapes || laws > guidelines.customTrialFiles || total > guidelines.customLines) findings.push({form: 'custom-size', file: folder, line: null, detail: said + ', past the guidelines of ' + limits + ': check in with the owner'});
  }
  return {findings, info, customs};
}

/** Trial records a project writes in its own format, read for their qualification: control, brackets, half step. */
function qualificationFindings(root, files) {
  const findings = [];
  for (const file of files.filter(name => name.endsWith('.json') && !name.startsWith('docs/'))) {
    const text = readText(root, file, 4 * 1024 * 1024);
    if (!text?.includes('"qualification"')) continue;
    let record;
    try { record = JSON.parse(text); } catch { continue; }
    const q = record?.qualification;
    if (!q || typeof q !== 'object' || Array.isArray(q)) continue;
    const at = text.slice(0, text.indexOf('"qualification"')).split('\n').length, name = record.case ?? record.interaction ?? path.posix.basename(file);
    if (!q.control || q.control.rejected !== true) findings.push({form: 'trial-no-control', file, line: at, detail: 'the recorded trial "' + name + '" has ' + (q.control ? 'a control that was not rejected' : 'no control')});
    if (!(q.brackets ?? []).length) findings.push({form: 'trial-no-brackets', file, line: at, detail: 'the recorded trial "' + name + '" has no brackets'});
  }
  return findings;
}

const VERDICTS = ['planar is enough', 'needs 3D', 'configurable'];

/** The trials a judgement file names: on its interactions and on its stages' payload paths, as [{at, trial}]. */
function trialsNamedIn(json) {
  const named = [];
  for (const [name, entry] of Object.entries(json?.interactions ?? {})) if (typeof entry?.trial === 'string') named.push({at: 'interactions.' + name + '.trial', trial: entry.trial});
  for (const [stage, spec] of Object.entries(json?.stages ?? {}))
    for (const field of ['transportedBy', 'freePath', 'supportedBy'])
      for (const [payload, bound] of Object.entries(spec?.[field] ?? {}))
        if (typeof bound?.trial === 'string') named.push({at: 'stages.' + stage + '.' + field + '.' + payload + '.trial', trial: bound.trial});
  return named;
}

/** The judgement data in the plugin's judgement files: screen overrides listed with their reasons, an override or an interaction
 *  that is incomplete, and a trial the design source does not define. */
function judgementFindings(root, files) {
  const findings = [], info = [];
  for (const file of files.filter(name => path.posix.basename(name) === 'judgement.json' && !name.startsWith('docs/'))) {
    let json;
    try { json = JSON.parse(readText(root, file)); } catch { continue; }
    for (const override of overridesIn(json)) {
      if (!VERDICTS.includes(override.verdict))
        findings.push({form: 'override-unknown-verdict', file, line: null, detail: 'the override at ' + override.at + ' names the verdict ' + JSON.stringify(override.verdict)});
      if (override.reason) info.push({file, text: 'screen override at ' + override.at + (override.verdict ? ' to "' + override.verdict + '"' : '') + ': ' + override.reason});
      else findings.push({form: 'override-no-reason', file, line: null, detail: 'the override at ' + override.at + ' gives no reason'});
    }
    for (const [name, entry] of Object.entries(json?.interactions ?? {})) {
      const trial = typeof entry?.trial === 'string' && entry.trial.trim(), none = typeof entry?.noTrial === 'string' && entry.noTrial.trim();
      if (!trial === !none) findings.push({form: 'interaction-no-trial', file, line: null, detail: 'interactions.' + name + (trial ? ' names both a trial and noTrial' : ' names neither a trial nor noTrial')});
    }
    const sourceFile = json?.source?.file;
    let source = null;
    try { source = typeof sourceFile === 'string' ? JSON.parse(readText(root, sourceFile)) : null; } catch { /* an unreadable source is the layout check's to report */ }
    if (!source) continue;
    for (const {at, trial} of trialsNamedIn(json))
      if (!(trial in (source.trials ?? {}))) findings.push({form: 'trial-not-in-source', file, line: null, detail: at + ' names "' + trial + '", which ' + sourceFile + ' does not define under trials'});
  }
  return {findings, info};
}

/** The motions of a design source and its subsystem files that no motor drives, each with its stated cause and the file it is in. */
export function motorless(source) {
  const files = [{file: source.file, json: source.json}];
  for (const entry of Array.isArray(source.json.subsystems) ? source.json.subsystems : []) {
    const file = path.posix.join(path.posix.dirname(source.file), String(entry?.file ?? ''));
    try { files.push({file, json: JSON.parse(readText(source.root, file))}); } catch { /* an unreadable subsystem file is the library's to report */ }
  }
  const found = [];
  for (const {file, json} of files)
    for (const [motion, entry] of Object.entries(json?.motions ?? {}))
      if (!(entry?.drive && Object.keys(entry.drive).length)) found.push({motion, by: entry?.by ?? null, file});
  return found.sort((a, b) => a.motion.localeCompare(b.motion));
}

/** The information line that lists the motions no motor drives, or null when a motor drives every one. */
function motorlessLine(source) {
  const motions = motorless(source);
  if (!motions.length) return null;
  const said = motions.map(m => m.motion + ' (' + (m.by ? 'by ' + m.by : 'no cause stated') + (m.file === source.file ? '' : ', in ' + m.file) + ')');
  return {file: source.file, form: 'motions-without-a-motor', motions, text: plural(motions.length, 'motion') + ' without a motor: ' + said.join(', ')};
}

/** Audit one project. Returns {root, sources, copies, findings, info, exceptions, problems, coverage, customs}. */
export function auditDesign(root, {skip = [], run = true, python} = {}) {
  const own = declared(root), skipped = [...new Set([...skip, ...own.skip].map(folderOf))].sort();
  const all = projectFiles(root), files = all.files.filter(name => !skipped.some(folder => name.startsWith(folder))).sort();
  const {sources, copies} = sourcesIn(root, files), findings = [], info = [], unread = [];
  const registryOf = new Map(), customFolders = sources.map(source => path.posix.join(path.posix.dirname(source.file), 'custom') + '/');
  for (const source of sources) {
    const result = sourceFindings(source, guidelines);
    registryOf.set(source, result.registry);
    findings.push(...result.findings); info.push(...result.info);
    source.summary = {solids: result.solids, customSolids: result.customSolids, trials: Object.keys(result.trials).length, custom: Object.keys(result.registry).length};
    const moved = motorlessLine(source);
    if (moved) info.push(moved);
  }
  for (const copy of copies) {
    const same = sources.find(source => source.sha256 === copy.sha256);
    info.push({file: copy.file, text: same ? 'is a published copy of ' + same.file + ', not audited again' : 'is a published design source that matches no source outside docs/; it was not audited as a design'});
  }
  const custom = customCode(root, files, sources, registryOf);
  findings.push(...custom.findings); info.push(...custom.info);
  // Project code outside custom/, and scene files.
  const foreign = foreignNames(files), plugin = (file, text) => usesIn(file, text, foreign).uses;
  let codeCount = 0;
  for (const file of files) {
    if (customFolders.some(folder => file.startsWith(folder))) continue;
    if (/\.(?:xml|mjcf)$/i.test(file)) { const text = readText(root, file, 8 * 1024 * 1024); if (text) findings.push(...sceneFileFindings(file, text)); continue; }
    if (!codeFile.test(file)) continue;
    const text = readText(root, file, 2 * 1024 * 1024);
    if (text === null || text.includes('\0')) { unread.push(file); continue; }
    codeCount++;
    findings.push(...codeFindings(file, text, {plugin}));
  }
  // Generated outputs, the review scene and judgement data.
  const found = !run ? {reason: '--no-run was given'} : !sources.length ? {reason: 'the project has no design source'} : findLibrary(python);
  const generated = generatedFindings(root, files, sources, found), overrides = judgementFindings(root, files);
  findings.push(...generated.findings, ...overrides.findings, ...qualificationFindings(root, files));
  info.push(...generated.info, ...overrides.info);
  // Without a design source there is no door to go around yet: the library's work done in project code is information.
  let listed = dedupe(findings);
  if (!sources.length) {
    info.unshift({file: '.', text: 'the project has no design source (a JSON file with the schema ' + designSchema + '); nothing was audited as a design, only its code'});
    for (const form of beforeConversion) {
      const names = [...new Set(listed.filter(item => item.form === form).map(item => item.file))];
      if (names.length) info.push({file: '.', form, files: names, text: plural(names.length, 'file') + ': ' + forms[form].split('. ')[0].replace(/^\w/, first => first.toLowerCase()) + '. A finding once the project holds a design source: ' +
        names.slice(0, 5).join(', ') + (names.length > 5 ? ' and ' + (names.length - 5) + ' more (--json lists them)' : '')});
    }
    listed = listed.filter(item => !beforeConversion.includes(item.form));
  }
  // Declared exceptions take the findings they cover, and say so on every run.
  const kept = [];
  for (const finding of listed) {
    const cover = own.exceptions.find(entry => (entry.path.endsWith('/') ? finding.file.startsWith(entry.path) || finding.file + '/' === entry.path : finding.file === entry.path) && (!entry.form || entry.form === finding.form));
    (cover ? cover.covers : kept).push(finding);
  }
  const coverage = {listedBy: all.by, files: files.length, code: codeCount, custom: custom.customs.length, skipped, skippedFiles: all.files.length - files.length, unread,
    library: found.python ? 'ran ' + found.python + ' with frc-design-kernel ' + found.version.version + (found.version.commit ? ' at ' + found.version.commit.slice(0, 12) : '') + ': ' + (generated.ran.join('; ') || 'nothing needed it') : null,
    notRun: generated.notRun.length ? generated.notRun : found.python ? [] : ['Did not run the design library: ' + found.reason + '.']};
  return {root, sources: sources.map(({file, sha256, summary}) => ({file, sha256, ...summary})), copies: copies.map(copy => copy.file), findings: kept, info, exceptions: own.exceptions, problems: own.findings, coverage,
    customs: custom.customs};
}

/** What the audit never looks at, stated on every run. */
export const notLookedAt = [
  'Whether a custom force law, criterion or shape is right: the audit reads structure, not intent. That is why a custom model may never replace the control, the brackets or the half-step repeat.',
  'Code loaded from a computed location, and the plugin\'s other traces in a project: run project-ci-audit.mjs for those.',
  'Notebooks, shell scripts and model files, and the geometry inside STEP files beyond the names a manifest lists.',
];

/** One line per form in a file, with every line number that shows it. */
function placeLines(list) {
  const out = [], byFile = new Map();
  for (const item of list) byFile.set(item.file, [...(byFile.get(item.file) ?? []), item]);
  for (const [file, items] of byFile) {
    out.push('    ' + file);
    const details = new Map();
    for (const item of items) details.set(item.detail, [...(details.get(item.detail) ?? []), ...[item.line].flat()].filter(Boolean));
    for (const [detail, at] of details) out.push('      ' + (at.length ? (at.length === 1 ? 'line ' : 'lines ') + [...new Set(at)].sort((a, b) => a - b).join(', ') + ': ' : '') + detail);
  }
  return out;
}

/** The report of one project's audit, as the lines the command prints. The last line is the verdict. */
export function reportLines(audit) {
  const out = ['Design audit of ' + audit.root], {findings, coverage} = audit;
  for (const source of audit.sources) out.push('Design source ' + source.file + ': ' + plural(source.solids, 'robot solid') + ' (' + source.customSolids + ' custom), ' + plural(source.custom, 'custom registration') + ', ' + plural(source.trials, 'trial') + '.');
  for (const problem of audit.problems) out.push('Fix: ' + problem);
  if (findings.length) {
    out.push('Findings (' + findings.length + '). Each one goes to the owner as a check-in:');
    for (const form of Object.keys(forms)) {
      const these = findings.filter(item => item.form === form);
      if (these.length) out.push('  [' + form + '] ' + forms[form] + ' (' + these.length + '):', ...placeLines(these));
    }
  }
  if (audit.exceptions.length) {
    out.push('Declared exceptions in ' + exceptionsFile + ', listed on every run:');
    for (const entry of audit.exceptions) out.push('  ' + entry.path + (entry.form ? ' [' + entry.form + ']' : '') + ': ' + entry.reason + ' Covers ' + plural(entry.covers.length, 'finding') + (entry.covers.length ? ':' : '. Remove it.'), ...placeLines(entry.covers));
  }
  if (audit.info.length) {
    out.push('Information:');
    for (const item of audit.info) out.push('  ' + item.file + (item.line ? ' line ' + item.line : '') + ': ' + item.text);
  }
  out.push('Read ' + plural(coverage.files, 'file') + ' listed by ' + coverage.listedBy + ': ' + plural(coverage.code, 'code file') + ' outside custom/ and ' + plural(coverage.custom, 'custom file') + '.' +
    (coverage.skipped.length ? ' Skipped ' + coverage.skipped.join(', ') + ' (' + plural(coverage.skippedFiles, 'file') + ').' : ''));
  if (coverage.unread.length) out.push('Did not read ' + plural(coverage.unread.length, 'code file') + ' (over 2 MB or not text): ' + coverage.unread.slice(0, 10).join(', ') + (coverage.unread.length > 10 ? ' and ' + (coverage.unread.length - 10) + ' more' : '') + '.');
  if (coverage.library) out.push('Library: ' + coverage.library + '.');
  for (const line of coverage.notRun) out.push('Not run: ' + line);
  out.push('Not looked at: ' + notLookedAt.join(' '));
  const excepted = audit.exceptions.reduce((count, entry) => count + entry.covers.length, 0), files = new Set(findings.map(item => item.file)).size;
  out.push(findings.length ? plural(findings.length, 'finding') + ' in ' + plural(files, 'file') + (excepted ? ', and ' + excepted + ' under declared exceptions' : '') + '. This audit is advice: it blocks nothing.'
    : 'No findings in what the audit read' + (excepted ? ', ' + plural(excepted, 'finding') + ' under declared exceptions' : '') + (!audit.sources.length ? '; the project has no design source' : coverage.notRun.length ? '; the library was not run, so outputs were compared by fingerprint only' : '') + '. This audit is advice: it blocks nothing.');
  return out;
}

/** Library candidates across several audited projects, as report lines. */
export function acrossLines(audits) {
  const customs = audits.flatMap(audit => audit.customs.map(item => ({...item, project: path.basename(audit.root)})));
  const found = libraryCandidates(customs), out = ['Across ' + plural(audits.length, 'project') + ': ' + plural(customs.length, 'custom file') + ' compared.'];
  if (!found.length) out.push('No custom code looks alike in more than one project.');
  for (const candidate of found) out.push('Library candidate (' + candidate.kind + '): ' + candidate.members.map(member => member.project + ' ' + member.file).join(' and ') + ': ' + candidate.why + '.');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), skip = [], projects = [];
  let run = true, python, json = false, bad = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skip' && args[i + 1]) skip.push(args[++i]);
    else if (args[i] === '--python' && args[i + 1]) python = args[++i];
    else if (args[i] === '--no-run') run = false;
    else if (args[i] === '--json') json = true;
    else if (!args[i].startsWith('--')) projects.push(args[i]);
    else bad = true;
  }
  if (bad || !projects.length || projects.some(project => !statSync(project, {throwIfNoEntry: false})?.isDirectory())) {
    console.error('Usage: design-audit.mjs PROJECT [PROJECT...] [--skip FOLDER]... [--no-run] [--python COMMAND] [--json]');
    process.exit(2);
  }
  const audits = projects.map(project => auditDesign(path.resolve(project), {skip, run, python}));
  if (json) console.log(JSON.stringify(audits.map(({customs, ...audit}) => audit), null, 1));
  else {
    audits.forEach((audit, i) => { if (i) console.log(''); for (const line of reportLines(audit)) console.log(line); });
    if (audits.length > 1) { console.log(''); for (const line of acrossLines(audits)) console.log(line); }
  }
}
