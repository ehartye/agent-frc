import {atPointer,label} from './study-evidence.mjs';
import {studyRows} from './strategy-lab.mjs';

const finite=Number.isFinite;
const positive=v=>finite(v)&&v>0;
const nonnegative=v=>finite(v)&&v>=0;
const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=1e-9;
const readAt=(ref,read)=>atPointer(read(ref),ref.pointer);
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const open=reason=>({status:'open',reason});
const verdict=states=>states.includes('fail')?'fail':states.length&&states.every(s=>s==='pass')?'pass':'open';
const sameSettings=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&
  Object.entries(a).every(([k,v])=>(finite(v)||label(v)||typeof v==='boolean')&&Object.hasOwn(b,k)&&b[k]===v);
const interval=(lo,hi)=>finite(lo)&&finite(hi)&&lo<=hi;

function optionalRecord(ref,read){
  if(!ref)return null;
  try{return readAt(ref,read);}catch{return null;}
}
const minimum=(rows,key)=>rows.reduce((m,r)=>Math.min(m,r[key]),Infinity);
const maximum=(rows,key)=>rows.reduce((m,r)=>Math.max(m,r[key]),-Infinity);

function identity(r,plan,arch,c,sha,duty){
  const i=r?.identity;
  check(i?.planSha256===sha&&i.architecture===arch.id&&i.revision===arch.revision&&i.output===arch.output&&
    i.caseId===c.id&&i.startId===c.startId&&sameSettings(i.settings,c.settings)&&i.duty===duty&&label(i.runId)&&
    i.evidence===plan.evidence,'The native execution must match the freeze, architecture, revision, output, start and conditions.');
}
function observed(edge,kind){return edge?.kind===kind&&finite(edge.timeS)&&label(edge.witness);}
function continuous(rows,start,end,validate){
  if(!Array.isArray(rows)||!rows.length||rows.length>100000||rows.some((r,i)=>
    !r||!finite(r.fromS)||!finite(r.toS)||r.toS<=r.fromS||i&&r.fromS<rows[i-1].toS-1e-9))return null;
  // A partly overlapping aggregate cannot locate its extremum within the requested interval.
  const chosen=rows.filter(r=>r&&r.fromS<end-1e-9&&r.toS>start+1e-9);
  if(!chosen.length)return null;
  let t=start;
  for(const r of chosen){
    if(!close(r.fromS,t)||!finite(r.toS)||r.toS<=r.fromS||r.toS>end+1e-9||!validate(r))return null;
    t=r.toS;
  }
  return close(t,end)?chosen:null;
}
function coverageBasis(native,evidence){
  return label(native.coverageBasis)&&(evidence==='integrated-simulation'?native.coverage==='every-native-step':
    native.coverage==='bandwidth-bounded-measurement');
}
function validMotionInterval(r){
  return interval(r.minStrokeM,r.maxStrokeM)&&interval(r.minClearanceM,r.maxClearanceM)&&label(r.witness);
}
function motion(native,plan,arch,read,ref){
  const {normal,hold}=plan,begin=native.start,cut=native.cut;
  if(!observed(begin,'drive-powered')||!observed(cut,'drive-supply-removed')||cut.timeS<=begin.timeS)
    return {normal:open('Missing native power-on or cutoff witness.'),hold:open('No verified removal of drive power.')};
  const deadline=begin.timeS+normal.deadlineS,end=Math.min(deadline,cut.timeS);
  const qualify=p=>finite(p.timeS)&&p.timeS>=begin.timeS&&p.timeS<=end&&p.powered===true&&p.loadRetained===true&&
    finite(p.strokeM)&&p.strokeM>=normal.minStrokeM&&finite(p.clearanceM)&&p.clearanceM>=normal.minClearanceM&&label(p.witness);
  const reached=native.positions?.find(qualify);
  const allSteps=coverageBasis(native,plan.evidence);
  const before=allSteps&&continuous(native.intervals,begin.timeS,end,r=>validMotionInterval(r)&&r.powered===true);
  const normalResult=reached?{status:'pass',reachedAtS:reached.timeS,strokeM:reached.strokeM,clearanceM:reached.clearanceM}:
    before&&before.every(r=>r.maxStrokeM<normal.minStrokeM||r.maxClearanceM<normal.minClearanceM)?
      {status:'fail',reason:'The complete powered observation excludes the target.'}:open('No simultaneous powered stroke and clearance witness.');
  const finish=cut.timeS+hold.durationS;
  const segments=allSteps&&continuous(native.intervals,cut.timeS,finish,r=>validMotionInterval(r)&&r.powered===false&&typeof r.loadRetained==='boolean');
  const drop=native.positions?.find(p=>finite(p.timeS)&&p.timeS>=cut.timeS&&p.timeS<=finish&&p.powered===false&&label(p.witness)&&
    ((finite(p.strokeM)&&p.strokeM<hold.minStrokeM)||(finite(p.clearanceM)&&p.clearanceM<hold.minClearanceM)||p.loadRetained===false));
  const kinematics=drop?'fail':!segments?'open':
    segments.every(r=>r.loadRetained&&r.minStrokeM>=hold.minStrokeM&&r.minClearanceM>=hold.minClearanceM)?'pass':'fail';
  const h=native.holder;
  const engagement=arch.holder&&h?.id===arch.holder&&['observed-passive-brake','observed-passive-load-path'].includes(h.kind)&&
    h.powered===false&&finite(h.engagedAtS)&&h.engagedAtS>=begin.timeS&&h.engagedAtS<finish&&label(h.witness)&&
    segments&&segments.filter(r=>r.toS>h.engagedAtS).every(r=>r.holderId===h.id&&r.holderEngaged===true)?'pass':'open';
  const rating=arch.holdingAllowable&&arch.holdingAllowable.sha256!==ref.sha256?optionalRecord(arch.holdingAllowable,read):null;
  let capacity='open';
  if(segments&&rating?.kind==='approved-unpowered-hold-envelope'&&rating.device===arch.holder&&rating.architecture===arch.id&&
    rating.output===arch.output&&rating.revision===arch.revision&&rating.unit==='N'&&rating.powerState==='unpowered'&&
    rating.scope==='complete-installed-load-path'&&positive(rating.durationS)&&rating.durationS>=hold.durationS&&positive(rating.positiveN)&&positive(rating.negativeN)&&
    label(rating.basis)&&applicableRating(rating,plan)&&segments.every(r=>interval(r.minHoldForceN,r.maxHoldForceN))){
    capacity=segments.every(r=>plan.factor*r.maxHoldForceN<=rating.positiveN&&-plan.factor*r.minHoldForceN<=rating.negativeN)?'pass':'fail';
  }

  return {normal:normalResult,hold:{status:verdict([kinematics,engagement,...(capacity==='fail'?['fail']:[])]),kinematics,engagement,capacity,fromS:cut.timeS,toS:finish,
    witnessedLossAtS:drop?.timeS??null,minStrokeM:segments?minimum(segments,'minStrokeM'):null,
    minClearanceM:segments?minimum(segments,'minClearanceM'):null,
    reason:!segments?'Need uninterrupted loaded, de-energized interval extrema through the frozen horizon.':null}};
}

