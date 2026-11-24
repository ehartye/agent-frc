#!/usr/bin/env node
/**
 * The stage gate of a design: the full layout check, run by the coding agent on the committed design at the moment
 * the design is marked effective. The commands that set the status call it and refuse the status when it fails.
 *
 * The gate never trusts an earlier receipt. It reruns the layout check from the committed inputs, requires it to
 * end layout-checked with the displaced control rejected, and requires its input digests and verdicts to equal the
 * published receipt. It refuses a design whose inputs have uncommitted changes, because the reviewed pull request
 * must hold the files that were checked. It writes its record, gate.json, beside the published design.
 *
 *   node stage-gate.mjs preliminary PROJECT --release ID
 *
 * runs the gate of a preliminary release and writes the record. It refuses the release, before the layout check
 * runs, unless its effective-readiness report meets every criterion on the committed design. It does not set the
 * status: the staging command does, after this command passes.
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {writeFileAtomic} from './atomic-write.mjs';
import {checkPhysics, committedReceipt, compareVerdicts, releaseReadiness, runLayoutCheck, unmetCriteria} from './design-publication.mjs';
import {designTitle, versionOf} from './design-status.mjs';
import {readinessText} from './effective-readiness.mjs';
import {receiptIdentity} from './physics-identity.mjs';

export const gateFile = 'gate.json', gateSchema = 'agent-frc/stage-gate@1';
/** The time guideline for a stage gate, in minutes. */
export const gateGuidelineMinutes = 15;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function check(ok, message) { if (!ok) throw Error(message); }

/** The physics a receipt records, as one digest: what a gate record is matched to. A rebuilt view leaves it unchanged. */
export const gatePhysics = receipt => sha(JSON.stringify(receiptIdentity(receipt)));

/** The uncommitted changes under a folder, as Git reports them; null when the project is not in Git. */
export function uncommitted(root, folder) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
  try { git('rev-parse', '--is-inside-work-tree'); } catch { return null; }
  return git('status', '--porcelain', '--', path.relative(root, folder).split(path.sep).join('/') || '.').split('\n').filter(line => line.trim());
}

/** How long a run took against the gate guideline, in the words the commands print. */
export function gateTime(seconds) {
  const took = seconds < 120 ? Math.round(seconds) + ' s' : (seconds / 60).toFixed(1) + ' min';
  return took + ' (guideline: about ' + gateGuidelineMinutes + ' minutes at a stage gate)' + (seconds > gateGuidelineMinutes * 60
    ? '. This gate ran past its guideline: tell the owner what is slow and agree a budget before the next gate' : '');
}


/**
 * Run the gate of one design. `inputs` is the folder of its committed check inputs, `published` the folder its receipt
 * is published in, `record` its release or design record. Returns the gate record; throws, naming the reason, when
 * the design does not pass. Options: run (the layout check), ready (throws when the committed design does not meet the
 * criteria of its stage; called once its inputs are found committed, before the layout check runs), now, budgetMinutes,
 * workers.
 */
export function stageGate({root, where, id, phase, inputs, published, record, run = runLayoutCheck, ready = () => {}, now = () => Date.now(), budgetMinutes, workers}) {
  const changes = uncommitted(root, inputs), rel = full => path.relative(root, full).split(path.sep).join('/');
  check(!changes?.length, where + ' is not marked effective: its inputs have uncommitted changes (' + (changes ?? []).slice(0, 5).map(line => line.trim()).join('; ') +
    '). The stage gate runs on the committed design. Commit ' + rel(inputs) + ', then mark it effective');
  const receiptPath = path.join(published, 'receipt.json');
  check(existsSync(receiptPath), where + ' is not marked effective: it has no published receipt. Publish it as a draft first');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')), planName = 'judgement.json';
  const {fromRoot, absent} = committedReceipt(root, inputs, planName, receipt, where);
  check(!absent.length, where + ' is not marked effective: its receipt names files that are not in ' + rel(inputs) + ' (' + absent.join(', ') + ')');
  ready();
  const within = name => fromRoot ? rel(path.join(inputs, name)) : name, began = now();
  let fresh;
  try { fresh = run({project: fromRoot ? root : inputs, plan: within(planName), budgetMinutes, workers}); }
  catch (error) { throw Error(where + ' is not marked effective: ' + error.message); }
  try {
    checkPhysics(fresh, where + ' (stage gate)', {rerun: true});
    const differ = compareVerdicts(receipt, fresh);
    check(!differ.length, where + ': the stage gate differs from the published receipt in ' + differ.join(', ') + '. Run the layout check on the committed design and publish its receipt');
  } catch (error) { throw Error(error.message + '. It is not marked effective'); }
  const seconds = (now() - began) / 1000;
  let commit = null;
  try { commit = execFileSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null; } catch { /* not in Git */ }
  return {schema: gateSchema, phase, design: id, verdict: 'pass', date: new Date(now()).toISOString().slice(0, 10), ...(commit ? {commit} : {}),
    elapsedSeconds: Math.round(seconds), planSha256: receipt.planSha256, physics: gatePhysics(receipt)};
}

