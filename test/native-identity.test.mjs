import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compareNativeIdentity} from '../scripts/native-identity.mjs';
const h='a'.repeat(64);
function fixture(){return [
  {schema:'agent-frc/native-identity-manifest@1',archiveSha256:h,allowedEvidenceBases:['synthetic'],bodies:[
    {id:'solid-a',occurrenceId:'nested',sourceId:'source-a',sourceOwnerId:'root'},
    {id:'solid-b',occurrenceId:'override',sourceId:'source-b',sourceOwnerId:'override'},
  ]},
  {schema:'agent-frc/native-identity-receipt@1',archiveSha256:h,evidenceBasis:'synthetic',occurrences:[
    {id:'root',parentId:null,sourceId:'source-a'},
    {id:'nested',parentId:'root',sourceId:null},
    {id:'override',parentId:'nested',sourceId:'source-b'},
  ],bodies:[{id:'solid-b',occurrenceId:'override'},{id:'solid-a',occurrenceId:'nested'}]},
];}
test('nested source inheritance and child override match independent inventory without mutation',()=>{
  const [e,o]=fixture(),before=JSON.stringify([e,o]);o.occurrences.reverse();
  const r=compareNativeIdentity(e,o);assert.equal(r.status,'matched');
  assert.equal(r.scope.evidenceBasis,'synthetic');assert.match(r.scope.limit,/no CAD execution/);
  assert.equal(r.bodies[0].sourceOwnerId,'root');assert.equal(r.bodies[1].sourceId,'source-b');
  o.occurrences.reverse();assert.equal(JSON.stringify([e,o]),before);
});
test('missing parents, orphan bodies and cycles fail closed including unused graph nodes',()=>{
  for(const edit of [o=>o.occurrences[1].parentId='missing',o=>o.bodies[0].occurrenceId='absent',o=>o.occurrences[0].parentId='override',o=>o.occurrences.push({id:'unused',parentId:'unused',sourceId:'source-c'})]){
    const [e,o]=fixture();edit(o);assert.equal(compareNativeIdentity(e,o).status,'invalid');
  }
});
test('missing source metadata is not replaced by body or occurrence names',()=>{
  const [e,o]=fixture();o.occurrences[0].sourceId=null;
  const r=compareNativeIdentity(e,o);assert.equal(r.status,'invalid');assert.ok(r.issues.some(x=>x.code==='source-unresolved'));
});
test('duplicate and malformed inventories are rejected',()=>{
  for(const edit of [(e,o)=>o.bodies.push(o.bodies[0]),(e,o)=>o.occurrences.push(o.occurrences[0]),(e)=>e.bodies.push(e.bodies[0]),(e,o)=>o.occurrences[1].sourceId=[],(e,o)=>delete o.occurrences[1].parentId,(e,o)=>o.bodies[0].name='fallback',(e)=>e.bodies=[],(e,o)=>o.bodies=[null]]){
    const [e,o]=fixture();edit(e,o);assert.equal(compareNativeIdentity(e,o).status,'invalid');
  }
  assert.equal(compareNativeIdentity(null,null).status,'invalid');
});
test('extra or omitted bodies cannot silently change independently expected coverage',()=>{
  const [e,o]=fixture();o.bodies.pop();assert.equal(compareNativeIdentity(e,o).status,'mismatch');
  o.bodies.push({id:'unexpected',occurrenceId:'root'});assert.ok(compareNativeIdentity(e,o).issues.some(x=>x.code==='body-unexpected'));
});
test('source, owner and occurrence identity drift cannot be masked by equal labels',()=>{
  for(const edit of [e=>e.bodies[0].sourceId='other',e=>e.bodies[0].sourceOwnerId='nested',e=>e.bodies[0].occurrenceId='root']){
    const [e,o]=fixture();edit(e);assert.ok(compareNativeIdentity(e,o).issues.some(x=>x.code==='body-identity-mismatch'));
  }
});
test('archive and evidence-basis mismatches preserve observed evidence class',()=>{
  const [e,o]=fixture();o.archiveSha256='b'.repeat(64);assert.equal(compareNativeIdentity(e,o).status,'mismatch');
  o.archiveSha256=h;o.evidenceBasis='human-reported';const r=compareNativeIdentity(e,o);
  assert.equal(r.status,'mismatch');assert.equal(r.scope.evidenceBasis,'human-reported');
});
test('deep ancestry resolves iteratively and instance IDs remain distinct',()=>{
  const [e,o]=fixture();for(let i=0;i<3000;i++)o.occurrences.push({id:'node-'+i,parentId:i?'node-'+(i-1):'nested',sourceId:null});
  o.bodies[1].occurrenceId='node-2999';e.bodies[0].occurrenceId='node-2999';
  assert.equal(compareNativeIdentity(e,o).status,'matched');
});
test('CLI distinguishes match, mismatch and malformed input without modifying evidence',t=>{
  const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'frc-identity-'));
  t.after(()=>{assert.equal(path.dirname(dir),base);fs.rmSync(dir,{recursive:true});});
  const [e,o]=fixture(),ef=path.join(dir,'expected.json'),of=path.join(dir,'observed.json');
  fs.writeFileSync(ef,JSON.stringify(e));fs.writeFileSync(of,JSON.stringify(o));
  const command=path.resolve('scripts/check-native-identity.mjs');
  const run=()=>spawnSync(process.execPath,[command,ef,of],{encoding:'utf8',shell:false});
  assert.equal(run().status,0);assert.equal(fs.readFileSync(of,'utf8'),JSON.stringify(o));
  o.bodies.pop();fs.writeFileSync(of,JSON.stringify(o));assert.equal(run().status,1);
  fs.writeFileSync(of,'{');assert.equal(run().status,2);
});
