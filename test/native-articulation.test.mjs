import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compareNativeArticulation} from '../scripts/native-articulation.mjs';
const root=path.resolve(import.meta.dirname,'..');
const file=name=>path.join(root,'test/fixtures/native-viewer/articulation-'+name+'.json');
const pair=()=>['expected','observed'].map(n=>JSON.parse(fs.readFileSync(file(n),'utf8')));
const run=change=>{const [e,o]=pair();change?.(e,o);return compareNativeArticulation(e,o);};
const check=(status,code,change)=>{const r=run(change);assert.equal(r.status,status,JSON.stringify(r));assert.ok(r.issues.some(i=>i.code===code),JSON.stringify(r));};
const cli=args=>spawnSync(process.execPath,[path.join(root,'scripts/check-native-articulation.mjs'),...args],{encoding:'utf8',shell:false});
test('independent revolute/prismatic witnesses match with negative sign, offset and unordered inventories',()=>{
 const [e,o]=pair(),before=JSON.stringify([e,o]);o.joints.reverse();const reordered=JSON.stringify([e,o]);const r=compareNativeArticulation(e,o);
 assert.equal(r.status,'matched');assert.deepEqual(r.issues,[]);assert.equal(r.schema,'agent-frc/native-articulation-result@1');assert.equal(r.scope.evidenceBasis,'synthetic');assert.match(r.scope.limit,/supplied/);assert.equal(JSON.stringify([e,o]),reordered);assert.notEqual(before,reordered);
});
test('archive and producer pins mismatch; missing pins invalidate',()=>{
 for(const key of ['archiveSha256','producerSha256'])check('mismatch','source-mismatch',(e,o)=>o.sourcePins[key]='c'.repeat(64));
 check('invalid','source-pin-invalid',(e,o)=>delete o.sourcePins.archiveSha256);
 check('invalid','source-pin-invalid',(e,o)=>o.sourcePins.producerSha256='bad');
 check('invalid','inventory-missing',(e,o)=>{e.sourcePins.geometrySha256='c'.repeat(64);});
});
test('old reopened archive mismatches; absent or uncompleted reopen is invalid',()=>{
 check('mismatch','reopen-archive-mismatch',(e,o)=>o.witnesses[0].reopen.archiveSha256='c'.repeat(64));
 for(const change of [o=>delete o.witnesses[0].reopen,o=>o.witnesses[0].reopen.saved=false,o=>o.witnesses[0].reopen.reopened=false,o=>delete o.witnesses[0].reopen.archiveSha256])check('invalid','reopen-invalid',(e,o)=>change(o));
});
test('basis is propagated and missing, disallowed or unsupported basis is rejected',()=>{
 check('invalid','evidence-basis-invalid',(e,o)=>delete o.evidenceBasis);
 check('invalid','evidence-basis-invalid',(e,o)=>o.evidenceBasis='interactive-observed');
 check('mismatch','evidence-basis-disallowed',(e,o)=>o.evidenceBasis='native-observed');
 assert.equal(run((e,o)=>{e.allowedEvidenceBases=['human-reported'];o.evidenceBasis='human-reported';}).scope.evidenceBasis,'human-reported');
 check('invalid','allowed-bases-invalid',(e)=>e.allowedEvidenceBases=[]);
});
test('joint identity and supported kind validation rejects invalid graphs',()=>{
 for(const [change,code] of [[o=>o.joints[0].childBodyId='unknown','unknown-body'],[o=>o.joints[0].childBodyId='base','self-joint'],[o=>o.joints.push(o.joints[0]),'duplicate-id'],[o=>o.nativeBodies.push('base'),'duplicate-id'],[o=>o.joints[0].kind='spherical','joint-kind-invalid']])check('invalid',code,(e,o)=>change(o));
 check('invalid','inventory-missing',(e,o)=>{o.joints.pop();o.witnesses.shift();});
 check('mismatch','inventory-extra',(e,o)=>o.nativeBodies.push('spare'));
 check('mismatch','membership-mismatch',(e,o)=>{o.joints[0].parentBodyId='carriage';});
});
test('units, frame, axis and origin retain explicit mappings',()=>{
 check('invalid','units-invalid',(e,o)=>o.units.length='mm');
 check('invalid','joint-unit-invalid',(e,o)=>o.joints[0].unit='deg');
 check('invalid','unknown-frame',(e,o)=>o.joints[0].frameId='missing');
 check('mismatch','frame-mismatch',(e,o)=>{e.frames.push('other');o.frames.push('other');o.joints[0].frameId='other';});
 check('mismatch','axis-mismatch',(e,o)=>o.joints[0].axis=[0,0,-1]);
 check('mismatch','origin-mismatch',(e,o)=>o.joints[0].origin=[0,0,0.21]);
 for(const value of [[0,0,0],[0,0,2],[0,NaN,1]])check('invalid','axis-invalid',(e,o)=>o.joints[0].axis=value);
 check('invalid','origin-invalid',(e,o)=>o.joints[0].origin=[0,Infinity,0]);
});
test('sign, offset and both ordered limit systems are checked',()=>{
 check('mismatch','sign-mismatch',(e,o)=>o.joints[0].sign=1);
 check('mismatch','offset-mismatch',(e,o)=>o.joints[0].offset=0.7);
 for(const value of [undefined,NaN,Infinity])check('invalid','offset-invalid',(e,o)=>o.joints[0].offset=value);
 check('invalid','sign-invalid',(e,o)=>o.joints[0].sign=0);
 check('invalid','limits-invalid',(e,o)=>o.joints[0].nativeLimits=[1,-1]);
 check('mismatch','limit-mapping-mismatch',(e,o)=>o.joints[0].physicalLimits=[0,1]);
 check('mismatch','limits-mismatch',(e,o)=>{o.joints[0].nativeLimits=[-2,1];o.joints[0].physicalLimits=[-0.5,2.5];});
 check('invalid','limit-mapping-mismatch',e=>e.joints[0].physicalLimits=[0,1]);
});
test('readback mapping, actual pose, limits and frame are checked independently',()=>{
 check('mismatch','readback-mapping-mismatch',(e,o)=>o.witnesses[0].physical=0.4);
 check('mismatch','readback-mismatch',(e,o)=>{o.witnesses[0].native=0.3;o.witnesses[0].physical=0.4;});
 check('mismatch','readback-out-of-range',(e,o)=>{o.witnesses[0].native=0.6;o.witnesses[0].physical=0.7;});
 check('invalid','readback-invalid',(e,o)=>o.witnesses[0].native=NaN);
 check('invalid','readback-mapping-mismatch',e=>e.witnesses[0].physical=0.9);
 check('mismatch','witness-frame-mismatch',(e,o)=>{e.frames.push('other');o.frames.push('other');o.witnesses[0].frameId='other';});
});
test('named witness inventory rejects omitted, duplicate, extra or unrelated poses',()=>{
 check('invalid','joint-witness-missing',(e,o)=>o.witnesses.pop());
 check('invalid','duplicate-witness',(e,o)=>o.witnesses.push(o.witnesses[0]));
 check('invalid','unknown-joint',(e,o)=>o.witnesses[0].jointId='missing');
 check('invalid','witness-missing',(e,o)=>o.witnesses[0].poseId='another');
 check('mismatch','witness-extra',(e,o)=>o.witnesses.push({...o.witnesses[0],poseId:'extra'}));
});
test('only manifest tolerances govern comparisons and malformed tolerances fail',()=>{
 assert.equal(run((e,o)=>{e.joints[0].tolerances.origin=0.01;o.joints[0].origin[0]=0.01;}).status,'matched');
 check('mismatch','origin-mismatch',(e,o)=>{o.joints[0].origin[0]=0.01;o.joints[0].tolerances={origin:100};});
 for(const value of [-1,NaN,Infinity,undefined])check('invalid','tolerance-invalid',e=>e.joints[0].tolerances.coordinate=value);
});
test('axis tolerance is normalized angular separation in radians, not per-component distance',()=>{
 const [e,o]=pair(),angle=0.2;
 const expected=e.joints.find(j=>j.id==='hinge'),observed=o.joints.find(j=>j.id==='hinge');
 expected.axis=[0,0,1];observed.axis=[Math.sin(angle)/Math.sqrt(2),Math.sin(angle)/Math.sqrt(2),Math.cos(angle)];
 expected.tolerances.axis=0.15;
 assert.ok(observed.axis.every((v,i)=>Math.abs(v-expected.axis[i])<0.15),'Every component fits 0.15, but the angular separation is 0.2 rad');
 const result=compareNativeArticulation(e,o);assert.equal(result.status,'mismatch');assert.ok(result.issues.some(i=>i.code==='axis-mismatch'));
 expected.tolerances.axis=0.21;assert.equal(compareNativeArticulation(e,o).status,'matched');
});
test('malformed documents and diagnostics are deterministic without input mutation',()=>{
 for(const v of [null,[],false,{}])assert.equal(compareNativeArticulation(v,v).status,'invalid');
 const [e,o]=pair();o.joints[0].sign=0;delete o.witnesses[0].reopen;const before=JSON.stringify([e,o]);
 assert.deepEqual(compareNativeArticulation(e,o),compareNativeArticulation(e,o));assert.equal(JSON.stringify([e,o]),before);
});
test('CLI returns matched/mismatch/invalid and rejects malformed, missing and oversized files',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-articulation-test-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
 const receipt=path.join(dir,'receipt.json');const [e,o]=pair();o.sourcePins.archiveSha256='c'.repeat(64);fs.writeFileSync(receipt,JSON.stringify(o));
 assert.equal(cli([file('expected'),file('observed')]).status,0);
 const mismatch=cli([file('expected'),receipt]);assert.equal(mismatch.status,1);assert.equal(JSON.parse(mismatch.stdout).status,'mismatch');
 for(const body of ['{',' '.repeat(5000001)]){fs.writeFileSync(receipt,body);const r=cli([file('expected'),receipt]);assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'invalid');}
 assert.equal(cli([file('expected'),path.join(dir,'missing')]).status,2);assert.equal(cli([]).status,2);
});
