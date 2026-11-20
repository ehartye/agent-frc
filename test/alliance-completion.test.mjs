import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {makeAllianceCompletion} from '../examples/design-methods/make-alliance-completion.mjs';
import {reviewAllianceCompletion} from '../scripts/alliance-completion.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';

function fixture(t){
  const folder=mkdtempSync(path.join(tmpdir(),'alliance-completion-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const src=makeAllianceCompletion(folder),read=evidenceReader(folder),study=read(src),plan=read(study.plan);
  const trace=i=>read(study.entries[i].source);
  return {study,plan,read,trace,run:()=>reviewAllianceCompletion(study,read)};
}
test('a ready or occupied partner reverses the tabletop choice on finite stock and the same twenty seconds',t=>{
  const {run}=fixture(t),r=run();
  assert.deepEqual(r.rows.map(x=>x.counts.completedCycles),[3,4,4,2]);
  assert.deepEqual(r.rows.map(x=>x.counts.focalDeposits),[0,4,0,4]);
  assert.deepEqual(r.choices.map(c=>c.winners),[['relay-carriage'],['direct-carriage']]);
  assert.equal(r.reversal,'observed-in-compared-strategies');assert.equal(r.wholeRobotPreference,'open');
  const delayed=r.rows[3];assert.equal(delayed.counts.partnerReceipts,2);
  assert.equal(delayed.counts.relayCycles,1);assert.equal(delayed.counts.independentPartnerCycles,1);
  assert.equal(delayed.ratePerS,.1);assert.equal(Object.values(delayed.finalCustody).filter(s=>s.kind==='held').length,1);
});
test('the horn, complete coverage, source identity and one execution per cell govern comparison',t=>{
  const {trace,run,study}=fixture(t),r=trace(1);
  const last=r.events.findLast(e=>e.action==='reset');last.timeS=20;
  assert.equal(run().rows[1].counts.completedCycles,3);assert.equal(run().rows[1].late.length,1);
  r.observation.coverage='selected frames';assert.equal(run().rows[1].objectiveCount,null);
  r.observation.coverage='all-registered-actor-events';r.identity.runId=trace(0).identity.runId;
  assert.deepEqual(run().rows.slice(0,2).map(row=>row.status),['open','open']);
  delete study.entries[3].source;assert.equal(run().reversal,'open');
});
test('a deposit needs space; pickup, downstream acceptance and reset require the original identity, actor and station',t=>{
  const {trace,run}=fixture(t),r=trace(3),row=()=>run().rows[3];
  const deposits=r.events.filter(e=>e.action==='deposit');
  const station=deposits[1].station;deposits[1].station=deposits[0].station;
  assert.equal(row().status,'open');deposits[1].station=station;
  const pickup=r.events.find(e=>e.action==='receive'),piece=pickup.piece;
  pickup.piece='absent';assert.equal(row().status,'open');pickup.piece=piece;
  const target=r.events.find(e=>e.action==='deliver');target.criterion='pad exchange';assert.equal(row().status,'open');
  target.criterion=r.identity.criterion;const reset=r.events.find(e=>e.action==='reset');reset.actor='carrier';assert.equal(row().status,'open');
});
test('different supply, unexecuted systems and mismatched setups cannot establish a strategic hardware preference',t=>{
  const {trace,run,plan,read}=fixture(t),r=trace(3),context=read(r.setup);
  context.exchangeAvailability=[0,21];assert.equal(run().rows[3].status,'open');context.exchangeAvailability=[15,21];
  const extra={id:'extra',station:'supply-rack',availableS:0};context.supply.push(extra);plan.policies[1].supply.push(extra);
  assert.equal(run().status,'compared');assert.equal(run().reversal,'open');
  plan.architectures[1].interfaces=plan.architectures[0].interfaces;assert.equal(run().choices[0].status,'open');
});
test('both actors consume finite inventory and share the registered downstream capacity',t=>{
  const {trace,run}=fixture(t),r=trace(2);
  const carrier=r.events.find(e=>e.actor==='carrier'&&e.action==='acquire');
  const original=carrier.piece;carrier.piece='reserved';carrier.station='partner-rack';
  assert.equal(run().rows[2].status,'open');carrier.piece=original;carrier.station='supply-rack';
  const drop=r.events.find(e=>e.actor==='receiver'&&e.action==='deliver');
  drop.timeS=10;r.events.sort((a,b)=>a.timeS-b.timeS);
  assert.equal(run().rows[2].status,'open');
});
