import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {makeActuatorDutyFixture} from '../examples/design-methods/make-actuator-duty-fixture.mjs';
import {reviewActuatorDuties} from '../scripts/actuator-duties.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';

function fixture(t){
  const dir=mkdtempSync(path.join(tmpdir(),'actuator-duty-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=makeActuatorDutyFixture(dir),read=evidenceReader(dir),study=read(file);
  const plan=read(study.plan),entry=study.entries[2];
  return {study,plan,entry,arch:plan.architectures[1],motion:read(entry.motion),jam:read(entry.obstruction),read,
    run:()=>reviewActuatorDuties(study,read)};
}

test('the carriage reaches the stroke in all four runs but disturbance changes jam and hold margins',t=>{
  const {run}=fixture(t),rows=run().rows;
  assert.deepEqual(rows.map(r=>[r.normal.status,r.obstruction.status,r.hold.status]),[
    ['pass','fail','pass'],['pass','fail','fail'],['pass','pass','pass'],['pass','fail','pass']]);
  assert.ok(rows.every(r=>r.installedStatus==='open'));
  assert.equal(rows[2].obstruction.overshootAboveTripN,15);
  assert.equal(rows[3].obstruction.overshootAboveTripN,40);
  assert.ok(Math.abs(rows[2].obstruction.responseDelayS-.15)<1e-8);
  assert.ok(rows[1].hold.witnessedLossAtS>4);
});
test('retention needs the entire de-energized horizon and an actual loaded powered pose',t=>{
  const {run,motion,arch}=fixture(t),row=()=>run().rows[2];
  motion.positions.filter(p=>p.powered).forEach(p=>p.loadRetained=false);
  assert.equal(row().normal.status,'open');
  const band=motion.intervals.find(r=>r.fromS===3);
  band.powered=true;assert.equal(row().hold.status,'open');band.powered=false;
  motion.intervals.pop();assert.equal(row().hold.status,'open');
  motion.positions.push({timeS:3.1,powered:false,loadRetained:false,witness:'Unlatched between recovered samples'});
  assert.equal(row().hold.status,'fail');
  arch.holdingAllowable.sha256='f'.repeat(64);
  assert.equal(row().hold.kinematics,'fail');
});
test('observed actuation and the original branch, force and time are independent of a declared threshold',t=>{
  const {run,jam,arch,read}=fixture(t),row=()=>run().rows[2].obstruction;
  const p=jam.protection;p.kind='ideal-trip';assert.equal(row().action,'open');
  p.kind='observed-controller-action';p.axialTripN=80;assert.equal(row().action,'open');p.axialTripN=60;
  const changed=jam.intervals.find(s=>s.fromS===.75);changed.drivePowered=true;
  assert.equal(row().action,'open');changed.drivePowered=false;
  p.appliedS=1.85;assert.equal(row().action,'open');p.appliedS=.75;
  const rating=read(arch.allowable);rating.kind='catalog-basic-static';assert.equal(row().capacity,'open');
  rating.kind='approved-service-envelope';jam.intervals[0].output='other-side';assert.equal(row().status,'open');
});
test('a qualified intrinsic torque bound must include independently supported transfer and transients',t=>{
  const {study,arch,plan,jam,read}=fixture(t);
  arch.protectionRequirement='intrinsic-bound';delete jam.intervals;
  const transfer={sha256:'a'.repeat(64),pointer:'/transfer'},qualification={sha256:'b'.repeat(64),pointer:'/qualification'};
  const e=jam.envelope={inputShaft:'input',transfer,maxAbsTorqueNm:2,additionalPeakN:10,qualification};
  const tdata={kind:'torque-to-branch-force-upper-bound',revision:arch.revision,output:arch.output,inputShaft:'input',maxNPerNm:20,
    frictionBasis:'bounded',allocationBasis:'entire branch',transmissionBasis:'measured envelope',directionBasis:'both signs'};
  const proof={kind:'qualified-blocked-torque-bound',architecture:arch.id,revision:arch.revision,output:arch.output,
    caseId:jam.identity.caseId,startId:jam.identity.startId,coveredPositionM:[0,.1],settings:jam.identity.settings,inputShaft:e.inputShaft,maxAbsTorqueNm:2,additionalPeakN:10,
    transferSha256:transfer.sha256,transferPointer:transfer.pointer,validDurationS:3,dynamicBasis:'native impact bound',
    operatingConditions:'declared envelope',evidence:plan.evidence};
  const source=ref=>ref===transfer?{transfer:tdata}:ref===qualification?{qualification:proof}:read(ref);
  const row=()=>reviewActuatorDuties(study,source).rows[2].obstruction;
  assert.deepEqual([row().status,row().demand.maxAbsN,row().action],['pass',50,'not-required']);
  read(arch.allowable).negativeN=45;assert.equal(row().capacity,'open');
  delete e.additionalPeakN;assert.equal(row().demand.status,'open');
  e.additionalPeakN=10;proof.output='other-branch';assert.equal(row().demand.status,'open');
});
test('physical release requires an applicable actual hold rating, complete path and matched evidence',t=>{
  const {study,plan,arch,jam,motion,read,run}=fixture(t);
  plan.evidence='physical';plan.purpose='project';
  for(const r of [jam,motion]){r.identity.evidence='physical';r.coverage='bandwidth-bounded-measurement';}
  read(arch.allowable).evidence='qualified-load-test';
  assert.equal(run().rows[2].installedStatus,'open');
  const rating=read(arch.holdingAllowable);rating.evidence='qualified-load-test';
  assert.equal(run().rows[2].installedStatus,'pass');
  rating.durationS=1;assert.equal(run().rows[2].installedStatus,'open');rating.durationS=10;
  rating.positiveN=20;assert.equal(run().rows[2].hold.status,'fail');
  delete study.entries[2].motion;assert.equal(run().rows[2].normal.status,'open');
});
