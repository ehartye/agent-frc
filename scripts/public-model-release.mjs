/** Verify an already-issued model on public CI without transferring private supplier CAD. */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream,lstatSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const schema='agent-frc/signed-model-release@1';
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
  const inputs=delivery.files.map(r=>file(root,r.local??r.path));
  const result=JSON.parse(execFileSync(process.env.PYTHON ?? (process.platform==='win32'?'python':'python3'),
    [fileURLToPath(new URL('./mechanical_readiness.py',import.meta.url)),'review',root,studyName,'--require-publication','--rescan',
      ...delivery.files.flatMap(r=>['--deliver',r.local??r.path])],{encoding:'utf8',maxBuffer:64*1024*1024}));
  check(result.showcaseEligibility==='pass','Candidate did not pass the private issue review');
  const files=[];
  for(const [i,r] of delivery.files.entries())files.push({path:relative(r.path),sha256:await hash(inputs[i])});
  const body={schema,project:delivery.project,scope:delivery.scope,configuration:result.configuration,studySha256:await hash(studyFile),
    stepSha256:study.step.sha256,archiveSha256:study.archive.sha256,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
  opened(body);
  return {body,signature:sign(null,bytes(body),key).toString('base64')};
}
export async function verifyIssued(root,packet,pubKey,project){
  root=realpathSync(root);opened(packet.body);check(packet.body.project===project,'Release belongs to a different project');
  const key=createPublicKey(pubKey);check(key.asymmetricKeyType==='ed25519'&&verify(null,bytes(packet.body),key,Buffer.from(packet.signature,'base64')),'Invalid reviewer signature');
  for(const r of packet.body.files)check(await hash(file(root,r.path))===r.sha256,'Changed signed public asset: '+r.path);
  return new Set(packet.body.files.map(r=>r.path));
}
function git(repo,args){return execFileSync('git',['-C',repo,...args],{maxBuffer:64*1024*1024});}
async function audit(root,base,policyName,packetPath,pubKey){
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
export async function auditStaged(approved,candidate,policyPath,packetPath,pubKey){
  const base=realpathSync(approved),root=realpathSync(candidate),policy=JSON.parse(readFileSync(policyPath));
  check(base!==root && policy.schema==='agent-frc/staged-model-policy@1' && typeof policy.project==='string' &&
    Array.isArray(policy.mutableFieldPages) && Array.isArray(policy.modelFiles) && policy.modelFiles.length,'Invalid independently approved stage policy');
  const fixed=new Set(policy.modelFiles.map(relative)),mutable=new Set(policy.mutableFieldPages.map(relative));
  check([...mutable].every(p=>!fixed.has(p)&&p.endsWith('.html')),'Only explicitly independent field HTML can vary');
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
  for(const name of fixed)check(old.has(name)&&next.has(name),'Registered model output disappeared: '+name);
  for(const name of new Set([...old,...next])){
    if(mutable.has(name)){
      check(old.has(name)&&next.has(name),'Expected registered field page in both stages: '+name);
      if(await hash(file(base,name))===await hash(file(root,name)))continue;
      const witness=process.env.FRC_VERIFIED_FIELD_ROOT;
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
  return {checked:next.size,mutableFieldPages:[...mutable],signed:inspected.size};
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
    }else if(command==='audit-staged'&&[2,4].includes(args.length))console.log(JSON.stringify(await auditStaged(root,...args)));
    else if(command==='audit'&&[2,4].includes(args.length))console.log(JSON.stringify(await audit(root,...args)));
    else throw Error('Usage: public-model-release.mjs issue PRIVATE_ROOT STUDY DELIVERY KEY NEW_PACKET | verify PUBLIC_ROOT PACKET TRUSTED_PUBLIC_KEY PROJECT | audit REPO APPROVED_COMMIT POLICY [PACKET TRUSTED_PUBLIC_KEY]');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
