#!/usr/bin/env node
/**
 * Check what a project publishes about its designs. The coding agent runs this before pushing; it is a tool of the
 * agent and no part of the project's CI. It never runs the layout check:
 *
 *   1. Every in-progress or effective design carries a layout-checked receipt of its committed layout plan, and the
 *      files that receipt names are the committed ones.
 *   2. The numbers the review scene shows equal the receipt.
 *   3. A mission case plays a represented objective on a passing operating case.
 *   4. An in-progress detailed design names an effective preliminary release and its receipt is on the Fusion export.
 *   5. An effective detailed design carries its bench-test record: every before-build test has a passing result and
 *      every on-robot test has an owner and a plan.
 *   6. One status index per phase, with at most one effective design and the primary view computed from it. A
 *      design whose ID is a version, MAJOR.MINOR, belongs to an architecture the index names, and a detailed version
 *      keeps the major number of the preliminary design it is built on.
 *   7. A design that was effective on the default branch of the remote keeps its physics: a rename, a status or
 *      wording change and a rebuilt view pass, and a change to what the layout check read or found is refused,
 *      because that work belongs to the next minor version, opened as a draft.
 *   8. A design this change makes effective carries the record of its stage gate (stage-gate.mjs), which the command
 *      that marks it effective writes after running the full layout check on the committed design.
 *   9. No tracked file holds a personal machine path or a credential, and the project carries no plugin file.
 *
 * A detailed design whose mechanical-readiness review does not pass cannot be effective. A withdrawn design is a
 * status with a reason; its files may leave the site. The check reads data only: it never inspects page markup.
 */
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {architectureName, currentFor, designName, designStatuses, designTitle, detailedTitle, releaseId, stateOf, statusOf, versionOf} from './design-status.mjs';
import {effectiveReadiness, readinessText} from './effective-readiness.mjs';
import {compareWithReceipt, readScene} from './review-scene.mjs';
import {contentSha, identityDifferences, physicsIdentity, receiptIdentity} from './physics-identity.mjs';
import {scanTree} from '../templates/project-ci/scan.mjs';
import {benchFile, effectiveProblems, handedOver, summary as benchSummary, summaryText as benchText} from './bench-tests.mjs';

const receiptSchema = 'agent-frc/preliminary-layout-result@1';
const readinessSchema = 'agent-frc/mechanical-readiness-result@1';
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

/** The trial evidence a stage names, by digest: a contact transport, an unsupported free path or a path a field fixture supports. */
const trialDigests = stage => [...Object.values(stage?.transportedBy ?? {}), ...Object.values(stage?.freePath ?? {}), ...Object.values(stage?.supportedBy ?? {})].map(x => x?.evidence?.sha256).filter(Boolean);

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
  const differ = compareWithReceipt(read, receipt);
  check(!differ.length, where + ': the review scene shows results that differ from the receipt: ' + differ.join('; '));
  const shown = new Map(list(read.scene.cases).map(c => [c.id, c.status]));
  const represented = new Set(list(receipt.narrativeReview?.objectives).filter(o => o?.disposition === 'represented').map(o => o.objective));
  // A trial counts only when the receipt names it: pinned by the case's stage, or as a scene interaction's evidence.
  const sceneTrials = list(read.scene.fieldInteractions).map(r => r?.evidence?.sha256).filter(Boolean);
  const animations = read.scene.animations;
  const missions = record.missionCases;
  check(Array.isArray(missions) && missions.length, where + ' declares no mission case');
  for (const m of missions) {
    check(object(m) && named(m.case) && kinds.includes(m.kind) && accomplishments.includes(m.accomplishes) && named(m.objective),
      where + ': each mission case needs a case, kind (' + kinds.join(', ') + '), accomplishment (' + accomplishments.join(', ') + ') and objective');
    const mission = where + ' mission case ' + m.case;
    check(represented.has(m.objective), mission + ' must accomplish a represented narrative objective');
    check(receipt.stages?.[m.case]?.purpose === 'operating' && list(receipt.cycle).includes(m.case), mission + ' must be an operating case in the checked cycle');
    check(receipt.cases.some(c => c.case === m.case && c.status === 'pass') && shown.get(m.case) === 'pass', mission + ' needs passing evidence played in the review');
    // An animation shows a mission phase; a case is one checked segment of it. A scene written before animations lists none.
    check(!Array.isArray(animations) || animations.some(a => a?.mission === true && list(a.cases).includes(m.case)),
      mission + ' is not played by a mission animation of the review. Its phase is marked "headline": false under presentation.phases; name a case of a headline phase');
    if (m.kind !== 'field-interaction-trial') continue;
    const trial = m.player !== undefined ? list(record.fieldPlayers).find(p => p?.file === m.player)?.trial : m.trial;
    check(object(trial) && named(trial.file) && files.has(trial.file), mission + ' must publish its trial file');
    const digest = sha(files.get(trial.file));
    check(trialDigests(receipt.stages[m.case]).includes(digest) || m.player !== undefined && sceneTrials.includes(digest),
      mission + ': the published trial is not one the receipt names');
  }
  return receipt;
}

