import {createHash} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {fieldPlayerPolicy} from '../../scripts/preliminary-release.mjs';
import {reviewScene} from './review-scene.mjs';

// Synthetic teaching fixtures: invented groups, cases and objectives with no relation to any game.
export const plugin=fileURLToPath(new URL('../..',import.meta.url));
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const stockPage=readFileSync(path.join(plugin,'templates','preliminary-review','review.html'),'utf8');
export const stableViewer=readFileSync(path.join(plugin,'templates','preliminary-review-index.html'));
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

export const fieldPage='<!doctype html><html lang="en"><head>'+
  '<meta http-equiv="Content-Security-Policy" content="'+fieldPlayerPolicy+'"><meta charset="utf-8">'+
  '<title>Invented lane trial</title><style>body{margin:0}</style></head><body><p>Preliminary design release</p><canvas></canvas>'+
  '<script>const frames=[0,0.1,0.2];requestAnimationFrame(()=>frames.length);</script></body></html>';
export const laneTrial=JSON.stringify({case:'loaded-turn',outcome:'The invented sample leaves the carrier toward the lane'});
export const laneObjective='Carry the sample to the bin';
export function issueRelease(site,id,{status='layout-checked',edit=r=>r,missions,trial,freePath=false,display=d=>d,field}={}) {
  const dir=path.join(site,tree,'releases',id);
  const motion=JSON.stringify({cases:[{id:'loaded-turn'},{id:'park'}],issue:id});
  // One invented robot: the scene, ledger files and receipt below all carry the same figures.
  const base=reviewScene(),[turn,control]=base.cases,duty={...base.power[0],case:'weak traverse',status:'pass'};
  const budgets=JSON.stringify({masses:base.mass.lines,electricalCases:{'weak traverse':{openCircuitV:[duty.openCircuitV,12],resistanceOhm:[0.02,duty.resistanceOhm],
    batterySideA:Object.fromEntries(duty.lines.map(l=>[l.name,l.amps]))}}}),limits=JSON.stringify({inspectionLimitKg:base.mass.limitKg});
  const step={file:'package.step',sha256:sha('step '+id)},motionPin={file:'paths.json',sha256:sha(motion)};
  // The scene the stock page reads repeats the receipt below: cases, control, objectives, mass and duties.
  const scene=display({...base,issue:'synthetic-'+id,sources:{step,motion:motionPin},
    cases:[{...turn,id:'loaded-turn',label:'loaded-turn (operating)'},{...turn,id:'park',label:'park (park)',stage:'park'},control],openingCase:'loaded-turn',
    narrativeReview:{source:null,objectives},mass:{...base.mass,inspectionKg:[11,12],remainingKg:2},
    power:[duty],
    fieldInteractions:field?field.rows??[{title:'Invented lane',href:'field/lane.html',objective:laneObjective,
      evidence:{file:'lane-trial.json',sha256:sha(laneTrial)},embed:true,objectiveKnown:true}]:[]});
  const content=Buffer.from(JSON.stringify(scene)),served=gzipSync(content),view=stockPage;
  const stages={'loaded-turn':{purpose:'operating'},park:{purpose:'park'}};
  if(trial&&freePath)stages['loaded-turn'].freePath={sample:{basis:'Invented free flight',evidence:{file:'acquire-trial.json',sha256:sha(trial)}}};
  else if(trial)stages['loaded-turn'].transportedBy={sample:{mechanisms:['carrier'],evidence:{file:'acquire-trial.json',sha256:sha(trial)}}};
  let receipt={schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-'+id,planSha256:sha('plan '+id),status,
    missingInputs:[],reopen:[],step,motion:motionPin,narrativeReview:{source:{file:'narrative.md',sha256:sha('narrative')},objectives},
    stages,cycle:['loaded-turn','park'],cases:[{case:'loaded-turn',status:'pass',pairs:[]},{case:'park',status:'pass',pairs:[]}],
    control:{case:'loaded-turn',displaced:'rail',offsetMm:[0,-50,0],witness:{pair:['head','rail'],status:'fail'}},
    budgets:{source:{file:'budgets.json',sha256:sha(budgets)},limits:{file:'limits.json',sha256:sha(limits)},massStatus:'pass',inspectionKg:[11,12],remainingKg:2,runningKg:base.mass.runningKg,
      electricalCases:[{case:'weak traverse',status:'pass',batteryCondition:duty.batteryCondition,requiredMinV:duty.requiredMinV,marginV:duty.marginV,
        loadedBusV:duty.loadedBusV,batterySideA:duty.batterySideA}]},parked:base.parked,
    view:{file:'package-motion.html',sha256:sha(view),verified:true,
      scene:{file:'review-scene.json.gz',sha256:sha(served),contentSha256:sha(content),bytes:content.length}}};
  receipt=edit(receipt);
  const receiptBytes=JSON.stringify(receipt,null,2);
  write(dir,'index.html',view);write(dir,'review-scene.json.gz',served);write(dir,'motion.json',motion);write(dir,'budgets.json',budgets);write(dir,'limits.json',limits);
  write(dir,'receipt.json',receiptBytes);
  const record={schema:'agent-frc/preliminary-release@1',release:id,issue:receipt.issue,phase:'preliminary-design',
    status:receipt.status,receipt:{file:'receipt.json',sha256:sha(receiptBytes)},view:{file:'index.html',sha256:sha(view)},
    scene:{file:'motion.json',sha256:sha(motion),stepSha256:step.sha256},
    missionCases:missions??[{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Carry the sample to the bin'}]};
  if(trial)write(dir,'acquire-trial.json',trial);
  if(field){
    const page=field.page??fieldPage;
    write(dir,'field/lane.html',page);write(dir,'lane-trial.json',laneTrial);
    record.fieldPlayers=field.players??[{file:'field/lane.html',sha256:sha(page),trial:{file:'lane-trial.json',sha256:sha(laneTrial)},objective:laneObjective}];
    for(const [name,bytes] of Object.entries(field.extra??{}))write(dir,name,bytes);
  }
  write(dir,'release.json',record);
  return {dir,record};
}
export function listing(site,current,releases,designStatus,effectiveHistory){write(site,tree+'/releases.json',{current,releases,...(designStatus?{designStatus}:{}),...(effectiveHistory?{effectiveHistory}:{})});}

export function fixture(t) {
  const temp=mkdtempSync(path.join(os.tmpdir(),'prelim-gate-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const approved=path.join(temp,'approved'),site=path.join(temp,'site');
  write(approved,'index.html','<a href="preliminary-design/">Preliminary design (work in progress)</a> detailed robot');
  write(approved,'models/robot.glb','approved detailed model');
  write(approved,'media/robot-still.png','approved still');
  write(approved,tree+'/index.html',stableViewer);
  issueRelease(approved,'layout-001');listing(approved,'layout-001',['layout-001']);
  cpSync(approved,site,{recursive:true});
  const policy={schema:'agent-frc/staged-model-policy@1',project:'Teaching project',modelFiles:['models/robot.glb'],mutableFieldPages:[],
    preliminaryReleases:{root:tree,primaryEntryPoints:['index.html','media/robot-still.png']}};
  return {temp,approved,site,policy};
}
export function next(site,id,options) {const r=issueRelease(site,id,options);listing(site,id,['layout-001',id]);return r;}
