import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateMotorReceipt} from './motor-physics.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function exactKeys(x,keys,label){assert(x&&typeof x==='object'&&!Array.isArray(x),`${label}: object required`);assert(Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)),`${label}: exact fields required`);}
function subject(x,label){exactKeys(x,['codeSha256','cadSha256'],label);assert(hash(x.codeSha256)&&hash(x.cadSha256),`${label}: exact code and CAD SHA-256 pins required`);}
export const REQUIRED_PHYSICS_DOMAINS=Object.freeze(['physics','voltage','heat','friction','weight-distribution']);

// Deliberately one known adapter. Evidence cannot select a module, callback, path or its own coverage.
// Adding an adapter requires separately reviewed code, calibrated scope and verified candidate coupling.
export function reviewPhysicsEvidence(request){
 exactKeys(request,['schema','changes','baseline','candidate','evidence'],'physics request');
 assert(request.schema==='frc-physics-review-request/v1','Unknown physics request schema');
 assert(Array.isArray(request.changes)&&request.changes.length>0&&request.changes.every(x=>['code','cad'].includes(x))&&new Set(request.changes).size===request.changes.length,'Declare unique relevant code/CAD changes');
 subject(request.baseline,'baseline');subject(request.candidate,'candidate');
 for(const change of ['code','cad'])assert((request.baseline[change+'Sha256']!==request.candidate[change+'Sha256'])===request.changes.includes(change),`Declared changes must exactly match ${change} subject hash differences`);
 exactKeys(request.evidence,['adapter','config','receipt'],'evidence');
 assert(request.evidence.adapter==='motor-physics-benchmark/v1','Unsupported physics adapter; no engineering acceptance');
 const {config,receipt}=request.evidence;
 assert(config&&typeof config==='object','Benchmark config required');
 for(const name of ['baseline','candidate']){
  subject(config[name]?.subject,`benchmark ${name}`);
  assert(['codeSha256','cadSha256'].every(k=>config[name].subject[k]===request[name][k]),`Benchmark ${name} subject does not match requested revision`);
 }
 // This reruns the registered implementation and compares exact content, not a runStatus assertion.
 assert(validateMotorReceipt(config,receipt)===true,'Physics receipt replay did not verify');
 // These limits are authored in the trusted adapter registry, not copied from an evidence claim.
 const coverage=[
  {domain:'physics',status:'partial',executedModel:'Ideal motor rotational dynamics',missing:'Candidate mechanism/drivetrain geometry, gravity, loads, constraints and coupled contact behavior'},
  {domain:'voltage',status:'partial',executedModel:'Lumped DC source sag and ideal motor circuit',missing:'Actual wiring, devices, multi-load transient and candidate control behavior'},
  {domain:'heat',status:'partial',executedModel:'Lumped motor thermal state',missing:'Calibrated motor/device/component thermal network and limits for the candidate'},
  {domain:'friction',status:'partial',executedModel:'Viscous rotational friction',missing:'Calibrated contact, static/sliding friction and applicable mechanisms'},
  {domain:'weight-distribution',status:'unsupported',executedModel:null,missing:'Chassis mass distribution, center of mass, load transfer, support/contact and stability model'}
 ];
 const numericalVerification=Object.fromEntries(['baseline','candidate'].map(name=>[name,receipt.runs[name].numericalChecks.passed?'passed':'failed']));
 const blockers=coverage.map(x=>`${x.domain}: ${x.status}; ${x.missing}`);
 for(const [name,status] of Object.entries(numericalVerification))if(status!=='passed')blockers.push(`${name}: numerical energy/convergence verification failed`);
 blockers.push('Exact subject hashes are attribution only; robot code was not executed and CAD geometry was not extracted or simulated.','Synthetic unvalidated parameters: no hardware calibration or validated applicability.','No candidate-specific engineering acceptance bounds or validated scenarios are established.','Independent physical validation and qualified release authority remain required.');
 return {schema:'frc-physics-review/v1',baseline:structuredClone(request.baseline),candidate:structuredClone(request.candidate),changes:[...request.changes],adapter:request.evidence.adapter,executionVerification:'registered-model-replayed',numericalVerification,coverage,requiredDomains:[...REQUIRED_PHYSICS_DOMAINS],candidateBinding:'unverified',calibration:'none',engineeringAcceptance:'blocked',robotOperationAuthorized:false,blockers,limitations:['Replay verifies reproducible numerical execution, not truth of subject attribution or physical model adequacy.','This first adapter cannot satisfy the required robot-change gate; none of its receipts can yield engineering acceptance.','No external commands, robot operation or arbitrary evidence-supplied adapters are invoked.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{assert(process.argv.length===3,'Usage: node scripts/physics-evidence-gate.mjs request.json');console.log(JSON.stringify(reviewPhysicsEvidence(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));process.exitCode=2;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
