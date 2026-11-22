#!/usr/bin/env node
/**
 * Check a season project's published designs. This is the whole publication gate:
 *
 *   1. Every in-progress or effective design carries a layout-checked receipt, and the layout check is rerun here
 *      from the committed inputs: it passes, the displaced control is rejected, and its verdicts and input digests
 *      equal the committed receipt.
 *   2. The numbers the review scene shows equal the receipt.
 *   3. A mission case plays a represented objective on a passing operating case.
 *   4. An in-progress detailed design names an effective preliminary release and its receipt is on the Fusion export.
 *   5. One status index per phase, with at most one effective design and the primary view computed from it.
 *
 * A design becomes effective by a status change in the index, in a reviewed pull request. This check prints the
 * readiness report for the reviewer; it does not judge it.
 */
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {currentFor, designStatuses, statusOf} from './design-status.mjs';
import {effectiveReadiness, readinessText} from './effective-readiness.mjs';
import {compareWithReceipt, readScene} from './review-scene.mjs';

const receiptSchema = 'agent-frc/preliminary-layout-result@1';
const readinessSchema = 'agent-frc/mechanical-readiness-result@1';
const designId = /^[a-z0-9][a-z0-9-]{0,63}$/;
const accomplishments = ['acquired', 'delivered', 'scored', 'climb-held'];
const kinds = ['operating-case', 'field-interaction-trial'];
const sceneFile = 'review-scene.json.gz';
export const pluginVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const named = v => typeof v === 'string' && v.trim().length > 0;
const list = v => Array.isArray(v) ? v : [];
function check(ok, message) { if (!ok) throw Error(message); }
function parse(bytes, what) {
  try { return JSON.parse(bytes.toString('utf8').replace(/^﻿/, '')); } catch { throw Error('Unreadable ' + what); }
}

/** The physics a receipt must record: layout-checked, every case, the mass and every voltage case passing, the displaced control rejected. */
export function checkPhysics(receipt, where, {rerun = false} = {}) {
  check(receipt?.schema === receiptSchema && named(receipt.issue), where + ' needs an Agent FRC preliminary-check receipt');
  check(receipt.status === 'layout-checked', where + ' needs a layout-checked receipt; found ' + receipt.status);
  check(receipt.partial !== true, where + ': a partial --fail-fast receipt is not a checked layout');
  check(rerun || receipt.physicsOnly !== true, where + ': publish the receipt of a full check, not a --physics-only rerun');
  check(list(receipt.missingInputs).length === 0, where + ' lists missing inputs');
  check(list(receipt.reopen).length === 0, where + ' holds a reopened premise');
  const cases = list(receipt.cases);
  check(cases.length && cases.every(c => object(c) && named(c.case) && c.status === 'pass'), where + ' needs every clearance case to pass');
  check(object(receipt.control?.witness) && receipt.control.witness.status === 'fail', where + ' needs the displaced control to be rejected');
  check(receipt.budgets?.massStatus === 'pass', where + ' needs a passing inspection mass budget');
  const duties = list(receipt.budgets.electricalCases);
  check(duties.length && duties.every(r => r?.status === 'pass'), where + ' needs every loaded-voltage case to pass');
}

/** The trial evidence a stage names, by digest: a contact transport or an unsupported free path. */
const trialDigests = stage => [...Object.values(stage?.transportedBy ?? {}), ...Object.values(stage?.freePath ?? {})].map(x => x?.evidence?.sha256).filter(Boolean);

