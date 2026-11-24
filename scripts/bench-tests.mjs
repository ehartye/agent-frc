#!/usr/bin/env node
/**
 * The bench tests of a detailed design: a plain JSON record in the project, seeded from the risk register of the
 * preliminary design it is built on.
 *
 * A preliminary design hands over each open risk it could not close in simulation as a bench test with a measure, a
 * pass value and a fail value (`risks[].benchTest` in its judgement file). Detailed design gives each one a tag, an owner, a
 * plan and, when it is run, a result:
 *
 *   before-build  it gates the build: the design is effective only with a recorded passing result
 *   on-robot      it is run on the finished robot: the design is effective once it has an owner and a plan
 *
 * `detailed-design-release.mjs effective` and the publication check refuse a design whose record does not meet that,
 * naming each test. The record holds no hash: it is committed with the design, and Git records what it was.
 */
import {existsSync, mkdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {writeFileAtomic} from './atomic-write.mjs';

export const benchSchema = 'agent-frc/bench-tests@1';
export const benchFile = 'bench-tests.json';
export const benchTags = ['before-build', 'on-robot'];
const judgementSchema = 'agent-frc/layout-judgement@2';

const named = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const value = v => named(v) || typeof v === 'number' && Number.isFinite(v);
const number = v => typeof v === 'number' && Number.isFinite(v);
function check(ok, message) { if (!ok) throw Error(message); }
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { throw Error('Unreadable ' + file); } };
const posix = (project, full) => path.relative(project, full).split(path.sep).join('/');
const limits = t => 'pass ' + t.pass + ', fail ' + t.fail + (named(t.unit) ? ' ' + t.unit : '');

/** The folders a project keeps its designs in. */
function places(project, {site = 'docs', detailed = 'detailed-design', preliminaryTree = 'preliminary-design', detailedInputs = 'cad/detailed-design/designs',
  inputs = 'cad/preliminary-design/releases'} = {}) {
  return {project, detailIndex: path.join(project, site, detailed, 'designs.json'), detailTree: path.join(project, site, detailed), prelimTree: path.join(project, site, preliminaryTree),
    detailedInputs: path.join(project, detailedInputs), prelimInputs: path.join(project, inputs)};
}

/** Where a design's record sits: beside its check inputs. */
export const recordPath = (project, design, folders) => path.join(places(project, folders).detailedInputs, design, benchFile);

/**
 * The bench tests a preliminary release hands over, as effective-readiness lists them: each risk in its judgement file
 * that is not closed by a design change and carries a bench test with a measure, a pass value and a fail value. The
 * judgement file is read from the release's inputs, or from its published copy when they are not in the project.
 * Returns {release, source, tests}; `tests` is null when neither holds a judgement file this reads.
 */
export function handedOver(project, release, folders) {
  const at = places(project, folders), published = path.join(at.prelimTree, 'releases', release);
  let folder = path.join(at.prelimInputs, release);
  const recordFile = path.join(published, 'release.json');
  if (existsSync(recordFile)) {
    const named_ = readJson(recordFile).check?.project;
    if (named(named_) && !path.isAbsolute(named_)) folder = path.join(project, named_);
  }
  const file = [folder, published].map(dir => path.join(dir, 'judgement.json')).find(existsSync), judgement = file ? readJson(file) : null;
  if (judgement?.schema !== judgementSchema) return {release, source: null, tests: null};
  const risks = judgement.risks;
  const tests = (Array.isArray(risks) ? risks : []).filter(r => object(r) && named(r.id) && !named(r.closedBy) && object(r.benchTest) &&
    named(r.benchTest.measure) && value(r.benchTest.pass) && value(r.benchTest.fail) && r.benchTest.pass !== r.benchTest.fail)
    .map(r => ({id: r.id, ...(named(r.risk) ? {risk: r.risk} : {}), measure: r.benchTest.measure, pass: r.benchTest.pass, fail: r.benchTest.fail,
      ...(named(r.benchTest.unit) ? {unit: r.benchTest.unit} : {}), ...(benchTags.includes(r.benchTest.tag) ? {tag: r.benchTest.tag} : {})}));
  return {release, source: posix(project, file), tests};
}

