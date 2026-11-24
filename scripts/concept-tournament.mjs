// Concept study tournament: play every concept candidate and its one-at-a-time assumption variants in the same
// published match contexts, then rank the base candidates and report fragility and competitive ranges.
//
// npm run concept:study -- STUDY.json --out RESULTS.json [--html PAGE.html] [--allow-long] [--max-matches N] [--full]
//   STUDY.json is an agent-frc/alliance-study@1 study. It pins its rules profile as profile: {file, sha256} and each
//   candidate's concept bot as concept: {file, sha256}, both resolved from the study's folder; conceptSweeps is
//   optional (scripts/concept-study.mjs). Exit 0 on success, 2 on invalid input, 3 when the run budget stops it.
//   The results keep a summary of each match (detail: "summary"); --full keeps every event, period and roster.
//   Each base concept is also screened against the profile's robot limits (concept:check); an exceedance is
//   reported in the ranking and printed as a warning, and does not change the ranking or the Pareto flags.
//
// Margins are in expected points: a credited release scores the target's points × the port's successFraction.
// The ranking covers base candidates only. A variant changes one quantity; every other quantity stays at base.
import path from 'node:path';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadScoreObservations} from './score-observations.mjs';
import {embedConcepts} from './kickoff.mjs';
import {applyProfileDefaults,LABELS} from './concept-bot.mjs';
import {expandConceptStudy} from './concept-study.mjs';
import {prepareComparison,playRoleCell,summarizeComparison} from './strategy-lab.mjs';
import {conceptCheck} from './concept-check.mjs';

export const RESULTS_SCHEMA='agent-frc/concept-results@1';
export const DEFAULT_MAX_MATCHES=2000;
// The merge-time guideline of docs/testing-methodology.md, and the matches timed to project the run.
export const TIME_GUIDELINE_S=300, TIMED_MATCHES=3;
export const EXPECTED_POINTS_SCOPE='Expected points use declared success fractions; no physical reliability is inferred.';
const HELD_AT_BASE='Other swept quantities are held at their base values.';

const label=value=>typeof value==='string' && value.trim().length>0;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>JSON.parse(bytes.toString('utf8').replace(/^﻿/,''));
const tidy=n=>Number(n.toPrecision(12));
const posix=file=>file.split(path.sep).join('/');

// The cost of a candidate, from its document with profile defaults applied (applyProfileDefaults).
// assumedShare is the share of its labelled numbers (quantities and ranges) labelled `assumed`.
export function costSignals(doc) {
  const outputs=doc.outputs??[], ranged=outputs.filter(o=>o?.kind==='ranged').map(o=>o.ranged??{});
  let labelled=0, assumed=0;
  const walk=x=>{
    if(Array.isArray(x)){x.forEach(walk);return;}
    if(!x || typeof x!=='object')return;
    if(LABELS.includes(x.label) && (Number.isFinite(x.value) || Number.isFinite(x.min))){labelled++;if(x.label==='assumed')assumed++;}
    Object.values(x).forEach(walk);
  };
  walk(doc);
  return {massLbMax:Number.isFinite(doc.massLb?.max)?doc.massLb.max:null,inputPorts:(doc.inputs??[]).length,outputPorts:outputs.length,
    ranged:ranged.length>0,turret:ranged.some(r=>r.turret!=null),
    adjustableElevation:ranged.some(r=>Number.isFinite(r.elevationDeg?.min) && r.elevationDeg.max>r.elevationDeg.min),
    firesWhileMoving:ranged.some(r=>r.firesWhileMoving!==null && typeof r.firesWhileMoving==='object'),
    assumedShare:labelled?assumed/labelled:null};
}

// Input ports + output ports + turret + adjustable elevation + fires while moving.
export const featureCount=s=>s.inputPorts+s.outputPorts+[s.turret,s.adjustableElevation,s.firesWhileMoving].filter(Boolean).length;

