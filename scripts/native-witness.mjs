// Evidence contract only. Does not execute CAD, approve a trajectory, or modify geometry.
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 2000;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const pinKeys = ['trajectory', 'geometry', 'transforms', 'backend'];
function exact(x, names, path, errors) {
  if (!object(x)) { errors.push(path + ' must be object'); return false; }
  for (const k of Object.keys(x)) if (!names.includes(k)) errors.push(path + '.' + k + ' unsupported');
  for (const k of names) if (!Object.hasOwn(x,k)) errors.push(path + '.' + k + ' required');
  return true;
}
function pins(x,path,errors) {
  if (exact(x,pinKeys,path,errors)) for (const k of pinKeys) if (!hash(x[k])) errors.push(path+'.'+k+' must be SHA-256');
}
export function validateWitnessReceipt(r) {
  const errors=[];
  if (!exact(r,['schema','id','basis','pins','coverage','method','witnesses'],'receipt',errors)) return {valid:false,errors};
  const v2=r.schema==='agent-frc/native-witness@2';
  if (!v2&&r.schema!=='agent-frc/native-witness@1') errors.push('unsupported schema');
  if (!text(r.id)) errors.push('id required');
  if (!['synthetic-test','native-execution'].includes(r.basis)) errors.push('basis unsupported');
  pins(r.pins,'pins',errors);
  if (exact(r.coverage,['expectedWitnessIds','complete'],'coverage',errors)) {
    if (!Array.isArray(r.coverage.expectedWitnessIds) || !r.coverage.expectedWitnessIds.length || r.coverage.expectedWitnessIds.length>10000 || r.coverage.expectedWitnessIds.some(x=>!text(x)) || new Set(r.coverage.expectedWitnessIds).size!==r.coverage.expectedWitnessIds.length) errors.push('expectedWitnessIds must be unique nonempty IDs');
    if (typeof r.coverage.complete!=='boolean') errors.push('complete must be boolean');
  }
  if (exact(r.method,['kernel','version','volumeUnits','volumeTolerance','boundMethod','triangulation','shapeToleranceIncluded'],'method',errors)) {
    for (const k of ['kernel','version','boundMethod']) if (!text(r.method[k])) errors.push('method.'+k+' required');
    if (r.method.volumeUnits!=='mm3') errors.push('volumeUnits must be mm3');
    if (!finite(r.method.volumeTolerance)||r.method.volumeTolerance<0) errors.push('invalid volumeTolerance');
    for (const k of ['triangulation','shapeToleranceIncluded']) if (typeof r.method[k]!=='boolean') errors.push('method.'+k+' must be boolean');
  }
  if (!Array.isArray(r.witnesses)||r.witnesses.length>10000) errors.push('witnesses must be bounded array');
  else { const ids=new Set();for (const w of r.witnesses) {
    if (!exact(w,['id','stateHash','pair','conservativeContact','rotating','phase','solidValid','booleanStatus','overlapVolume',...(v2?['representations','transformRegistrationHash']:[])],'witness',errors)) continue;
    if(v2){
      if(!Array.isArray(w.representations)||w.representations.length!==2||w.representations.some(x=>!['native-material','outer-envelope','unknown'].includes(x)))errors.push('representations must classify both ordered operands');
      if(w.transformRegistrationHash!==null&&!hash(w.transformRegistrationHash))errors.push('transformRegistrationHash must be null or SHA-256');
    }
    if (!text(w.id)||ids.has(w.id)) errors.push('invalid/duplicate witness id');ids.add(w.id);
    if (!hash(w.stateHash)) errors.push('stateHash must be SHA-256');
    if (!Array.isArray(w.pair)||w.pair.length!==2||w.pair.some(x=>!text(x))||w.pair[0]===w.pair[1]) errors.push('pair must name two distinct parts');
    for (const k of ['conservativeContact','rotating','solidValid']) if (typeof w[k]!=='boolean') errors.push('witness.'+k+' must be boolean');
    if (!['complete','error','not-run'].includes(w.booleanStatus)) errors.push('invalid booleanStatus');
    if (w.overlapVolume!==null&&(!finite(w.overlapVolume)||w.overlapVolume<0)) errors.push('invalid overlapVolume');
    if (w.booleanStatus==='complete'&&w.overlapVolume===null) errors.push('complete Boolean needs volume');
    if (w.booleanStatus!=='complete'&&w.overlapVolume!==null) errors.push('unfinished Boolean cannot report volume');
    if (w.phase!==null) {
      if (exact(w.phase,['angleDeg','registrationHash'],'phase',errors)) {
        if (!finite(w.phase.angleDeg)||w.phase.angleDeg<0||w.phase.angleDeg>=360) errors.push('phase angle outside [0,360)');
        if (!hash(w.phase.registrationHash)) errors.push('phase registrationHash required');
      }
    }
    if (!w.rotating&&w.phase!==null) errors.push('stationary witness phase must be null');
  }
  const expected=r.coverage?.expectedWitnessIds;
  if (Array.isArray(expected)) {
    for(const id of ids) if(!expected.includes(id)) errors.push('unexpected witness '+id);
    if(r.coverage.complete&&expected.some(id=>!ids.has(id))) errors.push('complete receipt missing witness');
  }}
  return {valid:errors.length===0,errors};
}
export function assessWitnessReceipt(r, expectedPins) {
  const validation=validateWitnessReceipt(r),errors=[];pins(expectedPins,'expectedPins',errors);
  if (!validation.valid||errors.length) return {status:'unknown',reason:'invalid-contract',errors:[...validation.errors,...errors],witnesses:[]};
  if(pinKeys.some(k=>r.pins[k]!==expectedPins[k])) return {status:'unknown',reason:'stale-inputs',witnesses:[]};
  const witnesses=r.witnesses.map(w=>{
    const v2=r.schema==='agent-frc/native-witness@2';
    const reason=!w.solidValid||w.booleanStatus!=='complete'?'invalid-or-unfinished-geometry':w.rotating&&w.phase===null?'phase-unregistered':v2&&w.transformRegistrationHash===null?'transform-unregistered':v2&&w.representations.some(x=>x!=='native-material')?'representation-not-material':'bounded-material-witness';
    return {id:w.id,status:reason!=='bounded-material-witness'?'unknown':w.overlapVolume>r.method.volumeTolerance?'material-overlap':'no-material-overlap-at-witness',reason,conservativeContact:w.conservativeContact,observedVolume:w.overlapVolume,phaseRegistered:!w.rotating||w.phase!==null,...(v2?{representations:[...w.representations],transformRegistrationHash:w.transformRegistrationHash}:{}),physicalContact:'unknown'};
  });
  const status=r.basis==='synthetic-test'?'unknown':!r.coverage.complete?'unknown':witnesses.some(w=>w.status==='unknown')?'unknown':witnesses.some(w=>w.status==='material-overlap')?'material-overlap':'no-material-overlap-at-witnesses';
  return {status,reason:r.basis==='synthetic-test'?'synthetic-not-native':!r.coverage.complete?'incomplete-coverage':'bounded-witness-evidence',witnesses,limitations:['Finite witnesses only; no continuous sweep or structural/physical clearance proof.','Hashes bind declared inputs; caller must independently verify captures and phase registration.','No geometry or trajectory adoption is authorized.']};
}

