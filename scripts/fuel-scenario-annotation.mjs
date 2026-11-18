import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {validateStudy,impactReport,forkBranch,appendArtifact,pin,digest} from './decision-chain.mjs';
import {MODEL,RULE_SNAPSHOT,assessFuelLedger} from './2026-fuel-assessment.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const keys=(o,allowed)=>{check(o&&typeof o==='object'&&!Array.isArray(o),'Object required');for(const k of Object.keys(o))check(allowed.includes(k),'Unsupported annotation field '+k);};
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
const sourceText=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n');
export function annotateScenarioFuel(study,request){
 keys(request,['experimentRef','scenarioId','events','context','evidenceSources','prefix']);validateStudy(study);
 check(Buffer.byteLength(JSON.stringify(request),'utf8')<=262144,'Annotation input exceeds 256 KiB');
 const {experimentRef,scenarioId,events,context,evidenceSources,prefix}=request;
 check(id(prefix)&&prefix.length<=64&&!study.artifacts.some(a=>a.id.startsWith(prefix+'.'))&&!study.branches.some(b=>b.id===prefix),'Unique annotation prefix required');
 const experiment=head(study,experimentRef?.id);check(experiment?.kind==='comparison-experiment'&&digest(pin(experiment))===digest(experimentRef),'Exact current experiment pin required');
 const binding=experiment.content.bindings.scenarios.find(b=>b.id===scenarioId);check(binding,'Scenario not bound to experiment');
 const scenario=head(study,binding.ref.id),game=head(study,experiment.content.bindings.game.id);
 check(scenario&&digest(pin(scenario))===digest(binding.ref)&&scenario.content.value.releaseTargetId==='hub','Scenario revision/target mismatch');
 check(game&&digest(pin(game))===digest(experiment.content.bindings.game),'Game revision mismatch');
 const stale=impactReport(study).heads;for(const x of [experiment,scenario,game])check(!stale.find(a=>a.id===x.id)?.stale,'Cannot annotate stale experiment inputs');
 check(game.content.fieldModel?.sources.some(s=>s.kind==='rulebook'&&s.season===RULE_SNAPSHOT.season&&s.url===RULE_SNAPSHOT.url&&s.revision===RULE_SNAPSHOT.revision&&s.sha256===RULE_SNAPSHOT.sha256),'Game Analysis must pin exact assessor rule snapshot');
 check(Array.isArray(events)&&events.length<=256&&Array.isArray(evidenceSources)&&evidenceSources.length<=64,'Event/source limit exceeded');
 keys(context,['ruleSnapshot','clockBasis','eventApplicability','firstInactiveAlliance']);
 const ids=new Set();for(const r of evidenceSources){keys(r,['id','kind','revision','statement']);check(id(r.id)&&!ids.has(r.id)&&r.kind==='hypothetical-passage-assumption','Unique hypothetical source records required');ids.add(r.id);check(typeof r.revision==='string'&&r.revision.trim()&&typeof r.statement==='string'&&r.statement.trim()&&r.statement.length<=2048,'Source revision and bounded statement required');}
 for(const e of events){keys(e,['passageId','pieceId','hubAlliance','basis','evidenceRefs','topEntry','sensorPassage']);keys(e.topEntry,['period','elapsedMs']);keys(e.sensorPassage,['period','elapsedMs']);check(Array.isArray(e.evidenceRefs)&&e.evidenceRefs.length>0&&e.evidenceRefs.length<=16&&new Set(e.evidenceRefs).size===e.evidenceRefs.length,'Explicit unique bounded evidence references required');for(const ref of e.evidenceRefs)check(ids.has(ref),'Unresolved hypothetical evidence reference');}
 const output=assessFuelLedger(events,context); // Preserve exact supported, unsupported and null semantics.
 let annotated=forkBranch(study,prefix,experiment.branch);const add=(suffix,kind,branch,inputs,content)=>{const artifactId=prefix+'.'+suffix;annotated=appendArtifact(annotated,{id:artifactId,kind,branch,inputs,content});return pin(head(annotated,artifactId));};
 const common={basis:'hypothetical-external-event'},gamePin=pin(game);
 const sourceSha256=createHash('sha256').update(sourceText('2026-fuel-assessment.mjs')).digest('hex');
 const assessorPin=add('assessor','fuel-assessor-model',experiment.branch,[gamePin],{...common,schema:'frc-fuel-assessor-pin/v1',model:MODEL,sourceSha256,ruleSnapshot:{...RULE_SNAPSHOT}});
 const sourceBindings=evidenceSources.map(record=>({sourceId:record.id,ref:add('source.'+record.id,'hypothetical-fuel-source',prefix,[gamePin],{...common,schema:'frc-hypothetical-passage-source/v1',record,recordSha256:digest(record)})}));
 const scenarioPin=pin(scenario);
 const setPin=add('events','hypothetical-fuel-event-set',prefix,[experimentRef,gamePin,assessorPin,...sourceBindings.map(x=>x.ref)],{...common,schema:'frc-hypothetical-fuel-event-set/v1',association:'independent-scenario-fixture',comparisonDataUse:'identity-only',experimentPin:experimentRef,scenarioPin,scenarioId,configSha256:experiment.content.configSha256,gamePin,assessorPin,sourceBindings,events,context,inputSha256:output.inputSha256});
 const linkerSourceSha256=digest(Object.fromEntries(['fuel-scenario-annotation.mjs','fuel-annotation-validation.mjs'].map(f=>[f,sourceText(f)])));
 const assessmentPin=add('assessment','fuel-assessment-evidence',prefix,[setPin,assessorPin],{...common,schema:'frc-scenario-fuel-annotation/v1',eventSetPin:setPin,assessorPin,experimentPin:experimentRef,scenarioPin,configSha256:experiment.content.configSha256,linkerSourceSha256,output,outputSha256:digest(output),pairedComparisons:null,runScore:null,selectedCandidate:null});
 return {study:annotated,assessmentPin};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{check(process.argv.length===4,'Usage: node scripts/fuel-scenario-annotation.mjs linked-study.json annotation-request.json');const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));console.log(JSON.stringify(annotateScenarioFuel(read(process.argv[2]),read(process.argv[3])),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
