// Isolated tests of rendering and handoff use a synthetic reviewer's signing key.
// The mechanical evaluator and private signing command have their own physical controls.
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function authorizeRender(root,{archive,manifest='project.json'}={}){
  const keyFolder=mkdtempSync(path.join(tmpdir(),'fixture-review-key-'));
  const {publicKey,privateKey}=generateKeyPairSync('ed25519'),pub=path.join(keyFolder,'key.pem');
  writeFileSync(pub,publicKey.export({type:'spki',format:'pem'}));process.env.FRC_MODEL_REVIEW_PUBLIC_KEY=pub;process.env.FRC_MODEL_PROJECT='synthetic-fixture';
  process.on('exit',()=>rmSync(keyFolder,{recursive:true,force:true}));
  const hash=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
  const selected=JSON.parse(readFileSync(path.join(root,'cad-showcase.json'))),cad=JSON.parse(readFileSync(path.join(root,'docs/robot/cad/receipt.json')));
  const files=[selected.source,'docs/robot/cad/assembly.png','docs/robot/cad/assembly.stl.gz','docs/robot/cad/receipt.json',...(archive?[archive]:[])];
  const body={schema:'agent-frc/signed-model-release@6',project:'synthetic-fixture',scope:'Isolated render test',configuration:'Controlled candidate',
    studySha256:'a'.repeat(64),stepSha256:cad.sourceSha256,solids:cad.solids,archiveSha256:archive?hash(archive):'b'.repeat(64),files:files.map(p=>({path:p,sha256:hash(p)}))};
  writeFileSync(path.join(root,'test-release.json'),JSON.stringify({body,signature:sign(null,Buffer.from(JSON.stringify(body)),privateKey).toString('base64')}));
  const mech={signedPacket:'test-release.json'};
  writeFileSync(path.join(root,'cad-showcase.json'),JSON.stringify({...selected,mechanicalReadiness:mech}));
  if(existsSync(path.join(root,manifest))){
    const data=JSON.parse(readFileSync(path.join(root,manifest)));
    writeFileSync(path.join(root,manifest),JSON.stringify({...data,mechanicalReadiness:mech}));
  }
  return {pub,project:'synthetic-fixture'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  // A Python rendering fixture runs the CLI in a child and owns the returned temporary key.
  const result=authorizeRender(process.argv[2]);process.removeAllListeners('exit');console.log(JSON.stringify(result));
}