// First place: the highest mean margin, then the highest worst margin, then the lower ID.
const byStanding=(a,b)=>b.meanMargin-a.meanMargin || b.worstMargin-a.worstMargin || (a.id<b.id?-1:a.id>b.id?1:0);
const firstOf=rows=>[...rows].sort(byStanding)[0];

// The analysis over played cells: {baseRoles: [{id, concept?}], contexts: [{id}], cells: [{role, context, margin}],
// axes and variants as expandConceptStudy returns them, signals: {<roleId>: costSignals}}.
export function analyzeTournament({baseRoles,contexts,cells,axes=[],variants=[],signals={}}) {
  const margin=new Map(cells.map(c=>[c.role+'\u0000'+c.context,c.margin]));
  const standing=id=>{
    const margins=contexts.map(c=>margin.get(id+'\u0000'+c.id));
    if(margins.some(m=>!Number.isFinite(m)))return null;
    // Rounded to 12 significant digits, so sums of fractional expected points compare exactly.
    return {id,margins:margins.map(tidy),meanMargin:tidy(margins.reduce((a,b)=>a+b,0)/margins.length),worstMargin:tidy(Math.min(...margins))};
  };
  const base=baseRoles.map(role=>{
    const row=standing(role.id);
    if(!row)throw Error('Role '+role.id+' needs a played margin in every context.');
    return {...row,concept:role.concept??null};
  });
  // Regret against the best base candidate in each context; variants are not candidates.
  const best=contexts.map((_,i)=>Math.max(...base.map(b=>b.margins[i])));
  const ranked=[...base].sort(byStanding).map((b,i)=>{
    const s=signals[b.id]??null;
    return {rank:i+1,id:b.id,concept:b.concept,meanMargin:b.meanMargin,worstMargin:b.worstMargin,
      maximumRegret:tidy(Math.max(...b.margins.map((m,j)=>best[j]-m))),
      margins:Object.fromEntries(contexts.map((c,j)=>[c.id,b.margins[j]])),
      costSignals:s,featureCount:s?featureCount(s):null};
  });
  // Pareto: no other candidate has a higher or equal mean margin with a lower or equal massLb.max and feature
  // count, and is strictly better in one of them. A candidate without a mass is not compared.
  const comparable=r=>r.costSignals && Number.isFinite(r.costSignals.massLbMax);
  const dominates=(o,r)=>o.meanMargin>=r.meanMargin && o.costSignals.massLbMax<=r.costSignals.massLbMax && o.featureCount<=r.featureCount &&
    (o.meanMargin>r.meanMargin || o.costSignals.massLbMax<r.costSignals.massLbMax || o.featureCount<r.featureCount);
  const ranking=ranked.map(r=>({...r,pareto:comparable(r)?!ranked.some(o=>o!==r && comparable(o) && dominates(o,r)):null}));
  const leader=ranking[0].id, second=ranking[1];
  // What puts the leader ahead of second place: the mean margin, the worst margin, or only the ID order.
  const leaderDecidedBy=!second || ranking[0].meanMargin>second.meanMargin?'meanMargin':
    ranking[0].worstMargin>second.worstMargin?'worstMargin':'id';

  const played=new Map(variants.filter(v=>v.status==='ok').map(v=>[v.id,standing(v.id)]).filter(([,row])=>row));
  const axisOf=v=>axes.find(a=>a.baseRole===v.baseRole && a.pointer===v.pointer);
  // A flip: one assumed variant, standing in for its base candidate, puts a different candidate first.
  const flips=[];
  for(const v of variants){
    if(!played.has(v.id) || axisOf(v)?.label!=='assumed')continue;
    const next=firstOf(base.map(b=>b.id===v.baseRole?{...played.get(v.id),id:b.id}:b)).id;
    if(next!==leader)flips.push({variant:v.id,pointer:v.pointer,value:v.value,newLeader:next});
  }

  const competitiveRanges=axes.map(axis=>{
    const role=axis.baseRole, runnerUp=firstOf(base.filter(b=>b.id!==role));
    const points=axis.values.flatMap(value=>{
      const row=value===tidy(axis.base)?base.find(b=>b.id===role):
        played.get(variants.find(v=>v.baseRole===role && v.pointer===axis.pointer && v.value===value && v.status==='ok')?.id);
      return row?[{value,meanMargin:row.meanMargin,worstMargin:row.worstMargin,competitive:row.meanMargin>=runnerUp.meanMargin}]:[];
    });
    const at=points.findIndex(p=>p.value===tidy(axis.base));
    const entry={role,pointer:axis.pointer,label:axis.label,base:axis.base,runnerUp:runnerUp.id,
      runnerUpMeanMargin:runnerUp.meanMargin,competitiveAtBase:points[at].competitive};
    if(entry.competitiveAtBase){
      let lo=at,hi=at;
      while(lo>0 && points[lo-1].competitive)lo--;
      while(hi<points.length-1 && points[hi+1].competitive)hi++;
      Object.assign(entry,{range:[points[lo].value,points[hi].value],
        breakEven:{low:lo>0?points[lo-1].value:null,high:hi<points.length-1?points[hi+1].value:null}});
    } else {
      // Not competitive at base: the nearest swept value on each side where it would match or overtake runnerUp.
      const nearest=list=>list.find(p=>p.competitive)?.value??null;
      Object.assign(entry,{range:null,breakEven:{low:null,high:null},
        overtakes:{low:nearest(points.slice(0,at).reverse()),high:nearest(points.slice(at+1))}});
    }
    return {...entry,margins:points,heldAtBase:true,
      statement:'Competitive where the mean margin is at least '+runnerUp.id+'’s '+runnerUp.meanMargin+' expected points. '+HELD_AT_BASE};
  });
  return {leader,leaderDecidedBy,ranking,fragility:{fragile:flips.length>0,flips},competitiveRanges,
    invalidVariants:variants.filter(v=>v.status==='invalid').map(({id,baseRole,pointer,value,error})=>({id,baseRole,pointer,value,error}))};
}

