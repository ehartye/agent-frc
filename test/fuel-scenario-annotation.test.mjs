import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {executeAndLinkComparison} from '../scripts/comparison-chain.mjs';
import {annotateScenarioFuel} from '../scripts/fuel-scenario-annotation.mjs';
import {assessFuelLedger} from '../scripts/2026-fuel-assessment.mjs';
import {appendArtifact,pin,digest,impactReport} from '../scripts/decision-chain.mjs';
const read=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
function fixture(){const config=read('case-studies/2026/comparison-experiment.json');config.concepts=config.concepts.slice(0,1);config.policies=config.policies.slice(0,1);config.scenarios=config.scenarios.slice(0,1);config.seeds=[7];const linked=executeAndLinkComparison(read('case-studies/2026/envelope-study.json'),{config,fieldPackage:read('case-studies/2026/field-package.json'),gameId:'game-2026',resourcesId:'resources-2026',prefix:'compare'});const {events,context}=read('case-studies/2026/fuel-assessment-example.json');return {study:linked.study,request:{experimentRef:linked.receipt.experiment,scenarioId:config.scenarios[0].id,events,context,evidenceSources:[{id:'independent-hand-calculated-review-vectors',kind:'hypothetical-passage-assumption',revision:'v1',statement:'Explicit synthetic event assumptions; not observed sensors, conserved inventory, or a transformation of scenario ticks or released pieces.'}],prefix:'annotation'}};}
function annotated(){const f=fixture();return {...f,...annotateScenarioFuel(f.study,f.request)};}
test('Scenario annotation preserves complete assessor output and cannot become comparison scores',()=>{
 const f=fixture(),before=JSON.stringify(f.study),o=annotateScenarioFuel(f.study,f.request),c=head(o.study,o.assessmentPin.id).content;
 assert.equal(JSON.stringify(f.study),before);assert.deepEqual(c.output,assessFuelLedger(f.request.events,f.request.context));assert.deepEqual(c.output.results.map(r=>r.nominalFuelPointContribution),[null,1,0,1,null,0,null]);assert.equal(c.output.supportedEventSubtotal,2);assert.equal(c.output.unresolvedEvents,3);
 assert.equal(c.runScore,null);assert.equal(c.pairedComparisons,null);assert.equal(c.selectedCandidate,null);assert.equal(c.output.inventoryLinkage,'not-implemented');assert.deepEqual(o.study.decisions,[]);
 assert.ok(o.study.artifacts.filter(a=>a.kind==='comparison-run-evidence').every(a=>a.content.run.score===null));assert.ok(impactReport(o.study).heads.every(a=>!a.stale));
});
test('Reject stale/wrong experiment pins and same-ID changed scenario revisions',()=>{
 const f=fixture();const wrong={...f.request,experimentRef:{...f.request.experimentRef,sha256:'0'.repeat(64)}};assert.throws(()=>annotateScenarioFuel(f.study,wrong),/experiment pin/);
 const e=head(f.study,f.request.experimentRef.id),s=head(f.study,e.content.bindings.scenarios[0].ref.id),content=structuredClone(s.content);content.value.initialAvailable++;content.valueSha256=digest(content.value);const next=appendArtifact(f.study,{id:s.id,kind:s.kind,branch:s.branch,inputs:s.inputs,content,expectedRevision:1});assert.throws(()=>annotateScenarioFuel(next,f.request),/Scenario revision/);
 assert.throws(()=>annotateScenarioFuel(f.study,{...f.request,scenarioId:'other-cohort'}),/not bound/);
});
test('Evidence-source, event, context, assessor, rule and concept revisions invalidate assessment',()=>{
 const o=annotated(),a=head(o.study,o.assessmentPin.id),set=head(o.study,a.content.eventSetPin.id),exp=head(o.study,o.request.experimentRef.id);
 const ids=[set.content.sourceBindings[0].ref.id,set.id,set.content.assessorPin.id,set.content.gamePin.id,exp.content.bindings.concepts[0].ref.id,exp.content.bindings.policies[0].ref.id];
 for(const id of ids){const n=head(o.study,id),content=structuredClone(n.content);if(n.kind==='hypothetical-fuel-source'){content.record.revision='v2';content.recordSha256=digest(content.record);}else if(n.kind==='hypothetical-fuel-event-set'){content.context.firstInactiveAlliance='BLUE';content.inputSha256=digest({events:content.events,context:content.context});}else if(n.kind==='fuel-assessor-model')content.sourceSha256='1'.repeat(64);else if(n.kind==='comparison-input'){content.value.revision='v2';content.valueSha256=digest(content.value);}else content.ruleReview='updated';const next=appendArtifact(o.study,{id,kind:n.kind,branch:n.branch,inputs:n.inputs,content,expectedRevision:1});assert.equal(impactReport(next).heads.find(r=>r.id===a.id).stale,true,id);}
});
test('Re-pinning old assessment to changed event timestamps fails',()=>{
 const o=annotated(),a=head(o.study,o.assessmentPin.id),set=head(o.study,a.content.eventSetPin.id),content=structuredClone(set.content);content.events[0].topEntry.elapsedMs++;content.inputSha256=digest({events:content.events,context:content.context});const next=appendArtifact(o.study,{id:set.id,kind:set.kind,branch:set.branch,inputs:set.inputs,content,expectedRevision:1});assert.throws(()=>appendArtifact(next,{id:a.id,kind:a.kind,branch:a.branch,inputs:[pin(head(next,set.id)),a.content.assessorPin],content:a.content,expectedRevision:1}),/binding/);
});
test('Missing, wrong-purpose and circular hypothetical source records do not corroborate events',()=>{
 for(const mutate of [r=>r.evidenceSources=[],r=>r.evidenceSources[0].kind='observed-sensor',r=>r.evidenceSources[0].references=['self'],r=>r.events[0].evidenceRefs=['run-trace'],r=>r.events[0].evidenceRefs=['independent-hand-calculated-review-vectors','independent-hand-calculated-review-vectors']]){const f=fixture();mutate(f.request);assert.throws(()=>annotateScenarioFuel(f.study,f.request));}
});
test('Release traces, runRefs and implicit tick conversion cannot satisfy event contract',()=>{
 for(const mutate of [r=>r.runRef={id:'compare.run'},r=>r.events[0].releasedUnverified=1,r=>{delete r.events[0].sensorPassage;r.events[0].tick=12;},r=>r.context.clockBasis='comparison-ticks']){const f=fixture();mutate(f.request);assert.throws(()=>annotateScenarioFuel(f.study,f.request));}
});
test('Adapter duplicate/cross-period/rule-pin errors propagate without partial artifacts',()=>{
 for(const mutate of [r=>r.events.push(r.events[0]),r=>r.events[0].sensorPassage.period='AUTO',r=>r.context.ruleSnapshot.sha256='0'.repeat(64)]){const f=fixture(),before=JSON.stringify(f.study);mutate(f.request);assert.throws(()=>annotateScenarioFuel(f.study,f.request));assert.equal(JSON.stringify(f.study),before);}
});
test('Empty ledger and UNKNOWN context preserve coverage/null distinctions',()=>{
 const f=fixture();f.request.context.firstInactiveAlliance='UNKNOWN';let o=annotateScenarioFuel(f.study,f.request);let out=head(o.study,o.assessmentPin.id).content.output;assert.ok(out.results.every(r=>r.nominalFuelPointContribution===null));assert.equal(out.supportedEventSubtotal,0);assert.equal(out.unresolvedEvents,7);assert.equal(out.matchScore,null);
 f.request.events=[];f.request.evidenceSources=[];o=annotateScenarioFuel(f.study,f.request);out=head(o.study,o.assessmentPin.id).content.output;assert.equal(out.results.length,0);assert.equal(out.supportedEventSubtotal,0);assert.equal(out.matchScore,null);assert.match(out.subtotalScope,/not a match score/);
});
test('Unsupported nulls cannot be rewritten as zero or promoted into a run score',()=>{
 const o=annotated(),a=head(o.study,o.assessmentPin.id);for(const mutate of [c=>{c.output.results[0].nominalFuelPointContribution=0;c.outputSha256=digest(c.output);},c=>c.runScore=2,c=>c.output.matchScore=2]){const content=structuredClone(a.content);mutate(content);assert.throws(()=>appendArtifact(o.study,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content,expectedRevision:1}),/null|score|hash/);}
});
test('Bounded inputs and deterministic replay include all events and resolved source versions',()=>{
 const f=fixture(),a=annotateScenarioFuel(f.study,f.request),b=annotateScenarioFuel(f.study,f.request);assert.deepEqual(a,b);
 for(const mutate of [r=>r.events=Array(257).fill(r.events[0]),r=>r.evidenceSources=Array(65).fill(r.evidenceSources[0]),r=>r.evidenceSources[0].statement='x'.repeat(300000)]){const q=structuredClone(f.request);mutate(q);assert.throws(()=>annotateScenarioFuel(f.study,q),/limit|exceeds/);}
});

