/** @lane merge */
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {assessContactConvergence} from '../scripts/contact-convergence.mjs';
const h='a'.repeat(64),other='b'.repeat(64);
function fixture(){
  const pins={scenario:h,constitutiveLaw:h,initialState:h,inputs:h,runtime:h,outcomeDefinition:h};
  const m={schema:'agent-frc/contact-convergence-manifest@1',comparisonPins:{...pins},windowEndSeconds:1,metrics:[{id:'speed',units:'m/s',definition:'speed at last sustained contact under the pinned event definition',absoluteTolerance:0.01}],studies:[
    {id:'step',axis:'timestep',resolutionParameters:['dtSeconds'],fixedSettingsSha256:h,levels:[0.02,0.01,0.005].map((dt,i)=>({runId:'dt-'+i,resolution:[dt],modelSha256:h,settingsSha256:h}))},
    {id:'contact',axis:'contact-geometry',resolutionParameters:['segments'],fixedSettingsSha256:h,levels:[32,64,128].map((n,i)=>({runId:'contact-'+i,resolution:[n],modelSha256:h,settingsSha256:h}))},
  ]};
  const r={schema:'agent-frc/contact-convergence-receipt@1',basis:'synthetic',runs:['dt-0','dt-1','dt-2','contact-0','contact-1','contact-2'].map((id,i)=>({id,comparisonPins:{...pins},fixedSettingsSha256:h,modelSha256:h,settingsSha256:h,windowEndSeconds:1,completion:'complete',termination:'HORIZON',outcome:'released',reportedIntegrityPassed:true,metrics:[{id:'speed',units:'m/s',value:[2,2.02,2.025][i%3]}]}))};
  return [m,r];
}
test('finite summaries within declared bounds never become engineering or calibration acceptance',()=>{
  const [m,r]=fixture(),before=JSON.stringify([m,r]),result=assessContactConvergence(m,r);
  assert.equal(result.status,'within-declared-bounds');assert.equal(result.evidenceBasis,'synthetic');
  assert.equal(result.engineeringAcceptance,'blocked');assert.equal(result.calibration,'not-assessed');assert.equal(result.integrity,'not-independently-verified');assert.equal(JSON.stringify([m,r]),before);
  assert.equal(result.studies[0].comparisons[0].values.length,3);
});
test('passing reported integrity and timestep study do not hide contact-resolution speed drift',()=>{
  const [m,r]=fixture();[3.4,2.7,2.1].forEach((v,i)=>r.runs[i+3].metrics[0].value=v);
  const result=assessContactConvergence(m,r);assert.equal(result.status,'not-converged');assert.equal(result.studies[0].status,'within-declared-bounds');assert.equal(result.studies[1].status,'not-converged');
});
test('refinement changing release to continued contact is decisive even when exit speed is undefined',()=>{
  const [m,r]=fixture();for(const i of [4,5]){r.runs[i].outcome='contact-at-horizon';r.runs[i].metrics[0].value=null;}
  const result=assessContactConvergence(m,r);assert.equal(result.status,'not-converged');assert.deepEqual(result.studies[1].outcomes,['released','contact-at-horizon','contact-at-horizon']);assert.ok(result.studies[1].issues.includes('discrete outcome changes under refinement'));
});
test('HORIZON alone does not resolve release or capture',()=>{
  const [m,r]=fixture();r.runs[5].outcome='unresolved';const result=assessContactConvergence(m,r);assert.equal(result.status,'unknown');assert.equal(result.studies[1].terminations[2],'HORIZON');
});
test('timestep and at least one contact refinement with three levels are mandatory',()=>{
  for(const edit of [m=>m.studies.pop(),m=>m.studies.shift(),m=>m.studies[1].levels.pop()]){const [m,r]=fixture();edit(m);assert.equal(assessContactConvergence(m,r).status,'invalid');}
});
test('refinement order rejects duplicate, coarser, nonfinite or unnamed controls',()=>{
  for(const edit of [m=>m.studies[0].levels[2].resolution=[0.03],m=>m.studies[1].levels[2].resolution=[64],m=>m.studies[1].levels[2].resolution=[NaN],m=>m.studies[1].resolutionParameters=[]]){const [m,r]=fixture();edit(m);assert.equal(assessContactConvergence(m,r).status,'invalid');}
});
test('joint search refinement must not reduce another search coordinate',()=>{
  const [m,r]=fixture();m.studies[1].axis='contact-search';m.studies[1].resolutionParameters=['searchPoints','iterations'];m.studies[1].levels.forEach((x,i)=>x.resolution=[20*2**i,10*2**i]);
  assert.equal(assessContactConvergence(m,r).status,'within-declared-bounds');m.studies[1].levels[2].resolution[1]=5;assert.equal(assessContactConvergence(m,r).status,'invalid');
});
test('changed law, initial energy/state, inputs, source or held settings cannot masquerade as refinement',()=>{
  for(const edit of [r=>r.runs[5].comparisonPins.constitutiveLaw=other,r=>r.runs[5].comparisonPins.initialState=other,r=>r.runs[5].comparisonPins.inputs=other,r=>r.runs[5].modelSha256=other,r=>r.runs[5].settingsSha256=other,r=>r.runs[5].fixedSettingsSha256=other]){const [m,r]=fixture();edit(r);assert.equal(assessContactConvergence(m,r).status,'unknown');}
});
test('window and unit mismatches prevent comparison',()=>{
  for(const edit of [r=>r.runs[5].windowEndSeconds=2,r=>r.runs[5].metrics[0].units='mm/s']){const [m,r]=fixture();edit(r);assert.equal(assessContactConvergence(m,r).status,'unknown');}
});
test('missing, extra, failed or cancelled runs and reported integrity failure remain unknown',()=>{
  for(const edit of [r=>r.runs.pop(),r=>r.runs.push({...structuredClone(r.runs[0]),id:'extra'}),r=>r.runs[5].completion='cancelled',r=>r.runs[5].completion='failed',r=>r.runs[5].reportedIntegrityPassed=false]){const [m,r]=fixture();edit(r);assert.equal(assessContactConvergence(m,r).status,'unknown');}
});
test('null metrics are not silently omitted from a passing study',()=>{
  for(const i of [3,5]){const [m,r]=fixture();r.runs[i].metrics[0].value=null;assert.equal(assessContactConvergence(m,r).status,'unknown');}
});
test('separately stable studies with different discrete outcomes still disagree',()=>{
  const [m,r]=fixture();for(const run of r.runs.slice(3))run.outcome='contact-at-horizon';assert.equal(assessContactConvergence(m,r).status,'not-converged');
});
test('invalid policy, duplicate IDs, forged acceptance and derived overflow fail closed',()=>{
  for(const edit of [(m)=>m.metrics[0].absoluteTolerance=-1,(m,r)=>r.runs.push(r.runs[0]),(m,r)=>r.engineeringAcceptance='accepted',(m,r)=>r.runs[5].metrics[0].value=Infinity]){const [m,r]=fixture();edit(m,r);assert.equal(assessContactConvergence(m,r).status,'invalid');}
  const [m,r]=fixture();r.runs[4].metrics[0].value=-1e308;r.runs[5].metrics[0].value=1e308;const result=assessContactConvergence(m,r);assert.equal(result.status,'unknown');assert.equal(JSON.stringify(result).includes('Infinity'),false);
  assert.equal(assessContactConvergence(null,null).status,'invalid');
});
test('CLI preserves inputs and distinguishes bounded summaries, disagreement and invalid evidence',t=>{
  const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'frc-convergence-'));t.after(()=>{assert.equal(path.dirname(dir),base);fs.rmSync(dir,{recursive:true});});
  const [m,r]=fixture(),mp=path.join(dir,'manifest.json'),rp=path.join(dir,'receipt.json');fs.writeFileSync(mp,JSON.stringify(m));
  const run=()=>spawnSync(process.execPath,['scripts/check-contact-convergence.mjs',mp,rp],{encoding:'utf8',shell:false});
  fs.writeFileSync(rp,JSON.stringify(r));assert.equal(run().status,0);assert.equal(fs.readFileSync(rp,'utf8'),JSON.stringify(r));
  r.runs[5].outcome='contact-at-horizon';fs.writeFileSync(rp,JSON.stringify(r));assert.equal(run().status,1);
  fs.writeFileSync(rp,'{');assert.equal(run().status,2);
});