function applicableRating(r,plan){
  return ['application-approved-rating','validated-analysis','qualified-load-test'].includes(r.evidence)||
    r.evidence==='teaching-assumption'&&plan.purpose==='teaching';
}
function rated(arch,nativeRef,read){
  if(!arch.allowable||arch.allowable.sha256===nativeRef.sha256)return null;
  const r=optionalRecord(arch.allowable,read);
  return r?.kind==='approved-service-envelope'&&r.architecture===arch.id&&r.revision===arch.revision&&r.output===arch.output&&
    r.duty==='powered-obstruction'&&r.unit==='N'&&r.scope==='complete-installed-load-path'&&label(r.basis)&&
    ['application-approved-rating','validated-analysis','qualified-load-test','teaching-assumption'].includes(r.evidence)&&
    positive(r.positiveN)&&positive(r.negativeN)&&positive(r.durationS)?r:null;
}
function envelope(native,arch,ref,plan,read){
  const e=native.envelope;
  if(!e||!finite(e.maxAbsTorqueNm)||e.maxAbsTorqueNm<0||!e.transfer)return open('Missing a branch-specific torque and force conversion.');
  const t=optionalRecord(e.transfer,read);
  if(e.transfer.sha256===ref.sha256||t?.kind!=='torque-to-branch-force-upper-bound'||t.revision!==arch.revision||t.output!==arch.output||
    !label(t.inputShaft)||t.inputShaft!==e.inputShaft||!positive(t.maxNPerNm)||!label(t.frictionBasis)||
    !label(t.allocationBasis)||!label(t.transmissionBasis)||!label(t.directionBasis))return open('Unbound torque, signed branch or transmission conversion.');
  const staticAbsN=e.maxAbsTorqueNm*t.maxNPerNm;
  const total=nonnegative(e.additionalPeakN)?staticAbsN+e.additionalPeakN:null;
  const proof=e.qualification&&![ref.sha256,e.transfer.sha256,arch.allowable?.sha256].includes(e.qualification.sha256)?optionalRecord(e.qualification,read):null;
  const qualified=proof?.kind==='qualified-blocked-torque-bound'&&proof.architecture===arch.id&&proof.revision===arch.revision&&
    proof.output===arch.output&&proof.caseId===native.identity.caseId&&proof.startId===native.identity.startId&&
    sameSettings(proof.settings,native.identity.settings)&&proof.inputShaft===e.inputShaft&&proof.maxAbsTorqueNm===e.maxAbsTorqueNm&&
    Array.isArray(proof.coveredPositionM)&&proof.coveredPositionM.length===2&&interval(...proof.coveredPositionM)&&
    proof.coveredPositionM[0]<=plan.obstruction.positionM[0]&&proof.coveredPositionM[1]>=plan.obstruction.positionM[1]&&
    proof.additionalPeakN===e.additionalPeakN&&proof.transferSha256===e.transfer.sha256&&proof.transferPointer===e.transfer.pointer&&
    finite(proof.validDurationS)&&proof.validDurationS>=plan.obstruction.windowS&&label(proof.dynamicBasis)&&label(proof.operatingConditions)&&
    proof.evidence===plan.evidence&&total!==null;
  return {status:qualified?'pass':'open',staticAbsN,maxAbsN:total,kind:'torque-envelope',
    reason:qualified?null:'The torque, allocation and transient allowance are a conditional screen.'};
}
function obstruction(r,plan,arch,ref,read){
  const spec=plan.obstruction,jam=r.blocked;
  const hasJam=observed(jam,'powered-output-blocked')&&jam.output===arch.output&&jam.powered===true&&
    finite(jam.positionM)&&jam.positionM>=spec.positionM[0]&&jam.positionM<=spec.positionM[1];
  const finish=hasJam?jam.timeS+spec.windowS:null;
  const samples=hasJam&&coverageBasis(r,plan.evidence)&&continuous(r.intervals,jam.timeS,finish,s=>
    s.output===arch.output&&s.blocked===true&&typeof s.drivePowered==='boolean'&&interval(s.minForceN,s.maxForceN)&&label(s.witness));
  const forceSamples=samples&&samples[0].drivePowered===true?samples:null;
  const candidate=forceSamples?{status:'pass',kind:'recorded-branch-force',minN:minimum(samples,'minForceN'),
    maxN:maximum(samples,'maxForceN')}:envelope(r,arch,ref,plan,read);
  const action=r.protection;
  const eventBound=hasJam&&action?.device===arch.protector&&label(arch.protector)&&
    ['observed-controller-action','observed-mechanical-release'].includes(action.kind)&&label(action.triggerWitness)&&
    label(action.actionWitness)&&finite(action.triggerS)&&finite(action.appliedS)&&action.triggerS>=jam.timeS&&action.appliedS>=action.triggerS&&
    action.appliedS+spec.postActionS<=finish+1e-9;
  const after=eventBound&&forceSamples?.filter?.(s=>s.fromS>=action.appliedS-1e-9&&s.fromS<action.appliedS+spec.postActionS-1e-9);
  const before=eventBound&&forceSamples?.find?.(s=>close(s.toS,action.appliedS));
  const transitioned=before&&before.device===arch.protector&&
    (action.effect==='drive-disabled'?before.drivePowered===true:before.limiting===false);
  const tripWitness=eventBound&&forceSamples?.find?.(s=>close(s.toS,action.triggerS));
  const tripBound=arch.tripRangeN&&tripWitness&&finite(action.axialTripN)&&
    action.axialTripN>=arch.tripRangeN[0]&&action.axialTripN<=arch.tripRangeN[1]&&
    (interval(tripWitness.minForceN,action.axialTripN)&&interval(action.axialTripN,tripWitness.maxForceN)||
     interval(tripWitness.minForceN,-action.axialTripN)&&interval(-action.axialTripN,tripWitness.maxForceN));
  const acted=eventBound&&transitioned&&(!arch.tripRangeN||tripBound)&&after?.length&&close(after[0].fromS,action.appliedS)&&after.every(s=>s.device===arch.protector&&
    (action.effect==='drive-disabled'?s.drivePowered===false&&s.effectSource==='native-output-state':
      action.effect==='slip-or-force-limiting'&&s.limiting===true&&s.effectSource==='native-transmission-response'));
  const actionStatus=acted?'pass':arch.protectionRequirement==='intrinsic-bound'&&candidate.kind==='torque-envelope'&&candidate.status==='pass'?'not-required':'open';
  const approved=rated(arch,ref,read);
  const relevant=approved&&applicableRating(approved,plan)&&approved.durationS>=spec.windowS;
  let capacity='open',marginN=null;
  if(relevant&&candidate.status==='pass'){
    if(forceSamples){
      marginN=Math.min(approved.positiveN-plan.factor*Math.max(0,candidate.maxN),
        approved.negativeN-plan.factor*Math.max(0,-candidate.minN));
      capacity=marginN>=0?'pass':'fail';
    }else{
      marginN=Math.min(approved.positiveN,approved.negativeN)-plan.factor*candidate.maxAbsN;
      // An upper bound above the allowable does not prove the load reached it.
      capacity=marginN>=0?'pass':'open';
    }
  }
  return {status:verdict([candidate.status,capacity,actionStatus==='not-required'?'pass':actionStatus]),
    demand:candidate,capacity,marginN,action:actionStatus,declaredProtection:action?.kind??null,blockedAtS:hasJam?jam.timeS:null,
    triggerAtS:acted?action.triggerS:null,appliedAtS:acted?action.appliedS:null,responseDelayS:acted?action.appliedS-action.triggerS:null,
    overshootAboveTripN:forceSamples&&acted&&tripBound?Math.max(0,Math.max(candidate.maxN,-candidate.minN)-action.axialTripN):null};
}

