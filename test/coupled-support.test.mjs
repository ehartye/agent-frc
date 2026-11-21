import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {makeSupportFixture} from '../examples/design-methods/make-support-fixture.mjs';
import {reviewCoupled} from '../scripts/coupled-support.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';
import {staticWrenchRanges} from '../scripts/support-ranges.mjs';

function fixture(t){
  const folder=mkdtempSync(path.join(tmpdir(),'coupled-support-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const file=makeSupportFixture(folder),read=evidenceReader(folder),study=read(file),plan=read(study.plan);
  return {study,plan,read,native:read(study.cases[0].source),run:()=>reviewCoupled(study,read)};
}

test('opposed contacts bind forces and signed roll, pitch and yaw to one origin and native configuration',t=>{
  const {run,plan,native,study}=fixture(t);
  assert.deepEqual(run().cases.map(r=>r.residualMomentNm),[[0,0,0],[0,1,0],[0,4,0],[0,0,2.5]]);
  assert.deepEqual(run().cases.map(r=>r.status),['pass','fail','fail','fail']);
  assert.equal(run().cases[1].reactions[3].marginN,-2);
  assert.equal(run().comparisons[0].spread,5);
  plan.originM=[.1,.2,-.3];assert.ok(run().cases[0].residualMomentNm.every(n=>Math.abs(n)<1e-10));
  native.identity.reactionBasis='required-to-balance';assert.equal(run().cases[0].status,'open');
  native.identity.reactionBasis='independent-contact-solver';
  const c=study.cases[0].map.contacts[0];native.rows[0].required=native.rows[0].forceN;c.forceN='/required';
  assert.equal(run().cases[0].status,'open');c.forceN='/forceN';
  native.identity.contactIds.pop();assert.equal(run().cases[0].status,'open');
});

test('contact sign, separation, friction, scope and unpowered capacity prevent unsupported passes',t=>{
  const {run,native,plan}=fixture(t),c=native.rows[0];
  c.gapM=.1;assert.equal(run().cases[0].admissibility,'fail');c.gapM=-.004;
  c.normal=[0,0,-1];assert.equal(run().cases[0].admissibility,'fail');c.normal=[0,0,1];
  c.forceN=[10,0,40];assert.equal(run().cases[0].admissibility,'fail');
  c.active=false;assert.equal(run().cases[0].admissibility,'fail');c.active=true;c.forceN=[0,0,40];
  delete plan.contacts[0].rating;assert.equal(run().cases[0].capacity,'open');
  native.identity.duty='power-loss';plan.caseDuties.settled='power-loss';assert.equal(run().cases[0].capacity,'open');
  c.forceN=[null,0,40];assert.equal(run().cases[0].residualForceN[0],null);
});

test('transients subtract translational and angular momentum rates, including force transfer to the reporting origin',t=>{
  const {run,native,study}=fixture(t),map=study.cases[0].map;
  native.identity.mode='dynamic';native.rows[3].forceN=[30,0,0];
  assert.equal(run().cases[0].balance,'open');
  map.inertialForceN='/inertialForceN';map.angularMomentumRateAtCgNm='/angularMomentumRateAtCgNm';
  native.inertialForceN=[5,0,0];native.angularMomentumRateAtCgNm=[0,-1.5,.1];
  assert.equal(run().cases[0].balance,'pass');
  native.angularMomentumRateAtCgNm[2]=1;assert.equal(run().cases[0].balance,'fail');
});

test('a conservative force range can exclude yaw; containing zero supplies no feasibility proof',()=>{
  const point=[1,null,0],box={basis:'Measured pad width and lateral force limit.',pointM:[null,[.1,.12],null],forceN:[null,[-1,1],null]};
  const load={point,force:[20,null,0],couple:[0,0,0],bounds:box};
  const res=staticWrenchRanges([load,{point:[0,0,0],force:[-20,0,0],couple:[0,0,0]}],[0,0,0],.001,.001);
  assert.deepEqual(res.momentNm[2],[-3.4,-1]);assert.equal(res.disposition,'excludes-static-balance');
  box.pointM[1]=[-.1,.1];assert.equal(staticWrenchRanges([load],[0,0,0],25,0).disposition,'inconclusive');
});

test('a commissioned planar mass ledger and motion observation challenge an otherwise balanced fixed fixture',t=>{
  const {plan,study,read,native}=fixture(t);
  const {body,revision,frame}=plan;
  const massRef={sha256:'1'.repeat(64),pointer:''},motionRef={sha256:'2'.repeat(64),pointer:''};
  const ledger={body,revision,frame,units:'kg,m,kg*m2',members:[
    {id:'left',massKg:5,centerXYM:[.1,.02],centroidYawKgM2:.1},
    {id:'right',massKg:5,centerXYM:[.3,.02],centroidYawKgM2:.2}]};
  const motion={body,revision,frame,runId:native.identity.runId,caseId:'settled',timeS:0,mode:'static',
    units:'m/s2,rad/s2',model:'rigid-world-xy',basis:'kinematic-observation',provenance:'Independent teaching tracker.',
    cgAccelerationXY:[1,0],yawAcceleration:2};
  const lookup=r=>r===massRef?ledger:r===motionRef?motion:read(r);
  const run=()=>reviewCoupled(study,lookup).cases[0];
  assert.equal(run().status,'pass');
  plan.planarBoundary={massLedger:massRef,memberIds:['left','right'],massToleranceKg:1e-6,cgToleranceM:1e-7,motionByCase:{settled:motionRef}};
  assert.equal(run().balance,'pass');assert.equal(run().status,'fail');
  assert.ok(Math.abs(run().planarBoundary.momentAtCgNm-.8)<1e-10);
  motion.cgAccelerationXY=[0,0];motion.yawAcceleration=0;assert.equal(run().status,'pass');
  // A one-newton guide increment at y=0, z=.2 also applies a yaw moment about the offset mass center.
  native.identity.mode='dynamic';motion.mode='dynamic';native.rows[3].forceN=[26,0,0];
  for(const c of plan.contacts) read(c.rating)[c.id].modes=['static','dynamic'];
  const map=study.cases[0].map;
  map.inertialForceN='/inertialForceN';map.angularMomentumRateAtCgNm='/angularMomentumRateAtCgNm';
  native.inertialForceN=[1,0,0];native.angularMomentumRateAtCgNm=[0,-.3,.02];
  assert.equal(run().status,'fail');
  motion.cgAccelerationXY=[.1,0];motion.yawAcceleration=.05;
  assert.equal(run().status,'pass');
  motion.basis='force-derived-prediction';assert.equal(run().planarBoundary.consistency,'pass');assert.equal(run().status,'open');
  motion.basis='kinematic-observation';
  motion.runId='other';assert.equal(run().status,'open');motion.runId=native.identity.runId;
  ledger.members.pop();assert.equal(run().status,'open');
});

test('a reaction outside the commissioned floor cone fails even when the solver permits a larger coefficient',t=>{
  const {run,plan,native}=fixture(t);
  plan.contacts[0].maxFrictionCoefficient=.1;plan.contacts[0].frictionBasis='Classroom pad bound.';
  native.rows[0].mu=1;native.rows[0].forceN=[4,0,40];
  assert.equal(run().cases[0].reactions[0].admissibility,'pass');
  native.rows[0].forceN=[5,0,40];assert.equal(run().cases[0].reactions[0].admissibility,'fail');
});

test('a numerical response screen needs three distinct finer native settings with the remaining inputs held fixed',t=>{
  const {study,plan,read,run}=fixture(t);
  const rows=study.cases.slice(0,3).map(c=>read(c.source));
  for(const [i,r] of rows.entries()){r.settings={dt:.004/2**i,fixture:'fixed'};r.braceN=25+.01/(i+1);}
  rows[0].braceN=25.02;
  const comparison={id:'resolution',kind:'resolution',parameter:'dt',metric:'braceN',unit:'N',basis:'Fixture precision.',
    maxSpread:.03,cases:rows.map(r=>r.identity.caseId)};
  plan.comparisons=[comparison];
  assert.equal(run().comparisons[0].status,'within-declared-spread');
  rows[1].settings.fixture='other';assert.equal(run().comparisons[0].status,'open');
  rows[1].settings.fixture='fixed';rows[0].braceN=27;assert.equal(run().comparisons[0].status,'outside-declared-spread');
});
