#!/usr/bin/env node
/**
 * Check what a project publishes about its designs. The coding agent runs this before pushing; it is a tool of the
 * agent and no part of the project's CI. It measures nothing and runs no trial:
 *
 *   1. Every in-progress design is judged on its committed records (layout_check.py --judge-only): they are current and
 *      judge it layout-checked. Every effective design is read from its gate record instead.
 *   2. The published files of a design are its committed ones, its review scene was built from them and repeats the
 *      verdict, and the stock page can play it.
 *   3. A mission phase is played, and each mission case serves a represented objective.
 *   4. An in-progress detailed design names an effective preliminary release that carries its gate record, judges the
 *      motions, cycle and displaced control of that release, and is on the Fusion export.
 *   5. An effective detailed design carries its bench-test record: every before-build test has a passing result and
 *      every on-robot test has an owner and a plan.
 *   6. One status index per phase, with at most one effective design and the primary view computed from it. A
 *      design whose ID is a version, MAJOR.MINOR, belongs to an architecture the index names, and a detailed version
 *      keeps the major number of the preliminary design it is built on.
 *   7. An effective design carries the record of its stage gate (stage-gate.mjs), which the command that marks it
 *      effective writes, and every file that record judged is unchanged: the source, the parts it places, the judgement
 *      with the requirements and premises it reads, and each record. A rebuilt page and its page file pass.
 *   8. A design that was effective on the default branch of the remote keeps the gate record it became effective on. A
 *      changed design belongs to the next minor version, opened as a draft.
 *   9. No tracked file holds a personal machine path or a credential, and the project carries no plugin file.
 *
 * Only the designs the change touches are checked against 1 to 3, 7 and 8. A design is touched when a file in its own
 * published or input folder changed since the base commit, or when the change makes it effective. A change to its index
 * entry alone, such as superseding it, does not touch it: it stands on its published files, as it was accepted, in
 * whatever format it was published. Without a base commit every design is checked.
 *
 * It also lists, as advice that blocks nothing, the published files that no page, index or listed design leads to:
 * publishing the folder puts them online with the rest.
 *
 * A detailed design whose mechanical-readiness review does not pass cannot be effective. A withdrawn design is a
 * status with a reason; its files may leave the site. The check reads data only: it never inspects page markup.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {architectureName, currentFor, designName, designStatuses, designTitle, detailedTitle, releaseId, stateOf, statusOf, versionOf} from './design-status.mjs';
import {effectiveReadiness, judgedVerdict} from './effective-readiness.mjs';
import {builtFromOthers, compareWithVerdict, readScene, validateScene} from './review-scene.mjs';
import {contentSha, filesProblem, gateDifferences, gateFile, gateText, isGateOf, readGate} from './gate-record.mjs';
import {scanTree} from '../templates/project-ci/scan.mjs';
import {unlinkedAdvice} from './published-content.mjs';
import {benchFile, effectiveProblems, handedOver, summary as benchSummary, summaryText as benchText} from './bench-tests.mjs';

const judgementFile = 'judgement.json', releaseSchema = 'agent-frc/preliminary-release@2';
const readinessSchema = 'agent-frc/mechanical-readiness-result@1';
const accomplishments = ['acquired', 'delivered', 'scored', 'climb-held'];
const sceneFile = 'review-scene.json.gz';
export const pluginVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const named = v => typeof v === 'string' && v.trim().length > 0;
const list = v => Array.isArray(v) ? v : [];
function check(ok, message) { if (!ok) throw Error(message); }
function parse(bytes, what) {
  try { return JSON.parse(bytes.toString('utf8').replace(/^﻿/, '')); } catch { throw Error('Unreadable ' + what); }
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
/** The name a design's source is published under: a detailed design's own record takes design.json. */
const publishedTop = phase => phase === 'detailed-design' ? 'source.json' : null;

/**
 * The published files of a design are its committed ones, byte for byte: each source file, the judgement file, its page
 * file and each record judged. `files` names them, from the verdict or the gate record. Throws, naming the first that
 * differs, and refuses a published record the judged design does not hold.
 */
