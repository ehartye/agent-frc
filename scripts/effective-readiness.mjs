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
import {pathToFileURL} from 'node:url';

/** Every stage of the narrative cycle that needs a checked case. */
export const cycleStages=['acquire','retain','transfer','deliver','reset','endgame','park','service'];
/** The checked purpose a case must hold to stand for a narrative stage. */
const purposeOf=stage=>stage==='service'||stage==='park'?stage:'operating';

const named=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const list=v=>Array.isArray(v)?v:[];
const rows=v=>list(v).filter(object);
const value=v=>named(v)||typeof v==='number'&&Number.isFinite(v);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** A project-relative JSON file, or the reason it cannot be used. */
function load(root,name){
  if(!named(name)||path.isAbsolute(name))return {reason:'not a project-relative file: '+String(name)};
  const file=path.resolve(root,name),inside=path.relative(root,file);
  if(inside.startsWith('..')||path.isAbsolute(inside))return {reason:'not a project-relative file: '+name};
  try{
    if(!existsSync(file)||!statSync(file).isFile())return {reason:'missing file '+name};
    const bytes=readFileSync(file);
    return {bytes,json:JSON.parse(bytes.toString('utf8').replace(/^﻿/,''))};
  }catch{return {reason:name+' is not readable JSON'};}
}
/** A top-level record: the JSON object, or the reason it is unusable. */
function record(root,name){
  const file=load(root,name);
  return file.reason||object(file.json)?file:{reason:name+' is not a JSON object'};
}
/** Whether the receipt is a whole, layout-checked result of exactly this plan. */
const bound=(receipt,planBytes)=>object(receipt)&&receipt.planSha256===sha(planBytes)&&receipt.status==='layout-checked'&&!receipt.partial;

/** Criterion 1: every stage of the mission cycle has a passing case in a layout-checked receipt. */
function wholeCycle(planBytes,receipt,missions){
  const reasons=[],notes=[];
  if(!receipt)return {reasons:['No receipt: run the preliminary check and save its receipt'],notes};
  if(receipt.planSha256!==sha(planBytes))reasons.push('The receipt belongs to another layout plan; rerun the preliminary check on this plan');
  if(receipt.status!=='layout-checked'||receipt.partial)
    reasons.push('The layout check is '+(receipt.partial?'partial':String(receipt.status))+': clearance, mass and loaded voltage must all pass on the whole plan');
  if(list(receipt.missingInputs).length)reasons.push('The receipt lists missing inputs: '+list(receipt.missingInputs).map(String).join('; '));
  const budgets=object(receipt.budgets)?receipt.budgets:null,duties=rows(budgets?.electricalCases);
  if(budgets?.massStatus!=='pass')reasons.push('The inspection weight is not checked as passing (commission the weight budget)');
  if(!duties.length||!duties.every(d=>d.status==='pass'))reasons.push('The loaded voltage is not checked as passing in every commissioned case (commission the electrical cases)');
  // A case repeated in the receipt passes only when every row passes.
  const status=new Map();
  for(const c of rows(receipt.cases))status.set(c.case,status.has(c.case)&&status.get(c.case)!=='pass'?status.get(c.case):c.status);
  const cycle=object(missions?.cycle)?missions.cycle:null;
  if(!cycle)reasons.push('No cycle map: list the cases for each narrative stage under cycle in missions.json ('+cycleStages.join(', ')+')');
  for(const stage of cycle?cycleStages:[]){
    const entry=object(cycle[stage])?cycle[stage]:{},cases=list(entry.cases);
    if(named(entry.notApplicable)){
      if(cases.length)reasons.push('Narrative stage '+stage+' is marked not applicable and also lists cases; choose one');
      else notes.push(stage+': not applicable, '+entry.notApplicable);
      continue;
    }
    if(!cases.length){reasons.push('Narrative stage '+stage+' has no case');continue;}
    for(const id of cases){
      const checked=object(receipt.stages)&&object(receipt.stages[id])?receipt.stages[id]:null;
      if(!named(id)||!status.has(id)||!checked)reasons.push('Narrative stage '+stage+' names '+String(id)+', which is not a checked case');
      else if(status.get(id)!=='pass')reasons.push('Narrative stage '+stage+': case '+id+' is '+String(status.get(id)));
      else if(checked.purpose!==purposeOf(stage))
        reasons.push('Narrative stage '+stage+': case '+id+' is checked as '+String(checked.purpose)+', not as '+(purposeOf(stage)==='operating'?'an operating':'a '+purposeOf(stage))+' case');
    }
  }
  for(const key of Object.keys(cycle??{}))if(!cycleStages.includes(key))reasons.push('Unknown narrative stage '+key);
  return {reasons,notes};
}