// Reads a {file, sha256} pin from the study's folder and verifies its digest.
function readPin(dir,ref,what) {
  if(!ref || typeof ref!=='object' || !label(ref.file) || !/^[a-f0-9]{64}$/.test(ref.sha256))
    throw Error(what+' must be pinned as {file, sha256}.');
  const file=path.resolve(dir,ref.file);
  let bytes;
  try{bytes=readFileSync(file);}catch{throw Error(what+' file '+ref.file+' cannot be read.');}
  if(hash(bytes)!==ref.sha256)throw Error('Source digest mismatch for '+ref.file+' ('+what+').');
  return {file,bytes};
}

// One match as the results keep it by default: the margin and scores, the regret and baseline changes, and each
// robot's per-period tallies. The event log, period detail and full rosters are kept only with --full.
export function summaryCell({context,match,role,focal,margin,score,ordinary,terminal,byRobot,regret,marginalAlliancePoints,marginChange}) {
  return {context,match,role,focal:{side:focal.side,slot:focal.slot,...(focal.concept===undefined?{}:{concept:focal.concept})},
    margin,score,ordinary,terminal,byRobot,regret,marginalAlliancePoints,marginChange};
}

const LIMIT_UNITS={perimeter:'in',startingHeight:'in',maxHeight:'in',extension:'in',mass:'lb'};
// concept:check's limit screen of one concept against the profile: each check's status and the exceedances.
export function limitScreen(document,profile) {
  const report=conceptCheck(document,profile);
  return {checks:report.limits,exceeds:Object.entries(report.limits).filter(([,status])=>status==='exceeds').map(([check])=>{
    const row=report.limitValues[check];
    return {check,value:row.conceptLb??row.conceptIn,limit:row.limit.value,unit:LIMIT_UNITS[check]};
  })};
}

