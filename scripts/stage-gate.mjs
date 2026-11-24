#!/usr/bin/env node
/**
 * The stage gate of a design: the judgement of its committed records, run by the coding agent at the moment the design
 * is marked effective. The commands that set the status call it and refuse the status when it fails.
 *
 * The gate judges what is recorded. It measures nothing and runs no trial, because every record is keyed to what it
 * used and the design library's status says whether that has changed. It refuses a design
 *
 *   - whose inputs have uncommitted changes, because the reviewed pull request must hold the files that were judged;
 *   - whose records are not all current, or with one missing: each job, each trial, whether the judgement uses it or not;
 *   - that its records do not judge layout-checked, with nothing unmet;
 *   - that does not meet every criterion of its stage;
 *   - whose published files or review scene are not those of the committed design.
 *
 * It writes its record, gate.json, beside the published design (gate-record.mjs). A refused design gains none.
 *
 *   node stage-gate.mjs preliminary PROJECT --release ID
 *
 * runs the gate of a preliminary release and writes the record. Its effective-readiness report must meet every
 * criterion. It does not set the status: the staging command does, after this command passes.
 *
 *   node stage-gate.mjs holds PROJECT --release ID
 *
 * says whether the gate record of an effective release still stands for its committed files, and exits 1 when not.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {checkMission, checkPublished, checkScene, frozenText, releaseReadiness, unmetCriteria} from './design-publication.mjs';
import {designTitle} from './design-status.mjs';
import {judgedVerdict, readinessText} from './effective-readiness.mjs';
import {filesProblem, gateDifferences, gateSchema, isGateOf, judgedFiles, readGate, writeGate} from './gate-record.mjs';

function check(ok, message) { if (!ok) throw Error(message); }
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const seconds = value => value.toFixed(1) + ' s';

/** Git's answer in a project, or null when the project is not in Git. */
function git(root, ...args) {
  const run = (...a) => execFileSync('git', ['-C', root, ...a], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1024 * 1024 * 1024});
  try { run('rev-parse', '--is-inside-work-tree'); } catch { return null; }
  return run(...args);
}

/** The uncommitted changes to files or folders, as Git reports them; empty when the project is not in Git. */
export function uncommitted(root, ...names) {
  return (git(root, 'status', '--porcelain', '--', ...names) ?? '').split('\n').filter(line => line.trim());
}

/** The named files that are not in Git: an ignored record would be judged here and be missing from the pull request. */
function untracked(root, folder, names) {
  const listed = git(root, 'ls-files', '-z', '--', folder, ...names.filter(name => !name.startsWith(folder + '/')));
  if (listed === null) return [];
  const tracked = new Set(listed.split('\0'));
  return names.filter(name => !tracked.has(name));
}

/**
 * Run the gate of one design. `inputs` is the folder of its committed inputs and `published` the folder it is published
 * in. Returns {gate, verdict}; throws, naming the reason, when the design does not pass. Options: judge (the layout judgement on the committed records), ready (given the verdict, returns the
 * criteria met as {met, of}, or throws when the design falls short of its stage), now.
 */
export function judgedGate({root, where, id, phase, inputs, published, judge = judgedVerdict, ready = () => null, now = () => Date.now()}) {
  const began = now(), folder = path.relative(root, inputs).split(path.sep).join('/'), judgement = path.join(inputs, 'judgement.json');
  const refuse = (ok, text) => check(ok, where + ' is not marked effective: ' + text);
  const committed = changes => refuse(!changes.length, 'its inputs have uncommitted changes (' + changes.slice(0, 5).map(line => line.trim()).join('; ') +
    '). The stage gate judges the committed design. Commit ' + folder + ', then mark it effective');
  committed(uncommitted(root, folder));
  refuse(existsSync(judgement), 'it has no judgement file at ' + folder + '/judgement.json');
  const verdict = judge(root, judgement, {everyRecord: true});
  refuse(!verdict.reason, verdict.reason);
  refuse(verdict.status === 'layout-checked' && verdict.firstUnmet === null && !verdict.unmet?.length && !verdict.reopen?.length,
    'its records judge it ' + verdict.status + ': ' + (verdict.firstUnmet?.text ?? verdict.unmet?.[0]?.text ?? 'a premise is reopened'));
  const outside = filesProblem(verdict.files, folder);
  refuse(!outside, outside);
  const names = judgedFiles(verdict.files).map(([name]) => name), elsewhere = names.filter(name => !name.startsWith(folder + '/'));
  if (elsewhere.length) committed(uncommitted(root, ...elsewhere));
  const missing = untracked(root, folder, names);
  refuse(!missing.length, 'files it was judged on are not in Git (' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : '') + '). Commit them, then mark it effective');
  const readiness = ready(verdict);
  try {
    checkPublished(where, {root, folder, published, phase, files: verdict.files});
    checkMission(where, checkScene(where, {root, published, files: verdict.files, verdict}), read(judgement));
  } catch (error) { throw Error(error.message + '. ' + where + ' is not marked effective'); }
  const elapsed = (now() - began) / 1000, commit = git(root, 'rev-parse', '--verify', '-q', 'HEAD')?.trim();
  return {verdict, gate: {schema: gateSchema, phase, design: id, verdict: verdict.status, firstUnmet: null, ...(readiness ? {readiness: {met: readiness.met, of: readiness.of}} : {}),
    files: verdict.files, library: verdict.library, elapsedSeconds: Math.round(elapsed * 10) / 10, date: new Date(now()).toISOString().slice(0, 10), ...(commit ? {commit} : {})}};
}
/** The gate record of one design: see judgedGate. */
export const stageGate = options => judgedGate(options).gate;

