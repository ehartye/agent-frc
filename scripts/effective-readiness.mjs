#!/usr/bin/env node
/**
 * Report whether a preliminary design meets the exit criteria for being marked effective.
 *
 * It reads the judgement file and the verdict the layout judgement gives on the library's records now
 * (layout_check.py --judge-only --json), and writes nothing. It always exits 0 once it can read the project folder.
 * The stage gate runs the same report and refuses to mark a design effective unless it meets every criterion.
 */
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

/** Every phase of the cycle, in order; each needs passing motions or a reason it does not apply. */
export const cycleStages=['acquire','retain','transfer','deliver','reset','endgame','park','service'];

const named=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const list=v=>Array.isArray(v)?v:[];
const rows=v=>list(v).filter(object);
const value=v=>named(v)||typeof v==='number'&&Number.isFinite(v);

/** A project-relative JSON file, or the reason it cannot be used. */
function load(root,name){
  if(!named(name)||path.isAbsolute(name))return {reason:'not a project-relative file: '+String(name)};
  const file=path.resolve(root,name),inside=path.relative(root,file);
  if(inside.startsWith('..')||path.isAbsolute(inside))return {reason:'not a project-relative file: '+name};
  try{
    if(!existsSync(file)||!statSync(file).isFile())return {reason:'missing file '+name};
    return {file,json:JSON.parse(readFileSync(file,'utf8').replace(/^﻿/,''))};
  }catch{return {reason:name+' is not readable JSON'};}
}

/** The verdict of the layout judgement on the committed records, or {reason} when it cannot be judged. Measures nothing. */
export function judgedVerdict(root,file){
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const run=spawnSync(python,['-B',fileURLToPath(new URL('./layout_check.py',import.meta.url)),root,path.relative(root,file).split(path.sep).join('/'),
    '--judge-only','--json','--quiet'],{encoding:'utf8',maxBuffer:256*1024*1024});
  if(run.error)return {reason:'The layout judgement could not run: '+run.error.message};
  if(run.status===0)try{return JSON.parse(run.stdout);}catch{/* reported below */}
  return {reason:'The layout judgement was refused: '+(run.stderr||run.stdout).trim()};
}

const unjudged=verdict=>!object(verdict)||named(verdict.reason)?{reasons:[object(verdict)?verdict.reason:'No verdict'],notes:[]}:null;

/** Criterion 1: a layout-checked verdict, and every phase of the cycle with passing motions or a reason it does not apply. */
function wholeCycle(verdict){
  const refused=unjudged(verdict);
  if(refused)return refused;
  const reasons=[],notes=[];
  if(verdict.status!=='layout-checked')
    reasons.push('The layout judgement is '+String(verdict.status)+': '+(rows(verdict.unmet).map(r=>String(r.text)).join('; ')||'no reason given'));
  const limits=rows(verdict.weight?.limits);
  if(!limits.length)reasons.push('No weight limit is judged: list the season\'s weight limits in its requirements file');
  for(const row of limits)if(row.status!=='pass')reasons.push('Weight limit '+row.name+' is '+String(row.status));
  for(const [motion,row] of Object.entries(object(verdict.electrical?.motions)?verdict.electrical.motions:{}))
    if(row?.status!=='pass')reasons.push('The bus voltage of '+motion+' is '+String(row?.status));
  const motions=object(verdict.motions)?verdict.motions:{},cycle=rows(verdict.cycle);
  for(const phase of cycleStages){
    const entry=cycle.find(c=>c.phase===phase);
    if(!entry){reasons.push('Narrative phase '+phase+' is not in the cycle');continue;}
    if(named(entry.notApplicable)){notes.push(phase+': not applicable, '+entry.notApplicable);continue;}
    for(const id of list(entry.motions)){
      const status=motions[id]?.status;
      if(status!=='pass')reasons.push('Narrative phase '+phase+': motion '+String(id)+' is '+String(status??'not judged'));
    }
  }
  return {reasons,notes};
}

/** The trial results that meet the effective bar. Every other word is a finding to act on. */
export const passingResults=['passed','covered by adjustment'];

