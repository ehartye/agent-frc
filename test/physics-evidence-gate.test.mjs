/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runMotorBenchmark} from '../scripts/motor-physics.mjs';
import {reviewPhysicsEvidence,REQUIRED_PHYSICS_DOMAINS} from '../scripts/physics-evidence-gate.mjs';
const baseline={codeSha256:'0'.repeat(64),cadSha256:'2'.repeat(64)},candidate={codeSha256:'1'.repeat(64),cadSha256:'2'.repeat(64)};
const parameters={resistanceOhm:0.2,torqueConstantNmPerAmp:0.02,inertiaKgM2:0.01,viscousFrictionNmPerRadPerSec:0.001,thermalCapacityJPerK:100,coolingWPerK:1,resistanceTempCoeffPerK:0.0039};
function fixture(){
 const config={schema:'frc-motor-physics-benchmark/v1',basis:'synthetic-unvalidated',assumptionStatement:'Test-only synthetic motor; not an actual robot or calibrated model',baseline:{subject:structuredClone(baseline),parameters:structuredClone(parameters)},candidate:{subject:structuredClone(candidate),parameters:{...parameters,resistanceOhm:0.25}},scenario:{steps:200,dtSeconds:0.001,openCircuitVolts:12,batteryResistanceOhm:0.02,ambientC:25}};
 return {schema:'frc-physics-review-request/v1',changes:['code'],baseline:structuredClone(baseline),candidate:structuredClone(candidate),evidence:{adapter:'motor-physics-benchmark/v1',config,receipt:runMotorBenchmark(config)}};
}
test('Real registered-model replay cannot promote partial numerical coverage into acceptance',()=>{
 const request=fixture(),before=JSON.stringify(request),r=reviewPhysicsEvidence(request);
 assert.equal(r.executionVerification,'registered-model-replayed');assert.equal(r.engineeringAcceptance,'blocked');assert.equal(r.robotOperationAuthorized,false);assert.equal(r.candidateBinding,'unverified');assert.equal(r.calibration,'none');
 assert.deepEqual(REQUIRED_PHYSICS_DOMAINS,['physics','voltage','heat','friction','weight-distribution']);assert.deepEqual(r.coverage.map(x=>x.domain),REQUIRED_PHYSICS_DOMAINS);assert.ok(r.coverage.every(x=>['partial','unsupported'].includes(x.status)));assert.equal(r.coverage.at(-1).status,'unsupported');assert.ok(r.blockers.length>=5);assert.equal(JSON.stringify(request),before);
});
test('Missing, forged or unknown adapters and waiver labels fail closed',()=>{
 const good=fixture();for(const mutate of [r=>delete r.evidence,r=>r.evidence.adapter='arbitrary/path.mjs',r=>r.evidence.coverage={voltage:'passed'},r=>r.engineeringAcceptance='accepted',r=>r.changes=[],r=>r.changes=['code','code'],r=>r.changes=['documentation'],r=>r.candidate.codeSha256=null,r=>r.candidate.codeSha256=r.baseline.codeSha256,r=>r.evidence.receipt=null,r=>r.evidence.receipt={runStatus:'executed',engineeringAcceptance:'passed'},r=>r.evidence.receipt.robotOperationAuthorized=true]){const r=structuredClone(good);mutate(r);assert.throws(()=>reviewPhysicsEvidence(r));}
});
test('Exact baseline/candidate mismatch or changed model inputs invalidate the receipt',()=>{
 const good=fixture();for(const mutate of [r=>r.candidate.codeSha256='3'.repeat(64),r=>r.baseline.cadSha256='4'.repeat(64),r=>r.evidence.config.candidate.parameters.resistanceOhm+=0.01,r=>r.evidence.config.scenario.steps+=1]){const r=structuredClone(good);mutate(r);assert.throws(()=>reviewPhysicsEvidence(r));}
});
test('A changed code and CAD declaration still cannot bypass missing robot coupling and weight distribution',()=>{
 const r=fixture();r.changes=['code','cad'];r.candidate.cadSha256='5'.repeat(64);r.evidence.config.candidate.subject.cadSha256=r.candidate.cadSha256;r.evidence.receipt=runMotorBenchmark(r.evidence.config);const result=reviewPhysicsEvidence(r);assert.equal(result.engineeringAcceptance,'blocked');assert.ok(result.blockers.some(x=>x.includes('CAD geometry')));assert.ok(result.blockers.some(x=>x.startsWith('weight-distribution: unsupported')));
});
test('A reproducible simulation with failed numerical checks remains explicitly failed',()=>{
 const r=fixture();r.evidence.config.scenario.steps=10;
 for(const name of ['baseline','candidate']){r.evidence.config[name].parameters.thermalCapacityJPerK=1;r.evidence.config[name].parameters.resistanceTempCoeffPerK=1;}
 r.evidence.receipt=runMotorBenchmark(r.evidence.config);assert.equal(r.evidence.receipt.runs.baseline.numericalChecks.passed,false);
 const result=reviewPhysicsEvidence(r);assert.equal(result.executionVerification,'registered-model-replayed');assert.equal(result.numericalVerification.baseline,'failed');assert.ok(result.blockers.some(x=>x.includes('numerical energy/convergence verification failed')));assert.equal(result.engineeringAcceptance,'blocked');
});
test('Every changed code or CAD hash must be declared, even with a matching replay receipt',()=>{
 const r=fixture();r.candidate.cadSha256='6'.repeat(64);r.evidence.config.candidate.subject.cadSha256=r.candidate.cadSha256;r.evidence.receipt=runMotorBenchmark(r.evidence.config);assert.throws(()=>reviewPhysicsEvidence(r),/exactly match cad/);
});
