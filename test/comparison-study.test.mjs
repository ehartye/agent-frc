import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {digest} from '../scripts/decision-chain.mjs';
import {MODEL,draw,validateExperiment,runTrial,runComparison} from '../scripts/comparison-study.mjs';
const field=()=>JSON.parse(fs.readFileSync(new URL('../case-studies/2026/field-package.json',import.meta.url),'utf8'));
const fixture=()=>({schema:MODEL,season:2026,fieldPackageSha256:digest(field()),basis:'hypothetical-unmeasured',assumptionStatement:'Synthetic test fixture; no physical claims.',ticks:20,tickSeconds:1,seeds:[7,11,23],concepts:[{id:'small',basis:'hypothetical-unmeasured',capacity:2,acquirePerOpportunity:1,releasePerOpportunity:1,acquireCooldownTicks:0,releaseCooldownTicks:0},{id:'buffered',basis:'hypothetical-unmeasured',capacity:5,acquirePerOpportunity:2,releasePerOpportunity:2,acquireCooldownTicks:1,releaseCooldownTicks:0}],policies:[{id:'eager',kind:'threshold-release-when-open',releaseThresholdFraction:0.01},{id:'batch',kind:'threshold-release-when-open',releaseThresholdFraction:1}],scenarios:[{id:'nominal',basis:'hypothetical-unmeasured',retrievalLocationId:'depot',releaseTargetId:'hub',initialAvailable:8,initialReserve:4,replenishments:[{tick:8,count:4}],releaseOpportunityWindows:[[0,20]],acquireSuccessProbability:0.8,releaseSuccessProbability:0.7}]});
const first=c=>({conceptId:c.concepts[0].id,policyId:c.policies[0].id,scenarioId:c.scenarios[0].id,seed:c.seeds[0]});
test('Same inputs replay exactly, without mutating input or pretending scores',()=>{
 const c=fixture(),f=field(),before=JSON.stringify([c,f]),a=runComparison(c,f),b=runComparison(c,f);assert.deepEqual(a,b);assert.equal(JSON.stringify([c,f]),before);assert.deepEqual(a.runCounts,{requested:12,completed:12,failed:0});assert.equal(a.selectedCandidate,null);
 for(const r of a.runs){assert.equal(r.score,null);assert.equal(r.winProbability,null);assert.equal(r.physicalReachability,'not-assessed');assert.equal(r.traceSha256,digest(r.trace));}
});
test('Every tick conserves available, reserve, robot and released pieces',()=>{
 for(const r of runComparison(fixture(),field()).runs){for(const t of r.trace){assert.equal(Object.values(t.state).reduce((a,b)=>a+b,0),r.initialTotal);assert.ok(Object.values(t.state).every(n=>Number.isInteger(n)&&n>=0));}assert.equal(r.metrics.acquired,r.finalState.buffer+r.finalState.releasedUnverified);}
});
test('Empty sources cannot create pieces; replenishment transfers only finite reserve',()=>{
 const c=fixture();Object.assign(c.scenarios[0],{initialAvailable:0,initialReserve:0,replenishments:[]});assert.ok(runComparison(c,field()).runs.every(r=>r.metrics.acquired===0&&r.metrics.releasedUnverified===0));
 c.scenarios[0].replenishments=[{tick:2,count:1}];assert.throws(()=>runComparison(c,field()),/reserve/);
});
test('Opportunity windows are half-open; no release outside them',()=>{
 const c=fixture();c.scenarios[0].releaseOpportunityWindows=[[5,8]];for(const r of runComparison(c,field()).runs)for(const t of r.trace)if(t.action==='release')assert.ok(t.tick>=5&&t.tick<8);
 c.scenarios[0].releaseOpportunityWindows=[];assert.ok(runComparison(c,field()).runs.every(r=>r.metrics.releasedUnverified===0));
});
test('Failure probabilities preserve pieces rather than inventing success or loss',()=>{
 const c=fixture();c.scenarios[0].acquireSuccessProbability=0;assert.ok(runComparison(c,field()).runs.every(r=>r.metrics.acquired===0));c.scenarios[0].acquireSuccessProbability=1;c.scenarios[0].releaseSuccessProbability=0;assert.ok(runComparison(c,field()).runs.every(r=>r.metrics.releasedUnverified===0&&r.metrics.acquired>0));
});
test('Keyed draws are call-order independent and candidate independent',()=>{
 const expected=draw(7,'nominal','acquire',5,0);for(let n=0;n<30;n++)draw(11,'other','release',n,4);assert.equal(draw(7,'nominal','acquire',5,0),expected);assert.notEqual(draw(7,'nominal','acquire',5,1),expected);assert.notEqual(draw(11,'nominal','acquire',5,0),expected);
 const c=fixture();c.concepts.push({...c.concepts[0],id:'identical-other-name'});const result=runComparison(c,field());for(const r of result.runs.filter(x=>x.manifest.concept.id==='small')){const twin=result.runs.find(x=>x.manifest.concept.id==='identical-other-name'&&x.manifest.policy.id===r.manifest.policy.id&&x.manifest.seed===r.manifest.seed);assert.deepEqual(r.trace,twin.trace);}
});
test('Reordering candidates, scenarios or seeds cannot change run identity or paired results',()=>{
 const c=fixture(),a=runComparison(c,field());c.concepts.reverse();c.policies.reverse();c.seeds.reverse();const b=runComparison(c,field());assert.deepEqual(a.runs,b.runs);assert.deepEqual(a.pairedComparisons,b.pairedComparisons);
});
test('Comparisons hold policy or concept fixed and retain exact paired seed differences',()=>{
 const result=runComparison(fixture(),field());assert.equal(result.pairedComparisons.length,4);for(const p of result.pairedComparisons){assert.equal(p.pairedRuns,3);assert.equal(p.failedPairs,0);assert.deepEqual(p.seedDeltas.map(x=>x.seed),[7,11,23]);assert.equal(p.meanPairedDifference,p.seedDeltas.reduce((s,x)=>s+x.delta,0)/3);}
});
test('Mixed field revision, dangling entities, measured claims and malformed quantities rejected',()=>{
 const mutations=[c=>c.fieldPackageSha256='0'.repeat(64),c=>c.season=2025,c=>c.concepts[0].basis='measured',c=>c.concepts[0].capacity=0,c=>c.scenarios[0].initialAvailable=null,c=>c.scenarios[0].acquireSuccessProbability=NaN,c=>c.scenarios[0].retrievalLocationId='hub',c=>c.scenarios[0].releaseTargetId='depot',c=>c.seeds=[7,7],c=>c.scenarios[0].releaseOpportunityWindows=[[5,8],[7,10]],c=>c.scenarios[0].replenishments=[{tick:2,count:1},{tick:2,count:1}]];
 for(const mutate of mutations){const c=fixture();mutate(c);assert.throws(()=>validateExperiment(c,field()));}
});
test('Unknown geometry stays unused and does not become fabricated coordinates',()=>{
 const c=fixture(),f=field();assert.ok(f.fieldModel.locations.every(l=>l.geometry.status==='unknown'));const r=runTrial(c,f,first(c));assert.equal(r.status,'completed');assert.equal(r.physicalReachability,'not-assessed');assert.ok(!JSON.stringify(r).includes('coordinates'));
});
test('Capacity bounds, deterministic ideal fixture and cooldown convention hold',()=>{
 const c=fixture();Object.assign(c.scenarios[0],{initialAvailable:8,initialReserve:0,replenishments:[],acquireSuccessProbability:1,releaseSuccessProbability:1});const r=runTrial(c,field(),first(c));assert.equal(r.metrics.releasedUnverified,8);assert.equal(r.trace[0].action,'acquire');assert.equal(r.trace[1].action,'release');
 const q=runTrial(c,field(),{...first(c),conceptId:'buffered'});assert.equal(q.trace[0].action,'acquire');assert.equal(q.trace[1].action,'cooldown');for(const t of q.trace)assert.ok(t.state.buffer<=5);
});
test('Separate concurrent worker processes replay the same trial trace',async()=>{
 const script=`import {runTrial} from './scripts/comparison-study.mjs';const c=${JSON.stringify(fixture())},f=${JSON.stringify(field())};console.log(runTrial(c,f,${JSON.stringify(first(fixture()))}).traceSha256);`;
 const worker=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module'],{cwd:new URL('..',import.meta.url),windowsHide:true});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));child.stdin.on('error',reject);child.stdin.end(script);});
 const hashes=await Promise.all([worker(),worker()]);assert.equal(hashes[0],hashes[1]);assert.equal(hashes[0],runTrial(fixture(),field(),first(fixture())).traceSha256);
});
test('Checked-in hypothetical comparison config runs against its exact field pin',()=>{
 const c=JSON.parse(fs.readFileSync(new URL('../case-studies/2026/comparison-experiment.json',import.meta.url),'utf8'));const r=runComparison(c,field());assert.equal(r.runCounts.failed,0);assert.equal(r.runCounts.completed,c.seeds.length*c.concepts.length*c.policies.length*c.scenarios.length);assert.equal(r.coverage.physics,'unimplemented');
});