export function checkPublished(where, {root, folder, published, phase, files}) {
  const inputs = path.join(root, folder), page = parse(readFileSync(path.join(inputs, judgementFile)), 'judgement file of ' + where).page?.file;
  const top = Object.keys(files.source)[0], copies = [...Object.keys(files.source), folder + '/' + judgementFile, ...(named(page) ? [page] : []), ...Object.keys(files.records)];
  const name = file => file === top && publishedTop(phase) ? publishedTop(phase) : path.posix.relative(folder, file), expected = new Set(copies.map(name));
  for (const file of copies) {
    const copy = path.join(published, name(file)), own = path.join(root, file);
    check(existsSync(own), where + ': ' + file + ' is not committed');
    check(existsSync(copy), where + ': the published ' + name(file) + ' is missing. Stage it again');
    check(readFileSync(copy).equals(readFileSync(own)), where + ': the published ' + name(file) + ' is not the committed ' + file + '. Stage it again');
  }
  const records = [...new Set(Object.keys(files.records).map(name).filter(file => file.includes('/')).map(file => file.split('/')[0]))];
  for (const found of records.flatMap(dir => namesUnder(path.join(published, dir)).map(item => dir + '/' + item)))
    check(expected.has(found), where + ': the published ' + found + ' is not a file of the committed design. Stage it again');
  check(existsSync(path.join(published, 'index.html')), where + ' has no review page (index.html). Stage it again');
}

/**
 * The published review scene: the stock page can play it, it was built from the judged source and records, and it
 * repeats the verdict. An effective design has no verdict but its gate record's: its scene claims nothing else.
 */
export function checkScene(where, {root, published, files, verdict}) {
  const file = path.join(published, sceneFile);
  check(existsSync(file), where + ' has no ' + sceneFile + ': build the page with design preliminary-page and stage it');
  let scene;
  try { ({scene} = readScene(readFileSync(file))); } catch { throw Error(where + ': unreadable ' + sceneFile); }
  const {errors} = validateScene(scene), again = '. Build the page again with design preliminary-page and stage it';
  check(!errors.length, where + ': the review page cannot play its scene: ' + errors.slice(0, 5).join('; '));
  const differ = verdict ? compareWithVerdict(scene, verdict)
    : [...(scene.decision.status === 'layout-checked' && scene.decision.firstUnmet === null ? [] : ['Scene decision differs from the verdict']), ...builtFromOthers(scene, files)];
  check(!differ.length, where + ': the review scene does not repeat the verdict: ' + differ.join('; ') + again);
  check(scene.sources.design.sha256 === digest(Buffer.concat(Object.keys(files.source).map(name => readFileSync(path.join(root, name))))),
    where + ': the review scene was built from another design source' + again);
  return scene;
}

/** A mission phase is played by a mission animation, and each mission case serves a represented objective of the narrative. */
export function checkMission(where, scene, judgement) {
  const status = new Map(scene.cases.filter(c => c.kind !== 'displaced control').map(c => [c.id, c]));
  const cycle = new Set(list(judgement.cycle).filter(e => object(e) && e.phase !== 'park' && e.phase !== 'service').flatMap(e => list(e.motions)));
  check(scene.animations.some(a => a.mission === true && a.cases.some(id => cycle.has(id) && status.get(id)?.purpose === 'operating' && status.get(id).status === 'pass')),
    where + ' plays no mission phase: no mission animation of its review plays a passing operating motion of its cycle');
  const represented = new Set(list(judgement.narrative?.objectives).filter(o => o?.disposition === 'represented').map(o => o.objective));
  for (const m of list(judgement.missionCases)) {
    check(represented.has(m?.objective), where + ' mission case ' + m?.name + ' must serve a represented narrative objective');
    check(accomplishments.includes(m.accomplishes), where + ' mission case ' + m.name + ' accomplishes one of ' + accomplishments.join(', '));
  }
}

/**
 * Judge a design on its committed records and check what it publishes. `judge` measures nothing: it refuses a record that
 * is stale or missing. Returns the verdict.
 */
function checkJudged(where, {root, folder, published, phase, judge}) {
  const judgement = path.join(root, folder, judgementFile);
  check(existsSync(judgement), where + ': commit its check inputs at ' + folder + ' (' + judgementFile + ' and every file it names)');
  const verdict = judge(root, judgement);
  check(!verdict.reason, where + ': ' + verdict.reason);
  check(verdict.status === 'layout-checked', where + ' needs a layout-checked design; its records judge it ' + verdict.status + ': ' + (verdict.firstUnmet?.text ?? 'no reason given'));
  const outside = filesProblem(verdict.files, folder);
  check(!outside, where + ': ' + outside);
  checkPublished(where, {root, folder, published, phase, files: verdict.files});
  checkMission(where, checkScene(where, {root, published, files: verdict.files, verdict}), parse(readFileSync(judgement), 'judgement file of ' + where));
  return verdict;
}

