import {reviewLiftPaths} from './lift-path-faults.mjs';
import {reviewActuatorDuties} from './actuator-duties.mjs';
import {auditPieceWindow} from './piece-window.mjs';
import {reviewCoupled} from './coupled-support.mjs';
import {reviewCohort} from './throughput-cohort.mjs';
export {auditPieceWindow} from './piece-window.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {studyRows} from './strategy-lab.mjs';
import {readStudy,atPointer,evidenceReader,label} from './study-evidence.mjs';

import {finitePair,spatialReactions} from './spatial-elevation.mjs';

const gravity=9.80665;
const positive=v=>Number.isFinite(v)&&v>0;
function requireInput(condition,message){if(!condition)throw Error(message);}
function observed(ref,read){return atPointer(read(ref),ref.pointer);}
function status(checks){
  return checks.includes('fail')?'fail':checks.length===0||checks.includes('open')?'open':'pass';
}
function pathCheck(stage,loadN,factor,mode) {
  requireInput(label(stage.id)&&['actuator','lock','transmission','member','anchor'].includes(stage.kind),
    'Unknown load path component.');
  const ratio=stage.advantage, efficiency=stage.efficiency;
  requireInput(positive(ratio)&&positive(efficiency)&&efficiency<=1,'Declare component mechanical advantage and efficiency.');
  const designDemandN=loadN*factor/(ratio*efficiency);
  const capacity=stage.ratings?.[mode];
  if(!capacity) return {id:stage.id,designDemandN,status:'open',reason:'Missing '+mode+' rating.'};
  requireInput(label(capacity.basis) && ['N','Nm'].includes(capacity.unit)&&Number.isFinite(capacity.value)&&capacity.value>=0,
    'Capacity needs rating basis, unit and nonnegative working value.');
  const applicable=['working-load','allowable-model','holding'].includes(capacity.kind) && (capacity.kind!=='holding'||mode!=='raise') &&
    (stage.loading==='torque'?capacity.unit==='Nm':capacity.unit==='N') &&
    ['tension','compression','shear','torque'].includes(stage.loading) && capacity.loading===stage.loading &&
    (mode!=='power-loss'||!['actuator','lock'].includes(stage.kind)||capacity.powerState==='unpowered');
  if(!applicable)return {id:stage.id,designDemandN,status:'open',reason:'Working capacity is unqualified for this load direction, duty or power state.',basis:capacity.basis};
  const torque=capacity.unit==='Nm';
  if(torque)requireInput(positive(capacity.armM),'Torque rating requires effective lever or drum radius.');
  const demand=designDemandN*(torque?capacity.armM:1);
  return {id:stage.id,unit:capacity.unit,demand,capacity:capacity.value,basis:capacity.basis,
    margin:capacity.value-demand,status:capacity.value>=demand?'pass':'fail'};
}
function evaluateRestraint(support,momentNm,factor,mode) {
  const demandNm=Math.abs(momentNm)*factor;
  if(demandNm<1e-8)return {momentNm,demandNm,status:'pass'};
  const restraint=support.momentRestraint;
  if(!restraint)return {momentNm,demandNm,status:'fail',reason:'Unbalanced applied moment at a simple support.'};
  const members=studyRows(restraint.path??[],'moment-restraint stage',0)
    .filter(row=>!row.modes||row.modes.includes(mode));
  const missing=['member','anchor'].filter(k=>!members.some(a=>a.kind===k));
  const direction=momentNm>0?'positive':'negative';
  const checks=members.map(a=>{
    const rating=a.ratings?.[mode];
    if(!rating||rating.unit!=='Nm'||!['working-load','allowable-model','holding'].includes(rating.kind)||
        (rating.kind==='holding'&&mode==='raise')||!['both',direction].includes(rating.direction)||!Number.isFinite(rating.value)||rating.value<0||!label(rating.basis)||
        (mode==='power-loss'&&['lock','actuator'].includes(a.kind)&&rating.powerState!=='unpowered'))
      return {id:a.id,status:'open',reason:'Missing applicable installed moment capacity.'};
    return {id:a.id,demandNm,capacityNm:rating.value,marginNm:rating.value-demandNm,basis:rating.basis,status:rating.value>=demandNm?'pass':'fail'};
  });
  return {momentNm,demandNm,missing,checks,status:status([...checks.map(a=>a.status),...(missing.length?['open']:[])])};
}
function evaluateForcePaths(model,p,total,forces) {
  return model.supports.map((s,i)=>{
    const loadN=forces[i];
    if(s.id===p.unavailableSupport)return {id:s.id,loadN:0,status:'pass',availability:'removed'};
    if(total<=0 || loadN<0) return {id:s.id,loadN,status:'fail',reason:'Unilateral support lost contact.'};
    const members=studyRows(s.path??[],'load-path component',0).filter(a=>!a.modes||a.modes.includes(p.mode));
    const kinds=new Set(members.map(a=>a.kind));
    const missing=['transmission','member','anchor'].filter(k=>!kinds.has(k));
    if(!kinds.has('actuator')&&!kinds.has('lock'))missing.push('actuator or lock');
    const checks=members.map(a=>pathCheck(a,loadN,model.factor,p.mode));
    return {id:s.id,loadN,missing,checks,status:status([...checks.map(c=>c.status),...(missing.length?['open']:[])])};
  });
}