// Builds and plays the tournament. options: maxMatches, allowLong, now (milliseconds), log, outDir (the folder
// result file references are relative to). Returns {status: 'ok', results} or {status: 'stopped', reason}.
export async function runTournament(studyFile,{maxMatches=DEFAULT_MAX_MATCHES,allowLong=false,full=false,now=()=>performance.now(),log=()=>{},outDir}={}) {
  const studyPath=path.resolve(studyFile), dir=path.dirname(studyPath), refer=file=>posix(path.relative(outDir??dir,file));
  const studyBytes=readFileSync(studyPath), study=decode(studyBytes);
  if(study?.schema!=='agent-frc/alliance-study@1')throw Error('Supply an agent-frc/alliance-study@1 concept study.');
  if(study.profile===undefined)throw Error('Pin the rules profile as profile: {file, sha256}.');
  const profilePin=readPin(dir,study.profile,'the rules profile');
  const profile=await loadScoreObservations(decode(profilePin.bytes),profilePin.file);
  const documents=new Map(), concepts=[];
  for(const role of Array.isArray(study.roles)?study.roles:[]){
    if(role?.concept===undefined)continue;
    const pin=readPin(dir,role.concept,'role '+role.id+' concept');
    let document;
    try{document=decode(pin.bytes);}catch(error){throw Error(role.concept.file+': '+error.message);}
    documents.set(role.id,document);
    concepts.push({role:role.id,id:document?.id,file:refer(pin.file),sha256:role.concept.sha256});
  }
  const expansion=expandConceptStudy(study,documents);
  // Embed each base and variant document once; two roles pinning one concept derive identical documents.
  const embed=new Map();
  for(const document of [...documents.values(),...expansion.variants.filter(v=>v.status==='ok').map(v=>v.document)])
    if(!embed.has(document.id))embed.set(document.id,document);
  const roles=expansion.roles.map(role=>documents.has(role.id) && role.concept?.file!==undefined?{...role,concept:{id:documents.get(role.id).id}}:role);
  const prepared=prepareComparison(embedConcepts(profile,[...embed.values()]),{...study,roles},{maxRoles:roles.length,studyDir:dir});

  const planned=roles.length*prepared.contexts.length;
  log('Planned '+planned+' matches: '+roles.length+' roles ('+expansion.baseRoles.length+' base, '+(roles.length-expansion.baseRoles.length)+
    ' variants) × '+prepared.contexts.length+' contexts.');
  if(planned>maxMatches){
    log('Stopped before play: '+planned+' matches exceed --max-matches '+maxMatches+'.');
    return {status:'stopped',reason:'max-matches',planned};
  }
  const order=prepared.contexts.flatMap(context=>prepared.roles.map(role=>[role,context]));
  // The clock is read at the start and after each timed match.
  const cells=[], timed=Math.min(TIMED_MATCHES,order.length), start=now();
  let last=start;
  for(const [i,[role,context]] of order.entries()){
    cells.push(playRoleCell(prepared,role,context));
    if(i<timed)last=now();
    if(i===timed-1){
      const each=(last-start)/1000/timed, projected=each*planned;
      log('Timed '+timed+' matches at '+each.toFixed(2)+' s each: projected '+Math.round(projected)+' s for '+planned+' matches.');
      if(projected>TIME_GUIDELINE_S && !allowLong){
        log('Stopped after '+timed+' of '+planned+' matches: the projection exceeds the '+TIME_GUIDELINE_S+' s guideline. Rerun with --allow-long to continue.');
        return {status:'stopped',reason:'time',planned,projectedS:projected};
      }
    }
  }
  const comparison=summarizeComparison(prepared,cells);
  const signals=Object.fromEntries([...documents].map(([role,document])=>[role,costSignals(applyProfileDefaults(document,profile))]));
  const analysis=analyzeTournament({baseRoles:expansion.baseRoles.map(r=>({id:r.id,concept:documents.get(r.id)?.id??null})),
    contexts:prepared.contexts,cells:comparison.cells,axes:expansion.axes,variants:expansion.variants,signals});
  const limits=new Map([...documents].map(([role,document])=>[role,limitScreen(document,profile)]));
  for(const [role,screen] of limits)for(const x of screen.exceeds)
    log('Warning: '+role+' exceeds the '+x.check+' limit: '+x.value+' '+x.unit+' over '+x.limit+' '+x.unit+'.');
  const mass=role=>{const m=documents.has(role)?applyProfileDefaults(documents.get(role),profile).massLb:undefined;
    return m?{min:m.min,max:m.max,label:m.label,basis:m.basis,default:m.default===true}:null;};
  const results={schema:RESULTS_SCHEMA,
    study:{file:refer(studyPath),sha256:hash(studyBytes)},profile:{file:refer(profilePin.file),sha256:study.profile.sha256},concepts,
    side:prepared.side,contexts:prepared.contexts.map(({id,basis})=>({id,basis})),plannedMatches:planned,
    leader:analysis.leader,leaderDecidedBy:analysis.leaderDecidedBy,ranking:analysis.ranking.map(r=>({...r,massLb:mass(r.id),limits:limits.get(r.id)??null})),fragility:analysis.fragility,
    competitiveRanges:analysis.competitiveRanges,axes:expansion.axes,
    variants:expansion.variants.map(({document,...v})=>({...v,concept:document?.id??null})),invalidVariants:analysis.invalidVariants,
    scope:comparison.scope+' '+EXPECTED_POINTS_SCOPE,detail:full?'full':'summary',
    comparison:full?comparison:{...comparison,cells:comparison.cells.map(summaryCell)}};
  return {status:'ok',results};
}