/** What to say when a file the gate of an effective design judged has changed. */
export const frozenText = (title, differ) => title + ' is effective, and what its stage gate judged has changed: ' + differ.slice(0, 6).join('; ') + (differ.length > 6 ? '; and ' + (differ.length - 6) + ' more' : '');

/**
 * An effective design, read from its gate record: the record is the passing gate of this design and every file it judged
 * is unchanged; the published files are those and the scene was built from them. Returns the gate record.
 */
function checkEffective(where, {root, folder, published, phase, id, command, rel}) {
  const gate = readGate(published), version = versionOf(id);
  check(isGateOf(gate, {phase, id, inputs: folder}), where + ' is marked effective without a stage gate of this design. ' +
    'Mark it effective with the plugin\'s command, which judges the committed design and writes ' + rel(path.join(published, gateFile)) + ': ' + command(id));
  const differ = gateDifferences(root, gate);
  check(!differ.length, frozenText(where, differ) + inPlace(version));
  checkPublished(where, {root, folder, published, phase, files: gate.files});
  checkMission(where, checkScene(where, {root, published, files: gate.files}), parse(readFileSync(path.join(root, folder, judgementFile)), 'judgement file of ' + where));
  return gate;
}
const inPlace = version => '. An effective design does not change in place. Open ' + version.major + '.' + (version.minor + 1) +
  ' as a draft and make the change there. A rebuilt page and its page file pass.';

/** Whether a design judges what another does: the motions of each phase of its cycle, in order, and the displaced control. */
function coversLayout(mine, basis) {
  const phase = (judgement, name) => list(judgement.cycle).find(e => e?.phase === name);
  return list(basis.cycle).every(entry => {
    const motions = list(entry?.motions), own = list(phase(mine, entry?.phase)?.motions).filter(m => motions.includes(m));
    return JSON.stringify(own) === JSON.stringify(motions);
  }) && mine.control?.motion === basis.control?.motion && mine.control?.displaced === basis.control?.displaced;
}

/**
 * The effective-readiness report of a preliminary release: its committed judgement file and the verdict on its committed
 * records, judged now unless given. `inputs` is a folder; `design` titles the report.
 */
export function releaseReadiness(root, inputs, design, verdict) {
  return effectiveReadiness(root, {plan: path.relative(root, path.join(inputs, judgementFile)).split(path.sep).join('/'), design, ...(verdict ? {verdict} : {})});
}

/** The criteria a readiness report does not meet, each with its reasons, in one sentence; empty when it meets them all. */
export const unmetCriteria = report => report.criteria.filter(c => !c.met).map(c => c.title + ' (' + c.reasons.join('; ') + ')').join('; ');

/**
 * The files a change touches, by project-relative path: changed since the base commit, staged or not, and untracked.
 * Null without a usable base: then every release counts as touched.
 */
function changedSince(root, base) {
  try {
    const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 1024});
    return [...git('diff', '--name-only', '--no-renames', '--relative', '-z', base, '--').split('\0'),
      ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean);
  } catch { return null; }
}

/** What a reviewer needs from a mechanical-readiness review result: its verdicts and the findings that do not pass. */
export function readinessSummary(review) {
  const open = list(review.findings).filter(f => f?.status !== 'pass' && f?.status !== 'closed');
  return ['Mechanical-readiness review of ' + (review.configuration ?? 'the design'), 'Build readiness: ' + review.buildReadiness,
    'Showcase eligibility: ' + review.showcaseEligibility, 'Findings not passing: ' + open.length,
    ...open.slice(0, 20).map(f => '  - ' + [f.domain, f.subject, f.status, f.reason].filter(named).join(': '))].join('\n') + '\n';
}

/** How the check names a detailed design in its messages: by name and version. */
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
const folders = dir => existsSync(dir) ? readdirSync(dir, {withFileTypes: true}).filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name) : [];
function inside(root, name, what) {
  check(named(name) && !path.isAbsolute(name), what + ' must be a project-relative path');
  const full = path.resolve(root, name), rel = path.relative(root, full);
  check(!rel.startsWith('..') && !path.isAbsolute(rel), what + ' must stay inside the project');
  return full;
}

