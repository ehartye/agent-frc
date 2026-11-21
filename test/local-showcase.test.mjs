import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const plugin=fileURLToPath(new URL('..',import.meta.url));
const script=name=>path.join(plugin,'scripts',name+'.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex');
function write(root,file,data) {
  const target=path.join(root,file);
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,typeof data==='string'?data:JSON.stringify(data));
}
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
function workspace(t) {
  const temp=mkdtempSync(path.join(os.tmpdir(),'student-release-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const repo=path.join(temp,'project');
  mkdirSync(repo);
  git(repo,'init','-q');
  git(repo,'config','user.name','Fixture');git(repo,'config','user.email','fixture@example.invalid');
  git(repo,'config','core.autocrlf','false');
  return {temp,repo};
}
function invoke(entry,...args) {
  const run=spawnSync(process.execPath,[script(entry),...args],{encoding:'utf8'});
  return {code:run.status,out:run.stdout,err:run.stderr};
}

test('both local layouts verify the same signed model and check the final output and frozen baseline',t=>{
  const {temp,repo}=workspace(t);
  const project='teaching-station', fixed='index.html', docs=path.join(repo,'docs'),approved=path.join(temp,'approved');
  write(repo,'docs/'+fixed,'original');
  write(repo,'.github/source.json',{schema:'agent-frc/public-model-policy@1',project,publicRoots:['docs'],modelFiles:['docs/'+fixed]});
  write(repo,'.github/stage.json',{schema:'agent-frc/staged-model-policy@1',project,modelFiles:[fixed],mutableFieldPages:[]});
  git(repo,'add','.');git(repo,'commit','-qm','Approved');const approvedCommit=git(repo,'rev-parse','HEAD');
  cpSync(docs,approved,{recursive:true});
  const cli=(...args)=>invoke('local-showcase-release',...args);
  const digest=cli('digest',approved);assert.equal(digest.code,0,digest.err);
  const cfg={schema:'agent-frc/local-showcase-release@1',layout:'branch',servedDirectory:'docs',approvedCommit,sourcePolicy:'.github/source.json',
    stagePolicy:'.github/stage.json',sourcePacket:'.github/new-source.json',stagePacket:'.github/new-stage.json',approvedSite:'approved',
    approvedSiteSha256:digest.out.trim(),reviewerPublicKey:'reviewer.pem'};
  const file=path.join(temp,'station.json');
  const check=(...args)=>{write(temp,'station.json',cfg);return cli('check',file,repo,...args)};
  let result=check();assert.equal(result.code,0,result.err);
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  write(temp,'reviewer.pem',publicKey.export({type:'spki',format:'pem'}));
  function receipt(name,study=sha('study')) {
    const body={schema:'agent-frc/signed-model-release@9',project,scope:'Desk asset',configuration:'Mounted',solids:2,
      studySha256:study,archiveSha256:sha('archive'),stepSha256:sha('solid'),files:[{path:name,sha256:sha('reviewed')}]};
    return {body,signature:sign(null,Buffer.from(JSON.stringify(body)),privateKey).toString('base64')};
  }
  write(repo,'docs/'+fixed,'reviewed');write(repo,cfg.sourcePacket,receipt('docs/'+fixed));
  assert.match(check().err,/both source and staged/);
  write(repo,cfg.stagePacket,receipt(fixed));assert.match(check().err,/committed bytes/);
  git(repo,'add','.');git(repo,'commit','-qm','Reviewed issue');
  result=check();assert.equal(result.code,0,result.err);assert.equal(JSON.parse(result.out).source.signedFiles,1);
  const site=path.join(temp,'final');cpSync(docs,site,{recursive:true});cfg.layout='built';
  result=check(site);assert.equal(result.code,0,result.err);
  git(repo,'checkout','-q','--detach',approvedCommit);
  write(repo,'docs/'+fixed,'reviewed');write(repo,cfg.sourcePacket,receipt('docs/'+fixed));write(repo,cfg.stagePacket,receipt(fixed));
  assert.match(check(site).err,/Selected source differs from committed bytes/);
  git(repo,'add','.');git(repo,'commit','-qm','Commit reviewed source');
  const sameIssue=receipt(fixed);
  write(repo,cfg.stagePacket,JSON.stringify(sameIssue,null,2));assert.match(check(site).err,/committed bytes: .github\/new-stage.json/);
  write(repo,cfg.stagePacket,receipt(fixed,sha('other study')));assert.match(check(site).err,/different engineering issue/);
  write(repo,cfg.stagePacket,receipt(fixed));write(site,'extra.glb','unreviewed');
  assert.match(check(site).err,/Unreviewed added/);
  write(approved,fixed,'reviewed');assert.match(check(site).err,/frozen release/);
});

test('the actual project commands select affected work and replay the full suite on request',t=>{
  const {repo}=workspace(t);
  const init=invoke('project-layout','init',repo);assert.equal(init.code,0,init.err);
  write(repo,'tests/ci.json',{schema:'agent-frc/project-checks@1',checks:[
    {name:'smoke',argv:['node','-e','console.log("smoke")'],inputs:[]},
    {name:'motion',argv:['node','-e','console.log("motion")'],inputs:['sim/']}]});
  git(repo,'add','.');git(repo,'commit','-qm','Initial layout');const base=git(repo,'rev-parse','HEAD');
  write(repo,'docs/student.md','update');
  const selected=(...args)=>{const run=invoke('project-checks',repo,...args);assert.equal(run.code,0,run.err);return JSON.parse(run.out.trim().split('\n').at(-1)).selected};
  assert.deepEqual(selected('changed',base),['smoke']);
  assert.deepEqual(selected('full'),['smoke','motion']);
  write(repo,'sim/model.json','{}');assert.deepEqual(selected('changed',base),['smoke','motion']);
});

test('software-only mode uses an ordinary checkout without a robot layout and exposes a failed build',t=>{
  const {repo}=workspace(t);
  write(repo,'tests/ci.json',{schema:'agent-frc/project-checks@1',layout:'software-only',checks:[
    {name:'Unit tests',argv:['node','-e','process.exit(0)'],inputs:[]}]});
  let run=invoke('project-checks',repo,'full');assert.equal(run.code,0,run.err);
  write(repo,'tests/ci.json',{schema:'agent-frc/project-checks@1',layout:'software-only',checks:[
    {name:'Failed tests',argv:['node','-e','process.exit(1)'],inputs:[]}]});
  run=invoke('project-checks',repo,'full');assert.notEqual(run.code,0);assert.match(run.err,/failed with status 1/);
});
