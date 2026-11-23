/**
 * @lane merge
 * @subject scripts/physics-identity.mjs
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {contentSha, identityDifferences, physicsIdentity, receiptIdentity} from '../scripts/physics-identity.mjs';

// Synthetic teaching fixture: an invented carrier that turns a sample past a rail. No relation to any game.
const sha = value => createHash('sha256').update(value).digest('hex');

/**
 * The committed inputs of one design and its receipt, as a map of project-relative path to text. `folder` is the
 * design's inputs folder and `issue` its issue name: the two labels a rename changes. `edit` changes the records
 * before they are written, by short name.
 */
function design({folder = 'cad/preliminary-design/releases/1.0', issue = 'invented-carrier-1.0', title = 'Invented carrier', phase = 'cycle', edit = {}, ownFolder = false} = {}) {
  const at = name => ownFolder ? name : folder + '/' + name, pin = name => ({file: at(name)});
  const records = {
    'design.step': 'ISO-10303-21; invented solids',
    'bin.step': 'ISO-10303-21; invented field bin',
    'narrative.md': 'Invented narrative: carry the sample to the bin.',
    'estimate.json': {source: 'Invented bench estimate', seconds: 2.4},
    'reach-accepted.json': {id: 'reach', issue: 'earlier-issue', value: 2.5, source: pin('estimate.json')},
    'reach-current.json': {id: 'reach', issue, value: 2.4, source: pin('estimate.json')},
    'carry-trial.json': {issue, transport: {case: 'loaded-turn', payload: 'sample', retained: true, frictionCoefficient: 0.4}},
    'replays.json': {schema: 'agent-frc/review-replays@1', replays: [{id: 'lane-run', evidence: [pin('carry-trial.json')]}]},
    'limits.json': {basis: 'Invented brief', inspectionLimitKg: 15, operatingMinV: 9, massLines: ['body']},
    'budgets.json': {issue, requirements: pin('limits.json'), step: pin('design.step'), runningPayloadKg: [0.2, 0.5], masses: [{id: 'body', members: ['head', 'rail'], kg: [9, 11], basis: 'Invented subtotal'}],
      electricalCases: {'loaded-turn-weak': {batterySideA: {drive: [20, 30]}, openCircuitV: [11.5, 12], resistanceOhm: [0.023, 0.03]}}},
    'design.json': {schema: 'frc-design-kernel/design@1', name: 'Invented blockout', frame: 'Invented datum',
      groups: {structure: {role: 'structure'}, carrier: {role: 'mechanism'}, field: {role: 'fixture'}},
      solids: [{name: 'rail', group: 'structure'}, {name: 'head', group: 'carrier'}], fixtures: [{name: 'bin', group: 'field', file: pin('bin.step'), solid: 'bin'}],
      mounts: [{group: 'carrier', on: 'rail', atMm: [0, 0, 6], note: 'Invented pedestal'}],
      motions: {'loaded-turn': {moves: {carrier: [{kind: 'rotation', originMm: [0, 0, 20], axis: [0, 0, 1], travelDeg: 90}]}},
        park: {moves: {carrier: [{kind: 'rotation', originMm: [0, 0, 20], axis: [0, 0, 1], travelDeg: -90}]}}}},
    'missions.json': {missionCases: [{case: 'loaded-turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Carry the sample to the bin'}]},
    'judgement.json': {schema: 'agent-frc/layout-judgement@1', issue, source: pin('design.json'),
      stages: {'loaded-turn': {purpose: 'operating', basis: 'Invented sweep', minGapMm: 1, allowanceBasis: 'Invented 1 mm reserve', phase,
        transportedBy: {sample: {mechanisms: ['carrier'], trial: 'carry'}}}, park: {purpose: 'park', basis: 'Invented return', minGapMm: 1, allowanceBasis: 'Invented 1 mm reserve', phase}},
      control: {case: 'loaded-turn', displaced: 'rail', moving: 'head', offsetMm: [0, -50, 0], basis: 'Invented displacement'}, cycle: ['loaded-turn', 'park'],
      view: at('package-motion.html'), attachment: {unmounted: {rail: 'Invented note'}},
      narrativeReview: {source: pin('narrative.md'), objectives: [{objective: 'Carry the sample to the bin', disposition: 'represented', basis: 'Invented basis'}]},
      presentation: {title, architecture: title + ' architecture', context: 'Synthetic teaching project', phases: {[phase]: {title: 'Invented phase'}}, replays: [pin('replays.json')]},
      budgets: pin('budgets.json'), trials: pin('carry-trial.json'), premises: [{accepted: pin('reach-accepted.json'), current: pin('reach-current.json')}]}
  };
  for (const [name, change] of Object.entries(edit)) records[name] = typeof change === 'function' ? change(structuredClone(records[name])) : change;
  const bytes = name => Buffer.from(typeof records[name] === 'string' ? records[name] : JSON.stringify(records[name], null, 2));
  const files = new Map(Object.keys(records).map(name => [folder + '/' + name, bytes(name)]));
  const plan = records['judgement.json'], source = records['design.json'], recorded = name => ({...pin(name), sha256: sha(bytes(name))});
  // The receipt a check of these files would write: the digests it read, the judgement and the source it repeats and its verdicts.
  const receipt = {schema: 'agent-frc/preliminary-layout-result@1', issue, planSha256: sha(bytes('judgement.json')), status: 'layout-checked', design: recorded('design.json'),
    step: recorded('design.step'), datum: {name: source.frame}, groups: source.groups, mounts: source.mounts, stages: plan.stages, cycle: plan.cycle,
    cases: [{case: 'loaded-turn', status: 'pass', pairs: [{pair: ['head', 'rail'], status: 'pass', lowerBoundMm: 6.87}]}, {case: 'park', status: 'pass', pairs: []}],
    control: {case: 'loaded-turn', displaced: 'rail', offsetMm: [0, -50, 0], witness: {pair: ['head', 'rail'], status: 'fail'}},
    narrativeReview: plan.narrativeReview, budgets: {source: recorded('budgets.json'), limits: recorded('limits.json'), massStatus: 'pass', remainingKg: 4,
      electricalCases: [{case: 'loaded-turn-weak', status: 'pass', marginV: 0.31}]},
    view: {file: at('package-motion.html'), sha256: sha(title + phase), verified: true}};
  const read = name => files.get(ownFolder ? folder + '/' + name : name) ?? null;
  return {files, receipt, identity: (options = {}) => physicsIdentity({receipt, read, plan: at('judgement.json'), folder: ownFolder ? '' : folder, extra: ['missions.json'], ...options})};
}
const differences = (a, b) => identityDifferences(a.identity(), b.identity());

