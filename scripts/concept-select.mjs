// Record the concept a student selects from a concept study, and the one-sided premises preliminary design holds.
//
// node <plugin-root>/scripts/concept-select.mjs RESULTS.json --candidate ID --basis "WHY" --out DIR [--interface PART=GROUP]...
//   (npm run concept:select -- … in a plugin checkout)
//   Run from the project root. RESULTS.json is an agent-frc/concept-results@1 file (npm run concept:study); its
//   study and concept pins resolve from its folder. DIR must be inside the project. Exit 0 when written, 2 on bad input.
//
// DIR/concept-selection.json (agent-frc/concept-selection@1) pins the results file and the selected concept, keeps
// the student's basis and a snapshot of the ranking, and says whether the selection was first, Pareto and fragile.
// DIR/premises/<id>.json holds one accepted premise per swept quantity of the selected role with a break-even, plus
// a mass premise, in the shape scripts/kernel_layout/premises.py accepted reads. The mass premise observes the library's
// mass record (observes: mass.rangeKg), so preliminary design works out its current value; a rate premise names no library
// fact, and the author adds observes once a record states one. Each range premise is
// one-sided. Each quantity has a fixed better direction (betterDirection in concept-tournament.mjs): the premise
// bounds only the worse side, at the last competitive value before the break-even there, and its better side is the
// validity limit, so a better observation never reopens the design. A break-even found only on the better side is
// noise from a non-monotonic sweep: no premise is written, and the selection lists the pointer under notBounded.
// Paths are relative to the project root.
// Premise IDs are <study ID>.<concept ID>.<pointer path>, so selections from different studies cannot collide.
// A candidate that is not competitive at its base values (any candidate behind the leader) gets no rate premise:
// the selection records ratePremises "none — not competitive at base" and where the candidate would overtake,
// and the command prints a warning. Only its mass premise reaches preliminary design.
// A selected role's ranking is a recommendation from the modelled field; the selection is the student's decision.
import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sweepableQuantities} from './concept-study.mjs';
import {betterDirection} from './concept-tournament.mjs';

export const SELECTION_SCHEMA='agent-frc/concept-selection@1';
const USAGE='Usage: node "'+fileURLToPath(import.meta.url)+'" RESULTS.json --candidate ID --basis "WHY" --out DIR [--interface PART=GROUP]...';

const label=value=>typeof value==='string' && value.trim().length>0;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>JSON.parse(bytes.toString('utf8').replace(/^﻿/,''));
const posix=file=>file.split(path.sep).join('/');
const within=(root,file)=>{const rel=path.relative(root,file);return rel!=='' && !rel.startsWith('..') && !path.isAbsolute(rel);};
const segments=pointer=>pointer.split('/').slice(1,-1).map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'));

// The unit of a swept quantity, from its field name.
export function unitOf(pointer) {
  const parts=segments(pointer), name=parts.at(-1);
  if(parts[0]==='storage' && parts[1]==='capacity')return 'pieces';
  if(/InS2$/.test(name))return 'in/s²';
  if(/InS$/.test(name))return 'in/s';
  if(/DegS$/.test(name))return 'deg/s';
  if(name==='secondsPerPiece' || /S$/.test(name))return 's';
  if(/Fraction$/.test(name))return '1';
  throw Error('No unit is known for '+pointer+'.');
}

// The default interface group of a swept quantity: drive, the port id, or storage.
export function interfaceOf(pointer,doc) {
  const [part,index]=segments(pointer);
  if(part==='drive' || part==='storage')return part;
  const port=(part==='inputs'?doc.inputs:part==='outputs'?doc.outputs:undefined)?.[Number(index)];
  if(!label(port?.id))throw Error('No port is named by '+pointer+'.');
  return port.id;
}

const premiseId=(concept,tag)=>(concept+'.'+tag).replace(/[^A-Za-z0-9._-]/g,'_');

