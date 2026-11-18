import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {unknownResources,validateResources,inventoryAssessment} from '../scripts/resource-baseline.mjs';
import {buildEnvelopeStudy,readFieldPackage} from '../scripts/envelope-study.mjs';
import {appendArtifact,impactReport} from '../scripts/decision-chain.mjs';
const artifact=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
const known=()=>({...unknownResources(2026),inventoryCoverage:'partial',evidence:[{id:'fixture-measurement',recordedAt:'2026-11-16',description:'Synthetic test only, not team inventory'}],physicalInventory:[{id:'chassis',kind:'hardware',partNumber:'FIXTURE-CHASSIS',revision:'test-only',quantity:1,ownership:'owned',condition:'serviceable',availability:'available',evidenceRefs:['fixture-measurement'],dimensions:{unit:'mm',length:600,width:650,height:100,scope:'bare-frame',evidenceRefs:['fixture-measurement']}}]});
test('Explicit unknown resources produce three independent unresolved candidates',()=>{
 assert.throws(()=>buildEnvelopeStudy({}),/Resource/);const s=buildEnvelopeStudy({resources:unknownResources(2026)});
 assert.equal(s.branches.length,4);assert.deepEqual(s.decisions,[]);
 for(const branch of ['kit-baseline','compact','payload']){const e=artifact(s,branch+'-envelope').content;assert.deepEqual(e.target,{lengthMm:null,widthMm:null,heightMm:null});assert.equal(e.status,'unresolved');assert.equal(e.reachability,'not-assessed');}
 assert.equal(artifact(s,'compact-envelope').content.calculated.assumedStaticHeightCeilingMm,null);
 assert.ok(impactReport(s).heads.every(a=>!a.stale));
});
test('Actual part evidence supports only its dimensions, not complete robot height',()=>{
 const r=known(),s=buildEnvelopeStudy({resources:r,assumptions:{kitInventoryId:'chassis'}});const e=artifact(s,'kit-baseline-envelope').content;
 assert.deepEqual(e.target,{lengthMm:600,widthMm:650,heightMm:null});assert.equal(e.basis.scope,'bare-frame');assert.equal(e.calculated.rectangularPerimeterMm,2500);
 assert.equal(e.status,'unresolved');r.physicalInventory[0].availability='unknown';assert.equal(artifact(buildEnvelopeStudy({resources:r,assumptions:{kitInventoryId:'chassis'}}),'kit-baseline-envelope').content.target.lengthMm,null);
});
test('Expectations, opt-outs and credits do not create or delete physical inventory',()=>{
 const r=known();r.kitExpectations=[{id:'drive-kit',season:2026,status:'opted-out',evidenceRefs:['fixture-measurement']}];r.credits=[{id:'voucher',season:2026,status:'available',evidenceRefs:['fixture-measurement']}];
 assert.equal(inventoryAssessment(r)[0].status,'available');const empty={...r,physicalInventory:[]};assert.deepEqual(inventoryAssessment(empty),[]);
 const wrong=structuredClone(r);wrong.kitExpectations[0].season=2027;assert.throws(()=>validateResources(wrong),/season/);
 wrong.kitExpectations[0].season=2026;wrong.physicalInventory[0].kind='voucher';assert.throws(()=>validateResources(wrong),/hardware/);
});
test('Unknown quantities, part revisions and evidence never imply availability',()=>{
 for(const field of ['quantity','revision']){const r=known();r.physicalInventory[0][field]=null;assert.equal(inventoryAssessment(r)[0].status,'unknown');}
 const r=known();r.physicalInventory[0].evidenceRefs=[];assert.throws(()=>validateResources(r),/Evidence/);
 r.physicalInventory[0].quantity=-1;assert.throws(()=>validateResources(r),/quantity/);
});
test('Explicit hypothetical targets distinguish legal bounds from trench clearance',()=>{
 const s=buildEnvelopeStudy({resources:unknownResources(2026),assumptions:{fieldVariant:'welded',clearanceMarginMm:25,heightUncertaintyMm:10,candidateDimensions:{compact:{lengthMm:600,widthMm:650,heightMm:520},payload:{lengthMm:700,widthMm:700,heightMm:762,footprintReference:'robot-perimeter-excluding-bumpers'}}}});
 const c=artifact(s,'compact-envelope').content,p=artifact(s,'payload-envelope').content;
 assert.ok(Math.abs(c.calculated.assumedStaticHeightCeilingMm-523.8)<1e-8);assert.equal(c.calculated.staticClearanceCheck,'within-assumed-static-clearance-only');
 assert.equal(c.status,'unresolved');assert.equal(p.calculated.perimeterCheck,'exceeds-selected-rule-bound');assert.equal(p.calculated.staticClearanceCheck,'not-requested');
 assert.notEqual(c.target.heightMm,p.target.heightMm);assert.equal(c.basis.kind,'explicit-hypothetical-target-not-measured');
});
test('Unknown/AndyMark variant blocks transferring welded static clearance conclusion',()=>{
 for(const fieldVariant of ['unknown','andymark']){const s=buildEnvelopeStudy({resources:unknownResources(2026),assumptions:{fieldVariant,clearanceMarginMm:25,heightUncertaintyMm:10,candidateDimensions:{compact:{heightMm:500}}}});assert.equal(artifact(s,'compact-envelope').content.calculated.staticClearanceCheck,'unresolved');}
});
test('Field revision and resources revision invalidate each dependent branch',()=>{
 const s=buildEnvelopeStudy({resources:unknownResources(2026)});
 for(const id of ['game-2026','resources-2026']){const a=artifact(s,id),content=structuredClone(a.content);content.reviewNote='new source or inventory review';const next=appendArtifact(s,{id,kind:a.kind,content,expectedRevision:1});assert.equal(impactReport(next).heads.filter(a=>a.stale).length,6);}
});
test('Source-linked package preserves unknown world geometry and source disagreement',()=>{
 const f=readFieldPackage();assert.ok(f.fieldModel.locations.length>=4);assert.ok(f.fieldModel.locations.every(x=>x.geometry.status==='unknown'&&!Object.hasOwn(x.geometry,'coordinates')));assert.equal(f.fieldModel.zones.length,0);assert.match(f.revisionWarnings.join(' '),/postdate/);
 assert.ok(f.fieldModel.sources.every(s=>s.sha256.length===64));assert.equal(f.robotRuleCaps.perimeterLimitInch,110);assert.equal(f.robotRuleCaps.startingHeightLimitInch,30);
});
test('Reject source/season mismatch, forged selections and invalid targets',()=>{
 assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2025)}),/2026/);
 assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),assumptions:{selectedByUser:'compact'}}),/Unknown/);
 assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),assumptions:{candidateDimensions:{'kit-baseline':{heightMm:500}}}}),/actual inventory/);
 assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),assumptions:{clearanceMarginMm:600,heightUncertaintyMm:0}}),/consume/);
 const f=readFieldPackage();f.massRule.limitLb=null;assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),fieldPackage:f}),/Mass/);
});
test('Committed unknown-resource example is deterministic and contains no private paths',()=>{
 const input=JSON.parse(fs.readFileSync(new URL('../templates/resource-baseline.json',import.meta.url),'utf8'));const actual=buildEnvelopeStudy(input);const saved=JSON.parse(fs.readFileSync(new URL('../case-studies/2026/envelope-study.json',import.meta.url),'utf8'));assert.deepEqual(saved,actual);assert.doesNotMatch(JSON.stringify(saved),/C:\\\\|ehart|\.cache|voucherCode|apiKey/);
});

