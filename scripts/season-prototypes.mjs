import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createStudy,forkBranch,appendArtifact,pin,digest} from './decision-chain.mjs';
import {validateResources} from './resource-baseline.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const plans={
 2026:[
  {id:'fuel-feeder',role:'Single FUEL transport through a compact opposed-roller fixture',mechanisms:['Single-piece FUEL inlet','Opposed roller feeder'],critical:['Foam deformation and assumed contact load','Finite sphere occupancy and exit state','HUB entry and sensor passage are separate unsupported events'],interfaces:['roller speed setpoints and encoder feedback','piece beam observations','cancel/disable and explicit transport window']},
  {id:'fuel-buffered',role:'Buffered FUEL handling with separately controlled release',mechanisms:['Proposed buffer/indexer','Independent feed and release rollers'],critical:['Multiple-piece interactions and jams','Inventory conservation and gate timing','Packaging, power and field scoring model'],interfaces:['buffer occupancy observations','feed/release arbitration','sensor fault and timeout behavior']}
 ],
 2024:[
  {id:'fixed-speaker',role:'Source-fed NOTE handling and fixed-location SPEAKER launch',mechanisms:['One-pocket indexer','Fixed-angle dual-wheel launcher'],critical:['NOTE compression/slip and exit speed/spin','SPEAKER opening and launch-pose registration','Flight/contact model and target-entry event'],interfaces:['intake demand and possession observation','launcher speed setpoint and encoder feedback','explicit pose-valid observation, never inferred from inventory rule']},
  {id:'amp-placement',role:'Low-speed AMP-oriented NOTE placement',mechanisms:['One-pocket indexer','Low-speed positioning/release mechanism'],critical:['NOTE deformation and aperture contact','AMP approach/height and bumper envelope','Release event versus successful scoring'],interfaces:['intake demand and possession observation','mechanism position feedback and limits','explicit alignment-valid observation']}
 ],
 2025:[
  {id:'coral-l1',role:'Station-fed CORAL handling and low-level placement',mechanisms:['Station intake/indexer','Low-level roller end effector'],critical:['CORAL contact/friction and release orientation','L1 receiving geometry and approach clearance','Possession/release versus scored CORAL'],interfaces:['intake demand and possession observation','roller demand and encoder feedback','explicit alignment/zone observations, unknown blocks release']},
  {id:'coral-elevator',role:'Station-fed CORAL placement with an elevator/wrist candidate',mechanisms:['CORAL indexer','Elevator and wrist with roller end effector'],critical:['Elevator/wrist mass, inertia and limit states','Higher-level placement collision and reach','Chassis stability under raised payload'],interfaces:['height/angle setpoints and sensor feedback','limit/homing/timeout state','explicit target and alignment observations']}
 ]
};
export function buildSeasonPrototypeStudy({season,caseData,resources,caseFileSha256}){
 check(Object.hasOwn(plans,season),'Only reviewed 2024/2025/2026 planning slices supported');
 check(caseData?.season===season&&caseData.manualFingerprint?.season===season,'Case/manual season mismatch');
 check(typeof caseFileSha256==='string'&&/^[a-f0-9]{64}$/.test(caseFileSha256),'Exact case bytes required');
 const manual=caseData.manualFingerprint;
 check(typeof manual.sha256==='string'&&/^[a-f0-9]{64}$/.test(manual.sha256)&&typeof manual.url==='string'&&manual.url.startsWith('https://'),'Pinned official source required');
 check(Array.isArray(caseData.requirements)&&caseData.requirements.length>0&&caseData.requirements.every(r=>['id','ref','fact','design'].every(k=>typeof r[k]==='string'&&r[k].length>0)),'Source-bound facts and separate design policy required');
 validateResources(resources);check(resources.season===season,'Resources cannot cross seasons');
 let s=createStudy(season);
 const add=(id,kind,branch,ids,content)=>{s=appendArtifact(s,{id,kind,branch,inputs:ids.map(id=>pin(s.artifacts.filter(a=>a.id===id).at(-1))),content});};
 add('game-'+season,'game-analysis','shared',[],{schema:'frc-season-prototype-game/v1',manual:{...manual,handling:'This case capture retained no PDF body; private reference ingestion is separately cataloged'},caseFileSha256,caseContentSha256:digest(caseData),eventContext:caseData.eventContext,requirements:caseData.requirements,scope:'Selected existing case facts only; not complete game rules or geometry',fieldGeometry:'unresolved',scoringModel:'not-implemented'});
 add('resources-'+season,'resource-baseline','shared',[],resources);
 const shared=['game-'+season,'resources-'+season];
 for(const p of plans[season]){
  s=forkBranch(s,p.id);const prefix=season+'-'+p.id;
  add(prefix+'.strategy','strategy-brief',p.id,shared,{role:p.role,decision:'not-selected',basis:'hypothetical-prototype-scope',alternativesPreserved:true,teamFeasibility:'unknown'});
  add(prefix+'.envelope','robot-envelope',p.id,[...shared,prefix+'.strategy'],{basis:'unresolved-design-target',dimensionsMm:{length:null,width:null,height:null},massKg:null,centerOfMassMm:null,inertiaKgM2:null,footprintReference:'unknown',legality:'not-established',reachability:'not-assessed',unknowns:['Season-specific chassis/bumper/moving envelope','Actual team parts and fabrication','Complete mass, electrical and power budgets']});
  add(prefix+'.contract','capability-contract',p.id,[prefix+'.strategy',prefix+'.envelope'],{basis:'proposed-not-implemented',mechanisms:p.mechanisms,interfaces:p.interfaces,sharedSafety:['Disabled or fault state requests zero output','Timeout/cancellation tested separately from game timing','Unknown or stale alignment/possession blocks release','No deployment or motor hardware access'],acceptance:'not-established'});
  add(prefix+'.architecture','architecture-trade',p.id,[prefix+'.contract'],{basis:'hypothetical',candidate:p.mechanisms,tradeQuestions:p.critical,selection:'none',separation:['Candidate code consumes declared sensors and commands outputs','Plant adapter owns physical state and sensor injection','Game assessor consumes separately justified target events, never PWM/release as score']});
  add(prefix+'.subsystem','subsystem-spec',p.id,[prefix+'.architecture'],{schema:'frc-season-prototype-milestones/v1',implementation:'planned',milestones:[
   {id:'source-and-configuration',status:'open',exit:'Pin season/event rules, exact proposed parts, field region and coordinate frames; preserve unverified parameters'},
   {id:'cad-and-plant',status:'open',exit:'Create/inspect original dimensioned mechanism CAD; extract exact-source component geometry and explicitly assumed physical parameters; record omissions'},
   {id:'code-io',status:'open',exit:'Execute candidate mechanism code using sensor/actuator IO; inject sensor faults; prove timeout/disable output behavior'},
   {id:'coupled-execution',status:'open',exit:'Run native CAD-bound mechanism plus chassis/power assumptions with deterministic sensor IO and exact runtime/source/config receipts'},
   {id:'season-event',status:'open',exit:'Assess justified piece/target interaction events against exact selected rules; unsupported contact or scoring remains null'},
   {id:'prototype-review',status:'open',exit:'Independent replay and parameter-domain review; executable hypothetical prototype distinguished from calibrated acceptance'}
  ],criticalGaps:p.critical,simulationReady:false,executedEvidence:[],calibrated:false,engineeringAcceptance:'blocked',score:null,ranking:null});
 }
 return s;
}
export function readSeasonPrototypeStudy(season){const url=new URL('../case-studies/'+season+'/case.json',import.meta.url),bytes=fs.readFileSync(url);const resources=JSON.parse(fs.readFileSync(new URL('../templates/resource-baseline.json',import.meta.url),'utf8')).resources;resources.season=season;return buildSeasonPrototypeStudy({season,caseData:JSON.parse(bytes),resources,caseFileSha256:createHash('sha256').update(bytes).digest('hex')});}