// The selection record and premise records for one candidate. renames maps a default interface name to a group.
export function conceptSelection({results,resultsRef,conceptRef,document,study,studyFile,candidate,basis,selectionFile,renames=new Map()}) {
  if(results?.schema!=='agent-frc/concept-results@1')throw Error('Supply an agent-frc/concept-results@1 file.');
  if(!label(basis))throw Error('Give the student’s reason for the selection with --basis.');
  const entry=results.ranking.find(r=>r.id===candidate);
  if(!entry)throw Error('Unknown candidate '+candidate+': choose one of '+results.ranking.map(r=>r.id).join(', ')+'.');
  const scenarioId=label(study?.id)?study.id:path.basename(studyFile,path.extname(studyFile));
  const scenario=candidate+(candidate===document.id?'':' (concept '+document.id+')')+' as the focal '+results.side+' robot in concept study '+scenarioId+
    ', contexts '+results.contexts.map(c=>c.id).join(', ')+'.';
  const quantities=new Map(sweepableQuantities(document).map(q=>[q.pointer,q]));
  const shared={scenario,scenarioId,phase:'conceptual-design',source:{file:selectionFile}};
  const premises=[], notBounded=[];
  for(const row of results.competitiveRanges.filter(r=>r.role===candidate)){
    const {low,high}=row.breakEven??{};
    if(!row.range || (low===null && high===null))continue;
    const q=quantities.get(row.pointer);
    if(!q)throw Error(row.pointer+' is not a sweepable quantity of '+document.id+'.');
    const direction=betterDirection(row.pointer), higher=direction==='higher';
    // The worse side: below the base for a quantity where higher is better, above it where lower is better.
    const worse=higher?low:high;
    if(worse===null){
      notBounded.push({pointer:row.pointer,betterDirection:direction,breakEven:{low,high},reason:'break-even only on the better side (non-monotonic sweep)'});
      continue;
    }
    const unit=unitOf(row.pointer),[limitLow,limitHigh]=q.validity,last=higher?row.range[0]:row.range[1];
    const at=v=>Number(v.toFixed(3))+(unit==='1'?'':' '+unit);
    premises.push({id:premiseId(scenarioId+'.'+document.id,segments(row.pointer).join('.')),...shared,
      basis:'Concept study '+scenarioId+': '+candidate+' stays competitive with runner-up '+row.runnerUp+' (mean margin at least '+
        Number(row.runnerUpMeanMargin.toFixed(3))+' expected points) for '+row.pointer+(higher?' down to ':' up to ')+at(last)+
        ', base '+at(row.base)+'; it stops being competitive at '+at(worse)+'; '+(higher?'higher':'lower')+' is better for this quantity, so '+
        'the premise bounds only the '+(higher?'lower':'upper')+' side; the '+(higher?'upper':'lower')+' bound is the validity limit '+
        at(higher?limitHigh:limitLow)+'. Other quantities held at base.',
      unit,interfaces:[interfaceOf(row.pointer,document)],criterion:{range:higher?[last,limitHigh]:[limitLow,last]},
      pointer:row.pointer,betterDirection:direction,base:row.base});
  }
  const mass=entry.massLb;
  if(!mass || !Number.isFinite(mass.max))throw Error('Candidate '+candidate+' has no mass range: give the concept massLb or the profile a mass limit.');
  const rates=premises.length;
  premises.push({id:premiseId(scenarioId+'.'+document.id,'massLb'),...shared,
    basis:'Mass range '+mass.min+'–'+mass.max+' lb, labelled '+mass.label+', '+(mass.default?'the profile default':
      'from the concept document, not the profile default')+': '+mass.basis+'. The drive and rate assumptions of '+document.id+
      ' were made for a robot at most '+mass.max+' lb.',
    unit:'lb',interfaces:['robot'],criterion:{range:[0,mass.max]},observes:'mass.rangeKg',betterDirection:'lower',base:mass.max});
  const used=new Set(premises.flatMap(p=>p.interfaces));
  for(const [part,group] of renames){
    if(!used.has(part))throw Error('--interface '+part+': no premise uses that interface; use one of '+[...used].join(', ')+'.');
    for(const p of premises)p.interfaces=p.interfaces.map(i=>i===part?group:i);
  }
  const folder=path.posix.dirname(selectionFile), rows=results.competitiveRanges.filter(r=>r.role===candidate), warnings=[];
  const behind=rows.filter(r=>!r.competitiveAtBase);
  const ratePremises=rates?'written':rows.length && behind.length===rows.length?'none — not competitive at base':'none — no worse-side break-even within the sweeps';
  if(!rates)warnings.push('Warning: '+candidate+(ratePremises==='none — not competitive at base'?' is not competitive at base against '+results.leader:
    ' has no worse-side break-even within its sweeps')+', so no rate premise is written; only the mass premise bounds preliminary design.'+
    (behind.some(r=>r.overtakes?.low!=null || r.overtakes?.high!=null)?' It would match or overtake at: '+behind.filter(r=>r.overtakes?.low!=null || r.overtakes?.high!=null)
      .map(r=>r.pointer+' '+[r.overtakes.low,r.overtakes.high].filter(v=>v!=null).join(' or ')).join('; ')+'.':''));
  const selection={schema:SELECTION_SCHEMA,selected:candidate,basis:basis.trim(),
    results:resultsRef,concept:conceptRef,scenarioId,
    wasFirst:results.leader===candidate,leader:results.leader,leaderDecidedBy:results.leaderDecidedBy,
    pareto:entry.pareto,fragile:results.fragility.fragile,flips:results.fragility.flips,
    ratePremises,notBounded,...(behind.length?{overtakes:behind.map(r=>({pointer:r.pointer,low:r.overtakes?.low??null,high:r.overtakes?.high??null}))}:{}),
    ranking:results.ranking,premises:premises.map(p=>({id:p.id,file:folder+'/premises/'+p.id+'.json'})),
    scope:results.scope,
    note:'The ranking is a recommendation from the modelled field; the student made this selection for the basis given.'};
  return {selection,premises,warnings};
}

