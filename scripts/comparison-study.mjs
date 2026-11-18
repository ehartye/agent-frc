import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {digest} from './decision-chain.mjs';
import {validateFieldModel} from './field-semantics.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const probability=n=>Number.isFinite(n)&&n>=0&&n<=1;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const unique=(xs,label)=>{check(Array.isArray(xs)&&xs.length>0,`${label} required`);const seen=new Set();for(const x of xs){check(ident(x.id)&&!seen.has(x.id),`Duplicate/invalid ${label} ID`);seen.add(x.id);}};
export const MODEL='frc-abstract-inventory-comparison/v1';
export const LIMITATIONS=[
 'Hypothetical discrete-time scheduling and inventory model, not a full match simulator.',
 'Collection and release are abstract assumed opportunities; neither proves spatial reachability or physical motion.',
 'Released pieces are unverified, not scored. Flight, contact, scoring assessment, return paths and penalties are unimplemented.',
 'Opportunity windows are scenario assumptions, not an implementation of official match phases or HUB timing.',
 'No measured robot hardware, actual team inventory, tuning effectiveness, safety or legality established.',
 'Shared randomness controls sampling variation only; it does not validate assumed parameters or omitted physics.'
];
export function validateExperiment(config,fieldPackage){
 check(config?.schema===MODEL&&config.season===2026,'Only explicit 2026 abstract experiment supported');
 check(fieldPackage?.schema==='frc-sourced-field-package/v1'&&fieldPackage.season===2026,'2026 field package required');
 validateFieldModel(fieldPackage.fieldModel);check(fieldPackage.fieldModel.season===2026,'Field season mismatch');
 check(hash(config.fieldPackageSha256)&&digest(fieldPackage)===config.fieldPackageSha256,'Field package hash mismatch');
 check(config.basis==='hypothetical-unmeasured','Explicit hypothetical basis required');
 check(typeof config.assumptionStatement==='string'&&config.assumptionStatement.trim().length>0,'Assumption statement required');
 check(integer(config.ticks,1,10000)&&Number.isFinite(config.tickSeconds)&&config.tickSeconds>0,'Bounded ticks and positive seconds required');
 check(Array.isArray(config.seeds)&&config.seeds.length>0&&config.seeds.length<=1000&&config.seeds.every(s=>integer(s,0,0xffffffff))&&new Set(config.seeds).size===config.seeds.length,'Unique uint32 seeds required');
 for(const k of ['concepts','policies','scenarios'])unique(config[k],k);
 check(config.concepts.length<=20&&config.policies.length<=20&&config.scenarios.length<=100,'Experiment factor limit exceeded');
 check(config.concepts.length*config.policies.length*config.scenarios.length*config.seeds.length<=10000,'Experiment run limit exceeded');
 const C=config.concepts.length,P=config.policies.length,S=config.scenarios.length;
 check(S*(P*C*(C-1)/2+C*P*(P-1)/2)<=10000,'Paired comparison limit exceeded');
 check(C*P*S*config.seeds.length*config.ticks<=100000,'Experiment trace limit exceeded');
 for(const c of config.concepts){
  check(c.basis==='hypothetical-unmeasured','Concept parameters must remain hypothetical');
  for(const k of ['capacity','acquirePerOpportunity','releasePerOpportunity'])check(integer(c[k],1,1000),`Invalid concept ${k}`);
  for(const k of ['acquireCooldownTicks','releaseCooldownTicks'])check(integer(c[k],0,config.ticks),`Invalid concept ${k}`);
 }
 check(config.concepts.length*config.policies.length*config.scenarios.length*config.seeds.length*config.ticks*Math.max(...config.concepts.map(c=>Math.max(c.acquirePerOpportunity,c.releasePerOpportunity)))<=2000000,'Experiment operation limit exceeded');
 for(const p of config.policies){check(p.kind==='threshold-release-when-open','Unknown policy');check(Number.isFinite(p.releaseThresholdFraction)&&p.releaseThresholdFraction>0&&p.releaseThresholdFraction<=1,'Invalid release threshold');}
 for(const s of config.scenarios){
  check(s.basis==='hypothetical-unmeasured','Scenario parameters must remain hypothetical');
  check(fieldPackage.fieldModel.locations.some(l=>l.id===s.retrievalLocationId&&l.purpose==='retrieval'),'Missing retrieval location');
  check(fieldPackage.fieldModel.locations.some(l=>l.id===s.releaseTargetId&&l.purpose==='scoring'),'Missing scoring target');
  check(integer(s.initialAvailable,0,1000000)&&integer(s.initialReserve,0,1000000),'Explicit finite initial stocks required');
  check(probability(s.acquireSuccessProbability)&&probability(s.releaseSuccessProbability),'Probabilities must be in [0,1]');
  check(Array.isArray(s.releaseOpportunityWindows)&&Array.isArray(s.replenishments),'Explicit windows and replenishments required');
  let last=0;for(const w of s.releaseOpportunityWindows){check(Array.isArray(w)&&w.length===2&&integer(w[0],0,config.ticks-1)&&integer(w[1],1,config.ticks)&&w[0]<w[1]&&w[0]>=last,'Windows must be ordered nonoverlapping half-open tick intervals');last=w[1];}
  const times=new Set();let supply=0;for(const r of s.replenishments){check(integer(r.tick,0,config.ticks-1)&&!times.has(r.tick)&&integer(r.count,1,1000000),'Invalid/duplicate replenishment');times.add(r.tick);supply+=r.count;}
  check(supply<=s.initialReserve,'Replenishment exceeds explicit reserve');
 }
 return true;
}
// Random-access draws are keyed to exogenous process and tick/slot, never candidate or call order.
export function draw(seed,scenarioId,process,tick,slot){
 const h=createHash('sha256').update(JSON.stringify([MODEL,seed,scenarioId,process,tick,slot])).digest();
 return h.readUInt32BE(0)/0x100000000;
}
function modelPin(){
 const files=['comparison-study.mjs','decision-chain.mjs','field-semantics.mjs','resource-baseline.mjs','comparison-link-validation.mjs','fuel-annotation-validation.mjs','field-references.mjs','hypothetical-envelope-validation.mjs','hardware-catalog.mjs','fabrication-chain-validation.mjs','fabrication-capabilities.mjs','chassis-chain-validation.mjs','chassis-ledger.mjs'];
 return {id:MODEL,sourceSha256:digest(Object.fromEntries(files.map(f=>[f,fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')]))),runtime:{node:process.versions.node},randomStream:'sha256-keyed-first-uint32be/v1'};
}
function manifestFor(config,concept,policy,scenario,seed,model){
 return {season:2026,basis:config.basis,assumptionStatement:config.assumptionStatement,assumptionStatementSha256:digest(config.assumptionStatement),limitations:LIMITATIONS,fieldPackageSha256:config.fieldPackageSha256,model,concept:{id:concept.id,sha256:digest(concept)},policy:{id:policy.id,sha256:digest(policy)},scenario:{id:scenario.id,sha256:digest(scenario)},seed,ticks:config.ticks,tickSeconds:config.tickSeconds,observationContract:'own buffer and abstract source stock/opportunity flags; no future draws',metrics:['releasedUnverified','acquired','failedAcquisitions','failedReleases','remainingBuffer'],stoppingRule:'fixed tick count; retain failed runs'};
}
function execute(config,concept,policy,scenario,seed,model){
 const manifest=manifestFor(config,concept,policy,scenario,seed,model),runId=digest(manifest);
 let state={available:scenario.initialAvailable,reserve:scenario.initialReserve,buffer:0,releasedUnverified:0};
 const initialTotal=state.available+state.reserve;let nextReady=0;
 const replenishments=new Map(scenario.replenishments.map(r=>[r.tick,r.count]));
 const windows=new Uint8Array(config.ticks);for(const [start,end] of scenario.releaseOpportunityWindows)windows.fill(1,start,end);
 const trace=[],metrics={releasedUnverified:0,acquired:0,failedAcquisitions:0,failedReleases:0,remainingBuffer:0};
 try{
  for(let tick=0;tick<config.ticks;tick++){
   const replenish=replenishments.get(tick)??0;
   state.reserve-=replenish;state.available+=replenish;
   const open=windows[tick]===1;
   let action='idle',transferred=0,failed=0;
   if(tick<nextReady)action='cooldown';
   else if(open&&state.buffer>=Math.ceil(concept.capacity*policy.releaseThresholdFraction)){
    action='release';const attempts=Math.min(state.buffer,concept.releasePerOpportunity);
    for(let slot=0;slot<attempts;slot++){if(draw(seed,scenario.id,'release',tick,slot)<scenario.releaseSuccessProbability)transferred++;else failed++;}
    state.buffer-=transferred;state.releasedUnverified+=transferred;metrics.failedReleases+=failed;nextReady=tick+1+concept.releaseCooldownTicks;
   }else if(state.available>0&&state.buffer<concept.capacity){
    action='acquire';const attempts=Math.min(state.available,concept.capacity-state.buffer,concept.acquirePerOpportunity);
    for(let slot=0;slot<attempts;slot++){if(draw(seed,scenario.id,'acquire',tick,slot)<scenario.acquireSuccessProbability)transferred++;else failed++;}
    state.available-=transferred;state.buffer+=transferred;metrics.acquired+=transferred;metrics.failedAcquisitions+=failed;nextReady=tick+1+concept.acquireCooldownTicks;
   }
   check(Object.values(state).every(n=>integer(n,0,2000000))&&state.buffer<=concept.capacity,'Invalid inventory state');
   check(Object.values(state).reduce((a,b)=>a+b,0)===initialTotal,'Inventory conservation failure');
   trace.push({tick,open,action,transferred,failed,replenished:replenish,state:{...state}});
  }
  metrics.releasedUnverified=state.releasedUnverified;metrics.remainingBuffer=state.buffer;
  return {runId,manifest,status:'completed',metrics,score:null,winProbability:null,physicalReachability:'not-assessed',initialTotal,finalState:state,traceSha256:digest(trace),trace};
 }catch(error){return {runId,manifest,status:'failed',error:error.message,metrics:null,score:null,winProbability:null,physicalReachability:'not-assessed',initialTotal,finalState:state,traceSha256:digest(trace),trace};}
}
export function runTrial(config,fieldPackage,{conceptId,policyId,scenarioId,seed}){
 validateExperiment(config,fieldPackage);
 const concept=config.concepts.find(x=>x.id===conceptId),policy=config.policies.find(x=>x.id===policyId),scenario=config.scenarios.find(x=>x.id===scenarioId);
 check(concept&&policy&&scenario&&config.seeds.includes(seed),'Unknown trial selection');
 return execute(config,concept,policy,scenario,seed,modelPin());
}
// No winner or global ranking: pairing is per scenario and changes one factor at a time.
function pairedSummaries(runs){
 const index=new Map(),combination=(scenario,concept,policy)=>JSON.stringify([scenario,concept,policy]);
 for(const r of runs){const k=combination(r.manifest.scenario.id,r.manifest.concept.id,r.manifest.policy.id);if(!index.has(k))index.set(k,[]);index.get(k).push(r);}
 const groups=[];const candidates=[...new Set(runs.map(r=>r.manifest.concept.id))].sort(),policies=[...new Set(runs.map(r=>r.manifest.policy.id))].sort(),scenarios=[...new Set(runs.map(r=>r.manifest.scenario.id))].sort();
 for(const scenario of scenarios)for(const mode of ['fixed-policy','fixed-concept']){
  const fixeds=mode==='fixed-policy'?policies:candidates,variables=mode==='fixed-policy'?candidates:policies;
  for(const fixed of fixeds)for(let i=0;i<variables.length;i++)for(let j=i+1;j<variables.length;j++){
   const select=value=>index.get(mode==='fixed-policy'?combination(scenario,value,fixed):combination(scenario,fixed,value));
   const a=select(variables[i]),b=new Map(select(variables[j]).map(y=>[y.manifest.seed,y])),pairs=a.map(x=>[x,b.get(x.manifest.seed)]);
   const valid=pairs.every(([x,y])=>x.status==='completed'&&y?.status==='completed');
   const deltas=valid?pairs.map(([x,y])=>({seed:x.manifest.seed,delta:y.metrics.releasedUnverified-x.metrics.releasedUnverified})).sort((x,y)=>x.seed-y.seed):null;
   groups.push({mode,scenario,fixed,baseline:variables[i],alternative:variables[j],metric:'releasedUnverified',pairedRuns:pairs.length,failedPairs:pairs.filter(([x,y])=>x.status!=='completed'||y?.status!=='completed').length,meanPairedDifference:valid?deltas.reduce((n,d)=>n+d.delta,0)/deltas.length:null,seedDeltas:deltas,uncertainty:'Per-seed model sensitivity only; no confidence, field-performance or hardware claim.'});
  }
 }
 return groups;
}
export function runComparison(config,fieldPackage){
 validateExperiment(config,fieldPackage);const model=modelPin(),runs=[];
 for(const scenario of config.scenarios)for(const concept of config.concepts)for(const policy of config.policies)for(const seed of config.seeds)runs.push(execute(config,concept,policy,scenario,seed,model));
 runs.sort((a,b)=>a.runId.localeCompare(b.runId));
 return {schema:'frc-abstract-comparison-result/v1',season:2026,fieldPackageSha256:config.fieldPackageSha256,configSha256:digest(config),model,basis:config.basis,assumptionStatement:config.assumptionStatement,coverage:{fieldEntities:'shared sourced semantic identifiers only',worldGeometry:'unused; not verified',officialScoring:'unimplemented',officialPhaseTiming:'unimplemented',physics:'unimplemented',inventory:'finite-stock conservation checked each tick'},limitations:LIMITATIONS,selectedCandidate:null,runCounts:{requested:runs.length,completed:runs.filter(r=>r.status==='completed').length,failed:runs.filter(r=>r.status==='failed').length},pairedComparisons:pairedSummaries(runs),runs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{check(process.argv.length===4,'Usage: node scripts/comparison-study.mjs experiment.json field-package.json');const result=runComparison(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),JSON.parse(fs.readFileSync(process.argv[3],'utf8')));console.log(JSON.stringify(result,null,2));if(result.runCounts.failed)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}
}
