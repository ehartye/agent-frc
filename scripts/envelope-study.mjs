import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStudy,forkBranch,appendArtifact,pin,digest} from './decision-chain.mjs';
import {validateFieldModel} from './field-semantics.mjs';
import {validateResources,inventoryAssessment} from './resource-baseline.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const readFieldPackage=()=>JSON.parse(fs.readFileSync(new URL('../case-studies/2026/field-package.json',import.meta.url),'utf8'));
export function buildEnvelopeStudy({resources,fieldPackage=readFieldPackage(),assumptions={}}){
 validateResources(resources);check(resources.season===2026,'This sourced example supports 2026 only');
 check(fieldPackage.schema==='frc-sourced-field-package/v1','Unknown sourced field package');
 validateFieldModel(fieldPackage.fieldModel);check(fieldPackage.season===2026&&fieldPackage.fieldModel.season===2026,'Field season mismatch');
 for(const k of Object.keys(assumptions))check(['clearanceMarginMm','heightUncertaintyMm','fieldVariant','kitInventoryId','candidateDimensions'].includes(k),'Unknown envelope assumption '+k);
 const a={clearanceMarginMm:null,heightUncertaintyMm:null,fieldVariant:'unknown',kitInventoryId:null,candidateDimensions:{},...assumptions};
 for(const k of ['clearanceMarginMm','heightUncertaintyMm'])check(a[k]===null||(Number.isFinite(a[k])&&a[k]>=0),'Invalid '+k);
 check(['unknown','welded','andymark'].includes(a.fieldVariant),'Invalid field variant');
 check(a.candidateDimensions&&typeof a.candidateDimensions==='object'&&!Array.isArray(a.candidateDimensions),'Candidate dimensions object required');
 for(const [name,d]of Object.entries(a.candidateDimensions)){check(['compact','payload'].includes(name),'Kit dimensions must come from actual inventory evidence');for(const k of Object.keys(d))check(['lengthMm','widthMm','heightMm','footprintReference'].includes(k),'Unknown target dimension');for(const k of ['lengthMm','widthMm','heightMm'])if(Object.hasOwn(d,k))check(d[k]===null||(Number.isFinite(d[k])&&d[k]>0),'Invalid target dimension');check(d.footprintReference===undefined||['robot-perimeter-excluding-bumpers','complete-robot-including-bumpers','unknown'].includes(d.footprintReference),'Invalid target footprint reference');}
 for(const [id,purpose] of [['hub','scoring'],['depot','retrieval'],['outpost','retrieval'],['neutral-zone-fuel','retrieval']])check(fieldPackage.fieldModel.locations.some(l=>l.id===id&&l.purpose===purpose),'Missing or mismatched strategy location '+id);
 const sources=fieldPackage.fieldModel.sources;
 const cap=fieldPackage.robotRuleCaps;check(sources.some(s=>s.id===cap.source&&s.kind==='rulebook'),'Rule cap provenance missing');
 for(const k of ['perimeterLimitInch','startingHeightLimitInch','extensionLimitInch'])check(Number.isFinite(cap[k])&&cap[k]>0,'Invalid rule cap');
 const trench=fieldPackage.dimensions.find(d=>d.id==='trench-welded-clearance');check(trench&&trench.season===2026,'Missing sourced trench dimension');
 check(Number.isFinite(fieldPackage.massRule?.limitLb)&&fieldPackage.massRule.limitLb>0&&sources.some(s=>s.id===fieldPackage.massRule.source&&s.kind==='rulebook'),'Mass rule/provenance missing');
 check(Number.isFinite(trench.values?.height)&&Number.isFinite(trench.toleranceInch?.height)&&trench.toleranceInch.height>=0&&sources.some(s=>s.kind==='official-drawing'&&trench.drawingLocator.startsWith(s.id)),'Trench dimension/provenance missing');
 check(trench.originalUnit==='inch','Trench source units must be inch');
 check(Number.isFinite(trench.valuesMm?.height)&&Math.abs(trench.valuesMm.height-trench.values.height*25.4)<1e-6,'Trench unit conversion mismatch');
 check(trench.sourceRef&&sources.some(s=>s.id===trench.sourceRef.id&&s.kind==='official-drawing'&&s.sha256===trench.sourceRef.sha256&&s.revision===trench.sourceRef.revision)&&trench.sourceRef.locator===trench.drawingLocator,'Trench source revision pin mismatch');
 const heightLowerMm=(trench.values.height-trench.toleranceInch.height)*25.4;
 check(Number.isFinite(heightLowerMm)&&heightLowerMm>0,'Invalid trench bound');
 const clearanceResolved=a.clearanceMarginMm!==null&&a.heightUncertaintyMm!==null;
 const staticHeightCeilingMm=clearanceResolved?heightLowerMm-a.clearanceMarginMm-a.heightUncertaintyMm:null;
 if(staticHeightCeilingMm!==null)check(staticHeightCeilingMm>0,'Clearance reserves consume trench height');
 const available=inventoryAssessment(resources);let kit=null;
 if(a.kitInventoryId!==null){kit=resources.physicalInventory.find(x=>x.id===a.kitInventoryId);check(kit,'Unknown kit inventory ID');}
 let study=createStudy(2026);
 const add=(id,kind,branch,inputs,content)=>{study=appendArtifact(study,{id,kind,branch,inputs:inputs.map(id=>pin(study.artifacts.filter(x=>x.id===id).at(-1))),content});};
 add('game-2026','game-analysis','shared',[],{fieldModel:fieldPackage.fieldModel,fieldPackageHash:digest(fieldPackage),dimensions:fieldPackage.dimensions,robotRuleCaps:cap,massRule:fieldPackage.massRule,eventApplicability:fieldPackage.eventApplicability,revisionWarnings:fieldPackage.revisionWarnings});
 add('resources-2026','resource-baseline','shared',[],resources);
 const common=['game-2026','resources-2026'];
 for(const branch of ['kit-baseline','compact','payload']){
  study=forkBranch(study,branch);
  const role=branch==='kit-baseline'?'Evaluate a season-specific kit-based candidate only if actual parts are confirmed':branch==='compact'?'Investigate trench-oriented FUEL collection and active-window delivery':'Investigate larger buffering with an alternate route; no trench requirement assumed';
  add(branch+'-strategy','strategy-brief',branch,common,{role,decision:'not-selected',fieldPackageHash:digest(fieldPackage),scoringLocationIds:['hub'],retrievalLocationIds:['depot','outpost','neutral-zone-fuel'],resourceAssessment:available,resourceCoverage:resources.inventoryCoverage,assumptions:[{id:'route-role',value:role,kind:'hypothesis'}],unknowns:['Source/retrieval world geometry and approach poses','Scoring flight/contact model','Actual complete hardware and engineering resources']});
  let target={lengthMm:null,widthMm:null,heightMm:null};let basis={kind:'unresolved',evidenceRefs:[]};let footprintReference='unknown';
  if(branch==='kit-baseline'&&kit&&available.find(x=>x.id===kit.id).status==='available'&&kit.dimensions){target={lengthMm:kit.dimensions.length,widthMm:kit.dimensions.width,heightMm:kit.dimensions.scope==='complete-robot'?kit.dimensions.height:null};footprintReference=kit.dimensions.perimeterReference??'unknown';basis={kind:'actual-inventory-component-envelope-not-final-robot',inventoryId:kit.id,scope:kit.dimensions.scope,evidenceRefs:kit.dimensions.evidenceRefs};}
  if(branch!=='kit-baseline'&&a.candidateDimensions[branch]){const d=a.candidateDimensions[branch];for(const k of ['lengthMm','widthMm','heightMm'])if(Object.hasOwn(d,k))target[k]=d[k];footprintReference=d.footprintReference??'unknown';basis={kind:'explicit-hypothetical-target-not-measured',evidenceRefs:[]};}
  const perimeterMm=target.lengthMm!==null&&target.widthMm!==null?2*(target.lengthMm+target.widthMm):null;
  const frameCheck=perimeterMm===null||footprintReference!=='robot-perimeter-excluding-bumpers'?'unresolved':perimeterMm>cap.perimeterLimitInch*25.4?'exceeds-selected-rule-bound':'within-selected-rectangular-bound-only';
  const staticCheck=branch!=='compact'?'not-requested':target.heightMm===null||staticHeightCeilingMm===null||a.fieldVariant!=='welded'?'unresolved':target.heightMm>staticHeightCeilingMm?'exceeds-assumed-static-clearance':'within-assumed-static-clearance-only';
  add(branch+'-envelope','robot-envelope',branch,[...common,branch+'-strategy'],{candidate:branch,decision:'not-selected',status:'unresolved',hardLegalityBounds:{sourceId:cap.source,locator:cap.locator,perimeterMm:cap.perimeterLimitInch*25.4,heightMm:cap.startingHeightLimitInch*25.4,extensionMm:cap.extensionLimitInch*25.4,massLimitKg:fieldPackage.massRule.limitLb*0.45359237,qualifiers:[cap.notes,fieldPackage.massRule.qualifier],eventApplicability:fieldPackage.eventApplicability},target,basis,footprintReference,calculated:{rectangularPerimeterMm:perimeterMm,perimeterCheck:frameCheck,trenchHeightLowerMm:heightLowerMm,assumedStaticHeightCeilingMm:branch==='compact'?staticHeightCeilingMm:null,staticClearanceCheck:staticCheck},assumptions:{clearanceMarginMm:a.clearanceMarginMm,heightUncertaintyMm:a.heightUncertaintyMm,fieldVariant:a.fieldVariant},budget:{allocatedMassKg:null,extensionTargetMm:null,bumperProjectionMm:null,payloadVolumeMm3:null,powerW:null},reachability:'not-assessed',openChecks:['Actual event/update applicability','Bumpers and moving mechanism swept envelope','Pitch/roll, loaded deflection, ground clearance and traversal dynamics','Complete robot mass and power budgets','Scoring/retrieval approach and robot reach','Field variant and geometry/revision reconciliation']});
 }
 return study;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{check(process.argv.length===3,'Usage: node scripts/envelope-study.mjs input.json (explicit resources required)');console.log(JSON.stringify(buildEnvelopeStudy(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