export function reviewElevation(input,read) {
  requireInput(input?.schema==='agent-frc/elevation-study@1','Expected elevation-study@1.');
  const inventory=observed(input.inventory,read);
  requireInput(Array.isArray(inventory)&&inventory.every(label)&&new Set(inventory).size===inventory.length,
    'The pinned project inventory must list distinct robot elevation mechanism IDs.');
  const mechanisms=input.mechanisms;
  requireInput(Array.isArray(mechanisms)&&mechanisms.length<=32&&new Set(mechanisms.map(m=>m.id)).size===mechanisms.length&&
    mechanisms.every(m=>inventory.includes(m.id)),'Unexpected or duplicate elevation mechanism.');
  const results=inventory.map(id=>{
    const mech=mechanisms.find(m=>m.id===id);
    if(!mech || !mech.source)return {id,status:'open',reason:'No revision-bound load model.'};
    const model=observed(mech.source,read);
    const spatial=model.geometry==='spatial-vertical-supports';
    const single=model.geometry==='single-support';
    if(!spatial&&!single&&model.geometry!=='two-simple-supports')return {id,status:'open',reason:'Supply an independent load model for this geometry.'};
    const stations=studyRows(model.supports,'support station',1,2);
    const [left,right]=stations;
    if(!spatial)requireInput(stations.length===(single?1:2)&&stations.every(s=>Number.isFinite(s.xM))&&
      (single||right.xM>left.xM),'Supply distinct, ordered support stations.');
    requireInput(positive(model.factor)&&model.factor>=1&&label(model.factorBasis),'Declare design load factor and its selection basis.');
    const qualifiedMass=['weighed','conservative-upper-bound'].includes(model.massEvidence) && label(model.massBasis);
    const poses=studyRows(model.cases??[],'load case',0);
    const cases=poses.map(p=>{
      if(p.massKg==null) return {id:p.id,mode:p.mode,status:'open',reason:'Missing loaded mass for this pose.'};
      if(spatial&&p.accelZMps2==null)return {id:p.id,mode:p.mode,status:'open',reason:'Missing vertical acceleration for this pose.'};
      requireInput(['raise','hold','power-loss'].includes(p.mode)&&positive(p.massKg)&&Number.isFinite(p.accelZMps2)&&
        (spatial||(Number.isFinite(p.cgXM)&&Number.isFinite(p.pitchMomentNm)))&&label(p.basis),'Incomplete mass, CG, acceleration or applied moment.');
      const total=p.massKg*(gravity+p.accelZMps2);
      const active=model.supports.filter(s=>s.id!==p.unavailableSupport);
      requireInput(p.unavailableSupport===undefined || active.length===model.supports.length-1,'Unrecognized unavailable support.');
      if(!active.length)return {id:p.id,mode:p.mode,status:'fail',reason:'All supports unavailable.'};
      if(spatial){
        const balance=spatialReactions(stations,p,total);
        const details={id:p.id,mode:p.mode,massKg:p.massKg,weightN:p.massKg*gravity,totalVerticalN:total,balance};
        if(!balance.loads)return {...details,status:balance.status};
        const supports=evaluateForcePaths(model,p,total,balance.loads);
        const fixed=stations.find(s=>s.id===balance.restraintSupport);
        const restraint=fixed?evaluateRestraint(fixed,balance.appliedRestraintDemandNm,model.factor,p.mode):null;
        return {...details,supports,restraint,status:status([balance.status,...supports.map(s=>s.status),...(restraint?[restraint.status]:[])])};
      }
      const singleActive=active.length===1;
      const rightLoad=singleActive?0:(total*(p.cgXM-left.xM)+p.pitchMomentNm)/(right.xM-left.xM);
      const forces=singleActive?model.supports.map(s=>s===active[0]?total:0):[total-rightLoad,rightLoad];
      const restraint=singleActive?evaluateRestraint(active[0],total*(p.cgXM-active[0].xM)+p.pitchMomentNm,model.factor,p.mode):null;
      const unsupportedMomentNm=singleActive&&!active[0].momentRestraint?restraint.momentNm:0;
      const supports=evaluateForcePaths(model,p,total,forces);
      return {id:p.id,mode:p.mode,massKg:p.massKg,weightN:p.massKg*gravity,totalVerticalN:total,unsupportedMomentNm,restraint,supports,status:status([...supports.map(s=>s.status),
        ...(restraint?[restraint.status]:[])])};
    });
    const missing=['raise','hold','power-loss'].filter(mode=>!poses.some(p=>p.mode===mode));
    if(!qualifiedMass)missing.push('measured or conservative upper bound for complete supported mass');
    if(!poses.some(p=>p.mode==='raise'&&p.accelZMps2>0))missing.push('upward acceleration');
    const offCenter=pose=>{
      if(!spatial)return Math.abs((single?left.xM:(left.xM+right.xM)/2)-pose.cgXM)>1e-9;
      if(!finitePair(pose.cgXYM)||stations.some(s=>!finitePair(s.xyM)))return false;
      const mid=left.xyM.map((value,i)=>right?(value+right.xyM[i])/2:value);
      return Math.hypot(pose.cgXYM[0]-mid[0],pose.cgXYM[1]-mid[1])>1e-9;
    };
    if(!poses.some(p=>p.asymmetric===true&&offCenter(p)))missing.push('off-center CG');
    if(!poses.some(p=>p.worstExtension===true&&label(p.basis)))missing.push('worst extension');
    return {id,source:mech.source,...(spatial?{geometry:model.geometry}:{}),massEvidence:model.massEvidence??'unknown',cases,missing,status:status([...cases.map(c=>c.status),...(missing.length?['open']:[])])};
  });
  return {schema:'agent-frc/elevation-result@1',inventory:input.inventory,mechanisms:results,status:status(results.map(r=>r.status)),
    scope:(results.some(r=>r.geometry==='spatial-vertical-supports')?'Each spatial case checks vertical force and both horizontal moments at its stated pose. Other mechanisms retain their declared scope. ':'Vertical-plane one- or two-support rigid body with specified load paths. ')+'Coverage depends on the project inventory and supplied inputs. Buckling, impact, fatigue, electrical holding and brake engagement need supporting model or rated evidence.'};
}

