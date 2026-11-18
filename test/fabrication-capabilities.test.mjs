import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateFabricationPlan,validateSchoolCapabilities,compareFabrication,fabricationDigest} from '../scripts/fabrication-capabilities.mjs';
const asOf='2026-11-16';
function fixture(){
 const e=(id,kind)=>({id,kind,description:'Synthetic test evidence only',locator:'test fixture, no actual school or machine',revision:'fixture-v1',sha256:'1'.repeat(64),recordedOn:asOf,reviewDue:'2026-12-16'});
 const op={id:'cut',processId:'milling',machineClass:'mill',materialId:'example-material-grade',setupEnvelopeMm:[200,100,20],envelopeBasis:'stock-and-fixture-XYZ-no-rotation',allowedDeviationMm:0.1,fixtureIds:['fixture-a'],operatorCapabilityId:'milling-role',basis:'assumed',evidenceRefs:['design'],unresolvedInputs:[]};
 const plan={schema:'frc-fabrication-plan/v1',id:'fixture-plan',revision:1,assumption:'all-required-tools-assumed-for-design-only',evidence:[e('design','design-assumption')],parts:[{id:'bracket',description:'Synthetic bracket',designRef:{id:'design',revision:1,sha256:'0'.repeat(64)},routeCoverage:'partial',routes:[{id:'route-a',description:'Hypothetical reviewed route',operations:[op]}],unresolvedInputs:[]}]};
 const profile={schema:'frc-school-capabilities/v1',id:'fixture-school',revision:1,registryCoverage:'partial',evidence:[e('school','school-record')],tools:[{id:'mill-a',label:'Synthetic mill A',machineClass:'mill',availability:'available',condition:'serviceable',access:{setup:'declared-current',training:'declared-current',supervision:'declared-current',safetyReview:'declared-current'},evidenceRefs:['school'],capabilities:[{id:'milling-a',processId:'milling',materialId:'example-material-grade',usableSetupMm:[250,150,30],envelopeBasis:'stock-and-fixture-XYZ-no-rotation',achievableDeviationMm:0.05,fixtureIds:['fixture-a'],operatorCapabilityId:'milling-role',evidenceRefs:['school']}]}]};
 return {plan,profile};
}
const result=(p,s)=>compareFabrication(p,s,{asOf});
const operation=r=>r.parts[0].routes[0].operations[0];
test('Initial all-tools draft never becomes a school availability assertion',()=>{
 const {plan}=fixture(),r=result(plan,null);assert.equal(operation(r).status,'school-capabilities-unknown');assert.equal(r.schoolAvailabilityInferredFromAssumption,false);assert.equal(r.machineOperationAuthorized,false);assert.equal(r.manufacturingReadiness,'not-established');
 const p=JSON.parse(fs.readFileSync(new URL('../templates/fabrication-plan.json',import.meta.url),'utf8')),s=JSON.parse(fs.readFileSync(new URL('../templates/school-capabilities.json',import.meta.url),'utf8'));assert.equal(validateFabricationPlan(p),true);assert.equal(validateSchoolCapabilities(s),true);assert.equal(operation(result(p,s)).status,'requirements-unresolved');
});
test('Declared matches retain assumptions, exact input hashes and mandatory human review',()=>{
 const {plan,profile}=fixture(),before=JSON.stringify({plan,profile}),r=result(plan,profile);assert.equal(operation(r).status,'declared-match-needs-qualified-review');assert.equal(operation(r).requirementBasis,'assumed');assert.equal(r.planSha256,fabricationDigest(plan));assert.equal(r.profileSha256,fabricationDigest(profile));assert.equal(r.engineeringAcceptance,'not-assessed');assert.equal(r.machineOperationAuthorized,false);assert.equal(JSON.stringify({plan,profile}),before);
});
test('Material, process, XYZ, precision, fixtures and operator roles each have explicit gaps',()=>{
 for(const edit of [c=>c.materialId='other-grade',c=>c.processId='turning',c=>c.usableSetupMm=[100,500,50],c=>c.achievableDeviationMm=0.2,c=>c.fixtureIds=[],c=>c.operatorCapabilityId='other-role']){const {plan,profile}=fixture();edit(profile.tools[0].capabilities[0]);const r=operation(result(plan,profile));assert.equal(r.status,'declared-gaps');assert.ok(r.toolComparisons[0].gaps.length);}
});
test('Availability, condition and every setup/access/safety declaration is independently required',()=>{
 for(const edit of [t=>t.availability='unavailable',t=>t.condition='unserviceable',...['setup','training','supervision','safetyReview'].map(k=>t=>t.access[k]='unavailable')]){const {plan,profile}=fixture();edit(profile.tools[0]);assert.equal(operation(result(plan,profile)).status,'declared-gaps');}
 for(const edit of [t=>t.availability='unknown',t=>t.condition='needs-review',t=>t.access.safetyReview='unknown',t=>t.capabilities[0].usableSetupMm=null,t=>t.capabilities[0].fixtureIds=null]){const {plan,profile}=fixture();edit(profile.tools[0]);assert.equal(operation(result(plan,profile)).status,'school-capabilities-unresolved');}
});
test('Missing registry entries are unknown, never inferred absence or ready',()=>{
 const {plan,profile}=fixture();profile.tools=[];const op=operation(result(plan,profile));assert.equal(op.status,'school-capabilities-unresolved');assert.ok(op.unknown.some(x=>x.includes('do not prove absence')));
});
test('Freshness, source pins and school-specific evidence are required for current declarations',()=>{
 for(const edit of [e=>{e.recordedOn='2026-11-01';e.reviewDue='2026-11-15';},e=>e.recordedOn='2026-11-17',e=>e.sha256=null,e=>e.revision=null,e=>e.kind='manufacturer-spec']){const {plan,profile}=fixture();edit(profile.evidence[0]);assert.equal(operation(result(plan,profile)).status,'school-capabilities-unresolved');}
 const {plan,profile}=fixture();profile.evidence[0].kind='design-assumption';assert.throws(()=>result(plan,profile),/design-only assumption/);
});
test('Independent alternative routes and tool candidates retain mismatches, not automatic substitutions',()=>{
 const {plan,profile}=fixture();const bad=structuredClone(plan.parts[0].routes[0]);bad.id='route-b';bad.operations[0].materialId='other-grade';plan.parts[0].routes.push(bad);
 const r=result(plan,profile);assert.equal(r.parts[0].routes[0].status,'declared-route-match-needs-qualified-review');assert.equal(r.parts[0].routes[1].status,'unresolved-or-gaps');assert.equal(r.machineOperationAuthorized,false);
});
test('Reject forged approval fields, invalid dimensions, missing unknowns, unknown evidence and impossible dates',()=>{
 for(const edit of [p=>p.assumption='school-has-all-tools',p=>p.operationAuthorized=true,p=>p.parts[0].routes[0].operations[0].setupEnvelopeMm=[200,0,20],p=>p.parts[0].routes[0].operations[0].allowedDeviationMm=NaN,p=>delete p.parts[0].routes[0].operations[0].fixtureIds,p=>p.parts[0].routes[0].operations[0].evidenceRefs=['missing']]){const {plan,profile}=fixture();edit(plan);assert.throws(()=>result(plan,profile));}
 const {plan,profile}=fixture();assert.throws(()=>compareFabrication(plan,profile,{asOf:'2026-02-30'}));const old=result(plan,profile);profile.revision++;profile.tools[0].availability='unavailable';const newer=result(plan,profile);assert.notEqual(old.profileSha256,newer.profileSha256);assert.notEqual(operation(old).status,operation(newer).status);
});
test('Drawing labels cannot promote assumption-only evidence and comparison work is bounded',()=>{
 const {plan,profile}=fixture();plan.parts[0].routes[0].operations[0].basis='drawing-requirement';assert.throws(()=>result(plan,profile),/Drawing requirement/);plan.evidence[0].kind='design-record';assert.equal(operation(result(plan,profile)).status,'declared-match-needs-qualified-review');
 const big=fixture();big.plan.parts[0].description='x'.repeat(1048576);assert.throws(()=>result(big.plan,big.profile),/1 MiB/);
 const many=fixture();many.plan.parts=Array.from({length:101},(_,i)=>({...structuredClone(many.plan.parts[0]),id:'part-'+i}));assert.throws(()=>result(many.plan,many.profile),/parts/);
 const work=fixture();work.plan.parts=Array.from({length:51},(_,i)=>({...structuredClone(work.plan.parts[0]),id:'part-'+i}));work.profile.tools=Array.from({length:40},(_,i)=>({...structuredClone(work.profile.tools[0]),id:'tool-'+i,capabilities:Array.from({length:50},(_,j)=>({...structuredClone(work.profile.tools[0].capabilities[0]),id:'cap-'+j}))}));assert.throws(()=>result(work.plan,work.profile),/bounded operation/);
});
