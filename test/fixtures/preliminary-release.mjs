import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync, gzipSync} from 'node:zlib';
import {readyCycle, readyInteraction} from './ready.mjs';
import {reviewScene, verdictOf} from './review-scene.mjs';

// Synthetic teaching fixtures: invented groups, motions and objectives with no relation to any game.
// The invented releases hold no solid the design library could build, so the layout judgement is stood in for: standIn()
// gives the verdict a judgement of the project's files would give, and refuses a record that is not of those files.
export const plugin = fileURLToPath(new URL('../..', import.meta.url));
export const sha = value => createHash('sha256').update(value).digest('hex');
export const stockPage = readFileSync(path.join(plugin, 'templates', 'preliminary-review', 'review.html'), 'utf8');
export const read = file => JSON.parse(readFileSync(file, 'utf8'));
export function write(root, file, data) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), {recursive: true});
  writeFileSync(target, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2));
}
export const editJson = (file, edit) => writeFileSync(file, JSON.stringify(edit(read(file)), null, 2));
export const tree = 'preliminary-design', requirementsFile = 'cad/preliminary-design/requirements.json';
export const inputsOf = id => 'cad/preliminary-design/releases/' + id;
export const publishedOf = id => 'docs/' + tree + '/releases/' + id;
export const trialName = 'invented pull-in';
export const objectives = [
  {objective: 'Carry the sample to the bin', disposition: 'represented', basis: 'The loaded-turn motion releases the sample over the bin'},
  {objective: 'Return to the start box', disposition: 'out-of-scope', basis: 'Handled by the drive team'}];
/** The release's default mission case. */
export const mission = {name: 'deliver', trial: trialName, accomplishes: 'delivered', objective: 'Carry the sample to the bin'};
const jobs = ['clearance.motion.loaded-turn', 'clearance.motion.park', 'electrical.loaded-turn', 'clearance.motion.loaded-turn.displaced.battery', 'mass.drawn'];

/** The judgement file of the invented layout, with its files in `folder`. */
export const judgementOf = (folder, issue, more = {}) => ({schema: 'agent-frc/layout-judgement@2', issue, source: {file: folder + '/design.json'}, records: {folder: folder + '/records'},
  requirements: {file: requirementsFile}, narrative: {file: folder + '/narrative.md', objectives}, premises: [{file: folder + '/premises/robot-mass.json'}],
  rules: {minGapMm: 5, allowanceBasis: 'Invented reserve'}, purposes: {park: ['park']}, cycle: readyCycle('loaded-turn', {park: 'park'}),
  control: {motion: 'loaded-turn', displaced: 'battery', moving: 'arm', offsetMm: [180, -150, 0], basis: 'Invented displacement'},
  missionCases: [mission], risks: [], page: {file: folder + '/page.json'}, ...more});

/** The invented scene of the two-motion layout, before its issue, sources and records are filled in. */
function baseScene() {
  const base = reviewScene(), [turn, control] = base.cases, [row, controlRow] = base.motionEvidence, {time, measure, ...still} = turn;
  return {...base, openingCase: 'loaded-turn',
    cases: [{...turn, id: 'loaded-turn', label: 'loaded-turn (operating)'}, {...still, id: 'park', label: 'park (park)', purpose: 'park', cause: 'hand'}, control],
    animations: [{id: 'transfer', title: 'Loaded turn', mission: true, cases: ['loaded-turn']}, {id: 'park', title: 'Park', mission: false, cases: ['park']}],
    power: {...base.power, motions: base.power.motions.map(m => ({...m, motion: 'loaded-turn'}))}, narrativeReview: {...base.narrativeReview, objectives},
    interactions: [readyInteraction()], motionEvidence: [{...row, case: 'loaded-turn'}, {...row, case: 'park', purpose: 'park', cause: 'hand'}, controlRow]};
}
const bytes = (root, name) => readFileSync(path.join(root, name));
/** The files of a design source: the top file, then each subsystem file it lists. */
function sourceFiles(root, judgement) {
  const top = judgement.source.file;
  return [top, ...(read(path.join(root, top)).subsystems ?? []).map(s => path.posix.join(path.posix.dirname(top), s.file))];
}
const partFiles = (root, judgement) => (read(path.join(root, judgement.source.file)).solids ?? []).filter(s => s.part)
  .map(s => path.posix.join(path.posix.dirname(judgement.source.file), s.part.file));
