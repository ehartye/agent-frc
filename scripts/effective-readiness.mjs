#!/usr/bin/env node
/**
 * Report whether a preliminary design meets the exit criteria for being marked effective.
 *
 * Informational only: it never changes a receipt, adds no gate rule and always exits 0 once it can read the
 * project folder. Marking a design effective stays a project decision in a reviewed pull request.
 */
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Every stage of the narrative cycle that needs a checked case. */
export const cycleStages=['acquire','retain','transfer','deliver','reset','endgame','park','service'];

const named=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const value=v=>named(v)||typeof v==='number'&&Number.isFinite(v);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** A project-relative JSON file, or the reason it cannot be used. */
function load(root,name){
  const file=path.resolve(root,String(name));
  if(!named(name)||path.isAbsolute(name)||path.relative(root,file).startsWith('..'))return {reason:'not a project-relative file: '+String(name)};
  if(!existsSync(file)||!statSync(file).isFile())return {reason:'missing file '+name};
  const bytes=readFileSync(file);
  try{return {bytes,json:JSON.parse(bytes.toString('utf8'))};}catch{return {reason:name+' is not JSON'};}
}

/** Criterion 1: every stage of the mission cycle has a passing case in a layout-checked receipt. */
function wholeCycle(plan,planBytes,receipt,missions){
  const reasons=[],notes=[];
  if(!receipt)return {reasons:['No receipt: run the preliminary check and save its receipt'],notes};
  if(receipt.planSha256!==sha(planBytes))reasons.push('The receipt belongs to another layout plan; rerun the preliminary check on this plan');
  if(receipt.status!=='layout-checked'||receipt.partial)
    reasons.push('The layout check is '+(receipt.partial?'partial':String(receipt.status))+': clearance, mass and loaded voltage must all pass on the whole plan');
  const passed=new Map((Array.isArray(receipt.cases)?receipt.cases:[]).map(c=>[c.case,c.status]));
  const cycle=object(missions?.cycle)?missions.cycle:null;
  if(!cycle)reasons.push('No cycle map: list the cases for each narrative stage under cycle in missions.json ('+cycleStages.join(', ')+')');
  for(const stage of cycle?cycleStages:[]){
    const entry=cycle[stage];
    if(object(entry)&&named(entry.notApplicable)){notes.push(stage+': not applicable, '+entry.notApplicable);continue;}
    const cases=object(entry)&&Array.isArray(entry.cases)?entry.cases:[];
    if(!cases.length){reasons.push('Narrative stage '+stage+' has no case');continue;}
    for(const id of cases){
      if(!passed.has(id)||!object(receipt.stages?.[id]))reasons.push('Narrative stage '+stage+' names '+String(id)+', which is not a checked case');
      else if(passed.get(id)!=='pass')reasons.push('Narrative stage '+stage+': case '+id+' is '+passed.get(id));
    }
  }
  for(const key of Object.keys(cycle??{}))if(!cycleStages.includes(key))reasons.push('Unknown narrative stage '+key);
  return {reasons,notes};
}

/** What a trial record must show before its interaction counts as qualified. */
function qualification(record,name){
  const q=object(record)?record.qualification:null,reasons=[];
  if(!object(q))return ['trial '+name+' has no qualification record (result, control, brackets, timestep)'];
  if(q.result!=='pass')reasons.push('trial '+name+' does not record a passing result');
  if(!(object(q.control)&&named(q.control.condition)&&q.control.rejected===true))
    reasons.push('trial '+name+' lacks a control: a named adverse or disabled condition that the trial rejects');
  const brackets=Array.isArray(q.brackets)?q.brackets:[];
  if(!brackets.length||!brackets.every(b=>object(b)&&named(b.input)&&named(b.unit)&&value(b.passing)&&value(b.failing)&&b.passing!==b.failing))
    reasons.push('trial '+name+' lacks sensitivity brackets: each input with its unit, a passing value and a failing value');
  const t=q.timestep;
  if(!(object(t)&&typeof t.coarseS==='number'&&typeof t.fineS==='number'&&t.fineS>0&&t.coarseS>t.fineS&&t.sameOutcome===true))
    reasons.push('trial '+name+' lacks a timestep check: a coarse and a finer step in seconds with the same outcome');
  return reasons;
}

/** Criterion 2: every mission case moves on a pinned, qualified physics trial rather than a prescribed path. */
function trialDriven(root,plan,receipt,missions){
  const reasons=[],notes=[],cases=Array.isArray(missions?.missionCases)?missions.missionCases:[];
  if(!cases.length)return {reasons:['No mission case: declare each mission-critical interaction under missionCases in missions.json'],notes};
  const linked=[];
  for(const row of plan?.presentation?.fieldInteractions??[]){
    if(!object(row?.evidence))continue;
    const trial=load(root,row.evidence.file);
    if(trial.json&&object(trial.json))linked.push({pin:row.evidence,record:trial.json});
  }
  for(const m of cases){
    const where='Mission case '+String(m?.case)+(named(m?.accomplishes)?' ('+m.accomplishes+')':'');
    const stage=object(receipt?.stages?.[m?.case])?receipt.stages[m.case]:{};
    const pins=[...Object.values(stage.transportedBy??{}),...Object.values(stage.freePath??{})].map(s=>s?.evidence).filter(object);
    if(object(m?.trial))pins.push(m.trial);
    for(const l of linked)if((l.record.case??l.record.transport?.case??l.record.freePath?.case)===m?.case)pins.push(l.pin);
    const unique=[...new Map(pins.filter(p=>named(p.file)).map(p=>[p.file,p])).values()];
    if(!unique.length){
      reasons.push(where+': the motion is prescribed; no trial is pinned through transportedBy, freePath, a mission trial or a linked field interaction');
      continue;
    }
    for(const pin of unique){
      const trial=load(root,pin.file);
      if(trial.reason){reasons.push(where+': '+trial.reason);continue;}
      if(sha(trial.bytes)!==pin.sha256){reasons.push(where+': trial '+pin.file+' differs from its pinned SHA-256');continue;}
      for(const reason of qualification(trial.json,pin.file))reasons.push(where+': '+reason);
    }
    notes.push(String(m?.case)+': '+unique.map(p=>p.file).join(', '));
  }
  return {reasons,notes};
}