/** The preliminary release a detailed design is built on, from the detailed index; null when it names none. */
export function linkedPreliminary(project, design, folders) {
  const file = places(project, folders).detailIndex;
  if (!existsSync(file)) return null;
  const link = readJson(file).preliminary?.[design];
  return named(link) ? link : null;
}

/**
 * Whether a recorded result passes. With numeric limits the value decides: at or beyond the pass value, on the side
 * away from the fail value. Otherwise the result says so itself with `passed`. Returns 'pass', 'fail', 'between' (a
 * value between the two limits) or 'unstated'.
 */
export function verdict(test, result = test.result) {
  if (!object(result)) return 'unstated';
  if (number(test.pass) && number(test.fail) && number(result.value)) {
    const higher = test.pass > test.fail, v = result.value;
    if (higher ? v >= test.pass : v <= test.pass) return 'pass';
    return (higher ? v <= test.fail : v >= test.fail) ? 'fail' : 'between';
  }
  return result.passed === true ? 'pass' : result.passed === false ? 'fail' : 'unstated';
}

/**
 * What stops a design with this record from being effective, one line for each test. `handed` is the list from
 * handedOver, or null when its judgement file could not be read.
 */
export function effectiveProblems(record, handed = null) {
  const problems = [];
  if (!(object(record) && record.schema === benchSchema && Array.isArray(record.tests))) return ['The bench-test record needs schema ' + benchSchema + ' and a tests list'];
  const seen = new Map();
  for (const t of record.tests) {
    if (!(object(t) && named(t.id)) || seen.has(t.id)) { problems.push('Each bench test needs a unique id'); continue; }
    seen.set(t.id, t);
    const where = 'Bench test ' + t.id;
    if (!(named(t.measure) && value(t.pass) && value(t.fail) && t.pass !== t.fail)) { problems.push(where + ' needs its measure, a pass value and a fail value'); continue; }
    if (!benchTags.includes(t.tag)) { problems.push(where + ' has no tag: set tag to before-build or on-robot'); continue; }
    if (t.tag === 'before-build') {
      const outcome = verdict(t);
      if (t.result === undefined || t.result === null) problems.push(where + ' (before-build) has no recorded result: run it and record the result (' + limits(t) + ')');
      else if (outcome === 'unstated') problems.push(where + ' (before-build) records a result that does not say whether it passed: give result.value as a number, or result.passed');
      else if (outcome !== 'pass') problems.push(where + ' (before-build) did not pass: recorded ' + (t.result.value ?? 'a failing result') + ' against ' + limits(t) +
        (outcome === 'between' ? ', between the two limits' : ''));
      else if (t.result.passed === false) problems.push(where + ' (before-build) records passed: false beside a passing value; correct one of them');
    } else {
      const lacking = ['owner', 'plan'].filter(k => !named(t[k]));
      if (lacking.length) problems.push(where + ' (on-robot) has no ' + lacking.join(' and '));
    }
  }
  for (const h of handed ?? []) {
    const mine = seen.get(h.id);
    if (!mine) problems.push('Bench test ' + h.id + ' was handed over by the preliminary design and is not in the record');
    else if (mine.measure !== h.measure || mine.pass !== h.pass || mine.fail !== h.fail || (mine.unit ?? null) !== (h.unit ?? null))
      problems.push('Bench test ' + h.id + ' differs from the handed-over numbers (' + h.measure + ': ' + limits(h) + ')');
  }
  return problems;
}

/** Counts for a status line. */
export function summary(record) {
  const tests = Array.isArray(record?.tests) ? record.tests.filter(object) : [], of = tag => tests.filter(t => t.tag === tag);
  return {tests: tests.length, beforeBuild: of('before-build').length, beforeBuildPassed: of('before-build').filter(t => verdict(t) === 'pass').length,
    onRobot: of('on-robot').length, onRobotPlanned: of('on-robot').filter(t => named(t.owner) && named(t.plan)).length,
    untagged: tests.filter(t => !benchTags.includes(t.tag)).length};
}
export const summaryText = s => s.tests + ' bench test' + (s.tests === 1 ? '' : 's') + ': ' + s.beforeBuildPassed + ' of ' + s.beforeBuild + ' before-build passed, ' +
  s.onRobotPlanned + ' of ' + s.onRobot + ' on-robot with an owner and a plan' + (s.untagged ? ', ' + s.untagged + ' not tagged' : '');