export function reviewThroughput(input,read,freezeSha256) {
  if(input?.schema==='agent-frc/throughput-study@2')return reviewCohort(input,read,freezeSha256);
  requireInput(!freezeSha256,'A freeze digest needs throughput-study@2.');
  requireInput(input?.schema==='agent-frc/throughput-study@1','Expected throughput-study@1.');
  const demand=observed(input.demand,read);
  requireInput(positive(demand.requiredPieces)&&Number.isSafeInteger(demand.requiredPieces)&&positive(demand.windowS)&&label(demand.basis),
    'Reference the role demand with positive pieces and a time window.');
  for(const key of ['criterionId','criterion','focalRobot','windowScope'])requireInput(label(demand[key]),'Demand must declare '+key+'.');
  const variations=new Set();
  const episodes=studyRows(input.episodes,'episode',1,256);
  const ids=new Set();
  const rows=episodes.map(e=>{
    if(!e.source)return {id:e.id,status:'open',reason:'No execution receipt.'};
    const r=observed(e.source,read);
    requireInput(label(r.runId)&&!ids.has(r.runId)&&label(r.revision)&&label(r.condition)&&label(r.criterion)&&
      ['field-rehearsal','integrated-simulation','physical'].includes(r.evidence),'Identify a unique execution, revision, outcome criterion and evidence type.');
    ids.add(r.runId);
    for(const key of ['criterionId','criterion','focalRobot','windowScope'])
      requireInput(r[key]===demand[key],'Episode disagrees with the demand '+key+'.');
    requireInput(r.variation && typeof r.variation==='object' && !Array.isArray(r.variation) &&
      Object.entries(r.variation).length>0 && Object.entries(r.variation).every(([k,v])=>
      !/^(?:id|name|caseId|runId|episodeId)$/i.test(k)&&label(k)&&(typeof v==='boolean'||Number.isFinite(v)||label(v))),'Identify the executed seed, start or disturbance in variation.');
    variations.add(JSON.stringify(Object.entries(r.variation).sort(([a],[b])=>a.localeCompare(b))));
    requireInput(Array.isArray(r.windowS)&&r.windowS.length===2&&r.windowS.every(Number.isFinite)&&r.windowS[1]>r.windowS[0]&&
      Math.abs(r.windowS[1]-r.windowS[0]-demand.windowS)<1e-8,'Each execution must cover the complete demand window.');
    const {supplied,attempts,failed,acceptedAt}=auditPieceWindow(r);
    const cycles=acceptedAt.map((t,i)=>t-(i?acceptedAt[i-1]:r.windowS[0]));
    return {id:e.id,source:e.source,runId:r.runId,revision:r.revision,condition:r.condition,criterion:r.criterion,evidence:r.evidence,
      supplied,attempts,failed,accepted:acceptedAt.length,acceptedPerSecond:acceptedAt.length/demand.windowS,
      secondsBetweenAccepted:cycles,tailWithoutAcceptanceS:r.windowS[1]-(acceptedAt.at(-1)??r.windowS[0]),
      status:acceptedAt.length>=demand.requiredPieces?'pass':'fail'};
  });
  const rates=rows.filter(r=>r.acceptedPerSecond!==undefined).map(r=>r.acceptedPerSecond).sort((a,b)=>a-b);
  const revisions=new Set(rows.filter(r=>r.revision).map(r=>r.revision));
  const evidenceTypes=new Set(rows.filter(r=>r.evidence).map(r=>r.evidence));
  requireInput(revisions.size<=1 && evidenceTypes.size<=1,'Compare repeatability on one revision and evidence type at a time.');
  const lowest=rates[0]??null;
  return {schema:'agent-frc/throughput-result@1',demand,requiredPerSecond:demand.requiredPieces/demand.windowS,
    episodes:rows,distinctVariations:0,reportedVariations:variations.size,qualifiedRuns:0,observedRuns:rates.length,passingRuns:rows.filter(r=>r.status==='pass').length,worstRate:lowest,
    p10NearestRank:rates.length?rates[Math.ceil(.10*rates.length)-1]:null,
    observedStatus:status(rows.map(r=>r.status)),status:'open',
    scope:'Legacy window, variation and actor attribution are unverified. Repeatability remains open. Observed accepted events divided by the whole declared clock, including travel, queues, misses and recovery. The lower percentile describes these runs; physical reliability requires physical evidence.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const args=process.argv.slice(2);
    const freezeFlag=args.indexOf('--freeze-sha256');
    let freeze;
    if(freezeFlag>=0){
      freeze=args[freezeFlag+1];
      requireInput(['throughput','paths'].includes(args[0])&&/^[0-9a-f]{64}$/.test(freeze),'Supply the saved cohort or lift fault plan SHA-256.');
      args.splice(freezeFlag,2);
    }
    const [mode,file,root,...extra]=args;
    const reviewers={elevation:reviewElevation,throughput:reviewThroughput,coupled:reviewCoupled,duties:reviewActuatorDuties,paths:reviewLiftPaths};
    requireInput(file&&!extra.length&&Object.hasOwn(reviewers,mode),'Usage: hardening.mjs elevation|throughput|coupled|duties|paths STUDY.json [PROJECT_ROOT] [--freeze-sha256 DIGEST]');
    const input=readStudy(file),read=evidenceReader(root??path.dirname(file));
    const result=reviewers[mode](input.value,read,freeze);
    console.log(JSON.stringify({...result,studySha256:input.sha256},null,2));
  } catch(e){console.error(e.message);process.exitCode=1;}
}
