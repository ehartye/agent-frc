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
