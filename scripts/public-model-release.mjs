/** Verify an already-issued model on public CI without transferring private supplier CAD. */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream,lstatSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

import {activeDesignFor} from './active-design.mjs';
import {addsOnlySecondaryLink,auditTree,checkSourceInputs,preliminaryPolicy} from './preliminary-release.mjs';

const numberedSchema='agent-frc/signed-model-release@10';
const schema='agent-frc/signed-model-release@9';
const geometry=/\.(?:f3[dz]|stp|iges|igs|brep|step|gltf|glb|stl(?:\.gz)?|obj|3mf)$/i;
const hex=/^[0-9a-f]{64}$/;
function check(ok,message){if(!ok)throw Error(message);}
function relative(name){
  check(typeof name==='string'&&name.length&&!name.startsWith('/')&&!name.includes('\\')&&
    !name.includes(':')&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'&&x!=='.git'),'Expected a safe relative public path');
  return name;
}
function file(root,name){
  const f=realpathSync(path.resolve(root,relative(name))),rel=path.relative(root,f);
  check(rel!== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel) && lstatSync(f).isFile(),'File outside the issue: '+name);
  return f;
}
async function hash(f){
  const h=createHash('sha256');for await(const chunk of createReadStream(f))h.update(chunk);return h.digest('hex');
}
const bytes=x=>Buffer.from(JSON.stringify(x));
function opened(body){
  check((body?.schema===schema || body?.schema===numberedSchema) && typeof body.project==='string'&&body.project.trim() && typeof body.scope==='string'&&body.scope.trim() &&
    typeof body.configuration==='string'&&body.configuration.trim()&&Number.isSafeInteger(body.solids)&&body.solids>0&&
    hex.test(body.studySha256)&&hex.test(body.archiveSha256)&&hex.test(body.stepSha256)&&Array.isArray(body.files)&&body.files.length,'Invalid model receipt');
  if(body.schema===numberedSchema) {
    const i=body.iteration;
    check(i && Number.isInteger(i.number) && i.number>=1 && i.number<=999 && typeof i.id==='string' && i.id.length &&
      ['whole-robot','subsystem'].includes(i.kind) && [i.openingSha256,i.authoritySha256,i.lineageSha256].every(v=>hex.test(v)),
      'Invalid numbered engineering issue');
  }else check(body.iteration===undefined,'Unsigned iteration identity in legacy schema');
  const paths=new Set();
  for(const r of body.files){
    relative(r.path);check(!paths.has(r.path)&&hex.test(r.sha256),'Duplicate or invalid public asset');paths.add(r.path);
  }
}
export async function issue(root,studyName,delivery,keyFile){
  root=realpathSync(root);const privatePath=realpathSync(keyFile);
  const keyRelative=path.relative(root,privatePath);
  check(keyRelative==='..'||keyRelative.startsWith('..'+path.sep)||path.isAbsolute(keyRelative),'Keep the signing key outside the project tree');
  const key=createPrivateKey(readFileSync(privatePath));check(key.asymmetricKeyType==='ed25519','Use an Ed25519 reviewer key');
  const studyFile=file(root,studyName),study=JSON.parse(readFileSync(studyFile,'utf8'));
  for(const asset of delivery.files){
    const extension=name=>name.toLowerCase().endsWith('.stl.gz')?'.stl.gz':path.extname(name).toLowerCase();
    check(extension(asset.local??asset.path)===extension(asset.path),'Public asset type differs from the reviewed source');
  }
  const inputs=delivery.files.map(r=>file(root,r.local??r.path));
  const result=JSON.parse(execFileSync(process.env.PYTHON ?? (process.platform==='win32'?'python':'python3'),
    [fileURLToPath(new URL('./mechanical_readiness.py',import.meta.url)),'review',root,studyName,'--require-publication','--rescan',
      ...delivery.files.flatMap(r=>['--deliver',r.local??r.path])],{encoding:'utf8',maxBuffer:64*1024*1024}));
  check(result.showcaseEligibility==='pass','Candidate did not pass the private issue review');
  const files=[];
  for(const item of inputs){
    if(path.extname(item).toLowerCase()!=='.json')continue;
    const data=JSON.parse(readFileSync(item,'utf8').replace(/^\uFEFF/,''));
    if(['agent-frc/cad-still@1','agent-frc/cad-still@2'].includes(data?.schema)){
      check(data.solids===result.solids && data.sourceSha256===result.stepSha256,'Registered display receipt differs from reviewed geometry and census');
    }
  }
  for(const [i,r] of delivery.files.entries())files.push({path:relative(r.path),sha256:await hash(inputs[i])});
  const body={schema,project:delivery.project,scope:delivery.scope,configuration:result.configuration,studySha256:await hash(studyFile),
    stepSha256:study.step.sha256,archiveSha256:study.archive.sha256,solids:result.solids,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
  if(result.iteration){
    body.iteration=result.iteration;body.schema=numberedSchema;
    check(body.scope===result.iteration.kind,'Use the independently commissioned publication scope');
  }
  opened(body);
  if(process.env.FRC_ACTIVE_MODEL_SELECTION){
    const target=JSON.parse(process.env.FRC_ACTIVE_MODEL_SELECTION);
    check(target.schema===selectionSchema && target.project===body.project,'Select the commissioned project');
    assertOpening(body,{number:target.number,id:target.id,openingSha256:target.openingSha256});
  }else check(process.env.FRC_REQUIRE_ACTIVE_MODEL_SELECTION!=='true','Supply the protected active model selection');
  return {body,signature:sign(null,bytes(body),key).toString('base64')};
}
function verifySignature(packet,pubKey,project){
  opened(packet.body);check(packet.body.project===project,'Release belongs to a different project');
  const key=createPublicKey(pubKey);check(key.asymmetricKeyType==='ed25519'&&verify(null,bytes(packet.body),key,Buffer.from(packet.signature,'base64')),'Invalid reviewer signature');
}
export async function verifyIssued(root,packet,pubKey,project){
  root=realpathSync(root);verifySignature(packet,pubKey,project);
  for(const r of packet.body.files)check(await hash(file(root,r.path))===r.sha256,'Changed signed public asset: '+r.path);
  return new Set(packet.body.files.map(r=>r.path));
}
const selectionSchema='agent-frc/active-model-selection@1';
function selectedIssue(body) {
  return Object.fromEntries(['scope','configuration','studySha256','archiveSha256','stepSha256','solids'].map(k=>[k,body[k]]).concat(
    ['authoritySha256','lineageSha256'].map(k=>[k,body.iteration[k]])));
}
async function projectOpening(root) {
  const design=activeDesignFor(path.join(root,'.model-selection'));
  if(!design)return null;
  const name=path.join(design,'..','iteration.json'),record=JSON.parse(readFileSync(name,'utf8'));
  check(record.id===record.fusionId,'Different active Fusion identity');
  return {number:record.number,id:record.id,openingSha256:await hash(name)};
}
function assertOpening(body,opening) {
  check(body.schema===numberedSchema && Object.entries(opening).every(([k,v])=>body.iteration[k]===v),
    'Release belongs to a different active design iteration');
}
function sameIssue(expected,body) {
  const actual=selectedIssue(body);
  return expected && Object.keys(expected).length===Object.keys(actual).length && Object.entries(actual).every(([k,v])=>expected[k]===v);
}
export async function selectActive(root,project,packet,key,studyName) {
  root=realpathSync(root); const opening=await projectOpening(root);
  check(opening && typeof project==='string' && project.trim(),'Select a numbered active design and project');
  const result={schema:selectionSchema,project,...opening,issue:null};
  if(!packet)return result;
  // A private issue may give a derivative a different public delivery path.
  verifySignature(packet,key,project);
  assertOpening(packet.body,opening);
  const authority=path.join(activeDesignFor(path.join(root,'.model-selection')),'cad','fusion-authority.json');
  check(await hash(authority)===packet.body.iteration.authoritySha256,'Current native authority differs from the signed issue');
  const studyFile=file(root,studyName);
  check(await hash(studyFile)===packet.body.studySha256,'Selected study differs from the signed issue');
  const study=JSON.parse(readFileSync(studyFile,'utf8'));
  const lineage=file(root,study.lineage.file);
  check(await hash(lineage)===packet.body.iteration.lineageSha256,'Current export lineage differs from the reviewed issue');
  const replay=JSON.parse(execFileSync(process.env.PYTHON ?? (process.platform==='win32'?'python':'python3'),
    [fileURLToPath(new URL('./fusion_authority.py',import.meta.url)),root,authority,lineage],{encoding:'utf8'}));
  check(replay.archiveSha256===packet.body.archiveSha256 && replay.stepSha256===packet.body.stepSha256 &&
    replay.configuration===packet.body.configuration,'Selected native and STEP differ from the current cold issue');
  result.issue=selectedIssue(packet.body);return result;
}
export async function verifyCurrent(root,body,project) {
  const opening=await projectOpening(root);
  if(opening) assertOpening(body,opening);
  const setting=process.env.FRC_ACTIVE_MODEL_SELECTION;
  if(!setting){
    check(process.env.FRC_REQUIRE_ACTIVE_MODEL_SELECTION!=='true' && !opening && body.schema!==numberedSchema,'A numbered replacement needs a protected active model selection');
    return;
  }
  const selection=JSON.parse(setting);
  check(selection?.schema===selectionSchema && selection.project===project && selection.issue,
    'The protected selection has no qualified active replacement for this project');
  assertOpening(body,{number:selection.number,id:selection.id,openingSha256:selection.openingSha256});
  check(sameIssue(selection.issue,body) && body.scope===body.iteration.kind &&
    body.scope===(process.env.FRC_MODEL_SCOPE??'whole-robot'),'Different active native issue or commissioned model scope');
}
export async function verifyDeliveryPair(sourceRoot,sourcePacket,stageRoot,stagePacket,key,project){
  await verifyIssued(sourceRoot,sourcePacket,key,project);
  await verifyIssued(stageRoot,stagePacket,key,project);
  check(JSON.stringify(sourcePacket.body.iteration)===JSON.stringify(stagePacket.body.iteration),'Staged packet names a different numbered design');
  for(const identity of ['project','scope','configuration','archiveSha256','stepSha256','studySha256','solids']){
    check(sourcePacket.body[identity]===stagePacket.body[identity],'Staged packet names a different engineering issue: '+identity);
  }
}
export async function verifyPair(sourceRoot,sourcePacket,stageRoot,stagePacket,key,project){
  await verifyDeliveryPair(sourceRoot,sourcePacket,stageRoot,stagePacket,key,project);
  await verifyCurrent(sourceRoot,sourcePacket.body,project);
}
function git(repo,args){return execFileSync('git',['-C',repo,...args],{maxBuffer:64*1024*1024});}
export function verifyCommittedFile(root,commit,name) {
  const current=git(root,['hash-object','--no-filters',file(root,name)]).toString().trim();
  const entry=git(root,['ls-tree','-z',commit,'--',':(literal)'+name]).toString();
  check(entry.match(/^100(?:644|755) blob ([0-9a-f]+)\t/)?.[1]===current,
    'Selected source differs from committed bytes: '+name);
}
export async function audit(root,base,policyName,packetPath,pubKey,sourceCommit){
  root=realpathSync(root);relative(policyName);check(/^[a-f0-9]{40}$/.test(base),'Pin the approved baseline commit from trusted CI');
  // Both the path inventory and scope are read from the approved tree, never from the candidate.
  const policy=JSON.parse(git(root,['show',base+':'+policyName]));
  check(policy.schema==='agent-frc/public-model-policy@1' && typeof policy.project==='string' &&
    Array.isArray(policy.publicRoots)&&policy.publicRoots.length&&Array.isArray(policy.modelFiles)&&policy.modelFiles.length,'Invalid trusted public model inventory');
  const publicRoots=policy.publicRoots.map(relative);
  const packet=packetPath?JSON.parse(readFileSync(packetPath)):null;
  const reviewed=packet?await verifyIssued(root,packet,readFileSync(pubKey),policy.project):new Set();
  const names=new Set(policy.modelFiles.map(relative));
  // Work-in-progress preliminary inputs: opt-in, receipt-bound, immutable once issued and never a registered model.
  const spec=policy.preliminaryInputs;
  check(spec===undefined||spec&&typeof spec==='object'&&Object.keys(spec).join()==='root'&&typeof spec.root==='string',
    'preliminaryInputs needs exactly a root');
  const prelimRoot=spec===undefined?null:relative(spec.root);
  const insidePrelim=n=>prelimRoot!==null&&n.startsWith(prelimRoot+'/');
  check(![...names,...reviewed].some(insidePrelim),'Keep registered and signed models outside the preliminary input tree');
  for(const dir of publicRoots){
    const location=path.resolve(root,dir);
    check(realpathSync(location)===location,'Public root must be a real project directory');
    function visit(base){
      for(const item of readdirSync(base,{withFileTypes:true})){
        const abs=path.join(base,item.name);
        check(!item.isSymbolicLink(),'Redirected public item: '+item.name);
        if(item.isDirectory())visit(abs);
        else if(geometry.test(item.name))names.add(path.relative(root,abs).split(path.sep).join('/'));
      }
    }
    visit(location);
    const old=git(root,['ls-tree','-r','--name-only','-z',base,'--',dir]).toString().split('\0');
    for(const n of old)if(geometry.test(n))names.add(n);
  }
  const preliminaryInputs=[],prelimAuthorized=new Set();
  if(prelimRoot!==null){
    const issued=new Map(),knownModels=new Set();
    for(const row of git(root,['ls-tree','-r','-z',base]).toString().split('\0').filter(Boolean)){
      const tab=row.indexOf('\t');
      if(geometry.test(row.slice(tab+1))&&!insidePrelim(row.slice(tab+1)))knownModels.add(row.slice(0,tab).split(' ')[2]);
    }
    for(const n of [...names,...reviewed])if(!insidePrelim(n)&&lstatSync(path.join(root,n),{throwIfNoEntry:false})?.isFile())
      knownModels.add(git(root,['hash-object','--no-filters',file(root,n)]).toString().trim());
    for(const n of git(root,['ls-tree','-r','--name-only','-z',base,'--',prelimRoot]).toString().split('\0').filter(Boolean)){
      const [id,...rest]=n.slice(prelimRoot.length+1).split('/');
      if(!rest.length)continue; // A loose file beside the release directories is not a release; geometry there keeps the full gate.
      if(!issued.has(id))issued.set(id,new Set());
      issued.get(id).add(rest.join('/'));
    }
    const listing=dir=>{
      const found=new Set();
      (function walk(d,prefix){
        for(const item of readdirSync(d,{withFileTypes:true})){
          check(!item.isSymbolicLink(),'Redirected preliminary input: '+prefix+item.name);
          if(item.isDirectory())walk(path.join(d,item.name),prefix+item.name+'/');
          else found.add(prefix+item.name);
        }
      })(dir,'');
      return found;
    };
    for(const [id,expected] of issued){
      const dir=path.join(root,prelimRoot,id),present=lstatSync(dir,{throwIfNoEntry:false})?.isDirectory()?listing(dir):new Set();
      for(const name of new Set([...expected,...present])){
        const full=prelimRoot+'/'+id+'/'+name;
        check(expected.has(name)&&present.has(name)&&
          git(root,['rev-parse','--verify',base+':'+full]).toString().trim()===git(root,['hash-object','--no-filters',file(root,full)]).toString().trim(),
          'An issued preliminary input changed, appeared or was removed: '+id+'/'+name);
      }
    }
    const fresh=new Set([...names].filter(n=>insidePrelim(n)&&n.slice(prelimRoot.length+1).split('/').length===2&&!issued.has(n.slice(prelimRoot.length+1).split('/')[0])).map(n=>n.slice(prelimRoot.length+1).split('/')[0]));
    for(const id of [...fresh].sort()){
      const dir=path.join(root,prelimRoot,id),files=new Map();
      for(const item of readdirSync(dir,{withFileTypes:true})){
        check(!item.isSymbolicLink(),'Redirected preliminary input: '+id+'/'+item.name);
        if(item.isFile())files.set(item.name,readFileSync(path.join(dir,item.name)));
      }
      const {step}=checkSourceInputs(id,files);
      // A preliminary STEP can never be a copy of a registered, signed or previously committed model.
      const stepPath=prelimRoot+'/'+id+'/'+step,stepOid=git(root,['hash-object','--no-filters',file(root,stepPath)]).toString().trim();
      check(!knownModels.has(stepOid),'A preliminary input duplicates an existing model: '+stepPath);
      prelimAuthorized.add(stepPath);
      if(sourceCommit)for(const name of files.keys())verifyCommittedFile(root,sourceCommit,prelimRoot+'/'+id+'/'+name);
      preliminaryInputs.push(id);
    }
  }
  if(sourceCommit) {
    const required=new Set([...names,...reviewed]);
    if(packetPath) required.add(path.relative(root,packetPath).split(path.sep).join('/'));
    for(const name of required) verifyCommittedFile(root,sourceCommit,name);
  }
  let authorized=0;
  for(const n of names){
    const current=file(root,n);
    let old;
    try{old=git(root,['rev-parse','--verify',base+':'+n]).toString().trim();}catch{old=null;}
    const actual=git(root,['hash-object','--no-filters',current]).toString().trim();
    if(n==='README.md'&&old&&actual!==old&&policy.preliminaryReadmeLink){
      const url=new URL(policy.preliminaryReadmeLink);
      check(url.protocol==='https:'&&url.href===policy.preliminaryReadmeLink&&!/[\s()<>]/.test(url.href),'Invalid preliminary README URL');
      const before=git(root,['cat-file','blob',old]);
      const suffix=Buffer.from('\n[Work-in-progress preliminary design]('+url.href+')\n');
      if(Buffer.concat([before,suffix]).equals(readFileSync(current)))continue;
    }
    if(old===null && prelimAuthorized.has(n))continue;
    if(old!==actual && reviewed.has(n)){
      if(!authorized)await verifyCurrent(root,packet.body,policy.project);
      authorized++;continue;
    }
    check(old!==null,'Unreviewed new public model asset: '+n);
    check(old===actual,'Changed public model asset without matching approved issue: '+n);
  }
  return {authorizedChanges:authorized,verifiedFiles:names.size,signedFiles:reviewed.size,baseline:base,preliminaryInputs};
}
export async function auditStaged(approved,candidate,policyPath,packetPath,pubKey,fieldRoot=process.env.FRC_VERIFIED_FIELD_ROOT,sourceRoot=candidate){
  const base=realpathSync(approved),root=realpathSync(candidate),policy=typeof policyPath==='string'?JSON.parse(readFileSync(policyPath)):policyPath;
  check(base!==root && policy.schema==='agent-frc/staged-model-policy@1' && typeof policy.project==='string' &&
    Array.isArray(policy.mutableFieldPages) && Array.isArray(policy.modelFiles) && policy.modelFiles.length,'Invalid independently approved stage policy');
  const fixed=new Set(policy.modelFiles.map(relative)),mutable=new Set(policy.mutableFieldPages.map(relative));
  check([...mutable].every(p=>!fixed.has(p)&&p.endsWith('.html')),'Only explicitly independent field HTML can vary');
  const fieldData=policy.mutableFieldData??{};
  check(fieldData && typeof fieldData==='object' && !Array.isArray(fieldData),'Supply a map of field data paths to approved JSON shapes');
  for(const [name,contract] of Object.entries(fieldData)){
    relative(name);
    check(contract && typeof contract==='object' && !Array.isArray(contract) &&
      Object.keys(contract).every(key=>key==='schema'||key==='keys') &&
      (contract.schema===undefined||typeof contract.schema==='string'&&contract.schema.length>0) &&
      (contract.keys===undefined||Array.isArray(contract.keys)&&contract.keys.length>0&&
        contract.keys.every(key=>typeof key==='string'&&key.length>0)&&new Set(contract.keys).size===contract.keys.length),
      'Field data needs a well-formed published schema or key inventory');
    check(name.endsWith('.json')&&!fixed.has(name)&&!mutable.has(name)&&contract&&
      (typeof contract.schema==='string' && contract.schema.length || Array.isArray(contract.keys)&&contract.keys.length),
      'Each mutable field JSON needs a separate path and approved schema or exact key inventory');
  }
  function checkFieldData(name,folder){
    const contract=fieldData[name],value=JSON.parse(readFileSync(file(folder,name),'utf8').replace(/^\uFEFF/,''));
    check(value && typeof value==='object'&&!Array.isArray(value)&&
      (contract.schema===undefined||value.schema===contract.schema)&&
      (contract.keys===undefined||JSON.stringify(Object.keys(value).sort())===JSON.stringify([...contract.keys].sort())),
      'Field data differs from approved JSON schema or keys: '+name);
  }
  const packet=packetPath?JSON.parse(readFileSync(packetPath)):null;
  const inspected=packet?await verifyIssued(root,packet,readFileSync(pubKey),policy.project):new Set();
  let authorized=0;
  function inventory(folder){
    const entries=new Set();
    function walk(dir){
      for(const d of readdirSync(dir,{withFileTypes:true})){
        check(!d.isSymbolicLink(),'Redirected deployment item');
        const f=path.join(dir,d.name);
        if(d.isDirectory())walk(f);
        else if(d.isFile())entries.add(path.relative(folder,f).split(path.sep).join('/'));
        else throw Error('Unsupported deployment item');
      }
    }
    walk(folder);return entries;
  }
  const old=inventory(base),next=inventory(root);
  // Work-in-progress preliminary releases are a separate, opt-in class: receipt-checked, never signed, never primary.
  const prelim=preliminaryPolicy(policy.preliminaryReleases,[...fixed,...mutable,...Object.keys(fieldData)]);
  let preliminary=null,secondaryLink=null;
  if(prelim){
    for(const name of inspected)check(!prelim.inside(name),'A signed packet cannot authorize preliminary output: '+name);
    for(const name of prelim.primary){
      check(old.has(name)&&next.has(name),'An approved primary entry point is missing: '+name);
      if(inspected.has(name)||await hash(file(base,name))===await hash(file(root,name)))continue;
      // The one declared page may gain exactly one plain relative link to the preliminary tree.
      if(name===prelim.secondaryLink&&addsOnlySecondaryLink(readFileSync(file(base,name)),readFileSync(file(root,name)),prelim.root)){
        secondaryLink=name;continue;
      }
      throw Error('The approved primary entry point changed without a signed detailed-model issue: '+name);
    }
    const tree=(folder,names)=>new Map([...names].filter(n=>prelim.inside(n)).map(n=>[n.slice(prelim.root.length+1),readFileSync(file(folder,n))]));
    preliminary=auditTree(tree(base,old),tree(root,next),prelim);
  }
  for(const name of Object.keys(fieldData))check(old.has(name)&&next.has(name),'Registered field data disappeared: '+name);
  for(const name of fixed)check(old.has(name)&&next.has(name),'Registered model output disappeared: '+name);
  for(const name of new Set([...old,...next])){
    if(prelim?.inside(name)||name===secondaryLink)continue;
    if(mutable.has(name)||Object.hasOwn(fieldData,name)){
      if(Object.hasOwn(fieldData,name)){
        check(old.has(name)&&next.has(name),'Expected the registered field data in both stages: '+name);
        checkFieldData(name,base);checkFieldData(name,root);
      }
      check(old.has(name)&&next.has(name),'Expected registered field page in both stages: '+name);
      if(await hash(file(base,name))===await hash(file(root,name)))continue;
      const witness=fieldRoot;
      check(witness,'Regenerate changed field pages independently using the trusted plugin');
      const trusted=realpathSync(witness);
      for(const unsafe of [base,root]){
        const rel=path.relative(unsafe,trusted);
        check(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),'Field rebuild must be outside both deployed trees');
      }
      check(await hash(file(trusted,name))===await hash(file(root,name)),'Field page differs from independently regenerated output: '+name);
      continue;
    }
    if(inspected.has(name)&&next.has(name)){
      if(!old.has(name) || await hash(file(base,name))!==await hash(file(root,name))){
        if(!authorized)await verifyCurrent(sourceRoot,packet.body,policy.project);
        authorized++;
      }
      continue;
    }
    check(old.has(name)&&next.has(name),'Unreviewed added or removed output: '+name);
    check(await hash(file(base,name))===await hash(file(root,name)),'Unreviewed changed published output: '+name);
  }
  return {authorizedChanges:authorized,checked:next.size,mutableFieldPages:[...mutable],mutableFieldData:Object.keys(fieldData),signed:inspected.size,preliminary,secondaryLink};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [command,root,...args]=process.argv.slice(2);
    if(command==='check-selection'&&args.length===1){
      await verifyCurrent(root,JSON.parse(readFileSync(0,'utf8')),args[0]);
    }else if(command==='select'&&[1,4].includes(args.length)){
      console.log(JSON.stringify(await selectActive(root,args[0],args[1]?JSON.parse(readFileSync(args[1])):undefined,args[2]?readFileSync(args[2]):undefined,args[3])));
    }else if(command==='issue'&&args.length===4){
      const [study,files,key,out]=args;
      const packet=await issue(root,study,JSON.parse(readFileSync(files)),key);
      writeFileSync(out,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
    }else if(command==='verify'&&args.length===3){
      const packet=JSON.parse(readFileSync(args[0]));await verifyIssued(root,packet,readFileSync(args[1]),args[2]);await verifyCurrent(root,packet.body,args[2]);console.log('Verified exact public issue.');
    }else if(command==='verify-pair'&&args.length===5){
      const [sourcePacket,stage,stagePacket,key,project]=args;
      await verifyPair(root,JSON.parse(readFileSync(sourcePacket)),stage,JSON.parse(readFileSync(stagePacket)),readFileSync(key),project);
      console.log('Verified both delivery trees against the same engineering issue.');
    }else if(command==='audit-staged'&&[2,4].includes(args.length))console.log(JSON.stringify(await auditStaged(root,...args)));
    else if(command==='audit'&&[2,4].includes(args.length))console.log(JSON.stringify(await audit(root,...args)));
    else throw Error('Usage: public-model-release.mjs issue PRIVATE_ROOT STUDY DELIVERY KEY NEW_PACKET | verify PUBLIC_ROOT PACKET TRUSTED_PUBLIC_KEY PROJECT | audit REPO APPROVED_COMMIT POLICY [PACKET TRUSTED_PUBLIC_KEY]');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