/** Why one interaction's trial does not meet its bar: the engine its screen verdict asks for, a passing result, a declared and measured adjustment. */
function barReasons(row,adjustments){
  const where='Interaction '+row.id+' ('+(row.verdict??'no verdict')+')',t=object(row.trial)?row.trial:{},reasons=[];
  if(!named(t.name))return [where+': name its trial, or the reason it needs none, in the judgement file'];
  if(t.state==='not run')return [where+': not run yet. It decides '+row.decides+'. Run python -m frc_design_kernel try SOURCE --out RECORDS --trial "'+t.name+'"'];
  if(row.verdict==='needs 3D'&&t.engine!=='mujoco')reasons.push(where+': the screen says the answer depends on what one section cannot show, so try it in 3D ("engine": "mujoco"); trial '+t.name+' ran '+t.engine);
  if(!passingResults.includes(t.result))reasons.push(where+': trial '+t.name+' is '+t.result+(list(t.findings).length?': '+list(t.findings).join('; '):''));
  const named_=list(t.adjustments);
  if(row.verdict==='configurable'&&!named_.length)reasons.push(where+': a simulated result is only a best guess here. Declare the adjustment that covers the assumed range and name it under the trial\'s adjustments');
  for(const name of named_){
    const a=rows(adjustments).find(x=>x.name===name);
    if(!a)reasons.push(where+': trial '+t.name+' names adjustment '+name+', which the design source does not declare');
    else if(a.kind==='mechanical'&&!a.measured)reasons.push(where+': adjustment '+name+' is mechanical and is not measured at both ends. '+(a.hint??''));
    else if(a.kind==='mechanical'&&list(a.findings).length)reasons.push(where+': adjustment '+name+' at its ends: '+list(a.findings).join('; '));
  }
  return reasons;
}

/**
 * Criterion 2: every interaction that decides the design meets the bar its screen verdict sets, and every mission case
 * names a trial whose record is current and passed and that backs no interaction missing its bar.
 */
function interactionsMeetBar(verdict){
  const refused=unjudged(verdict);
  if(refused)return refused;
  const reasons=[],notes=[],failing=new Map();
  for(const row of list(verdict.interactions)){
    if(!object(row))continue;
    const t=object(row.trial)?row.trial:null;
    if(!named(row.decides)){reasons.push('Interaction '+row.id+': say in the judgement file what it decides');continue;}
    if(named(row.override))notes.push(row.id+': screened as '+row.screened+', taken as '+row.verdict+' because '+row.override);
    if(named(row.noTrial)){notes.push(row.id+': '+row.verdict+'; no trial, because '+row.noTrial);continue;}
    const found=barReasons(row,verdict.adjustments);
    reasons.push(...found);
    if(found.length&&named(t?.name))failing.set(t.name,row.id);
    notes.push(row.id+': '+row.verdict+'; trial '+(t?.name??'none')+(t?.engine?' ('+t.engine+')':'')+': '+(t?.state==='not run'||!t?'not run yet; it decides '+row.decides:t.result)
      +(list(t?.sensitivity).length?'; leans most on '+t.sensitivity[0]:''));
  }
  const cases=rows(verdict.missionCases);
  if(!cases.length)reasons.push('No mission case: declare each mission-critical trial under missionCases in the judgement file');
  for(const m of cases){
    if(m.state==='not run')reasons.push('Mission case '+m.name+': trial '+m.trial+' is not run yet. Run python -m frc_design_kernel try SOURCE --out RECORDS --trial "'+m.trial+'"');
    else if(!passingResults.includes(m.result))reasons.push('Mission case '+m.name+': trial '+m.trial+' is '+String(m.result));
    else if(failing.has(m.trial))reasons.push('Mission case '+m.name+': its trial '+m.trial+' backs interaction '+failing.get(m.trial)+', which does not meet its bar');
  }
  return {reasons,notes};
}

/** A bench test that states its measure, a pass value and a fail value. */
const benchTest=b=>object(b)&&named(b.measure)&&value(b.pass)&&value(b.fail)&&b.pass!==b.fail;

