import { createHash } from 'node:crypto';
import { readViewerBytes } from './native-viewer-cli.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assert=(condition,message)=>{if(!condition) throw Error(message);};
const name=v=>typeof v==='string' && v.trim().length>0;
const tick=Number.isSafeInteger;
const bound=v=>Number.isFinite(v) && v>=0;
const verdict=rows=>rows.some(r=>r.status==='unknown')?'unknown':rows.some(r=>r.status==='failed')?'failed':'passed';
function unique(rows,key) {
  const index=new Map();
  for(const row of rows){
    const id=key(row);
    index.set(id,index.has(id)?null:row);
  }
  return index;
}
function replayKey(r) {
  assert(name(r?.run) && name(r.kind) && tick(r.step) && r.step>=0,'Invalid replay run, kind or step.');
  return JSON.stringify([r.run,r.kind,r.step]);
}
function compareReplays(spec,receipt) {
  assert(Array.isArray(spec.replays) && spec.replays.length>0,'Declare at least one required replay.');
  assert(Array.isArray(receipt.replays),'Missing replay inventory.');
  const expected=unique(spec.replays,replayKey), observed=new Map();
  for(const record of receipt.replays) {
    const key=replayKey(record);
    if(!observed.has(key)) observed.set(key,[]);
    observed.get(key).push(record);
  }
  const rows=[];
  for(const [key,req] of expected) {
    assert(req,'Duplicate required replay in manifest.');
    assert(Array.isArray(req.metrics) && req.metrics.length>0,'Declare the required metrics.');
    const metrics=unique(req.metrics,m=>m.name);
    const candidates=observed.get(key) ?? [];
    const seen=candidates.length===1?candidates[0]:null;
    const values=unique(Array.isArray(seen?.metrics)?seen.metrics:[],m=>m?.name);
    const comparisons=[];
    for(const [id,m] of metrics) {
      assert(m && name(id) && name(m.units) && bound(m.maxAbs),'Invalid or duplicate required metric.');
      const v=values.get(id);
      const comparable=v && v.units===m.units && Number.isFinite(v.difference);
      comparisons.push({name:id,units:m.units,maxAbs:m.maxAbs,observed:v??null,
        status:comparable?(Math.abs(v.difference)<=m.maxAbs?'passed':'failed'):'unknown'});
    }
    rows.push({run:req.run,kind:req.kind,step:req.step,metrics:comparisons,status:verdict(comparisons),
      inventory:seen?'present':candidates.length?'duplicate':'missing',
      ...(candidates.length>1?{ambiguousObservations:candidates}:{})});
  }
  return {status:verdict(rows),replays:rows,otherReplays:receipt.replays.filter(r=>!expected.has(replayKey(r)))};
}
function samples(trace,spec,id) {
  assert(trace?.id===id && trace.origin===spec.origin && trace.tickSeconds===spec.tickSeconds &&
    trace.units===spec.units && trace.quantity===spec.quantity && trace.timeBasis==='common-clock',
    'Incompatible identity, clock, quantity, units or time basis in '+id);
  assert(Array.isArray(trace.samples) && trace.samples.length>0,'No samples in '+id);
  const values=new Map();let previous=-Infinity;
  for(const row of trace.samples) {
    assert(Array.isArray(row) && row.length===2 && tick(row[0]) && row[0]>previous && Number.isFinite(row[1]),
      'Samples must have ordered, unique integer ticks and finite values in '+id);
    previous=row[0];
    if(row[0]>=spec.interval[0] && row[0]<=spec.interval[1]) values.set(row[0],row[1]);
  }
  return values;
}
function compareTraces(s,r) {
  assert(name(s.origin) && Number.isFinite(s.tickSeconds) && s.tickSeconds>0 && name(s.units) &&
    name(s.quantity) && bound(s.maxAbs),'Declare the clock, tick size, measured quantity, units and bound.');
  assert(Array.isArray(s.interval) && s.interval.length===2 && s.interval.every(tick) && s.interval[0]<s.interval[1],
    'Declare an increasing inclusive tick interval.');
  assert(Array.isArray(s.requiredTicks) && s.requiredTicks.length>=2 &&
    s.requiredTicks.every((v,i)=>tick(v) && (!i || v>s.requiredTicks[i-1])) &&
    s.requiredTicks[0]===s.interval[0] && s.requiredTicks.at(-1)===s.interval[1], 'Required ticks must span the interval.');
  assert(Array.isArray(s.traces) && s.traces.length===2 && s.traces.every(name) && s.traces[0]!==s.traces[1],
    'Two distinct trace IDs are required.');
  assert(Array.isArray(r.traces) && r.traces.length===2,'Expected two observed traces.');
  const traces=unique(r.traces,t=>t.id);
  const [a,b]=s.traces.map(id=>samples(traces.get(id),s,id));
  const shared=[];
  for(const [t,value] of a) if(b.has(t)) {
    const difference=Math.abs(value-b.get(t));
    assert(Number.isFinite(difference),'Nonfinite state difference.');
    shared.push({tick:t,first:value,second:b.get(t),difference,status:difference<=s.maxAbs?'passed':'failed'});
  }
  const missingRequired=s.requiredTicks.filter(t=>!a.has(t)||!b.has(t));
  const worst=shared.reduce((max,row)=>!max || row.difference>max.difference?row:max,null);
  const firstExceedance=shared.find(row=>row.status==='failed') ?? null;
  const unmatched=s.traces.map((id,i)=>{
    const [source,other]=i===0?[a,b]:[b,a];
    return {id,ticks:[...source.keys()].filter(t=>!other.has(t))};
  });
  return {status:missingRequired.length?'unknown':verdict(shared),origin:s.origin,tickSeconds:s.tickSeconds,
    interval:s.interval,quantity:s.quantity,units:s.units,maxAbs:s.maxAbs,shared,missingRequired,unmatched,
    worst,firstExceedance,
    separateDiagnostics:r.diagnostics ?? []};
}

export function assessSimulationChecks(spec,receipt) {
  assert(spec?.schema==='frc-simulation-checks/request-v1' && receipt?.schema==='frc-simulation-checks/receipt-v1',
    'Unexpected request or receipt schema.');
  assert(spec.kind===receipt.kind,'Mismatched check kind.');
  if(spec.kind==='replay-inventory') return compareReplays(spec,receipt);
  if(spec.kind==='trace-alignment') return compareTraces(spec,receipt);
  throw Error('Unknown check kind.');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let report;
  try {
    const args=process.argv.slice(2);
    assert(args.length===2,'Usage: simulation-checks.mjs frozen-request.json observed-receipt.json');
    const bytes=readViewerBytes(args[0]), parse=data=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
    const receipt=parse(readViewerBytes(args[1])), sha256=createHash('sha256').update(bytes).digest('hex');
    assert(receipt?.requestSha256===sha256,'Receipt must cite the supplied frozen request SHA-256.');
    report={requestSha256:sha256,...assessSimulationChecks(parse(bytes),receipt)};
  } catch(error){report={status:'unknown',issue:error.message};}
  console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='passed'?0:report.status==='failed'?1:2;
}
