import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {makeLiftFaultFixture} from '../examples/design-methods/make-lift-fault-fixture.mjs';
import {reviewLiftPaths} from '../scripts/lift-path-faults.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';

function fixture(t){
  const dir=mkdtempSync(path.join(tmpdir(),'lift-paths-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const read=evidenceReader(dir),study=read(makeLiftFaultFixture(dir)),plan=read(study.plan);
  const run=()=>reviewLiftPaths(study,read);
  const row=(layout,id)=>run().rows.find(r=>r.layout===layout&&r.case===id);
  const source=(layout,id)=>read(study.runs.find(e=>e.layout===layout&&e.case===id).source);
  return {read,study,plan,run,row,source};
}
test('a local transfer cut only has a bypass when the connector is on its load side',t=>{
  const {row,run}=fixture(t);
  assert.equal(row('shaft-link','right-belt-out').paths[1].status,'disconnected');
  assert.equal(row('shaft-link','right-belt-out').motion.status,'fail');
  assert.deepEqual(row('tier-link','right-belt-out').paths[1].steps,['right-to-left','left-to-left-shaft','left-shaft-to-fixed-base']);
  assert.equal(row('tier-link','right-belt-out').motion.status,'within-modeled-limits');
  assert.ok(run().coverage.every(c=>c.controls.every(check=>check.motionObserved&&check.topologyObserved)));
});
test('common descent, individual excursion and absolute rack use simultaneous signed coordinates from the cut',t=>{
  const {row,plan,read,source}=fixture(t),r=row('tier-link','both-holders-out');
  assert.equal(r.motion.peaks.rackMm,0);assert.ok(r.motion.first.common&&r.motion.first.left);
  assert.equal(r.topology,'disconnected');assert.ok(r.motion.peaks.commonDropMm>11);
  assert.equal(row('tier-link','loose-link-and-right-holder-out').topology,'connected-in-model');
  assert.equal(row('tier-link','loose-link-and-right-holder-out').motion.status,'fail');
  const g=read(plan.layouts[1].source),motion=source('tier-link','healthy');
  for(const item of [g.axes,motion.axes])item[1].alignedZeroMm=3;
  assert.equal(row('tier-link','healthy').motion.first.rack.elapsedS,0);
});
test('actual native component state, timing, datum, horizon and unknown paths prevent false positive findings',t=>{
  const {row,source,plan,read}=fixture(t),r=source('tier-link','right-belt-out'),state=read(r.controls);
  state.channels['right-belt']=true;assert.equal(row('tier-link','right-belt-out').motion.status,'open');
  state.channels['right-belt']=false;state.intervals[0].drivePowered=true;assert.equal(row('tier-link','right-belt-out').motion.status,'open');
  state.intervals[0].drivePowered=false;r.positions.pop();assert.equal(row('tier-link','right-belt-out').motion.status,'open');
  state.sampleCount--;state.observedThroughS-=r.stepS;state.intervals[0].toS=state.observedThroughS;assert.equal(row('tier-link','right-belt-out').motion.status,'open');
  const g=read(plan.layouts[1].source);g.edges.find(e=>e.from==='right'&&e.to==='left').state='unresolved';
  assert.equal(row('tier-link','right-belt-out').paths[1].status,'open');
  const other=source('shaft-link','healthy');other.axes[0].downSign=-1;
  assert.equal(row('shaft-link','healthy').motion.status,'open');
});
test('resolution and coverage need distinct intact native pairs for the same operating conditions',t=>{
  const {run,study,source}=fixture(t);
  assert.equal(run().resolution[0].status,'within-declared-spread');
  const fine=source('tier-link','right-holder-out-fine');
  fine.identity.conditions={loadN:8};assert.equal(run().resolution[0].status,'open');
  study.runs=study.runs.filter(r=>r.case!=='both-holders-out');
  assert.equal(run().coverage[1].controls.find(c=>c.cut.length===2).motionObserved,false);
});