/** Criterion 3: every open risk in the judgement file is closed by a design change or carried as a bench test with pass and fail numbers. */
function risksResolved(plan){
  const reasons=[],notes=[];
  for(const o of rows(object(plan.narrative)?plan.narrative.objectives:null))
    if(o.disposition==='open')reasons.push('Narrative objective is still open: '+String(o.objective));
  if(!Array.isArray(plan.risks)){
    reasons.push('No risk register: list every open risk under risks in the judgement file, or an empty list when none remains');
    return {reasons,notes};
  }
  const ids=new Set();
  for(const r of plan.risks){
    if(!(object(r)&&named(r.id)&&named(r.risk))||ids.has(r.id)){reasons.push('Each risk needs a unique id and a description');continue;}
    ids.add(r.id);
    if(named(r.closedBy)){notes.push(r.id+': closed by '+r.closedBy);continue;}
    const b=r.benchTest;
    if(benchTest(b)){notes.push(r.id+': bench test, '+b.measure+' — pass '+b.pass+', fail '+b.fail+(named(b.unit)?' '+b.unit:''));continue;}
    reasons.push('Risk '+r.id+' has neither a closing design change (closedBy) nor a bench test with a measure, a pass value and a fail value');
  }
  return {reasons,notes};
}

/**
 * Evaluate the three exit criteria for one project folder. Paths are relative to the folder.
 * `design` is how the release reads in the index, NAME MAJOR.MINOR; the report is titled with it. `verdict` stands in for
 * the layout judgement's verdict (a test supplies one); without it the committed records are judged now.
 * Returns {issue, design, criteria:[{id,title,met,reasons,notes}], verificationItems, met, of}.
 */
export function effectiveReadiness(root,{release='',plan:planName,design,verdict}={}){
  const within=name=>named(release)?path.posix.join(String(release).replace(/\\/g,'/'),name):name;
  planName??=within('judgement.json');
  const plan=load(root,planName),p=!plan.reason&&object(plan.json)?plan.json:null;
  const unreadable=plan.reason?'Judgement: '+plan.reason:p?null:'Judgement: '+planName+' is not a JSON object';
  const v=unreadable?null:verdict??judgedVerdict(root,plan.file);
  const criteria=[];
  const add=(id,title,run)=>{
    let result;
    if(!p)result={reasons:[unreadable],notes:[]};
    else try{result=run();}
    catch(error){result={reasons:['Could not judge this criterion from malformed input: '+error.message],notes:[]};}
    criteria.push({id,title,met:result.reasons.length===0,reasons:result.reasons,notes:result.notes});
  };
  add('whole-cycle','Whole mission cycle checked for clearance, weight and bus voltage',()=>wholeCycle(v));
  add('interactions','Every deciding interaction meets the bar its screen verdict sets, and every mission case is backed by a passing trial',()=>interactionsMeetBar(v));
  add('risks-resolved','Every open risk closed by a design change or carried as a bench test with numbers',()=>risksResolved(p));
  const verificationItems=rows(p?.risks).filter(x=>named(x.id)&&benchTest(x.benchTest)&&!named(x.closedBy)).map(x=>({...x.benchTest,id:x.id}));
  return {schema:'agent-frc/effective-readiness@1',issue:named(p?.issue)?p.issue:null,...(named(design)?{design:design.trim()}:{}),criteria,verificationItems,
    met:criteria.filter(c=>c.met).length,of:criteria.length};
}

/** The report as text for a reviewer. */
export function readinessText(report){
  const lines=['Effective-readiness report for '+(report.design?report.design+' ('+(report.issue??'unidentified issue')+')':report.issue??'an unidentified issue'),
    'The stage gate marks a design effective only when every criterion is met.'];
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
    else if(['--release','--plan','--design'].includes(args[i])&&args[i+1])options[args[i].slice(2)]=args[++i];
    else if(!args[i].startsWith('--')&&root===undefined)root=args[i];
    else usage=true;
  }
  if(usage||root===undefined||!existsSync(root)||!statSync(root).isDirectory()){
    console.error('Usage: effective-readiness PROJECT [--release FOLDER] [--plan judgement.json] [--design "NAME MAJOR.MINOR"] [--json]');
    process.exitCode=2;
  }else{
    const report=effectiveReadiness(path.resolve(root),options);
    process.stdout.write(json?JSON.stringify(report,null,2)+'\n':readinessText(report));
  }
}
