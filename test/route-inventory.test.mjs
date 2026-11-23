/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {example,writePinned} from '../examples/field-route/make-example.mjs';
import {reviewFieldRoute} from '../scripts/field-route-evidence.mjs';

async function trial(t,change) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'source-occupancy-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {scenario,inventory,detector,sweep}=await example(dir);
  const read=async ref=>JSON.parse(await readFile(path.join(dir,ref.file)));
  const save=(name,value)=>writePinned(dir,name,value);
  const s=await read(scenario),i=await read(inventory),events=await read(detector),field=await read(s.sources.field);
  const extra=await change({s,i,field,sweep,events,save});
  s.sources.field=await save('field.json',field);
  i.fieldSha256=s.sources.field.sha256;
  const bound={scenario:await save('scenario.json',s)};
  for (const [index,contact] of (extra?.contacts??[]).entries()) {
    sweep.refinements.push(await save('contact-'+index+'.json',{
      schema:'field-route/refinement@1',clock:s.clock,scenarioSha256:bound.scenario.sha256,
      fromS:0,toS:1,timeS:.5,moving:'frame',obstacle:'post',backend:'synthetic-native-fixture',
      method:'material-intersection',volumeMm3:10,toleranceMm3:.01,sourceEvidence:s.sources.robot,...contact}));
  }
  if(extra?.transition) {
    const record={...extra.transition,fieldSha256:i.fieldSha256,trajectorySha256:s.sources.trajectory.sha256,clock:s.clock};
    i.transitions=[await save('change.json',record)];
  }
  if(extra?.exclusion) {
    const record={...extra.exclusion,fieldSha256:i.fieldSha256,trajectorySha256:s.sources.trajectory.sha256,clock:s.clock};
    i.exclusions=[await save('exclude.json',record)];
  }
  if(!extra?.legacy) bound.inventory=await save('inventory.json',i);
  bound.detector=await save('detector.json',{...events,scenarioSha256:bound.scenario.sha256});
  bound.route=await save('sweep.json',{...sweep,scenarioSha256:bound.scenario.sha256});
  await save('request.json',bound);
  return (await reviewFieldRoute(path.join(dir,'request.json'))).events[0];
}

test('an object missing from both producer lists is recovered from the independent field',async t=>{
  const r=await trial(t,({field})=>field.obstacles.push('unlisted'));
  assert.equal(r.declaredRouteStatus,'supported'); assert.equal(r.routeStatus,'pending');
  assert.ok(r.inventoryGaps.some(g=>g.reason.includes('unlisted')));
});
test('only the field catalog can declare its complete collection list',async t=>{
  const r=await trial(t,({field})=>{
    field.annex=['elsewhere'];
    field.fieldRouteInventory.collections.push({path:['annex'],format:'ids',initial:'placed'});
  });
  assert.equal(r.wholeFieldStatus,'pending');
  const scoped=await trial(t,({i})=>{i.scope.kind='bounded-study';});
  assert.equal(scoped.routeStatus,'supported');assert.equal(scoped.wholeFieldStatus,'pending');
  const legacy=await trial(t,()=>({legacy:true}));
  assert.equal(legacy.declaredRouteStatus,'supported');assert.equal(legacy.routeStatus,'pending');
});
test('unknown starting state and a sweep moved away from a registered box leave a gap',async t=>{
  const unknown=await trial(t,({field,i})=>{
    field.initial=['undetermined']; const rule={path:['initial'],format:'ids',initial:'unknown'};
    field.fieldRouteInventory.collections.push(rule);i.collections.push(rule);
  });
  assert.equal(unknown.routeStatus,'pending');assert.match(unknown.inventoryGaps[0].reason,/Unknown/);
  const drift=await trial(t,({field,i})=>{
    field.obstacles={post:[7,0,0,8,1,2]};
    const rule={path:['obstacles'],format:'keys',initial:'placed',bounds:'value'};
    field.fieldRouteInventory.collections[0]=rule;i.collections[0]=rule;
  });
  assert.ok(drift.inventoryGaps.some(g=>g.reason.includes('enclose')));
});
test('deposit changes a carried identity into an obstacle at the interval boundary',async t=>{
  const fn=async({s,sweep,save},when)=>{
    s.obstacles.push('parcel');
    s.intervals[0].obstacles=['post'];s.intervals[1].carried=[];s.intervals[1].obstacles=['parcel','post'];
    delete sweep.intervals[1].moving.parcel;
    const bounds=[3,2,0,4,3,1];sweep.intervals[1].obstacles.parcel=bounds;
    return {transition:{schema:'field-route/state-change@1',id:'parcel',from:'carried',to:'placed',
      method:'simulated release and support',timeS:when,bounds,sourceEvidence:await save('drop.json',{basis:'invented'})}};
  };
  assert.equal((await trial(t,v=>fn(v,1))).wholeFieldStatus,'supported');
  assert.equal((await trial(t,v=>fn(v,.9))).routeStatus,'pending');
});
test('stock stays off field and an exclusion needs time-bounded numeric evidence',async t=>{
  function stock({field,i}) {
    field.reserve=[{id:'spare'}]; const r={path:['reserve'],format:'rows',idKey:'id',initial:'stock'};
    i.collections.push(r);field.fieldRouteInventory.collections.push(r);
  }
  assert.equal((await trial(t,stock)).wholeFieldStatus,'supported');
  const omit=async(v,toS)=>{
    v.field.obstacles.push('far-object');
    return {exclusion:{schema:'field-route/exclusion@1',id:'far-object',method:'continuous-lower-bound',
      fromS:0,toS,minGapM:.2,sourceEvidence:await v.save('clearance.json',{basis:'invented'})}};
  };
  assert.equal((await trial(t,v=>omit(v,1))).routeStatus,'pending');
  assert.equal((await trial(t,v=>omit(v,2))).routeStatus,'supported');
});

