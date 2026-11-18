import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const text=x=>typeof x==='string'&&x.trim().length>0;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export const fabricationDigest=x=>createHash('sha256').update(canonical(x)).digest('hex');
function fields(x,ks,label){check(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k)),`${label}: exact fields required`);}
function date(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;}
function list(xs,label){check(Array.isArray(xs)&&xs.length<=1000&&xs.every(id)&&new Set(xs).size===xs.length,`${label}: unique ID list required`);}
function records(xs,label,max=1000){check(Array.isArray(xs)&&xs.length<=max,`${label}: array required`);const seen=new Set();for(const x of xs){check(id(x?.id)&&!seen.has(x.id),`${label}: duplicate/invalid ID`);seen.add(x.id);}return seen;}
function dimension(x){return x===null||(Array.isArray(x)&&x.length===3&&x.every(v=>Number.isFinite(v)&&v>0&&v<=1e6));}
function deviation(x){return x===null||(Number.isFinite(x)&&x>0&&x<=1e6);}
function maybeId(x){return x===null||id(x);}
function pin(p){fields(p,['id','revision','sha256'],'designRef');check(id(p.id)&&Number.isSafeInteger(p.revision)&&p.revision>0&&sha(p.sha256),'Exact design pin required');}
function evidence(es){records(es,'evidence');for(const e of es){fields(e,['id','kind','description','locator','revision','sha256','recordedOn','reviewDue'],'evidence');check(['design-assumption','design-record','school-record','manufacturer-spec'].includes(e.kind)&&text(e.description)&&text(e.locator),'Evidence kind/description/locator required');check(e.revision===null||text(e.revision),'Evidence revision or null required');check(e.sha256===null||sha(e.sha256),'Evidence hash or null required');check(date(e.recordedOn)&&date(e.reviewDue)&&e.reviewDue>=e.recordedOn,'Evidence dates invalid');}}
function refs(rs,es){list(rs,'evidenceRefs');check(rs.every(r=>es.some(e=>e.id===r)),'Unknown evidence reference');}
function base(x,schema,keys){check(Buffer.byteLength(JSON.stringify(x),'utf8')<=1048576,'Input exceeds 1 MiB bound');fields(x,keys,schema);check(x.schema===schema&&id(x.id)&&Number.isSafeInteger(x.revision)&&x.revision>0,'Schema/identity/revision invalid');evidence(x.evidence);}
export function validateFabricationPlan(p){
 base(p,'frc-fabrication-plan/v1',['schema','id','revision','assumption','evidence','parts']);
 check(p.assumption==='all-required-tools-assumed-for-design-only','Draft tool assumption must not assert school availability');
 records(p.parts,'parts',100);check(p.parts.length>0,'At least one part required');
 for(const part of p.parts){fields(part,['id','description','designRef','routeCoverage','routes','unresolvedInputs'],'part');check(text(part.description),'Part description required');pin(part.designRef);check(['partial','declared-complete'].includes(part.routeCoverage),'Route coverage required');check(Array.isArray(part.unresolvedInputs)&&part.unresolvedInputs.every(text),'Part unresolved inputs required');records(part.routes,'routes',10);check(part.routes.length>0,'Part route required');
  for(const route of part.routes){fields(route,['id','description','operations'],'route');check(text(route.description),'Route description required');records(route.operations,'operations',50);check(route.operations.length>0,'Route operations required');
   for(const op of route.operations){fields(op,['id','processId','machineClass','materialId','setupEnvelopeMm','envelopeBasis','allowedDeviationMm','fixtureIds','operatorCapabilityId','basis','evidenceRefs','unresolvedInputs'],'operation');for(const k of ['processId','machineClass','materialId','operatorCapabilityId'])check(maybeId(op[k]),`Operation ${k} must be exact ID or null`);check(dimension(op.setupEnvelopeMm)&&deviation(op.allowedDeviationMm),'Operation dimensions/deviation invalid');check(op.envelopeBasis==='stock-and-fixture-XYZ-no-rotation','Explicit setup/axis convention required');if(op.fixtureIds!==null)list(op.fixtureIds,'fixtureIds');check(['assumed','drawing-requirement'].includes(op.basis),'Requirement basis required');refs(op.evidenceRefs,p.evidence);if(op.basis==='drawing-requirement'&&op.evidenceRefs.length)check(op.evidenceRefs.some(r=>['design-record','manufacturer-spec'].includes(p.evidence.find(e=>e.id===r).kind)),'Drawing requirement needs declared design-record/manufacturer evidence, not an assumption');check(Array.isArray(op.unresolvedInputs)&&op.unresolvedInputs.every(text),'Operation unresolved inputs required');}
  }
 }
 return true;
}
export function validateSchoolCapabilities(p){
 base(p,'frc-school-capabilities/v1',['schema','id','revision','registryCoverage','evidence','tools']);
 check(p.evidence.every(e=>e.kind!=='design-assumption'),'School evidence must not be a design-only assumption');
 check(['unknown','partial','declared-complete'].includes(p.registryCoverage),'Registry coverage required');records(p.tools,'tools',100);
 for(const t of p.tools){fields(t,['id','label','machineClass','availability','condition','access','evidenceRefs','capabilities'],'tool');check(text(t.label)&&maybeId(t.machineClass),'Tool label and exact machine class or null required');check(['unknown','available','unavailable'].includes(t.availability),'Tool availability invalid');check(['unknown','serviceable','needs-review','unserviceable'].includes(t.condition),'Tool condition invalid');fields(t.access,['setup','training','supervision','safetyReview'],'access');for(const v of Object.values(t.access))check(['unknown','declared-current','unavailable'].includes(v),'Access declaration invalid');refs(t.evidenceRefs,p.evidence);records(t.capabilities,'capabilities',50);
  for(const c of t.capabilities){fields(c,['id','processId','materialId','usableSetupMm','envelopeBasis','achievableDeviationMm','fixtureIds','operatorCapabilityId','evidenceRefs'],'capability');for(const k of ['processId','materialId','operatorCapabilityId'])check(maybeId(c[k]),`Capability ${k} must be exact ID or null`);check(dimension(c.usableSetupMm)&&deviation(c.achievableDeviationMm),'Capability dimensions/deviation invalid');check(c.envelopeBasis==='stock-and-fixture-XYZ-no-rotation','Capability setup/axis convention required');if(c.fixtureIds!==null)list(c.fixtureIds,'fixtureIds');refs(c.evidenceRefs,p.evidence);}
 }
 return true;
}
function evidenceIssues(rs,es,asOf,needSchool){
 const issues=[];if(!rs.length)issues.push('No supporting evidence declared');
 const selected=rs.map(r=>es.find(e=>e.id===r));
 if(needSchool&&!selected.some(e=>e.kind==='school-record'))issues.push('No school-specific assessment; manufacturer capability is not actual school availability/setup');
 for(const e of selected){if(e.recordedOn>asOf)issues.push(`${e.id}: record is after comparison date`);if(e.reviewDue<asOf)issues.push(`${e.id}: review overdue`);if(e.sha256===null||e.revision===null)issues.push(`${e.id}: source revision/hash unresolved`);}
 return issues;
}
function operationIssues(op,plan,asOf){
 const issues=[...op.unresolvedInputs,...evidenceIssues(op.evidenceRefs,plan.evidence,asOf,false)];
 for(const k of ['processId','machineClass','materialId','setupEnvelopeMm','allowedDeviationMm','fixtureIds','operatorCapabilityId'])if(op[k]===null)issues.push(`Requirement ${k} unknown`);
 return issues;
}
function evaluate(op,tool,c,profile,asOf){
 const gaps=[],unknown=[...evidenceIssues(tool.evidenceRefs,profile.evidence,asOf,true),...evidenceIssues(c.evidenceRefs,profile.evidence,asOf,true)];
 if(tool.availability==='unknown')unknown.push('Tool availability unknown');else if(tool.availability!=='available')gaps.push('Tool declared unavailable');
 if(tool.condition==='unknown'||tool.condition==='needs-review')unknown.push('Tool condition not established');else if(tool.condition!=='serviceable')gaps.push('Tool declared unserviceable');
 for(const [k,v] of Object.entries(tool.access)){if(v==='unknown')unknown.push(`${k} status unknown`);else if(v!=='declared-current')gaps.push(`${k} declared unavailable`);}
 for(const [key,label] of [['processId','process'],['materialId','material'],['operatorCapabilityId','operator capability']]){if(c[key]===null)unknown.push(`${label} unknown`);else if(c[key]!==op[key])gaps.push(`${label} does not match exact requirement`);}
 if(c.usableSetupMm===null)unknown.push('Usable setup envelope unknown');else for(let i=0;i<3;i++)if(c.usableSetupMm[i]<op.setupEnvelopeMm[i])gaps.push(`Setup envelope ${['X','Y','Z'][i]} insufficient; no automatic rotation or fixturing assumption`);
 if(c.achievableDeviationMm===null)unknown.push('Achievable deviation unknown');else if(c.achievableDeviationMm>op.allowedDeviationMm)gaps.push('Declared precision insufficient for required deviation');
 if(c.fixtureIds===null)unknown.push('Fixtures/tooling unknown');else for(const f of op.fixtureIds)if(!c.fixtureIds.includes(f))gaps.push(`Required fixture/tooling ${f} not declared`);
 return {toolId:tool.id,toolLabel:tool.label,capabilityId:c.id,status:gaps.length?'declared-gap':unknown.length?'unknown':'declared-match-needs-qualified-review',gaps,unknown};
}
export function compareFabrication(plan,profile,{asOf}={}){
 validateFabricationPlan(plan);if(profile!==null)validateSchoolCapabilities(profile);check(date(asOf),'Explicit valid comparison date required');
 const operationCount=plan.parts.reduce((n,p)=>n+p.routes.reduce((m,r)=>m+r.operations.length,0),0),capabilityCount=profile===null?0:profile.tools.reduce((n,t)=>n+t.capabilities.length,0);
 check(operationCount<=1000&&capabilityCount<=2000&&operationCount*capabilityCount<=100000,'Comparison exceeds bounded operation/capability work');
 const parts=plan.parts.map(part=>({partId:part.id,designRef:structuredClone(part.designRef),routeCoverage:part.routeCoverage,unresolvedInputs:[...part.unresolvedInputs],routes:part.routes.map(route=>{
  const operations=route.operations.map(op=>{
   const unknown=operationIssues(op,plan,asOf),matches=[];
   if(!unknown.length&&profile!==null)for(const tool of profile.tools)if(tool.machineClass===op.machineClass)for(const c of tool.capabilities)matches.push(evaluate(op,tool,c,profile,asOf));
   if(!unknown.length&&profile!==null&&!matches.length)unknown.push('No comparable exact machine-class capability declared; missing registry entries do not prove absence');
   const status=operationIssues(op,plan,asOf).length?'requirements-unresolved':profile===null?'school-capabilities-unknown':matches.some(m=>m.status==='declared-match-needs-qualified-review')?'declared-match-needs-qualified-review':matches.length&&matches.every(m=>m.status==='declared-gap')?'declared-gaps':'school-capabilities-unresolved';
   return {operationId:op.id,requirements:structuredClone(op),requirementBasis:op.basis,requirementEvidenceRefs:[...op.evidenceRefs],requiredMachineClass:op.machineClass,requiredProcessId:op.processId,requiredMaterialId:op.materialId,status,unknown,toolComparisons:matches};
  });
  return {routeId:route.id,description:route.description,status:part.unresolvedInputs.length?'part-requirements-unresolved':operations.every(o=>o.status==='declared-match-needs-qualified-review')?'declared-route-match-needs-qualified-review':'unresolved-or-gaps',operations};
 })}));
 return {schema:'frc-fabrication-comparison/v1',planSha256:fabricationDigest(plan),profileSha256:profile===null?null:fabricationDigest(profile),asOf,draftAssumption:plan.assumption,schoolAvailabilityInferredFromAssumption:false,registryCoverage:profile?.registryCoverage??'unknown',parts,nextSteps:['Have qualified school staff review each named tool/process/material/setup and current access record.','Review explicitly listed alternate routes independently; an unlisted route is not validated.','For gaps, consider redesign, a different reviewed process, an externally supervised shop or purchased/custom-service part; costs, procurement and capability are unresolved.','Update exact design/profile revisions and rerun comparison after changes; do not reuse stale results.'],engineeringAcceptance:'not-assessed',manufacturingReadiness:'not-established',machineOperationAuthorized:false,limitations:['Declared desk comparison only; evidence labels, staff status and measurements are not authenticated.','Exact ID matching, XYZ envelope and deviation inequalities do not verify machining reach, workholding, toolpath, material compatibility, achievable tolerance or process safety.','Missing tools in a partial/unknown registry are not proof they are absent.','No machine settings, cutting instructions, purchasing or operation permissions are produced.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{check(process.argv.length===5,'Usage: node scripts/fabrication-capabilities.mjs plan.json profile.json|null YYYY-MM-DD');const p=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),s=process.argv[3]==='null'?null:JSON.parse(fs.readFileSync(process.argv[3],'utf8'));console.log(JSON.stringify(compareFabrication(p,s,{asOf:process.argv[4]}),null,2));process.exitCode=2;}catch(error){console.error(error.message);process.exitCode=1;}}