test('Direct append rejects fabricated causal links and unknown fields throughout annotation schemas',()=>{
 const o=annotated(),assessment=head(o.study,o.assessmentPin.id),set=head(o.study,assessment.content.eventSetPin.id),model=head(o.study,set.content.assessorPin.id),source=head(o.study,set.content.sourceBindings[0].ref.id);
 const cases=[
  [assessment,c=>c.runRef={id:'fabricated-run'}],
  [assessment,c=>c.candidateId='pretend-winner'],
  [assessment,c=>{c.output.runRef={id:'fabricated-run'};c.outputSha256=digest(c.output);}],
  [assessment,c=>{c.output.results[0].causedByRelease='pretend';c.outputSha256=digest(c.output);}],
  [set,c=>{c.events[0].runRef={id:'fabricated-run'};c.inputSha256=digest({events:c.events,context:c.context});}],
  [set,c=>{c.context.runId='fabricated';c.inputSha256=digest({events:c.events,context:c.context});}],
  [source,c=>{c.record.references=['circular'];c.recordSha256=digest(c.record);}],
  [model,c=>c.runRef={id:'fabricated-run'}]
 ];
 for(const [a,mutate]of cases){const content=structuredClone(a.content);mutate(content);assert.throws(()=>appendArtifact(o.study,{id:a.id,kind:a.kind,branch:a.branch,inputs:a.inputs,content,expectedRevision:1}),/Unsupported fuel annotation field/);}
});