/**
 * The gate for an effective design. Returns {record, problems, handed}. A design whose preliminary design handed
 * over no bench test, and which keeps no record, has nothing to meet.
 */
export function effectiveGate(project, design, {preliminary, file, ...folders} = {}) {
  const link = preliminary ?? linkedPreliminary(project, design, folders), handed = link ? handedOver(project, link, folders) : {tests: null};
  const from = file ?? recordPath(project, design, folders);
  // Risks that cannot be read are not taken for no risks.
  if (link && !handed.tests) return {record: existsSync(from) ? readJson(from) : null, handed, problems: ['The risks of preliminary design ' + link +
    ' cannot be read: it has no judgement file in the current format, in its inputs or its published folder']};
  if (!existsSync(from)) {
    const count = handed.tests?.length ?? 0;
    return {record: null, handed, problems: count ? ['Design ' + design + ' has no bench-test record, and preliminary design ' + link + ' hands over ' + count + ' bench test' +
      (count === 1 ? '' : 's') + ' (' + handed.tests.map(t => t.id).join(', ') + '). Seed the record: node PLUGIN/scripts/bench-tests.mjs seed PROJECT --design ' + design] : []};
  }
  const record = readJson(from);
  return {record, handed, problems: effectiveProblems(record, handed.tests)};
}

/**
 * Write or refresh the record of a design from the bench tests its preliminary design hands over. A test already in
 * the record keeps its tag, owner, plan and result, and takes the handed-over measure and limits. A test the
 * preliminary design no longer hands over stays, marked `handedOver: false`.
 */
export function seed({project, design, preliminary, ...folders}) {
  check(named(design), 'Supply --design, the detailed design ID');
  const link = preliminary ?? linkedPreliminary(project, design, folders) ?? effectivePreliminary(project, folders);
  check(named(link), 'Name the preliminary release that hands over the bench tests with --preliminary RELEASE');
  const handed = handedOver(project, link, folders);
  check(handed.tests, 'No judgement file for preliminary release ' + link + ' in the project: commit its check inputs, or name another release with --preliminary');
  const file = recordPath(project, design, folders), before = existsSync(file) ? readJson(file) : null;
  check(!before || before.schema === benchSchema && Array.isArray(before.tests), posix(project, file) + ' is not a bench-test record');
  const kept = new Map((before?.tests ?? []).filter(object).map(t => [t.id, t])), ids = new Set(handed.tests.map(t => t.id));
  const tests = handed.tests.map(h => {
    const mine = kept.get(h.id) ?? {}, {handedOver: _, ...rest} = mine;
    return {...rest, id: h.id, ...(h.risk ? {risk: h.risk} : {}), measure: h.measure, pass: h.pass, fail: h.fail, ...(h.unit ? {unit: h.unit} : {}),
      tag: benchTags.includes(mine.tag) ? mine.tag : h.tag ?? null, owner: mine.owner ?? '', plan: mine.plan ?? '', result: mine.result ?? null};
  });
  for (const [id, mine] of kept) if (!ids.has(id)) tests.push({...mine, handedOver: false});
  const record = {schema: benchSchema, design, preliminary: link, source: handed.source, tests};
  mkdirSync(path.dirname(file), {recursive: true});
  writeFileAtomic(file, JSON.stringify(record, null, 2) + '\n');
  const added = handed.tests.filter(t => !kept.has(t.id)).length;
  return {file: posix(project, file), record, report: (before ? 'Refreshed ' : 'Wrote ') + posix(project, file) + ' from ' + handed.source + ': ' + summaryText(summary(record)) +
    (before ? ' (' + added + ' added)' : '') + '.\nTag each test before-build or on-robot. Give every on-robot test an owner and a plan, and record a result for every before-build test.\n'};
}

