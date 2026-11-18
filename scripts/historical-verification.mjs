import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const ROOT=path.resolve(import.meta.dirname,'..');
const CASE='acquisition-contract';
const PATHS=['scripts/acquisition-contract.py','case-studies/integrated-prototype-targets.json','case-studies/coral-mass-evidence.json','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/IntegratedPregripPrototype.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/PoweredGuidePlant.java','case-studies/acquisition-contract.json','scripts/test-acquisition-contract.py'];
const TESTS=['test_controls','test_domain','test_energy_and_continuity','test_fresh','test_mass_bounds','test_rebound_and_stop_loss'];
const ARGV=['-I','-B',PATHS[6]];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const issue=(r,status,code,message)=>{r.status=status;r.issues.push({code,message});return r;};
export const exitCode=r=>['ready','passed'].includes(r.status)?0:r.status==='failed'?1:2;
export function loadRegistry(root=ROOT){const bytes=fs.readFileSync(path.join(root,'case-studies/historical-verification-registry.json'));return {bytes};}

function git(root,args){
 const p=spawnSync('git',['--no-optional-locks','--literal-pathspecs','-C',root,...args],{shell:false,timeout:10000,maxBuffer:8*1024*1024,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});
 if(p.error||p.status!==0)throw Error(p.error?.message||p.stderr?.toString()||'Git object unavailable');
 return p.stdout;
}
function readTreeEntry(root,locator,p){
 const text=git(root,['ls-tree','-z',locator,'--',p]).toString('utf8');
 const m=text.match(/^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40})\t([^\0]+)\0$/);
 if(!m||m[4]!==p)throw Error(`Missing tree entry: ${p}`);
 return {mode:m[1],type:m[2],oid:m[3]};
}
function validRegistry(reg){
 if(reg?.schema!=='agent-frc/historical-verification-registry@1'||!Array.isArray(reg.cases)||reg.cases.length!==1)throw Error('Unsupported registry schema or case inventory');
 const c=reg.cases[0];
 if(c.id!==CASE||!equal(c.argv,ARGV)||!equal(c.tests,TESTS)||!(/^[a-f0-9]{40}$/).test(c.locator))throw Error('Unsupported case, command, test inventory or locator');
 if(!Array.isArray(c.files)||c.files.length!==PATHS.length)throw Error('Expected exactly seven reviewed dependencies');
 const seen=new Set();
 for(const f of c.files){
  if(typeof f.path!=='string'||/[\\:\0]/.test(f.path)||f.path.split('/').some(s=>!s||s==='.'||s==='..')||!PATHS.includes(f.path)||seen.has(f.path.toLowerCase()))throw Error('Unsafe, unknown or duplicate dependency path');
  if(!/^[a-f0-9]{40}$/.test(f.blob)||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Malformed dependency identity');
  seen.add(f.path.toLowerCase());
 }
 return c;
}
function cleanOwned(temp){
 const resolved=path.resolve(temp),parent=fs.realpathSync(os.tmpdir());
 if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('agent-frc-history-')||fs.lstatSync(resolved).isSymbolicLink()||fs.realpathSync(resolved)!==resolved)throw Error('Refusing cleanup outside owned temporary directory');
 fs.rmSync(resolved,{recursive:true});
}
function executionRecord(p){return {status:p.status??null,signal:p.signal??null,timeout:p.error?.code==='ETIMEDOUT',error:p.error?{code:p.error.code??null,message:p.error.message??String(p.error)}:null,stdout:String(p.stdout??''),stderr:String(p.stderr??''),tests:[...TESTS]};}