test('Saved full-cohort annotation receipt replays exact inputs and preserves null scores',t=>{
 const config=read('case-studies/2026/comparison-experiment.json'),linked=executeAndLinkComparison(read('case-studies/2026/envelope-study.json'),{config,fieldPackage:read('case-studies/2026/field-package.json'),gameId:'game-2026',resourcesId:'resources-2026',prefix:'comparison-2026'});
 const request={...read('templates/fuel-annotation-request.json'),experimentRef:linked.receipt.experiment};const a=annotateScenarioFuel(linked.study,request),c=head(a.study,a.assessmentPin.id).content,e=read('case-studies/2026/fuel-annotation-validation.json');
 assert.equal(e.requestSha256,digest(request));assert.equal(e.outputSha256,c.outputSha256);assert.equal(e.linkerSourceSha256,c.linkerSourceSha256);assert.equal(e.assessorSourceSha256,c.output.modelSourceSha256);assert.equal(e.supportedEventSubtotal,c.output.supportedEventSubtotal);assert.equal(e.unresolvedEvents,c.output.unresolvedEvents);assert.equal(e.runScore,null);assert.equal(e.matchScore,null);
 if(e.runtime.node===process.versions.node){assert.equal(e.studySha256,digest(a.study));assert.deepEqual(e.assessmentPin,a.assessmentPin);}else t.diagnostic('Exact graph replay requires the receipt Node runtime; source/event output pins checked.');
});