test('Compact executed evidence matches current source and input pins',t=>{
 const e=JSON.parse(fs.readFileSync(new URL('../case-studies/2026/comparison-validation.json',import.meta.url),'utf8'));
 const c=JSON.parse(fs.readFileSync(new URL('../case-studies/2026/comparison-experiment.json',import.meta.url),'utf8')),r=runComparison(c,field());
 assert.equal(e.model.sourceSha256,r.model.sourceSha256);assert.equal(e.configSha256,r.configSha256);assert.equal(e.fieldPackageSha256,r.fieldPackageSha256);assert.deepEqual(e.runCounts,r.runCounts);assert.equal(e.selectedCandidate,null);
 if(e.model.runtime.node===r.model.runtime.node){assert.equal(e.outcomesSha256,digest(r.runs.map(({trace,...rest})=>rest)));assert.deepEqual(e.pairedComparisons,r.pairedComparisons);}else t.diagnostic('Exact outcome receipt uses a different pinned Node runtime; source/input pins verified, exact receipt replay not claimed.');
});

test('Dense event schedules are preindexed and bounded factor counts reject combinatorial growth',()=>{
 const c=fixture();c.scenarios[0].replenishments=Array.from({length:c.ticks},(_,tick)=>({tick,count:1}));c.scenarios[0].initialReserve=c.ticks;c.scenarios[0].releaseOpportunityWindows=Array.from({length:c.ticks},(_,tick)=>[tick,tick+1]);const r=runTrial(c,field(),first(c));assert.ok(r.trace.every(t=>t.replenished===1&&t.open));assert.equal(r.finalState.reserve,0);
 c.concepts=Array.from({length:21},(_,n)=>({...c.concepts[0],id:'concept-'+n}));assert.throws(()=>validateExperiment(c,field()),/factor limit/);
});