/** The effective preliminary release of a project, or null. */
function effectivePreliminary(project, folders) {
  const file = path.join(places(project, folders).prelimTree, 'releases.json');
  if (!existsSync(file)) return null;
  const index = readJson(file);
  return (index.releases ?? []).find(id => index.designStatus?.[id] === 'effective') ?? null;
}

/** Record the result of one test. A numeric value is judged against the limits; otherwise say `passed`. */
export function recordResult({project, design, test, value: measured, passed, note, date = new Date().toISOString().slice(0, 10), ...folders}) {
  const file = recordPath(project, design, folders);
  check(existsSync(file), 'No bench-test record at ' + posix(project, file) + '. Seed it first');
  const record = readJson(file), row = (record.tests ?? []).find(t => t?.id === test);
  check(row, 'No bench test ' + test + ' in ' + posix(project, file));
  const asNumber = measured !== undefined && measured !== '' && Number.isFinite(Number(measured)) ? Number(measured) : measured;
  check(asNumber !== undefined || passed !== undefined, 'Give the measured --value, or --passed true|false for a result that is not a number');
  check(passed === undefined || ['true', 'false', true, false].includes(passed), '--passed takes true or false');
  const result = {...(asNumber !== undefined ? {value: asNumber} : {}), ...(passed !== undefined ? {passed: passed === true || passed === 'true'} : {}), date, ...(named(note) ? {note} : {})};
  const outcome = verdict(row, result);
  check(outcome !== 'unstated', 'Bench test ' + test + ' has limits that are not both numbers (' + limits(row) + '): say --passed true or --passed false');
  if (result.passed === undefined) result.passed = outcome === 'pass';
  check(result.passed === (outcome === 'pass'), 'Bench test ' + test + ': --passed ' + result.passed + ' contradicts the value ' + result.value + ' against ' + limits(row));
  row.result = result;
  writeFileAtomic(file, JSON.stringify(record, null, 2) + '\n');
  // A design that already publishes its record keeps the published copy in step, as for an on-robot result recorded later.
  const published = path.join(places(project, folders).detailTree, 'designs', design, benchFile);
  if (existsSync(published)) writeFileAtomic(published, JSON.stringify(record, null, 2) + '\n');
  return {file: posix(project, file), record, report: 'Bench test ' + test + ': ' + (result.value ?? 'result') + ' against ' + limits(row) + ' — ' +
    (outcome === 'between' ? 'between the limits, not a pass' : outcome) + '.\n'};
}

/** Report the record against the gate without changing anything. */
export function status({project, design, preliminary, ...folders}) {
  check(named(design), 'Supply --design, the detailed design ID');
  const gate = effectiveGate(project, design, {preliminary, ...folders});
  const lines = gate.record ? [summaryText(summary(gate.record))] : ['No bench-test record.'];
  if (gate.problems.length) lines.push('Before this design can be effective:', ...gate.problems.map(p => '  - ' + p));
  else lines.push(gate.record ? 'Every before-build test has a passing result and every on-robot test has an owner and a plan.' : 'No bench test was handed over.');
  return {ready: gate.problems.length === 0, problems: gate.problems, ...(gate.record ? {summary: summary(gate.record)} : {}), report: lines.join('\n') + '\n'};
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
    const command = {seed, result: recordResult, check: status}[mode];
    check(command, 'Unknown command');
    const {report, record, ...out} = command(options);
    console.error(report);
    console.log(JSON.stringify(out, null, 2));
    if (mode === 'check' && !out.ready) process.exitCode = 1;
  } catch (error) {
    console.error(error.message + '\nUsage: bench-tests.mjs seed PROJECT --design ID [--preliminary RELEASE]' +
      ' | result PROJECT --design ID --test TEST --value NUMBER [--passed true|false] [--note TEXT] [--date YYYY-MM-DD]' +
      ' | check PROJECT --design ID [--preliminary RELEASE]' +
      '   [--site docs] [--detailed detailed-design] [--preliminary-tree preliminary-design] [--detailed-inputs cad/detailed-design/designs] [--inputs cad/preliminary-design/releases]');
    process.exitCode = 2;
  }
}
