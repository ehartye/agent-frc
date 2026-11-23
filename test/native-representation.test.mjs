/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {validateWitnessReceipt,validateWitnessManifest,assessWitnessManifest} from '../scripts/native-witness.mjs';
const h='a'.repeat(64),b='b'.repeat(64);
function fixture(){
  const pins={trajectory:h,geometry:h,transforms:h,backend:h};
  const method={kernel:'fixture',version:'test',volumeUnits:'mm3',volumeTolerance:0.001,boundMethod:'fixture-solid',triangulation:false,shapeToleranceIncluded:true};
  // Expected metadata authored separately from observed results; these are synthetic test inputs.
  return [
    {schema:'agent-frc/native-witness-manifest@2',pins:{...pins},methodPolicy:{...method},witnesses:[{id:'sample',stateHash:h,pair:['piece','rotor'],rotating:true,phase:{angleDeg:12,registrationHash:h},representations:['native-material','native-material'],transformRegistrationHash:h}]},
    {schema:'agent-frc/native-witness@2',id:'fixture',basis:'native-execution',pins:{...pins},coverage:{expectedWitnessIds:['sample'],complete:true},method:{...method},witnesses:[{id:'sample',stateHash:h,pair:['piece','rotor'],rotating:true,phase:{angleDeg:12,registrationHash:h},conservativeContact:true,solidValid:true,booleanStatus:'complete',overlapVolume:0,representations:['native-material','native-material'],transformRegistrationHash:h}]},
  ];
}
test('registered material witnesses classify bounded volume without asserting physical contact',()=>{
  const [m,r]=fixture(),before=JSON.stringify([m,r]);assert.equal(assessWitnessManifest(r,m).status,'no-material-overlap-at-witnesses');
  assert.equal(JSON.stringify([m,r]),before);r.witnesses[0].overlapVolume=0.02;
  const result=assessWitnessManifest(r,m);assert.equal(result.status,'material-overlap');assert.equal(result.witnesses[0].physicalContact,'unknown');
});
test('envelope overlap and zero envelope volume remain unknown with observation retained',()=>{
  for(const volume of [0,0.02]){const [m,r]=fixture();m.witnesses[0].representations[1]='outer-envelope';r.witnesses[0].representations[1]='outer-envelope';r.witnesses[0].overlapVolume=volume;
    const result=assessWitnessManifest(r,m);assert.equal(result.status,'unknown');assert.equal(result.witnesses[0].reason,'representation-not-material');assert.equal(result.witnesses[0].observedVolume,volume);
  }
});
test('unregistered transform and installed rotor phase cannot be cleared by source-solid observations',()=>{
  for(const field of ['phase','transformRegistrationHash']){const [m,r]=fixture();m.witnesses[0][field]=null;r.witnesses[0][field]=null;
    for(const volume of [0,0.02]){r.witnesses[0].overlapVolume=volume;assert.equal(assessWitnessManifest(r,m).status,'unknown');}
  }
});
test('independent expectations reject changed representation, ordered operands and registration',()=>{
  for(const edit of [w=>w.representations[1]='outer-envelope',w=>w.transformRegistrationHash=b]){
    const [m,r]=fixture();edit(r.witnesses[0]);assert.equal(assessWitnessManifest(r,m).reason,'representation-registration-mismatch');
  }
  const [m,r]=fixture();m.witnesses[0].representations=['outer-envelope','native-material'];r.witnesses[0].representations=['native-material','outer-envelope'];
  assert.equal(assessWitnessManifest(r,m).reason,'representation-registration-mismatch');
});
test('malformed representations and hashes reject in both manifest and receipt',()=>{
  for(const edit of [w=>delete w.representations,w=>w.representations=['native-material'],w=>w.representations=['native-material','mesh'],w=>w.transformRegistrationHash='bad',w=>delete w.transformRegistrationHash]){
    const [m,r]=fixture();edit(m.witnesses[0]);edit(r.witnesses[0]);assert.equal(validateWitnessReceipt(r).valid,false);assert.equal(validateWitnessManifest(m).valid,false);
  }
});
test('v1 cannot satisfy v2 expectations and historical v1 contract remains accepted',()=>{
  const [m,r]=fixture();r.schema='agent-frc/native-witness@1';delete r.witnesses[0].representations;delete r.witnesses[0].transformRegistrationHash;
  assert.equal(validateWitnessReceipt(r).valid,true);assert.equal(assessWitnessManifest(r,m).reason,'schema-version-mismatch');
});
test('synthetic and incomplete v2 receipts cannot promote evidence',()=>{
  const [m,r]=fixture();r.basis='synthetic-test';assert.equal(assessWitnessManifest(r,m).reason,'synthetic-not-native');
  r.basis='native-execution';r.coverage.complete=false;r.witnesses=[];assert.equal(assessWitnessManifest(r,m).reason,'incomplete-coverage');
});
test('CLI returns unknown for proxy contact and registered material overlap separately',t=>{
  const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'frc-representation-'));
  t.after(()=>{assert.equal(path.dirname(dir),base);fs.rmSync(dir,{recursive:true});});
  const [m,r]=fixture(),mf=path.join(dir,'manifest.json'),rf=path.join(dir,'receipt.json');
  const run=()=>{fs.writeFileSync(mf,JSON.stringify(m));fs.writeFileSync(rf,JSON.stringify(r));const before=fs.readFileSync(rf,'utf8');const result=spawnSync(process.execPath,['scripts/check-native-witness.mjs',rf,mf],{encoding:'utf8',shell:false});assert.equal(fs.readFileSync(rf,'utf8'),before);return result;};
  assert.equal(run().status,0);r.witnesses[0].overlapVolume=0.02;assert.equal(run().status,1);
  m.witnesses[0].representations[1]='outer-envelope';r.witnesses[0].representations[1]='outer-envelope';assert.equal(run().status,2);
});
