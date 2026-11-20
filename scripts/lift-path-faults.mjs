import {isDeepStrictEqual as equal} from 'node:util';
import {atPointer,label} from './study-evidence.mjs';
import {studyRows} from './strategy-lab.mjs';

const finite=Number.isFinite;
const positive=x=>finite(x)&&x>0;
const ids=v=>Array.isArray(v)&&v.every(label)&&new Set(v).size===v.length;
const sorted=v=>[...v].sort();
const get=(ref,read)=>atPointer(read(ref),ref.pointer);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const open=reason=>({status:'open',reason});

function validateGraph(g){
  assert(g.schema==='agent-frc/unpowered-paths@1'&&label(g.revision)&&label(g.basis)&&['complete-within-model','partial'].includes(g.scope)&&
    ids(g.nodes)&&ids(g.anchors)&&g.anchors.length&&ids(g.loads)&&g.loads.length>=1&&g.loads.length<=2&&
    [...g.anchors,...g.loads].every(n=>g.nodes.includes(n))&&g.loads.every(n=>!g.anchors.includes(n)),'Identify a downward-load graph, project scope, load stations and independent anchors.');
  assert(g.anchors.every(n=>['fixed-world','supported-frame','retained-external-contact'].includes(g.anchorEvidence?.[n]?.kind)&&
    ['modeled','unresolved'].includes(g.anchorEvidence[n].state)&&label(g.anchorEvidence[n].basis)),'Identify what supports each external anchor in this free body.');
  const components=studyRows(g.components,'load-path component',1,160);
  assert(components.every(c=>label(c.basis)),'Document the modeled installed components.');
  const f=g.faultInventory;
  assert(f&&['holders','localTransfers','shared'].every(k=>ids(f[k])&&f[k].every(id=>components.some(component=>component.id===id)))&&
    f.holders.length>=1&&f.holders.length<=2,'Identify each installed holding path, local transfer and shared failure from the project inventory.');
  for(const e of studyRows(g.edges,'directed downward load transfer',1,320)){
    assert(g.nodes.includes(e.from)&&g.nodes.includes(e.to)&&e.from!==e.to&&ids(e.requires)&&e.requires.length&&
      e.requires.every(id=>components.some(c=>c.id===id))&&label(e.basis)&&['modeled','unresolved'].includes(e.state),'Each directional link needs all its physical dependencies and an evidence basis.');
  }
  return g;
}

function route(g,from,failed,includeUnresolved){
  const todo=[{node:from,steps:[]}],visited=new Set([from]);
  for(let i=0;i<todo.length;i++){
    const here=todo[i];
    if(g.anchors.includes(here.node)&&(includeUnresolved||g.anchorEvidence[here.node].state==='modeled'))return here.steps;
    for(const e of g.edges){
      if(e.from!==here.node||visited.has(e.to)||!includeUnresolved&&e.state==='unresolved'||e.requires.some(id=>failed.has(id)))continue;
      visited.add(e.to);todo.push({node:e.to,steps:[...here.steps,e.id]});
    }
  }
  return null;
}
function connectivity(g,faults){
  return g.loads.map(load=>{
    const failed=new Set(faults),steps=route(g,load,failed,false);
    if(steps)return {load,status:'modeled-path',steps};
    const possible=route(g,load,failed,true);
    return {load,status:possible||g.scope==='partial'?'open':'disconnected',possible};
  });
}