/** What a rerun must reproduce: the inputs by digest and every verdict. Measured values are left out; a kernel on another system may round them differently. */
export function verdict(receipt) {
  return {
    issue: receipt.issue, status: receipt.status, planSha256: receipt.planSha256, stepSha256: receipt.step?.sha256, motionSha256: receipt.motion?.sha256,
    previousCheckpointSha256: receipt.previousCheckpointSha256 ?? null,
    cycle: list(receipt.cycle), cases: list(receipt.cases).map(c => [c.case, c.status]).sort(),
    stages: Object.entries(receipt.stages ?? {}).map(([name, stage]) => [name, stage?.purpose, trialDigests(stage).sort()]).sort(),
    objectives: list(receipt.narrativeReview?.objectives).map(o => [o?.objective, o?.disposition]).sort(),
    control: [receipt.control?.case, receipt.control?.displaced, receipt.control?.witness?.status],
    massStatus: receipt.budgets?.massStatus, budgetsSha256: receipt.budgets?.source?.sha256, limitsSha256: receipt.budgets?.limits?.sha256,
    electricalCases: list(receipt.budgets?.electricalCases).map(r => [r.case, r.status]).sort()
  };
}
/** The fields in which a rerun's verdict differs from the committed receipt. */
export function compareVerdicts(committed, rerun) {
  const a = verdict(committed), b = verdict(rerun);
  return Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/**
 * The evidence in one published directory, given as a map of file name to bytes: the receipt's physics, the scene's
 * numbers against the receipt, and the record's mission cases. Returns the parsed receipt.
 */
export function checkEvidence(where, files, record) {
  check(files.has('receipt.json'), where + ' has no receipt.json');
  const receipt = parse(files.get('receipt.json'), 'receipt of ' + where);
  checkPhysics(receipt, where);
  check(record.issue === undefined || record.issue === receipt.issue, where + ': the record and the receipt name different issues');
  check(files.has(sceneFile), where + ' has no ' + sceneFile + '; regenerate the review with --write-view');
  let read;
  try { read = readScene(files.get(sceneFile)); } catch { throw Error(where + ': unreadable ' + sceneFile); }
  const differ = compareWithReceipt(read, receipt, {pins: false});
  check(!differ.length, where + ': the review scene shows results that differ from the receipt: ' + differ.join('; '));
  const shown = new Map(list(read.scene.cases).map(c => [c.id, c.status]));
  const represented = new Set(list(receipt.narrativeReview?.objectives).filter(o => o?.disposition === 'represented').map(o => o.objective));
  // A trial counts only when the receipt names it: pinned by the case's stage, or as a scene interaction's evidence.
  const sceneTrials = list(read.scene.fieldInteractions).map(r => r?.evidence?.sha256).filter(Boolean);
  const missions = record.missionCases;
  check(Array.isArray(missions) && missions.length, where + ' declares no mission case');
  for (const m of missions) {
    check(object(m) && named(m.case) && kinds.includes(m.kind) && accomplishments.includes(m.accomplishes) && named(m.objective),
      where + ': each mission case needs a case, kind (' + kinds.join(', ') + '), accomplishment (' + accomplishments.join(', ') + ') and objective');
    const mission = where + ' mission case ' + m.case;
    check(represented.has(m.objective), mission + ' must accomplish a represented narrative objective');
    check(receipt.stages?.[m.case]?.purpose === 'operating' && list(receipt.cycle).includes(m.case), mission + ' must be an operating case in the checked cycle');
    check(receipt.cases.some(c => c.case === m.case && c.status === 'pass') && shown.get(m.case) === 'pass', mission + ' needs passing evidence played in the review');
    if (m.kind !== 'field-interaction-trial') continue;
    const trial = m.player !== undefined ? list(record.fieldPlayers).find(p => p?.file === m.player)?.trial : m.trial;
    check(object(trial) && named(trial.file) && files.has(trial.file), mission + ' must publish its trial file');
    const digest = sha(files.get(trial.file));
    check(trialDigests(receipt.stages[m.case]).includes(digest) || m.player !== undefined && sceneTrials.includes(digest),
      mission + ': the published trial is not one the receipt names');
  }
  return receipt;
}

/** The primary view of the detailed designs: the effective design, else the newest in-progress one, which otherwise shows beside it. */
export function primaryView(index) {
  const of = status => index.designs.filter(id => index.designStatus[id] === status).at(-1) ?? null;
  const effective = of('effective'), progress = of('in-progress');
  return {current: effective ?? progress, beside: effective ? progress : null};
}

function namesUnder(dir) {
  const names = [];
  if (!existsSync(dir)) return names;
  (function walk(folder, prefix) {
    for (const item of readdirSync(folder, {withFileTypes: true})) {
      if (item.isDirectory()) walk(path.join(folder, item.name), prefix + item.name + '/');
      else if (item.isFile()) names.push(prefix + item.name);
    }
  })(dir, '');
  return names.sort();
}
const filesUnder = dir => new Map(namesUnder(dir).map(name => [name, readFileSync(path.join(dir, name))]));
const folders = dir => existsSync(dir) ? readdirSync(dir, {withFileTypes: true}).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name) : [];
function inside(root, name, what) {
  check(named(name) && !path.isAbsolute(name), what + ' must be a project-relative path');
  const full = path.resolve(root, name), rel = path.relative(root, full);
  check(!rel.startsWith('..') && !path.isAbsolute(rel), what + ' must stay inside the project');
  return full;
}

