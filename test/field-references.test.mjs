import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {validateReferenceGeometry,getFieldReference,inspectCadCandidate,FORBIDDEN_USES} from '../scripts/field-references.mjs';
import {validateFieldModel} from '../scripts/field-semantics.mjs';
import {buildEnvelopeStudy} from '../scripts/envelope-study.mjs';
import {unknownResources} from '../scripts/resource-baseline.mjs';
import {validateExperiment} from '../scripts/comparison-study.mjs';
import {digest,appendArtifact,impactReport} from '../scripts/decision-chain.mjs';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const field=()=>read('case-studies/2026/field-package.json');
const request=(p,extra={})=>({featureId:'blue-hub-opening-center-welded',fieldVariant:'welded',expectedFrameId:'2026-welded-drawing',intendedUse:'visualization',expectedPackageSha256:digest(p),...extra});
test('Ingests 16 restricted references without filling executable scoring/retrieval or obstacle geometry',()=>{
 const p=field(),c=p.fieldModel.referenceGeometry;assert.equal(validateFieldModel(p.fieldModel),true);assert.equal(c.features.length,16);assert.equal(c.frames.length,2);assert.equal(c.features.filter(r=>r.shape==='point').length,8);assert.equal(c.features.filter(r=>r.role==='bump-crossing-reference').length,8);
 assert.ok(p.fieldModel.locations.every(l=>l.geometry.status==='unknown'));assert.deepEqual(p.fieldModel.frames,[]);assert.deepEqual(p.fieldModel.zones,[]);assert.deepEqual(p.fieldModel.obstacles,[]);assert.ok(c.features.every(r=>r.uncertaintyMm===null&&r.reachability==='not-assessed'));
});
test('Permitted selection preserves role, uncertainty, units, source and audit restrictions',()=>{
 const p=field(),before=JSON.stringify(p);for(const intendedUse of ['visualization','preliminary-strategy-reference']){const r=getFieldReference(p,request(p,{intendedUse}));assert.deepEqual(r.reference.coordinatesMm,[[4625.594,4034.536,1828.8]]);assert.equal(r.reference.role,'hub-opening-center-reference');assert.equal(r.frame.unit,'mm');assert.equal(r.physicalReachability,'not-assessed');assert.equal(r.reference.uncertaintyMm,null);assert.ok(r.reference.forbiddenUses.includes('robot-goal'));r.reference.coordinatesMm[0][0]=0;}assert.equal(JSON.stringify(p),before);
});
test('Every physical/executable use is rejected even if source data claims broader permission',()=>{
 const p=field();for(const intendedUse of [...FORBIDDEN_USES,'travel-time','unknown'])assert.throws(()=>getFieldReference(p,request(p,{intendedUse})),/prohibited/);
 p.fieldModel.referenceGeometry.features[0].allowedUses.push('robot-goal');assert.throws(()=>getFieldReference(p,request(p)),/broadened/);assert.throws(()=>validateFieldModel(p.fieldModel),/broadened/);
});
test('Variant/frame mixing, unpinned inputs and automatic mirroring are rejected',()=>{
 const p=field();for(const extra of [{fieldVariant:'andymark'},{fieldVariant:'unknown'},{expectedFrameId:'2026-andymark-drawing'},{expectedPackageSha256:'0'.repeat(64)},{mirror:true}])assert.throws(()=>getFieldReference(p,request(p,extra)));
 const a=getFieldReference(p,request(p,{featureId:'blue-hub-opening-center-andymark',fieldVariant:'andymark',expectedFrameId:'2026-andymark-drawing'}));assert.deepEqual(a.reference.coordinatesMm,[[4611.624,4021.328,1828.8]]);
});
test('Reference source revision/hash, confidence, status, frame and units cannot be silently promoted',()=>{
 for(const mutate of [c=>c.features[0].sourcePin.sha256='0'.repeat(64),c=>c.features[0].sourcePin.revision='other',c=>c.features[0].status='verified',c=>c.features[0].confidence='source-explicit',c=>c.features[0].reachability='feasible',c=>c.features[0].uncertaintyMm=0,c=>c.frames[0].unit='m',c=>c.features[0].coordinatesMm[0][0]+=1,c=>c.features[0].variant='andymark',c=>c.features[0].robotPose=true]){const p=field();mutate(p.fieldModel.referenceGeometry);assert.throws(()=>validateFieldModel(p.fieldModel));}
});
test('Bump references stay ground-projected layout inferences, never measured ramp centerlines',()=>{
 const p=field(),r=getFieldReference(p,request(p,{featureId:'blue-scoring-table-bump-crossing-reference-welded'}));assert.equal(r.reference.role,'bump-crossing-reference');assert.equal(r.reference.confidence,'nominal-layout-inference');assert.equal(r.reference.shape,'line');assert.ok(r.reference.coordinatesMm.every(v=>v[2]===0));assert.match(r.reference.derivation,/1.7935/);assert.ok(r.reference.forbiddenUses.includes('drivetrain-feasibility'));
});
test('Candidate CAD transform is inspectable only and cannot be certified, applied or inferred for AndyMark',()=>{
 const p=field(),q={candidateId:'welded-cad-frame-candidate',fieldVariant:'welded',intendedUse:'inspection-only',expectedPackageSha256:digest(p)};const r=inspectCadCandidate(p,q);assert.equal(r.executionAllowed,false);assert.equal(r.candidate.certified,false);assert.equal(r.candidate.status,'candidate-not-certified');
 for(const extra of [{intendedUse:'apply'},{fieldVariant:'andymark'}])assert.throws(()=>inspectCadCandidate(p,{...q,...extra}));
 for(const mutate of [c=>c.cadCandidates[0].certified=true,c=>c.cadCandidates[0].status='certified',c=>c.frames[0].certifiedCadTransform=[[1,0],[0,1]]]){const f=field();mutate(f.fieldModel.referenceGeometry);assert.throws(()=>validateFieldModel(f.fieldModel));}
});
test('Current consumers reject catalog laundering into generic executable geometry',()=>{
 const p=field(),ref=p.fieldModel.referenceGeometry.features[0];p.fieldModel.frames=[{id:ref.frame,unit:'mm',dimensions:3,origin:'borrowed',axes:'borrowed'}];p.fieldModel.locations[0].geometry={status:'sourced',frame:ref.frame,shape:'point',coordinates:ref.coordinatesMm,sourceRefs:[ref.sourcePin.id],uncertainty:null};
 assert.throws(()=>validateFieldModel(p.fieldModel),/Reference-only/);assert.throws(()=>buildEnvelopeStudy({resources:unknownResources(2026),fieldPackage:p}),/Reference-only/);
 const c=read('case-studies/2026/comparison-experiment.json');c.fieldPackageSha256=digest(p);assert.throws(()=>validateExperiment(c,p),/Reference-only/);
});
test('Reference revision participates in existing source-to-envelope stale propagation',()=>{
 let s=buildEnvelopeStudy({resources:unknownResources(2026)}),a=s.artifacts.find(x=>x.id==='game-2026'),content=structuredClone(a.content);content.fieldModel.referenceGeometry.revision++;
 s=appendArtifact(s,{id:a.id,kind:a.kind,inputs:a.inputs,content,expectedRevision:1});assert.equal(impactReport(s).heads.filter(a=>a.stale).length,6);
});
test('Reference catalog carries no private path, source binary or falsely complete coverage',()=>{
 const p=field(),c=p.fieldModel.referenceGeometry;assert.doesNotMatch(JSON.stringify(c),/C:\\\\|ehart|\.cache|\.frc-wiki/);assert.match(c.coverage,/no complete/);assert.equal(validateReferenceGeometry(c,p.fieldModel.sources,2026),true);
});
