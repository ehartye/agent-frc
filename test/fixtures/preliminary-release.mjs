import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {readyInteraction,readyMissions} from './ready.mjs';

// Synthetic teaching fixtures: invented groups, cases and objectives with no relation to any game.
export const plugin=fileURLToPath(new URL('../..',import.meta.url));
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const stockPage=readFileSync(path.join(plugin,'templates','preliminary-review','review.html'),'utf8');
export function write(root,file,data) {
  const target=path.join(root,file);
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2));
}
export const tree='preliminary-design';
/** The committed judgement file of a release: an invented record whose receipt is bound to it. */
export const planOf=id=>JSON.stringify({schema:'agent-frc/layout-judgement@1',issue:'synthetic-'+id});
/** The release's default mission case. */
const mission={case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Carry the sample to the bin'};
export const objectives=[
  {objective:'Carry the sample to the bin',disposition:'represented',basis:'The loaded-turn case releases the sample over the bin'},
  {objective:'Hang from the bar',disposition:'open',basis:'No hanging mechanism selected yet'},
  {objective:'Return to the start box',disposition:'out-of-scope',basis:'Handled by the drive team'}];

/** `basis` names the release whose STEP and design source this one was checked on: its own, unless it renames another. */
/**
 * The receipt-era review scene a staged release still carries until the gate and publication package (data model WP8)
 * converts staging to the library's records. The stock page reads agent-frc/preliminary-review-scene@2 instead; this
 * frozen copy feeds only the receipt fixtures below. Synthetic: two boxes on a pivot, a frame, a battery and a field fixture.
 */
const box = (lo, hi) => ({
  v: [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]],
  f: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
});
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const turn = k => { const a = Math.PI / 2 * k / 24, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const pin = name => ({file: name, sha256: (name.length.toString(16) + 'a'.repeat(64)).slice(0, 64)});

function receiptEraScene(overrides = {}) {
  const body = (name, category, role, group, extra = {}) => ({
    name, category, role, color: {structure: '#5e7da3', mechanism: '#2f9e8f', electrical: '#8e6bb8', reference: '#c9a227'}[role] ?? '#7a8794',
    subsystem: group === 'field' ? null : 'Invented ' + group, motionGroup: group, material: role === 'reference' ? null : 'Invented material',
    volumeMm3: 64000, volumeType: 'material', closed: true, fixture: role === 'reference',
    purpose: 'Invented purpose of ' + name + '.', rationale: 'Invented reason for ' + name + '.', support: role === 'mechanism' ? 'Pivot shaft into the frame plate.' : null,
    massExcluded: role === 'reference' ? 'Field fixture; not robot mass' : null, missing: role === 'reference' ? ['subsystem', 'material'] : [], ...extra});
  const scene = {
    schema: 'agent-frc/preliminary-review-scene@1', issue: 'synthetic-review-layout', title: 'Invented arm raise and return', context: 'Synthetic project',
    architecture: 'Invented pivoting arm on a fixed frame', datum: 'Invented frame datum, millimetres', units: 'Millimetres in the registered STEP world; kg, A, V',
    links: [{label: 'Season site', href: '../../../'}],
    sources: {step: pin('design.step'), design: pin('design.json'), narrative: pin('narrative.md')},
    decision: {status: 'pending receipt', firstUnmet: null},
    palette: {structure: '#5e7da3', mechanism: '#2f9e8f', electrical: '#8e6bb8', reference: '#c9a227'},
    meshes: [box([-300, -250, 0], [300, 250, 60]), box([0, -40, 60], [420, 40, 120]), box([-200, 60, 60], [-60, 200, 180]), box([900, -300, 0], [1100, 300, 900])],
    bodies: {frame: body('frame', 'structure', 'structure', 'frame'), arm: body('arm', 'mechanism', 'mechanism', 'arm'),
      battery: body('battery', 'electrical', 'electrical', 'battery'), target: body('target', 'reference', 'reference', 'field')},
    cases: [
      {id: 'raise', label: 'raise (operating)', kind: 'nominal', stage: 'operating', basis: 'Invented: turn the arm a quarter turn.', status: 'pass', allowanceMm: 5,
        bodies: {frame: {mesh: 0, matrices: [I]}, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(k))}, battery: {mesh: 2, matrices: [I]}, target: {mesh: 3, matrices: [I]}},
        removed: [], results: [{pair: ['arm', 'battery'], status: 'pass', lowerBoundMm: 12.5}],
        time: Array.from({length: 25}, (_, k) => k * 0.1), measure: Array.from({length: 25}, (_, k) => 'Arm at ' + Math.round(k / 24 * 90) + '°')},
      {id: 'package-displacement-control', label: 'package-displacement-control (displaced control)', kind: 'displaced control', stage: 'operating',
        basis: 'Invented: move the battery into the arc.', status: 'fail', allowanceMm: 5,
        bodies: {frame: {mesh: 0, matrices: [I]}, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(k))}, battery: {mesh: 2, matrices: [[1, 0, 0, 180, 0, 1, 0, -150, 0, 0, 1, 0]]}, target: {mesh: 3, matrices: [I]}},
        removed: [], results: [{pair: ['arm', 'battery'], status: 'fail', witness: {t: 0.5, gapMm: 0, volumeMm3: 4100}}]}],
    openingCase: 'raise',
    animations: [{id: 'raise', title: 'Raise', mission: true, cases: ['raise']}],
    parked: {screenedPairs: 6, positive: [], unresolved: []},
    mass: {limitKg: 20, inspectionKg: [14.2, 16.8], remainingKg: 3.2, runningKg: [15.1, 18.4],
      lines: [{id: 'structure', kg: [6, 7], members: ['frame'], basis: 'Invented estimate'}, {id: 'mechanisms', kg: [3, 3.6], members: ['arm'], basis: 'Invented estimate'},
        {id: 'power', kg: [2.2, 2.6], members: ['battery'], basis: 'Invented estimate'}, {id: 'remaining robot', kg: [3, 3.6], members: [], basis: 'Invented allowance'}],
      runningAdditions: [{name: 'payload', kg: [0.9, 1.6], members: []}], runningBasis: 'Invented payload'},
    power: [{case: 'raise-weak', duty: 'Raise the arm while driving', stage: 'raise', batteryCondition: 'weak', openCircuitV: 11.6, resistanceOhm: 0.03, requiredMinV: 9,
      loadedBusV: [10.1, 11.1], batterySideA: [20, 50], marginV: 1.1, status: 'pass',
      lines: [{name: 'drive', amps: [15, 35], members: []}, {name: 'arm', amps: [5, 15], members: ['arm']}]}],
    required: [{role: 'Frame', ids: ['frame']}, {role: 'Supply', ids: ['battery']}],
    narrativeReview: {source: pin('narrative.md'), objectives: [{objective: 'Raise the invented article', disposition: 'represented', basis: 'The raise case.'}]},
    motionEvidence: [{case: 'raise', kind: 'nominal', result: 'pass', playable: true, limitingPair: ['arm', 'battery'], limitingTime: null, limitingValue: {lowerBoundMm: 12.5},
      start: 'Installed STEP pose', groups: ['arm'], environment: 'Field fixtures: target', metric: 'Minimum surface gap; positive overlap volume', units: 'mm, mm³',
      allowanceMm: 5, allowanceBasis: 'Invented reserve', method: 'Interval bisection lower bound', basis: 'Invented: turn the arm a quarter turn.'},
      {case: 'package-displacement-control', kind: 'displaced control', result: 'rejected as expected', expected: 'fail', playable: true, limitingPair: ['arm', 'battery'],
        limitingTime: 0.5, limitingValue: {gapMm: 0, volumeMm3: 4100}, start: 'Commissioned start: battery displaced', groups: ['arm'], environment: 'Field fixtures: target',
        metric: 'Minimum surface gap; positive overlap volume', units: 'mm, mm³', allowanceMm: 5, allowanceBasis: 'Invented reserve', method: 'Exact distance and common volume at the witness pose'}],
    returnCriteria: {preliminary: ['A nominal path fails clearance or leaves an open interval'], conceptual: ['An accepted conceptual-design premise leaves its criterion']},
    interactions: [], adjustments: [], focus: 'Invented focus: check the arm clears the battery.', notes: ['Invented note on the model basis.'],
    cutaway: {label: 'Target cutaway', hides: ['target'], outline: [[900, -100, 300], [900, 100, 300], [900, 100, 500], [900, -100, 500]]}
  };
  return Object.assign(scene, overrides);
}