test('a rename leaves the identity equal: a new ID, folder, issue name and titles change no physics', () => {
  const before = design(), after = design({folder: 'cad/preliminary-design/releases/1.1', issue: 'invented-carrier-1.1', title: 'Tilting carriage'});
  // Every record that embeds the issue name or the folder has other bytes, and so has every digest the receipts recorded.
  for (const name of ['judgement.json', 'design.json', 'budgets.json', 'reach-current.json', 'carry-trial.json'])
    assert.notEqual(sha(before.files.get('cad/preliminary-design/releases/1.0/' + name)), sha(after.files.get('cad/preliminary-design/releases/1.1/' + name)), name);
  assert.notEqual(before.receipt.planSha256, after.receipt.planSha256);
  assert.notEqual(before.receipt.design.sha256, after.receipt.design.sha256);
  assert.notEqual(before.receipt.budgets.source.sha256, after.receipt.budgets.source.sha256);
  assert.deepEqual(differences(after, before), []);
  assert.deepEqual(after.identity().files, before.identity().files);
  assert.deepEqual(Object.keys(before.identity().files).sort(), ['bin.step', 'budgets.json', 'carry-trial.json', 'design.json', 'design.step', 'estimate.json', 'judgement.json', 'limits.json',
    'missions.json', 'narrative.md', 'reach-accepted.json', 'reach-current.json'], 'every file the plan reaches, and no presentation evidence');
  // A design checked inside its own folder writes bare names, and moves the same way.
  assert.deepEqual(differences(design({ownFolder: true, folder: 'elsewhere/1.0', issue: 'another-name'}), design({ownFolder: true})), []);
  assert.deepEqual(differences(design({ownFolder: true, folder: 'elsewhere/1.0'}), before), [], 'the two forms of one design agree');
});

test('a view-only rebuild leaves the identity equal: titles, phases, the page and the plan digest are labels', () => {
  const before = design(), after = design({title: 'Reworded title', phase: 'Invented delivery phase',
    edit: {'judgement.json': plan => ({...plan, attachment: {unmounted: {rail: 'Reworded note'}}, presentation: {...plan.presentation, notes: ['Added note'], replays: []}})}});
  assert.notEqual(before.receipt.planSha256, after.receipt.planSha256);
  assert.notEqual(before.receipt.view.sha256, after.receipt.view.sha256);
  assert.deepEqual(differences(after, before), []);
  // Measured values are no part of it: a kernel on another system may round them differently.
  const rounded = design();
  rounded.receipt.cases[0].pairs[0].lowerBoundMm = 6.8700001; rounded.receipt.budgets.remainingKg = 4.0000001; rounded.receipt.budgets.electricalCases[0].marginV = 0.3100001;
  assert.deepEqual(differences(rounded, before), []);
});

