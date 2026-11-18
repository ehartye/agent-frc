// Compare declared finite joint evidence. No native application, asset loading or dynamics.
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const vector=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(finite);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bases=['synthetic','native-observed','human-reported'];
const pointer=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const lex=(a,b)=>a<b?-1:a>b?1:0;
const ordered=x=>vector(x,2)&&x[0]<=x[1];

export function compareNativeArticulation(expected,observed){
 const result={schema:'agent-frc/native-articulation-result@1',status:'matched',issues:[],scope:{evidenceBasis:text(observed?.evidenceBasis)?observed.evidenceBasis:null,limit:'Agreement of supplied finite archive-bound joint evidence only; no authenticated capture, performed reopen, native execution, mass/inertia, dynamics or physical qualification.'}};
 const add=(status,code,path,reason)=>{if(status==='invalid'||result.status==='matched')result.status=status;result.issues.push({code,path,reason});};
 const invalid=(code,p,reason)=>add('invalid',code,p,reason),mismatch=(code,p,reason)=>add('mismatch',code,p,reason);
 const finish=()=>{result.issues.sort((a,b)=>lex(a.path,b.path)||lex(a.code,b.code)||lex(a.reason,b.reason));return result;};
 function ids(value,p){
  const set=new Set();
  if(!Array.isArray(value)||!value.length){invalid('inventory-invalid',p,'An explicit nonempty identifier array is required');return set;}
  value.forEach((id,i)=>{if(!text(id))invalid('id-invalid',`${p}/${i}`,'Nonempty identifier required');else if(set.has(id))invalid('duplicate-id',`${p}/${i}`,'Identifier is duplicated');else set.add(id);});return set;
 }
 function validate(d,side){
  const p='/'+side,joints=new Map(),witnesses=new Map();
  if(!record(d)){invalid('document-invalid',p,'A JSON object is required');return null;}
  const schema=`agent-frc/native-articulation-${side==='manifest'?'manifest':'receipt'}@1`;
  if(d.schema!==schema)invalid('schema-invalid',p+'/schema',`Expected ${schema}`);
  if(!record(d.sourcePins))invalid('source-pin-invalid',p+'/sourcePins','Explicit archiveSha256 and producerSha256 required');
  else for(const key of new Set(['archiveSha256','producerSha256',...Object.keys(d.sourcePins)]))if(!hash(d.sourcePins[key]))invalid('source-pin-invalid',p+'/sourcePins/'+pointer(key),'Lowercase 64-digit SHA-256 required');
  if(!record(d.units)||d.units.length!=='m'||d.units.angle!=='rad')invalid('units-invalid',p+'/units','Explicit canonical m and rad units required');
  if(side==='manifest'){
   if(!Array.isArray(d.allowedEvidenceBases)||!d.allowedEvidenceBases.length||d.allowedEvidenceBases.some(x=>!bases.includes(x))||new Set(d.allowedEvidenceBases).size!==d.allowedEvidenceBases.length)invalid('allowed-bases-invalid',p+'/allowedEvidenceBases','Declare unique supported allowed evidence bases');
  }else if(!bases.includes(d.evidenceBasis))invalid('evidence-basis-invalid',p+'/evidenceBasis','Declare synthetic, native-observed or human-reported');
  const bodies=ids(d.nativeBodies,p+'/nativeBodies'),frames=ids(d.frames,p+'/frames');
  if(!Array.isArray(d.joints)||!d.joints.length)invalid('inventory-invalid',p+'/joints','A nonempty joint inventory is required');
  else d.joints.forEach((j,i)=>{
   const where=`${p}/joints/${i}`;
   if(!record(j)){invalid('joint-invalid',where,'Joint object required');return;}
   if(!text(j.id))invalid('id-invalid',where+'/id','Joint ID required');
   else if(joints.has(j.id))invalid('duplicate-id',where+'/id','Joint ID duplicated');else joints.set(j.id,{value:j,index:i});
   for(const key of ['parentBodyId','childBodyId'])if(!bodies.has(j[key]))invalid('unknown-body',where+'/'+key,'Joint body must be declared');
   if(j.parentBodyId===j.childBodyId)invalid('self-joint',where,'Parent and child bodies must differ');
   if(!['revolute','prismatic'].includes(j.kind))invalid('joint-kind-invalid',where+'/kind','Only revolute and prismatic supported in v1');
   if(j.unit!==(j.kind==='revolute'?'rad':'m'))invalid('joint-unit-invalid',where+'/unit','Joint coordinates require rad for revolute or m for prismatic');
   if(!frames.has(j.frameId))invalid('unknown-frame',where+'/frameId','Explicit declared frame required');
   if(!vector(j.axis,3)||Math.abs(Math.hypot(...j.axis)-1)>1e-9)invalid('axis-invalid',where+'/axis','Finite unit axis required within norm tolerance 1e-9');
   if(!vector(j.origin,3))invalid('origin-invalid',where+'/origin','Finite XYZ origin required');
   if(j.sign!==1&&j.sign!==-1)invalid('sign-invalid',where+'/sign','Explicit +1 or -1 required');
   if(!finite(j.offset))invalid('offset-invalid',where+'/offset','Explicit finite coordinate zero offset required');
   for(const key of ['nativeLimits','physicalLimits'])if(!ordered(j[key]))invalid('limits-invalid',where+'/'+key,'Finite ordered lower/upper limits required');
   if(side==='manifest'&&(!record(j.tolerances)||['axis','origin','coordinate'].some(k=>!finite(j.tolerances[k])||j.tolerances[k]<0)))invalid('tolerance-invalid',where+'/tolerances','Explicit finite nonnegative axis-angle, origin-distance and coordinate tolerances required');
  });
  const witnessed=new Set();
  if(!Array.isArray(d.witnesses)||!d.witnesses.length)invalid('inventory-invalid',p+'/witnesses','Named finite readbacks required');
  else d.witnesses.forEach((w,i)=>{
   const where=`${p}/witnesses/${i}`;
   if(!record(w)){invalid('witness-invalid',where,'Witness object required');return;}
   if(!joints.has(w.jointId))invalid('unknown-joint',where+'/jointId','Witness joint must be declared');else witnessed.add(w.jointId);
   if(!text(w.poseId))invalid('pose-id-invalid',where+'/poseId','Named pose required');
   const key=JSON.stringify([w.jointId,w.poseId]);
   if(witnesses.has(key))invalid('duplicate-witness',where,'Joint/pose duplicated');else witnesses.set(key,{value:w,index:i});
   if(!frames.has(w.frameId))invalid('unknown-frame',where+'/frameId','Witness frame must be declared');
   if(!finite(w.native)||!finite(w.physical))invalid('readback-invalid',where,'Finite native and physical coordinate readbacks required');
   if(!record(w.reopen)||w.reopen.saved!==true||w.reopen.reopened!==true||!hash(w.reopen.archiveSha256))invalid('reopen-invalid',where+'/reopen','Require saved and reopened markers and archive SHA-256');
  });
  for(const id of joints.keys())if(!witnessed.has(id))invalid('joint-witness-missing',p+'/witnesses','Joint '+id+' lacks a readback');
  return {bodies,frames,joints,witnesses};
 }
 const e=validate(expected,'manifest'),o=validate(observed,'receipt');
 if(result.status==='invalid')return finish();
 function inventory(a,b,p,label){for(const id of a)if(!b.has(id))invalid('inventory-missing',p,`${label} ${id} missing`);for(const id of b)if(!a.has(id))mismatch('inventory-extra',p,`${label} ${id} unexpected`);}
 function checkConsistency(d,m,side){
  const report=side==='manifest'?invalid:mismatch;
  for(const [id,{value:j,index}] of m.joints){
   const tolerance=e.joints.get(id)?.value.tolerances.coordinate;
   if(tolerance===undefined)continue;
   const p=`/${side}/joints/${index}`,mapped=j.nativeLimits.map(n=>j.sign*n+j.offset).sort((a,b)=>a-b);
   if(!mapped.every(finite)){invalid('mapping-nonfinite',p,'Mapped endpoint arithmetic is nonfinite');continue;}
   if(mapped.some((v,i)=>Math.abs(v-j.physicalLimits[i])>tolerance))report('limit-mapping-mismatch',p+'/physicalLimits','Physical limits must be ordered mapped native endpoints');
  }
  for(const {value:w,index} of m.witnesses.values()){
   const j=m.joints.get(w.jointId).value,tolerance=e.joints.get(w.jointId)?.value.tolerances.coordinate;
   if(tolerance===undefined)continue;
   const p=`/${side}/witnesses/${index}`,mapped=j.sign*w.native+j.offset;
   if(w.reopen.archiveSha256!==d.sourcePins.archiveSha256)report('reopen-archive-mismatch',p+'/reopen/archiveSha256','Reopen observation refers to another archive');
   if(w.frameId!==j.frameId)report('witness-frame-mismatch',p+'/frameId','Readback and joint frames must match without inferred transforms');
   if(!finite(mapped))invalid('mapping-nonfinite',p,'Mapped readback arithmetic is nonfinite');
   else if(Math.abs(mapped-w.physical)>tolerance)report('readback-mapping-mismatch',p+'/physical','Physical readback differs from sign * native + offset');
   if(w.native<j.nativeLimits[0]-tolerance||w.native>j.nativeLimits[1]+tolerance||w.physical<j.physicalLimits[0]-tolerance||w.physical>j.physicalLimits[1]+tolerance)report('readback-out-of-range',p,'Readback lies outside declared limits');
  }
 }
 checkConsistency(expected,e,'manifest');checkConsistency(observed,o,'receipt');
 inventory(new Set(Object.keys(expected.sourcePins)),new Set(Object.keys(observed.sourcePins)),'/receipt/sourcePins','Source pin');
 for(const key of Object.keys(expected.sourcePins))if(Object.hasOwn(observed.sourcePins,key)&&expected.sourcePins[key]!==observed.sourcePins[key])mismatch('source-mismatch','/receipt/sourcePins/'+pointer(key),'Source pin differs from independent expectation');
 if(!expected.allowedEvidenceBases.includes(observed.evidenceBasis))mismatch('evidence-basis-disallowed','/receipt/evidenceBasis','Evidence basis not allowed by manifest');
 inventory(e.bodies,o.bodies,'/receipt/nativeBodies','Body');inventory(e.frames,o.frames,'/receipt/frames','Frame');inventory(new Set(e.joints.keys()),new Set(o.joints.keys()),'/receipt/joints','Joint');
 for(const [id,{value:j}] of e.joints){
  const found=o.joints.get(id);if(!found)continue;const k=found.value,p=`/receipt/joints/${found.index}`,t=j.tolerances;
  for(const key of ['parentBodyId','childBodyId'])if(j[key]!==k[key])mismatch('membership-mismatch',p+'/'+key,'Joint body membership differs from expectation');
  if(j.kind!==k.kind)mismatch('kind-mismatch',p+'/kind','Joint kind differs from expectation');
  if(j.frameId!==k.frameId)mismatch('frame-mismatch',p+'/frameId','Joint frames differ; no coordinate transform inferred');
  if(j.sign!==k.sign)mismatch('sign-mismatch',p+'/sign','Native-to-physical sign differs');
  if(j.kind!==k.kind||j.frameId!==k.frameId)continue;
  if(Math.abs(j.offset-k.offset)>t.coordinate)mismatch('offset-mismatch',p+'/offset','Coordinate zero offset differs beyond manifest tolerance');
  const a=j.axis.map(x=>x/Math.hypot(...j.axis)),b=k.axis.map(x=>x/Math.hypot(...k.axis));
  const angle=2*Math.atan2(Math.hypot(...a.map((x,i)=>x-b[i])),Math.hypot(...a.map((x,i)=>x+b[i])));
  if(angle>t.axis)mismatch('axis-mismatch',p+'/axis','Axis direction differs beyond manifest angular tolerance');
  if(Math.hypot(...j.origin.map((x,i)=>x-k.origin[i]))>t.origin)mismatch('origin-mismatch',p+'/origin','Origin distance exceeds manifest tolerance');
  for(const key of ['nativeLimits','physicalLimits'])if(j[key].some((x,i)=>Math.abs(x-k[key][i])>t.coordinate))mismatch('limits-mismatch',p+'/'+key,'Ordered coordinate limits differ beyond manifest tolerance');
 }
 for(const [key,{value:w}] of e.witnesses){
  const found=o.witnesses.get(key);if(!found){invalid('witness-missing','/receipt/witnesses','Expected joint/pose '+key+' missing');continue;}
  const v=found.value,p=`/receipt/witnesses/${found.index}`,j=e.joints.get(w.jointId).value,k=o.joints.get(v.jointId).value;
  if(w.reopen.archiveSha256!==v.reopen.archiveSha256)mismatch('reopen-archive-mismatch',p+'/reopen/archiveSha256','Readback archive differs from independent expectation');
  if(w.frameId!==v.frameId){mismatch('witness-frame-mismatch',p+'/frameId','Readback frames differ');continue;}
  if(j.kind!==k.kind)continue;
  for(const field of ['native','physical'])if(Math.abs(w[field]-v[field])>j.tolerances.coordinate)mismatch('readback-mismatch',p+'/'+field,'Named pose readback exceeds manifest coordinate tolerance');
 }
 for(const key of o.witnesses.keys())if(!e.witnesses.has(key))mismatch('witness-extra','/receipt/witnesses','Unexpected joint/pose '+key);
 return finish();
}