export function issueRelease(site,id,{status='layout-checked',edit=r=>r,missions,trial,freePath=false,display=d=>d,basis=id}={}) {
  const dir=path.join(site,tree,'releases',id);
  const motion=JSON.stringify({cases:[{id:'loaded-turn'},{id:'park'}],issue:basis});
  // One invented robot: the scene, ledger files and receipt below all carry the same figures.
  const base=receiptEraScene(),[turn,control]=base.cases,duty={...base.power[0],case:'weak traverse',status:'pass'};
  const budgets=JSON.stringify({masses:base.mass.lines,electricalCases:{'weak traverse':{openCircuitV:[duty.openCircuitV,12],resistanceOhm:[0.02,duty.resistanceOhm],
    batterySideA:Object.fromEntries(duty.lines.map(l=>[l.name,l.amps]))}}}),limits=JSON.stringify({inspectionLimitKg:base.mass.limitKg});
  const step={file:'design.step',sha256:sha('step '+basis)},sourcePin={file:'design.json',sha256:sha(motion)};
  // The scene the stock page reads repeats the receipt below: cases, control, objectives, mass and duties.
  const interactions=[readyInteraction(['loaded-turn'])];
  const scene=display({...base,issue:'synthetic-'+id,sources:{step,design:sourcePin},interactions,
    cases:[{...turn,id:'loaded-turn',label:'loaded-turn (operating)'},{...turn,id:'park',label:'park (park)',stage:'park'},control],openingCase:'loaded-turn',
    animations:[{id:'loaded-turn',title:'Loaded turn',mission:true,cases:['loaded-turn']},{id:'park',title:'Park',mission:false,cases:['park']}],
    narrativeReview:{source:null,objectives},mass:{...base.mass,inspectionKg:[11,12],remainingKg:2},
    power:[duty]});
  const content=Buffer.from(JSON.stringify(scene)),served=gzipSync(content),view=stockPage;
  const stages={'loaded-turn':{purpose:'operating'},park:{purpose:'park'}};
  if(trial&&freePath)stages['loaded-turn'].freePath={sample:{basis:'Invented free flight',trial}};
  else if(trial)stages['loaded-turn'].transportedBy={sample:{mechanisms:['carrier'],trial}};
  let receipt={schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-'+id,planSha256:sha(planOf(id)),status,
    missingInputs:[],reopen:[],step,design:sourcePin,parts:[{file:'export.step',sha256:step.sha256,solids:1}],narrativeReview:{source:{file:'narrative.md',sha256:sha('narrative')},objectives},
    stages,interactions,cycle:['loaded-turn','park'],cases:[{case:'loaded-turn',status:'pass',pairs:[]},{case:'park',status:'pass',pairs:[]}],
    control:{case:'loaded-turn',displaced:'rail',offsetMm:[0,-50,0],witness:{pair:['head','rail'],status:'fail'}},
    budgets:{source:{file:'budgets.json',sha256:sha(budgets)},limits:{file:'limits.json',sha256:sha(limits)},massStatus:'pass',inspectionKg:[11,12],remainingKg:2,runningKg:base.mass.runningKg,
      electricalCases:[{case:'weak traverse',status:'pass',batteryCondition:duty.batteryCondition,requiredMinV:duty.requiredMinV,marginV:duty.marginV,
        loadedBusV:duty.loadedBusV,batterySideA:duty.batterySideA}]},parked:base.parked,
    view:{file:'package-motion.html',sha256:sha(view),verified:true,
      scene:{file:'review-scene.json.gz',sha256:sha(served),contentSha256:sha(content),bytes:content.length}}};
  receipt=edit(receipt);
  const receiptBytes=JSON.stringify(receipt,null,2);
  write(dir,'index.html',view);write(dir,'review-scene.json.gz',served);write(dir,'design.json',motion);write(dir,'budgets.json',budgets);write(dir,'limits.json',limits);
  write(dir,'receipt.json',receiptBytes);
  const record={schema:'agent-frc/preliminary-release@1',release:id,issue:receipt.issue,phase:'preliminary-design',
    status:receipt.status,receipt:{file:'receipt.json',sha256:sha(receiptBytes)},view:{file:'index.html',sha256:sha(view)},
    scene:{file:'design.json',sha256:sha(motion),stepSha256:step.sha256},
    missionCases:missions??[mission]};
  write(dir,'release.json',record);
  return {dir,record};
}
/**
 * The receipt of a check of a detailed-design inputs folder: the published receipt bound to that folder's plan and to
 * the ledger and limits it holds. Writes the STEP the receipt names, so the folder holds every file of its receipt.
 * The design source places its solids from that STEP, which stands for the registered Fusion export.
 */
