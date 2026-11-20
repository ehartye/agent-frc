import {staticWrenchRanges} from './support-ranges.mjs';
import {atPointer,label} from './study-evidence.mjs';
import {studyRows} from './strategy-lab.mjs';

const finite=Number.isFinite;
const zero=[0,0,0];
const unknown=[null,null,null];
const add=(a,b)=>finite(a)&&finite(b)?a+b:null;
const minus=(a,b)=>finite(a)&&finite(b)?a-b:null;
const times=(a,b)=>a===0||b===0?0:finite(a)&&finite(b)?a*b:null;
const plus=(a,b)=>a.map((x,i)=>add(x,b[i]));
const diff=(a,b)=>a.map((x,i)=>minus(x,b[i]));
const cross=(a,b)=>[0,1,2].map(i=>{const j=(i+1)%3,k=(i+2)%3;return minus(times(a[j],b[k]),times(a[k],b[j]));});
const dot=(a,b)=>a.map((v,i)=>times(v,b[i])).reduce(add,0);
const norm=v=>v.every(finite)?Math.hypot(...v):null;
const verdict=checks=>checks.includes('fail')?'fail':!checks.length||checks.includes('open')?'open':'pass';
const readAt=(ref,read)=>atPointer(read(ref),ref.pointer);
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const ids=rows=>rows.map(r=>r.id).sort().join('\n');
const textIds=rows=>Array.isArray(rows)&&rows.every(label)&&new Set(rows).size===rows.length;
function numberOrUnknown(value){return finite(value)?value:null;}
function fromRaw(raw,ptr){
  if(ptr===null||ptr===undefined)return null;
  assert(typeof ptr==='string'&&ptr.startsWith('/'),'Use a JSON pointer into this native sample; inline observations cannot qualify.');
  return atPointer(raw,ptr);
}
function vector(raw,source){
  const v=Array.isArray(source)?source.map(p=>fromRaw(raw,p)):fromRaw(raw,source);
  if(v===null)return [...unknown];
  assert(Array.isArray(v)&&v.length===3,'A spatial vector needs three components; use null for an unobserved axis.');
  return v.map(numberOrUnknown);
}
function boundedResidual(v,tolerance){
  if(Math.hypot(...v.filter(finite))>tolerance)return 'fail';
  return v.every(finite)?'pass':'open';
}

function contact(raw,c,plan,target,rating,mode,duty){
  const active=fromRaw(raw,c.active),point=vector(raw,c.pointM),force=vector(raw,c.forceN);
  const normal=vector(raw,c.normal),length=norm(normal),gap=numberOrUnknown(fromRaw(raw,c.gapM));
  const mu=numberOrUnknown(fromRaw(raw,c.mu)),magnitude=norm(force);
  const unit=length>0?normal.map(v=>v/length):unknown;
  const normalN=dot(force,unit);
  const shearN=finite(normalN)?norm(diff(force,unit.map(v=>times(v,normalN)))):null;
  let admissible='open',capacity='open',marginN=null;
  if(active===false){
    admissible=boundedResidual(force,plan.forceToleranceN);
    if(gap===null&&admissible==='pass')admissible='open';
    else if(finite(gap)&&gap< -plan.gapToleranceM)admissible='fail';
    capacity=magnitude===0?'pass':'open';
  }else if(active===true){
    if(gap!==null&&(gap>plan.gapToleranceM||finite(target?.maxCompressionM)&&-gap>target.maxCompressionM+plan.gapToleranceM)||finite(normalN)&&normalN< -plan.forceToleranceN)admissible='fail';
    else if(finite(shearN)&&finite(mu)&&mu>=0&&shearN>mu*Math.max(0,normalN)+plan.forceToleranceN)admissible='fail';
    else if(gap!==null&&(gap>= -plan.gapToleranceM||finite(target?.maxCompressionM)&&label(target.compressionBasis))&&finite(normalN)&&finite(shearN)&&finite(mu)&&mu>=0)admissible='pass';
    if(rating?.kind==='allowable-resultant-envelope'&&['working-rating','verified-analysis','load-test','teaching-assumption'].includes(rating.evidence)&&(rating.evidence!=='teaching-assumption'||plan.purpose==='teaching')&&rating.unit==='N'&&rating.contact===c.id&&rating.revision===plan.revision&&
        rating.modes?.includes(mode)&&rating.duties?.includes(duty)&&(duty!=='power-loss'||['unpowered','passive'].includes(rating.powerState))&&label(rating.basis)&&finite(rating.workingN)&&rating.workingN>0&&finite(magnitude)){
      marginN=rating.workingN-plan.factor*magnitude;
      capacity=marginN>=0?'pass':'fail';
    }
  }
  return {id:c.id,active,pointM:point,forceN:force,gapM:gap,normalN,shearN,mu,magnitudeN:magnitude,
    admissibility:admissible,capacity,marginN,ratingEvidence:rating?.evidence??null};
}

