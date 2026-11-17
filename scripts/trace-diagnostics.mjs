import {createHash} from 'node:crypto';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function diagnoseTrace(receipt, sourceSha256){
 if(!object(receipt)||typeof receipt.schema!=='string'||!Array.isArray(receipt.trace)||!receipt.trace.length)throw Error('A nonempty trace receipt is required; summaries and comparisons are not trace inputs');
 if(!/^[a-f0-9]{64}$/.test(sourceSha256))throw Error('Source SHA256 required');
 if(receipt.trace.length>100000)throw Error('Trace row limit exceeded');
 const issues=[],missing=new Set();
 const numeric=(value,path)=>{if(value===undefined||value===null){missing.add(path);return null;}if(!finite(value))throw Error('Nonfinite or nonnumeric '+path);return value;};
 const step=numeric(receipt.stepS,'stepS');if(step!==null&&step<=0)throw Error('Positive stepS required');
 const rows=receipt.trace.map((r,i)=>{
  if(!object(r)||!finite(r.timeS))throw Error('Finite trace time required at '+i);
  const t=r.timeS;
  if(i&&t<=receipt.trace[i-1].timeS)throw Error('Trace time must increase');
  if(i&&step!==null&&Math.abs(t-receipt.trace[i-1].timeS-step)>Math.max(1e-10,step*1e-6))issues.push('Nonuniform or omitted step before row '+i);
  const ct=numeric(r.contactSampleTimeS,'contactSampleTimeS');
  if(ct!==null&&(ct>t+1e-10||(step!==null&&ct<t-step-1e-10)))issues.push('Contact sample outside its integration interval at row '+i);
  let normal=null,active=null;
  if(r.contacts===undefined||r.contacts===null)missing.add('contacts');
  else {if(!Array.isArray(r.contacts))throw Error('contacts must be an array');
   const values=r.contacts.map(c=>{if(!object(c))throw Error('contact object required');return numeric(c.normalMagnitudeN,'contacts.normalMagnitudeN');});
   normal=values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0):null;
   if(normal!==null&&!finite(normal))throw Error('Nonfinite contact aggregate');
   const counts=r.contacts.map(c=>numeric(c.activeSamples,'contacts.activeSamples'));
   if(counts.some(v=>v!==null&&(!Number.isSafeInteger(v)||v<0)))throw Error('Nonnegative integer activeSamples required');
   active=counts.every(v=>v!==null)?counts.reduce((a,b)=>a+b,0):null;
   if(active!==null&&!Number.isSafeInteger(active))throw Error('Unsafe activeSamples aggregate');
   if(values.some(v=>v!==null&&v<0))throw Error('Nonnegative normal magnitude required');
  }
  return {index:i,timeS:t,contactSampleTimeS:ct,relativeXM:numeric(r.relativeRobotXY?.[0],'relativeRobotXY[0]'),chassisVxMps:numeric(r.chassis?.vx,'chassis.vx'),pieceVxMps:numeric(r.note?.v?.[0],'note.v[0]'),normalSumN:normal,activeSamples:active,busV:numeric(r.busV,'busV'),energyResidualJ:numeric(r.energyJ?.residual,'energyJ.residual'),newPhaseResidualJ:numeric(r.newPhaseResidualJ,'newPhaseResidualJ'),command:object(r.command)?r.command:null};
 });
 const events=receipt.events===undefined?[]:receipt.events;
 if(!Array.isArray(events))throw Error('events must be an array');
 if(receipt.events===undefined)missing.add('events');
 const eventRows=events.map((e,i)=>{if(!object(e)||!finite(e.timeS))throw Error('Finite event time required');if(i&&e.timeS<=events[i-1].timeS)throw Error('Event time must increase');return {timeS:e.timeS,observationTimeS:numeric(e.observation?.timestamp,'events.observation.timestamp'),command:object(e.command)?e.command:null};});
 for(const e of eventRows){if(e.observationTimeS!==null&&e.observationTimeS>e.timeS+1e-10)issues.push('Future observation at controller event '+e.timeS);if(e.timeS>rows.at(-1).timeS+1e-10)issues.push('Controller event after last accepted row');}
 const limits=Array.isArray(receipt.limits)?receipt.limits.map(String):[];
 return {schema:'agent-frc/trace-diagnostics@1',sourceSchema:receipt.schema,sourceSha256,sourcePins:object(receipt.inputs)?receipt.inputs:{},pinVerification:'Declared source pins only; file hashes not independently verified',outcome:receipt.outcome??null,reason:receipt.reason??null,producerAcceptance:receipt.acceptance??null,diagnosticAcceptance:false,partial:receipt.partial===true,completion:receipt.partial===true?'PARTIAL SNAPSHOT: ongoing run, not a final outcome':'File parsed; horizon is not task success and final status is not inferred',heldCommand:receipt.heldCommand??null,nextControllerTimeS:numeric(receipt.nextControllerTimeS,'nextControllerTimeS'),firstRecordedPositiveContact:rows.find(r=>r.normalSumN!==null&&r.normalSumN>0)?{endpointTimeS:rows.find(r=>r.normalSumN!==null&&r.normalSumN>0).timeS,contactSampleTimeS:rows.find(r=>r.normalSumN!==null&&r.normalSumN>0).contactSampleTimeS,scope:'First positive sample in this file only, not global onset'}:null,stepS:step,controllerPeriodS:numeric(receipt.controllerPeriodS,'controllerPeriodS'),ancestry:receipt.ancestry??null,accepted:{firstTimeS:rows[0].timeS,lastTimeS:rows.at(-1).timeS,rowCount:rows.length},rejectedTrial:receipt.rejectedGeometryQuery??null,missingFields:[...missing].sort(),issues,limits,rows,events:eventRows};
}
export const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
function plot(rows,key,timeKey,label){
 const points=rows.filter(r=>r[key]!==null&&r[timeKey]!==null);if(!points.length)return '<p>'+esc(label)+': MISSING</p>';
 const xs=points.map(r=>r[timeKey]),ys=points.map(r=>r[key]);const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 if(!finite(xmax-xmin)||!finite(ymax-ymin))throw Error('Unsupported plotting numeric range');
 const path=rows.map(r=>r[key]===null||r[timeKey]===null?null:[25+700*((r[timeKey]-xmin)/(xmax-xmin||1)),15+100*(1-(r[key]-ymin)/(ymax-ymin||1))]);
 if(path.some(p=>p&&p.some(v=>!finite(v))))throw Error('Nonfinite plot coordinate');
 let d='',pen=false;for(const p of path){if(!p){pen=false;continue;}d+=(pen?' L':' M')+p.join(',');pen=true;}
 return '<section><h3>'+esc(label)+'</h3><svg role="img" aria-label="'+esc(label)+'" viewBox="0 0 750 140"><path d="'+d+'" fill="none" stroke="#1777aa" stroke-width="2"/></svg><p>Range '+esc(ymin)+' to '+esc(ymax)+'; time '+esc(xmin)+' to '+esc(xmax)+' s. Missing samples break lines.</p></section>';
}
export function renderDiagnostics(d){
 const json=x=>esc(JSON.stringify(x,null,2));
 return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FRC trace diagnostics</title><style>body{font:16px system-ui;max-width:1000px;margin:32px auto;padding:16px;color:#172b39}section{border:1px solid #ccd;padding:12px;margin:14px 0}svg{width:100%;max-height:180px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5f7;padding:12px}.warning{background:#fff2cb;padding:16px}td,th{text-align:left;padding:6px;border-bottom:1px solid #ddd}</style><h1>FRC trace diagnostics</h1><p class="warning">'+(d.partial?'PARTIAL SNAPSHOT. ':'')+'Read-only evidence viewer, not physics validation or capture detection. Source pins are declared, not independently verified. HORIZON is not task success. No missing field is replaced with zero.</p><p>Source SHA256: '+esc(d.sourceSha256)+'</p><pre>'+json({sourceSchema:d.sourceSchema,outcome:d.outcome,reason:d.reason,accepted:d.accepted,completion:d.completion,latestAccepted:d.rows.at(-1),firstRecordedPositiveContact:d.firstRecordedPositiveContact,heldCommand:d.heldCommand,nextControllerTimeS:d.nextControllerTimeS,missingFields:d.missingFields,issues:d.issues})+'</pre>'+plot(d.rows,'relativeXM','timeS','Relative X (m), accepted endpoint time')+plot(d.rows,'chassisVxMps','timeS','Chassis velocity (m/s), endpoint time')+plot(d.rows,'normalSumN','contactSampleTimeS','Sum normal magnitudes (N), actual contact sample time; not holding force')+plot(d.rows,'activeSamples','contactSampleTimeS','Active contact samples, actual contact sample time')+plot(d.rows,'energyResidualJ','timeS','Cumulative energy residual (J)')+plot(d.rows,'newPhaseResidualJ','timeS','Producer-declared new-phase residual (J), separate from cumulative')+'<h2>Controller event clock</h2><p>Events are not resampled onto physics rows. Held row commands remain in the JSON report. Missing event history does not mean no commands.</p><pre>'+json(d.events)+'</pre><h2>Rejected trial, separate from accepted endpoint</h2><pre>'+json(d.rejectedTrial)+'</pre><h2>Lineage, assumptions and declared pins</h2><pre>'+json({ancestry:d.ancestry,limits:d.limits,pins:d.sourcePins,pinVerification:d.pinVerification})+'</pre>';
}
