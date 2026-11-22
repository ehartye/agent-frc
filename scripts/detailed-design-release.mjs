#!/usr/bin/env node
/**
 * Publish a detailed design into the season site, or change its design status.
 *
 * These commands only write files: a design directory, the status index and the stock catalog page. The project's
 * Design publication workflow decides whether the result may merge (design-publication.mjs check).
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

import {writeDirectoryAtomic, writeFileAtomic} from './atomic-write.mjs';
import {designStatuses} from './design-status.mjs';
import {checkProject, primaryView, readinessSummary} from './design-publication.mjs';

export const designSchema = 'agent-frc/detailed-design@1';
export const indexSchema = 'agent-frc/detailed-design-index@1';
const readinessSchema = 'agent-frc/mechanical-readiness-result@1';
const designId = /^[a-z0-9][a-z0-9-]{0,63}$/;
const catalog = new URL('../templates/detailed-design-index.html', import.meta.url);
const perDesign = ['supersededBy', 'reason', 'lastCommit', 'preliminary'];

function check(ok, message) { if (!ok) throw Error(message); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const named = v => typeof v === 'string' && v.trim().length > 0;
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { throw Error('Unreadable ' + file); } };

/** The folders of one project. `site` holds the published trees. */
function layout(project, {site = 'docs', detailed = 'detailed-design', preliminaryTree: preliminary = 'preliminary-design'} = {}) {
  const tree = path.join(project, site, detailed);
  return {project, site, detailed, preliminary, tree, indexFile: path.join(tree, 'designs.json'),
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
  for (const key of perDesign) {
    const rows = Object.entries(index[key] ?? {}).filter(([id]) => index.designs.includes(id));
    if (rows.length) out[key] = Object.fromEntries(rows);
  }
  mkdirSync(at.tree, {recursive: true});
  writeFileAtomic(at.indexFile, JSON.stringify(out, null, 2) + '\n');
  if (!existsSync(path.join(at.tree, 'index.html'))) writeFileAtomic(path.join(at.tree, 'index.html'), readFileSync(catalog));
  return out;
}
/** Run the publication check without the rerun and return what it says about this design or the detailed index. */
function problems(at, design) {
  const result = checkProject(at.project, {site: at.site, detailed: at.detailed, preliminary: at.preliminary, skipRerun: true, log: () => {}});
  return result.errors.filter(e => e.startsWith('Detailed design ' + design + ' ') || e.startsWith('Detailed design ' + design + ':'));
}

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
export function stageInProgress({project, design, inputs, preliminary, authority, lineage, python, replay: replayExport = fusionExport, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(designId.test(design ?? ''), 'Use a lowercase design ID with letters, digits and hyphens');
  check(named(inputs) && named(preliminary) && named(authority) && named(lineage), 'Supply --inputs, --preliminary, --authority and --lineage');
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
  const dir = path.join(at.tree, 'designs', design), replaced = existsSync(dir), before = existsSync(at.indexFile) ? readFileSync(at.indexFile) : null;
  check(!replaced || index.designStatus[design] === 'in-progress', 'Design ' + design + ' is ' + index.designStatus[design] + '; choose a new ID');
  const backup = replaced ? dir + '.replaced' : null;
  if (replaced) { rmSync(backup, {recursive: true, force: true}); cpSync(dir, backup, {recursive: true}); rmSync(dir, {recursive: true}); }
  mkdirSync(path.dirname(dir), {recursive: true});
  // The design directory appears complete or not at all.
  writeDirectoryAtomic(dir, temp => { for (const [name, bytes] of out) { mkdirSync(path.dirname(path.join(temp, name)), {recursive: true}); writeFileSync(path.join(temp, name), bytes); } });
  if (!index.designs.includes(design)) index.designs.push(design);
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
  return saved;
}

/**
 * Mark a design effective and commit its mechanical-readiness review result beside it. The design that was
 * effective becomes superseded. A design not yet published gets a record from the review. A review that does not
 * pass is refused. The report goes to the reviewer of the pull request, who accepts the design by merging it.
 */
export function markEffective({project, design, readiness, ...folders}) {
  const at = layout(project, folders), index = loadIndex(at);
  check(designId.test(design ?? '') && named(readiness), 'Supply --design and --readiness, the mechanical-readiness review result');
  const review = readJson(path.resolve(project, readiness));
  check(review.schema === readinessSchema && named(review.stepSha256), 'The readiness file is not a mechanical-readiness review result');
  check(review.showcaseEligibility === 'pass', 'Design ' + design + ' cannot be effective: its mechanical-readiness review reports ' + review.showcaseEligibility + '\n' + readinessSummary(review));
  const dir = path.join(at.tree, 'designs', design), recordFile = path.join(dir, 'design.json');
  check(!index.designs.includes(design) || index.designStatus[design] === 'in-progress', 'Only a new or in-progress design can become effective: ' + design);
  if (!existsSync(recordFile)) {
    mkdirSync(dir, {recursive: true});
    writeFileAtomic(recordFile, JSON.stringify({schema: designSchema, design,
      fusion: {archiveSha256: review.archiveSha256, stepSha256: review.stepSha256, configuration: review.configuration}}, null, 2) + '\n');
  }
  check(readJson(recordFile).fusion?.stepSha256 === review.stepSha256, 'The readiness review is of a different STEP than design ' + design + ' names');
  writeFileAtomic(path.join(dir, 'readiness.json'), JSON.stringify(review, null, 2) + '\n');
  if (!index.designs.includes(design)) index.designs.push(design);
  for (const id of index.designs) if (index.designStatus[id] === 'effective') {
    index.designStatus[id] = 'superseded';
    index.supersededBy = {...index.supersededBy, [id]: design};
  }
  index.designStatus[design] = 'effective';
  return {...saveIndex(at, index), report: readinessSummary(review)};
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
  check(designId.test(design ?? ''), 'Use a lowercase design ID with letters, digits and hyphens');
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
    check(project && statSync(project, {throwIfNoEntry: false})?.isDirectory(), 'Supply the project folder');
    options.project = path.resolve(project);
    const command = {stage: stageInProgress, effective: markEffective, withdraw, refresh}[mode];
    check(command, 'Unknown command');
    const {report, ...index} = command(options);
    if (report) console.error(report);
    console.log(JSON.stringify(index, null, 2));
  } catch (error) {
    console.error(error.message + '\nUsage: detailed-design-release.mjs stage PROJECT --design ID --inputs FOLDER --preliminary RELEASE --authority REGISTER --lineage LINEAGE' +
      ' | effective PROJECT --design ID --readiness REVIEW_RESULT.json | withdraw PROJECT --design ID --reason TEXT [--files PATH,PATH] | refresh PROJECT' +
      '   [--site docs] [--detailed detailed-design] [--preliminary-tree preliminary-design]');
    process.exitCode = 1;
  }
}