const joined = (root, names) => sha(Buffer.concat(names.map(name => bytes(root, name))));
/** What the invented records are of: the source and the parts it places, whatever the source calls itself. */
const drawn = (root, judgement) => sha(JSON.stringify([...sourceFiles(root, judgement), ...partFiles(root, judgement)].map(name =>
  name.endsWith('.json') ? {...read(path.join(root, name)), name: undefined, note: undefined} : sha(bytes(root, name)))));

/** Write the library's records of an invented release as they would stand after measuring its design source now. */
export function measured(root, file) {
  const judgement = read(path.join(root, file)), of = drawn(root, judgement), folder = judgement.records.folder;
  for (const id of jobs) write(root, folder + '/measurements/' + id + '.json', {schema: 'frc-design-kernel/measurement-job@1', id, of, result: {}});
  write(root, folder + '/trials.json', {trials: {[trialName]: {of, result: 'passed'}}});
}

/**
 * The verdict of the layout judgement on an invented release's committed files. Like the real one it measures nothing,
 * writes nothing and refuses a record that is missing or is not of the design source as it is now. stand-in.json
 * beside the judgement file overrides fields of the verdict.
 */
export function standIn(root, file, {everyRecord = false} = {}) {
  const refused = text => ({reason: 'The layout judgement was refused: ' + text});
  const judgement = read(file);
  if (judgement.schema !== 'agent-frc/layout-judgement@2') return refused('A judgement file has schema agent-frc/layout-judgement@2 and an issue name');
  const own = path.join(path.dirname(file), 'stand-in.json'), over = existsSync(own) ? read(own) : {};
  const folder = judgement.records.folder, of = drawn(root, judgement), asked = jobs.map(id => 'measurements/' + id + '.json');
  const stored = existsSync(path.join(root, folder, 'measurements')) ? readdirSync(path.join(root, folder, 'measurements')).map(n => 'measurements/' + n) : [];
  const bad = [];
  for (const name of everyRecord ? [...new Set([...asked, ...stored])] : asked) {
    const full = path.join(root, folder, name);
    if (!existsSync(full)) bad.push(name + ' is missing: there is no record');
    else if (read(full).of !== of) bad.push(name + ' is stale: solid "arm" changed');
  }
  const campaign = path.join(root, folder, 'trials.json'), trials = existsSync(campaign) ? read(campaign).trials : {};
  for (const [name, trial] of Object.entries(trials)) if ((everyRecord || name === trialName) && trial.of !== of) bad.push('trial "' + name + '" is stale: solid "arm" changed');
  if (bad.length) return refused(bad.join('\n- '));
  const digests = names => Object.fromEntries([...new Set(names)].map(name => [name, sha(bytes(root, name))]));
  const posix = full => path.relative(root, full).split(path.sep).join('/');
  return {...verdictOf({...baseScene(), issue: judgement.issue, records: {folder, jobs: jobs.map(id => ({id, file: 'measurements/' + id + '.json'}))}}),
    design: read(path.join(root, judgement.source.file)).name, library: {library: 'frc-design-kernel', version: '0.0.0', commit: null},
    cycle: judgement.cycle, control: {...judgement.control, rejected: true}, narrative: judgement.narrative, risks: judgement.risks ?? [],
    missionCases: (judgement.missionCases ?? []).map(m => ({...m, state: trials[m.trial] ? 'current' : 'not run', result: trials[m.trial]?.result ?? null})),
    files: {source: digests(sourceFiles(root, judgement)), parts: digests(partFiles(root, judgement)),
      judgement: digests([posix(file), judgement.requirements.file, ...judgement.premises.map(p => p.file)]),
      records: digests([...asked.map(name => folder + '/' + name), ...(existsSync(campaign) ? [folder + '/trials.json'] : [])])},
    seconds: {total: 1.4, status: 1}, ...over};
}