function sample(def,plan,read){
  if(!def.source)return {id:def.id,status:'open',reason:'No executed contact snapshot.'};
  const raw=readAt(def.source,read),map=def.map;
  assert(map&&Array.isArray(map.contacts)&&Array.isArray(map.loads),'Declare native observation pointers and complete contact and applied-load rosters.');
  const contacts=studyRows(map.contacts,'contact',0,128),loads=studyRows(map.loads,'applied load',0,128);
  const rosterMatches=ids(contacts)===ids(plan.contacts)&&ids(loads)===ids(plan.loads);
  const meta=fromRaw(raw,map.identity),settings=fromRaw(raw,map.settings);
  const mode=meta?.mode,runId=meta?.runId;
  const identified=meta?.caseId===def.id&&meta?.body===plan.body&&meta?.revision===plan.revision&&meta?.frame===plan.frame&&meta.units==='m,N,Nm,s'&&
    ['static','dynamic'].includes(mode)&&label(runId)&&finite(meta.timeS)&&textIds(meta.contactIds)&&textIds(meta.loadIds)&&
    [...meta.contactIds].sort().join('\n')===ids(contacts)&&[...meta.loadIds].sort().join('\n')===ids(loads);
  const bodyChannels=['settings',...(plan.scope==='whole-body'?['massKg','cgM','gravityMps2']:[]),...(mode==='dynamic'?['cgM','inertialForceN','angularMomentumRateAtCgNm']:[])];
  const boundBody=bodyChannels.every(k=>JSON.stringify(map[k]??null)===JSON.stringify(meta?.channels?.[k]??'/'+k));
  const qualified=boundBody&&identified&&['hold','raise','power-loss','structural-load'].includes(meta.duty)&&meta.duty===plan.caseDuties?.[def.id]&&['independent-contact-solver','measured-contact'].includes(meta.reactionBasis);
  const paths=new Set(),unbound=[];
  function itemRow(item,kind){
    const ptr=item.row;
    if(!label(ptr)){unbound.push(item.id);return raw;}
    assert(!paths.has(ptr),'A native load or contact observation was credited twice.');paths.add(ptr);
    const row=fromRaw(raw,ptr);
    const fields=kind==='contact-on-body'?['active','pointM','normal','forceN','gapM','mu']:['pointM','forceN','coupleNm'];
    const mapped=fields.every(k=>JSON.stringify(item[k]??null)===JSON.stringify(row?.channels?.[k]??'/'+k));
    if(row?.id!==item.id||row.kind!==kind||!mapped||kind==='external-load-on-body'&&!['prescribed-external','measured-external'].includes(row.basis))unbound.push(item.id);
    return row;
  }
  const reactions=contacts.map(c=>{
    const target=plan.contacts.find(s=>s.id===c.id);
    const rating=target?.rating&&target.rating.sha256!==def.source.sha256?readAt(target.rating,read):null;
    return contact(itemRow(c,'contact-on-body'),c,plan,target,rating,mode,meta?.duty);
  });
  const applied=[];
  let netForce=[...zero],netMoment=[...zero];
  function apply(point,force,couple,bounds){
    applied.push({point,force,couple,bounds});
    netForce=plus(netForce,force);
    netMoment=plus(netMoment,plus(cross(diff(point,plan.originM),force),couple));
  }
  for(const [i,c] of reactions.entries()){
    const rawContact=contacts[i].row?fromRaw(raw,contacts[i].row):null;
    apply(c.pointM,c.forceN,zero,rawContact?.admissibleBounds);
  }
  for(const load of loads){
    const row=itemRow(load,'external-load-on-body');
    apply(vector(row,load.pointM),vector(row,load.forceN),vector(row,load.coupleNm));
  }
  const mass=numberOrUnknown(fromRaw(raw,map.massKg)),cg=vector(raw,map.cgM),gravity=vector(raw,map.gravityMps2);
  if(plan.scope==='whole-body')apply(cg,gravity.map(v=>times(mass!==null&&mass>0?mass:null,v)),zero);
  const inertialF=mode==='static'?zero:vector(raw,map.inertialForceN);
  const inertialAtCg=mode==='static'?zero:vector(raw,map.angularMomentumRateAtCgNm);
  const inertialM=plus(cross(diff(cg,plan.originM),inertialF),inertialAtCg);
  const residualForceN=diff(netForce,inertialF),residualMomentNm=diff(netMoment,inertialM);
  // When motion is unobserved retain the static demand as a diagnostic without certifying equilibrium.
  const bounds=mode==='static'?staticWrenchRanges(applied,plan.originM,plan.forceToleranceN,plan.momentToleranceNm):null;
  const balance=bounds?.disposition==='excludes-static-balance'?'fail':verdict([boundedResidual(residualForceN,plan.forceToleranceN),boundedResidual(residualMomentNm,plan.momentToleranceNm)]);
  const admissibility=verdict(reactions.map(c=>c.admissibility)),capacity=verdict(reactions.map(c=>c.capacity));
  const issues=[];
  if(unbound.length)issues.push('Unbound native row identity or force action: '+unbound.join(', '));
  if(!qualified)issues.push('The raw execution does not authenticate the case, run, revision, body, frame, clock, reaction origin and contact/load roster.');
  if(!rosterMatches)issues.push('The submitted contact or applied-load roster differs from the planned physical boundary.');
  if(plan.scope==='whole-body'&&(!['modeled','measured','conservative-upper-bound'].includes(meta?.massEvidence)||!label(meta?.massBasis)))
    issues.push('Identify the mass evidence for the supported body.');
  if(plan.scope==='whole-body'&&(!(mass>0)||!finite(norm(gravity))||norm(gravity)===0||!cg.every(finite)))
    issues.push('Whole-body mass, gravity or CG is absent.');
  const metrics=Object.fromEntries(Object.entries(map.metrics??{}).map(([id,p])=>[id,numberOrUnknown(fromRaw(raw,p))]));
  const metricUnits=Object.fromEntries(Object.entries(map.metrics??{}).filter(([id,p])=>
    identified&&map.settings===(meta?.channels?.settings??'/settings')&&['independent-contact-solver','measured-contact','project-response'].includes(meta.reactionBasis)&&meta.metrics?.[id]?.pointer===p&&label(meta.metrics[id].unit))
    .map(([id])=>[id,meta.metrics[id].unit]));
  return {id:def.id,source:def.source,runId,metricUnits,timeS:meta?.timeS,mode,duty:meta?.duty,reactionBasis:meta?.reactionBasis,massEvidence:meta?.massEvidence,settings,metrics,massKg:mass,cgM:cg,
    netForceN:netForce,netMomentNm:netMoment,residualForceN,residualMomentNm,reactions,
    balance,staticEnclosure:bounds,admissibility,capacity,issues,status:issues.length?'open':verdict([balance,admissibility,capacity])};
}