/** Dependency injection is for tests; the CLI never accepts registry paths or executable commands. */
export function verifyHistorical({root=ROOT,caseId,python,run=false,registryBytes}={},deps={}){
 const result={schema:'agent-frc/historical-verification-result@1',caseId:caseId??null,status:'invalid',mode:run?'execution':'preflight',registrySha256:null,locator:null,files:[],interpreter:null,argv:[...ARGV],execution:null,issues:[],scope:'Historical Python acquisition-contract verification only; no Java trajectory, native geometry or physical qualification. Eligibility is not a claim of tested Python-version support.'};
 let c,bytes;
 try {bytes=registryBytes??loadRegistry(root).bytes;result.registrySha256=sha(bytes);c=validRegistry(JSON.parse(bytes));}
 catch(e){return issue(result,'invalid','registry-invalid',e.message);}
 if(caseId!==CASE)return issue(result,'invalid','case-unknown',`Supported cases: ${CASE}`);
 result.locator=c.locator;
 const content=new Map();
 for(const f of c.files){
  let entry,b;
  try{entry=(deps.readTreeEntry??readTreeEntry)(root,c.locator,f.path);}
  catch(e){return issue(result,'prerequisite','history-unavailable',e.message);}
  if(entry.mode!=='100644'||entry.type!=='blob')return issue(result,'invalid','nonregular-entry',f.path);
  if(entry.oid!==f.blob)return issue(result,'mismatch','blob-mismatch',f.path);
  try{b=(deps.readBlob??((r,oid)=>git(r,['cat-file','blob',oid])))(root,f.blob);}
  catch(e){return issue(result,'prerequisite','blob-unavailable',e.message);}
  const actual=sha(b);result.files.push({path:f.path,expectedBlob:f.blob,resolvedBlob:entry.oid,expectedSha256:f.sha256,beforeSha256:actual,afterSha256:null});
  if(actual!==f.sha256)return issue(result,'mismatch','content-mismatch',f.path);
  content.set(f.path,b);
 }
 // Preserve the historical text-hash algorithm, separately from exact recovered bytes.
 try{
  const receipt=JSON.parse(content.get(PATHS[5]).toString('utf8'));
  if(!equal(Object.keys(receipt.pins).sort(),PATHS.slice(0,5).sort()))throw Error('Legacy pin inventory differs');
  for(const p of PATHS.slice(0,5)){
   const decoded=new TextDecoder('utf-8',{fatal:true}).decode(content.get(p)).replace(/\r\n?/g,'\n');
   if(sha(Buffer.from(decoded,'utf8'))!==receipt.pins[p])throw Error(`Legacy normalized-text pin differs: ${p}`);
  }
 }catch(e){return issue(result,'mismatch','legacy-pin-mismatch',e.message);}
 if(!python)return issue(result,'prerequisite','python-required','Supply an existing Python executable path explicitly');
 if(!path.isAbsolute(python))return issue(result,'invalid','python-path','Python must be an absolute executable file path');
 try{if(!fs.statSync(python).isFile())return issue(result,'invalid','python-not-file','Python target is not a file');}
 catch(e){return issue(result,'prerequisite','python-unavailable',e.message);}
 const processRun=deps.runProcess??spawnSync;
 let probe;
 try{probe=processRun(python,['--version'],{encoding:'utf8',shell:false,timeout:10000,maxBuffer:1024*1024});}catch(e){return issue(result,'prerequisite','python-probe-failed',e.message);}
 const version=(`${probe.stdout??''}\n${probe.stderr??''}`).trim();
 result.interpreter={path:fs.realpathSync(python),version,eligibility:'unverified',exercised:false};
 const v=version.match(/^Python (\d+)\.(\d+)\.(\d+)(?:\S*)$/);
 if(probe.error||probe.status!==0||!v||+v[1]!==3||+v[2]<10)return issue(result,'prerequisite','python-ineligible','Require an eligible Python 3.10+ candidate below 4.0; actual execution determines this case result');
 result.interpreter.eligibility='eligible';
 result.status='ready';
 if(!run)return result;
 let temp;
 try{
  const parent=fs.realpathSync(os.tmpdir());
  temp=(deps.makeTemp??(p=>fs.mkdtempSync(p)))(path.join(parent,'agent-frc-history-'));
  if(path.dirname(path.resolve(temp))!==parent||fs.lstatSync(temp).isSymbolicLink())throw Error('Invalid owned extraction directory');
  for(const [p,b] of content){
   const target=path.resolve(temp,...p.split('/'));
   if(!target.startsWith(temp+path.sep))throw Error('Extraction escaped temporary directory');
   fs.mkdirSync(path.dirname(target),{recursive:true});
   // New owned directory, exclusive files; no archive or Git hooks are executed.
   fs.writeFileSync(target,b,{flag:'wx'});
   if(sha(fs.readFileSync(target))!==sha(b))throw Error('Extraction bytes changed');
  }
  const child=processRun(python,ARGV,{cwd:temp,encoding:'utf8',shell:false,timeout:60000,maxBuffer:4*1024*1024});
  result.interpreter.exercised=true;result.execution=executionRecord(child);
  result.status='passed';
  const output=result.execution.stderr.replace(/\r\n/g,'\n');
  if(child.error||child.status!==0||child.signal||!/^Ran 6 tests in [0-9.]+s\n\nOK\n?$/m.test(output))issue(result,'failed','execution-failed','Pinned six-test program did not complete successfully');
  for(const f of result.files){
   try{const p=path.join(temp,...f.path.split('/'));if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('nonregular');f.afterSha256=sha(fs.readFileSync(p));}catch{f.afterSha256=null;}
   if(f.afterSha256!==f.beforeSha256)issue(result,'mismatch','execution-mutation',f.path);
  }
 }catch(e){issue(result,'failed','execution-error',e.message);}
 finally{
  if(temp)try{(deps.removeTemp??cleanOwned)(temp);result.cleanup={removed:true};}catch(e){result.cleanup={removed:false,path:temp};issue(result,'failed','cleanup-failed',e.message);}
 }
 return result;
}

/** Atomic no-replace publication: link completed sibling file, never rename over destination. */
export function publishResult(destination,result){
 const target=path.resolve(destination),temp=path.join(path.dirname(target),`.history-result-${crypto.randomUUID()}.tmp`);
 try{fs.writeFileSync(temp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.linkSync(temp,target);}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