/** Build the review scene of an invented release beside its judgement file, as design preliminary-page does. */
export function paged(root, file, display = s => s) {
  const judgement = read(path.join(root, file)), folder = judgement.records.folder, base = baseScene();
  const scene = display({...base, issue: judgement.issue, design: read(path.join(root, judgement.source.file)).name, title: read(path.join(root, judgement.page.file)).title,
    narrativeReview: {...base.narrativeReview, objectives: judgement.narrative.objectives},
    sources: {...base.sources, design: {file: judgement.source.file, sha256: joined(root, sourceFiles(root, judgement))}},
    records: {folder, jobs: jobs.map(id => ({id, file: 'measurements/' + id + '.json', sha256: sha(bytes(root, folder + '/measurements/' + id + '.json'))})),
      trials: {file: folder + '/trials.json', sha256: sha(bytes(root, folder + '/trials.json'))}}});
  write(root, path.posix.join(path.posix.dirname(file), 'review-scene.json.gz'), gzipSync(JSON.stringify(scene)));
}
export const sceneAt = file => JSON.parse(gunzipSync(readFileSync(file)));

/**
 * The committed inputs of a release in `folder`: the source and its subsystem file, the part it places, the judgement,
 * the page file, the records and the built page. `more` edits the judgement and `display` the built scene.
 */
export function writeInputs(root, folder, {issue, page = stockPage, step = 'step of ' + folder, name = 'Invented arm', arm = 1, more = {}, display} = {}) {
  if (!existsSync(path.join(root, requirementsFile))) write(root, requirementsFile, {schema: 'agent-frc/season-requirements@1', basis: 'Invented brief', minBusV: 9,
    weightLimits: [{name: 'inspection', limitKg: 20, excludesGroups: ['battery'], basis: 'Invented rule'}]});
  write(root, folder + '/design.json', {schema: 'frc-design-kernel/design@1', name, subsystems: [{file: 'subsystems/arm.json'}], solids: [{name: 'frame', part: {file: 'design.step', solid: 'frame'}}]});
  write(root, folder + '/subsystems/arm.json', {schema: 'frc-design-kernel/subsystem@1', solids: [{name: 'arm', massKg: arm}]});
  write(root, folder + '/design.step', step);
  write(root, folder + '/premises/robot-mass.json', {id: 'robot-mass', observes: 'mass.rangeKg'});
  write(root, folder + '/narrative.md', 'Invented narrative');
  write(root, folder + '/page.json', {schema: 'agent-frc/review-page@1', title: 'Invented title'});
  write(root, folder + '/judgement.json', judgementOf(folder, issue, more));
  write(root, folder + '/review.html', page);
  measured(root, folder + '/judgement.json');
  paged(root, folder + '/judgement.json', display);
}

/** Copy a release's published files from its inputs, as staging does. `top` names the published top source file. */
export function publish(root, folder, published, {top = 'design.json'} = {}) {
  const copy = (name, as = name) => cpSync(path.join(root, folder, name), path.join(root, published, as), {recursive: true});
  mkdirSync(path.join(root, published), {recursive: true});
  for (const name of sourceFiles(root, read(path.join(root, folder, 'judgement.json'))).map(n => path.posix.relative(folder, n))) copy(name, name === 'design.json' ? top : name);
  for (const name of ['judgement.json', 'page.json', 'records', 'review-scene.json.gz']) copy(name);
  copy('review.html', 'index.html');
}

/** Commit and publish one invented release. `missions` replaces its mission cases, `display` edits the built scene. */
export function issueRelease(root, id, {missions, step = 'step ' + id, more = {}, ...options} = {}) {
  const folder = inputsOf(id);
  writeInputs(root, folder, {issue: 'synthetic-' + id, step, ...options, more: {...(missions ? {missionCases: missions} : {}), ...more}});
  republish(root, id);
}
/** Publish a release's inputs again, as staging does after an edit. */
export function republish(root, id) {
  const folder = inputsOf(id);
  publish(root, folder, publishedOf(id));
  write(root, publishedOf(id) + '/release.json', {schema: 'agent-frc/preliminary-release@2', release: id, issue: read(path.join(root, folder, 'judgement.json')).issue,
    phase: 'preliminary-design', check: {project: folder}, requirements: requirementsFile});
}
export function listing(root, current, releases, designStatus, designs) {
  write(root, 'docs/' + tree + '/releases.json', {current, releases, ...(designs ? {designs} : {}), ...(designStatus ? {designStatus} : {})});
}
