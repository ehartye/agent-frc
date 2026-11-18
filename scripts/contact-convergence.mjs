// Checks supplied summary evidence; does not run a solver or validate physical behavior.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const pinKeys=['scenario','constitutiveLaw','initialState','inputs','runtime','outcomeDefinition'];
const axes=['timestep','contact-geometry','contact-search'];
const outcomes=['released','contact-at-horizon','unresolved'];

export function assessContactConvergence(manifest,receipt){
  const result={schema:'agent-frc/contact-convergence-result@1',status:'within-declared-bounds',issues:[],studies:[],
    integrity:'not-independently-verified',calibration:'not-assessed',engineeringAcceptance:'blocked',
    limitations:['Compares supplied finite summaries and declared pins only; no solver execution, trace authentication or proof of convergence.',
      'Matching declarations do not prove the physical law, initial conditions or held settings were actually preserved.',
      'Numerical refinement, calibrated parameters, physical-model validation and engineering acceptance are separate.']};
  function invalid(message){result.status='invalid';result.issues.push(message);}
  function exact(value,keys,p){
    if(!object(value)){invalid(p+' must be an object');return false;}
    for(const key of keys)if(!Object.hasOwn(value,key))invalid(p+'.'+key+' required');
    for(const key of Object.keys(value))if(!keys.includes(key))invalid(p+'.'+key+' unsupported');
    return true;
  }
  function pins(value,p){if(exact(value,pinKeys,p))for(const key of pinKeys)if(!hash(value[key]))invalid(p+'.'+key+' must be SHA-256');}
  function list(value,max,p,nonempty=true){if(!Array.isArray(value)||(nonempty&&!value.length)||value.length>max){invalid(p+' must be a bounded '+(nonempty?'nonempty ':'')+'array');return false;}return true;}
  function uniqueId(id,set,p){if(!text(id)||set.has(id))invalid(p+' invalid or duplicate ID');else set.add(id);}
  if(!exact(manifest,['schema','comparisonPins','windowEndSeconds','metrics','studies'],'manifest')||
     !exact(receipt,['schema','basis','runs'],'receipt'))return result;
  if(manifest.schema!=='agent-frc/contact-convergence-manifest@1')invalid('unsupported manifest schema');
  if(receipt.schema!=='agent-frc/contact-convergence-receipt@1')invalid('unsupported receipt schema');
  if(!['synthetic','simulation-observed'].includes(receipt.basis))invalid('unsupported evidence basis');
  result.evidenceBasis=receipt.basis;
  pins(manifest.comparisonPins,'manifest.comparisonPins');
  if(!finite(manifest.windowEndSeconds)||manifest.windowEndSeconds<=0)invalid('windowEndSeconds must be positive');
  const metricIds=new Set(),studyIds=new Set(),expectedRunIds=new Set(),runIds=new Set();
  if(list(manifest.metrics,32,'metrics'))for(const metric of manifest.metrics){
    if(!exact(metric,['id','units','definition','absoluteTolerance'],'metric'))continue;
    uniqueId(metric.id,metricIds,'metric');
    if(!text(metric.units)||!text(metric.definition)||!finite(metric.absoluteTolerance)||metric.absoluteTolerance<0)invalid('metric requires units, definition and finite nonnegative absolute tolerance');
  }
  if(list(manifest.studies,32,'studies'))for(const study of manifest.studies){
    if(!exact(study,['id','axis','resolutionParameters','fixedSettingsSha256','levels'],'study'))continue;
    uniqueId(study.id,studyIds,'study');
    if(!axes.includes(study.axis)||!hash(study.fixedSettingsSha256))invalid('study axis or fixed settings pin invalid');
    if(!Array.isArray(study.resolutionParameters)||!study.resolutionParameters.length||study.resolutionParameters.length>4||study.resolutionParameters.some(x=>!text(x))||new Set(study.resolutionParameters).size!==study.resolutionParameters.length)invalid('resolutionParameters must name each coordinate uniquely');
    const ids=new Set();let previous=null;
    if(list(study.levels,32,'levels')){
      if(study.levels.length<3)invalid('each study requires at least three ordered refinement levels');
      for(const level of study.levels){
        if(!exact(level,['runId','resolution','modelSha256','settingsSha256'],'level'))continue;
        uniqueId(level.runId,ids,'level');expectedRunIds.add(level.runId);
        if(!hash(level.modelSha256)||!hash(level.settingsSha256))invalid('level source/settings pin invalid');
        const resolution=level.resolution;
        if(!Array.isArray(resolution)||resolution.length!==study.resolutionParameters?.length||!resolution.length||resolution.length>4||resolution.some(x=>!finite(x)||x<=0)||(study.axis==='timestep'&&resolution.length!==1)){invalid('resolution must contain positive finite values for each parameter; timestep has one value');continue;}
        if(previous&&(resolution.length!==previous.length||resolution.some((x,i)=>study.axis==='timestep'?x>=previous[i]:x<previous[i])||resolution.every((x,i)=>x===previous[i])))invalid('levels must progress strictly finer without coarsening another coordinate');
        previous=resolution;
      }
    }
  }
  if(Array.isArray(manifest.studies)&&(!manifest.studies.some(s=>s?.axis==='timestep')||!manifest.studies.some(s=>['contact-geometry','contact-search'].includes(s?.axis))))invalid('declare both timestep and contact refinement studies');
  const runs=new Map();
  if(list(receipt.runs,1024,'runs',false))for(const run of receipt.runs){
    if(!exact(run,['id','comparisonPins','fixedSettingsSha256','modelSha256','settingsSha256','windowEndSeconds','completion','termination','outcome','reportedIntegrityPassed','metrics'],'run'))continue;
    uniqueId(run.id,runIds,'run');runs.set(run.id,run);pins(run.comparisonPins,'run.comparisonPins');
    for(const key of ['fixedSettingsSha256','modelSha256','settingsSha256'])if(!hash(run[key]))invalid('run '+key+' must be SHA-256');
    if(!finite(run.windowEndSeconds)||run.windowEndSeconds<=0||!['complete','failed','cancelled'].includes(run.completion)||!text(run.termination)||!outcomes.includes(run.outcome)||typeof run.reportedIntegrityPassed!=='boolean')invalid('invalid run completion, horizon, outcome or reported integrity');
    const ids=new Set();if(list(run.metrics,32,'run.metrics'))for(const metric of run.metrics){
      if(!exact(metric,['id','units','value'],'run.metric'))continue;uniqueId(metric.id,ids,'run.metric');
      if(!text(metric.units)||(metric.value!==null&&!finite(metric.value)))invalid('run metric must have units and finite value or explicit null');
    }
    if(ids.size!==metricIds.size||[...ids].some(id=>!metricIds.has(id)))invalid('run metric inventory must match independent metric inventory');
  }
  if(result.status==='invalid')return result;
  if([...expectedRunIds].some(id=>!runs.has(id))||[...runs.keys()].some(id=>!expectedRunIds.has(id))){result.status='unknown';result.issues.push('run inventory differs from independent study manifest');return result;}
  for(const study of manifest.studies){
    const selected=study.levels.map(level=>runs.get(level.runId));
    const row={id:study.id,axis:study.axis,status:'within-declared-bounds',runIds:selected.map(r=>r.id),outcomes:selected.map(r=>r.outcome),terminations:selected.map(r=>r.termination),comparisons:[],issues:[]};
    const block=message=>{row.status='unknown';row.issues.push(message);};
    selected.forEach((run,i)=>{
      const level=study.levels[i];
      if(pinKeys.some(key=>run.comparisonPins[key]!==manifest.comparisonPins[key])||run.fixedSettingsSha256!==study.fixedSettingsSha256||run.modelSha256!==level.modelSha256||run.settingsSha256!==level.settingsSha256)block('source, constitutive law, state or settings mismatch: '+run.id);
      if(run.windowEndSeconds!==manifest.windowEndSeconds)block('comparison window mismatch: '+run.id);
      if(run.completion!=='complete'||!run.reportedIntegrityPassed)block('incomplete or reported integrity failure: '+run.id);
      if(run.outcome==='unresolved')block('outcome unresolved: '+run.id);
      for(const m of manifest.metrics)if(run.metrics.find(x=>x.id===m.id).units!==m.units)block('metric units mismatch: '+run.id+'/'+m.id);
    });
    if(row.status!=='unknown'){
      const disagreement=new Set(row.outcomes).size>1;
      if(disagreement){row.status='not-converged';row.issues.push('discrete outcome changes under refinement');}
      for(const metric of manifest.metrics){
        const values=selected.map(r=>r.metrics.find(m=>m.id===metric.id).value);
        const deltas=values.slice(1).map((v,i)=>v===null||values[i]===null?null:Math.abs(v-values[i]));
        const finestDelta=deltas.at(-1),inBounds=finestDelta!==null&&Number.isFinite(finestDelta)&&finestDelta<=metric.absoluteTolerance;
        row.comparisons.push({metricId:metric.id,units:metric.units,values,adjacentDeltas:deltas.map(d=>Number.isFinite(d)?d:null),finestDelta:Number.isFinite(finestDelta)?finestDelta:null,absoluteTolerance:metric.absoluteTolerance,withinBounds:inBounds});
        if(deltas.some(d=>d!==null&&!Number.isFinite(d))){block('derived numeric overflow: '+metric.id);}
        else if(values.some(v=>v===null)){if(!disagreement)block('required metric unavailable: '+metric.id);}
        else if(!inBounds&&row.status!=='unknown'){row.status='not-converged';row.issues.push('finest-level metric exceeds declared tolerance: '+metric.id);}
      }
    }
    result.studies.push(row);
  }
  result.status=result.studies.some(s=>s.status==='unknown')?'unknown':result.studies.some(s=>s.status==='not-converged')?'not-converged':'within-declared-bounds';
  if(result.status!=='unknown'&&new Set([...runs.values()].map(r=>r.outcome)).size>1){result.status='not-converged';result.issues.push('discrete outcomes disagree across required studies');}
  return result;
}