/**
 * Check a project. Options: site, preliminary, detailed (site folders), inputs, detailedInputs (folders of committed
 * check inputs, one per design ID), base (the commit to compare with; by default where this branch left the default
 * branch of the remote, as last fetched), touches (which folders count as touched, given them), judge (the layout
 * judgement on committed records), scan (false skips the path and secret scan), log (progress lines).
 * Returns {preliminary, detailed, designs, comparedWith, seconds, warnings, reports, errors}; errors is empty when the
 * project passes. designs says in words what was checked for each live design, and seconds what judging took.
 */
export function checkProject(root, options = {}) {
  const o = {site: 'docs', preliminary: 'preliminary-design', detailed: 'detailed-design', inputs: 'cad/preliminary-design/releases',
    detailedInputs: 'cad/detailed-design/designs', judge: judgedVerdict, scan: true, log: line => console.error(line), ...options};
  const began = Date.now(), errors = [], warnings = [], reports = [], designs = [], seconds = {total: 0, judging: 0, status: 0};
  const attempt = (what, body) => { try { return body(); } catch (error) { errors.push(error.message); return undefined; } };
  const compared = o.base === undefined ? remoteBase(root) : o.base ? {commit: o.base, name: o.base} : null, base = baseReader(root, compared?.commit), since = compared?.name;
  const rel = full => path.relative(root, full).split(path.sep).join('/');
  // A design is touched when a file in one of its own folders changed. Its index entry is not one of them.
  const changed = base ? changedSince(root, compared.commit) : null;
  const touches = o.touches ?? ((...dirs) => changed === null || changed.some(file => dirs.some(dir => file === dir || file.startsWith(dir + '/'))));
  // A project file as it was at the base commit, parsed; null when it was not there.
  const before = name => { try { return parse(base.at(name), name + ' at the base commit'); } catch { return null; } };
  // The design that was effective at the base commit, from an index.
  const earlier = indexFile => Object.entries((base && before(rel(indexFile)))?.designStatus ?? {}).find(([, status]) => status === 'effective')?.[0] ?? null;
  // A withdrawn design keeps its reason in the index. Its files may be gone; Git has them at the recorded commit.
  const withdrawnNote = (where, index, id) => { if (!named(index.reason?.[id])) warnings.push(where + ' is withdrawn without a reason in the index'); };
  // Where a design's check inputs are committed: the folder its record names under check.project, else the folder for its ID.
  const inputsOf = (where, record, fallback) => rel(inside(root, record?.check?.project ?? fallback, where + ': check.project'));
  const note = (where, status, text) => { designs.push({design: where, status, note: text}); o.log('[publication] ' + where + ': ' + text); };
  const seconds1 = value => value.toFixed(1) + ' s';
  /** Judge a touched draft and say what it took. Returns the verdict. */
  const draft = (where, at) => {
    const verdict = checkJudged(where, {...at, root, judge: o.judge});
    seconds.judging += verdict.seconds.total;
    seconds.status += verdict.seconds.status;
    note(where, 'in-progress', 'draft, judged layout-checked on its committed records in ' + seconds1(verdict.seconds.total) + ' (status ' + seconds1(verdict.seconds.status) + ' of it).');
    return verdict;
  };
  /** Hold a touched effective design to its gate record. `was` is the design that was effective at the base commit. Returns the record. */
  const effective = (where, at, was) => {
    const gate = checkEffective(where, {...at, root, rel});
    if (base && was === at.id) {
      const accepted = before(rel(path.join(at.published, gateFile)));
      check(JSON.stringify(accepted?.files ?? null) === JSON.stringify(gate.files), where + ' is effective, and its gate record is not the one it became effective on' + inPlace(versionOf(at.id)));
    }
    reports.push({title: where + ' (effective)', text: gateText(gate)});
    note(where, 'effective', base && was !== at.id ? 'becoming effective. Its stage gate record matches the committed files.'
      : 'effective, its files as its stage gate judged them on ' + gate.date + '.' + (base ? '' : ' No default branch of the remote to compare with.'));
    return gate;
  };
  const untouched = (where, status) => note(where, status, status === 'effective' ? 'effective, untouched since ' + since + '.' : 'draft, untouched by this change, so it was not judged.');

  // Preliminary design releases.
  const prelimTree = path.join(root, o.site, o.preliminary), prelimIndexFile = path.join(prelimTree, 'releases.json');
  let preliminary = null, prelimStatus = () => null;
  if (existsSync(prelimIndexFile)) attempt('preliminary index', () => {
    const index = parse(readFileSync(prelimIndexFile), 'preliminary release index'), ids = index?.releases;
    check(object(index) && Array.isArray(ids) && ids.every(i => releaseId.test(i ?? '')) && new Set(ids).size === ids.length,
      'The preliminary release index needs a list of unique release IDs, each a version MAJOR.MINOR');
    // The architecture each major number stands for. A version whose architecture has no name cannot be titled.
    check(index.designs === undefined || object(index.designs) && Object.entries(index.designs).every(([major, d]) => /^[1-9][0-9]{0,3}$/.test(major) && object(d) && named(d.name)),
      'designs maps each major number to its architecture name, as in {"1": {"name": "NAME"}}');
    for (const major of new Set(ids.map(i => versionOf(i).major)))
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
    for (const id of ids.filter(i => status(i) === 'in-progress')) drafting.set(versionOf(id).major, [...(drafting.get(versionOf(id).major) ?? []), id]);
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
        const where = 'Preliminary design ' + designTitle(index, id), dir = path.join(prelimTree, 'releases', id), record = records.get(id);
        // A release the change leaves alone stands on its published files: none is read again, in whatever format it was published.
        const was = earlier(prelimIndexFile), becoming = entry.status === 'effective' && was !== id, folder = inputsOf(where, record, path.posix.join(o.inputs, id));
        if (!becoming && !touches(rel(dir), folder)) return untouched(where, entry.status);
        check(record, where + ' needs its release record (release.json)');
        check(record.schema === releaseSchema, where + ' was published in an earlier format (' + record.schema + '), which this check does not read. Convert its inputs and stage it, or leave its files as they are');
        check(record.release === id, where + ': its release record names ' + record.release);
        const at = {folder, published: dir, phase: 'preliminary-design', id, command: release => 'python PLUGIN/scripts/stage_preliminary_review.py --set-status ' + release + ' effective'};
        if (entry.status === 'effective') effective(where, at, was); else draft(where, at);
      });
    }
  });

  // Detailed designs.
  // The judgement of a preliminary release a design is built on: handed on only with the gate record of its committed design.
  const handedOn = (where, release) => {
    const dir = path.join(prelimTree, 'releases', release), recordFile = path.join(dir, 'release.json'), judgement = path.join(dir, judgementFile);
    const folder = inputsOf(where, existsSync(recordFile) ? parse(readFileSync(recordFile), 'release record: ' + release) : null, path.posix.join(o.inputs, release)), gate = readGate(dir);
    check(isGateOf(gate, {phase: 'preliminary-design', id: release, inputs: folder}) && existsSync(judgement) && contentSha(readFileSync(judgement)) === gate.files.judgement[folder + '/' + judgementFile],
      where + ' is built on preliminary release ' + release + ', which carries no stage gate record of its committed design. Mark that release effective with the plugin\'s command');
    return parse(readFileSync(judgement), 'judgement file of preliminary release ' + release);
  };
  const detailTree = path.join(root, o.site, o.detailed), detailIndexFile = path.join(detailTree, 'designs.json');
  let detailed = null;
  if (existsSync(detailIndexFile)) attempt('detailed index', () => {
    const index = parse(readFileSync(detailIndexFile), 'detailed design index'), ids = index?.designs;
    check(object(index) && index.schema === 'agent-frc/detailed-design-index@1' && Array.isArray(ids) && ids.every(i => releaseId.test(i ?? '')) &&
      new Set(ids).size === ids.length && object(index.designStatus) && ids.every(i => designStatuses.includes(index.designStatus[i])),
      'The detailed design index needs unique design IDs (each a version MAJOR.MINOR), each with a designStatus (' + designStatuses.join(', ') + ')');
    // The architecture each major number stands for: the same name as its preliminary design.
    check(index.architectures === undefined || object(index.architectures) && Object.entries(index.architectures).every(([major, d]) => /^[1-9][0-9]{0,3}$/.test(major) && object(d) && named(d.name)),
      'architectures maps each major number to its architecture name, as in {"1": {"name": "NAME"}}');
    for (const major of new Set(ids.map(i => versionOf(i).major)))
      check(named(index.architectures?.[major]?.name), 'Detailed design ' + major + ' has no name: add architectures.' + major + '.name to the detailed design index, or stage a version with --design-name');
    check(ids.filter(i => index.designStatus[i] === 'effective').length <= 1, 'At most one detailed design is effective');
    // A draft takes no number, so one architecture holds one in-progress version.
    const drafting = new Map();
    for (const id of ids.filter(i => index.designStatus[i] === 'in-progress')) drafting.set(versionOf(id).major, [...(drafting.get(versionOf(id).major) ?? []), id]);
    for (const [major, several] of drafting) if (several.length > 1)
      warnings.push('Detailed design ' + index.architectures[major].name + ' has ' + several.length + ' in-progress versions (' + several.join(', ') + '). A draft takes no number: keep one, revise it in place and mark the others superseded.');
    const view = primaryView(index);
    check((index.current ?? null) === view.current && (index.beside ?? null) === view.beside,
      'The primary view is the effective detailed design, else the newest in-progress one: set current to ' + view.current + ' and beside to ' + view.beside);
    detailed = {...view, designs: []};
    const was = earlier(detailIndexFile), command = design => 'node PLUGIN/scripts/detailed-design-release.mjs effective . --design ' + design + ' --readiness REVIEW_RESULT.json';
    for (const id of ids) {
      const entry = {design: id, ...(architectureName(index, id) ? {title: detailedTitle(index, id), state: stateOf(index, id)} : {}), status: index.designStatus[id]};
      detailed.designs.push(entry);
      if (entry.status === 'withdrawn') withdrawnNote(detailedWhere(index, id), index, id);
      if (!['in-progress', 'effective'].includes(entry.status)) continue;
      attempt(id, () => {
        const where = detailedWhere(index, id), dir = path.join(detailTree, 'designs', id), has = name => existsSync(path.join(dir, name)), json = (name, what) => parse(readFileSync(path.join(dir, name)), what + ': ' + id);
        check(has('design.json'), where + ' needs its design record (designs/' + id + '/design.json)');
        const record = json('design.json', 'design record');
        check(record?.schema === 'agent-frc/detailed-design@1' && record.design === id, where + ': the design record names a different schema or design');
        const folder = inputsOf(where, record, path.posix.join(o.detailedInputs, id)), at = {folder, published: dir, phase: 'detailed-design', id, command};
        const touched = entry.status === 'effective' && was !== id || touches(rel(dir), folder);
        const onExport = files => check(Object.values(files.parts).includes(record.fusion?.stepSha256), where + ': the checked design source places no solid from the Fusion export the record names');
        if (entry.status === 'effective') {
          // Effective is the project's decision in a reviewed pull request. The readiness review is the evidence it
          // carries, and a review that does not pass cannot carry it.
          check(has('readiness.json'), where + ' is effective: commit its mechanical-readiness review result as designs/' + id + '/readiness.json');
          const review = json('readiness.json', 'readiness review');
          check(review?.schema === readinessSchema && named(review.stepSha256), where + ': readiness.json is not a mechanical-readiness review result');
          check(review.stepSha256 === record.fusion?.stepSha256, where + ': the readiness review is of a different STEP than the design record names');
          // Bench tests as records. The preliminary design's risk register says which tests were handed over.
          const link = record.preliminary?.release ?? index.preliminary?.[id];
          const handed = named(link) ? handedOver(root, link, {site: o.site, preliminaryTree: o.preliminary, inputs: o.inputs}).tests : null;
          const bench = has(benchFile) ? json(benchFile, 'bench-test record') : null;
          const report = {title: where + ' (effective)', text: readinessSummary(review) + (bench ? 'Bench tests: ' + benchText(benchSummary(bench)) + '\n' : '')};
          reports.push(report);
          const unresolved = touched && named(link) && !handed ? ['the risks of preliminary design ' + link + ' cannot be read: it has no judgement file in the current format'] : bench ? effectiveProblems(bench, handed) : handed?.length ? ['its preliminary design ' + link + ' hands over ' + handed.length +
            ' bench test' + (handed.length === 1 ? '' : 's') + ' and the design publishes no record (designs/' + id + '/' + benchFile + ')'] : [];
          check(!unresolved.length, where + ' cannot be effective until its bench tests are resolved: ' + unresolved.join('; '));
          check(review.showcaseEligibility === 'pass', where + ' cannot be effective: its mechanical-readiness review reports ' + review.showcaseEligibility +
            '. Resolve the findings and commit the passing review, or keep the design in progress.');
          // A design recorded from its review alone publishes no layout of its own to judge.
          if (!record.check && !has(judgementFile)) return note(where, 'effective', 'effective, recorded from its mechanical-readiness review.');
          if (!touched) return untouched(where, 'effective');
          onExport(effective(where, at, was).files);
          // Its gate is read beside its review: one report.
          report.text += reports.pop().text;
          return;
        }
        const link = record.preliminary?.release, linked = prelimStatus(link);
        check(named(link) && ['effective', 'superseded'].includes(linked), where + ' must name an effective preliminary release; ' + link + ' is ' + linked);
        check(versionOf(id).major === versionOf(link)?.major,
          where + ' names preliminary design ' + link + ', a different architecture. The major number is the architecture: a detailed design keeps the major number of its preliminary design');
        if (linked === 'superseded') warnings.push(where + ' names preliminary release ' + link + ', which is now superseded. Re-link it to the effective preliminary release: detailed-design-release.mjs relink PROJECT --design ' + id + ' --preliminary RELEASE.');
        if (!touched) return untouched(where, 'in-progress');
        const basis = handedOn(where, link);
        check(existsSync(path.join(root, folder, judgementFile)), where + ': commit its check inputs at ' + folder + ' (' + judgementFile + ' and every file it names)');
        check(coversLayout(parse(readFileSync(path.join(root, folder, judgementFile)), 'judgement file of ' + where), basis),
          where + ': its layout check must run the motions, cycle and displaced control of preliminary release ' + link);
        onExport(draft(where, at).files);
      });
    }
  });

  // A personal machine path or a credential is public as soon as the branch is pushed.
  if (o.scan) attempt('scan', () => {
    let scan;
    try { scan = scanTree(root); } catch (error) { if (/git/i.test(error.message)) return; throw error; }
    for (const f of scan.findings) errors.push(f.file + ':' + f.line + ': ' + (f.kind === 'machine-path' ? 'a personal machine path; write paths relative to the repository' : 'a credential; remove it and rotate it') + ': ' + f.text);
  });
  // Publishing the folder publishes everything in it, linked or not.
  const advice = attempt('published content', () => unlinkedAdvice(root, o.site)) ?? [];
  seconds.total = (Date.now() - began) / 1000;
  return {plugin: pluginVersion, preliminary, detailed, designs, comparedWith: since ?? null, seconds, advice, warnings, reports, errors};
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

