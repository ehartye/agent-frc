#!/usr/bin/env node
/**
 * Publish a detailed design into the season site, change its design status, re-link it to the effective preliminary
 * design, copy its inputs to a new design folder, or remove it.
 *
 * A new design takes a version as its ID, MAJOR.MINOR, and the name of its architecture: the same name as the
 * preliminary design it is built on, and its own numbers. The major number is the architecture. The minor number
 * counts the detailed effective baselines of that architecture. A draft is a publish of an in-progress version and
 * takes no number: staging the same ID again counts it. An ID issued before versions keeps working and has no name.
 *
 * These commands only write files: a design directory, the status index and the stock catalog page. The project's
 * Design publication workflow decides whether the result may merge (design-publication.mjs check).
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

import {writeDirectoryAtomic, writeFileAtomic} from './atomic-write.mjs';
import {gateLine, stageGate, writeGate} from './stage-gate.mjs';
import {architectureName, designStatuses, detailedTitle, draftOf, releaseId, stateOf, versionOf} from './design-status.mjs';
import {checkProject, detailedWhere, primaryView, readinessSummary} from './design-publication.mjs';
import {benchFile, effectiveGate, summary as benchSummary, summaryText as benchText} from './bench-tests.mjs';

export const designSchema = 'agent-frc/detailed-design@1';
export const indexSchema = 'agent-frc/detailed-design-index@1';
const readinessSchema = 'agent-frc/mechanical-readiness-result@1';
const receiptSchema = 'agent-frc/preliminary-layout-result@1';
// A version, MAJOR.MINOR, or an ID issued before versions: lowercase letters, digits and hyphens.
const designId = releaseId, useVersion = 'Use a version as the design ID: MAJOR.MINOR, such as 1.0';
const catalog = new URL('../templates/detailed-design-index.html', import.meta.url);
const fonts = fileURLToPath(new URL('../templates/preliminary-review-fonts', import.meta.url));
const perDesign = ['supersededBy', 'reason', 'lastCommit', 'preliminary', 'revision', 'accepted'];

function check(ok, message) { if (!ok) throw Error(message); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const named = v => typeof v === 'string' && v.trim().length > 0;
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { throw Error('Unreadable ' + file); } };

/** The folders of one project. `site` holds the published trees. */
function layout(project, {site = 'docs', detailed = 'detailed-design', preliminaryTree: preliminary = 'preliminary-design', detailedInputs = 'cad/detailed-design/designs'} = {}) {
  const tree = path.join(project, site, detailed);
  return {project, site, detailed, preliminary, tree, indexFile: path.join(tree, 'designs.json'), inputs: path.join(project, detailedInputs),
    preliminaryIndexFile: path.join(project, site, preliminary, 'releases.json'),
    preliminaryIndex: path.posix.relative(detailed, preliminary + '/releases.json')};
}
function loadIndex(at) {
  if (!existsSync(at.indexFile)) return {schema: indexSchema, preliminaryIndex: at.preliminaryIndex, designs: [], designStatus: {}};
  const index = readJson(at.indexFile);
  check(index.schema === indexSchema && Array.isArray(index.designs) && index.designStatus && typeof index.designStatus === 'object', 'Unreadable detailed design index');
  return index;
}
/** Write the index with its primary view recomputed, and the stock catalog page when the tree has none. */
function saveIndex(at, index) {
  const view = primaryView(index), out = {schema: indexSchema, preliminaryIndex: index.preliminaryIndex ?? at.preliminaryIndex, ...view,
    designs: index.designs, designStatus: index.designStatus};
  // A major number keeps its name while any version of it is listed.
  const titled = Object.entries(index.architectures ?? {}).filter(([major]) => index.designs.some(id => String(versionOf(id)?.major) === major));
  if (titled.length) out.architectures = Object.fromEntries(titled);
  for (const key of perDesign) {
    const rows = Object.entries(index[key] ?? {}).filter(([id]) => index.designs.includes(id));
    if (rows.length) out[key] = Object.fromEntries(rows);
  }
  mkdirSync(at.tree, {recursive: true});
  writeFileAtomic(at.indexFile, JSON.stringify(out, null, 2) + '\n');
  if (!existsSync(path.join(at.tree, 'index.html'))) writeFileAtomic(path.join(at.tree, 'index.html'), readFileSync(catalog));
  // The staged review page reads its theme fonts from the tree it sits in, at ../../fonts/.
  if (!existsSync(path.join(at.tree, 'fonts')) && index.designs.some(id => existsSync(path.join(at.tree, 'designs', id, 'index.html')))) cpSync(fonts, path.join(at.tree, 'fonts'), {recursive: true});
  return out;
}
/** Run the publication check without the rerun and return what it says about this design or the detailed index. */
function problems(at, design) {
  const result = checkProject(at.project, {site: at.site, detailed: at.detailed, preliminary: at.preliminary, scan: false, base: null, log: () => {}});
  const where = detailedWhere(loadIndex(at), design);
  return result.errors.filter(e => e.startsWith(where + ' ') || e.startsWith(where + ':'));
}