// The premise files in a folder that an earlier selection into the same folder wrote and this run did not: JSON
// accepted premise records with phase conceptual-design whose source is this selection file. Anything else stays.
export function stalePremises(folder,written,selectionFile) {
  return readdirSync(folder).filter(name=>name.endsWith('.json') && !written.has(name)).map(name=>path.join(folder,name)).filter(file=>{
    let record;
    try{record=decode(readFileSync(file));}catch{return false;}
    return record!==null && typeof record==='object' && record.phase==='conceptual-design' && record.source?.file===selectionFile &&
      ['id','scenario','basis','unit'].every(k=>label(record[k])) && Array.isArray(record.interfaces) && Array.isArray(record.criterion?.range);
  });
}

// The command line. Returns the exit code; io injects the project root and output for tests.
export async function main(args,{cwd=process.cwd(),log=console.log,error=console.error}={}) {
  let resultsArg,candidate,basis,out;const renames=new Map();
  try{
    for(let i=0;i<args.length;i++){
      const arg=args[i],value=()=>{const v=args[++i];if(v===undefined || v.startsWith('--'))throw Error(USAGE);return v;};
      if(arg==='--candidate' && candidate===undefined)candidate=value();
      else if(arg==='--basis' && basis===undefined)basis=value();
      else if(arg==='--out' && out===undefined)out=value();
      else if(arg==='--interface'){
        const [part,group,...rest]=value().split('=');
        if(!label(part) || !label(group) || rest.length || renames.has(part))throw Error('Give each --interface once as PART=GROUP.');
        renames.set(part,group);
      }
      else if(!arg.startsWith('--') && resultsArg===undefined)resultsArg=arg;
      else throw Error(USAGE);
    }
    if(!resultsArg || !candidate || !out)throw Error(USAGE);
    if(!label(basis))throw Error('Give the student’s reason for the selection with --basis.');
    const root=path.resolve(cwd), resultsFile=path.resolve(root,resultsArg), outDir=path.resolve(root,out);
    if(!within(root,resultsFile) || !within(root,outDir))throw Error('Keep the results file and the selection folder inside the project.');
    const project=file=>posix(path.relative(root,file));
    const resultsBytes=readFileSync(resultsFile), results=decode(resultsBytes), base=path.dirname(resultsFile);
    const readPin=(ref,what)=>{
      if(!label(ref?.file) || !/^[a-f0-9]{64}$/.test(ref?.sha256 ?? ''))throw Error('The results file does not pin '+what+'.');
      const file=path.resolve(base,ref.file);
      let bytes;try{bytes=readFileSync(file);}catch{throw Error(what+' file '+ref.file+' cannot be read.');}
      if(hash(bytes)!==ref.sha256)throw Error('Source digest mismatch for '+ref.file+' ('+what+').');
      if(!within(root,file))throw Error(what+' file '+ref.file+' is outside the project.');
      return {file,bytes};
    };
    if(results?.schema!=='agent-frc/concept-results@1')throw Error('Supply an agent-frc/concept-results@1 file.');
    if(!results.ranking?.some(r=>r.id===candidate))throw Error('Unknown candidate '+candidate+': choose one of '+(results.ranking??[]).map(r=>r.id).join(', ')+'.');
    const pin=results.concepts?.find(c=>c.role===candidate);
    if(!pin)throw Error('Candidate '+candidate+' pins no concept bot.');
    const concept=readPin(pin,'the '+candidate+' concept'), study=readPin(results.study,'the study');
    const selectionFile=project(path.join(outDir,'concept-selection.json'));
    const {selection,premises,warnings}=conceptSelection({results,document:decode(concept.bytes),study:decode(study.bytes),studyFile:study.file,
      candidate,basis,selectionFile,renames,
      resultsRef:{file:project(resultsFile),sha256:hash(resultsBytes)},
      conceptRef:{id:pin.id,file:project(concept.file),sha256:pin.sha256}});
    mkdirSync(path.join(outDir,'premises'),{recursive:true});
    writeFileSync(path.join(outDir,'concept-selection.json'),JSON.stringify(selection,null,2)+'\n');
    for(const p of premises)writeFileSync(path.join(outDir,'premises',p.id+'.json'),JSON.stringify(p,null,2)+'\n');
    for(const w of warnings)log(w);
    log('Selection: '+selectionFile);
    for(const p of selection.premises)log('Premise: '+p.file);
    for(const file of stalePremises(path.join(outDir,'premises'),new Set(premises.map(p=>p.id+'.json')),selectionFile)){
      rmSync(file);
      log('Removed stale premise '+project(file));
    }
    return 0;
  }catch(e){error(e.message);return 2;}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main(process.argv.slice(2));
