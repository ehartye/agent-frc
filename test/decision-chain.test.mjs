/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudy,forkBranch,appendArtifact,pin,digest,validateStudy,impactReport} from '../scripts/decision-chain.mjs';
const head=(s,id)=>s.artifacts.filter(x=>x.id===id).at(-1);
const add=(s,id,kind,branch,ids,content={note:'unverified teaching hypothesis'})=>appendArtifact(s,{id,kind,branch,inputs:ids.map(id=>pin(head(s,id))),content});
function fixture(){
 let s=createStudy(2096);
 s=add(s,'rules','game-analysis','shared',[],{sourceRevision:'fixture only',event:'unknown'});
 s=add(s,'resources','resource-baseline','shared',[],{inventoryStatus:'unknown',physicalInventory:[],kitExpectations:[],credits:[]});
 for(const branch of ['bounded','burst']){
  s=forkBranch(s,branch);
  s=add(s,branch+'-brief','strategy-brief',branch,['rules','resources'],{desiredPieces:6,windowSeconds:branch==='burst'?5:10});
  s=add(s,branch+'-envelope','robot-envelope',branch,['rules','resources',branch+'-brief']);
  s=add(s,branch+'-contract','capability-contract',branch,[branch+'-brief',branch+'-envelope']);
  s=add(s,branch+'-architecture','architecture-trade',branch,[branch+'-contract']);
  s=add(s,branch+'-spec','subsystem-spec',branch,[branch+'-architecture']);
  s=add(s,branch+'-run','evidence',branch,[branch+'-spec'],{status:'not-run'});
 }
 return s;
}
test('Independent branches diverge without selecting a team strategy',()=>{
 const s=fixture();assert.equal(head(s,'bounded-brief').content.windowSeconds,10);assert.equal(head(s,'burst-brief').content.windowSeconds,5);
 assert.equal(impactReport(s).decision,'none');assert.ok(impactReport(s).heads.every(a=>!a.stale));assert.deepEqual(s.decisions,[]);
});
test('Shared revision invalidates both complete downstream chains, preserving history',()=>{
 const s=fixture(),snapshot=JSON.stringify(s);
 const next=appendArtifact(s,{id:'resources',kind:'resource-baseline',content:{inventoryStatus:'partially-known'},expectedRevision:1});
 assert.equal(JSON.stringify(s),snapshot);
 const report=impactReport(next);assert.equal(report.heads.filter(a=>a.stale).length,12);assert.ok(report.heads.find(a=>a.id==='burst-run').reasons.some(x=>x.includes('stale upstream')));
 assert.equal(head(next,'resources').revision,2);
});
test('One branch revision invalidates only that branch; explicit rebase is required',()=>{
 let s=fixture(),a=head(s,'bounded-brief');
 s=appendArtifact(s,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content:{windowSeconds:8},expectedRevision:1});
 let report=impactReport(s);assert.equal(report.heads.filter(a=>a.stale).length,5);assert.ok(report.heads.filter(a=>a.branch==='burst').every(a=>!a.stale));
 for(const [id,upstream] of [['bounded-envelope','bounded-brief'],['bounded-contract','bounded-envelope'],['bounded-architecture','bounded-contract'],['bounded-spec','bounded-architecture'],['bounded-run','bounded-spec']]){
  a=head(s,id);s=appendArtifact(s,{id,kind:a.kind,branch:a.branch,inputs:(id==='bounded-envelope'?['rules','resources',upstream]:id==='bounded-contract'?['bounded-brief',upstream]:[upstream]).map(x=>pin(head(s,x))),content:{status:'needs-rerun'},expectedRevision:1});
 }
 report=impactReport(s);assert.ok(report.heads.every(a=>!a.stale));assert.equal(head(s,'bounded-run').content.status,'needs-rerun');
});
test('Multiple architecture directions inherit one strategy without copying decisions',()=>{
 let s=fixture();s=forkBranch(s,'burst-belt','burst');s=forkBranch(s,'burst-roller','burst');
 for(const b of ['burst-belt','burst-roller'])s=add(s,b,'architecture-trade',b,['burst-contract']);
 assert.equal(s.branches.length,5);assert.deepEqual(s.decisions,[]);
 assert.throws(()=>add(s,'contamination','subsystem-spec','burst-belt',['burst-roller']),/Cross-branch/);
});
test('Tampering, forged approval, stale writes and invalid handoffs fail closed',()=>{
 const s=fixture();let bad=structuredClone(s);bad.artifacts[0].content.event='edited';assert.throws(()=>validateStudy(bad),/hash/);
 bad=structuredClone(s);bad.decisions=[{selectedByUser:'fake'}];assert.throws(()=>validateStudy(bad),/authenticated/);
 assert.throws(()=>appendArtifact(s,{id:'resources',kind:'resource-baseline',content:{},expectedRevision:0}),/conflict/);
 assert.throws(()=>add(s,'missing','evidence','burst',[]),/Missing subsystem/);
 bad=structuredClone(s);bad.artifacts[0].season=2095;const {sha256,...body}=bad.artifacts[0];bad.artifacts[0].sha256=digest(body);assert.throws(()=>validateStudy(bad),/Season/);
});

