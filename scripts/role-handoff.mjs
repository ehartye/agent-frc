import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {compareRoles,studyRows} from './strategy-lab.mjs';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {createMatchSeries} from './rehearsal-series-core.mjs';
import {auditPieceWindow} from './piece-window.mjs';
import {readStudy,evidenceReader,digest,label,atPointer} from './study-evidence.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=values=>[...values].sort();
const open=reason=>({status:'open',reason});
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}

export function deriveRoleDemand(selection,read,compiled) {
  assert(selection?.schema==='agent-frc/role-selection@1','Expected role-selection@1.');
  const profile=read(selection.profile), study=read(selection.study);
  const comparison=compiled??compareRoles(profile,study);
  const cell=comparison.cells.find(c=>c.role===selection.role && c.context===selection.context);
  assert(cell,'No matching focal role and context.');
  const period=cell.periods.find(p=>p.phase===selection.phase);
  const station=profile.rehearsal.stations?.find(s=>s.id===selection.station);
  assert(period && station && ['both',study.side].includes(station.side),'Choose a registered phase and compatible station.');
  const windowS=selection.windowS??[0,period.seconds];
  assert(Array.isArray(windowS)&&windowS.length===2&&windowS.every(Number.isFinite)&&
    windowS[0]>=0&&windowS[0]<windowS[1]&&windowS[1]<=period.seconds&&
    windowS.every(n=>Math.abs(n*20-Math.round(n*20))<1e-8),'Use an in-period window on rehearsal clock ticks.');
  const focalRobot=(cell.focal.side==='blue'?'B':'R')+cell.focal.slot;
  const acquisition=station.kind==='retrieval';
  const criterion=acquisition?'Possession acquired at '+station.id:station.criterion;
  const outcome=acquisition?'acquired':'credited';
  const identity={profileSha256:selection.profile.sha256,studySha256:selection.study.sha256,
    role:cell.role,context:cell.context,phase:period.phase,station:station.id,focalRobot,
    windowS:[...windowS],piece:station.piece,outcome,criterion};

  const contractKey=digest(JSON.stringify(identity));
  const witnesses=cell.events.filter(e=>e.phase===period.phase&&e.robot===focalRobot&&e.station===station.id&&
    e.outcome===outcome&&Math.round(e.timeS*20)>=Math.round(windowS[0]*20)&&Math.round(e.timeS*20)<Math.round(windowS[1]*20));
  const pieces=witnesses.flatMap(e=>e.pieces);
  // A receipt at startS belongs to this window. Capture stock immediately before that tick.
  const match=profile.rehearsal.series.matches.find(m=>m.id===cell.match);
  const engine=createFieldRehearsal(profile), run=createMatchSeries(engine,[{...match,roster:cell.roster}]);
  const index=cell.periods.indexOf(period);
  const offset=cell.periods.slice(0,index).reduce((sum,p)=>sum+p.seconds,0);
  run.advance(offset+Math.max(0,windowS[0]-engine.dt));
  const ledger=run.sim.game;
  const fieldConditions={setup:cell.setup,peers:cell.roster.filter(r=>r.side!==cell.focal.side||r.slot!==cell.focal.slot),
    robotsAtStart:run.sim.robots.map(r=>({id:r.id,xyIn:[...r.p],heading:r.heading,cargo:ledger.cargo[r.id].map(p=>p.id)})),
    occupancyAtStart:{...ledger.occupied},queuesAtStart:structuredClone(run.sim.resources)};

  const sources=profile.rehearsal.stations.filter(s=>s.kind==='retrieval'&&s.piece===station.piece&&
    ['both',study.side].includes(s.side)&&(acquisition?s.id===station.id:true));
  const openingStock=Object.fromEntries(sources.map(s=>[s.id,ledger.stock[s.id].map(p=>p.id)]));
  const preloadedPieces=ledger.cargo[focalRobot].filter(p=>p.type===station.piece).map(p=>p.id);
  const replenishments=[];
  const sourceIds=new Set(sources.map(s=>s.id));
  const firstTick=Math.max(1,Math.round(windowS[0]/engine.dt));
  for(let tick=firstTick;tick<Math.round(windowS[1]/engine.dt);tick++){
    const timeS=tick*engine.dt;
    for(const entry of run.sim.game.returning)if(sourceIds.has(entry.station)&&entry.readyAtS<=offset+timeS+1e-9)
      replenishments.push({station:entry.station,piece:entry.piece.id,timeS});
    run.advance(engine.dt);
  }
  const requiredPieces=pieces.length, seconds=windowS[1]-windowS[0];
  return {schema:'agent-frc/role-demand@1',identity,contractKey,fieldConditions,openingStock,preloadedPieces,replenishments,
    source:selection,requiredPieces,requiredPerSecond:requiredPieces/seconds,
    distinctPieces:new Set(pieces).size,witnesses,margin:cell.margin,
    status:requiredPieces?'observed-opportunity':'open',
    scope:'Reproduce the selected focal role’s observed opportunity in this field setup and half-open period window. A zero count provides no positive hardware target.'};
}