/** The line a command prints after a gate that passed. */
export const gateLine = (where, gate) => '[gate] ' + where + ': the full layout check ran on the committed design and reproduced the published receipt in ' + gateTime(gate.elapsedSeconds) + '.';

/** Write a gate record beside the published design. */
export function writeGate(published, gate) { writeFileAtomic(path.join(published, gateFile), JSON.stringify(gate, null, 2) + '\n'); }

/**
 * The gate of a preliminary release. Its effective-readiness report must meet every criterion on the committed design
 * before the layout check runs. Returns {gate, where, published, report}.
 */
export function preliminaryGate({project, release, site = 'docs', preliminary = 'preliminary-design', inputs = 'cad/preliminary-design/releases', ...options}) {
  const root = path.resolve(project), tree = path.join(root, site, preliminary), published = path.join(tree, 'releases', release);
  const read = file => JSON.parse(readFileSync(file, 'utf8'));
  check(existsSync(path.join(published, 'release.json')), 'Release ' + release + ' is not published: stage it first');
  const index = read(path.join(tree, 'releases.json')), record = read(path.join(published, 'release.json'));
  const where = 'Preliminary design ' + designTitle(index, release);
  const folder = path.resolve(root, record.check?.project ?? path.join(inputs, release));
  let report;
  const ready = () => {
    const found = releaseReadiness(root, folder, published, designTitle(index, release));
    report = readinessText(found);
    check(found.met === found.of, where + ' is not marked effective: its effective-readiness report meets ' + found.met + ' of ' + found.of +
      ' criteria on the committed design. Not met: ' + unmetCriteria(found) + '. Meet every criterion, commit the design, then mark it effective');
  };
  const gate = stageGate({root, where, id: release, phase: 'preliminary-design', inputs: folder, published, record, ready, ...options});
  return {gate: {...gate, readinessReport: report}, where, published, report};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, project, ...rest] = process.argv.slice(2), options = {};
    const usage = 'Usage: stage-gate.mjs preliminary PROJECT --release ID [--site docs] [--preliminary preliminary-design] [--inputs cad/preliminary-design/releases] [--budget-minutes 45] [--workers N]';
    // --check MODULE is for the plugin's own tests: the default export of the module stands in for the layout check.
    check(mode === 'preliminary' && project && statSync(project, {throwIfNoEntry: false})?.isDirectory() && rest.length % 2 === 0, usage);
    for (let i = 0; i < rest.length; i += 2) {
      const name = {'--release': 'release', '--site': 'site', '--preliminary': 'preliminary', '--inputs': 'inputs', '--budget-minutes': 'budgetMinutes', '--workers': 'workers', '--check': 'check'}[rest[i]];
      check(name, usage);
      options[name] = ['budgetMinutes', 'workers'].includes(name) ? Number(rest[i + 1]) : rest[i + 1];
    }
    check(options.release, usage);
    console.error('[gate] Running the full layout check on the committed design. Guideline: about ' + gateGuidelineMinutes + ' minutes.');
    const {check: stand, ...given} = options, run = stand ? (await import(pathToFileURL(path.resolve(stand)).href)).default : runLayoutCheck;
    const {gate, where, published, report} = preliminaryGate({project, run, ...given});
    writeGate(published, gate);
    console.log(gateLine(where, gate));
    process.stdout.write(report);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
