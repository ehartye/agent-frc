import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {auditStaged,verifyIssued} from '../scripts/public-model-release.mjs';

test('complete mechanical review with geometry and adverse-case controls',()=>{
  const py=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
  const p=fileURLToPath(new URL('./mechanical_readiness.py',import.meta.url));
  execFileSync(py,[p],{stdio:'pipe'});
});

test('verified public deployment can preserve the previous robot while changing only a field lab',async t=>{
  const root=mkdtempSync(path.join(tmpdir(),'model-packet-'));t.after(()=>rmSync(root,{force:true,recursive:true}));
  const old=path.join(root,'old'),next=path.join(root,'next');mkdirSync(old);
  writeFileSync(path.join(old,'robot.glb'),'previous');writeFileSync(path.join(old,'index.html'),'<model-viewer src="robot.glb">');
  writeFileSync(path.join(old,'field-lab.html'),'field');cpSync(old,next,{recursive:true});writeFileSync(path.join(next,'field-lab.html'),'six robots');
  const policy=path.join(root,'policy.json');
  writeFileSync(policy,JSON.stringify({schema:'agent-frc/staged-model-policy@1',project:'test',modelFiles:['index.html','robot.glb'],mutableFieldPages:['field-lab.html']}));
  assert.equal((await auditStaged(old,next,policy)).checked,3);
  writeFileSync(path.join(next,'robot.glb'),'new approved');
  await assert.rejects(auditStaged(old,next,policy),/Unreviewed changed/);
  const keys=generateKeyPairSync('ed25519'),key=path.join(root,'reviewer.pem');
  writeFileSync(key,keys.publicKey.export({type:'spki',format:'pem'}));
  const body={schema:'agent-frc/signed-model-release@1',project:'test',scope:'Registered issue',configuration:'fixed',studySha256:'f'.repeat(64),archiveSha256:'a'.repeat(64),stepSha256:'b'.repeat(64),
    files:[{path:'robot.glb',sha256:createHash('sha256').update('new approved').digest('hex')}]};
  const packet={body,signature:sign(null,Buffer.from(JSON.stringify(body)),keys.privateKey).toString('base64')};
  const receipt=path.join(root,'packet.json');writeFileSync(receipt,JSON.stringify(packet));
  assert.equal((await auditStaged(old,next,policy,receipt,key)).signed,1);
  await assert.rejects(verifyIssued(next,packet,readFileSync(key),'another-project'),/different project/);
  packet.body.files[0].path='index.html';await assert.rejects(verifyIssued(next,packet,readFileSync(key),'test'),/signature/);
  writeFileSync(path.join(next,'other.glb'),'unreviewed');await assert.rejects(auditStaged(old,next,policy,receipt,key),/Unreviewed added/);
});

test('failed successor leaves the already generated page and field-only work usable',async t=>{
  const {buildHighlights}=await import('../scripts/robot-highlights.mjs');
  const root=mkdtempSync(path.join(tmpdir(),'issued-site-'));t.after(()=>rmSync(root,{force:true,recursive:true}));
  const local=path.join(root,'project');cpSync(fileURLToPath(new URL('../examples/highlights/',import.meta.url)),local,{recursive:true});
  const manifest=path.join(local,'project.json'),out=path.join(root,'site'),original=JSON.parse(readFileSync(manifest)),analysis={...original};delete analysis.cad;
  writeFileSync(manifest,JSON.stringify(analysis));const page=await buildHighlights(manifest,out),prior=readFileSync(page);
  writeFileSync(manifest,JSON.stringify(original));await assert.rejects(buildHighlights(manifest,out),/mechanical-readiness review/);
  assert.deepEqual(readFileSync(page),prior);
});