function replay(r,p,layout,c,source,read){
  const g=layout.graph,i=r.identity;
  assert(i?.planSha256===p.sha256&&i.topologySha256===layout.source.sha256&&i.topologyPointer===layout.source.pointer&&i.topology===layout.id&&i.case===c.id&&i.revision===g.revision&&
    i.duty==='unpowered-downward-hold'&&i.evidence===p.evidence&&label(i.runId)&&equal(i.conditions,c.conditions),'The execution must match the frozen layout, duty, case and operating conditions.');
  const controls=get(r.controls,read);
  assert(r.controls.sha256!==source.sha256&&controls.runId===i.runId&&controls.revision===g.revision&&controls.case===c.id&&
    equal(controls.conditions,c.conditions)&&controls.drivePowered===false&&label(controls.basis)&&ids(controls.unavailable)&&
    equal(sorted(controls.unavailable),sorted(c.unavailable)),'Need the separately pinned applied fault and power state from this execution.');
  const intervals=controls.intervals;
  assert(Array.isArray(intervals)&&intervals.length&&intervals.length<=100000&&label(controls.coverageBasis)&&
    controls.coverage===(p.evidence==='physical'?'recorded-state-transitions':'executed-state-intervals'),
    'Require continuous original coverage of drive power and the applied fault states.');
  let boundary=controls.cutS;
  for(const span of intervals){
    assert(span.fromS===boundary&&finite(span.toS)&&span.toS>span.fromS&&span.drivePowered===false,'Gap or restored power during the fault replay.');
    const channels=atPointer(controls,span.channels);
    for(const component of g.components){
      const mapping=component.faultWitness;
      if(!mapping){assert(!c.unavailable.includes(component.id),'The cut lacks a native component-state witness: '+component.id);continue;}
      assert(label(mapping.pointer)&&Object.hasOwn(mapping,'failedValue'),'Bind each applied fault to an executed channel.');
      const value=atPointer(channels,mapping.pointer);
      assert(typeof value===typeof mapping.failedValue&&(typeof value==='boolean'||finite(value)||label(value))&&
        (value===mapping.failedValue)===c.unavailable.includes(component.id),'Executed component state differs from the declared cut: '+component.id);
    }
    boundary=span.toS;
  }
  assert(boundary===controls.observedThroughS,'The unpowered fault state must cover the entire paired record.');
  assert(g.loads.length===2,'A paired-motion replay needs two actual load stations.');
  const a=r.axes;
  assert(equal(a,g.axes)&&Array.isArray(a)&&a.length===2&&a.every((axis,k)=>axis.load===g.loads[k]&&[-1,1].includes(axis.downSign)&&finite(axis.alignedZeroMm)&&label(axis.datum))&&
    r.unit==='mm'&&finite(r.cutS)&&controls.cutS===r.cutS&&label(r.cutWitness)&&positive(r.stepS)&&controls.stepS===r.stepS&&Array.isArray(r.positions)&&r.positions.length>=2&&r.positions.length<=250001&&
    ['every-integration-step','bandwidth-bounded-paired-measurements'].includes(r.coverage)&&label(r.coverageBasis)&&
    (p.evidence==='physical'?r.coverage==='bandwidth-bounded-paired-measurements':r.coverage==='every-integration-step'),
    'Provide simultaneous axis positions from the actual power cut, with signed calibrated datums, native period and coverage.');
  const raw=(pair,k)=>(pair[k]-a[k].alignedZeroMm)*a[k].downSign;
  assert(r.positions.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(finite)),'Each original tick needs finite positions for both stations.');
  assert(equal(r.positions[0],controls.initialPositionMm),'The starting position must match the observed power-cut sample.');
  assert(controls.sampleCount===r.positions.length&&finite(controls.observedThroughS)&&
    Math.abs(controls.observedThroughS-(r.cutS+(r.positions.length-1)*r.stepS))<=1e-8,'Paired trace length differs from the native terminating clock.');
  const start=r.positions[0].map((_,k)=>raw(r.positions[0],k));
  const peaks={rackMm:0,commonDropMm:0,sideDropMm:[0,0]},first={};
  const ticks=p.durationS/r.stepS,near=Math.round(ticks);
  const exact=Math.abs(near-ticks)<1e-7;
  const n=Math.min(r.positions.length-1,exact?near:Math.floor(ticks));
  for(let j=0;j<=n;j++){
    const x=raw(r.positions[j],0),y=raw(r.positions[j],1),left=x-start[0],right=y-start[1];
    const rack=Math.abs(y-x),common=(left+right)/2,t=r.cutS+j*r.stepS;
    peaks.rackMm=Math.max(peaks.rackMm,rack);peaks.commonDropMm=Math.max(peaks.commonDropMm,common);
    peaks.sideDropMm=[Math.max(peaks.sideDropMm[0],left),Math.max(peaks.sideDropMm[1],right)];
    for(const [metric,value,limit] of [['rack',rack,p.maxRackMm],['common',common,p.maxCommonDropMm],['left',left,p.maxSideDropMm[0]],['right',right,p.maxSideDropMm[1]]]){
      if(value>=limit&&!first[metric])first[metric]={timeS:t,elapsedS:j*r.stepS,valueMm:value,limitMm:limit};
    }
  }
  const violations=Object.keys(first),complete=exact&&n===near;
  const lastAlignedMm=r.positions[n].map((_,k)=>raw(r.positions[n],k));
  return {status:violations.length?'fail':complete?'within-modeled-limits':'open',peaks,first,complete,runId:i.runId,
    lastAlignedMm,lastDisplacementMm:lastAlignedMm.map((v,k)=>v-start[k]),stepS:r.stepS,fromS:r.cutS,throughS:r.cutS+n*r.stepS,reason:!complete?'Trace ends early or the hold boundary lacks a native sample.':null};
}

