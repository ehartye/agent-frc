import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {executeAndLinkComparison} from '../scripts/comparison-chain.mjs';
import {appendArtifact,impactReport,validateStudy,digest,pin} from '../scripts/decision-chain.mjs';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
function input(){const config=read('case-studies/2026/comparison-experiment.json');config.concepts=config.concepts.slice(0,2);config.policies=config.policies.slice(0,1);config.scenarios=config.scenarios.slice(0,1);config.seeds=[7,11];return {config,fieldPackage:read('case-studies/2026/field-package.json'),gameId:'game-2026',resourcesId:'resources-2026',prefix:'review'};}
const base=()=>read('case-studies/2026/envelope-study.json');
const linked=()=>executeAndLinkComparison(base(),input());
test('Executes and links exact hypothetical manifests without modifying source study or choosing a design',()=>{
 const original=base(),before=JSON.stringify(original),o=executeAndLinkComparison(original,input());assert.equal(JSON.stringify(original),before);assert.equal(o.receipt.runRefs.length,4);assert.deepEqual(o.study.decisions,[]);assert.equal(o.receipt.selectedCandidate,null);assert.equal(o.receipt.runCounts.failed,0);
 assert.equal(o.study.artifacts.filter(a=>a.kind==='subsystem-spec').length,0);assert.equal(o.study.artifacts.filter(a=>a.kind==='evidence').length,0);
 const e=head(o.study,o.receipt.experiment.id);assert.equal(e.content.configSha256,digest(input().config));assert.equal(e.content.linkerSourceSha256,o.receipt.linkerSourceSha256);
 for(const ref of o.receipt.runRefs){const a=head(o.study,ref.id),r=a.content.run;assert.equal(a.kind,'comparison-run-evidence');assert.equal(r.score,null);assert.equal(r.physicalReachability,'not-assessed');assert.equal(a.content.outcomeSha256,digest(r));assert.equal(r.runId,digest(r.manifest));assert.deepEqual(a.inputs,[o.receipt.experiment]);}
 assert.ok(impactReport(o.study).heads.every(a=>!a.stale));
});
test('Any game/resource/field/concept/policy/scenario/model revision invalidates comparison evidence',()=>{
 const o=linked();const e=head(o.study,o.receipt.experiment.id),b=e.content.bindings;
 for(const id of [b.game.id,b.resources.id,b.model.id,b.concepts[0].ref.id,b.policies[0].ref.id,b.scenarios[0].ref.id]){
  const a=head(o.study,id),content=structuredClone(a.content);if(a.kind==='comparison-input'){content.value.review='new evidence';content.valueSha256=digest(content.value);}else content.review='changed source';
  const s=appendArtifact(o.study,{id,kind:a.kind,branch:a.branch,inputs:a.inputs,content,expectedRevision:a.revision});const report=impactReport(s);
  assert.equal(report.heads.find(x=>x.id===e.id).stale,true);for(const ref of o.receipt.runRefs)assert.equal(report.heads.find(x=>x.id===ref.id).stale,true);
 }
});
test('Revised experiment cannot silently repin old run evidence',()=>{
 const o=linked(),e=head(o.study,o.receipt.experiment.id),content=structuredClone(e.content);content.config.tickSeconds=2;content.configSha256=digest(content.config);
 let s=appendArtifact(o.study,{id:e.id,kind:e.kind,branch:e.branch,inputs:e.inputs,content,expectedRevision:1});const run=head(s,o.receipt.runRefs[0].id);
 assert.throws(()=>appendArtifact(s,{id:run.id,kind:run.kind,branch:run.branch,inputs:[pin(head(s,e.id))],content:run.content,expectedRevision:1}),/time mismatch|experiment/);
});
test('Exact config bindings prevent mismatching concept values or unrelated baseline pins',()=>{
 const o=linked(),e=head(o.study,o.receipt.experiment.id);const content=structuredClone(e.content);content.config.concepts[0].capacity++;content.configSha256=digest(content.config);
 assert.throws(()=>appendArtifact(o.study,{id:e.id,kind:e.kind,branch:e.branch,inputs:e.inputs,content,expectedRevision:1}),/parameter binding/);
});
test('Reject field hash drift, wrong baseline, prefix reuse and excess linked run count before execution',()=>{
 const s=base(),x=input();x.fieldPackage.coverage='changed';assert.throws(()=>executeAndLinkComparison(s,x),/hash mismatch/);
 const y=input();y.resourcesId='compact-envelope';assert.throws(()=>executeAndLinkComparison(s,y),/artifact IDs/);
 const o=linked();assert.throws(()=>executeAndLinkComparison(o.study,input()),/already used/);
 const z=input();z.config.seeds=Array.from({length:129},(_,i)=>i);assert.throws(()=>executeAndLinkComparison(s,z),/256/);
});
test('Evidence rejects scoring claims, altered output hash and manufactured strategy selection',()=>{
 const o=linked(),a=head(o.study,o.receipt.runRefs[0].id);
 for(const mutate of [c=>{c.run.score=1;c.outcomeSha256=digest(c.run);},c=>c.outcomeSha256='0'.repeat(64)]){const content=structuredClone(a.content);mutate(content);assert.throws(()=>appendArtifact(o.study,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content,expectedRevision:1}),/scoring|hash/);}
 const s=structuredClone(o.study);s.decisions=[{chosen:'small-buffer'}];assert.throws(()=>validateStudy(s),/authenticated/);
});
test('Comparison joins do not relax ordinary design cross-branch isolation',()=>{
 const o=linked();const other=head(o.study,'payload-envelope');assert.throws(()=>appendArtifact(o.study,{id:'unrelated-spec',kind:'subsystem-spec',branch:'compact',inputs:[pin(other)],content:{}}),/Cross-branch/);
 const e=head(o.study,o.receipt.experiment.id);assert.throws(()=>appendArtifact(o.study,{id:e.id,kind:e.kind,branch:e.branch,inputs:[...e.inputs,pin(other)],content:e.content,expectedRevision:1}),/Cross-branch/);
});

test('Compact linkage receipt replays the full sourced cohort under its exact runtime',t=>{
 const e=read('case-studies/2026/comparison-chain-validation.json');
 const o=executeAndLinkComparison(base(),{...input(),prefix:'comparison-2026',config:read('case-studies/2026/comparison-experiment.json')});
 assert.equal(e.configSha256,o.receipt.configSha256);assert.equal(e.fieldPackageSha256,o.receipt.fieldPackageSha256);assert.equal(e.linkerSourceSha256,o.receipt.linkerSourceSha256);assert.equal(e.model.sourceSha256,o.receipt.model.sourceSha256);assert.deepEqual(e.runCounts,o.receipt.runCounts);assert.equal(e.artifacts,o.study.artifacts.length);assert.equal(e.selectedCandidate,null);
 if(e.model.runtime.node===o.receipt.model.runtime.node){assert.equal(e.studySha256,digest(o.study));assert.equal(e.outcomesSha256,o.receipt.outcomesSha256);}else t.diagnostic('Different Node version: exact outcome replay not claimed; source/input pins checked.');
});
