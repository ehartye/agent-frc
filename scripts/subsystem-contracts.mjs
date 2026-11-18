import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateStudy, impactReport, pin} from './decision-chain.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const text=x=>typeof x==='string'&&x.trim().length>0;
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function keys(x,allowed,label){assert(object(x),`${label}: object required`);assert(Object.keys(x).every(k=>allowed.includes(k)),`${label}: unknown field`);}
function unique(items,label){assert(Array.isArray(items),`${label}: array required`);const seen=new Set();for(const x of items){assert(id(x.id)&&!seen.has(x.id),`${label}: invalid/duplicate ID`);seen.add(x.id);}return seen;}
function strings(xs,label){assert(Array.isArray(xs)&&xs.length>0&&xs.every(text),`${label}: nonempty text array required`);}
function validatePin(p){keys(p,['id','revision','sha256'],'pin');assert(id(p.id)&&Number.isSafeInteger(p.revision)&&p.revision>0&&/^[a-f0-9]{64}$/.test(p.sha256),'Invalid dependency pin');}
const samePin=(a,b)=>a?.id===b?.id&&a?.revision===b?.revision&&a?.sha256===b?.sha256;

// Structural desk-review lint only. Textual claims, real hardware and reviewers are not authenticated.
export function validateSubsystemContract(c){
 keys(c,['schema','subsystemId','owners','capabilityIds','dependencyPins','interfaces','hazards','checks','unresolvedInputs'],'contract');
 assert(c.schema==='frc-subsystem-contract/v1'&&id(c.subsystemId),'Invalid contract schema/identity');
 keys(c.owners,['hardware','software','integration'],'owners');
 for(const k of ['hardware','software','integration'])assert(c.owners[k]===null||text(c.owners[k]),`Missing ${k} owner (use null for unknown)`);
 strings(c.capabilityIds,'capabilityIds');
 assert(Array.isArray(c.dependencyPins)&&c.dependencyPins.length>0,'Exact dependency pins required');
 const deps=new Set();for(const p of c.dependencyPins){validatePin(p);assert(!deps.has(p.id),'Duplicate dependency identity');deps.add(p.id);}
 const interfaces=unique(c.interfaces,'interfaces');assert(interfaces.size>0,'At least one interface required');
 for(const i of c.interfaces){
  keys(i,['id','kind','producer','consumer','definition','quantities','failureResponse','verificationIds'],'interface');
  assert(['mechanical','electrical','software'].includes(i.kind),'Unknown interface kind');
  assert(id(i.producer)&&id(i.consumer)&&i.producer!==i.consumer&&(i.producer===c.subsystemId||i.consumer===c.subsystemId),'Interface endpoints must include this subsystem');
  assert(text(i.definition)&&text(i.failureResponse),'Interface definition/failure response required');
  assert(unique(i.quantities,'quantities').size>0,'Interface quantities required');
  for(const q of i.quantities){
   keys(q,['id','unit','frame','bounds','basis','source','unknownReason'],'quantity');
   assert(text(q.unit)&&text(q.frame),'Explicit units and reference/frame required');
   assert(['unknown','assumed','derived','measured'].includes(q.basis),'Unknown quantity basis');
   if(q.basis==='unknown')assert(q.bounds===null&&q.source===null&&text(q.unknownReason),'Unknown quantity needs null bounds/source and reason');
   else {assert(Array.isArray(q.bounds)&&q.bounds.length===2&&q.bounds.every(Number.isFinite)&&q.bounds[0]<=q.bounds[1],'Finite ordered quantity bounds required');assert(text(q.source)&&q.unknownReason===null,'Known quantity needs basis source and null unknownReason');}
  }
  strings(i.verificationIds,'verificationIds');
 }
 const checks=unique(c.checks,'checks');assert(checks.size>0,'Verification checks required');
 for(const v of c.checks){keys(v,['id','level','method','acceptance','status','evidencePins'],'check');assert(['desk','software','simulation','cad','bench','integrated-hardware'].includes(v.level),'Unknown check level');assert(text(v.method)&&text(v.acceptance),'Check method and acceptance required');assert(['not-run','failed','completed'].includes(v.status),'Unknown execution status');assert(Array.isArray(v.evidencePins),'Evidence pin array required');for(const p of v.evidencePins){validatePin(p);assert(c.dependencyPins.some(d=>samePin(d,p)),'Evidence must be an exact declared dependency');}assert(v.status!=='completed'||v.evidencePins.length>0,'Completed check requires evidence (not proof of success)');}
 for(const i of c.interfaces)for(const v of i.verificationIds)assert(checks.has(v),'Unknown interface verification ID');
 unique(c.hazards,'hazards');assert(c.hazards.length>0,'Hazard review required');
 for(const h of c.hazards){keys(h,['id','condition','consequence','mitigation','recoveryAuthority','verificationIds'],'hazard');for(const k of ['condition','consequence','mitigation','recoveryAuthority'])assert(text(h[k]),`Hazard ${k} required`);strings(h.verificationIds,'hazard verificationIds');for(const v of h.verificationIds)assert(checks.has(v),'Unknown hazard verification ID');}
 assert(Array.isArray(c.unresolvedInputs)&&c.unresolvedInputs.every(text),'Unresolved inputs array required');
 return true;
}

export function reviewSubsystemContract(study,artifactId){
 validateStudy(study);
 const a=study.artifacts.filter(x=>x.id===artifactId).at(-1);
 assert(a?.kind==='subsystem-spec','Expected subsystem-spec head');
 const c=a.content;validateSubsystemContract(c);
 for(const p of c.dependencyPins)assert(a.inputs.some(x=>samePin(x,p)),'Declared dependency missing from graph inputs');
 for(const p of a.inputs)assert(c.dependencyPins.some(x=>samePin(x,p)),'Graph input missing from declared dependencies');
 for(const check of c.checks)for(const p of check.evidencePins){const evidence=study.artifacts.find(x=>samePin(x,p));assert(evidence?.kind==='evidence','Verification reference must name a subsystem evidence artifact');}
 const impact=impactReport(study),state=impact.heads.find(x=>x.id===a.id);
 const blockers=[...c.unresolvedInputs];
 if(state.stale)blockers.push(...state.reasons);
 for(const [role,owner] of Object.entries(c.owners))if(owner===null)blockers.push(`Unassigned ${role} owner`);
 for(const i of c.interfaces)for(const q of i.quantities)if(q.basis==='unknown')blockers.push(`${i.id}/${q.id}: ${q.unknownReason}`);
 for(const check of c.checks)if(check.status!=='completed')blockers.push(`${check.id}: ${check.status}`);
 // No pass/ready boolean: even an empty blocker list cannot establish correctness or authorize work.
 return {schema:'frc-subsystem-review/v1',subject:pin(a),structuralValidation:'passed',reviewStatus:'human-review-required',robotOperationAuthorized:false,blockers,limitations:['Declared dependency coverage only; omitted real dependencies cannot be detected.','Names, source text and execution claims are unauthenticated.','Completed evidence does not mean passed, physically safe, legal or approved.'],impact};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{assert(process.argv.length===4,'Usage: node scripts/subsystem-contracts.mjs study.json artifact-id');const result=reviewSubsystemContract(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]);console.log(JSON.stringify(result,null,2));if(result.blockers.length)process.exitCode=2;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