function comparison(c,rows){
  assert(['sensitivity','resolution'].includes(c.kind)&&label(c.parameter)&&label(c.metric)&&label(c.unit)&&label(c.basis)&&
    textIds(c.cases)&&c.cases.length>=(c.kind==='resolution'?3:2),'Identify one parameter, response, unit and complete comparison roster.');
  const cases=c.cases.map(id=>rows.find(r=>r.id===id)),first=cases[0];
  const controls=r=>JSON.stringify(Object.entries(r.settings).filter(([k])=>k!==c.parameter).sort(([a],[b])=>a.localeCompare(b)));
  if(cases.some(r=>!r||!r.settings||!Object.values(r.settings).every(v=>finite(v)||label(v)||typeof v==='boolean')||r.metricUnits?.[c.metric]!==c.unit||!label(r.runId)||!finite(r.metrics[c.metric])||
    r.timeS!==first.timeS||r.duty!==first.duty||r.mode!==first.mode||!Object.hasOwn(r.settings,c.parameter)||controls(r)!==controls(first))||
    new Set(cases.map(r=>r.runId)).size!==cases.length)
    return {id:c.id,status:'open',reason:'Need matched native settings, revision, assessment time, run identities and response.'};
  const values=cases.map(r=>({case:r.id,parameter:r.settings[c.parameter],response:r.metrics[c.metric]}));
  if(new Set(values.map(v=>v.parameter)).size!==values.length||new Set(values.map(v=>typeof v.parameter)).size!==1)
    return {id:c.id,status:'open',reason:'The swept input values must be distinct and use one type.'};
  const spread=Math.max(...values.map(v=>v.response))-Math.min(...values.map(v=>v.response));
  if(c.maximum!==undefined){
    assert(finite(c.maximum)&&label(c.limitBasis),'Identify the response screen and engineering basis.');
    for(const v of values)v.screen=v.response<=c.maximum?'within-maximum':'exceeds-maximum';
  }
  let status='observed';
  if(c.kind==='resolution'){
    assert(finite(c.maxSpread)&&c.maxSpread>=0,'Specify a numerical spread for the stated resolution observable.');
    if(values.some((v,i)=>!finite(v.parameter)||v.parameter<=0||i&&v.parameter>=values[i-1].parameter))status='open';
    else status=spread<=c.maxSpread?'within-declared-spread':'outside-declared-spread';
  }
  return {id:c.id,status,parameter:c.parameter,metric:c.metric,unit:c.unit,values,spread};
}