/** Run the plugin's layout check on committed inputs, physics only, and return its receipt. */
export function runLayoutCheck({project, plan, previous, budgetMinutes = 45, python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')}) {
  const script = fileURLToPath(new URL('./preliminary_design.py', import.meta.url));
  const args = ['-B', script, project, plan, '--physics-only', '--fail-fast', ...(previous ? ['--previous', previous] : [])];
  const run = spawnSync(python, args, {stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1024 * 1024 * 1024, timeout: budgetMinutes * 60000});
  if (run.error?.code === 'ETIMEDOUT') throw Error('the layout check exceeded its ' + budgetMinutes + ' minute budget');
  if (run.error) throw Error('the layout check could not start (' + python + '): ' + run.error.message);
  check(run.status === 0, 'the layout check ended with an error (exit ' + run.status + '); see the log above');
  return parse(run.stdout, 'rerun receipt');
}

/** A JSON file under `dir` with this digest, as a path relative to `dir`: the held receipt a check ran against. */
function findByDigest(dir, digest) {
  return namesUnder(dir).find(name => name.endsWith('.json') && sha(readFileSync(path.join(dir, name))) === digest) ?? null;
}
/** One digest over every file in a design's inputs folder, by path and content. */
function inputsDigest(dir) {
  const hash = createHash('sha256');
  for (const name of namesUnder(dir)) hash.update(name + '\0' + sha(readFileSync(path.join(dir, name))) + '\n');
  return hash.digest('hex');
}

/**
 * Check a project. Options: site, preliminary, detailed (site folders), inputs, detailedInputs (folders of committed
 * check inputs, one per design ID), cache (folder of earlier rerun results), base (commit; rerun only designs changed
 * since it), budgetMinutes, skipRerun, log (progress lines), run (the layout check; replaced in tests).
 * Returns {preliminary, detailed, warnings, reports, errors}; errors is empty when the project passes.
 */
export function checkProject(root, options = {}) {
  const o = {site: 'docs', preliminary: 'preliminary-design', detailed: 'detailed-design', inputs: 'cad/preliminary-design/releases',
    detailedInputs: 'cad/detailed-design/designs', run: runLayoutCheck, log: line => console.error(line), ...options};
  const errors = [], warnings = [], reports = [], pending = [];
  const attempt = (what, body) => { try { return body(); } catch (error) { errors.push(error.message); return undefined; } };
  const changed = changedPaths(root, o.base);
  const rel = full => path.relative(root, full).split(path.sep).join('/');
  // Where a design's check inputs are committed: the folder its record names under check.project, else the folder for its ID.
  const inputsOf = (where, record, fallback) => inside(root, record.check?.project ?? fallback, where + ': check.project');

  // Preliminary design releases.
  const prelimTree = path.join(root, o.site, o.preliminary), prelimIndexFile = path.join(prelimTree, 'releases.json');
  let preliminary = null, prelimStatus = () => null;
  if (existsSync(prelimIndexFile)) attempt('preliminary index', () => {
    const index = parse(readFileSync(prelimIndexFile), 'preliminary release index'), ids = index?.releases;
    check(object(index) && Array.isArray(ids) && ids.every(i => designId.test(i ?? '')) && new Set(ids).size === ids.length,
      'The preliminary release index needs a list of unique release IDs');
    const map = index.designStatus;
    check(map === undefined || object(map) && Object.entries(map).every(([id, v]) => ids.includes(id) && designStatuses.includes(v)),
      'designStatus maps listed release IDs to ' + designStatuses.join(', '));
    const dirs = folders(path.join(prelimTree, 'releases'));
    const records = new Map(dirs.map(id => [id, path.join(prelimTree, 'releases', id, 'release.json')]).filter(([, f]) => existsSync(f))
      .map(([id, f]) => [id, attempt(id, () => parse(readFileSync(f), 'release record: ' + id)) ?? {}]));
    const historical = new Set([...records].filter(([, r]) => r.status === 'historical-review').map(([id]) => id));
    const status = id => statusOf(index, id, historical);
    prelimStatus = id => ids.includes(id) ? status(id) : null;
    check(ids.filter(i => status(i) === 'effective').length <= 1, 'At most one preliminary design release is effective');
    const current = ids.length ? currentFor(index, historical) : undefined;
    check(index.current === current, 'The preliminary index must open the effective release, else the newest in-progress one: set current to ' + current);
    for (const id of dirs) attempt(id, () => check(ids.includes(id), 'Release directory ' + id + ' is not in the preliminary release index'));
    preliminary = {current: index.current, releases: []};
    for (const id of ids) {
      const entry = {release: id, status: status(id)};
      preliminary.releases.push(entry);
      if (!['in-progress', 'effective'].includes(entry.status)) { attempt(id, () => check(entry.status === 'withdrawn' || dirs.includes(id), 'Release ' + id + ' is listed but has no directory')); continue; }
      attempt(id, () => {
        const where = 'Preliminary release ' + id, dir = path.join(prelimTree, 'releases', id), record = records.get(id);
        check(record?.schema === 'agent-frc/preliminary-release@1' && record.release === id, where + ' needs its release record (release.json)');
        const receipt = checkEvidence(where, filesUnder(dir), record);
        const inputs = inputsOf(where, record, path.join(o.inputs, id));
        pending.push({where, entry, receipt, record, inputs, siteDir: dir, index: prelimIndexFile, required: true});
        // Effective is the project's decision in a reviewed pull request. The report is for its reviewer.
        if (entry.status === 'effective') reports.push({title: where + ' (effective)',
          text: existsSync(inputs) ? readinessText(effectiveReadiness(inputs)) : 'No readiness report: the check inputs are not committed.\n'});
      });
    }
  });

  // Detailed designs.
  const detailTree = path.join(root, o.site, o.detailed), detailIndexFile = path.join(detailTree, 'designs.json');
  let detailed = null;
  if (existsSync(detailIndexFile)) attempt('detailed index', () => {
    const index = parse(readFileSync(detailIndexFile), 'detailed design index'), ids = index?.designs;
    check(object(index) && index.schema === 'agent-frc/detailed-design-index@1' && Array.isArray(ids) && ids.every(i => designId.test(i ?? '')) &&
      new Set(ids).size === ids.length && object(index.designStatus) && ids.every(i => designStatuses.includes(index.designStatus[i])),
      'The detailed design index needs unique design IDs, each with a designStatus (' + designStatuses.join(', ') + ')');
    check(ids.filter(i => index.designStatus[i] === 'effective').length <= 1, 'At most one detailed design is effective');
    const view = primaryView(index);
    check((index.current ?? null) === view.current && (index.beside ?? null) === view.beside,
      'The primary view is the effective detailed design, else the newest in-progress one: set current to ' + view.current + ' and beside to ' + view.beside);
    detailed = {...view, designs: []};
    for (const id of ids) {
      const entry = {design: id, status: index.designStatus[id]};
      detailed.designs.push(entry);
      if (!['in-progress', 'effective'].includes(entry.status)) continue;
      attempt(id, () => {
        const where = 'Detailed design ' + id, dir = path.join(detailTree, 'designs', id), files = filesUnder(dir);
        check(files.has('design.json'), where + ' needs its design record (designs/' + id + '/design.json)');
        const record = parse(files.get('design.json'), 'design record: ' + id);
        check(record?.schema === 'agent-frc/detailed-design@1' && record.design === id, where + ': the design record names a different schema or design');
        if (entry.status === 'effective') {
          // Effective is the project's decision in a reviewed pull request. The readiness review is the evidence it carries.
          check(files.has('readiness.json'), where + ' is effective: commit its mechanical-readiness review result as designs/' + id + '/readiness.json');
          const review = parse(files.get('readiness.json'), 'readiness review: ' + id);
          check(review?.schema === readinessSchema && named(review.stepSha256), where + ': readiness.json is not a mechanical-readiness review result');
          check(review.stepSha256 === record.fusion?.stepSha256, where + ': the readiness review is of a different STEP than the design record names');
          const open = list(review.findings).filter(f => f?.status !== 'pass' && f?.status !== 'closed');
          reports.push({title: where + ' (effective)', text: 'Mechanical-readiness review of ' + (review.configuration ?? 'the design') + '\nBuild readiness: ' + review.buildReadiness +
            '\nShowcase eligibility: ' + review.showcaseEligibility + '\nFindings not passing: ' + open.length + '\n' +
            open.slice(0, 20).map(f => '  - ' + [f.domain, f.subject, f.status, f.reason].filter(named).join(': ')).join('\n') + (open.length ? '\n' : '')});
          if (review.showcaseEligibility !== 'pass') warnings.push(where + ' is effective while its readiness review reports ' + review.showcaseEligibility);
          if (!files.has('receipt.json')) return;
        }
        const receipt = checkEvidence(where, files, record);
        check(record.fusion?.stepSha256 === receipt.step?.sha256, where + ': the layout check ran on a STEP other than the Fusion export the record names');
        if (entry.status === 'in-progress') {
          const link = record.preliminary?.release, linked = prelimStatus(link);
          check(named(link) && ['effective', 'superseded'].includes(linked), where + ' must name an effective preliminary release; ' + link + ' is ' + linked);
          if (linked === 'superseded') warnings.push(where + ' names preliminary release ' + link + ', which is now superseded. Re-link it to the effective preliminary release.');
          const basisFile = path.join(prelimTree, 'releases', link, 'receipt.json');
          if (existsSync(basisFile)) {
            const basis = parse(readFileSync(basisFile), 'receipt of preliminary release ' + link), mine = new Set(receipt.cases.map(c => c.case));
            check(list(basis.cases).every(c => mine.has(c.case)) && JSON.stringify(basis.cycle) === JSON.stringify(receipt.cycle) &&
              basis.control?.case === receipt.control.case && basis.control?.displaced === receipt.control.displaced,
              where + ': its layout check must run the motion cases, cycle and displaced control of preliminary release ' + link);
          }
        }
        pending.push({where, entry, receipt, record, inputs: inputsOf(where, record, path.join(o.detailedInputs, id)), siteDir: dir, index: detailIndexFile, required: false});
      });
    }
  });

  // Rerun the layout check for each live design from its committed inputs.
  for (const item of pending) attempt(item.where, () => {
    const {where, entry, receipt, record} = item;
    if (o.skipRerun) { entry.rerun = 'skipped'; return; }
    const project = item.inputs;
    const planName = record.check?.plan ?? 'layout.json', planFile = path.join(project, planName);
    if (!existsSync(planFile)) {
      check(!item.required, where + ': commit its check inputs at ' + rel(project) + ' (' + planName + ' and every file it pins) so the layout check can be rerun');
      warnings.push(where + ': the layout check was not rerun because its inputs are not committed at ' + rel(project));
      entry.rerun = 'not committed';
      return;
    }
    const planSha256 = sha(readFileSync(planFile));
    check(receipt.planSha256 === planSha256, where + ': the published receipt is of a different layout plan than ' + rel(planFile) + '; rerun the check and publish its receipt');
    // The plan pins its inputs by digest, but only the layout check verifies those pins. Key the cache on the files themselves.
    const key = o.cache && sha(inputsDigest(project) + '\n' + planName + '\n' + pluginVersion), cached = o.cache && path.join(o.cache, key + '.json');
    let fresh;
    if (cached && existsSync(cached)) { fresh = parse(readFileSync(cached), 'cached rerun'); entry.rerun = 'cached'; }
    else if (changed && ![project, item.siteDir, item.index].some(p => changed.touches(rel(p)))) { entry.rerun = 'unchanged'; return; }
    else {
      const previous = receipt.previousCheckpointSha256 ? record.check?.previous ?? findByDigest(project, receipt.previousCheckpointSha256) : null;
      check(!receipt.previousCheckpointSha256 || previous, where + ': commit the held receipt it was checked against (SHA-256 ' + receipt.previousCheckpointSha256 + ') under ' + rel(project));
      o.log('[rerun] ' + where + ': layout check on ' + rel(planFile));
      try { fresh = o.run({project, plan: planName, previous, budgetMinutes: o.budgetMinutes}); }
      catch (error) { throw Error(where + ': ' + error.message); }
      entry.rerun = 'pass';
    }
    checkPhysics(fresh, where + ' (rerun)', {rerun: true});
    const differ = compareVerdicts(receipt, fresh);
    check(!differ.length, where + ': the rerun differs from the committed receipt in ' + differ.join(', ') + '; publish the receipt of the committed inputs');
    if (cached && entry.rerun === 'pass') { mkdirSync(o.cache, {recursive: true}); writeFileSync(cached, JSON.stringify(fresh)); }
  });
  return {plugin: pluginVersion, preliminary, detailed, warnings, reports, errors};
}

/** The paths changed since a base commit, or null to treat every design as changed. A workflow change selects every design. */
function changedPaths(root, base) {
  if (!base) return null;
  try {
    const diff = (...args) => execFileSync('git', ['-C', root, 'diff', '--name-only', '-z', ...args, base, 'HEAD'],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024}).split('\0').filter(Boolean);
    // Workflows sit at the top of the repository; the designs are named relative to the project folder.
    if (diff().some(n => n.startsWith('.github/workflows/'))) return null;
    const names = diff('--relative');
    return {touches: p => names.some(n => n === p || n.startsWith(p + '/'))};
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const usage = 'Usage: design-publication.mjs check PROJECT [--site docs] [--preliminary preliminary-design] [--detailed detailed-design] ' +
    '[--inputs cad/preliminary-design/releases] [--detailed-inputs cad/detailed-design/designs] [--cache DIR] [--base COMMIT] [--budget-minutes 45] [--skip-rerun]';
  try {
    const [mode, project, ...rest] = process.argv.slice(2), options = {};
    check(mode === 'check' && project && statSync(project, {throwIfNoEntry: false})?.isDirectory(), usage);
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--skip-rerun') { options.skipRerun = true; continue; }
      const name = {'--site': 'site', '--preliminary': 'preliminary', '--detailed': 'detailed', '--inputs': 'inputs', '--detailed-inputs': 'detailedInputs',
        '--cache': 'cache', '--base': 'base', '--budget-minutes': 'budgetMinutes'}[rest[i]];
      check(name && rest[i + 1] !== undefined, usage);
      options[name] = name === 'budgetMinutes' ? Number(rest[++i]) : rest[++i];
    }
    check(options.budgetMinutes === undefined || options.budgetMinutes > 0, usage);
    // An all-zero or unknown base, as a first push supplies, means every design is checked.
    if (options.base && /^0*$/.test(options.base)) delete options.base;
    const result = checkProject(path.resolve(project), options), actions = !!process.env.GITHUB_ACTIONS;
    for (const report of result.reports) console.log('== ' + report.title + ' ==\n' + report.text);
    const line = (kind, text) => actions ? '::' + kind + ' title=Design publication::' + text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
      : kind[0].toUpperCase() + kind.slice(1) + ': ' + text;
    for (const warning of result.warnings) console.error(line('warning', warning));
    for (const error of result.errors) console.error(line('error', error));
    const {reports, ...summary} = result;
    console.log(JSON.stringify(summary, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY && result.reports.length)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.reports.map(r => '### ' + r.title + '\n\n```\n' + r.text + '```\n').join('\n'));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
