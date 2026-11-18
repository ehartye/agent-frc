const check=(ok,message)=>{if(!ok)throw Error(message);};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a,b,d)=>d(a)===d(b);
const closed=(o,allowed)=>{check(o&&typeof o==='object'&&!Array.isArray(o),'Fuel annotation object required');for(const k of Object.keys(o))check(allowed.includes(k),'Unsupported fuel annotation field '+k);for(const k of allowed)check(Object.hasOwn(o,k),'Missing fuel annotation field '+k);};
const snapshot=s=>closed(s,['season','url','revision','sha256']);
const eventShape=e=>{closed(e,['passageId','pieceId','hubAlliance','basis','evidenceRefs','topEntry','sensorPassage']);closed(e.topEntry,['period','elapsedMs']);closed(e.sensorPassage,['period','elapsedMs']);};
const kinds=new Set(['fuel-assessor-model','hypothetical-fuel-source','hypothetical-fuel-event-set','fuel-assessment-evidence']);
export function validateFuelAnnotationArtifact(a,seen,digest){
 if(!kinds.has(a.kind))return;const c=a.content;
 const fields={
  'fuel-assessor-model':['model','sourceSha256','ruleSnapshot'],
  'hypothetical-fuel-source':['record','recordSha256'],
  'hypothetical-fuel-event-set':['association','comparisonDataUse','experimentPin','scenarioPin','scenarioId','configSha256','gamePin','assessorPin','sourceBindings','events','context','inputSha256'],
  'fuel-assessment-evidence':['eventSetPin','assessorPin','experimentPin','scenarioPin','configSha256','linkerSourceSha256','output','outputSha256','pairedComparisons','runScore','selectedCandidate']
 };
 closed(c,['schema','basis',...fields[a.kind]]);
 for(const ref of a.inputs)closed(ref,['id','revision','sha256']);
 check(c.basis==='hypothetical-external-event','Fuel annotation must remain hypothetical');
 const get=ref=>{closed(ref,['id','revision','sha256']);check(ref&&a.inputs.some(r=>same(r,ref,digest)),'Fuel annotation binding must be an input');const x=seen.get(`${ref.id}@${ref.revision}`);check(x&&x.sha256===ref.sha256,'Fuel annotation binding mismatch');return x;};
 if(a.kind==='fuel-assessor-model'){
  snapshot(c.ruleSnapshot);
  check(c.schema==='frc-fuel-assessor-pin/v1'&&hash(c.sourceSha256),'Fuel assessor source pin required');
  check(a.inputs.length===1,'Assessor must pin one Game Analysis');const game=get(a.inputs[0]);
  check(game.kind==='game-analysis'&&game.content.fieldModel?.sources.some(s=>s.kind==='rulebook'&&s.season===c.ruleSnapshot?.season&&s.url===c.ruleSnapshot.url&&s.revision===c.ruleSnapshot.revision&&s.sha256===c.ruleSnapshot.sha256),'Assessor rule pin differs from Game Analysis');return;
 }
 if(a.kind==='hypothetical-fuel-source'){
  closed(c.record,['id','kind','revision','statement']);
  check(typeof c.record.revision==='string'&&c.record.revision.trim()&&typeof c.record.statement==='string'&&c.record.statement.trim()&&c.record.statement.length<=2048,'Hypothetical source revision/statement required');
  check(c.schema==='frc-hypothetical-passage-source/v1'&&c.record?.kind==='hypothetical-passage-assumption'&&c.recordSha256===digest(c.record),'Invalid hypothetical source record');
  check(a.inputs.length===1&&get(a.inputs[0]).kind==='game-analysis','Hypothetical source requires Game Analysis');return;
 }
 if(a.kind==='hypothetical-fuel-event-set'){
  closed(c.context,['ruleSnapshot','clockBasis','eventApplicability','firstInactiveAlliance']);snapshot(c.context.ruleSnapshot);closed(c.scenarioPin,['id','revision','sha256']);
  check(c.schema==='frc-hypothetical-fuel-event-set/v1'&&c.association==='independent-scenario-fixture'&&c.comparisonDataUse==='identity-only','No causal run association supported');
  const exp=get(c.experimentPin),game=get(c.gamePin),model=get(c.assessorPin);
  check(exp.kind==='comparison-experiment'&&exp.inputs.some(r=>same(r,c.scenarioPin,digest)),'Scenario pin must be in experiment dependency closure');
  const scenario=seen.get(`${c.scenarioPin.id}@${c.scenarioPin.revision}`);check(scenario&&scenario.sha256===c.scenarioPin.sha256,'Scenario dependency pin mismatch');
  check(exp.kind==='comparison-experiment'&&scenario.kind==='comparison-input'&&scenario.content.role==='scenario'&&model.kind==='fuel-assessor-model'&&game.kind==='game-analysis','Fuel annotation input kind mismatch');
  const binding=exp.content.bindings.scenarios.find(b=>b.id===c.scenarioId);
  check(binding&&same(binding.ref,c.scenarioPin,digest)&&c.configSha256===exp.content.configSha256,'Scenario/experiment revision mismatch');
  check(same(exp.content.bindings.game,c.gamePin,digest)&&model.inputs.some(r=>same(r,c.gamePin,digest)),'Fuel annotation baseline mismatch');
  check(scenario.content.value.releaseTargetId==='hub','Only HUB hypothetical event annotation supported');
  check(c.context?.clockBasis==='nominal-scenario'&&c.context.eventApplicability==='unverified-archive'&&same(c.context.ruleSnapshot,model.content.ruleSnapshot,digest),'Fuel annotation context/rule mismatch');
  check(Array.isArray(c.events)&&c.events.length<=256&&Array.isArray(c.sourceBindings)&&c.sourceBindings.length<=64,'Fuel annotation bound exceeded');
  const sourceIds=new Set();for(const b of c.sourceBindings){closed(b,['sourceId','ref']);check(!sourceIds.has(b.sourceId),'Duplicate hypothetical source binding');sourceIds.add(b.sourceId);const source=get(b.ref);check(source.kind==='hypothetical-fuel-source'&&source.content.record.id===b.sourceId&&source.inputs.some(r=>same(r,c.gamePin,digest)),'Wrong-purpose hypothetical source binding');}
  check(a.inputs.length===3+c.sourceBindings.length,'Unbound fuel annotation input');
  for(const event of c.events){eventShape(event);check(event.basis==='hypothetical-external-event'&&Array.isArray(event.evidenceRefs)&&event.evidenceRefs.length>0&&event.evidenceRefs.length<=16&&new Set(event.evidenceRefs).size===event.evidenceRefs.length,'Invalid event provenance');for(const id of event.evidenceRefs)check(sourceIds.has(id),'Unresolved hypothetical event evidence reference');}
  check(c.inputSha256===digest({events:c.events,context:c.context}),'Event-set input hash mismatch');return;
 }
 const set=get(c.eventSetPin),model=get(c.assessorPin);
 check(c.schema==='frc-scenario-fuel-annotation/v1'&&a.inputs.length===2&&set.kind==='hypothetical-fuel-event-set'&&model.kind==='fuel-assessor-model','Invalid fuel assessment evidence inputs');
 check(same(set.content.assessorPin,c.assessorPin,digest)&&same(set.content.experimentPin,c.experimentPin,digest)&&same(set.content.scenarioPin,c.scenarioPin,digest)&&set.content.configSha256===c.configSha256,'Fuel assessment cannot repin old context');
 check(hash(c.linkerSourceSha256)&&c.outputSha256===digest(c.output),'Fuel output/linker hash mismatch');
 const out=c.output;
 closed(out,['model','ruleSnapshot','clockBasis','eventApplicability','firstInactiveAlliance','limitations','schema','inputSha256','modelSourceSha256','results','supportedEventSubtotal','supportedEvents','unresolvedEvents','subtotalScope','inventoryLinkage','matchScore','rankingPoints','winProbability','selectedCandidate']);snapshot(out.ruleSnapshot);
 check(out?.schema==='frc-2026-nominal-fuel-ledger/v1'&&out.inputSha256===set.content.inputSha256&&out.modelSourceSha256===model.content.sourceSha256,'Fuel assessor input/model mismatch');
 check(same(out.ruleSnapshot,model.content.ruleSnapshot,digest)&&out.firstInactiveAlliance===set.content.context.firstInactiveAlliance&&out.clockBasis==='nominal-scenario'&&out.eventApplicability==='unverified-archive','Fuel output context mismatch');
 check(out.inventoryLinkage==='not-implemented'&&out.matchScore===null&&out.rankingPoints===null&&out.winProbability===null&&out.selectedCandidate===null&&c.pairedComparisons===null&&c.runScore===null&&c.selectedCandidate===null,'Fuel annotation cannot become a run score or ranking');
 check(out.results?.length===set.content.events.length,'Fuel output event count mismatch');
 let supported=0,unresolved=0,subtotal=0;
 out.results.forEach((r,i)=>{closed(r,['model','ruleSnapshot','clockBasis','eventApplicability','firstInactiveAlliance','limitations','event','status','nominalFuelPointContribution','reasonCodes','legality','matchScore','rankingPoints','winProbability','sourceLocators']);snapshot(r.ruleSnapshot);eventShape(r.event);check(same(r.event,set.content.events[i],digest),'Fuel output event differs from supplied hypothesis');check(r.matchScore===null&&r.rankingPoints===null&&r.winProbability===null&&r.legality==='not-assessed','Fuel event cannot imply legality or match score');if(r.status==='unsupported'){check(r.nominalFuelPointContribution===null,'Unsupported must remain null');unresolved++;}else{check(r.status==='supported'&&[0,1].includes(r.nominalFuelPointContribution),'Invalid conditional contribution');supported++;subtotal+=r.nominalFuelPointContribution;}});
 check(out.supportedEvents===supported&&out.unresolvedEvents===unresolved&&out.supportedEventSubtotal===subtotal&&typeof out.subtotalScope==='string'&&out.subtotalScope.includes('not a match score'),'Fuel coverage/subtotal mismatch');
}