/** Criterion 3: every open risk is closed by a design change or carried as a bench test with pass and fail numbers. */
function risksResolved(plan,missions){
  const reasons=[],notes=[];
  for(const o of plan?.narrativeReview?.objectives??[])
    if(o?.disposition==='open')reasons.push('Narrative objective is still open: '+String(o.objective));
  const risks=missions?.risks;
  if(!Array.isArray(risks)){
    reasons.push('No risk register: list every open risk under risks in missions.json, or an empty list when none remains');
    return {reasons,notes};
  }
  const ids=new Set();
  for(const r of risks){
    if(!(object(r)&&named(r.id)&&named(r.risk))||ids.has(r.id)){reasons.push('Each risk needs a unique id and a description');continue;}
    ids.add(r.id);
    const b=r.benchTest;
    if(named(r.closedBy)){notes.push(r.id+': closed by '+r.closedBy);continue;}
    if(object(b)&&named(b.measure)&&value(b.pass)&&value(b.fail)&&b.pass!==b.fail){
      notes.push(r.id+': bench test, '+b.measure+' — pass '+b.pass+', fail '+b.fail+(named(b.unit)?' '+b.unit:''));continue;
    }
    reasons.push('Risk '+r.id+' has neither a closing design change (closedBy) nor a bench test with a measure, a pass value and a fail value');
  }
  for(const u of plan?.presentation?.uncoveredCases??[])
    if(named(u?.id)&&!ids.has(u.id))reasons.push('Uncovered case '+u.id+' has no entry in the risk register');
  return {reasons,notes};
}

/**
 * Evaluate the three exit criteria for one project folder. Paths are relative to the folder.
 * Returns {issue, criteria:[{id,title,met,reasons,notes}], verificationItems, met, of}.
 */
export function effectiveReadiness(root,{plan:planName='layout.json',receipt:receiptName='receipt.json',missions:missionsName='missions.json'}={}){
  const plan=load(root,planName),receipt=load(root,receiptName),missions=load(root,missionsName);
  const criteria=[];
  const add=(id,title,{reasons,notes})=>criteria.push({id,title,met:reasons.length===0,reasons,notes});
  const unreadable=[plan.reason&&'Layout plan: '+plan.reason,receipt.reason&&'Receipt: '+receipt.reason,missions.reason&&'Missions: '+missions.reason].filter(Boolean);
  const p=object(plan.json)?plan.json:null,r=object(receipt.json)?receipt.json:null,m=object(missions.json)?missions.json:null;
  // Without a readable plan nothing can be judged; an unreadable receipt or missions file is named under each criterion.
  const other=unreadable.filter(u=>!u.startsWith('Layout plan'));
  const judge=run=>p?(x=>({reasons:[...other,...x.reasons],notes:x.notes}))(run()):{reasons:unreadable,notes:[]};
  add('whole-cycle','Whole mission cycle checked for clearance, mass and voltage',judge(()=>wholeCycle(p,plan.bytes,r,m)));
  add('trial-driven','Every mission-critical interaction driven by a qualified physics trial',judge(()=>trialDriven(root,p,r,m)));
  add('risks-resolved','Every open risk closed by a design change or carried as a bench test with numbers',judge(()=>risksResolved(p,m)));
  const verificationItems=(Array.isArray(m?.risks)?m.risks:[]).filter(x=>object(x)&&object(x.benchTest)&&!named(x.closedBy))
    .map(x=>({id:x.id,...x.benchTest}));
  return {schema:'agent-frc/effective-readiness@1',issue:r?.issue??p?.issue??null,criteria,verificationItems,
    met:criteria.filter(c=>c.met).length,of:criteria.length};
}

/** The report as text for a reviewer. */
export function readinessText(report){
  const lines=['Effective-readiness report for '+(report.issue??'an unidentified issue'),
    'Informational: marking a design effective stays a project decision in a reviewed pull request.'];
  report.criteria.forEach((c,i)=>{
    lines.push((c.met?'[met]     ':'[not met] ')+(i+1)+'. '+c.title);
    for(const reason of c.reasons)lines.push('            - '+reason);
    for(const note of c.notes)lines.push('            · '+note);
  });
  lines.push('Bench tests to carry as verification items (results are not required to mark the design effective): '
    +(report.verificationItems.length?report.verificationItems.map(v=>v.id).join(', '):'none listed'));
  lines.push('Result: '+report.met+' of '+report.of+' criteria met.');
  return lines.join('\n')+'\n';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  let root,json=false,usage=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--json')json=true;
    else if(['--plan','--receipt','--missions'].includes(args[i])&&args[i+1])options[args[i].slice(2)]=args[++i];
    else if(!args[i].startsWith('--')&&root===undefined)root=args[i];
    else usage=true;
  }
  if(usage||root===undefined||!existsSync(root)||!statSync(root).isDirectory()){
    console.error('Usage: effective-readiness PROJECT [--plan layout.json] [--receipt receipt.json] [--missions missions.json] [--json]');
    process.exitCode=2;
  }else{
    const report=effectiveReadiness(path.resolve(root),options);
    process.stdout.write(json?JSON.stringify(report,null,2)+'\n':readinessText(report));
  }
}
