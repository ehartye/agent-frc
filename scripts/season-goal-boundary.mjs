import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assessFuelPassage,phaseAt,RULE_SNAPSHOT} from './2026-fuel-assessment.mjs';
const check=(b,m)=>{if(!b)throw Error(m);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const goals={2024:'SPEAKER',2025:'CORAL_L1',2026:'HUB'};
const stamp=x=>x&&['AUTO','TELEOP'].includes(x.period)&&Number.isSafeInteger(x.elapsedMs)&&x.elapsedMs>=0;
const tri=x=>x===true||x===false||x===null;
export const sourcePins=()=>Object.fromEntries(['scripts/season-goal-boundary.mjs','scripts/2026-fuel-assessment.mjs','case-studies/season-goal-evidence.json'].map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
export function assessSeasonAttempt(a){
 check(a&&Object.hasOwn(goals,a.season)&&a.goal===goals[a.season],'Season goal mismatch');
 check(a.basis==='hypothetical-interface-test'&&id(a.attemptId)&&id(a.pieceId),'Explicit hypothetical attempt identity required');
 check(stamp(a.release),'Period-local release timestamp required');
 check(a.gates&&['possession','aligned','mechanismReady','reefZone'].every(k=>tri(a.gates[k])),'Tri-state gate observations required');
 const result={schema:'frc-season-goal-attempt/v1',season:a.season,goal:a.goal,attemptId:a.attemptId,pieceId:a.pieceId,basis:a.basis,releasePermitted:false,targetCriterion:null,nominalComponentPoints:null,status:'blocked',reason:'release-gate-unknown-or-false',matchScore:null,legality:'not-assessed',calibration:null,hardwareAcceptance:'blocked',physicalLinkage:'not-demonstrated',sourceCodeSha256:sourcePins()};
 if(!['possession','aligned','mechanismReady'].every(k=>a.gates[k]===true)||(a.season===2025&&a.gates.reefZone!==true))return result;
 if(a.season===2026){
  const p=phaseAt(a.release,a.context);check(['RED','BLUE'].includes(a.alliance),'Alliance required');
  if(p[a.alliance==='RED'?'redHubStatus':'blueHubStatus']!=='ACTIVE')return {...result,reason:'conservative-inactive-or-unknown-release-policy'};
 }
 const base={...result,releasePermitted:true,status:'unsupported',reason:'missing-independent-target-event'};
 if(a.event===null||a.event===undefined)return base;
 const e=a.event;check(e.basis==='hypothetical-external-event'&&e.attemptId===a.attemptId&&e.pieceId===a.pieceId&&e.goal===a.goal&&id(e.eventId),'Target event identity mismatch');
 check(Array.isArray(e.evidenceRefs)&&e.evidenceRefs.length>0&&e.evidenceRefs.every(id),'Target evidence refs required');
 const after=t=>{check(stamp(t)&&t.period===a.release.period&&t.elapsedMs>a.release.elapsedMs,'Target event must follow release in same period');};
 if(a.season===2026){
  after(e.topEntry);after(e.sensorPassage);check(e.hubAlliance===a.alliance,'Target alliance mismatch');
  const r=assessFuelPassage({...e,passageId:e.eventId},a.context);
  return {...base,status:r.status,reason:r.reasonCodes.join(','),targetCriterion:r.status==='supported'?true:null,nominalComponentPoints:r.nominalFuelPointContribution,fuelAssessment:r};
 }
 const limit=a.release.period==='AUTO'?15000:135000;
 if(a.release.elapsedMs===0||a.release.elapsedMs>=limit)return {...base,reason:'outside-supported-period-interior'};
 if(a.season===2024){
  after(e.fieldOpening);after(e.sensorPassage);check(e.sensorPassage.elapsedMs>e.fieldOpening.elapsedMs,'Sensor must follow opening');
  if(e.sensorPassage.elapsedMs>=limit)return {...base,reason:'post-period-window-not-modeled'};
  if(e.amplification!=='UNAMPLIFIED')return {...base,reason:'amplification-not-modeled'};
  return {...base,status:'supported-hypothetical',reason:'speaker-opening-and-sensor',targetCriterion:true,nominalComponentPoints:a.release.period==='AUTO'?5:2};
 }
 after(e.assessedAt);if(e.assessedAt.elapsedMs>=limit)return {...base,reason:'post-period-window-not-modeled'};
 check(['sameAllianceRobotContact','otherLevelScored','troughContact','directlySupportedByTroughCoral'].every(k=>tri(e[k])),'Tri-state CORAL contact observations required');
 if(e.sameAllianceRobotContact===true||e.otherLevelScored===true)return {...base,status:'supported-hypothetical',reason:'excluded-contact-or-other-level',targetCriterion:false,nominalComponentPoints:0};
 if(e.sameAllianceRobotContact===null||e.otherLevelScored===null)return {...base,reason:'unknown-coral-exclusion'};
 if(e.troughContact===true||e.directlySupportedByTroughCoral===true)return {...base,status:'supported-hypothetical',reason:'l1-contact-criterion',targetCriterion:true,nominalComponentPoints:a.release.period==='AUTO'?3:2};
 if(e.troughContact===null||e.directlySupportedByTroughCoral===null)return {...base,reason:'unknown-coral-support'};
 return {...base,status:'supported-hypothetical',reason:'no-l1-support',targetCriterion:false,nominalComponentPoints:0};
}
export function assessAttemptLedger(attempts){
 check(Array.isArray(attempts),'Attempt list required');const seen=new Set(),events=new Set();
 for(const a of attempts){check(!seen.has(a.attemptId),'Duplicate attempt');seen.add(a.attemptId);if(a.event){check(!events.has(a.event.eventId),'Duplicate target event');events.add(a.event.eventId);}}
 return attempts.map(assessSeasonAttempt);
}
export function transportCoverage(receipt){
 check(receipt.schema==='frc-diagnostic-world-supervisor/v1'&&Array.isArray(receipt.observations),'Diagnostic world receipt required');
 return receipt.observations.map((line,index)=>{
  const y=/^DIAGNOSTIC_CATCHER year=(2024|2025|2026) /.exec(line),released=/\blocallyReleased=(true|false)(?:,|\])/.exec(line),captured=/\bcaptured=(true|false)(?:,|\])/.exec(line);check(y&&released&&captured,'Unknown diagnostic observation shape');
  return {sourceObservationIndex:index,season:Number(y[1]),goal:goals[y[1]],localModelCapture:captured[1]==='true',localModelRelease:released[1]==='true',targetCriterion:null,nominalComponentPoints:null,physicalLinkage:'not-demonstrated',reason:'No target opening/sensor or L1 contact event exists in this transport receipt; release direction is not a launch/placement model'};
 });
}
export const nominalFuelContext=()=>({clockBasis:'nominal-scenario',firstInactiveAlliance:'RED',ruleSnapshot:{...RULE_SNAPSHOT},eventApplicability:'unverified-archive'});
