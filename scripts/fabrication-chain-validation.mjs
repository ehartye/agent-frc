import fs from 'node:fs';import {createHash} from 'node:crypto';
import {validateFabricationPlan,validateSchoolCapabilities,compareFabrication} from './fabrication-capabilities.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const fields=(o,ks)=>check(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k)),'Closed fabrication graph content required');
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const pin=p=>{fields(p,['id','revision','sha256']);check(ident(p.id)&&Number.isSafeInteger(p.revision)&&p.revision>0&&hash(p.sha256),'Exact fabrication pin required');};
export const fabricationModelSha=()=>createHash('sha256').update(fs.readFileSync(new URL('fabrication-capabilities.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
function resolve(a,ref,kind,seen,digest){pin(ref);const x=seen.get(ref.id+'@'+ref.revision);check(x?.kind===kind&&x.sha256===ref.sha256&&a.inputs.some(p=>digest(p)===digest(ref)),'Exact fabrication dependency missing');return x;}
export function validateFabricationArtifact(a,seen,digest){
 const c=a.content;
 if(a.kind==='school-capability-profile'){fields(c,['schema','profile']);check(c.schema==='frc-school-capability-input/v1','School input schema required');if(c.profile!==null)validateSchoolCapabilities(c.profile);}
 if(a.kind==='fabrication-design-input'){fields(c,['schema','partId','designRef','scope']);check(c.schema==='frc-fabrication-design-input/v1'&&ident(c.partId)&&c.scope==='hypothetical-or-external-unverified','Explicit non-authenticated design scope required');pin(c.designRef);check(a.inputs.filter(r=>seen.get(r.id+'@'+r.revision)?.kind==='robot-envelope').length===1,'Design input requires one exact envelope');}
 if(a.kind==='fabrication-model'){fields(c,['schema','modelId','sourceSha256']);check(c.schema==='frc-fabrication-model/v1'&&c.modelId==='declared-fabrication-comparator/v1'&&hash(c.sourceSha256),'Fabrication model source required');}
 if(a.kind==='fabrication-plan'){
  fields(c,['schema','plan','designBindings']);check(c.schema==='frc-fabrication-plan-input/v1','Fabrication plan input schema required');validateFabricationPlan(c.plan);check(Array.isArray(c.designBindings)&&c.designBindings.length===c.plan.parts.length,'Every part requires design binding');const envelopePins=a.inputs.filter(r=>seen.get(r.id+'@'+r.revision)?.kind==='robot-envelope');check(envelopePins.length===1,'Plan requires one exact envelope');const ids=new Set();for(const b of c.designBindings){fields(b,['partId','ref']);check(!ids.has(b.partId),'Duplicate design binding');ids.add(b.partId);const part=c.plan.parts.find(p=>p.id===b.partId),source=resolve(a,b.ref,'fabrication-design-input',seen,digest);check(part&&source.content.partId===part.id&&digest(source.content.designRef)===digest(part.designRef),'Part/design reference mismatch');const designEnvelope=source.inputs.filter(r=>seen.get(r.id+'@'+r.revision)?.kind==='robot-envelope');check(designEnvelope.length===1&&digest(designEnvelope[0])===digest(envelopePins[0]),'Plan/design envelope revision mismatch');}
 }
 if(a.kind==='fabrication-comparison'){
  fields(c,['schema','planPin','profilePin','modelPin','asOf','output','outputSha256']);check(c.schema==='frc-fabrication-linked-comparison/v1','Fabrication comparison schema required');const plan=resolve(a,c.planPin,'fabrication-plan',seen,digest),profile=resolve(a,c.profilePin,'school-capability-profile',seen,digest);const model=resolve(a,c.modelPin,'fabrication-model',seen,digest);check(model.content.sourceSha256===fabricationModelSha(),'Unsupported comparator source; retained matching implementation required for replay');
  const expected=compareFabrication(plan.content.plan,profile.content.profile,{asOf:c.asOf});check(digest(expected)===c.outputSha256&&digest(c.output)===c.outputSha256,'Fabrication output differs from full declared-model replay');
 }
}
