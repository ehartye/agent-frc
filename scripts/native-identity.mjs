// Supplied occurrence ancestry and independent body inventory only; no CAD execution.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bases=['synthetic','native-observed','human-reported'];

export function compareNativeIdentity(expected,observed) {
  const result={schema:'agent-frc/native-identity-result@1',status:'matched',issues:[],bodies:[],scope:{
    evidenceBasis:observed?.evidenceBasis??null,
    limit:'Supplied ancestry and body identity agreement only; no CAD execution, topology, transform, complete-capture authentication or physical qualification.',
  }};
  const issue=(status,code,path)=>{if(status==='invalid'||result.status==='matched')result.status=status;result.issues.push({code,path,reason:code});};
  const invalid=(code,path)=>issue('invalid',code,path);
  const mismatch=(code,path)=>issue('mismatch',code,path);
  const finish=()=>{result.issues.sort((a,b)=>a.path.localeCompare(b.path)||a.code.localeCompare(b.code));return result;};
  function exact(value,keys,where) {
    if(!object(value)){invalid('object-required',where);return false;}
    for(const key of keys)if(!Object.hasOwn(value,key))invalid('field-required',where+'/'+key);
    for(const key of Object.keys(value))if(!keys.includes(key))invalid('unsupported-field',where+'/'+key);
    return true;
  }
  function rows(value,where,keys) {
    const map=new Map();
    if(!Array.isArray(value)||!value.length||value.length>10000){invalid('bounded-nonempty-inventory-required',where);return map;}
    value.forEach((row,i)=>{
      const p=where+'/'+i;
      if(!exact(row,keys,p))return;
      if(!id(row.id)){invalid('id-invalid',p);return;}
      if(map.has(row.id))invalid('duplicate-id',p);else map.set(row.id,row);
    });
    return map;
  }
  if(!exact(expected,['schema','archiveSha256','allowedEvidenceBases','bodies'],'/expected')||
     !exact(observed,['schema','archiveSha256','evidenceBasis','occurrences','bodies'],'/observed'))return finish();
  if(expected.schema!=='agent-frc/native-identity-manifest@1')invalid('schema-invalid','/expected/schema');
  if(observed.schema!=='agent-frc/native-identity-receipt@1')invalid('schema-invalid','/observed/schema');
  for(const [side,value] of [['expected',expected],['observed',observed]])if(!hash(value.archiveSha256))invalid('archive-pin-invalid','/'+side+'/archiveSha256');
  if(!Array.isArray(expected.allowedEvidenceBases)||!expected.allowedEvidenceBases.length||expected.allowedEvidenceBases.some(x=>!bases.includes(x))||new Set(expected.allowedEvidenceBases).size!==expected.allowedEvidenceBases.length)invalid('allowed-bases-invalid','/expected/allowedEvidenceBases');
  if(!bases.includes(observed.evidenceBasis))invalid('basis-invalid','/observed/evidenceBasis');
  const plan=rows(expected.bodies,'/expected/bodies',['id','occurrenceId','sourceId','sourceOwnerId']);
  const bodies=rows(observed.bodies,'/observed/bodies',['id','occurrenceId']);
  const nodes=rows(observed.occurrences,'/observed/occurrences',['id','parentId','sourceId']);
  for(const [key,row] of plan)for(const field of ['occurrenceId','sourceId','sourceOwnerId'])if(!id(row[field]))invalid('id-invalid','/expected/bodies/'+key+'/'+field);
  for(const [key,row] of bodies)if(!id(row.occurrenceId)||!nodes.has(row.occurrenceId))invalid('body-occurrence-missing','/observed/bodies/'+key);
  for(const [key,row] of nodes){
    if(row.parentId!==null&&(!id(row.parentId)||!nodes.has(row.parentId)))invalid('parent-missing','/observed/occurrences/'+key);
    if(row.sourceId!==null&&!id(row.sourceId))invalid('source-id-invalid','/observed/occurrences/'+key);
  }
  if(result.status==='invalid')return finish();
  // Resolve the complete graph iteratively, including unused occurrences; no name splitting.
  const resolved=new Map();
  for(const key of nodes.keys()){
    const chain=[],seen=new Set();let current=key;
    while(current!==null&&!resolved.has(current)){
      if(seen.has(current)){invalid('ancestry-cycle','/observed/occurrences/'+current);return finish();}
      seen.add(current);chain.push(current);current=nodes.get(current).parentId;
    }
    let inherited=current===null?{sourceId:null,sourceOwnerId:null}:resolved.get(current);
    while(chain.length){const node=nodes.get(chain.pop());
      if(node.sourceId!==null)inherited={sourceId:node.sourceId,sourceOwnerId:node.id};
      resolved.set(node.id,inherited);
    }
  }
  if(expected.archiveSha256!==observed.archiveSha256)mismatch('archive-mismatch','/observed/archiveSha256');
  if(!expected.allowedEvidenceBases.includes(observed.evidenceBasis))mismatch('basis-not-allowed','/observed/evidenceBasis');
  for(const key of plan.keys())if(!bodies.has(key))mismatch('body-missing','/observed/bodies/'+key);
  for(const [key,body] of bodies){
    const identity=resolved.get(body.occurrenceId);
    result.bodies.push({...body,...identity});
    if(identity.sourceId===null)invalid('source-unresolved','/observed/bodies/'+key);
    const planned=plan.get(key);
    if(!planned)mismatch('body-unexpected','/observed/bodies/'+key);
    else for(const field of ['occurrenceId','sourceId','sourceOwnerId'])if(planned[field]!==({...body,...identity})[field])mismatch('body-identity-mismatch','/observed/bodies/'+key+'/'+field);
  }
  result.bodies.sort((a,b)=>a.id.localeCompare(b.id));
  return finish();
}
