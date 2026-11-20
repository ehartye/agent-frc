import {atPointer,label} from './study-evidence.mjs';
import {studyRows} from './strategy-lab.mjs';
import {checkRoleInventory,deriveRoleDemand} from './role-handoff.mjs';
import {auditPieceWindow} from './piece-window.mjs';

function check(ok,message){if(!ok)throw Error(message);}
const open=reason=>({status:'open',reason});
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
const readAt=(ref,read)=>atPointer(read(ref),ref.pointer);
const supportedEvidence=['timing-model','field-rehearsal','integrated-simulation','physical'];

function readDemand(ref,read){
  const source=readAt(ref,read);
  if(source.schema==='agent-frc/role-selection@1'){
    const role=deriveRoleDemand(source,read),d=role.identity;
    return {criterionId:role.contractKey,criterion:d.criterion,focalRobot:d.focalRobot,outcome:d.outcome,station:d.station,
      requiredPieces:role.requiredPieces,windowS:d.windowS[1]-d.windowS[0],
      anchor:{basis:'phase-start',phase:d.phase,offsetS:d.windowS[0]},basis:role.scope,role:d.role,context:d.context,roleDemand:role};
  }
  return source;
}

function declaredValue(axis,value){
  if(axis.type==='number')return Number.isFinite(value);
  if(axis.type==='boolean')return typeof value==='boolean';
  return axis.choices.includes(value);
}

function validateFreeze(cohort,demand,read){
  check(cohort.schema==='agent-frc/throughput-cohort@1'&&label(cohort.revision)&&supportedEvidence.includes(cohort.evidence)&&
    ['characterization','refinement'].includes(cohort.purpose),'Declare the frozen revision, evidence class and cohort purpose.');
  check(Number.isSafeInteger(demand.requiredPieces)&&demand.requiredPieces>=0&&demand.windowS>0&&Number.isFinite(demand.windowS)&&
    ['criterionId','criterion','focalRobot','station','basis'].every(k=>label(demand[k]))&&['acquired','credited'].includes(demand.outcome),
    'Freeze the count, duration, focal robot, station and observed outcome before running.');
  const anchor=demand.anchor;
  check(anchor&&['match-start','phase-start'].includes(anchor.basis)&&Number.isFinite(anchor.offsetS)&&anchor.offsetS>=0&&
    (anchor.basis==='phase-start'?label(anchor.phase):anchor.phase===undefined),'Specify the match-start or named phase-start and nonnegative window offset.');
  const axes=studyRows(cohort.axes,'parameter',1,24);
  for(const a of axes){
    check(label(a.unit)&&label(a.nativePointer)&&a.nativePointer.startsWith('/initial/')&&
      ![a.id,a.nativePointer.split('/').at(-1)].some(k=>/^(?:id|name|caseId|runId|episodeId)$/i.test(k))&&
      (['number','boolean'].includes(a.type)||(a.type==='enum'&&Array.isArray(a.choices)&&a.choices.every(label)&&new Set(a.choices).size===a.choices.length&&a.choices.length>=2)),
      'Each axis needs a typed physical or execution parameter and its native initial-state pointer.');
  }
  check(new Set(axes.map(a=>a.nativePointer)).size===axes.length,'Each axis needs a different native parameter.');
  const cases=studyRows(cohort.cases,'frozen case',2,256),settings=new Map();
  for(const c of cases){
    check(['evaluation','held-out'].includes(c.partition)&&c.parameters&&Object.keys(c.parameters).length===axes.length&&
      axes.every(a=>Object.hasOwn(c.parameters,a.id)&&declaredValue(a,c.parameters[a.id])),'Frozen case has missing or mistyped parameters.');
    const key=JSON.stringify(axes.map(a=>c.parameters[a.id]));
    check(!settings.has(key)||settings.get(key)===c.partition,'A held-out setting is reused in evaluation.');
    settings.set(key,c.partition);
  }
  check(cases.some(c=>c.partition==='evaluation')&&(cohort.purpose!=='refinement'||cases.some(c=>c.partition==='held-out')),
    'A refinement needs both the original evaluation settings and a distinct held-out setting.');
  if(cohort.purpose==='refinement'){
    check(cohort.baseline?.pointer===''&&/^[0-9a-f]{64}$/.test(cohort.baseline.sha256),'Pin the original cohort for a refinement.');
    const original=readAt(cohort.baseline,read);
    const sameAxes=original.axes?.length===axes.length&&axes.every(a=>original.axes.some(b=>
      b.id===a.id&&b.type===a.type&&b.unit===a.unit&&b.nativePointer===a.nativePointer&&
      (a.type!=='enum'||JSON.stringify(a.choices)===JSON.stringify(b.choices))));
    check(original.schema===cohort.schema&&original.evidence===cohort.evidence&&original.demand?.sha256===cohort.demand.sha256&&
      original.demand?.pointer===cohort.demand.pointer&&sameAxes,'Baseline and refinement must use the same demand, evidence class and parameter axes.');
    const previous=studyRows(original.cases,'original case',2,256),evaluation=cases.filter(c=>c.partition==='evaluation');
    check(evaluation.length===previous.length&&previous.every(p=>evaluation.some(c=>c.id===p.id&&
      axes.every(a=>p.parameters?.[a.id]===c.parameters[a.id]))),'Refinement must replay the entire original roster and parameter settings.');
  }
}

