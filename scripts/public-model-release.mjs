/** Verify an already-issued model on public CI without transferring private supplier CAD. */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream,lstatSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

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
  check(body?.schema===schema && typeof body.project==='string'&&body.project.trim() && typeof body.scope==='string'&&body.scope.trim() &&
    typeof body.configuration==='string'&&body.configuration.trim()&&Number.isSafeInteger(body.solids)&&body.solids>0&&
    hex.test(body.studySha256)&&hex.test(body.archiveSha256)&&hex.test(body.stepSha256)&&Array.isArray(body.files)&&body.files.length,'Invalid model receipt');
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
  opened(body);
  return {body,signature:sign(null,bytes(body),key).toString('base64')};
}
export async function verifyIssued(root,packet,pubKey,project){
  root=realpathSync(root);opened(packet.body);check(packet.body.project===project,'Release belongs to a different project');
  const key=createPublicKey(pubKey);check(key.asymmetricKeyType==='ed25519'&&verify(null,bytes(packet.body),key,Buffer.from(packet.signature,'base64')),'Invalid reviewer signature');
  for(const r of packet.body.files)check(await hash(file(root,r.path))===r.sha256,'Changed signed public asset: '+r.path);
  return new Set(packet.body.files.map(r=>r.path));
}
export async function verifyPair(sourceRoot,sourcePacket,stageRoot,stagePacket,key,project){
  await verifyIssued(sourceRoot,sourcePacket,key,project);
  await verifyIssued(stageRoot,stagePacket,key,project);
  for(const identity of ['project','scope','configuration','archiveSha256','stepSha256','studySha256','solids']){
    check(sourcePacket.body[identity]===stagePacket.body[identity],'Staged packet names a different engineering issue: '+identity);
  }
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
  const reviewed=packetPath?await verifyIssued(root,JSON.parse(readFileSync(packetPath)),readFileSync(pubKey),policy.project):new Set();
  const names=new Set(policy.modelFiles.map(relative));
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
  if(sourceCommit) {
    const required=new Set([...names,...reviewed]);
    if(packetPath) required.add(path.relative(root,packetPath).split(path.sep).join('/'));
    for(const name of required) verifyCommittedFile(root,sourceCommit,name);
  }
  for(const n of names){
    const current=file(root,n);
    if(reviewed.has(n))continue;
    let old;
    try{old=git(root,['rev-parse','--verify',base+':'+n]).toString().trim();}catch{throw Error('Unreviewed new public model asset: '+n);}
    const actual=git(root,['hash-object','--no-filters',current]).toString().trim();
    check(old===actual,'Changed public model asset without matching approved issue: '+n);
  }
  return {verifiedFiles:names.size,signedFiles:reviewed.size,baseline:base};
}
export async function auditStaged(approved,candidate,policyPath,packetPath,pubKey,fieldRoot=process.env.FRC_VERIFIED_FIELD_ROOT){
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
  const inspected=packetPath?await verifyIssued(root,JSON.parse(readFileSync(packetPath)),readFileSync(pubKey),policy.project):new Set();
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
  for(const name of Object.keys(fieldData))check(old.has(name)&&next.has(name),'Registered field data disappeared: '+name);
  for(const name of fixed)check(old.has(name)&&next.has(name),'Registered model output disappeared: '+name);
  for(const name of new Set([...old,...next])){
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
    if(inspected.has(name)&&next.has(name))continue;
    check(old.has(name)&&next.has(name),'Unreviewed added or removed output: '+name);
    check(await hash(file(base,name))===await hash(file(root,name)),'Unreviewed changed published output: '+name);
  }
  return {checked:next.size,mutableFieldPages:[...mutable],mutableFieldData:Object.keys(fieldData),signed:inspected.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [command,root,...args]=process.argv.slice(2);
    if(command==='issue'&&args.length===4){
      const [study,files,key,out]=args;
      const packet=await issue(root,study,JSON.parse(readFileSync(files)),key);
      writeFileSync(out,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
    }else if(command==='verify'&&args.length===3){
      await verifyIssued(root,JSON.parse(readFileSync(args[0])),readFileSync(args[1]),args[2]);console.log('Verified exact public issue.');
    }else if(command==='verify-pair'&&args.length===5){
      const [sourcePacket,stage,stagePacket,key,project]=args;
      await verifyPair(root,JSON.parse(readFileSync(sourcePacket)),stage,JSON.parse(readFileSync(stagePacket)),readFileSync(key),project);
      console.log('Verified both delivery trees against the same engineering issue.');
    }else if(command==='audit-staged'&&[2,4].includes(args.length))console.log(JSON.stringify(await auditStaged(root,...args)));
    else if(command==='audit'&&[2,4].includes(args.length))console.log(JSON.stringify(await audit(root,...args)));
    else throw Error('Usage: public-model-release.mjs issue PRIVATE_ROOT STUDY DELIVERY KEY NEW_PACKET | verify PUBLIC_ROOT PACKET TRUSTED_PUBLIC_KEY PROJECT | audit REPO APPROVED_COMMIT POLICY [PACKET TRUSTED_PUBLIC_KEY]');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