export function reviewActuatorDuties(study,read){
  check(study?.schema==='agent-frc/actuator-duty-study@1'&&study.plan?.pointer===''&&/^[0-9a-f]{64}$/.test(study.plan.sha256),'Pin the complete three-duty plan.');
  const p=readAt(study.plan,read),architectures=studyRows(p.architectures,'architecture',1,24),cases=studyRows(p.cases,'condition',1,64);
  check(p.schema==='agent-frc/actuator-duty-plan@1'&&['integrated-simulation','physical'].includes(p.evidence)&&
    [p.normal?.minStrokeM,p.normal?.minClearanceM,p.hold?.minStrokeM,p.hold?.minClearanceM].every(finite)&&
    [p.normal?.deadlineS,p.hold?.durationS,p.obstruction?.windowS,p.obstruction?.postActionS].every(positive)&&
    p.obstruction.postActionS<=p.obstruction.windowS&&Array.isArray(p.obstruction.positionM)&&p.obstruction.positionM.length===2&&
    interval(...p.obstruction.positionM)&&finite(p.factor)&&p.factor>=1&&label(p.basis),'Freeze finite travel, clearance, jam location, durations and load factor.');
  check(architectures.every(a=>label(a.revision)&&label(a.output)&&(!a.tripRangeN||Array.isArray(a.tripRangeN)&&a.tripRangeN.length===2&&nonnegative(a.tripRangeN[0])&&interval(...a.tripRangeN))&&['demonstrate-action','intrinsic-bound'].includes(a.protectionRequirement))&&
    cases.every(c=>label(c.startId)&&c.settings&&Object.keys(c.settings).length&&sameSettings(c.settings,c.settings)),'Identify architectures, output branches, starts and typed conditions.');
  const entries=studyRows(study.entries,'journal entry',0,1536),key=(a,c)=>JSON.stringify([a,c]),lookup=new Map(),used=new Set();
  for(const e of entries){
    const k=key(e.architecture,e.caseId);
    check(!lookup.has(k)&&architectures.some(a=>a.id===e.architecture)&&cases.some(c=>c.id===e.caseId),'Unknown or duplicate frozen architecture/condition.');
    lookup.set(k,e);
  }
  const rows=[];
  for(const a of architectures)for(const c of cases){
    const e=lookup.get(key(a.id,c.id));
    if(a.applicability){
      const inventory=optionalRecord(a.applicability,read);
      if(inventory?.kind==='installed-mechanism-inventory'&&inventory.architecture===a.id&&inventory.revision===a.revision&&
        inventory.output===a.output&&inventory.hasPoweredActuator===false&&inventory.hasHoldingDuty===false&&label(inventory.basis)){
        rows.push({architecture:a.id,caseId:c.id,status:'not-applicable',inventory:a.applicability,reason:inventory.basis});continue;
      }
    }
    function get(ref,duty,fn){
      if(!ref)return open('No native '+duty+' receipt.');
      try{
        const native=readAt(ref,read);identity(native,p,a,c,study.plan.sha256,duty);
        const id=native.identity.runId;if(used.has(id))return open('Native execution ID reused.');
        used.add(id);return fn(native);
      }catch(err){return open(err.message);}
    }
    const run=get(e?.motion,'powered-motion-and-loss',r=>motion(r,p,a,read,e.motion));
    const jam=get(e?.obstruction,'powered-obstruction',r=>obstruction(r,p,a,e.obstruction,read));
    const normal=run.normal??run,hold=run.hold??run;
    rows.push({architecture:a.id,caseId:c.id,motionSource:e?.motion,obstructionSource:e?.obstruction,normal,hold,obstruction:jam,
      status:verdict([normal.status,jam.status,hold.status]),
      installedStatus:p.evidence==='physical'?verdict([normal.status,jam.status,hold.status,hold.capacity??'open']):'open'});
  }
  return {schema:'agent-frc/actuator-duty-result@1',plan:study.plan,evidence:p.evidence,rows,status:verdict(rows.filter(r=>r.status!=='not-applicable').map(r=>r.status)),
    limits:'The verdict covers the registered revision, branch and observed conditions. A modeled trip or passive hold does not qualify installed hardware. A basic static catalog value is not an approved service envelope.'};
}