/** The commit the checkout is at, which a draft was staged from. Null outside Git or before a first commit. */
function headCommit(project) {
  try { return execFileSync('git', ['-C', project, 'rev-parse', '--verify', '-q', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null; } catch { return null; }
}
const today = () => new Date().toISOString().slice(0, 10);
const majorOf = id => versionOf(id)?.major ?? null;
const inProgressOf = (index, major, besides) => index.designs.find(id => id !== besides && majorOf(id) === major && index.designStatus[id] === 'in-progress') ?? null;
const described = (index, id) => 'detailed design ' + detailedTitle(index, id);
const sentence = text => text[0].toUpperCase() + text.slice(1);

/** The name the preliminary release index gives the architecture of a major number, or null. */
function preliminaryName(at, major) {
  let name;
  try { name = JSON.parse(readFileSync(at.preliminaryIndexFile, 'utf8').replace(/^\uFEFF/, ''))?.designs?.[major]?.name; } catch { return null; }
  return typeof name === 'string' && name.trim() ? name : null;
}

/**
 * Name the architecture of a version being staged and check where the version falls among those listed. Returns notes
 * for the person staging. It refuses only what the index cannot hold: an unnamed architecture, a second name for one
 * architecture, a major number other than its preliminary design's, a second in-progress version of one architecture
 * and a version behind one already listed.
 */
function placeVersion(at, index, design, name, preliminary) {
  const {major, minor} = versionOf(design), known = architectureName(index, design), shared = preliminaryName(at, major), notes = [];
  if (name !== undefined) {
    name = String(name).split(/\s+/).filter(Boolean).join(' ');
    check(name.length > 0 && name.length <= 60, 'Give the design a short name in words with --design-name, 60 characters at most');
  }
  const basis = versionOf(preliminary);
  check(!basis || basis.major === major, 'Detailed design ' + design + ' cannot be built on preliminary design ' + preliminary + ': the major number is the architecture, ' +
    'and a detailed design keeps the major number of its preliminary design. Stage it as ' + (basis?.major ?? major) + '.N');
  if (known === null) {
    check(name || shared, 'Name design ' + major + ' with --design-name "NAME": a short name in words for the architecture. ' +
      'Give it once, the first time a major number is staged; every version of that architecture keeps it');
    check(!name || !shared || name === shared, 'Preliminary design ' + major + ' is named "' + shared + '". A detailed design takes the same name as its ' +
      'preliminary design and its own version: leave --design-name out, or correct the name in the preliminary release index first');
    index.architectures = {...index.architectures, [major]: {name: shared ?? name}};
  } else {
    check(!name || name === known, 'Design ' + major + ' is named "' + known + '". A name stays with its architecture: a different architecture ' +
      'takes the next major number with its own name. Correct a spelling by editing architectures in designs.json in a pull request');
    if (shared && shared !== known) notes.push('preliminary design ' + major + ' is named "' + shared + '" and the detailed index names it "' + known + '". Use one name: edit architectures in designs.json.');
  }
  if (index.designs.includes(design)) return notes;
  const drafting = inProgressOf(index, major);
  check(!drafting, detailedTitle(index, drafting) + ' is already in progress (draft ' + draftOf(index, drafting) + '). Revise it in place: stage ' + drafting +
    ' again. A draft takes no number; a new number is for a new effective baseline or a new architecture');
  const minors = index.designs.filter(id => majorOf(id) === major).map(id => versionOf(id).minor);
  const majors = [...new Set(index.designs.map(majorOf).filter(Boolean))].sort((a, b) => a - b);
  if (minors.length) {
    const last = Math.max(...minors), following = major + '.' + (last + 1);
    check(minor >= last, 'Version ' + design + ' comes before ' + major + '.' + last + ', which is already listed. The next version of ' + architectureName(index, design) + ' is ' + following);
    if (design !== following) notes.push('the version after ' + major + '.' + last + ' is ' + following + '; ' + design + ' skips a number.');
    return notes;
  }
  if (minor) notes.push('the first version of an architecture is ' + major + '.0; everything before its first effective baseline is a draft of ' + major + '.0.');
  for (const earlier of majors.filter(m => m !== major)) {
    const left = inProgressOf(index, earlier);
    if (left) notes.push(detailedTitle(index, left) + ' is still in progress. If the team has left that architecture, mark it superseded or withdraw it.');
  }
  return notes;
}
/** Why a design that is no longer in progress cannot be staged again, with the ID that follows it. */
function settled(index, design) {
  const version = versionOf(design), status = index.designStatus[design];
  return version ? sentence(described(index, design)) + ' is ' + status + ' and no longer changes. Work toward its next baseline is ' + version.major + '.' + (version.minor + 1) +
    ', staged as a draft; a different architecture takes the next major number with its own name'
    : 'Design ' + design + ' is ' + status + '; choose a new ID';
}
const report = lines => lines.length ? {report: lines.join('\n') + '\n'} : {};
// What a push does with the change just made, said after each command. The method: docs/testing-methodology.md.
const onPush = 'On push: the project\'s workflow publishes the page. Nothing is rerun.';

/** Replay the Fusion authority register and export lineage: the archive and STEP the registered design exports to. */
function fusionExport({project, authority, lineage, python}) {
  return JSON.parse(execFileSync(python ?? process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
    [fileURLToPath(new URL('./fusion_authority.py', import.meta.url)), project, authority, lineage], {encoding: 'utf8'}));
}

/**
 * Publish a new in-progress design from checked inputs: a folder inside the project holding layout.json, its
 * layout-checked receipt.json, missions.json and every file the layout pins. The receipt's STEP must be the export
 * the registered Fusion design replays to, and the named preliminary release must be effective.
 */
export function stageInProgress({project, design, designName, inputs, preliminary, authority, lineage, python, replay: replayExport = fusionExport, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(designId.test(design ?? ''), useVersion);
  check(designName === undefined || versionOf(design), '--design-name names the architecture of a version ID, MAJOR.MINOR. Design ' + design + ' keeps its earlier ID and has no name');
  check(named(inputs) && named(preliminary) && named(authority) && named(lineage), 'Supply --inputs, --preliminary, --authority and --lineage');
  const listed = index.designs.includes(design);
  if (listed && index.designStatus[design] !== 'in-progress') throw Error(settled(index, design));
  const notes = versionOf(design) ? placeVersion(at, index, design, designName, preliminary) : [];
  const source = path.resolve(project, inputs), need = name => {
    const file = path.join(source, name);
    check(named(name) && existsSync(file) && statSync(file).isFile(), 'Detailed design input is missing ' + name);
    return readFileSync(file);
  };
  check(!path.relative(project, source).startsWith('..'), 'Keep the check inputs inside the project so its CI can rerun the layout check');
  const replay = replayExport({project, authority, lineage, python});
  const plan = JSON.parse(need('layout.json')), receiptBytes = need('receipt.json'), receipt = JSON.parse(receiptBytes), missions = JSON.parse(need('missions.json'));
  check(receipt.planSha256 === sha(need('layout.json')), 'The receipt belongs to a different layout. Rerun the layout check and save its receipt');
  check(receipt.step?.sha256 === replay.stepSha256, 'The layout check ran on a STEP other than the registered Fusion export');
  const viewName = plan.view, sceneName = path.posix.join(path.posix.dirname(viewName), 'review-scene.json.gz');
  const out = new Map([['index.html', need(viewName)], ['review-scene.json.gz', need(sceneName)], ['receipt.json', receiptBytes],
    ['motion.json', need(plan.motion.file)], ['budgets.json', need(plan.budgets.file)]]);
  out.set('limits.json', need(JSON.parse(out.get('budgets.json')).requirements.file));
  const record = {schema: designSchema, design, issue: receipt.issue, preliminary: {release: preliminary},
    fusion: {archiveSha256: replay.archiveSha256, stepSha256: replay.stepSha256, configuration: replay.configuration, ...(replay.revision ? {revision: replay.revision} : {})},
    // Where the project's CI finds the committed inputs to rerun the layout check.
    check: {project: path.relative(project, source).split(path.sep).join('/'), plan: 'layout.json'},
    missionCases: (missions.missionCases ?? []).map(m => m?.trial?.file ? {...m, trial: {file: path.posix.basename(m.trial.file)}} : m)};
  for (const m of missions.missionCases ?? []) if (m?.trial?.file) out.set(path.posix.basename(m.trial.file), need(m.trial.file));
  // Field-interaction players the review links, each with the trial behind it.
  const players = [];
  for (const row of JSON.parse(gunzipSync(out.get('review-scene.json.gz'))).fieldInteractions ?? []) {
    const page = String(row?.href ?? '').replace(/^\.\//, '');
    check(/^field\/[a-z0-9][a-z0-9._-]{0,110}\.html$/.test(page) && named(row?.evidence?.file), 'Link each field interaction to a page at field/NAME.html beside the view, with its trial evidence');
    const trial = path.posix.basename(row.evidence.file);
    out.set(page, need(path.posix.join(path.posix.dirname(viewName), page)));
    out.set(trial, need(row.evidence.file));
    if (!players.some(p => p.file === page)) players.push({file: page, trial: {file: trial}, objective: row.objective});
  }
  if (players.length) record.fieldPlayers = players;
  out.set('design.json', Buffer.from(JSON.stringify(record, null, 2) + '\n'));
  // The bench tests handed over by the preliminary design, published beside the review. A draft is not held to them.
  const bench = effectiveGate(project, design, {preliminary, file: path.join(source, benchFile), ...folders});
  if (bench.record) out.set(benchFile, readFileSync(path.join(source, benchFile)));
  if (bench.record) notes.push('bench tests: ' + benchText(benchSummary(bench.record)) + (bench.problems.length ? '. Before effective: ' + bench.problems.length + ' to resolve (bench-tests.mjs check).' : '.'));
  else if (bench.problems.length) notes.push(bench.problems[0]);
  const dir = path.join(at.tree, 'designs', design), replaced = existsSync(dir), before = existsSync(at.indexFile) ? readFileSync(at.indexFile) : null;
  // Staging unchanged files counts nothing.
  if (replaced && listed && sameTree(dir, out)) return {...saveIndex(at, index), ...report([sentence(described(index, design)) + ' is unchanged (draft ' + draftOf(index, design) + ')'])};
  const backup = replaced ? dir + '.replaced' : null;
  if (replaced) { rmSync(backup, {recursive: true, force: true}); cpSync(dir, backup, {recursive: true}); rmSync(dir, {recursive: true}); }
  mkdirSync(path.dirname(dir), {recursive: true});
  // The design directory appears complete or not at all.
  writeDirectoryAtomic(dir, temp => { for (const [name, bytes] of out) { mkdirSync(path.dirname(path.join(temp, name)), {recursive: true}); writeFileSync(path.join(temp, name), bytes); } });
  // One version keeps one ID: an edit counts a draft here, in the field named revision.
  const number = listed ? draftOf(index, design) + 1 : 1, commit = headCommit(project);
  index.revision = {...index.revision, [design]: {number, date: today(), ...(commit ? {commit} : {})}};
  if (!listed) index.designs.push(design);
  index.designStatus[design] = 'in-progress';
  index.preliminary = {...index.preliminary, [design]: preliminary};
  const saved = saveIndex(at, index), found = problems(at, design);
  if (found.length) {
    // Leave the site as it was; a failed stage has nothing to clear before a retry.
    rmSync(dir, {recursive: true, force: true});
    if (backup) cpSync(backup, dir, {recursive: true});
    if (before) writeFileSync(at.indexFile, before); else rmSync(at.indexFile, {force: true});
  }
  if (backup) rmSync(backup, {recursive: true, force: true});
  check(!found.length, found.join('\n'));
  return {...saved, ...report([(number > 1 ? 'Revised ' + described(index, design) + ' in place' : 'Staged ' + described(index, design)) + ' (' + stateOf(index, design) + ')',
    ...notes.map(n => 'Note: ' + n), 'Before pushing, run the publication check: node PLUGIN/scripts/design-publication.mjs check .', onPush])};
}

/** Whether a published folder holds exactly these files. */
function sameTree(dir, files) {
  const names = [];
  (function walk(folder, prefix) {
    for (const item of readdirSync(folder, {withFileTypes: true})) item.isDirectory() ? walk(path.join(folder, item.name), prefix + item.name + '/') : names.push(prefix + item.name);
  })(dir, '');
  return names.length === files.size && names.every(name => files.has(name) && readFileSync(path.join(dir, name)).equals(Buffer.from(files.get(name))));
}

/**
 * Re-link an in-progress design to another preliminary release, as when the next preliminary baseline is accepted.
 * The design keeps its ID, files and draft count. Its layout check must already cover that release's motion cases,
 * cycle and displaced control; otherwise rerun the check on them and stage the design again.
 */
export function relink({project, design, preliminary, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(index.designs.includes(design) && named(preliminary), 'Supply --design, a listed design, and --preliminary, the effective preliminary release');
  const mine = versionOf(design), basis = versionOf(preliminary);
  check(index.designStatus[design] === 'in-progress', sentence(described(index, design)) + ' is ' + index.designStatus[design] + '. Only an in-progress design is re-linked' +
    (mine ? '; work on a new preliminary baseline is detailed design ' + mine.major + '.' + (mine.minor + 1) : ''));
  check(!basis || !mine || basis.major === mine.major, 'Preliminary design ' + preliminary + ' is a different architecture. The major number is the architecture: its detailed design is ' +
    basis?.major + '.0, with its own name');
  const recordFile = path.join(at.tree, 'designs', design, 'design.json'), recordBefore = readFileSync(recordFile), indexBefore = readFileSync(at.indexFile);
  const was = index.preliminary?.[design];
  writeFileAtomic(recordFile, JSON.stringify({...JSON.parse(recordBefore), preliminary: {release: preliminary}}, null, 2) + '\n');
  index.preliminary = {...index.preliminary, [design]: preliminary};
  const saved = saveIndex(at, index), found = problems(at, design);
  if (found.length) { writeFileSync(recordFile, recordBefore); writeFileSync(at.indexFile, indexBefore); }
  check(!found.length, found.join('\n'));
  return {...saved, ...report([sentence(described(index, design)) + ' is now built on preliminary ' + preliminary + (was && was !== preliminary ? ' (was ' + was + ')' : '') + ' and keeps its ID', onPush])};
}

/**
 * Mark a design effective and commit its mechanical-readiness review result beside it. The design that was
 * effective becomes superseded. A design not yet published gets a record from the review. A review that does not
 * pass is refused. The report goes to the reviewer of the pull request, who accepts the design by merging it.
 */
export function markEffective({project, design, designName, readiness, benchTests, run, now, budgetMinutes, jobs, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(designId.test(design ?? '') && named(readiness), 'Supply --design and --readiness, the mechanical-readiness review result');
  check(designName === undefined || versionOf(design), '--design-name names the architecture of a version ID, MAJOR.MINOR');
  const review = readJson(path.resolve(project, readiness));
  check(review.schema === readinessSchema && named(review.stepSha256), 'The readiness file is not a mechanical-readiness review result');
  check(review.showcaseEligibility === 'pass', 'Design ' + design + ' cannot be effective: its mechanical-readiness review reports ' + review.showcaseEligibility + '\n' + readinessSummary(review));
  const dir = path.join(at.tree, 'designs', design), recordFile = path.join(dir, 'design.json');
  check(!index.designs.includes(design) || index.designStatus[design] === 'in-progress', 'Only a new or in-progress design can become effective: ' + design);
  const notes = versionOf(design) ? placeVersion(at, index, design, designName, index.preliminary?.[design]) : [];
  // Bench tests as records: every before-build test has a passing result, every on-robot test an owner and a plan.
  const bench = effectiveGate(project, design, {...(named(benchTests) ? {file: path.resolve(project, benchTests)} : {}), ...folders});
  check(!bench.problems.length, sentence(described(index, design)) + ' cannot be effective until its bench tests are resolved:\n' + bench.problems.map(p => '  - ' + p).join('\n'));
  // The stage gate: the full layout check, run here on the committed design. An earlier receipt is never taken for it.
  // A design recorded from its review alone has no layout of its own to check.
  const gate = existsSync(path.join(dir, 'receipt.json')) ? stageGate({root: at.project, where: sentence(described(index, design)), id: design, phase: 'detailed-design',
    inputs: path.resolve(at.project, readJson(recordFile).check?.project ?? path.join(at.inputs, design)), published: dir, record: readJson(recordFile),
    ...(run ? {run} : {}), ...(now ? {now} : {}), budgetMinutes, jobs}) : null;
  if (gate) writeGate(dir, gate);
  if (!existsSync(recordFile)) {
    mkdirSync(dir, {recursive: true});
    writeFileAtomic(recordFile, JSON.stringify({schema: designSchema, design,
      fusion: {archiveSha256: review.archiveSha256, stepSha256: review.stepSha256, configuration: review.configuration}}, null, 2) + '\n');
  }
  check(readJson(recordFile).fusion?.stepSha256 === review.stepSha256, 'The readiness review is of a different STEP than design ' + design + ' names');
  writeFileAtomic(path.join(dir, 'readiness.json'), JSON.stringify(review, null, 2) + '\n');
  if (bench.record) writeFileAtomic(path.join(dir, benchFile), JSON.stringify(bench.record, null, 2) + '\n');
  if (!index.designs.includes(design)) index.designs.push(design);
  for (const id of index.designs) if (index.designStatus[id] === 'effective') {
    index.designStatus[id] = 'superseded';
    index.supersededBy = {...index.supersededBy, [id]: design};
  }
  index.designStatus[design] = 'effective';
  // The date it was accepted stays with the design once it is superseded.
  index.accepted = {...index.accepted, [design]: index.accepted?.[design] ?? today()};
  const version = versionOf(design), latest = Math.max(0, ...index.designs.map(majorOf).filter(Boolean));
  return {...saveIndex(at, index), report: (gate ? gateLine(sentence(described(index, design)), gate) + '\n' : '') + readinessSummary(review) + (bench.record ? 'Bench tests: ' + benchText(benchSummary(bench.record)) + '\n' : '') +
    notes.map(n => 'Note: ' + n + '\n').join('') + (version ? 'Work toward the next baseline of ' +
    architectureName(index, design) + ' is ' + version.major + '.' + (version.minor + 1) + ', staged as drafts until it is accepted. A different architecture is ' +
    (latest + 1) + '.0 with its own name.\n' : '') + onPush + '\n'};
}

/**
 * Mark an in-progress design superseded: one that a newer design replaced before it was accepted. It keeps its
 * files and its record in the index.
 */
export function supersede({project, design, by, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(index.designs.includes(design), 'Unknown design: ' + design);
  check(index.designStatus[design] === 'in-progress', sentence(described(index, design)) + ' is ' + index.designStatus[design] + '. Only an in-progress design is marked superseded here; ' +
    'an effective one is superseded when the next design becomes effective');
  check(by === undefined || by !== design && index.designs.includes(by), '--by names another listed design');
  index.designStatus[design] = 'superseded';
  if (by) index.supersededBy = {...index.supersededBy, [design]: by};
  return saveIndex(at, index);
}

/** The last commit that changed these files or folders, where they can still be read. Null outside Git or before they are committed. */
export function lastCommitOf(project, ...paths) {
  try {
    return execFileSync('git', ['-C', project, 'log', '-1', '--format=%H', '--', ...paths.map(p => path.relative(project, p).split(path.sep).join('/'))],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null;
  } catch { return null; }
}

/**
 * Withdraw a design: a status change. The index keeps the reason and the last commit that held the design's
 * published files, and the files leave the site. Nothing is archived on the site; Git keeps them.
 *
 * A model published before the index existed has no entry. Name its published files with `files`, a comma-separated
 * list of project-relative paths: they are removed and the design is listed as withdrawn.
 */
export function withdraw({project, design, reason, files, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at), listed = index.designs.includes(design);
  check(designId.test(design ?? ''), useVersion);
  check(listed || named(files), 'Design ' + design + ' is not in the index. For a model published before the index, name its published files with --files');
  check(listed !== named(files), '--files applies to a model the index does not list yet');
  check(named(reason), 'Give the reason with --reason');
  check(index.designStatus[design] !== 'withdrawn', 'Design ' + design + ' is already withdrawn');
  const published = listed ? [path.join(at.tree, 'designs', design)] : files.split(',').map(name => {
    const full = path.resolve(project, name.trim()), rel = path.relative(project, full);
    check(rel && !rel.startsWith('..') && !path.isAbsolute(rel) && existsSync(full), 'No published file at ' + name.trim());
    return full;
  });
  const present = published.filter(p => existsSync(p)), commit = present.length ? lastCommitOf(project, ...present) : null;
  for (const item of published) rmSync(item, {recursive: true, force: true});
  if (!listed) index.designs.unshift(design);
  if (index.supersededBy) delete index.supersededBy[design];
  index.designStatus[design] = 'withdrawn';
  index.reason = {...index.reason, [design]: reason};
  if (commit) index.lastCommit = {...index.lastCommit, [design]: commit};
  return saveIndex(at, index);
}

/**
 * Copy a design's check inputs to a new design folder and write its pins for the new paths.
 *
 * A record can pin a file by path and SHA-256, and a design checked from the repository root names its own folder in
 * those paths. Each such pin is verified against the source, written with the new path and given the digest of the
 * copied file. The STEP and every other file that is not a pinning record keep their bytes. The review page, scene
 * and receipt are not copied: the layout check writes them for the new folder. A held receipt is copied unchanged.
 */
export function copyInputs({project, from, to, ...folders}) {
  const at = layout(project, folders);
  check(designId.test(from ?? '') && designId.test(to ?? ''), 'Supply --from and --to, two design IDs. ' + useVersion);
  const source = path.join(at.inputs, from), target = path.join(at.inputs, to), posix = full => path.relative(project, full).split(path.sep).join('/');
  check(existsSync(path.join(source, 'layout.json')), 'No layout plan at ' + posix(path.join(source, 'layout.json')));
  check(!existsSync(target), posix(target) + ' already exists. Choose a new design ID, or remove that folder first');
  const before = posix(source) + '/', after = posix(target) + '/', digest = file => sha(readFileSync(file));
  const isFile = file => statSync(file, {throwIfNoEntry: false})?.isFile() ?? false;
  const plan = readJson(path.join(source, 'layout.json')), view = named(plan.view) ? (plan.view.startsWith(before) ? plan.view.slice(before.length) : plan.view) : null;
  const left = new Set(['receipt.json', ...(view ? [view, path.posix.join(path.posix.dirname(view), 'review-scene.json.gz')] : [])]);
  const done = new Set(), rewritten = [], copied = [];
  const repin = name => {
    // Rewrite the pins in one copied record, after the records it pins.
    if (done.has(name) || !name.endsWith('.json')) return;
    done.add(name);
    let data;
    try { data = JSON.parse(readFileSync(path.join(target, name), 'utf8').replace(/^\uFEFF/, '')); } catch { return; }
    if (data?.schema === receiptSchema) return;
    const was = JSON.stringify(data);
    (function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node === null || typeof node !== 'object') return;
      if (typeof node.file === 'string' && node.file.startsWith(before)) {
        const inner = node.file.slice(before.length), pinned = typeof node.sha256 === 'string';
        check(!pinned || isFile(path.join(source, inner)) && digest(path.join(source, inner)) === node.sha256,
          before + name + ' pins ' + node.file + ', which is missing or differs from its pinned SHA-256. Resolve it in design ' + from + ' before copying');
        repin(inner);
        node.file = after + inner;
        if (pinned && isFile(path.join(target, inner))) node.sha256 = digest(path.join(target, inner));
      }
      Object.values(node).forEach(walk);
    })(data);
    if (typeof data?.view === 'string' && data.view.startsWith(before)) data.view = after + data.view.slice(before.length);
    if (JSON.stringify(data) !== was) { writeFileSync(path.join(target, name), JSON.stringify(data, null, 2) + '\n'); rewritten.push(name); }
  };
  try {
    (function copy(folder, prefix) {
      for (const item of readdirSync(folder, {withFileTypes: true})) {
        const name = prefix + item.name;
        if (item.name === '__pycache__' || left.has(name)) continue;
        if (item.isDirectory()) copy(path.join(folder, item.name), name + '/');
        else if (item.isFile()) { mkdirSync(path.dirname(path.join(target, name)), {recursive: true}); cpSync(path.join(folder, item.name), path.join(target, name)); copied.push(name); }
      }
    })(source, '');
    for (const name of copied.sort()) repin(name);
  } catch (error) { rmSync(target, {recursive: true, force: true}); throw error; }
  return {from, to, inputs: after.slice(0, -1), files: copied.length, rewritten: rewritten.sort(),
    report: 'Copied the inputs of design ' + from + ' to ' + after.slice(0, -1) + ' and wrote ' + rewritten.length + ' pinning record' + (rewritten.length === 1 ? '' : 's') +
      ' for the new paths. The STEP is unchanged. Now run the layout check there, then stage ' + to + ':\n' +
      '  node PLUGIN/scripts/design.mjs preliminary-check . ' + after + 'layout.json --write-view --require-checked --output ' + after + 'receipt.json\n'};
}

/**
 * Take a design out of the index and delete its published folder and its inputs folder. No redirect is left.
 *
 * This is the last step of renaming a design: the same design is first rebuilt, checked and staged under its new ID.
 * A design that is or was effective is removed only when `replacedBy` names the effective design of the same STEP.
 */
export function remove({project, design, replacedBy, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(index.designs.includes(design), 'Unknown design: ' + design);
  check(replacedBy === undefined || replacedBy !== design && index.designs.includes(replacedBy), '--replaced-by names a listed design other than the one removed');
  const gone = described(index, design), accepted = index.accepted?.[design], wasEffective = index.designStatus[design] === 'effective' || !!accepted ||
    index.designStatus[design] === 'superseded' && existsSync(path.join(at.tree, 'designs', design, 'readiness.json'));
  if (wasEffective) {
    check(replacedBy, sentence(gone) + ' is or was the effective design. Remove it only to rename it: stage the same design under its new ID, mark that design effective, ' +
      'then run remove --design ' + design + ' --replaced-by NEW');
    check(index.designStatus[replacedBy] === 'effective', 'Design ' + replacedBy + ' is ' + index.designStatus[replacedBy] + '. Mark it effective before it replaces ' + design);
    const step = id => { try { return readJson(path.join(at.tree, 'designs', id, 'design.json')).fusion?.stepSha256 ?? null; } catch { return null; } };
    check(step(design) && step(design) === step(replacedBy), 'Designs ' + design + ' and ' + replacedBy + ' are of different STEP files, or a design record is missing. ' +
      'A rename keeps the design; a changed design is a new version and the earlier one stays as superseded');
    // The design was accepted on the earlier date; the rename does not move it.
    if (accepted) index.accepted[replacedBy] = [accepted, index.accepted[replacedBy] ?? accepted].sort()[0];
  }
  const folderList = [path.join(at.tree, 'designs', design), path.join(at.inputs, design)];
  for (const folder of folderList) rmSync(folder, {recursive: true, force: true});
  index.designs = index.designs.filter(id => id !== design);
  for (const key of ['designStatus', ...perDesign]) if (index[key]) delete index[key][design];
  for (const [id, by] of Object.entries(index.supersededBy ?? {})) if (by === design) { if (replacedBy && id !== replacedBy) index.supersededBy[id] = replacedBy; else delete index.supersededBy[id]; }
  const saved = saveIndex(at, index);
  return {...saved, report: 'Removed ' + gone + (replacedBy ? ', replaced by ' + described(index, replacedBy) : '') + '. Its folders ' +
    folderList.map(f => path.relative(project, f).split(path.sep).join('/')).join(' and ') + ' are deleted and no redirect is left: a link to designs/' + design +
    '/ no longer opens. The catalog opens ' + saved.current + '\n'};
}

/** Recompute the primary view and write the stock catalog page when the tree has none. */
export function refresh({project, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(index.designs.every(id => designStatuses.includes(index.designStatus[id])), 'Each design needs a designStatus (' + designStatuses.join(', ') + ')');
  return saveIndex(at, index);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, project, ...rest] = process.argv.slice(2), options = {};
    for (let i = 0; i < rest.length; i += 2) {
      check(rest[i]?.startsWith('--') && rest[i + 1] !== undefined, 'Expected --option value pairs');
      options[rest[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rest[i + 1];
    }
    for (const name of ['budgetMinutes', 'jobs']) if (options[name] !== undefined) options[name] = Number(options[name]);
    // --check MODULE is for the plugin's own tests: the default export of the module stands in for the layout check.
    if (options.check) { options.run = (await import(pathToFileURL(path.resolve(options.check)).href)).default; delete options.check; }
    if (mode === 'effective') console.error('[gate] Running the full layout check on the committed design. Guideline: about 15 minutes.');
    check(project && statSync(project, {throwIfNoEntry: false})?.isDirectory(), 'Supply the project folder');
    options.project = path.resolve(project);
    const command = {stage: stageInProgress, effective: markEffective, relink, supersede, withdraw, refresh, 'copy-inputs': copyInputs, remove}[mode];
    check(command, 'Unknown command');
    const {report, ...index} = command(options);
    if (report) console.error(report);
    console.log(JSON.stringify(index, null, 2));
  } catch (error) {
    console.error(error.message + '\nUsage: detailed-design-release.mjs stage PROJECT --design MAJOR.MINOR [--design-name "NAME"] --inputs FOLDER --preliminary RELEASE --authority REGISTER --lineage LINEAGE' +
      ' | relink PROJECT --design ID --preliminary RELEASE | effective PROJECT --design ID --readiness REVIEW_RESULT.json [--design-name "NAME"] [--bench-tests FILE] [--budget-minutes 45] [--jobs N]' +
      ' | supersede PROJECT --design ID [--by ID] | withdraw PROJECT --design ID --reason TEXT [--files PATH,PATH] | copy-inputs PROJECT --from ID --to ID' +
      ' | remove PROJECT --design ID [--replaced-by ID] | refresh PROJECT' +
      '   [--site docs] [--detailed detailed-design] [--preliminary-tree preliminary-design] [--detailed-inputs cad/detailed-design/designs]');
    process.exitCode = 1;
  }
}