test('each physics input changes the identity, and the difference names the file', () => {
  const before = design();
  const changed = (edit, expected, message) => assert.deepEqual(differences(design({edit}), before), expected, message);
  changed({'design.step': 'ISO-10303-21; a longer invented rail'}, ['design.step'], 'the STEP');
  const source = edit => ({'design.json': edit});
  changed(source(d => { d.motions['loaded-turn'].moves.carrier[0].travelDeg = 95; return d; }), ['design.json'], 'a motion');
  changed({'bin.step': 'ISO-10303-21; a wider invented bin'}, ['bin.step'], 'a field fixture');
  changed(source(d => { d.fixtures[0].solid = 'lid'; return d; }), ['design.json'], 'the solid a fixture selects');
  changed(source(d => { d.solids[1].group = 'structure'; return d; }), ['design.json'], 'the group of a solid');
  changed(source(d => { d.mounts[0].atMm = [0, 0, 7]; return d; }), ['design.json'], 'a mount datum');
  changed(source(d => ({...d, frame: 'Another invented datum'})), ['design.json'], 'the datum');
  changed({'carry-trial.json': trial => { trial.transport.frictionCoefficient = 0.2; return trial; }}, ['carry-trial.json'], 'a trial record');
  changed({'limits.json': limits => ({...limits, inspectionLimitKg: 16})}, ['limits.json'], 'a budget limit');
  changed({'limits.json': limits => ({...limits, operatingMinV: 8.5})}, ['limits.json'], 'a voltage reserve');
  changed({'budgets.json': ledger => { ledger.masses[0].kg = [9, 12]; return ledger; }}, ['budgets.json'], 'a mass line');
  changed({'estimate.json': e => ({...e, seconds: 3})}, ['estimate.json'], 'the source of a premise');
  changed({'reach-current.json': r => ({...r, value: 2.9})}, ['reach-current.json'], 'a premise');
  changed({'narrative.md': 'Invented narrative, with another objective.'}, ['narrative.md'], 'the narrative');
  changed({'missions.json': m => { m.missionCases[0].accomplishes = 'scored'; return m; }}, ['missions.json'], 'a mission case');
  const plan = edit => ({'judgement.json': edit});
  changed(plan(p => { p.stages['loaded-turn'].minGapMm = 0.5; return p; }), ['judgement.json'], 'a clearance tolerance');
  changed(plan(p => { p.control.offsetMm = [0, -40, 0]; return p; }), ['judgement.json'], 'the displaced control');
  changed(plan(p => { p.cycle = ['loaded-turn']; return p; }), ['the cycle result', 'judgement.json'], 'the cycle');
  changed(plan(p => { delete p.stages['loaded-turn'].transportedBy; return p; }), ['judgement.json'], 'the trial a stage is bound to');
  // A verdict that differs is named as a result.
  const result = edit => { const d = design(); edit(d.receipt); return differences(d, before); };
  assert.deepEqual(result(r => { r.cases[0].status = 'fail'; }), ['the cases result']);
  assert.deepEqual(result(r => { r.control.witness = null; }), ['the control result']);
  assert.deepEqual(result(r => { r.budgets.massStatus = 'fail'; }), ['the massStatus result']);
  assert.deepEqual(result(r => { r.budgets.electricalCases[0].status = 'fail'; }), ['the electricalCases result']);
  assert.deepEqual(result(r => { r.status = 'provisional'; }), ['the status result']);
});

test('a file that cannot be read is told from one that can, and a plan that is not committed falls back to the receipt', () => {
  const before = design(), gone = design();
  gone.files.delete('cad/preliminary-design/releases/1.0/bin.step');
  assert.equal(gone.identity().files['bin.step'], 'missing');
  assert.deepEqual(differences(gone, before), ['bin.step']);
  // Without the plan, the receipts are compared on what they recorded.
  const bare = d => d.identity({plan: undefined});
  assert.equal(bare(before).files, null);
  assert.deepEqual(identityDifferences(bare(design()), bare(before)), []);
  assert.deepEqual(identityDifferences(bare(design({title: 'Reworded title', phase: 'Invented delivery phase'})), bare(before)), [], 'a view refresh keeps the issue name and every recorded digest');
  assert.deepEqual(identityDifferences(bare(design({edit: {'judgement.json': p => { p.stages['loaded-turn'].minGapMm = 0.5; return p; }}})), bare(before)), ['the recorded stages']);
  assert.deepEqual(identityDifferences(bare(design({edit: {'design.json': d => { d.mounts[0].atMm = [0, 0, 7]; return d; }}})), bare(before)), ['the recorded design', 'the recorded mounts']);
  // The ledger embeds the issue name, so a rename is not told from a change here: commit the plan to compare a rename.
  assert.deepEqual(identityDifferences(bare(design({issue: 'another-name'})), bare(before)), ['the recorded budgets']);
  assert.equal(receiptIdentity(before.receipt).step, before.receipt.step.sha256);
});

test('a Git LFS pointer stands for the file it names', () => {
  const step = Buffer.from('ISO-10303-21; invented solids');
  assert.equal(contentSha(step), sha(step));
  assert.equal(contentSha(Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:' + sha(step) + '\nsize ' + step.length + '\n')), sha(step));
});