test('Reject mismatched source units, duplicate conversions and source revision pins',()=>{
 for(const mutate of [f=>f.dimensions[0].originalUnit='m',f=>f.dimensions[0].valuesMm.height=1,f=>f.dimensions[0].sourceRef.sha256='0'.repeat(64),f=>f.dimensions[0].sourceRef.revision='unrelated']){const f=readFieldPackage();mutate(f);assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),fieldPackage:f}),/unit|conversion|pin/);}
});
test('Reject missing or incorrectly typed scoring/retrieval locations',()=>{
 for(const id of ['hub','depot','outpost','neutral-zone-fuel']){const f=readFieldPackage();f.fieldModel.locations=f.fieldModel.locations.filter(x=>x.id!==id);assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),fieldPackage:f}),/location/);}
 const f=readFieldPackage();f.fieldModel.locations.find(x=>x.id==='hub').purpose='retrieval';assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),fieldPackage:f}),/location/);
});
test('Bumper-inclusive or unspecified envelope cannot be checked as rule perimeter',()=>{
 const r=known();Object.assign(r.physicalInventory[0].dimensions,{scope:'complete-robot',length:800,width:800,height:500,perimeterReference:'complete-robot-including-bumpers'});
 let e=artifact(buildEnvelopeStudy({resources:r,assumptions:{kitInventoryId:'chassis'}}),'kit-baseline-envelope').content;assert.equal(e.calculated.rectangularPerimeterMm,3200);assert.equal(e.calculated.perimeterCheck,'unresolved');
 r.physicalInventory[0].dimensions.perimeterReference='robot-perimeter-excluding-bumpers';e=artifact(buildEnvelopeStudy({resources:r,assumptions:{kitInventoryId:'chassis'}}),'kit-baseline-envelope').content;assert.equal(e.calculated.perimeterCheck,'exceeds-selected-rule-bound');
 const s=buildEnvelopeStudy({resources:unknownResources(2026),assumptions:{candidateDimensions:{compact:{lengthMm:500,widthMm:500}}}});assert.equal(artifact(s,'compact-envelope').content.calculated.perimeterCheck,'unresolved');
});