/** The trial results that meet the effective bar. Every other word is a finding to act on. */
export const passingResults=['passed','covered by adjustment'];

/** Why one interaction's trial does not meet its bar: the engine its screen verdict asks for, a current record, a passing result, a declared and measured adjustment. */
function barReasons(row,adjustments){
  const where='Interaction '+row.id+' ('+(row.verdict??'no verdict')+')',t=object(row.trial)?row.trial:{},reasons=[];
  if(!named(t.name))return [where+': name its trial, or the reason it needs none, in the judgement file'];
  if(t.state==='not run')return [where+': trial '+t.name+' has not been run. Run python -m frc_design_kernel try SOURCE --out RECORDS --trial "'+t.name+'"'];
  if(t.state==='stale')reasons.push(where+': the record of trial '+t.name+' is stale ('+list(t.changes).join('; ')+'). Run it again with --trial "'+t.name+'"');
  if(row.verdict==='needs 3D'&&t.engine!=='mujoco')reasons.push(where+': the screen says the answer depends on what one section cannot show, so try it in 3D ("engine": "mujoco"); trial '+t.name+' ran '+t.engine);
  if(!passingResults.includes(t.result))reasons.push(where+': trial '+t.name+' is '+t.result+(list(t.findings).length?': '+list(t.findings).join('; '):''));
  const named_=list(t.adjustments);
  if(row.verdict==='configurable'&&!named_.length)reasons.push(where+': a simulated result is only a best guess here. Declare the adjustment that covers the assumed range and name it under the trial\'s adjustments');
  for(const name of named_){
    const a=rows(adjustments).find(x=>x.name===name);
    if(!a)reasons.push(where+': trial '+t.name+' names adjustment '+name+', which the receipt does not record');
    else if(a.kind==='mechanical'&&!a.measured)reasons.push(where+': adjustment '+name+' is mechanical and is not measured at both ends. '+(a.hint??''));
    else if(a.kind==='mechanical'&&list(a.findings).length)reasons.push(where+': adjustment '+name+' at its ends: '+list(a.findings).join('; '));
  }
  return reasons;
}

/**
 * Criterion 2: every interaction that decides the design meets the bar its screen verdict sets, and every mission
 * case is backed by such an interaction. Read from a whole, layout-checked receipt of this plan, which records the
 * verdicts and the library's trial results.
 */
function interactionsMeetBar(planBytes,receipt,missions){
  const reasons=[],notes=[],cases=rows(missions?.missionCases);
  if(!bound(receipt,planBytes))return {reasons:['Interactions are read from a whole, layout-checked receipt of this plan: run the layout check'],notes};
  const met=new Set();
  for(const row of rows(receipt.interactions)){
    const t=object(row.trial)?row.trial:null;
    if(!named(row.decides)){reasons.push('Interaction '+row.id+': say in the judgement file what it decides');continue;}
    if(named(row.override))notes.push(row.id+': screened as '+row.screened+', taken as '+row.verdict+' because '+row.override);
    if(named(row.noTrial)){notes.push(row.id+': '+row.verdict+'; no trial, because '+row.noTrial);continue;}
    const found=barReasons(row,receipt.adjustments);
    reasons.push(...found);
    notes.push(row.id+': '+row.verdict+'; trial '+(t?.name??'none')+(t?.engine?' ('+t.engine+')':'')+': '+(t?.result??t?.state??'not run')
      +(list(t?.sensitivity).length?'; leans most on '+t.sensitivity[0]:''));
    if(!found.length)for(const id of list(row.cases))met.add(id);
  }
  if(!cases.length)reasons.push('No mission case: declare each mission-critical interaction under missionCases in missions.json');
  for(const m of cases)
    if(named(m.case)&&!met.has(m.case))reasons.push('Mission case '+m.case+' is backed by no interaction that meets its bar: list it under the cases of the interaction whose trial decides it');
  return {reasons,notes};
}

/** A bench test that states its measure, a pass value and a fail value. */
const benchTest=b=>object(b)&&named(b.measure)&&value(b.pass)&&value(b.fail)&&b.pass!==b.fail;