const USAGE='Usage: npm run concept:study -- STUDY.json --out RESULTS.json [--html PAGE.html] [--allow-long] [--max-matches N] [--full]';

// The command line. Returns the exit code; io injects the clock and output for tests.
export async function main(args,{now,log=console.log,error=console.error}={}) {
  let study,out,html,allowLong=false,full=false,maxMatches=DEFAULT_MAX_MATCHES;
  for(let i=0;i<args.length;i++){
    const arg=args[i], value=()=>{const v=args[++i];if(v===undefined || v.startsWith('--'))throw Error(USAGE);return v;};
    try{
      if(arg==='--out' && out===undefined)out=value();
      else if(arg==='--html' && html===undefined)html=value();
      else if(arg==='--allow-long')allowLong=true;
      else if(arg==='--full')full=true;
      else if(arg==='--max-matches'){maxMatches=Number(value());if(!Number.isInteger(maxMatches) || maxMatches<1)throw Error('--max-matches takes a positive whole number.');}
      else if(!arg.startsWith('--') && study===undefined)study=arg;
      else throw Error(USAGE);
    }catch(e){error(e.message);return 2;}
  }
  if(!study || !out){error(USAGE);return 2;}
  // Output folders are created before any match is played, so an unwritable path stops the run at once.
  const folder=file=>{
    try{mkdirSync(path.dirname(path.resolve(file)),{recursive:true});}
    catch(e){throw Error('Cannot create the folder for '+file+': '+e.message);}
  };
  try{
    folder(out);if(html!==undefined)folder(html);
    const run=await runTournament(study,{maxMatches,allowLong,full,log,outDir:path.dirname(path.resolve(out)),...(now?{now}:{})});
    if(run.status!=='ok')return 3;
    try{writeFileSync(out,JSON.stringify(run.results)+'\n');}catch(e){throw Error('Cannot write '+out+': '+e.message);}
    log('Results: '+path.resolve(out));
    if(html!==undefined){
      const page=new URL('./concept-results-page.mjs',import.meta.url);
      if(existsSync(page)){
        const {writeResultsPage}=await import(page.href);
        try{await writeResultsPage(run.results,html);}catch(e){throw Error('Cannot write '+html+': '+e.message);}
        log('Page: '+path.resolve(html));
      } else log('Results page not built: scripts/concept-results-page.mjs is not installed.');
    }
    return 0;
  }catch(e){error(e.message);return 2;}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main(process.argv.slice(2));