export function reviewLiftPaths(study,read,freeze){
  assert(study?.schema==='agent-frc/lift-fault-study@1'&&study.plan?.pointer==='','Pin the complete lift fault plan.');
  assert(!freeze||freeze===study.plan.sha256,'The saved lift fault plan digest differs.');
  const p={...get(study.plan,read),sha256:study.plan.sha256};
  const topologyOnly=p.mode==='topology-only';
  assert(p.schema==='agent-frc/lift-fault-plan@1'&&['integrated-simulation','physical'].includes(p.evidence)&&
    (p.mode===undefined||['topology-only','topology-and-motion'].includes(p.mode)),'Identify the graph or graph-and-motion review scope.');
  if(!topologyOnly)assert([p.durationS,p.maxRackMm,p.maxCommonDropMm].every(positive)&&Array.isArray(p.maxSideDropMm)&&p.maxSideDropMm.length===2&&
    p.maxSideDropMm.every(positive)&&label(p.thresholdBasis),'Freeze the post-cut duration and separate first-unacceptable rack, mean and individual travel limits.');
  const layouts=studyRows(p.layouts,'installed topology',1,16).map(l=>({...l,graph:validateGraph(get(l.source,read))}));
  assert(p.referenceConditions&&Object.keys(p.referenceConditions).length,'Freeze the common starting conditions for the fault controls.');
  const cases=studyRows(p.cases,'fault condition',1,96);
  assert(cases.every(c=>ids(c.unavailable)&&label(c.basis)&&c.conditions&&Object.keys(c.conditions).length&&
    Object.values(c.conditions).every(v=>finite(v)||typeof v==='boolean'||label(v))),'Register the failed components and typed load, friction or clearance conditions.');
  const entries=studyRows(study.runs,'fault execution',0,1536),index=new Map(),key=(a,c)=>JSON.stringify([a,c]);
  assert(!topologyOnly||!entries.length&&!p.resolutionChecks?.length,'Paired numerical records need a complete travel plan.');
  for(const r of entries){const k=key(r.layout,r.case);assert(!index.has(k)&&layouts.some(l=>l.id===r.layout)&&cases.some(c=>c.id===r.case),'Unknown or duplicate layout/fault receipt.');index.set(k,r);}
  const rows=[],used=new Map();
  for(const l of layouts)for(const c of cases){
    const g=l.graph,k=key(l.id,c.id),entry=index.get(k);
    const known=c.unavailable.every(id=>g.components.some(comp=>comp.id===id));
    const paths=known?connectivity(g,c.unavailable):[];
    let motion=open(topologyOnly?'Topology-only study; paired limits and motion are unverified.':'Missing paired post-cut replay.');
    if(g.loads.length===1)motion={status:'not-applicable',reason:'Only one load station in this project inventory.'};
    else if(known&&entry)try{motion=replay(get(entry.source,read),p,l,c,entry.source,read);}catch(err){motion=open(err.message);}
    if(motion.runId){const matches=used.get(motion.runId)??[];matches.push(motion);used.set(motion.runId,matches);}
    rows.push({layout:l.id,case:c.id,unavailable:c.unavailable,source:entry?.source,paths,motion,
      topology:!known?'open':paths.some(s=>s.status==='disconnected')?'disconnected':paths.every(s=>s.status==='modeled-path')?'connected-in-model':'open'});
  }
  for(const group of used.values())if(group.length>1)for(const m of group)Object.assign(m,open('Execution identity reused.'),{peaks:null,first:null});
  const coverage=layouts.map(l=>{
    const f=l.graph.faultInventory;
    const required=[[],...[...new Set([...f.holders,...f.localTransfers,...f.shared])].map(id=>[id])];
    if(f.holders.length===2)required.push(sorted(f.holders));
    const controls=required.map(cut=>{
      const selected=rows.filter(r=>r.layout===l.id&&equal(sorted(r.unavailable),cut)&&
        equal(cases.find(c=>c.id===r.case).conditions,p.referenceConditions));
      return {cut,cases:selected.map(r=>r.case),motionObserved:selected.some(r=>['fail','within-modeled-limits'].includes(r.motion.status)),
        topologyObserved:selected.some(r=>r.topology!=='open')};
    });
    return {layout:l.id,controls,pairedMotionApplicable:l.graph.loads.length===2};
  });
  const resolution=studyRows(p.resolutionChecks??[],'step refinement',0,128).map(check=>{
    const [lo,hi]=[check.coarse,check.fine].map(id=>rows.find(row=>row.layout===check.layout&&row.case===id));
    assert(lo&&hi&&lo!==hi&&label(check.basis)&&[check.peakToleranceMm,check.crossingToleranceS].every(n=>finite(n)&&n>=0),'Register distinct resolution cases and project-specific tolerances.');
    const a=lo.motion,b=hi.motion;
    if(!equal(sorted(lo.unavailable),sorted(hi.unavailable))||!equal(cases.find(c=>c.id===lo.case).conditions,cases.find(c=>c.id===hi.case).conditions)||
      !a.peaks||!b.peaks||a.status==='open'||b.status==='open'||a.fromS!==b.fromS||!(b.stepS<a.stepS))return {id:check.id,...open('Compare the same applied faults, layout, cutoff and operating conditions at a genuinely finer step.')};
    const metrics=m=>[m.peaks.rackMm,m.peaks.commonDropMm,...m.peaks.sideDropMm];
    const peakDifferenceMm=Math.max(...metrics(a).map((v,i)=>Math.abs(v-metrics(b)[i])));
    const sameCrossings=equal(Object.keys(a.first).sort(),Object.keys(b.first).sort());
    const crossingDifferenceS=sameCrossings?Math.max(0,...Object.keys(a.first).map(k=>Math.abs(a.first[k].elapsedS-b.first[k].elapsedS))):null;
    return {id:check.id,peakDifferenceMm,crossingDifferenceS,status:a.status===b.status&&sameCrossings&&peakDifferenceMm<=check.peakToleranceMm&&
      crossingDifferenceS<=check.crossingToleranceS?'within-declared-spread':'sensitive'};
  });
  return {schema:'agent-frc/lift-fault-result@1',plan:study.plan,rows,coverage,resolution,thresholdBasis:p.thresholdBasis,durationS:p.durationS,
    limits:'A graph path shows connectivity for the modeled downward load. Load sharing, backlash, engagement, strength, energy absorption and the entire robot require independent evidence.'};
}