import {validateFieldModel} from '../scripts/field-semantics.mjs';
const fieldFixture=()=>({schema:'frc-field-semantics/v1',season:2096,sources:[{id:'rules',kind:'rulebook',season:2096,url:'https://example.test/fixture',revision:'fixture, not actual rules',retrieved:'2096-11-16',locator:'fixture',sha256:'0'.repeat(64)}],frames:[],locations:[{id:'target',purpose:'scoring',semanticSourceRefs:['rules'],semantics:{phases:null,conditions:null,possession:null,replenishment:null},geometry:{status:'unknown',reason:'No verified geometry imported'},reachability:'not-assessed'}],zones:[],obstacles:[]});
test('Field semantics share pinned source revisions without invented coordinates',()=>{
 const model=fieldFixture();assert.equal(validateFieldModel(model),true);
 let s=createStudy(2096);s=add(s,'field','game-analysis','shared',[],{fieldModel:model});
 const bad=structuredClone(model);bad.locations[0].geometry.coordinates=[[0,0]];assert.throws(()=>validateFieldModel(bad),/invent/);
 bad.locations[0].geometry={status:'sourced',shape:'point',frame:'field',coordinates:[[1,2]],sourceRefs:['rules'],uncertainty:null};bad.frames=[{id:'field',unit:'m',dimensions:2,origin:'fixture only',axes:'fixture +x and +y'}];assert.throws(()=>validateFieldModel(bad),/CAD/);
 bad.sources.push({...bad.sources[0],id:'drawing',kind:'official-drawing'});bad.locations[0].geometry.sourceRefs=['drawing'];assert.equal(validateFieldModel(bad),true);
 bad.locations[0].reachability='reachable';assert.throws(()=>validateFieldModel(bad),/reachability/);
});
test('Shared field revision invalidates all dependent strategy branches',()=>{
 let s=fixture(),a=head(s,'rules');s=appendArtifact(s,{id:a.id,kind:a.kind,content:{fieldModel:fieldFixture()},expectedRevision:1});
 assert.equal(impactReport(s).heads.filter(a=>a.stale).length,12);
});

test('Parallel preliminary envelopes pin rules, actual resource baseline and strategy',()=>{
 let s=fixture();
 for(const b of ['bounded','burst']){
  s=add(s,b+'-alternate-envelope','robot-envelope',b,['rules','resources',b+'-brief'],{legalityBounds:{status:'unresolved'},candidateTarget:{status:'hypothetical',footprint:null},reachability:'not-assessed'});
 }
 assert.throws(()=>add(s,'missing-kit','robot-envelope','bounded',['rules','bounded-brief']),/resource-baseline/);
 s=appendArtifact(s,{id:'resources',kind:'resource-baseline',content:{inventoryStatus:'unknown'},expectedRevision:1});
 assert.ok(impactReport(s).heads.filter(a=>a.kind==='robot-envelope').every(a=>a.stale));
});

test('Envelope change invalidates capability, architecture, specification and evidence',()=>{
 let s=fixture();const a=head(s,'bounded-envelope');s=appendArtifact(s,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content:{review:'new envelope'},expectedRevision:1});
 const report=impactReport(s);for(const id of ['bounded-contract','bounded-architecture','bounded-spec','bounded-run'])assert.equal(report.heads.find(a=>a.id===id).stale,true);
 assert.ok(report.heads.filter(a=>a.branch==='burst').every(a=>!a.stale));
 assert.throws(()=>add(s,'no-envelope','capability-contract','burst',['burst-brief']),/robot-envelope/);
});
