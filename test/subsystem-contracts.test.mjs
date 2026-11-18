import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStudy,forkBranch,appendArtifact,pin} from '../scripts/decision-chain.mjs';
import {validateSubsystemContract,reviewSubsystemContract} from '../scripts/subsystem-contracts.mjs';
const template=()=>JSON.parse(fs.readFileSync(new URL('../templates/subsystem-contract.json',import.meta.url),'utf8'));
function fixture(){
 let s=createStudy(2096);const head=id=>s.artifacts.filter(x=>x.id===id).at(-1);
 const add=(id,kind,ids=[],content={note:'test-only hypothesis'})=>{s=appendArtifact(s,{id,kind,branch:['game-analysis','resource-baseline'].includes(kind)?'shared':'candidate',inputs:ids.map(x=>pin(head(x))),content});};
 add('game','game-analysis');add('resources','resource-baseline');s=forkBranch(s,'candidate');
 add('strategy','strategy-brief',['game','resources']);add('envelope','robot-envelope',['game','resources','strategy']);add('capability','capability-contract',['strategy','envelope']);add('architecture','architecture-trade',['capability']);
 const c=template();c.dependencyPins=[pin(head('architecture'))];add('feed','subsystem-spec',['architecture'],c);return s;
}
test('Unresolved template validates structurally without authorizing operation',()=>{
 assert.equal(validateSubsystemContract(template()),true);const s=fixture(),before=JSON.stringify(s),r=reviewSubsystemContract(s,'feed');assert.equal(r.reviewStatus,'human-review-required');assert.equal(r.robotOperationAuthorized,false);assert.ok(r.blockers.some(x=>x.includes('latency')));assert.ok(r.blockers.some(x=>x.includes('not-run')));assert.equal(JSON.stringify(s),before);
});
test('Strict quantity and interface fields reject silent defaults',()=>{
 for(const mutate of [c=>c.interfaces[0].quantities[0].bounds=[0,0],c=>c.interfaces[0].quantities[0].unit='',c=>c.interfaces[0].consumer='example-feed',c=>c.interfaces[0].verificationIds=['missing'],c=>c.interfaces[0].quantities.push(c.interfaces[0].quantities[0]),c=>c.owners.extra='owner',c=>c.checks[0].status='passed',c=>c.checks[0].status='completed']){const c=template();mutate(c);assert.throws(()=>validateSubsystemContract(c));}
 const c=template(),q=c.interfaces[0].quantities[0];Object.assign(q,{basis:'assumed',bounds:[0,100],source:'test-only target',unknownReason:null});assert.equal(validateSubsystemContract(c),true);q.bounds=[0,Infinity];assert.throws(()=>validateSubsystemContract(c),/Finite/);q.bounds=[2,1];assert.throws(()=>validateSubsystemContract(c),/Finite/);
});
test('Contract pins must equal graph inputs, not merely look like hashes',()=>{
 let s=fixture(),a=s.artifacts.at(-1),c=structuredClone(a.content);c.dependencyPins[0].sha256='1'.repeat(64);s=appendArtifact(s,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content:c,expectedRevision:a.revision});assert.throws(()=>reviewSubsystemContract(s,'feed'),/missing from graph/);
 s=fixture();a=s.artifacts.at(-1);c=structuredClone(a.content);const game=pin(s.artifacts[0]);s=appendArtifact(s,{id:a.id,kind:a.kind,branch:a.branch,inputs:[...a.inputs,game],content:c,expectedRevision:a.revision});assert.throws(()=>reviewSubsystemContract(s,'feed'),/missing from declared/);
});
test('Shared baseline changes propagate to contract review without rerun or auto-approval',()=>{
 let s=fixture();s=appendArtifact(s,{id:'resources',kind:'resource-baseline',content:{note:'new fixture baseline'},expectedRevision:1});const r=reviewSubsystemContract(s,'feed');assert.ok(r.blockers.some(x=>x.includes('stale')));assert.equal(r.robotOperationAuthorized,false);
});
test('Evidence pins reject extra fields and non-evidence artifact references',()=>{
 let c=template();c.checks[0].evidencePins=[{...c.dependencyPins[0],robotOperationAuthorized:true}];assert.throws(()=>validateSubsystemContract(c),/unknown field/);
 let s=fixture(),a=s.artifacts.at(-1);c=structuredClone(a.content);c.checks[0].status='completed';c.checks[0].evidencePins=[c.dependencyPins[0]];
 s=appendArtifact(s,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content:c,expectedRevision:1});assert.throws(()=>reviewSubsystemContract(s,'feed'),/subsystem evidence/);
});
test('Recording old-spec evidence in a newer spec remains stale, never repaired by completion',()=>{
 let s=fixture(),a=s.artifacts.at(-1);
 s=appendArtifact(s,{id:'feed-test',kind:'evidence',branch:a.branch,inputs:[pin(a)],content:{status:'completed',note:'test-only execution claim'}});
 const e=s.artifacts.at(-1),c=structuredClone(a.content);c.dependencyPins.push(pin(e));c.checks[0].status='completed';c.checks[0].evidencePins=[pin(e)];
 s=appendArtifact(s,{id:a.id,kind:a.kind,branch:a.branch,inputs:c.dependencyPins,content:c,expectedRevision:1});const r=reviewSubsystemContract(s,'feed');assert.ok(r.blockers.some(x=>x.includes('stale upstream')));assert.equal(r.reviewStatus,'human-review-required');assert.equal(r.robotOperationAuthorized,false);
});
