import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const check=(ok,message)=>{if(!ok)throw Error(message);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const milliseconds=x=>Number.isSafeInteger(x)&&x>=0;
export const RULE_SNAPSHOT=Object.freeze({season:2026,url:'https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf',revision:'TU22; 166 pages',sha256:'5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139'});
export const MODEL='frc-2026-nominal-interior-fuel/v1';
const TELEOP=Object.freeze([{id:'TRANSITION',startMs:0,endMs:10000},{id:'SHIFT1',startMs:10000,endMs:35000},{id:'SHIFT2',startMs:35000,endMs:60000},{id:'SHIFT3',startMs:60000,endMs:85000},{id:'SHIFT4',startMs:85000,endMs:110000},{id:'ENDGAME',startMs:110000,endMs:140000}].map(Object.freeze));
export const LIMITATIONS=Object.freeze([
 'Nominal archived-rule schedule only; timestamps are hypothetical period-local inputs, not measured FMS/Driver Station time.',
 'Explicit hypothetical top-opening and sensor-passage events; no conversion from abstract release counts and no flight, geometry or sensor simulation.',
 'Grace, exact phase boundaries, crossing phases and post-period assessment are outside this conservative adapter scope; unsupported does not mean cannot score.',
 'Conditional FUEL component contributions only. No complete match score, penalties, ranking points, tower points, win probability or legality conclusion.',
 'Input provenance labels and hashes do not authenticate physical events, official source bytes or event-specific rule applicability.'
]);
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
function validateContext(c){
 check(c&&c.clockBasis==='nominal-scenario','Explicit nominal-scenario clock required');
 check(c.firstInactiveAlliance==='RED'||c.firstInactiveAlliance==='BLUE'||c.firstInactiveAlliance==='UNKNOWN','First-inactive alliance must be RED, BLUE or UNKNOWN');
 check(c.ruleSnapshot&&Object.entries(RULE_SNAPSHOT).every(([k,v])=>c.ruleSnapshot[k]===v),'Rule snapshot mismatch; only pinned 2026 TU22 supported');
 check(c.eventApplicability==='unverified-archive','This model does not establish actual event applicability');
}
function validateStamp(t){check(t&&['AUTO','TELEOP'].includes(t.period)&&milliseconds(t.elapsedMs),'Period and nonnegative integer elapsedMs required');}
function phaseRaw(t,c){
 const p=t.period==='AUTO'?(t.elapsedMs<20000?{id:'AUTO',startMs:0,endMs:20000}:null):TELEOP.find(p=>t.elapsedMs>=p.startMs&&t.elapsedMs<p.endMs);
 if(!p)return {period:t.period,phase:null,startMs:null,endMs:null,redHubStatus:'UNKNOWN',blueHubStatus:'UNKNOWN',reason:'outside-nominal-period'};
 let red='ACTIVE',blue='ACTIVE';
 if(p.id.startsWith('SHIFT')){
  if(c.firstInactiveAlliance==='UNKNOWN')red=blue='UNKNOWN';
  else {const first=c.firstInactiveAlliance;const odd=p.id==='SHIFT1'||p.id==='SHIFT3';const inactive=odd?first:first==='RED'?'BLUE':'RED';red=inactive==='RED'?'INACTIVE':'ACTIVE';blue=inactive==='BLUE'?'INACTIVE':'ACTIVE';}
 }
 return {period:t.period,phase:p.id,startMs:p.startMs,endMs:p.endMs,redHubStatus:red,blueHubStatus:blue,reason:null};
}
const provenance=c=>({model:MODEL,ruleSnapshot:{...RULE_SNAPSHOT},clockBasis:c.clockBasis,eventApplicability:c.eventApplicability,firstInactiveAlliance:c.firstInactiveAlliance,limitations:[...LIMITATIONS]});
export function phaseAt(timestamp,context){validateContext(context);validateStamp(timestamp);return {...provenance(context),timestamp:{...timestamp},...phaseRaw(timestamp,context),sourceLocators:['6.4 Table 6-2 p44','6.4.1 Table 6-3 pp44-45']};}
function validateEvent(e){
 check(e&&id(e.passageId)&&id(e.pieceId),'Passage and piece IDs required');
 check(e.basis==='hypothetical-external-event','Only explicitly hypothetical external events supported');
 check(['RED','BLUE'].includes(e.hubAlliance),'Hub alliance required');
 check(Array.isArray(e.evidenceRefs)&&e.evidenceRefs.length>0&&e.evidenceRefs.every(id),'Explicit hypothetical event evidence references required');
 validateStamp(e.topEntry);validateStamp(e.sensorPassage);
 check(e.topEntry.period===e.sensorPassage.period,'Cross-period events unsupported; cannot reinterpret AUTO delay as TELEOP');
 check(e.sensorPassage.elapsedMs>e.topEntry.elapsedMs,'Sensor passage must be strictly after top entry');
}
export function assessFuelPassage(event,context){
 validateContext(context);validateEvent(event);
 const entry=phaseRaw(event.topEntry,context),sensor=phaseRaw(event.sensorPassage,context);
 const result={...provenance(context),event:structuredClone(event),status:'unsupported',nominalFuelPointContribution:null,reasonCodes:[],legality:'not-assessed',matchScore:null,rankingPoints:null,winProbability:null,sourceLocators:['6.4/6.4.1 pp44-45','6.5/6.5.1 pp45-46','6.5.3 Table 6-4 p47']};
 const unsupported=reason=>({...result,reasonCodes:[reason]});
 if(!entry.phase||!sensor.phase)return unsupported('post-period-or-outside-supported-clock');
 if(entry.phase!==sensor.phase)return unsupported('cross-phase-passage');
 if(event.topEntry.elapsedMs===entry.startMs||event.sensorPassage.elapsedMs===sensor.startMs)return unsupported('exact-phase-boundary');
 const status=event.hubAlliance==='RED'?sensor.redHubStatus:sensor.blueHubStatus;
 if(status==='UNKNOWN')return unsupported('unknown-hub-availability');
 // Only the newly INACTIVE HUB gets post-deactivation grace exclusion. The other HUB is active.
 if(status==='INACTIVE'&&event.topEntry.elapsedMs<=sensor.startMs+3000)return unsupported('post-deactivation-grace-or-exact-grace-endpoint');
 return {...result,status:'supported',nominalFuelPointContribution:status==='ACTIVE'?1:0,reasonCodes:[status==='ACTIVE'?'active-phase-interior':'inactive-phase-interior-outside-grace']};
}
export function assessFuelLedger(events,context){
 validateContext(context);check(Array.isArray(events)&&events.length<=10000,'Ledger must be an array of at most 10000 events');
 const seen=new Set();for(const e of events){validateEvent(e);check(!seen.has(e.passageId),'Duplicate passage ID');seen.add(e.passageId);}
 const results=events.map(e=>assessFuelPassage(e,context));
 return {...provenance(context),schema:'frc-2026-nominal-fuel-ledger/v1',inputSha256:digest({events,context}),modelSourceSha256:createHash('sha256').update(fs.readFileSync(new URL('2026-fuel-assessment.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),results,supportedEventSubtotal:results.reduce((sum,r)=>sum+(r.nominalFuelPointContribution??0),0),supportedEvents:results.filter(r=>r.status==='supported').length,unresolvedEvents:results.filter(r=>r.status==='unsupported').length,subtotalScope:'Supported supplied event component only; not a match score, prediction, lower bound or complete FUEL total',inventoryLinkage:'not-implemented',matchScore:null,rankingPoints:null,winProbability:null,selectedCandidate:null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{check(process.argv.length===3,'Usage: node scripts/2026-fuel-assessment.mjs events.json');const {events,context}=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(assessFuelLedger(events,context),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