/** Criterion 3: every open risk is closed by a design change or carried as a bench test with pass and fail numbers. */
function risksResolved(plan,missions){
  const reasons=[],notes=[];
  for(const o of rows(object(plan.narrativeReview)?plan.narrativeReview.objectives:null))
    if(o.disposition==='open')reasons.push('Narrative objective is still open: '+String(o.objective));
  if(!Array.isArray(missions?.risks)){
    reasons.push('No risk register: list every open risk under risks in missions.json, or an empty list when none remains');
    return {reasons,notes};
  }
  const ids=new Set();
  for(const r of missions.risks){
    if(!(object(r)&&named(r.id)&&named(r.risk))||ids.has(r.id)){reasons.push('Each risk needs a unique id and a description');continue;}
    ids.add(r.id);
    if(named(r.closedBy)){notes.push(r.id+': closed by '+r.closedBy);continue;}
    const b=r.benchTest;
    if(benchTest(b)){notes.push(r.id+': bench test, '+b.measure+' — pass '+b.pass+', fail '+b.fail+(named(b.unit)?' '+b.unit:''));continue;}
    reasons.push('Risk '+r.id+' has neither a closing design change (closedBy) nor a bench test with a measure, a pass value and a fail value');
  }
  for(const u of rows(object(plan.presentation)?plan.presentation.uncoveredCases:null))
    if(named(u.id)&&!ids.has(u.id))reasons.push('Uncovered case '+u.id+' has no entry in the risk register');
  return {reasons,notes};
}

/**
 * Evaluate the three exit criteria for one project folder. Paths are relative to the folder.
 * `design` is how the release reads in the index, NAME MAJOR.MINOR; the report is titled with it.
 * Returns {issue, design, criteria:[{id,title,met,reasons,notes}], verificationItems, met, of}.
 */
export function effectiveReadiness(root,{release='',plan:planName,receipt:receiptName,missions:missionsName,design}={}){
  // A release folder inside the project holds the three files; pins still resolve from the project root.
  const within=name=>named(release)?path.posix.join(String(release).replace(/\\/g,'/'),name):name;
  planName??=within('judgement.json');receiptName??=within('receipt.json');missionsName??=within('missions.json');
  const plan=record(root,planName),receipt=record(root,receiptName),missions=record(root,missionsName);
  const unreadable=[plan.reason&&'Layout plan: '+plan.reason,receipt.reason&&'Receipt: '+receipt.reason,missions.reason&&'Missions: '+missions.reason].filter(Boolean);
  const p=plan.reason?null:plan.json,r=receipt.reason?null:receipt.json,m=missions.reason?null:missions.json;
  // Without a readable plan nothing can be judged; an unreadable receipt or missions file is named under each criterion.
  const other=unreadable.filter(u=>!u.startsWith('Layout plan'));
  const criteria=[];
  const add=(id,title,run)=>{
    let result;
    if(!p)result={reasons:unreadable,notes:[]};
    else try{const x=run();result={reasons:[...other,...x.reasons],notes:x.notes};}
    catch(error){result={reasons:[...other,'Could not judge this criterion from malformed input: '+error.message],notes:[]};}
    criteria.push({id,title,met:result.reasons.length===0,reasons:result.reasons,notes:result.notes});
  };
  add('whole-cycle','Whole mission cycle checked for clearance, mass and voltage',()=>wholeCycle(plan.bytes,r,m));
  add('interactions','Every deciding interaction meets the bar its screen verdict sets, and backs every mission case',()=>interactionsMeetBar(plan.bytes,r,m));
  add('risks-resolved','Every open risk closed by a design change or carried as a bench test with numbers',()=>risksResolved(p,m));
  const verificationItems=rows(m?.risks).filter(x=>named(x.id)&&benchTest(x.benchTest)&&!named(x.closedBy)).map(x=>({...x.benchTest,id:x.id}));
  return {schema:'agent-frc/effective-readiness@1',issue:named(r?.issue)?r.issue:named(p?.issue)?p.issue:null,...(named(design)?{design:design.trim()}:{}),criteria,verificationItems,
    met:criteria.filter(c=>c.met).length,of:criteria.length};
}

/** The report as text for a reviewer. */
export function readinessText(report){
  const lines=['Effective-readiness report for '+(report.design?report.design+' ('+(report.issue??'unidentified issue')+')':report.issue??'an unidentified issue'),
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

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),options={};
  let root,json=false,usage=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--json')json=true;
    else if(['--release','--plan','--receipt','--missions','--design'].includes(args[i])&&args[i+1])options[args[i].slice(2)]=args[++i];
    else if(!args[i].startsWith('--')&&root===undefined)root=args[i];
    else usage=true;
  }
  if(usage||root===undefined||!existsSync(root)||!statSync(root).isDirectory()){
    console.error('Usage: effective-readiness PROJECT [--release FOLDER] [--plan judgement.json] [--receipt receipt.json] [--missions missions.json] [--design "NAME MAJOR.MINOR"] [--json]');
    process.exitCode=2;
  }else{
    const report=effectiveReadiness(path.resolve(root),options);
    process.stdout.write(json?JSON.stringify(report,null,2)+'\n':readinessText(report));
  }
}