test('a derived catalog must match the exact native field revision',async t=>{
  await assert.rejects(trial(t,async({i,save})=>{
    i.export=await save('stale-export.json',{fieldSha256:'a'.repeat(64)});
  }),/another field/);
  const scoped=await trial(t,({i})=>{i.scope.outsideScope=['unmeasured annex'];});
  assert.equal(scoped.wholeFieldStatus,'pending');
});

function registeredPost({field,i,sweep},extent,geometry) {
  const box=[.5,0,0,1.5,1,2];
  field.obstacles=[{id:'post',box:extent??box,geometry}];
  const rule={path:['obstacles'],format:'rows',idKey:'id',initial:'placed',bounds:'box'};
  if (geometry) rule.geometryKey='geometry';
  i.collections[0]=rule;
  field.fieldRouteInventory.collections[0]=rule;
  sweep.intervals[0].obstacles.post=box;
}

test('contacts from an incompatible installed pose remain visible and withhold a rejection',async t=>{
  const r=await trial(t,v=>{registeredPost(v,[.5,0,0,1.5,1,3]);return {contacts:[{}]};});
  assert.equal(r.declaredRouteStatus,'infeasible');
  assert.equal(r.routeStatus,'pending');
  assert.equal(r.wholeFieldStatus,'pending');
  assert.equal(r.contacts.length,1);
  assert.match(r.contacts[0].registrationIssue,/enclose/);
  assert.deepEqual(r.qualifiedContacts,[]);
});

test('matching and different solids with the same envelope are distinguished by source digest',async t=>{
  for (const [digest,expected] of [['a'.repeat(64),'infeasible'],['b'.repeat(64),'pending'],[undefined,'pending']]) {
    const r=await trial(t,v=>{
      registeredPost(v,undefined,'a'.repeat(64));
      v.field.missing=['elsewhere'];
      v.i.collections.push({path:['missing'],format:'ids',initial:'unknown'});
      return {contacts:[{obstacleGeometrySha256:digest}]};
    });
    assert.equal(r.routeStatus,expected);
    assert.equal(r.qualifiedContacts.length,expected==='infeasible'?1:0);
  }
});

test('a witness at the instant of removal uses the new custody state',async t=>{
  const r=await trial(t,v=>{
    registeredPost(v);
    return {contacts:[{timeS:1}],transition:{schema:'field-route/state-change@1',id:'post',
      from:'placed',to:'removed',timeS:1,method:'withdrawal',sourceEvidence:v.s.sources.trajectory}};
  });
  assert.equal(r.routeStatus,'pending');
  assert.match(r.contacts[0].registrationIssue,/placed at contact/);
});

test('a caller selecting only identities cannot erase the field catalog geometry revision',async t=>{
  const r=await trial(t,v=>{
    registeredPost(v,undefined,'a'.repeat(64));
    v.i.scope.kind='bounded-study';
    v.i.collections[0]={path:['obstacles'],format:'rows',idKey:'id',initial:'placed'};
    return {contacts:[{obstacleGeometrySha256:'b'.repeat(64)}]};
  });
  assert.equal(r.routeStatus,'pending');
  assert.match(r.contacts[0].registrationIssue,/geometry revision/);
});