/** What a reviewer needs from a mechanical-readiness review result: its verdicts and the findings that do not pass. */
export function readinessSummary(review) {
  const open = list(review.findings).filter(f => f?.status !== 'pass' && f?.status !== 'closed');
  return ['Mechanical-readiness review of ' + (review.configuration ?? 'the design'), 'Build readiness: ' + review.buildReadiness,
    'Showcase eligibility: ' + review.showcaseEligibility, 'Findings not passing: ' + open.length,
    ...open.slice(0, 20).map(f => '  - ' + [f.domain, f.subject, f.status, f.reason].filter(named).join(': '))].join('\n') + '\n';
}

/** How the check names a detailed design in its messages: by name and version, else by its earlier ID. */
export const detailedWhere = (index, id) => 'Detailed design ' + detailedTitle(index, id);

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

/** Run the plugin's layout check on committed inputs, physics only, and return its receipt. `jobs` sets its worker processes. */
export function runLayoutCheck({project, plan, previous, budgetMinutes = 45, jobs, python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')}) {
  const script = fileURLToPath(new URL('./preliminary_design.py', import.meta.url));
  const args = ['-B', script, project, plan, '--physics-only', '--fail-fast', ...(previous ? ['--previous', previous] : []),
    ...(jobs === undefined ? [] : ['--jobs', String(jobs)])];
  const run = spawnSync(python, args, {stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1024 * 1024 * 1024, timeout: budgetMinutes * 60000});
  if (run.error?.code === 'ETIMEDOUT') throw Error('the layout check exceeded its ' + budgetMinutes + ' minute budget');
  if (run.error) throw Error('the layout check could not start (' + python + '): ' + run.error.message);
  check(run.status === 0, 'the layout check ended with an error (exit ' + run.status + '); see the log above');
  return parse(run.stdout, 'rerun receipt');
}

/** A JSON file under `dir` with this digest, as a path relative to `dir`: the held receipt a check ran against. */
export function findByDigest(dir, digest) {
  return namesUnder(dir).find(name => name.endsWith('.json') && sha(readFileSync(path.join(dir, name))) === digest) ?? null;
}
/**
 * What a project still carries from the plugin, as one message that says what to do. The plugin is a tool of the
 * coding agent: a project names, calls, copies and wraps none of it.
 */
export function pluginFilesIn(root) {
  const text = name => { try { return readFileSync(path.join(root, name), 'utf8'); } catch { return null; } };
  const workflows = path.join(root, '.github', 'workflows');
  const found = (existsSync(workflows) ? readdirSync(workflows) : []).filter(name => /\.ya?ml$/.test(name))
    .filter(name => /ehartye\/agent-frc|AGENT_FRC|plugin\/scripts\//.test(text('.github/workflows/' + name) ?? '')).map(name => '.github/workflows/' + name);
  for (const name of ['cad/preliminary-design/stage.py', 'cad/preliminary-design/serve.py']) if (text(name) !== null) found.push(name);
  return found.length ? 'This project carries plugin files from an earlier layout: ' + found.join(', ') + '. The plugin is a tool of the coding agent, not a dependency of the project. ' +
    'Delete ' + (found.length === 1 ? 'it' : 'them') + ' and write the project\'s own CI from the references in the plugin\'s templates/project-ci/, which name no plugin. ' +
    'The agent runs staging, the stage gate and this check from the plugin.' : null;
}

/** The files a receipt records by digest, each with the name a message gives it. */
const receiptPins = receipt => [['STEP', receipt.step], ['motion study', receipt.motion], ['editable design', receipt.design],
  ['budget ledger', receipt.budgets?.source], ['limits', receipt.budgets?.limits]].filter(([, pin]) => named(pin?.file) && named(pin?.sha256));

/**
 * Whether a design was checked from the project root. Such a plan pins its files from there. The view sits in the
 * plan's folder, so its recorded path tells the two forms apart; the STEP does for a receipt without a view.
 */
export function checkedFromRoot(root, project, receipt) {
  const recorded = [receipt?.view?.file, receipt?.step?.file].find(named);
  const pinnedFile = recorded ? path.resolve(root, recorded) : null, into = pinnedFile && path.relative(project, pinnedFile);
  return project !== root && !!into && into !== '..' && !into.startsWith('..' + path.sep) && !path.isAbsolute(into) && existsSync(pinnedFile);
}

/**
 * A receipt belongs to the committed files: it is of the layout plan in `project`, and each file it names by digest
 * is that file. Throws on a stale receipt. Returns {fromRoot, absent}: the files it names that are not there.
 */
export function committedReceipt(root, project, planName, receipt, where) {
  const rel = full => path.relative(root, full).split(path.sep).join('/'), planFile = path.join(project, planName);
  check(existsSync(planFile), where + ': commit its check inputs at ' + rel(project) + ' (' + planName + ' and every file it names)');
  check(receipt.planSha256 === sha(readFileSync(planFile)), where + ': the published receipt is of a different layout plan than ' + rel(planFile) + '; run the layout check and publish its receipt');
  const fromRoot = checkedFromRoot(root, project, receipt), absent = [];
  for (const [label, pin] of receiptPins(receipt)) {
    const full = path.resolve(fromRoot ? root : project, pin.file);
    if (!statSync(full, {throwIfNoEntry: false})?.isFile()) { absent.push(pin.file); continue; }
    check(contentSha(readFileSync(full)) === pin.sha256, where + ': the committed ' + label + ' (' + rel(full) + ') is not the file its receipt checked. Run the layout check on the committed files and publish its receipt');
  }
  return {fromRoot, absent};
}

/**
 * Check a project. Options: site, preliminary, detailed (site folders), inputs, detailedInputs (folders of committed
 * check inputs, one per design ID), base (the commit to compare with; by default where this branch left the default
 * branch of the remote, as last fetched), scan (false skips the path and secret scan), log (progress lines).
 * Returns {preliminary, detailed, designs, comparedWith, warnings, reports, errors}; errors is empty when the project
 * passes. designs says in words what was checked for each live design.
 */
export function checkProject(root, options = {}) {
  const o = {site: 'docs', preliminary: 'preliminary-design', detailed: 'detailed-design', inputs: 'cad/preliminary-design/releases',
    detailedInputs: 'cad/detailed-design/designs', scan: true, log: line => console.error(line), ...options};
  const errors = [], warnings = [], reports = [], pending = [], designs = [];
  const attempt = (what, body) => { try { return body(); } catch (error) { errors.push(error.message); return undefined; } };
  const carried = pluginFilesIn(root);
  if (carried) errors.push(carried);
  const compared = o.base === undefined ? remoteBase(root) : o.base ? {commit: o.base, name: o.base} : null, base = baseReader(root, compared?.commit);
  const rel = full => path.relative(root, full).split(path.sep).join('/');
  // A project file as it was at the base commit, parsed; null when it was not there.
  const before = name => { try { return parse(base.at(name), name + ' at the base commit'); } catch { return null; } };
  // What an index said at the base commit: the design that was effective there.
  const earlier = indexFile => {
    const index = base && before(rel(indexFile));
    return {effective: Object.entries(index?.designStatus ?? {}).find(([, status]) => status === 'effective')?.[0] ?? null};
  };
  // The physics identity of a design from its receipt, record and inputs folder, read through `read` by project-relative path.
  const identityOf = ({receipt, record, inputs, read}) => {
    const planName = record?.check?.plan ?? 'layout.json', recorded = [receipt?.view?.file, receipt?.step?.file].find(named);
    // A plan checked from the project root writes its paths from there; one checked in its own folder writes bare names.
    const fromRoot = !!inputs && named(recorded) && recorded.startsWith(inputs + '/'), within = name => inputs ? inputs + '/' + name : name;
    return physicsIdentity({receipt, plan: fromRoot ? within(planName) : planName, folder: fromRoot ? inputs : '', read: fromRoot ? read : name => read(within(name)), extra: ['missions.json']});
  };
  const onDisk = name => { const full = path.resolve(root, name); return statSync(full, {throwIfNoEntry: false})?.isFile() ? readFileSync(full) : null; };
  const atBase = name => { try { return base.at(name); } catch { return null; } };
  // A detailed design made effective on its readiness review alone has no receipt; its STEP is its physics.
  const standIn = record => ({step: {sha256: record?.fusion?.stepSha256 ?? null}});
  const identityNow = item => identityOf({receipt: item.receipt ?? standIn(item.record), record: item.record, inputs: rel(item.inputs), read: onDisk});
  const identityBefore = (item, id) => {
    const dir = rel(path.join(item.tree, id)), record = before(dir + '/' + item.recordName);
    if (!record) return null;
    return identityOf({receipt: before(dir + '/receipt.json') ?? standIn(record), record, inputs: record.check?.project ?? item.fallback(id), read: atBase});
  };
  // A withdrawn design keeps its reason in the index. Its files may be gone; Git has them at the recorded commit.
  const withdrawnNote = (where, index, id) => { if (!named(index.reason?.[id])) warnings.push(where + ' is withdrawn without a reason in the index'); };
  // Where a design's check inputs are committed: the folder its record names under check.project, else the folder for its ID.
  const inputsOf = (where, record, fallback) => inside(root, record.check?.project ?? fallback, where + ': check.project');

  // Preliminary design releases.
  const prelimTree = path.join(root, o.site, o.preliminary), prelimIndexFile = path.join(prelimTree, 'releases.json');
  let preliminary = null, prelimStatus = () => null;
  if (existsSync(prelimIndexFile)) attempt('preliminary index', () => {
    const index = parse(readFileSync(prelimIndexFile), 'preliminary release index'), ids = index?.releases;
    check(object(index) && Array.isArray(ids) && ids.every(i => releaseId.test(i ?? '')) && new Set(ids).size === ids.length,
      'The preliminary release index needs a list of unique release IDs: a version, MAJOR.MINOR, or an earlier ID of lowercase letters, digits and hyphens');
    // The architecture each major number stands for. A version whose architecture has no name cannot be titled.
    check(index.designs === undefined || object(index.designs) && Object.entries(index.designs).every(([major, d]) => /^[1-9][0-9]{0,3}$/.test(major) && object(d) && named(d.name)),
      'designs maps each major number to its architecture name, as in {"1": {"name": "NAME"}}');
    for (const major of new Set(ids.map(i => versionOf(i)?.major).filter(Boolean)))
      check(named(index.designs?.[major]?.name), 'Design ' + major + ' has no name: add designs.' + major + '.name to the preliminary release index, or stage a version with --design-name');
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
    // A draft takes no number, so one architecture holds one in-progress version.
    const drafting = new Map();
    for (const id of ids.filter(i => versionOf(i) && status(i) === 'in-progress')) drafting.set(versionOf(id).major, [...(drafting.get(versionOf(id).major) ?? []), id]);
    for (const [major, several] of drafting) if (several.length > 1)
      warnings.push(index.designs[major].name + ' has ' + several.length + ' in-progress versions (' + several.join(', ') + '). A draft takes no number: keep one, revise it in place and mark the others superseded.');
    preliminary = {current: index.current, releases: []};
    for (const id of ids) {
      const entry = {release: id, ...(designName(index, id) ? {design: designTitle(index, id)} : {}), status: status(id)};
      preliminary.releases.push(entry);
      if (!['in-progress', 'effective'].includes(entry.status)) {
        attempt(id, () => check(entry.status === 'withdrawn' || dirs.includes(id), 'Release ' + id + ' is listed but has no directory'));
        if (entry.status === 'withdrawn') withdrawnNote('Preliminary release ' + designTitle(index, id), index, id);
        continue;
      }
      attempt(id, () => {
        const where = versionOf(id) ? 'Preliminary design ' + designTitle(index, id) : 'Preliminary release ' + id, dir = path.join(prelimTree, 'releases', id), record = records.get(id);
        check(record?.schema === 'agent-frc/preliminary-release@1' && record.release === id, where + ' needs its release record (release.json)');
        const receipt = checkEvidence(where, filesUnder(dir), record);
        const inputs = inputsOf(where, record, path.join(o.inputs, id));
        pending.push({where, entry, id, receipt, record, inputs, required: true, tree: path.join(prelimTree, 'releases'), recordName: 'release.json',
          fallback: other => rel(path.join(root, o.inputs, other)), was: earlier(prelimIndexFile), ids,
          command: release => 'python PLUGIN/scripts/stage_preliminary_review.py --set-status ' + release + ' effective'});
        // Effective is the project's decision in a reviewed pull request. The report is for its reviewer.
        if (entry.status === 'effective') {
          const design = entry.design;
          reports.push({title: where + ' (effective)',
            text: existsSync(inputs) ? readinessText(checkedFromRoot(root, inputs, receipt) ? effectiveReadiness(root, {release: rel(inputs), design}) : effectiveReadiness(inputs, {design})) : 'No readiness report: the check inputs are not committed.\n'});
        }
      });
    }
  });

  // Detailed designs.
  const detailTree = path.join(root, o.site, o.detailed), detailIndexFile = path.join(detailTree, 'designs.json');
  let detailed = null;
  if (existsSync(detailIndexFile)) attempt('detailed index', () => {
    const index = parse(readFileSync(detailIndexFile), 'detailed design index'), ids = index?.designs;
    check(object(index) && index.schema === 'agent-frc/detailed-design-index@1' && Array.isArray(ids) && ids.every(i => releaseId.test(i ?? '')) &&
      new Set(ids).size === ids.length && object(index.designStatus) && ids.every(i => designStatuses.includes(index.designStatus[i])),
      'The detailed design index needs unique design IDs (a version, MAJOR.MINOR, or an earlier ID of lowercase letters, digits and hyphens), each with a designStatus (' + designStatuses.join(', ') + ')');
    // The architecture each major number stands for: the same name as its preliminary design.
    check(index.architectures === undefined || object(index.architectures) && Object.entries(index.architectures).every(([major, d]) => /^[1-9][0-9]{0,3}$/.test(major) && object(d) && named(d.name)),
      'architectures maps each major number to its architecture name, as in {"1": {"name": "NAME"}}');
    for (const major of new Set(ids.map(i => versionOf(i)?.major).filter(Boolean)))
      check(named(index.architectures?.[major]?.name), 'Detailed design ' + major + ' has no name: add architectures.' + major + '.name to the detailed design index, or stage a version with --design-name');
    check(ids.filter(i => index.designStatus[i] === 'effective').length <= 1, 'At most one detailed design is effective');
    // A draft takes no number, so one architecture holds one in-progress version.
    const drafting = new Map();
    for (const id of ids.filter(i => versionOf(i) && index.designStatus[i] === 'in-progress')) drafting.set(versionOf(id).major, [...(drafting.get(versionOf(id).major) ?? []), id]);
    for (const [major, several] of drafting) if (several.length > 1)
      warnings.push('Detailed design ' + index.architectures[major].name + ' has ' + several.length + ' in-progress versions (' + several.join(', ') + '). A draft takes no number: keep one, revise it in place and mark the others superseded.');
    const view = primaryView(index);
    check((index.current ?? null) === view.current && (index.beside ?? null) === view.beside,
      'The primary view is the effective detailed design, else the newest in-progress one: set current to ' + view.current + ' and beside to ' + view.beside);
    detailed = {...view, designs: []};
    const held = (where, entry, id, record) => ({where, entry, id, record, inputs: inputsOf(where, record, path.join(o.detailedInputs, id)), required: false,
      tree: path.join(detailTree, 'designs'), recordName: 'design.json', fallback: other => rel(path.join(root, o.detailedInputs, other)), was: earlier(detailIndexFile), ids,
      command: design => 'node PLUGIN/scripts/detailed-design-release.mjs effective . --design ' + design + ' --readiness REVIEW_RESULT.json'});
    for (const id of ids) {
      const entry = {design: id, ...(architectureName(index, id) ? {title: detailedTitle(index, id), state: stateOf(index, id)} : {}), status: index.designStatus[id]};
      detailed.designs.push(entry);
      if (entry.status === 'withdrawn') withdrawnNote(detailedWhere(index, id), index, id);
      if (!['in-progress', 'effective'].includes(entry.status)) continue;
      attempt(id, () => {
        const where = detailedWhere(index, id), dir = path.join(detailTree, 'designs', id), files = filesUnder(dir);
        check(files.has('design.json'), where + ' needs its design record (designs/' + id + '/design.json)');
        const record = parse(files.get('design.json'), 'design record: ' + id);
        check(record?.schema === 'agent-frc/detailed-design@1' && record.design === id, where + ': the design record names a different schema or design');
        if (entry.status === 'effective') {
          // Effective is the project's decision in a reviewed pull request. The readiness review is the evidence it
          // carries, and a review that does not pass cannot carry it.
          check(files.has('readiness.json'), where + ' is effective: commit its mechanical-readiness review result as designs/' + id + '/readiness.json');
          const review = parse(files.get('readiness.json'), 'readiness review: ' + id);
          check(review?.schema === readinessSchema && named(review.stepSha256), where + ': readiness.json is not a mechanical-readiness review result');
          check(review.stepSha256 === record.fusion?.stepSha256, where + ': the readiness review is of a different STEP than the design record names');
          // Bench tests as records. The preliminary design's risk register says which tests were handed over.
          const link = record.preliminary?.release ?? index.preliminary?.[id];
          const handed = named(link) ? handedOver(root, link, {site: o.site, preliminaryTree: o.preliminary, inputs: o.inputs}).tests : null;
          const bench = files.has(benchFile) ? parse(files.get(benchFile), 'bench-test record: ' + id) : null;
          reports.push({title: where + ' (effective)', text: readinessSummary(review) + (bench ? 'Bench tests: ' + benchText(benchSummary(bench)) + '\n' : '')});
          const unresolved = bench ? effectiveProblems(bench, handed) : handed?.length ? ['its preliminary design ' + link + ' hands over ' + handed.length +
            ' bench test' + (handed.length === 1 ? '' : 's') + ' and the design publishes no record (designs/' + id + '/' + benchFile + ')'] : [];
          check(!unresolved.length, where + ' cannot be effective until its bench tests are resolved: ' + unresolved.join('; '));
          check(review.showcaseEligibility === 'pass', where + ' cannot be effective: its mechanical-readiness review reports ' + review.showcaseEligibility +
            '. Resolve the findings and commit the passing review, or keep the design in progress.');
          if (!files.has('receipt.json')) { pending.push({...held(where, entry, id, record), receipt: null}); return; }
        }
        const receipt = checkEvidence(where, files, record);
        check(record.fusion?.stepSha256 === receipt.step?.sha256, where + ': the layout check ran on a STEP other than the Fusion export the record names');
        if (entry.status === 'in-progress') {
          const link = record.preliminary?.release, linked = prelimStatus(link);
          check(named(link) && ['effective', 'superseded'].includes(linked), where + ' must name an effective preliminary release; ' + link + ' is ' + linked);
          check(!versionOf(id) || !versionOf(link) || versionOf(id).major === versionOf(link).major,
            where + ' names preliminary design ' + link + ', a different architecture. The major number is the architecture: a detailed design keeps the major number of its preliminary design');
          if (linked === 'superseded') warnings.push(where + ' names preliminary release ' + link + ', which is now superseded. Re-link it to the effective preliminary release: detailed-design-release.mjs relink PROJECT --design ' + id + ' --preliminary RELEASE.');
          const basisFile = path.join(prelimTree, 'releases', link, 'receipt.json');
          if (existsSync(basisFile)) {
            const basis = parse(readFileSync(basisFile), 'receipt of preliminary release ' + link), mine = new Set(receipt.cases.map(c => c.case));
            check(list(basis.cases).every(c => mine.has(c.case)) && JSON.stringify(basis.cycle) === JSON.stringify(receipt.cycle) &&
              basis.control?.case === receipt.control.case && basis.control?.displaced === receipt.control.displaced,
              where + ': its layout check must run the motion cases, cycle and displaced control of preliminary release ' + link);
          }
        }
        pending.push({...held(where, entry, id, record), receipt});
      });
    }
  });

  // Say for each live design what was checked, and hold an effective design to its physics and its gate.
  const since = compared?.name;
  for (const item of pending) attempt(item.where, () => {
    const {where, entry, id, receipt, record, was} = item, project = item.inputs, effective = entry.status === 'effective';
    const note = text => { designs.push({design: where, status: entry.status, note: text}); o.log('[publication] ' + where + ': ' + text); };
    let becoming = false, said;
    if (!effective) said = 'draft, published on its local layout check. The layout check is not run here.';
    else if (!base) said = 'effective. No default branch of the remote to compare with, so its physics was not compared.';
    else if (was.effective === id) {
      // Already effective: the reviewed physics stands. Labels and the view may change.
      const then = identityBefore(item, id), differ = then ? identityDifferences(identityNow(item), then) : [];
      const version = versionOf(id);
      check(!differ.length, where + ' is effective, and this change alters its physics: ' + differ.join(', ') + '. An effective design does not change in place. ' +
        (version ? 'Open ' + version.major + '.' + (version.minor + 1) + ' as a draft and make the change there.' : 'Publish the change as a new design, staged as a draft.') +
        ' A rename, a status or wording change and a rebuilt view pass, because they leave these files and results as they were.');
      said = 'effective, physics unchanged since ' + since + '.';
    } else {
      // A rename keeps the design: the effective design of the base commit is gone from the index and this one carries its physics.
      const from = was.effective && !item.ids.includes(was.effective) ? was.effective : null, then = from && identityBefore(item, from);
      if (then && !identityDifferences(identityNow(item), then).length) said = 'effective, the same physics as ' + from + ' under a new ID.';
      else { becoming = true; said = 'becoming effective. Its stage gate record matches the committed receipt.'; }
    }
    if (!receipt) return note(said);
    const planName = record.check?.plan ?? 'layout.json';
    if (!existsSync(path.join(project, planName))) {
      check(!item.required, where + ': commit its check inputs at ' + rel(project) + ' (' + planName + ' and every file it names). The stage gate runs on them');
      warnings.push(where + ': its inputs are not committed at ' + rel(project) + ', so its receipt was not compared with them');
      return note(said);
    }
    // The receipt names the files it read by digest. The committed ones must be those files.
    const {absent} = committedReceipt(root, project, planName, receipt, where);
    if (absent.length) warnings.push(where + ': its receipt names files that are not committed (' + absent.join(', ') + '). The stage gate cannot run without them.');
    // The command that marks a design effective runs the gate and writes its record. A status set by hand has none.
    const gatePath = path.join(item.tree, id, 'gate.json'), gate = existsSync(gatePath) ? parse(readFileSync(gatePath), 'gate record of ' + where) : null;
    const physics = sha(JSON.stringify(receiptIdentity(receipt)));
    if (becoming) check(gate?.schema === 'agent-frc/stage-gate@1' && gate.verdict === 'pass' && gate.physics === physics, where + ' is marked effective without a stage gate of this design. ' +
      'Mark it effective with the plugin\'s command, which runs the full layout check on the committed design and writes ' + rel(gatePath) + ': ' + item.command(id));
    note(said);
  });
  // A personal machine path or a credential is public as soon as the branch is pushed.
  if (o.scan) attempt('scan', () => {
    let scan;
    try { scan = scanTree(root); } catch (error) { if (/git/i.test(error.message)) return; throw error; }
    for (const f of scan.findings) errors.push(f.file + ':' + f.line + ': ' + (f.kind === 'machine-path' ? 'a personal machine path; write paths relative to the repository' : 'a credential; remove it and rotate it') + ': ' + f.text);
  });
  return {plugin: pluginVersion, preliminary, detailed, designs, comparedWith: since ?? null, warnings, reports, errors};
}

/** Where this branch left the default branch of the remote, as last fetched: {commit, name}, or null without one. */
function remoteBase(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  let names = [];
  try { names = [git('symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD')]; } catch { /* the remote names no default branch */ }
  for (const name of [...names, 'origin/main', 'origin/master']) try { return {commit: git('merge-base', name, 'HEAD'), name}; } catch { /* try the next */ }
  return null;
}

/** Reads project files as they were at a base commit, or null when there is no usable base. */
function baseReader(root, base) {
  if (!base) return null;
  try {
    const git = (encoding, ...args) => execFileSync('git', ['-C', root, ...args], {...(encoding ? {encoding} : {}), stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 1024});
    const commit = git('utf8', 'rev-parse', '--verify', '-q', base + '^{commit}').trim(), prefix = git('utf8', 'rev-parse', '--show-prefix').trim();
    return {at: name => git(null, 'cat-file', 'blob', commit + ':' + prefix + name)};
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const usage = 'Usage: design-publication.mjs check PROJECT [--base COMMIT] [--site docs] [--preliminary preliminary-design] [--detailed detailed-design] ' +
    '[--inputs cad/preliminary-design/releases] [--detailed-inputs cad/detailed-design/designs]';
  try {
    const [mode, project, ...rest] = process.argv.slice(2), options = {};
    check(mode === 'check' && project && statSync(project, {throwIfNoEntry: false})?.isDirectory(), usage);
    for (let i = 0; i < rest.length; i++) {
      check(!['--skip-rerun', '--rerun', '--cache', '--budget-minutes', '--jobs'].includes(rest[i]), rest[i] + ' is no longer an option. This check never runs the layout check: ' +
        'the stage gate runs when a design is marked effective, and the project\'s CI runs no plugin. ' + usage);
      const name = {'--site': 'site', '--preliminary': 'preliminary', '--detailed': 'detailed', '--inputs': 'inputs', '--detailed-inputs': 'detailedInputs', '--base': 'base'}[rest[i]];
      check(name && rest[i + 1] !== undefined, usage);
      options[name] = rest[++i];
    }
    const result = checkProject(path.resolve(project), options);
    for (const report of result.reports) console.log('== ' + report.title + ' ==\n' + report.text);
    for (const warning of result.warnings) console.error('Warning: ' + warning);
    for (const error of result.errors) console.error('Error: ' + error);
    const {reports, ...summary} = result;
    console.log(JSON.stringify(summary, null, 2));
    // The last line an agent reads: what a push will do.
    console.error(result.errors.length ? 'Not ready to push: fix the ' + result.errors.length + ' error' + (result.errors.length === 1 ? '' : 's') + ' above.'
      : 'Ready to push. On push: the project\'s workflow publishes the page. Nothing is rerun.');
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