// Independently authored expectations; never derive these from an untrusted receipt.
export function validateWitnessManifest(m) {
  const errors=[];
  if(!exact(m,['schema','pins','methodPolicy','witnesses'],'manifest',errors))return {valid:false,errors};
  const v2=m.schema==='agent-frc/native-witness-manifest@2';
  if(!v2&&m.schema!=='agent-frc/native-witness-manifest@1')errors.push('unsupported manifest schema');
  pins(m.pins,'manifest.pins',errors);
  if(!Array.isArray(m.witnesses)||!m.witnesses.length||m.witnesses.length>10000)errors.push('manifest witnesses must be nonempty bounded array');
  const rows=[];
  if(Array.isArray(m.witnesses))for(const w of m.witnesses){
    if(!exact(w,['id','stateHash','pair','rotating','phase',...(v2?['representations','transformRegistrationHash']:[])],'manifest.witness',errors))continue;
    rows.push({...w,conservativeContact:false,solidValid:false,booleanStatus:'not-run',overlapVolume:null});
  }
  const derived={schema:v2?'agent-frc/native-witness@2':'agent-frc/native-witness@1',id:'manifest-validation',basis:'synthetic-test',pins:m.pins,coverage:{expectedWitnessIds:rows.map(w=>w.id),complete:true},method:m.methodPolicy,witnesses:rows};
  errors.push(...validateWitnessReceipt(derived).errors);
  return {valid:errors.length===0,errors};
}
export function assessWitnessManifest(r,m) {
  const rv=validateWitnessReceipt(r),mv=validateWitnessManifest(m);
  if(!rv.valid||!mv.valid)return {status:'unknown',reason:'invalid-contract',errors:[...rv.errors,...mv.errors],witnesses:[]};
  if(r.schema.slice(-1)!==m.schema.slice(-1))return {status:'unknown',reason:'schema-version-mismatch',witnesses:[]};
  if(pinKeys.some(k=>r.pins[k]!==m.pins[k]))return {status:'unknown',reason:'stale-inputs',witnesses:[]};
  const methodKeys=['kernel','version','volumeUnits','volumeTolerance','boundMethod','triangulation','shapeToleranceIncluded'];
  if(methodKeys.some(k=>r.method[k]!==m.methodPolicy[k]))return {status:'unknown',reason:'method-policy-mismatch',witnesses:[]};
  const expected=new Map(m.witnesses.map(w=>[w.id,w]));
  if(r.coverage.expectedWitnessIds.length!==expected.size||r.coverage.expectedWitnessIds.some(id=>!expected.has(id)))return {status:'unknown',reason:'inventory-mismatch',witnesses:[]};
  for(const w of r.witnesses){const e=expected.get(w.id);
    if(r.schema==='agent-frc/native-witness@2'&&e&&(w.representations.some((x,i)=>x!==e.representations[i])||w.transformRegistrationHash!==e.transformRegistrationHash))return {status:'unknown',reason:'representation-registration-mismatch',witnessId:w.id,witnesses:[]};
    if(!e||w.stateHash!==e.stateHash||w.rotating!==e.rotating||w.pair[0]!==e.pair[0]||w.pair[1]!==e.pair[1]||
      (w.phase===null)!==(e.phase===null)||(w.phase!==null&&(w.phase.angleDeg!==e.phase.angleDeg||w.phase.registrationHash!==e.phase.registrationHash)))
      return {status:'unknown',reason:'witness-state-mismatch',witnessId:w.id,witnesses:[]};
  }
  const result=assessWitnessReceipt(r,m.pins);
  return {...result,expectationScope:r.schema==='agent-frc/native-witness@2'?'independent-inventory-state-phase-method-representation-registration':'independent-inventory-state-phase-method',limitations:[...(result.limitations??[]),'The manifest must be independently prepared and verified, not generated from the receipt being checked.','Finite registered witnesses and declared native results remain producer evidence, not continuous clearance or authenticity proof.','Physical contact, compliant forces and supported physics remain unknown. Version 1 does not declare operand representation or installed-transform registration.']};
}