/** The command line. `judge` is the layout judgement on committed records; only the plugin's own tests hand it another. */
export function main(args, {judge} = {}) {
  const usage = 'Usage: design-publication.mjs check PROJECT [--base COMMIT] [--site docs] [--preliminary preliminary-design] [--detailed detailed-design] ' +
    '[--inputs cad/preliminary-design/releases] [--detailed-inputs cad/detailed-design/designs]';
  try {
    const [mode, project, ...rest] = args, options = {};
    check(mode === 'check' && project && statSync(project, {throwIfNoEntry: false})?.isDirectory(), usage);
    for (let i = 0; i < rest.length; i++) {
      const name = {'--site': 'site', '--preliminary': 'preliminary', '--detailed': 'detailed', '--inputs': 'inputs', '--detailed-inputs': 'detailedInputs', '--base': 'base'}[rest[i]];
      check(name && rest[i + 1] !== undefined, usage);
      options[name] = rest[++i];
    }
    const result = checkProject(path.resolve(project), {...options, ...(judge ? {judge} : {})});
    for (const report of result.reports) console.log('== ' + report.title + ' ==\n' + report.text);
    for (const warning of result.warnings) console.error('Warning: ' + warning);
    if (result.advice.length) console.error('Advice: ' + result.advice.join('\n'));
    for (const error of result.errors) console.error('Error: ' + error);
    const {reports, ...summary} = result;
    console.log(JSON.stringify(summary, null, 2));
    console.error('[publication] Checked in ' + result.seconds.total.toFixed(1) + ' s; judging ' + result.seconds.judging.toFixed(1) + ' s, status ' + result.seconds.status.toFixed(1) + ' s of it.');
    // The last line an agent reads: what a push will do.
    console.error(result.errors.length ? 'Not ready to push: fix the ' + result.errors.length + ' error' + (result.errors.length === 1 ? '' : 's') + ' above.'
      : 'Ready to push. On push: the project\'s workflow publishes the page. Nothing is rerun.');
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