test('Standalone trial preserves hypothetical assumptions and physical/scoring limitations',()=>{
 const c=fixture(),r=runTrial(c,field(),first(c));assert.equal(r.manifest.basis,'hypothetical-unmeasured');assert.equal(r.manifest.assumptionStatement,c.assumptionStatement);assert.equal(r.manifest.assumptionStatementSha256,digest(c.assumptionStatement));assert.ok(r.manifest.limitations.some(x=>x.includes('not scored')));assert.ok(r.manifest.limitations.some(x=>x.includes('not a full match')));
 const before=r.runId;c.assumptionStatement='Different hypothetical context';assert.notEqual(runTrial(c,field(),first(c)).runId,before);
});

test('Validation bounds paired output count and trace storage independently of draw operations',()=>{
 const c=fixture();c.seeds=[1];c.ticks=1;c.concepts=Array.from({length:20},(_,n)=>({...c.concepts[0],id:'c'+n}));c.policies=Array.from({length:20},(_,n)=>({...c.policies[0],id:'p'+n}));c.scenarios=Array.from({length:25},(_,n)=>({...c.scenarios[0],id:'s'+n}));assert.throws(()=>validateExperiment(c,field()),/Paired comparison limit/);
 const d=fixture();d.ticks=10000;d.seeds=Array.from({length:20},(_,n)=>n);assert.throws(()=>validateExperiment(d,field()),/trace limit/);
});