function actualWindow(r,demand){
  const {basis,offsetS,phase}=demand.anchor;
  const ticks=r.clock;
  if(!Array.isArray(ticks)||!ticks.length||ticks.some((t,i)=>!t||!Number.isFinite(t.timeS)||!label(t.witness)||
      (i>0&&t.timeS<ticks[i-1].timeS)))return open('Missing ordered native clock observations.');
  function edge(kind,name){
    const found=ticks.filter(t=>t.kind===kind&&(name===undefined||t.phase===name));
    return found.length===1?found[0].timeS:null;
  }
  const matchStart=edge('match-start'),matchEnd=edge('match-end');
  const start=basis==='phase-start'?edge('phase-start',phase):matchStart;
  const end=basis==='phase-start'?edge('phase-end',phase):matchEnd;
  if(![matchStart,matchEnd,start,end].every(Number.isFinite)||start<matchStart||end>matchEnd||end<=start)
    return open('Native match or named phase boundaries are absent, duplicated or out of order.');
  const expected=[start+offsetS,start+offsetS+demand.windowS];
  if(expected[1]>end+1e-8||!Array.isArray(r.windowS)||r.windowS.length!==2||expected.some((t,i)=>!close(t,r.windowS[i])))
    return open('Recorded window differs from the requested clock anchor and offsets.');
  if(expected.some(t=>!ticks.some(v=>close(v.timeS,t))))return open('Missing native observations at the opening or cutoff.');
  return {windowS:expected};
}