/** The line a command prints after a gate that passed. */
export const gateLine = (where, {gate, verdict}) => '[gate] ' + where + ': ' + gate.verdict + ' on ' + Object.keys(gate.files.records).length + ' current records' +
  (gate.readiness ? ', ' + gate.readiness.met + ' of ' + gate.readiness.of + ' readiness criteria met' : '') + ', in ' + seconds(gate.elapsedSeconds) +
  ' (status ' + seconds(verdict.seconds.status) + ' of it). Nothing was measured.';

/** Where a preliminary release is published and its inputs are committed: {root, published, inputs, folder, title, where}. */
function releaseAt({project, release, site = 'docs', preliminary = 'preliminary-design', inputs = 'cad/preliminary-design/releases'}) {
  const root = path.resolve(project), tree = path.join(root, site, preliminary), published = path.join(tree, 'releases', release);
  check(existsSync(path.join(published, 'release.json')), 'Release ' + release + ' is not marked effective: it is not published: stage it first');
  const title = designTitle(read(path.join(tree, 'releases.json')), release), folder = read(path.join(published, 'release.json')).check?.project ?? path.posix.join(inputs, release);
  return {root, published, folder, inputs: path.resolve(root, folder), title, where: 'Preliminary design ' + title};
}

/**
 * The gate of a preliminary release. Its effective-readiness report must meet every criterion on the committed design.
 * Returns {gate, verdict, where, published, report}.
 */
export function preliminaryGate({project, release, site, preliminary, inputs, judge, now}) {
  const at = releaseAt({project, release, site, preliminary, inputs});
  let report;
  const ready = verdict => {
    const found = releaseReadiness(at.root, at.inputs, at.title, verdict);
    report = readinessText(found);
    check(found.of > 0 && found.met === found.of, at.where + ' is not marked effective: its effective-readiness report meets ' + found.met + ' of ' + found.of +
      ' criteria on the committed design. Not met: ' + unmetCriteria(found) + '. Meet every criterion, commit the design, then mark it effective');
    return found;
  };
  const done = judgedGate({root: at.root, where: at.where, id: release, phase: 'preliminary-design', inputs: at.inputs, published: at.published, ready,
    ...(judge ? {judge} : {}), ...(now ? {now} : {})});
  return {...done, where: at.where, published: at.published, report};
}

/** Why the gate record of an effective release no longer stands for its committed files, or null while it does. */
export function gateHolds({project, release, site, preliminary, inputs}) {
  const at = releaseAt({project, release, site, preliminary, inputs}), gate = readGate(at.published);
  if (!isGateOf(gate, {phase: 'preliminary-design', id: release, inputs: at.folder})) return at.title + ' is effective with no stage gate record of its committed design';
  const differ = gateDifferences(at.root, gate);
  return differ.length ? frozenText(at.title, differ) : null;
}

/** The command line. `judge` is the layout judgement; only the plugin's own tests hand it another. */
export function main(args, {judge} = {}) {
  try {
    const [mode, project, ...rest] = args, options = {};
    const usage = 'Usage: stage-gate.mjs preliminary|holds PROJECT --release ID [--site docs] [--preliminary preliminary-design] [--inputs cad/preliminary-design/releases]';
    check(['preliminary', 'holds'].includes(mode) && project && statSync(project, {throwIfNoEntry: false})?.isDirectory() && rest.length % 2 === 0, usage);
    for (let i = 0; i < rest.length; i += 2) {
      const name = {'--release': 'release', '--site': 'site', '--preliminary': 'preliminary', '--inputs': 'inputs'}[rest[i]];
      check(name, usage);
      options[name] = rest[i + 1];
    }
    check(options.release, usage);
    if (mode === 'holds') {
      const reason = gateHolds({project, ...options});
      check(!reason, reason);
      return;
    }
    const done = preliminaryGate({project, ...options, judge});
    writeGate(done.published, done.gate);
    console.log(gateLine(done.where, done));
    process.stdout.write(done.report);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
