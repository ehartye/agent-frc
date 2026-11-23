/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compareNativeExport} from '../scripts/native-export.mjs';
const root=path.resolve(import.meta.dirname,'..');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/native-viewer',name),'utf8'));
const pair=()=>[fixture('export-expected.json'),fixture('export-observed.json')];
const evaluate=(change)=>{const [e,o]=pair();change?.(e,o);return compareNativeExport(e,o);};
const cli=(args)=>spawnSync(process.execPath,[path.join(root,'scripts/check-native-export.mjs'),...args],{encoding:'utf8',shell:false});
const expectedFile=path.join(root,'test/fixtures/native-viewer/export-expected.json');
const observedFile=path.join(root,'test/fixtures/native-viewer/export-observed.json');
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-export-test-'));t.after(()=>fs.rmSync(dir,{recursive:true}));return dir;}
function assertInvalid(change,code){const r=evaluate(change);assert.equal(r.status,'invalid');assert.ok(r.issues.some(i=>i.code===code),JSON.stringify(r));}
function assertMismatch(change,code){const r=evaluate(change);assert.equal(r.status,'mismatch');assert.ok(r.issues.some(i=>i.code===code),JSON.stringify(r));}

test('independent fixtures match multiple meshes in one group, unordered inventories and quaternion sign',()=>{
 const [e,o]=pair(),before=JSON.stringify([e,o]);const r=compareNativeExport(e,o);
 assert.equal(r.status,'matched');assert.deepEqual(r.issues,[]);assert.equal(r.schema,'agent-frc/native-export-result@1');
 assert.equal(r.scope.evidenceBasis,'synthetic');assert.match(r.scope.limit,/finite/i);assert.equal(JSON.stringify([e,o]),before);
});

test('well-formed source or mesh identity differences mismatch; absent pins and bad hashes are invalid',()=>{
 assertMismatch((e,o)=>o.sourcePins.archiveSha256='e'.repeat(64),'source-mismatch');
 assertMismatch((e,o)=>o.sourcePins.producerSha256='e'.repeat(64),'source-mismatch');
 assertMismatch((e,o)=>o.meshes[0].sha256='e'.repeat(64),'mesh-hash-mismatch');
 assertInvalid((e,o)=>delete o.sourcePins.archiveSha256,'source-pin-invalid');
 assertInvalid((e,o)=>o.sourcePins.producerSha256='not-a-hash','source-pin-invalid');
 assertInvalid((e,o)=>delete o.meshes[0].sha256,'mesh-hash-invalid');
});

test('missing/extra declared inventory has explicit incomplete/mismatch outcome',()=>{
 assertInvalid((e,o)=>{o.meshes.pop();o.witnesses.pop();o.nativeBodies=o.nativeBodies.filter(x=>x!=='base');},'inventory-missing');
 assertMismatch((e,o)=>{o.nativeBodies.push('spare');o.exclusions.push({bodyId:'spare',reason:'Spare excluded fixture'});},'inventory-extra');
 assertInvalid((e,o)=>o.nativeBodies.push('base'),'duplicate-id');
 assertInvalid((e,o)=>o.meshes.push(structuredClone(o.meshes[0])),'duplicate-id');
 assertInvalid((e,o)=>o.motionGroups.push('frame'),'duplicate-id');
});

test('body-to-mesh coverage and exclusions are exact and explicit',()=>{
 assertInvalid((e,o)=>o.meshes[0].bodyIds=['unknown'],'unknown-body');
 assertInvalid((e,o)=>o.meshes[0].groupId='unknown','unknown-group');
 assertInvalid((e,o)=>o.meshes[0].bodyIds=['arm','base'],'body-multiple-membership');
 assertInvalid((e,o)=>o.exclusions=[],'body-unaccounted');
 assertInvalid((e,o)=>o.exclusions[0].reason='   ','exclusion-reason-invalid');
 assertInvalid((e,o)=>o.exclusions.push({bodyId:'arm',reason:'also excluded'}),'body-multiple-membership');
 assertInvalid((e,o)=>o.exclusions.push(structuredClone(o.exclusions[0])),'duplicate-id');
 assertInvalid((e,o)=>o.exclusions[0].bodyId='unknown','unknown-body');
 assertMismatch((e,o)=>o.exclusions[0].reason='Different declared reason','exclusion-mismatch');
});

test('explicit frames and canonical units are required, no transforms are inferred',()=>{
 assertInvalid((e,o)=>o.units.length='mm','units-invalid');
 assertInvalid((e,o)=>o.units.angle='deg','units-invalid');
 assertInvalid((e,o)=>delete o.units,'units-invalid');
 assertInvalid((e,o)=>o.witnesses[0].frameId='missing','unknown-frame');
 assertMismatch((e,o)=>{e.frames.push('other');o.frames.push('other');o.witnesses[0].frameId='other';},'frame-mismatch');
});

test('evidence basis is required, constrained and retained without promotion',()=>{
 assertInvalid((e,o)=>delete o.evidenceBasis,'evidence-basis-invalid');
 assertInvalid((e,o)=>o.evidenceBasis='interactive-observed','evidence-basis-invalid');
 assertMismatch((e,o)=>o.evidenceBasis='native-observed','evidence-basis-disallowed');
 const r=evaluate((e,o)=>{e.allowedEvidenceBases=['human-reported'];o.evidenceBasis='human-reported';});
 assert.equal(r.status,'matched');assert.equal(r.scope.evidenceBasis,'human-reported');
 assertInvalid((e,o)=>e.allowedEvidenceBases=[],'allowed-bases-invalid');
});