function assess(r,c,cohort,demand,sha){
  check(r.schema==='agent-frc/throughput-execution@1'&&label(r.runId)&&r.caseId===c.id&&r.cohortSha256===sha,
    'Native execution disagrees with the frozen case or cohort digest.');
  check(r.revision===cohort.revision&&r.evidence===cohort.evidence,'Native revision or evidence class differs from freeze.');
  check(r.criterionId===demand.criterionId&&r.criterion===demand.criterion&&r.focalRobot===demand.focalRobot,
    'Native execution disagrees with the frozen actor or outcome criterion.');
  const parameters=cohort.axes.map(a=>atPointer(r,a.nativePointer));
  check(cohort.axes.every((a,i)=>declaredValue(a,parameters[i])&&parameters[i]===c.parameters[a.id]),
    'Native execution parameters differ in value or type from the frozen case.');
  const clock=actualWindow(r,demand);
  if(clock.reason)return clock;
  if(demand.roleDemand){
    const offset=clock.windowS[0]-demand.roleDemand.identity.windowS[0];
    const issue=checkRoleInventory(r,demand.roleDemand,offset);
    if(issue)return issue;
  }
  const {supplied,failed,attempts}=auditPieceWindow(r);
  const kind=demand.outcome==='acquired'?'acquire':'accept';
  const custody=r.events.filter(e=>!['return','arrive'].includes(e.kind));
  check(custody.every(e=>e.focalRobot===demand.focalRobot),'A custody event lacks the focal robot.');
  const outcomes=r.events.filter(e=>e.kind===kind);
  check(outcomes.every(e=>label(e.station)&&label(e.witness)&&label(e.criterionId)),
    'An outcome lacks its station, observed witness or criterion ID.');
  const acceptedAt=outcomes.filter(e=>e.station===demand.station&&e.criterionId===demand.criterionId).map(e=>e.timeS);
  return {runId:r.runId,revision:r.revision,evidence:r.evidence,parameters:c.parameters,windowS:clock.windowS,
    supplied,attempts,failed,accepted:acceptedAt.length,acceptedPerSecond:acceptedAt.length/demand.windowS,
    secondsBetweenAccepted:acceptedAt.map((time,i)=>time-(i?acceptedAt[i-1]:clock.windowS[0])),
    tailWithoutAcceptanceS:clock.windowS[1]-(acceptedAt.at(-1)??clock.windowS[0]),
    status:demand.requiredPieces===0?'open':acceptedAt.length>=demand.requiredPieces?'pass':'fail'};
}

export function reviewCohort(input,read,expectedDigest){
  const ref=input.cohort;
  check(ref&&/^[a-f0-9]{64}$/.test(ref.sha256)&&ref.pointer==='','Pin the complete frozen cohort file by its SHA-256.');
  check(expectedDigest===undefined||ref.sha256===expectedDigest,'Supplied freeze digest differs from the study.');
  const cohort=readAt(ref,read),demand=readDemand(cohort.demand,read);
  validateFreeze(cohort,demand,read);
  const entries=studyRows(input.episodes,'execution entry',0,256),known=new Set(cohort.cases.map(c=>c.id));
  check(entries.every(e=>known.has(e.id)),'The journal contains a case outside the freeze.');
  const ids=new Set(),sources=new Set(),settings=new Set();
  const rows=cohort.cases.map(c=>{
    const source=entries.find(e=>e.id===c.id)?.source,base={id:c.id,partition:c.partition,source};
    if(!source)return {...base,...open('Frozen case has no execution receipt.')};
    const r=readAt(source,read),key=JSON.stringify([source.sha256,source.pointer]);
    if(sources.has(key)||ids.has(r.runId))return {...base,...open('Native execution or run ID reused.')};
    sources.add(key);ids.add(r.runId);
    try{
      const result=assess(r,c,cohort,demand,ref.sha256);
      if(result.accepted!==undefined)settings.add(JSON.stringify(cohort.axes.map(a=>c.parameters[a.id])));
      return {...base,...result};
    }catch(error){return {...base,...open(error.message)};}
  });
  const rates=rows.filter(r=>r.acceptedPerSecond!==undefined).map(r=>r.acceptedPerSecond).sort((a,b)=>a-b);
  const status=rows.some(r=>r.status==='fail')?'fail':rows.every(r=>r.status==='pass')&&settings.size>=2?'pass':'open';
  return {schema:'agent-frc/throughput-result@2',cohort:ref,evidence:cohort.evidence,revision:cohort.revision,purpose:cohort.purpose,
    independentlyCheckedFreeze:expectedDigest!==undefined,demand,requiredPerSecond:demand.requiredPieces/demand.windowS,episodes:rows,
    distinctVariations:settings.size,qualifiedRuns:rates.length,requiredRuns:rows.length,
    passingRuns:rows.filter(r=>r.status==='pass').length,worstRate:rates[0]??null,
    p10NearestRank:rates[Math.ceil(.10*rates.length)-1]??null,status,
    scope:'The verdict covers the frozen cases and stated evidence class. Native clock, parameters and attributed outcomes support these rates. Freeze chronology, model fidelity and population reliability require independent evidence.'};
}
