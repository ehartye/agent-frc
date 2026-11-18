import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {verifyHistorical as verifyProduction, exitCode, publishResult} from '../scripts/historical-verification.mjs';
import {fixture} from './fixtures/historical-verification/fixture.mjs';
const sample=fixture();
const verifyHistorical=(options,deps={})=>verifyProduction({...options,registryBytes:options.registryBytes??Buffer.from(JSON.stringify(sample.registry))},{...sample.deps,...deps});
const root=path.resolve(import.meta.dirname,'..');
const options={root,caseId:'acquisition-contract',python:process.execPath};
const ok={status:0,stdout:'',stderr:'......\n----------------------------------------------------------------------\nRan 6 tests in 0.001s\n\nOK\n',signal:null};
const fakeProcess=(exe,args)=>args[0]==='--version'?{status:0,stdout:'Python 3.13.12\n',stderr:''}:ok;
const deps={runProcess:fakeProcess};
const registry=()=>structuredClone(sample.registry);
test('preflight resolves all seven committed identities without extraction or test invocation',()=>{
 let calls=0;const r=verifyHistorical(options,{runProcess:(...a)=>{calls++;return fakeProcess(...a);},makeTemp:()=>{throw Error('must not extract');}});
 assert.equal(r.status,'ready');assert.equal(r.files.length,7);assert.equal(calls,1);assert.equal(r.execution,null);assert.equal(r.registrySha256.length,64);
});
test('missing interpreter, unavailable interpreter, directory and unknown case are explicit',()=>{
 assert.equal(verifyHistorical({root,caseId:options.caseId}).status,'prerequisite');
 assert.equal(verifyHistorical({...options,python:path.join(root,'missing-python')}).status,'prerequisite');
 assert.equal(verifyHistorical({...options,python:root}).status,'invalid');
 assert.equal(verifyHistorical({...options,caseId:'unknown'}).status,'invalid');
 assert.equal(verifyHistorical(options,{runProcess:()=>({status:0,stdout:'Python 2.7.0'})}).status,'prerequisite');
});
test('execution records fixed argv, output, test inventory and unchanged extracted hashes; cleans owned directory',()=>{
 let temp;const r=verifyHistorical({...options,run:true},{runProcess:(exe,args,o)=>{
  if(args[0]==='--version')return fakeProcess(exe,args);
  temp=o.cwd;assert.deepEqual(args,['-I','-B','scripts/test-acquisition-contract.py']);
  assert.equal(fs.existsSync(path.join(temp,'scripts/test-acquisition-contract.py')),true);return ok;
 }});
 assert.equal(r.status,'passed');assert.equal(r.execution.tests.length,6);assert.equal(r.files.every(f=>f.beforeSha256===f.afterSha256),true);assert.equal(fs.existsSync(temp),false);
});
test('actual inert child output is captured without Python in portable suite',()=>{
 const r=verifyHistorical({...options,run:true},{runProcess:(exe,args,o)=>args[0]==='--version'?fakeProcess(exe,args):spawnSync(process.execPath,['-e',`process.stderr.write(${JSON.stringify(ok.stderr)})`],{...o,encoding:'utf8',shell:false})});
 assert.equal(r.status,'passed');assert.equal(r.execution.stderr,ok.stderr);
});
test('registry inventory, unsafe paths, duplicate paths, malformed hashes and commands are rejected',()=>{
 for(const change of [r=>r.cases[0].files.pop(),r=>r.cases[0].files.push(r.cases[0].files[0]),r=>r.cases[0].argv.push('--unsafe'),r=>r.schema='bad',r=>r.cases[0].files[0].sha256='bad']){
  const r=registry();change(r);assert.equal(verifyHistorical({...options,registryBytes:Buffer.from(JSON.stringify(r))},deps).status,'invalid');
 }
 for(const p of ['../escape','C:/escape','/escape','//host/share','x\\y','x:y','x//y','x/./y']){
  const r=registry();r.cases[0].files[0].path=p;assert.equal(verifyHistorical({...options,registryBytes:Buffer.from(JSON.stringify(r))},deps).status,'invalid');
 }
});
test('missing blobs and linked tree entries cannot execute',()=>{
 assert.equal(verifyHistorical(options,{...deps,readBlob:()=>{throw Error('missing');}}).status,'prerequisite');
 assert.equal(verifyHistorical(options,{...deps,readTreeEntry:()=>({mode:'120000',type:'blob',oid:'a'.repeat(40)})}).status,'invalid');
});
test('altered implementation, receipt, test or registry identity is a mismatch',()=>{
 for(const target of ['scripts/acquisition-contract.py','case-studies/acquisition-contract.json','scripts/test-acquisition-contract.py']){
  const r=registry();r.cases[0].files.find(f=>f.path===target).sha256='0'.repeat(64);
  assert.equal(verifyHistorical({...options,registryBytes:Buffer.from(JSON.stringify(r))},deps).status,'mismatch');
 }
 const r=registry();r.cases[0].files[0].blob='0'.repeat(40);assert.equal(verifyHistorical({...options,registryBytes:Buffer.from(JSON.stringify(r))},deps).status,'mismatch');
});
test('child failure, timeout and truncated completion never pass',()=>{
 for(const outcome of [{...ok,status:1},{...ok,error:{code:'ETIMEDOUT'},signal:'SIGTERM'},{...ok,stderr:'Ran 6 tests'},{...ok,stderr:'Ran 5 tests in 0.1s\n\nOK\n'}]){
  const r=verifyHistorical({...options,run:true},{runProcess:(e,a)=>a[0]==='--version'?fakeProcess(e,a):outcome});assert.equal(r.status,'failed');assert.equal(exitCode(r),1);
 }
});
test('mutation or deletion after successful output prevents acceptance',()=>{
 for(const mutate of [p=>fs.appendFileSync(p,'changed'),p=>fs.unlinkSync(p)]){
  const r=verifyHistorical({...options,run:true},{runProcess:(e,a,o)=>{if(a[0]==='--version')return fakeProcess(e,a);mutate(path.join(o.cwd,'scripts/acquisition-contract.py'));return ok;}});
  assert.equal(r.status,'mismatch');assert.equal(exitCode(r),2);
 }
});
test('cleanup failure retains child result and identifies only the owned directory',()=>{
 let retained;const r=verifyHistorical({...options,run:true},{...deps,removeTemp:p=>{retained=p;throw Error('busy');}});
 assert.equal(r.status,'failed');assert.equal(r.execution.status,0);assert.equal(r.issues.some(i=>i.code==='cleanup-failed'),true);
 assert.ok(retained.startsWith(path.join(os.tmpdir(),'agent-frc-history-')));fs.rmSync(retained,{recursive:true});
});
test('atomic output never replaces an existing file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-output-'));try{
  const target=path.join(dir,'result.json');publishResult(target,{status:'ready'});assert.equal(JSON.parse(fs.readFileSync(target)).status,'ready');
  assert.throws(()=>publishResult(target,{status:'passed'}));assert.equal(JSON.parse(fs.readFileSync(target)).status,'ready');
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('CLI rejects unknown flags, supports listing, and reports absent prerequisites',()=>{
 const cli=path.join(root,'scripts/check-historical.mjs');
 let r=spawnSync(process.execPath,[cli,'--list'],{encoding:'utf8'});assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout).cases,['acquisition-contract']);
 for(const args of [['--bogus'],['--case','unknown'],['--case','acquisition-contract','--run']]){
  r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(r.status,2);assert.notEqual(JSON.parse(r.stdout).status,'passed');
 }
});
test('fresh synthetic Git repository supplies exact regular blobs without original feature history',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-git-'));
 const command=(args,cwd=dir)=>{const r=spawnSync('git',args,{cwd,encoding:null,shell:false});assert.equal(r.status,0,r.stderr?.toString());return r.stdout;};
 try{
  command(['init','--quiet']);const r=registry();
  for(const f of r.cases[0].files){const p=path.join(dir,f.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,sample.content.get(f.path));}
  command(['-c','core.autocrlf=false','add','.']);
  command(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic reviewed case']);
  r.cases[0].locator=command(['rev-parse','HEAD']).toString().trim();
  const result=verifyProduction({...options,root:dir,registryBytes:Buffer.from(JSON.stringify(r)),run:true},{...deps,onTempCreated:()=>{}});
  assert.equal(result.status,'passed');assert.equal(command(['status','--porcelain']).length,0);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('an actual timed-out inert subprocess cannot become accepted evidence',()=>{
 const r=verifyHistorical({...options,run:true},{runProcess:(exe,args,o)=>args[0]==='--version'?fakeProcess(exe,args):spawnSync(process.execPath,['-e','setInterval(()=>{},1000)'],{...o,timeout:50,encoding:'utf8',shell:false})});
 assert.equal(r.status,'failed');assert.equal(r.execution.timeout,true);
});
test('mismatched and nonregular tree entries retain expected and observed identities',()=>{
 for(const entry of [{mode:'100644',type:'blob',oid:'0'.repeat(40)},{mode:'120000',type:'blob',oid:'a'.repeat(40)}]){
  const r=verifyHistorical(options,{...deps,readTreeEntry:()=>entry});const f=r.files[0];
  assert.equal(r.files.length,7);assert.equal(f.path,sample.registry.cases[0].files[0].path);
  assert.equal(f.expectedBlob,sample.registry.cases[0].files[0].blob);assert.equal(f.expectedMode,'100644');assert.equal(f.expectedType,'blob');
  assert.equal(f.resolvedBlob,entry.oid);assert.equal(f.resolvedMode,entry.mode);assert.equal(f.resolvedType,entry.type);
 }
});
test('interrupted parent identifies its owned directory before the inert subprocess starts',async()=>{
 const harness=fs.mkdtempSync(path.join(os.tmpdir(),'history-interruption-')),recovery=path.join(harness,'owned.json');
 const moduleUrl=pathToFileURL(path.join(root,'scripts/historical-verification.mjs')).href;
 const fixtureUrl=pathToFileURL(path.join(root,'test/fixtures/historical-verification/fixture.mjs')).href;
 const code=`import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {verifyHistorical} from ${JSON.stringify(moduleUrl)};import {fixture} from ${JSON.stringify(fixtureUrl)};
 const f=fixture();delete f.deps.onTempCreated;f.deps.makeTemp=p=>{const owned=fs.mkdtempSync(p);fs.writeFileSync(${JSON.stringify(recovery)},JSON.stringify(owned));return owned;};
 verifyHistorical({caseId:'acquisition-contract',python:process.execPath,run:true,registryBytes:Buffer.from(JSON.stringify(f.registry))},{...f.deps,runProcess:(e,a,o)=>{if(a[0]==='--version')return {status:0,stdout:'Python 3.13.12'};fs.writeSync(2,'child-started\\n');return spawnSync(process.execPath,['-e','setTimeout(()=>{},2000)'],o);}});`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
 let stderr='',stdout='',owned;
 const closed=new Promise(resolve=>child.once('close',resolve));
 child.stdout.on('data',b=>stdout+=b);
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill();reject(Error('No child-started marker'));},5000);
   child.stderr.on('data',b=>{stderr+=b;if(stderr.includes('child-started')){clearTimeout(timer);resolve();}});
   child.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  child.kill();await closed;
  const record=stderr.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(x=>x?.event==='historical-temporary-directory');
  assert.ok(record,'stderr must identify directory even without a final JSON result');owned=record.path;
  assert.equal(path.dirname(owned),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(owned).startsWith('agent-frc-history-'));
  assert.equal(fs.existsSync(owned),true);assert.equal(stdout,'');
 }finally{if(child.exitCode===null)child.kill();await closed;owned??=fs.existsSync(recovery)?JSON.parse(fs.readFileSync(recovery,'utf8')):null;if(owned&&path.dirname(owned)===fs.realpathSync(os.tmpdir())&&path.basename(owned).startsWith('agent-frc-history-'))fs.rmSync(owned,{recursive:true});fs.rmSync(harness,{recursive:true});}
});