test('finite witnesses and explicit manifest tolerances are required for every mesh',()=>{
 assertInvalid((e,o)=>o.witnesses.pop(),'mesh-witness-missing');
 assertInvalid((e,o)=>o.witnesses.push(structuredClone(o.witnesses[0])),'duplicate-witness');
 assertInvalid((e,o)=>o.witnesses[0].meshId='missing','unknown-mesh');
 assertInvalid((e,o)=>o.witnesses[0].poseId='','pose-id-invalid');
 assertInvalid((e,o)=>delete e.witnesses[0].tolerances,'tolerance-invalid');
 assertInvalid((e,o)=>e.witnesses[0].tolerances.angular=-1,'tolerance-invalid');
 assertInvalid((e,o)=>o.witnesses[0].translation[0]=Infinity,'vector-invalid');
 assertInvalid((e,o)=>o.witnesses[0].rotation=[0,0,0,0],'quaternion-invalid');
 assertInvalid((e,o)=>o.witnesses[0].rotation=[0,0,0,1.01],'quaternion-invalid');
 assertInvalid((e,o)=>o.witnesses[0].bounds.min[0]=10,'bounds-invalid');
});

test('position, quaternion angle and bounds use only independent manifest tolerances',()=>{
 assertMismatch((e,o)=>o.witnesses[0].translation[0]=0.002,'translation-mismatch');
 assertMismatch((e,o)=>o.witnesses[0].rotation=[0,0,Math.sin(0.01),Math.cos(0.01)],'rotation-mismatch');
 assertMismatch((e,o)=>o.witnesses[0].bounds.max[0]+=0.002,'bounds-mismatch');
 assertMismatch((e,o)=>{o.witnesses[0].translation[0]=1;o.witnesses[0].tolerances={position:1000,angular:1000,bounds:1000};},'translation-mismatch');
 assert.equal(evaluate((e,o)=>{o.witnesses[0].translation[0]=0.001;}).status,'matched');
 assert.equal(evaluate((e,o)=>{o.witnesses[0].translation[0]=0.0005;o.witnesses[0].rotation=[0,0,Math.sin(0.0002),Math.cos(0.0002)];}).status,'matched');
});

test('missing and extra named witnesses remain distinct even when each mesh has one witness',()=>{
 assertInvalid((e,o)=>{const extra=structuredClone(e.witnesses[0]);extra.poseId='raised';e.witnesses.push(extra);},'witness-missing');
 assertMismatch((e,o)=>{const extra=structuredClone(o.witnesses[0]);extra.poseId='raised';o.witnesses.push(extra);},'witness-extra');
});

test('malformed schemas and structures return deterministic invalid JSON-pointer issues',()=>{
 for(const bad of [null,[],{},'bad'])assert.equal(compareNativeExport(bad,bad).status,'invalid');
 assertInvalid((e,o)=>o.schema='agent-frc/native-export-receipt@2','schema-invalid');
 assertInvalid((e,o)=>o.meshes=[null],'mesh-invalid');
 const [e,o]=pair();delete o.evidenceBasis;o.units.length='mm';o.meshes[0].sha256='bad';
 const a=compareNativeExport(e,o),b=compareNativeExport(e,o);assert.deepEqual(a,b);
 assert.ok(a.issues.every(i=>i.path.startsWith('/')&&typeof i.reason==='string'&&i.reason));
 assert.deepEqual(a.issues.map(i=>i.path+'\0'+i.code),a.issues.map(i=>i.path+'\0'+i.code).sort());
});

test('CLI returns matched/mismatch/invalid exits without mutating input files',t=>{
 const dir=temporary(t),before=fs.readFileSync(observedFile);let p=cli([expectedFile,observedFile]);assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).status,'matched');
 const [e,o]=pair();o.sourcePins.archiveSha256='e'.repeat(64);const file=path.join(dir,'observed.json');fs.writeFileSync(file,JSON.stringify(o));
 p=cli([expectedFile,file]);assert.equal(p.status,1);assert.equal(JSON.parse(p.stdout).status,'mismatch');
 delete o.evidenceBasis;fs.writeFileSync(file,JSON.stringify(o));p=cli([expectedFile,file]);assert.equal(p.status,2);assert.equal(JSON.parse(p.stdout).status,'invalid');
 assert.deepEqual(fs.readFileSync(observedFile),before);
});

test('CLI rejects missing/extra args, missing file, directory, JSON and size errors as structured invalid results',t=>{
 const dir=temporary(t),bad=path.join(dir,'bad.json'),huge=path.join(dir,'huge.json');fs.writeFileSync(bad,'{');fs.writeFileSync(huge,' '.repeat(5000001));
 for(const args of [[],[expectedFile],[expectedFile,observedFile,'extra'],[expectedFile,path.join(dir,'missing')],[expectedFile,dir],[expectedFile,bad],[expectedFile,huge]]){
  const p=cli(args);assert.equal(p.status,2,p.stderr);const r=JSON.parse(p.stdout);assert.equal(r.status,'invalid');assert.equal(r.schema,'agent-frc/native-export-result@1');
 }
 const exact=path.join(dir,'exact.json'),text=fs.readFileSync(observedFile,'utf8');fs.writeFileSync(exact,text+' '.repeat(5000000-Buffer.byteLength(text)));assert.equal(cli([expectedFile,exact]).status,0);
});
