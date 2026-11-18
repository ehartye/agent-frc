// Supplied revision lifecycle evidence only. Never edits or opens a native design.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bases=['synthetic','native-observed','human-reported'];
const phases=['before','after-edit','after-recompute','after-reopen'];
const lex=(a,b)=>a<b?-1:a>b?1:0;

export function compareNativeRevision(expected,observed){
  const result={schema:'agent-frc/native-revision-result@1',status:'matched',issues:[],scope:{
    evidenceBasis:text(observed?.evidenceBasis)?observed.evidenceBasis:null,
    limit:'Supplied body-state and required-feature persistence only; no native execution, geometry authentication, assembly interference, game-piece clearance or physical qualification.',
  }};
  const add=(status,code,p,reason)=>{if(status==='invalid'||result.status==='matched')result.status=status;result.issues.push({code,path:p,reason});};
  const invalid=(code,p,reason)=>add('invalid',code,p,reason);
  const mismatch=(code,p,reason)=>add('mismatch',code,p,reason);
  const finish=()=>{result.issues.sort((a,b)=>lex(a.path,b.path)||lex(a.code,b.code));return result;};
  function exact(value,keys,p){
    if(!object(value)){invalid('object-required',p,'Expected an object');return false;}
    for(const key of keys)if(!Object.hasOwn(value,key))invalid('field-required',p+'/'+key,'Required field missing');
    for(const key of Object.keys(value))if(!keys.includes(key))invalid('unsupported-field',p+'/'+key,'Unexpected field');
    return true;
  }
  function strings(value,p){
    const found=new Set();
    if(!Array.isArray(value)||value.length>10000){invalid('inventory-invalid',p,'Expected a bounded array');return found;}
    value.forEach((v,i)=>{if(!text(v))invalid('id-invalid',p+'/'+i,'Expected nonempty bounded ID');else if(found.has(v))invalid('duplicate-id',p+'/'+i,'Duplicate ID');else found.add(v);});
    return found;
  }
  function bodies(value,p){
    const rows=new Map();
    if(!Array.isArray(value)||value.length>10000){invalid('inventory-invalid',p,'Expected a bounded array, empty only when independently expected');return rows;}
    value.forEach((row,i)=>{
      const at=p+'/'+i;if(!exact(row,['id','stateSha256'],at))return;
      if(!text(row.id))invalid('id-invalid',at+'/id','Expected unique occurrence/body identity');
      else if(rows.has(row.id))invalid('duplicate-id',at+'/id','Duplicate body identity');else rows.set(row.id,row.stateSha256);
      if(!hash(row.stateSha256))invalid('state-pin-invalid',at+'/stateSha256','Expected SHA-256 of independently specified body state');
    });return rows;
  }
  if(!exact(expected,['schema','operationId','baselineArchiveSha256','savedArchiveSha256','allowedEvidenceBases','before','after','requiredFeatureIds'],'/expected')||
     !exact(observed,['schema','operationId','baselineArchiveSha256','savedArchiveSha256','reopenedArchiveSha256','evidenceBasis','stages'],'/observed'))return finish();
  if(expected.schema!=='agent-frc/native-revision-manifest@1')invalid('schema-invalid','/expected/schema','Unsupported manifest');
  if(observed.schema!=='agent-frc/native-revision-receipt@1')invalid('schema-invalid','/observed/schema','Unsupported receipt');
  for(const [side,d] of [['expected',expected],['observed',observed]]){
    if(!text(d.operationId))invalid('operation-invalid','/'+side+'/operationId','Explicit operation ID required');
    for(const key of ['baselineArchiveSha256','savedArchiveSha256'])if(!hash(d[key]))invalid('archive-pin-invalid','/'+side+'/'+key,'Expected exact archive SHA-256');
  }
  if(!hash(observed.reopenedArchiveSha256))invalid('archive-pin-invalid','/observed/reopenedArchiveSha256','Expected reopened archive SHA-256');
  const allowed=strings(expected.allowedEvidenceBases,'/expected/allowedEvidenceBases');
  if(!allowed.size||[...allowed].some(x=>!bases.includes(x)))invalid('basis-invalid','/expected/allowedEvidenceBases','Declare allowed evidence classes');
  if(!bases.includes(observed.evidenceBasis))invalid('basis-invalid','/observed/evidenceBasis','Declare evidence class');
  const before=bodies(expected.before,'/expected/before'),after=bodies(expected.after,'/expected/after');
  const required=strings(expected.requiredFeatureIds,'/expected/requiredFeatureIds');
  const stages=new Map();
  if(!Array.isArray(observed.stages)||observed.stages.length!==phases.length)invalid('stages-invalid','/observed/stages','Exactly before, after-edit, after-recompute and after-reopen are required');
  else observed.stages.forEach((stage,i)=>{
    const p='/observed/stages/'+i;if(!exact(stage,['name','bodies','featureIds'],p))return;
    if(stage.name!==phases[i])invalid('stage-order-invalid',p+'/name','Required lifecycle stage missing, repeated or out of order');
    stages.set(stage.name,{bodies:bodies(stage.bodies,p+'/bodies'),features:strings(stage.featureIds,p+'/featureIds')});
  });
  if(result.status==='invalid')return finish();
  for(const key of ['operationId','baselineArchiveSha256','savedArchiveSha256'])if(expected[key]!==observed[key])mismatch('source-mismatch','/observed/'+key,'Operation/source differs from independent expectation');
  if(observed.reopenedArchiveSha256!==expected.savedArchiveSha256)mismatch('reopen-source-mismatch','/observed/reopenedArchiveSha256','Reopened archive is not the independently expected saved archive');
  if(!allowed.has(observed.evidenceBasis))mismatch('basis-not-allowed','/observed/evidenceBasis','Observed evidence class is not allowed');
  for(const name of phases){
    const actual=stages.get(name),plan=name==='before'?before:after,p='/observed/stages/'+name;
    for(const [id,pin] of plan){
      if(!actual.bodies.has(id))mismatch('body-missing',p+'/bodies','Expected body missing: '+id);
      else if(actual.bodies.get(id)!==pin)mismatch('body-state-mismatch',p+'/bodies','Geometry/transform/state pin differs: '+id);
    }
    for(const id of actual.bodies.keys())if(!plan.has(id))mismatch('body-unexpected',p+'/bodies','Unexpected or restored body: '+id);
    if(name!=='before')for(const id of required)if(!actual.features.has(id))mismatch('required-feature-missing',p+'/featureIds','Expected persistent operation feature missing: '+id);
  }
  return finish();
}
