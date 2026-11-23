import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {reviewScene} from './review-scene.mjs';

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
export const objectives=[
  {objective:'Carry the sample to the bin',disposition:'represented',basis:'The loaded-turn case releases the sample over the bin'},
  {objective:'Hang from the bar',disposition:'open',basis:'No hanging mechanism selected yet'},
  {objective:'Return to the start box',disposition:'out-of-scope',basis:'Handled by the drive team'}];

/** `basis` names the release whose STEP and design source this one was checked on: its own, unless it renames another. */
export function issueRelease(site,id,{status='layout-checked',edit=r=>r,missions,trial,freePath=false,display=d=>d,basis=id}={}) {
  const dir=path.join(site,tree,'releases',id);
  const motion=JSON.stringify({cases:[{id:'loaded-turn'},{id:'park'}],issue:basis});
  // One invented robot: the scene, ledger files and receipt below all carry the same figures.
  const base=reviewScene(),[turn,control]=base.cases,duty={...base.power[0],case:'weak traverse',status:'pass'};
  const budgets=JSON.stringify({masses:base.mass.lines,electricalCases:{'weak traverse':{openCircuitV:[duty.openCircuitV,12],resistanceOhm:[0.02,duty.resistanceOhm],
    batterySideA:Object.fromEntries(duty.lines.map(l=>[l.name,l.amps]))}}}),limits=JSON.stringify({inspectionLimitKg:base.mass.limitKg});
  const step={file:'design.step',sha256:sha('step '+basis)},sourcePin={file:'design.json',sha256:sha(motion)};
  // The scene the stock page reads repeats the receipt below: cases, control, objectives, mass and duties.
  const scene=display({...base,issue:'synthetic-'+id,sources:{step,design:sourcePin},
    cases:[{...turn,id:'loaded-turn',label:'loaded-turn (operating)'},{...turn,id:'park',label:'park (park)',stage:'park'},control],openingCase:'loaded-turn',
    animations:[{id:'loaded-turn',title:'Loaded turn',mission:true,cases:['loaded-turn']},{id:'park',title:'Park',mission:false,cases:['park']}],
    narrativeReview:{source:null,objectives},mass:{...base.mass,inspectionKg:[11,12],remainingKg:2},
    power:[duty]});
  const content=Buffer.from(JSON.stringify(scene)),served=gzipSync(content),view=stockPage;
  const stages={'loaded-turn':{purpose:'operating'},park:{purpose:'park'}};
  if(trial&&freePath)stages['loaded-turn'].freePath={sample:{basis:'Invented free flight',evidence:{file:'acquire-trial.json',sha256:sha(trial)}}};
  else if(trial)stages['loaded-turn'].transportedBy={sample:{mechanisms:['carrier'],evidence:{file:'acquire-trial.json',sha256:sha(trial)}}};
  let receipt={schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-'+id,planSha256:sha('plan '+id),status,
    missingInputs:[],reopen:[],step,design:sourcePin,parts:[{file:'export.step',sha256:step.sha256,solids:1}],narrativeReview:{source:{file:'narrative.md',sha256:sha('narrative')},objectives},
    stages,cycle:['loaded-turn','park'],cases:[{case:'loaded-turn',status:'pass',pairs:[]},{case:'park',status:'pass',pairs:[]}],
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
    missionCases:missions??[{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Carry the sample to the bin'}]};
  if(trial)write(dir,'acquire-trial.json',trial);
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
/** Commit the inputs of a published release: its plan and the files its receipt names, with the bytes the receipt recorded. */
export function commitInputs(root,id,{basis=id}={}) {
  const folder='cad/preliminary-design/releases/'+id+'/',published=path.join(root,'docs',tree,'releases',id);
  write(root,folder+'judgement.json','plan '+id);
  write(root,folder+'design.step','step '+basis);
  for(const [name,from] of [['design.json','design.json'],['budgets.json','budgets.json'],['limits.json','limits.json']])write(root,folder+name,readFileSync(path.join(published,from)));
}
export function listing(site,current,releases,designStatus,designs){write(site,tree+'/releases.json',{current,releases,...(designs?{designs}:{}),...(designStatus?{designStatus}:{})});}
