/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {deriveRoleDemand} from '../scripts/role-handoff.mjs';
import {reviewConcepts} from '../scripts/design-review.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';
import {simulateFixture} from '../examples/design-methods/role-fixture.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),read=evidenceReader(root);
const samples=new URL('../examples/design-methods/',import.meta.url);
const sample=id=>JSON.parse(readFileSync(new URL(id+'.json',samples),'utf8'));
const selection=sample('role-selection');
const study=sample('role-architectures');
const demand=deriveRoleDemand(selection,read);

test('role demand uses the actual focal outcome, stock, phase clock and station',()=>{
  assert.equal(demand.requiredPieces,5);assert.equal(demand.requiredPerSecond,5/45);
  assert.deepEqual(demand.preloadedPieces,['blue-supply/2']);assert.equal(demand.openingStock['blue-supply'].length,4);
  const shorter=deriveRoleDemand({...selection,windowS:[6.1,12.2]},read);
  assert.equal(shorter.requiredPieces,1);assert.notEqual(shorter.contractKey,demand.contractKey);
  const blocked=deriveRoleDemand({...selection,context:'crossing'},read);
  assert.equal(blocked.status,'open');assert.equal(blocked.requiredPieces,0);
  const pickup=deriveRoleDemand({...selection,station:'blue-supply'},read);
  assert.equal(pickup.identity.outcome,'acquired');assert.equal(pickup.requiredPieces,4);
  assert.throws(()=>deriveRoleDemand({...selection,station:'red-bay'},read),/compatible station/);
});

test('two architecture simulations reproduce different finite-window decisions under matched delays',()=>{
  assert.deepEqual(simulateFixture(demand),sample('role-fixture-results'));
  const {pairs}=reviewConcepts(study,read).roleHandoff;
  assert.deepEqual(pairs.map(p=>[p.before.count,p.after.count,p.deltaPieces,p.afterMeetsRole]),
    [[3,5,2,true],[3,4,1,false]]);
  assert.ok(pairs.every(p=>p.contrast.differentExchanges));
});

test('wrong actor, clock, role source, situation, inventory and missing witnesses stay open',()=>{
  const alterations=[
    e=>{e.focalRobot='R1';},
    e=>{e.windowS=[5,50];},
    e=>{e.clockWitnesses[1].timeS=8;},
    e=>{e.contractKey='another role';},
    e=>{e.fieldConditions.peers=[];},
    e=>{e.criterion='Partner received piece';},
    e=>{e.initialPieces=[];},
    e=>{e.events[0].focalRobot='R2';},
    e=>{e.events[0].witness='';},
    e=>{e.variation.receiverAvailableS=7;},
    e=>{e.revision='shared-fixture-r1';},
    e=>{e.evidence='physical';},
    e=>{e.events.find(x=>x.kind==='acquire').station='red-supply';}
  ];
  for(const change of alterations){
    const native=sample('role-fixture-results');
    change(native.runs.independent.nominal.episode);
    const result=reviewConcepts(study,ref=>ref.path.endsWith('role-fixture-results.json')?native:read(ref));
    assert.equal(result.roleHandoff.pairs[0].status,'open');
    assert.equal(result.roleHandoff.pairs[0].deltaPieces,undefined);
  }
});