export function folderReceipt(root,folder,receipt,plan,ledger,basis) {
  write(root,folder+'/design.step','step '+basis);
  return {...receipt,planSha256:sha(plan),parts:[{file:folder+'/design.step',sha256:sha('step '+basis),solids:1}],budgets:{...receipt.budgets,source:{file:'budgets.json',sha256:sha(JSON.stringify(ledger,null,2))},
    limits:{...receipt.budgets.limits,file:'package-limits.json'}}};
}
/**
 * Commit the inputs of a published release: its plan, the files its receipt names, with the bytes the receipt recorded,
 * and missions.json, which meets every readiness criterion with the receipt.
 */
export function commitInputs(root,id,{basis=id,missions}={}) {
  const folder='cad/preliminary-design/releases/'+id+'/',published=path.join(root,'docs',tree,'releases',id);
  write(root,folder+'judgement.json',planOf(id));
  write(root,folder+'missions.json',readyMissions(missions??[mission],'loaded-turn',{park:'park'}));
  write(root,folder+'design.step','step '+basis);
  for(const [name,from] of [['design.json','design.json'],['budgets.json','budgets.json'],['limits.json','limits.json']])write(root,folder+name,readFileSync(path.join(published,from)));
}
export function listing(site,current,releases,designStatus,designs){write(site,tree+'/releases.json',{current,releases,...(designs?{designs}:{}),...(designStatus?{designStatus}:{})});}
