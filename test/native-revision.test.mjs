import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {compareNativeRevision} from '../scripts/native-revision.mjs';
import {assessWitnessManifest} from '../scripts/native-witness.mjs';
const h='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const row=(id,stateSha256=h)=>({id,stateSha256});
function fixture(){return [
  {schema:'agent-frc/native-revision-manifest@1',operationId:'revision-1',baselineArchiveSha256:h,savedArchiveSha256:b,allowedEvidenceBases:['synthetic'],before:[row('preserved'),row('old')],after:[row('preserved'),row('replacement',c)],requiredFeatureIds:['remove-old']},
  {schema:'agent-frc/native-revision-receipt@1',operationId:'revision-1',baselineArchiveSha256:h,savedArchiveSha256:b,reopenedArchiveSha256:b,evidenceBasis:'synthetic',stages:[
    {name:'before',bodies:[row('old'),row('preserved')],featureIds:[]},
    {name:'after-edit',bodies:[row('preserved'),row('replacement',c)],featureIds:['remove-old']},
    {name:'after-recompute',bodies:[row('replacement',c),row('preserved')],featureIds:['remove-old']},
    {name:'after-reopen',bodies:[row('preserved'),row('replacement',c)],featureIds:['remove-old']},
  ]},
];}
test('independent inventories match through edit, recompute and reopen without promoting synthetic evidence',()=>{
  const [e,o]=fixture(),before=JSON.stringify([e,o]),r=compareNativeRevision(e,o);
  assert.equal(r.status,'matched');assert.equal(r.scope.evidenceBasis,'synthetic');assert.match(r.scope.limit,/no native execution/);assert.equal(JSON.stringify([e,o]),before);
});
test('successful transient deletion cannot hide geometry restored by recompute or reopen',()=>{
  for(const stage of [2,3]){const [e,o]=fixture();o.stages[stage].bodies.push(row('old'));
    const r=compareNativeRevision(e,o);assert.equal(r.status,'mismatch');assert.ok(r.issues.some(x=>x.code==='body-unexpected'&&x.path.includes(o.stages[stage].name)));
  }
});
test('equal counts do not mask wrong replacement identity or unrelated geometry changes',()=>{
  const [e,o]=fixture();o.stages[2].bodies[0]=row('old');assert.equal(compareNativeRevision(e,o).status,'mismatch');
  o.stages[2].bodies=[row('replacement',c),row('preserved',b)];assert.ok(compareNativeRevision(e,o).issues.some(x=>x.code==='body-state-mismatch'));
});
test('required persistent feature must be observed after recompute and reopen',()=>{
  for(const stage of [1,2,3]){const [e,o]=fixture();o.stages[stage].featureIds=[];assert.ok(compareNativeRevision(e,o).issues.some(x=>x.code==='required-feature-missing'));}
});
test('direct-design operations may explicitly require no timeline feature',()=>{
  const [e,o]=fixture();e.requiredFeatureIds=[];for(const s of o.stages)s.featureIds=[];assert.equal(compareNativeRevision(e,o).status,'matched');
});
test('exact source, operation and reopened archive bind the receipt',()=>{
  for(const key of ['operationId','baselineArchiveSha256','savedArchiveSha256','reopenedArchiveSha256']){const [e,o]=fixture();o[key]=key==='operationId'?'another':c;assert.equal(compareNativeRevision(e,o).status,'mismatch');}
});
test('partial, duplicated or reordered lifecycle observations are invalid',()=>{
  for(const edit of [o=>o.stages.pop(),o=>o.stages.reverse(),o=>o.stages[2].name='after-edit',o=>o.stages[1]=null]){const [e,o]=fixture();edit(o);assert.equal(compareNativeRevision(e,o).status,'invalid');}
});
test('malformed inventory, feature, schema and basis fail closed',()=>{
  for(const edit of [(e,o)=>o.stages[0].bodies.push(row('old')),(e,o)=>o.stages[1].bodies[0].stateSha256='bad',(e)=>e.requiredFeatureIds=['x','x'],(e,o)=>o.extra=true,(e)=>e.allowedEvidenceBases=[],(e,o)=>o.evidenceBasis='inferred',(e)=>e.after=null]){
    const [e,o]=fixture();edit(e,o);assert.equal(compareNativeRevision(e,o).status,'invalid');
  }
  assert.equal(compareNativeRevision(null,null).status,'invalid');
});
test('wholly empty result is accepted only when independently expected and observed at all stages',()=>{
  const [e,o]=fixture();e.after=[];for(const s of o.stages.slice(1))s.bodies=[];assert.equal(compareNativeRevision(e,o).status,'matched');
  o.stages[3].bodies=[row('old')];assert.equal(compareNativeRevision(e,o).status,'mismatch');
});
test('clear game-piece witnesses cannot replace independently required assembly interference coverage',()=>{
  const pins={trajectory:h,geometry:h,transforms:h,backend:h},method={kernel:'fixture',version:'1',volumeUnits:'mm3',volumeTolerance:0,boundMethod:'known-solid',triangulation:false,shapeToleranceIncluded:true};
  const expectation=(id,pair)=>({id,stateHash:h,pair,rotating:false,phase:null,representations:['native-material','native-material'],transformRegistrationHash:h});
  const m={schema:'agent-frc/native-witness-manifest@2',pins,methodPolicy:method,witnesses:[expectation('piece-route',['piece','guide']),expectation('assembly-fit',['guide','frame'])]};
  const r={schema:'agent-frc/native-witness@2',id:'synthetic-test-fixture',basis:'native-execution',pins,method,coverage:{expectedWitnessIds:['piece-route'],complete:true},witnesses:[{...expectation('piece-route',['piece','guide']),conservativeContact:false,solidValid:true,booleanStatus:'complete',overlapVolume:0}]};
  assert.equal(assessWitnessManifest(r,m).reason,'inventory-mismatch');
  r.coverage.expectedWitnessIds.push('assembly-fit');r.witnesses.push({...expectation('assembly-fit',['guide','frame']),conservativeContact:true,solidValid:true,booleanStatus:'complete',overlapVolume:1});
  const result=assessWitnessManifest(r,m);assert.equal(result.status,'material-overlap');assert.equal(result.witnesses[0].status,'no-material-overlap-at-witness');assert.equal(result.witnesses[1].physicalContact,'unknown');
});
test('CLI preserves inputs and distinguishes match, restored geometry and invalid JSON',t=>{
  const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'frc-revision-'));
  t.after(()=>{assert.equal(path.dirname(dir),base);fs.rmSync(dir,{recursive:true});});
  const [e,o]=fixture(),ep=path.join(dir,'expected.json'),op=path.join(dir,'observed.json');fs.writeFileSync(ep,JSON.stringify(e));
  const run=()=>spawnSync(process.execPath,['scripts/check-native-revision.mjs',ep,op],{encoding:'utf8',shell:false});
  fs.writeFileSync(op,JSON.stringify(o));assert.equal(run().status,0);assert.equal(fs.readFileSync(op,'utf8'),JSON.stringify(o));
  o.stages[2].bodies.push(row('old'));fs.writeFileSync(op,JSON.stringify(o));assert.equal(run().status,1);
  fs.writeFileSync(op,'{');assert.equal(run().status,2);
});
