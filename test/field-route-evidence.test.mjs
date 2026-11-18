import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { example,writePinned } from '../examples/field-route/make-example.mjs';
import { reviewFieldRoute } from '../scripts/field-route-evidence.mjs';

async function run(t,change=()=>{}) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'route-check-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {scenario,detector,sweep,bound,inventory}=await example(dir);
  let s=JSON.parse(await readFile(path.join(dir,scenario.file)));
  let d=JSON.parse(await readFile(path.join(dir,detector.file)));
  const save=(name,value)=>writePinned(dir,name,value);
  const refs=[];
  await change({s,d,sweep,refs,bound,save,dir});
  const expected=await save('scenario.json',s);
  const routeRows=[];
  for (const [i,ref] of refs.entries()) routeRows.push(await save('pair-'+i+'.json',{...ref,scenarioSha256:expected.sha256,
    sourceEvidence:await save('numeric-'+i+'.json',{basis:'synthetic',ref})}));
  const req={inventory,scenario:expected,detector:await save('detector.json',{...d,scenarioSha256:expected.sha256}),
    route:await save('sweep.json',{...sweep,scenarioSha256:expected.sha256,refinements:routeRows})};
  await save('request.json',req);
  return reviewFieldRoute(path.join(dir,'request.json'));
}
const overlap=s=>s.intervals[0].obstacles.post=[.8,0,0,2,1,.8];
const pair={fromS:0,toS:1,moving:'frame',obstacle:'post',backend:'external test fixture',clock:'trial'};

test('same detector observation survives clear, refined, pending and infeasible paths',async t=>{
  const clear=await run(t);
  const refined=await run(t,({sweep,refs})=>{overlap(sweep);refs.push({...pair,method:'continuous-lower-bound',minGapM:.02});});
  const pending=await run(t,({sweep})=>overlap(sweep));
  const hit=await run(t,({sweep,refs})=>{overlap(sweep);refs.push({...pair,method:'material-intersection',timeS:.4,volumeMm3:12,toleranceMm3:.01});});
  assert.deepEqual([clear,refined,pending,hit].map(r=>r.events[0].routeStatus),['supported','supported','pending','infeasible']);
  for(const r of [refined,pending,hit]) assert.deepEqual(r.events[0].detectorEvent,clear.events[0].detectorEvent);
  assert.equal(hit.events[0].contacts[0].timeS,.4);
});
test('omissions of registration, time and payload keep credit pending',async t=>{
  for(const change of [
    ({s})=>delete s.sources.transform,({sweep})=>sweep.intervals.pop(),
    ({s,sweep})=>{s.intervals.shift();sweep.intervals.shift();},
    ({sweep})=>delete sweep.intervals[1].moving.parcel,({sweep})=>delete sweep.intervals[0].obstacles.post,
    ({sweep})=>sweep.intervals[0].method='endpoint-samples',
  ]) assert.equal((await run(t,change)).events[0].routeStatus,'pending');
});
test('an earlier cleared event keeps its result when a later interval collides',async t=>{
  const r=await run(t,({sweep,refs,d})=>{
    d.events.unshift({id:'prior',piece:'parcel',timeS:1});
    sweep.intervals[1].obstacles.post=[.8,0,0,2,1,.8];
    refs.push({...pair,fromS:1,toS:2,method:'material-intersection',timeS:1.5,volumeMm3:2,toleranceMm3:.01});
  });
  assert.deepEqual(r.events.map(e=>e.routeStatus),['supported','infeasible']);
});
test('contact continuation must be allowed and tied to resolved trajectory dynamics',async t=>{
  async function configure({s,sweep,refs,save},allow) {
    overlap(sweep);
    if(allow) s.contactResponses=[{moving:'frame',obstacle:'post',maxPenetrationM:.001,maxResidualM:.0001}];
    refs.push({...pair,method:'coupled-contact-response',trajectorySha256:s.sources.trajectory.sha256,
      contactModel:'fixture compliant stop',completeInterval:true,continuationIntegrated:true,maxPenetrationM:.0005,maxResidualM:.00001,
      dynamicsEvidence:await save('response.json',{basis:'synthetic',samples:[0,.5,1]})});
  }
  assert.equal((await run(t,v=>configure(v,false))).events[0].routeStatus,'pending');
  assert.equal((await run(t,v=>configure(v,true))).events[0].routeStatus,'supported');
});
test('changed source bytes and duplicate observations fail validation',async t=>{
  await assert.rejects(run(t,({dir})=>writeFile(path.join(dir,'field.json'),'changed')),/Changed input/);
  await assert.rejects(run(t,({d})=>d.events.push(d.events[0])),/Duplicate/);
});

test('positive material at the event instant survives missing broad-phase evidence',async t=>{
  const r=await run(t,({sweep,refs,d})=>{
    sweep.intervals=[];
    d.events[0].timeS=1;
    refs.push({...pair,fromS:1,toS:2,method:'material-intersection',timeS:1,volumeMm3:4,toleranceMm3:.01});
  });
  assert.equal(r.events[0].routeStatus,'infeasible');
  assert.equal(r.events[0].contacts[0].moving,'frame');
  assert.ok(r.events[0].gaps.length);
});
test('uncertified refinement and stale clock cannot turn an overlapping bound into clearance',async t=>{
  for(const ref of [{method:'continuous-lower-bound',minGapM:.005},{method:'clear-at-one-pose',minGapM:1}]) {
    const r=await run(t,({sweep,refs})=>{overlap(sweep);refs.push({...pair,...ref});});
    assert.equal(r.events[0].routeStatus,'pending');
  }
  await assert.rejects(run(t,({sweep})=>{sweep.clock='other';}),/clock mismatch/);
});