export function reviewCoupled(study,read){
  assert(study?.schema==='agent-frc/coupled-support-study@1','Expected coupled-support-study@1.');
  const p=readAt(study.plan,read);
  assert(label(p.body)&&label(p.revision)&&label(p.frame)&&['whole-body','incremental'].includes(p.scope)&&
    Array.isArray(p.originM)&&p.originM.length===3&&p.originM.every(finite)&&label(p.toleranceBasis)&&
    [p.forceToleranceN,p.momentToleranceNm,p.gapToleranceM].every(v=>finite(v)&&v>=0)&&finite(p.factor)&&p.factor>=1,
    'Declare one body, revision, right-handed frame, moment origin, factor and justified tolerances.');
  studyRows(p.contacts,'planned contact',1,128);studyRows(p.loads,'planned applied load',0,128);
  const cases=studyRows(study.cases,'executed case',0,256);
  assert(textIds(p.caseIds)&&p.caseIds.length&&cases.every(c=>p.caseIds.includes(c.id)),'Declare every expected case in the plan.');
  const used=new Set(),rows=p.caseIds.map(id=>{
    const c=cases.find(row=>row.id===id)??{id};
    if(c.source){const key=c.source.sha256+'#'+c.source.pointer;if(used.has(key))return {id,status:'open',reason:'Native snapshot was reused.'};used.add(key);}
    try{return sample(c,p,read);}catch(e){return {id,status:'open',reason:e.message};}
  });
  const runs=new Set();
  for(const r of rows){
    if(!label(r.runId))continue;
    if(runs.has(r.runId)){r.status='open';r.issues.push('Native run identity reused.');}
    runs.add(r.runId);
  }
  const comparisons=(p.comparisons??[]).map(c=>comparison(c,rows));
  const comparisonChecks=comparisons.map(c=>['open','outside-declared-spread'].includes(c.status)?'open':'pass');
  return {schema:'agent-frc/coupled-support-result@1',plan:study.plan,body:p.body,scope:p.scope,originM:p.originM,
    cases:rows,comparisons,status:verdict([...rows.map(r=>r.status),...comparisonChecks]),
    limits:'One sampled free body and registered point contacts. A balanced pose and rated contact envelope do not establish upstream structure, life, full-motion clearance or hardware readiness. An incremental wrench omits the base load.'};
}
