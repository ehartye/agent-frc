// Finite export evidence comparison; no CAD, mesh parsing or application execution.
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const vector=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(finite);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bases=['synthetic','native-observed','human-reported'];
const pointer=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const lex=(a,b)=>a<b?-1:a>b?1:0;

export function compareNativeExport(expected,observed){
 const result={schema:'agent-frc/native-export-result@1',status:'matched',issues:[],scope:{evidenceBasis:text(observed?.evidenceBasis)?observed.evidenceBasis:null,limit:'Agreement of supplied finite inventory and pose/bounds witnesses only; no authentication, native execution, complete geometry, continuous clearance, GUI integration or physical qualification.'}};
 const add=(status,code,path,reason)=>{
  if(status==='invalid'||result.status==='matched')result.status=status;
  result.issues.push({code,path,reason});
 };
 const invalid=(code,path,reason)=>add('invalid',code,path,reason);
 const mismatch=(code,path,reason)=>add('mismatch',code,path,reason);
 const finish=()=>{result.issues.sort((a,b)=>lex(a.path,b.path)||lex(a.code,b.code)||lex(a.reason,b.reason));return result;};
 function ids(value,p,nonempty=true){
  const found=new Set();
  if(!Array.isArray(value)||(nonempty&&value.length===0)){invalid('inventory-invalid',p,'An explicit nonempty identifier array is required');return found;}
  value.forEach((id,i)=>{if(!text(id))invalid('id-invalid',`${p}/${i}`,'A nonempty identifier is required');else if(found.has(id))invalid('duplicate-id',`${p}/${i}`,'Identifier is duplicated');else found.add(id);});
  return found;
 }
 function validate(d,side){
  const p='/'+side,meshMap=new Map(),exclusionMap=new Map(),witnessMap=new Map();
  if(!record(d)){invalid('document-invalid',p,'A JSON object is required');return null;}
  const schema=`agent-frc/native-export-${side==='manifest'?'manifest':'receipt'}@1`;
  if(d.schema!==schema)invalid('schema-invalid',p+'/schema',`Expected ${schema}`);
  if(!record(d.sourcePins)){invalid('source-pin-invalid',p+'/sourcePins','Explicit archiveSha256 and producerSha256 source pins are required');}
  else {
   for(const key of new Set(['archiveSha256','producerSha256',...Object.keys(d.sourcePins)]))if(!hash(d.sourcePins[key]))invalid('source-pin-invalid',p+'/sourcePins/'+pointer(key),'A lowercase 64-digit SHA-256 pin is required');
  }
  if(!record(d.units)||d.units.length!=='m'||d.units.angle!=='rad')invalid('units-invalid',p+'/units','Canonical explicit length m and angle rad units are required');
  if(side==='manifest'){
   if(!Array.isArray(d.allowedEvidenceBases)||d.allowedEvidenceBases.length===0||d.allowedEvidenceBases.some(b=>!bases.includes(b))||new Set(d.allowedEvidenceBases).size!==d.allowedEvidenceBases.length)invalid('allowed-bases-invalid',p+'/allowedEvidenceBases','Declare unique allowed export evidence bases');
  }else if(!bases.includes(d.evidenceBasis))invalid('evidence-basis-invalid',p+'/evidenceBasis','Declare synthetic, native-observed or human-reported evidence');
  const bodies=ids(d.nativeBodies,p+'/nativeBodies'),groups=ids(d.motionGroups,p+'/motionGroups'),frames=ids(d.frames,p+'/frames');
  const memberships=new Map([...bodies].map(id=>[id,0]));
  function member(id,where){
   if(!bodies.has(id))invalid('unknown-body',where,'Body must be in the declared native inventory');
   else {const count=memberships.get(id)+1;memberships.set(id,count);if(count>1)invalid('body-multiple-membership',where,'A native body must belong to one mesh or one exclusion; split appearance bodies are unsupported in v1');}
  }
  if(!Array.isArray(d.meshes)||d.meshes.length===0)invalid('inventory-invalid',p+'/meshes','At least one exported mesh is required');
  else d.meshes.forEach((m,i)=>{
   const where=`${p}/meshes/${i}`;
   if(!record(m)){invalid('mesh-invalid',where,'Mesh must be an object');return;}
   if(!text(m.id))invalid('id-invalid',where+'/id','Mesh ID is required');
   else if(meshMap.has(m.id))invalid('duplicate-id',where+'/id','Mesh ID is duplicated');else meshMap.set(m.id,{value:m,index:i});
   if(!groups.has(m.groupId))invalid('unknown-group',where+'/groupId','Mesh motion group must be declared');
   if(!hash(m.sha256))invalid('mesh-hash-invalid',where+'/sha256','Independent expected and observed mesh SHA-256 identities are required');
   const members=ids(m.bodyIds,where+'/bodyIds');for(const id of members)member(id,where+'/bodyIds');
  });
  if(!Array.isArray(d.exclusions))invalid('inventory-invalid',p+'/exclusions','An explicit exclusion array is required, even when empty');
  else d.exclusions.forEach((e,i)=>{
   const where=`${p}/exclusions/${i}`;
   if(!record(e)){invalid('exclusion-invalid',where,'Exclusion must be an object');return;}
   if(exclusionMap.has(e.bodyId))invalid('duplicate-id',where+'/bodyId','Exclusion body ID is duplicated');else exclusionMap.set(e.bodyId,{value:e,index:i});
   member(e.bodyId,where+'/bodyId');
   if(!text(e.reason))invalid('exclusion-reason-invalid',where+'/reason','A nonempty exclusion reason is required');
  });
  for(const [id,count] of memberships)if(count===0)invalid('body-unaccounted',p+'/nativeBodies','Body '+id+' has no mesh or exclusion');
  const witnessedMeshes=new Set();
  if(!Array.isArray(d.witnesses)||d.witnesses.length===0)invalid('inventory-invalid',p+'/witnesses','An explicit nonempty finite witness array is required');
  else d.witnesses.forEach((w,i)=>{
   const where=`${p}/witnesses/${i}`;
   if(!record(w)){invalid('witness-invalid',where,'Witness must be an object');return;}
   if(!meshMap.has(w.meshId))invalid('unknown-mesh',where+'/meshId','Witness mesh must be declared');else witnessedMeshes.add(w.meshId);
   if(!text(w.poseId))invalid('pose-id-invalid',where+'/poseId','Pose ID is required');
   if(!frames.has(w.frameId))invalid('unknown-frame',where+'/frameId','Witness frame must be declared; no transform is inferred');
   const key=JSON.stringify([w.meshId,w.poseId]);
   if(witnessMap.has(key))invalid('duplicate-witness',where,'Mesh/pose witness is duplicated');else witnessMap.set(key,{value:w,index:i});
   if(!vector(w.translation,3))invalid('vector-invalid',where+'/translation','Finite XYZ translation is required');
   if(!vector(w.rotation,4)||Math.abs(Math.hypot(...w.rotation)-1)>1e-9)invalid('quaternion-invalid',where+'/rotation','Unit quaternion [x,y,z,w] required within norm tolerance 1e-9');
   if(!record(w.bounds)||!vector(w.bounds.min,3)||!vector(w.bounds.max,3)||w.bounds.min.some((v,j)=>v>w.bounds.max[j]))invalid('bounds-invalid',where+'/bounds','Finite ordered XYZ AABB min/max are required');
   if(side==='manifest'&&(!record(w.tolerances)||['position','angular','bounds'].some(k=>!finite(w.tolerances[k])||w.tolerances[k]<0)))invalid('tolerance-invalid',where+'/tolerances','Explicit finite nonnegative position/angular/bounds tolerances are required');
  });
  for(const id of meshMap.keys())if(!witnessedMeshes.has(id))invalid('mesh-witness-missing',p+'/witnesses','Mesh '+id+' has no finite witness');
  return {bodies,groups,frames,meshes:meshMap,exclusions:exclusionMap,witnesses:witnessMap};
 }
 const e=validate(expected,'manifest'),o=validate(observed,'receipt');
 if(result.status==='invalid')return finish();
 function inventory(a,b,p,label){
  for(const id of a)if(!b.has(id))invalid('inventory-missing',p,`${label} ${id} is missing from receipt`);
  for(const id of b)if(!a.has(id))mismatch('inventory-extra',p,`${label} ${id} is unexpected`);
 }
 inventory(new Set(Object.keys(expected.sourcePins)),new Set(Object.keys(observed.sourcePins)),'/receipt/sourcePins','Source pin');
 for(const key of Object.keys(expected.sourcePins))if(Object.hasOwn(observed.sourcePins,key)&&expected.sourcePins[key]!==observed.sourcePins[key])mismatch('source-mismatch','/receipt/sourcePins/'+pointer(key),'Observed source pin differs from the independent expectation');
 if(!expected.allowedEvidenceBases.includes(observed.evidenceBasis))mismatch('evidence-basis-disallowed','/receipt/evidenceBasis','Observed evidence basis is not allowed by the manifest');
 inventory(e.bodies,o.bodies,'/receipt/nativeBodies','Body');inventory(e.groups,o.groups,'/receipt/motionGroups','Motion group');inventory(e.frames,o.frames,'/receipt/frames','Frame');
 inventory(new Set(e.meshes.keys()),new Set(o.meshes.keys()),'/receipt/meshes','Mesh');
 inventory(new Set(e.exclusions.keys()),new Set(o.exclusions.keys()),'/receipt/exclusions','Exclusion');
 for(const [id,{value:m}] of e.meshes){
  const found=o.meshes.get(id);if(!found)continue;const n=found.value,p=`/receipt/meshes/${found.index}`;
  if(m.groupId!==n.groupId)mismatch('group-mismatch',p+'/groupId','Mesh motion group differs from expectation');
  if(m.bodyIds.length!==n.bodyIds.length||m.bodyIds.some(id=>!n.bodyIds.includes(id)))mismatch('mesh-membership-mismatch',p+'/bodyIds','Mesh native-body membership differs from expectation');
  if(m.sha256!==n.sha256)mismatch('mesh-hash-mismatch',p+'/sha256','Mesh artifact identity differs from expectation');
 }
 for(const [id,{value:x}] of e.exclusions){const y=o.exclusions.get(id);if(y&&x.reason!==y.value.reason)mismatch('exclusion-mismatch',`/receipt/exclusions/${y.index}/reason`,'Declared exclusion reason differs from expectation');}
 for(const [key,{value:w}] of e.witnesses){
  const found=o.witnesses.get(key);if(!found){invalid('witness-missing','/receipt/witnesses','Expected mesh/pose '+key+' is missing');continue;}
  const v=found.value,p=`/receipt/witnesses/${found.index}`;
  if(w.frameId!==v.frameId){mismatch('frame-mismatch',p+'/frameId','Witness frames differ; coordinates are not transformed');continue;}
  if(Math.hypot(...w.translation.map((x,j)=>x-v.translation[j]))>w.tolerances.position)mismatch('translation-mismatch',p+'/translation','Translation distance exceeds manifest tolerance');
  const qa=w.rotation.map(x=>x/Math.hypot(...w.rotation)),qb=v.rotation.map(x=>x/Math.hypot(...v.rotation));
  const minus=Math.hypot(...qa.map((x,j)=>x-qb[j])),plus=Math.hypot(...qa.map((x,j)=>x+qb[j]));
  const angle=4*Math.atan2(Math.min(minus,plus),Math.max(minus,plus));
  if(angle>w.tolerances.angular)mismatch('rotation-mismatch',p+'/rotation','Quaternion angular difference exceeds manifest tolerance');
  for(const edge of ['min','max'])if(w.bounds[edge].some((x,j)=>Math.abs(x-v.bounds[edge][j])>w.tolerances.bounds))mismatch('bounds-mismatch',p+'/bounds/'+edge,'AABB coordinate difference exceeds manifest tolerance');
 }
 for(const key of o.witnesses.keys())if(!e.witnesses.has(key))mismatch('witness-extra','/receipt/witnesses','Unexpected mesh/pose '+key);
 return finish();
}