export function checkRoleInventory(episode,demand,clockOffsetS=0){
  const d=demand.identity;
  if(!episode.fieldConditions||!same(canonical(episode.fieldConditions),canonical(demand.fieldConditions)))
    return open('Episode does not identify the same peer plans, starting poses, cargo and field availability.');
  const opening=Object.values(demand.openingStock).flat();
  if(!Array.isArray(episode.initialPieces)||!Array.isArray(episode.preloadedPieces)||
    !same(sorted(episode.initialPieces),sorted(opening))||!same(sorted(episode.preloadedPieces),sorted(demand.preloadedPieces)))
    return open('Opening station stock or focal preload differs from the field window.');
  try {auditPieceWindow(episode);}catch(err){return open(err.message);}
  const sourceIds=Object.keys(demand.openingStock);
  const known=new Set([...opening,...demand.preloadedPieces,...demand.replenishments.map(e=>e.piece)]);
  if(episode.events.some(e=>!known.has(e.piece)))return open('An event uses a piece outside the field window inventory.');
  if(episode.events.some(e=>!['arrive','return'].includes(e.kind)&&e.focalRobot!==d.focalRobot))
    return open('A custody or scoring event belongs to another robot.');
  const locations=new Map(Object.entries(demand.openingStock).flatMap(([source,ids])=>ids.map(id=>[id,source])));
  for(const ev of episode.events){
    if(ev.kind==='arrive'||ev.kind==='return')locations.set(ev.piece,ev.station);
    if(ev.kind==='acquire'){
      if(!sourceIds.includes(ev.station)||locations.get(ev.piece)!==ev.station)return open('Acquisition was recorded at a different source.');
      locations.delete(ev.piece);
    }
  }
  if(episode.events.some(e=>['arrive','return'].includes(e.kind)&&!demand.replenishments.some(r=>
    r.station===e.station&&r.piece===e.piece&&Math.abs(r.timeS+clockOffsetS-e.timeS)<1e-8)))
    return open('A new supply or return lacks a matching field source and arrival time.');
  return null;
}

function measuredCandidate(concept,caseId,demand,read) {
  if(!concept)return open('Unknown architecture.');
  const run=concept.cases.find(c=>c.id===caseId);
  const execution=run?.source&&run.execution!==undefined?atPointer(read(run.source),run.execution):null;
  if(!execution?.roleEpisode)return open('No source-bound full-window episode for this architecture and case.');
  const local=typeof execution.roleEpisode==='string';
  if(local&&!execution.roleEpisode.startsWith(run.execution+'/'))return open('The episode pointer leaves the native execution.');
  const ref=local?{...run.source,pointer:execution.roleEpisode}:execution.roleEpisode;
  const episode=atPointer(read(ref),ref.pointer);
  const d=demand.identity;
  if(episode.runId!==run.runId||episode.concept!==concept.id||episode.case!==caseId)
    return open('Episode identity differs from the architecture execution.');
  if(episode.contractKey!==demand.contractKey||episode.focalRobot!==d.focalRobot||episode.criterion!==d.criterion||
    episode.phase!==d.phase||episode.station!==d.station||!same(episode.windowS,d.windowS))
    return open('Role, focal robot, outcome, source, phase or window differs from the field selection.');
  if(!label(episode.revision)||!['timing-model','field-rehearsal','integrated-simulation','physical'].includes(episode.evidence)||
    !episode.variation||typeof episode.variation!=='object'||Array.isArray(episode.variation)||
    !Object.keys(episode.variation).length||!Object.values(episode.variation).every(v=>label(v)||Number.isFinite(v)||typeof v==='boolean'))
    return open('Missing design revision, evidence class or executed starting condition.');
  if(!Array.isArray(episode.clockWitnesses)||episode.clockWitnesses.length!==2||episode.clockWitnesses.some((v,i)=>
    !v||v.timeS!==d.windowS[i]||!label(v.witness)))
    return open('Independent start and cutoff observations must span the complete role window.');
  const inventoryIssue=checkRoleInventory(episode,demand);
  if(inventoryIssue)return inventoryIssue;
  const kind=d.outcome==='acquired'?'acquire':'accept';
  const observed=episode.events.filter(e=>e.kind===kind);
  if(observed.some(e=>!label(e.witness)||!label(e.focalRobot)||!label(e.station)))
    return open('An outcome lacks its actor, station or observed witness.');
  const matching=observed.filter(e=>e.focalRobot===d.focalRobot&&e.station===d.station);
  const elapsed=d.windowS[1]-d.windowS[0],count=matching.length;
  const arrivals=episode.events.filter(e=>e.kind==='arrive').map(e=>[e.timeS,e.piece,e.station]);
  return {status:count>=demand.requiredPieces?'pass':'fail',concept:concept.id,case:caseId,runId:run.runId,revision:episode.revision,
    architecture:concept.architecture,source:ref,evidence:episode.evidence,variation:episode.variation,arrivals,
    count,rate:count/elapsed,witnesses:matching,remaining:demand.requiredPieces-count};
}

