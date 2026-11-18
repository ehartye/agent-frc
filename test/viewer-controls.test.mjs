import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {compareViewerControls} from '../scripts/viewer-controls.mjs';
const root=path.resolve(import.meta.dirname,'..');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/native-viewer/controls-'+name+'.json'),'utf8'));
const pair=()=>[fixture('expected'),fixture('observed')];
const compare=(change)=>{const [e,o]=pair();change?.(e,o);return compareViewerControls(e,o);};
const has=(r,code)=>r.issues.some(i=>i.code===code);
test('independent synthetic scenario matches without changing either input',()=>{
 const [e,o]=pair(),before=JSON.stringify([e,o]);const r=compareViewerControls(e,o);
 assert.equal(r.status,'matched');assert.equal(r.schema,'agent-frc/viewer-controls-result@1');assert.equal(r.scope.evidenceBasis,'synthetic');assert.equal(JSON.stringify([e,o]),before);
});
test('colliding display restored; unrelated observed camera and shadow preserved',()=>{
 for(const field of ['floor','camera','shadow']){
  const r=compare((e,o)=>{o.cases[0].events[0].finalDisplay[field]=field==='camera'?'wrong':!o.cases[0].events[0].finalDisplay[field];});
  assert.equal(r.status,'mismatch');assert.ok(has(r,'display-mismatch'));
 }
 const r=compare((e,o)=>{o.cases[0].events[3].postEngine.floor=false;o.cases[0].events[3].finalDisplay.floor=false;});
 assert.equal(r.status,'matched','unrelated event does not restore all default settings');
});
test('modifier changes release original physical binding, repeat is idempotent, blur and late keyup clear',()=>{
 for(const idx of [2,5,6]){const r=compare((e,o)=>{o.cases[0].events[idx].finalHeld=[{code:'KeyD',action:'drive-right'}];});assert.equal(r.status,'mismatch');assert.ok(has(r,'held-mismatch'));}
 assert.equal(compare((e,o)=>{o.cases[0].events[1].finalHeld.push({code:'KeyD',action:'drive-right'});}).status,'invalid');
});
test('colliding late keyup after focus loss is inert while release of a held key restores its collision',()=>{
 for(const middle of ['focus-loss','keyup']){
  const [e,o]=pair();
  const release=middle==='focus-loss'?{type:'focus-loss'}:{type:'keyup',code:'KeyD',modifiers:[]};
  e.cases=[{id:'late-collision',initialHeld:[],events:[
   {id:'press',type:'keydown',code:'KeyD',modifiers:[]},
   {id:'release',...release},
   {id:'late',type:'keyup',code:'KeyD',modifiers:[]}
  ]}];
  o.cases=[{id:'late-collision',events:[
   {id:'press',event:{type:'keydown',code:'KeyD',modifiers:[]},priorHeld:[],postEngine:{floor:false,camera:'orbit'},finalHeld:[{code:'KeyD',action:'drive-right'}],finalDisplay:{floor:true,camera:'orbit'}},
   {id:'release',event:release,priorHeld:[{code:'KeyD',action:'drive-right'}],postEngine:{floor:false,camera:'follow'},finalHeld:[],finalDisplay:{floor:middle==='keyup',camera:'follow'}},
   {id:'late',event:{type:'keyup',code:'KeyD',modifiers:[]},priorHeld:[],postEngine:{floor:false,camera:'follow'},finalHeld:[],finalDisplay:{floor:false,camera:'follow'}}
  ]}];
  const result=compareViewerControls(e,o);assert.equal(result.status,'matched',JSON.stringify(result));
  o.cases[0].events[2].finalDisplay.floor=true;
  const wrong=compareViewerControls(e,o);assert.equal(wrong.status,'mismatch');assert.ok(has(wrong,'display-mismatch'));
 }
});
test('missing observed post-engine state, event fields, incomplete transitions reject',()=>{
 for(const f of ['postEngine','priorHeld','finalHeld','finalDisplay','event'])assert.equal(compare((e,o)=>{delete o.cases[0].events[0][f];}).status,'invalid',f);
 assert.equal(compare((e,o)=>{o.cases[0].events.pop();}).status,'invalid');
 assert.equal(compare((e,o)=>{o.cases=[];}).status,'invalid');
});
test('stale source and valid unexpected transition evidence mismatch',()=>{
 assert.ok(has(compare((e,o)=>{o.sourcePins.archiveSha256='c'.repeat(64);}), 'source-mismatch'));
 assert.ok(has(compare((e,o)=>{o.cases[0].events[0].event.code='KeyA';}),'event-mismatch'));
 assert.ok(has(compare((e,o)=>{o.cases[0].events[1].priorHeld=[];}),'prior-held-mismatch'));
 const r=compare((e,o)=>{o.cases[0].events.reverse();});assert.equal(r.status,'mismatch');assert.ok(has(r,'event-order-mismatch'));
});
test('unique binding chords, explicit release coverage and collided option policy required',()=>{
 for(const f of ['applicationBindings','engineBindings'])assert.equal(compare((e)=>{e[f].push(structuredClone(e[f][0]));}).status,'invalid');
 assert.equal(compare(e=>{e.releaseOnFocusLoss=[];}).status,'invalid');
 assert.equal(compare(e=>{delete e.restoreValues.floor;}).status,'invalid');
 assert.equal(compare(e=>{e.restoreValues.camera='orbit';}).status,'invalid','unrelated option restoration unsupported');
 assert.equal(compare(e=>{e.applicationBindings[0].modifiers=['Shift','Shift'];}).status,'invalid');
 assert.equal(compare(e=>{e.applicationBindings[0].code='not-a-DOM-code';}).status,'invalid');
});
test('explicit modifiers distinguish otherwise identical keys',()=>{
 const r=compare((e,o)=>{e.applicationBindings.push({code:'KeyD',modifiers:['Shift'],action:'other'});e.releaseOnFocusLoss.push('other');});
 assert.equal(r.status,'matched');
});
test('evidence basis is propagated and never upgraded',()=>{
 for(const basis of ['interactive-observed','human-reported']){
  assert.equal(compare((e,o)=>{e.allowedEvidenceBases=[basis];o.evidenceBasis=basis;}).scope.evidenceBasis,basis);
  assert.equal(compare((e,o)=>{o.evidenceBasis=basis;}).status,'mismatch');
 }
 assert.equal(compare((e,o)=>{delete o.evidenceBasis;}).status,'invalid');
 assert.equal(compare((e,o)=>{o.evidenceBasis='native-observed';}).status,'invalid');
});
test('malformed schemas, pins, state and duplicate case/event identities reject deterministically',()=>{
 for(const change of [(e,o)=>{e.schema='bad';},(e,o)=>{delete o.sourcePins;},(e,o)=>{o.cases[0].events[0].postEngine.floor=Infinity;},(e,o)=>{o.cases.push(o.cases[0]);},(e,o)=>{e.cases[0].events.push(e.cases[0].events[0]);},(e,o)=>{o.cases[0].events[0].priorHeld=[{code:'KeyA',action:'unknown'}];}])assert.equal(compare(change).status,'invalid');
 const [e,o]=pair();delete o.sourcePins;delete o.evidenceBasis;
 assert.deepEqual(compareViewerControls(e,o),compareViewerControls(e,o));
 assert.ok(compareViewerControls(e,o).issues.every(i=>i.code&&i.path.startsWith('/')&&i.reason));
});
test('CLI example, mismatch, malformed JSON, missing input and size limit preserve exits',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frc-controls-'));try{
 const a=path.join(dir,'expected.json'),b=path.join(dir,'observed.json');const [e,o]=pair();
 fs.writeFileSync(a,JSON.stringify(e));fs.writeFileSync(b,JSON.stringify(o));
 const run=(args=[a,b])=>spawnSync(process.execPath,[path.join(root,'scripts/check-viewer-controls.mjs'),...args],{encoding:'utf8'});
 let r=run();assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'matched');
 o.cases[0].events[0].finalDisplay.floor=false;fs.writeFileSync(b,JSON.stringify(o));assert.equal(run().status,1);
 fs.writeFileSync(b,'{');assert.equal(run().status,2);
 fs.writeFileSync(b,' '.repeat(5000001));assert.equal(run().status,2);
 assert.equal(run([a,path.join(dir,'missing.json')]).status,2);assert.equal(run([]).status,2);
 }finally{fs.rmSync(dir,{recursive:true});}
});