export function compareRefinements(handoff,concepts,read) {
  const selection=read(handoff.selection);
  const compiled=compareRoles(read(selection.profile),read(selection.study));
  const demand=deriveRoleDemand(selection,read,compiled);
  const policies=new Map([[selection.role,demand]]);
  const policyResult=role=>{
    if(!policies.has(role))policies.set(role,deriveRoleDemand({...selection,role},read,compiled));
    return policies.get(role);
  };
  const pairs=studyRows(handoff.pairs,'refinement',1,32).map(pair=>{
    assert(label(pair.premise)&&label(pair.change)&&label(pair.case)&&pair.before!==pair.after,'Describe the challenged premise, change and common case.');
    const beforeConcept=concepts.find(c=>c.id===pair.before),afterConcept=concepts.find(c=>c.id===pair.after);
    assert(beforeConcept&&afterConcept,'Unknown refinement architecture.');
    const graph=c=>sorted(c.interfaces.map(i=>JSON.stringify([i.from,i.to,i.exchange])));
    const contrast={before:beforeConcept.architecture,after:afterConcept.architecture,
      beforeInterfaces:beforeConcept.interfaces,afterInterfaces:afterConcept.interfaces,
      differentExchanges:!same(graph(beforeConcept),graph(afterConcept))};
    const before=measuredCandidate(beforeConcept,pair.case,demand,read),after=measuredCandidate(afterConcept,pair.case,demand,read);
    const record={id:pair.id,case:pair.case,premise:pair.premise,change:pair.change,nextExperiment:pair.nextExperiment,contrast,before,after};
    if(pair.fieldPolicies){
      const {before:beforePolicy,after:afterPolicy}=pair.fieldPolicies;
      assert(label(beforePolicy)&&label(afterPolicy)&&beforePolicy!==afterPolicy,'Identify two distinct registered field policies.');
      const trials=[policyResult(beforePolicy),policyResult(afterPolicy)];
      const compatible=trials.every(t=>same(canonical(t.fieldConditions),canonical(demand.fieldConditions))&&
        same(canonical(t.openingStock),canonical(demand.openingStock))&&same(t.preloadedPieces,demand.preloadedPieces));
      const policyRows=trials.map(t=>({policy:t.identity.role,count:t.requiredPieces,rate:t.requiredPerSecond,
        witnesses:t.witnesses,margin:t.margin}));
      record.fieldPolicies=compatible?{status:'compared',before:policyRows[0],after:policyRows[1],
        deltaPieces:policyRows[1].count-policyRows[0].count,scope:'Prescribed field behavior only; assembly motion and transfer remain separate.'}:
        open('The field policies enter the window with different robot poses, stock, cargo, queues or occupancy.');
    }
    if(demand.status==='open')return {...record,...open('No positive opportunity observed in the selected field window.')};
    if(before.status==='open'||after.status==='open')return {...record,...open('Both architectures need comparable observed outcomes.')};
    if(before.evidence!==after.evidence || before.revision===after.revision || before.runId===after.runId ||
      !same(canonical(before.variation),canonical(after.variation))||!same(before.arrivals,after.arrivals))
      return {...record,...open('The trials need distinct design revisions, matched evidence, supply and starting conditions.')};
    return {...record,status:'compared',deltaPieces:after.count-before.count,deltaPerSecond:after.rate-before.rate,
      afterMeetsRole:after.status==='pass'};
  });
  return {demand,pairs,scope:'Scoped before/after comparison. Other whole-robot objectives and adverse cases retain their separate results.'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [file,root,...extra]=process.argv.slice(2);
    assert(file&&!extra.length,'Usage: role-handoff.mjs SELECTION.json [PROJECT_ROOT]');
    console.log(JSON.stringify(deriveRoleDemand(readStudy(file).value,evidenceReader(root??path.dirname(file))),null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
