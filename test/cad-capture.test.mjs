import {authorizeRender} from './authorize-render-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHighlights} from '../scripts/robot-highlights.mjs';

const python=process.platform==='win32'?'python':'python3';
const script=name=>fileURLToPath(new URL('../scripts/'+name,import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(file,data)=>writeFile(file,JSON.stringify(data));
test('rehashed blank views and same-area mirrored marks fail publication on both CAD entry points',async t=>{
  if(spawnSync(python,['-c','from PIL import Image']).status!==0){t.skip('Pillow is required for optional pixel evidence');return;}
  const sample=spawnSync(python,[script('cad_capture.py'),'.','examples/swerve/capture-review.json'],{encoding:'utf8'});
  assert.equal(sample.status,0,sample.stderr);assert.equal(JSON.parse(sample.stdout).exactReferenceBytes,true);
  const dir=await mkdtemp(path.join(tmpdir(),'cad-capture-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(fileURLToPath(new URL('../examples/highlights/',import.meta.url)),dir,{recursive:true});
  const out=path.join(dir,'site'),cad=path.join(dir,'docs/robot/cad');
  const capture=path.join(cad,'assembly.png'),receipt=path.join(cad,'receipt.json');
  const record=JSON.parse(await readFile(receipt)),config=JSON.parse(await readFile(path.join(dir,'cad-showcase.json')));
  const draw=spawnSync(python,['-c',`from PIL import Image,ImageDraw
for state in ['good','stale','blank']:
 im=Image.new('RGB',(100,100),'black');d=ImageDraw.Draw(im)
 if state!='blank':
  d.rectangle((15,25,84,75),fill='red')
  d.rectangle((34 if state=='good' else 61,38,38 if state=='good' else 65,59),fill='white')
  d.rectangle((34,55,65,59),fill='white')
 im.save(state+'.png')`],{cwd:dir,encoding:'utf8'});
  assert.equal(draw.status,0,draw.stderr);
  const ref=async file=>({file,sha256:sha(await readFile(path.join(dir,file)))});
  const reference=await ref('good.png');
  await json(path.join(dir,'original.json'),{model:record.sourceSha256,pixels:reference.sha256});
  const selector=(lo,hi)=>({minRGBA:lo,maxRGBA:hi});
  const review={schema:'agent-frc/cad-capture@1',source:await ref(record.source),pose:'Fixed plate with painted L.',
    registrationBasis:'Both orthographic samples share a fixed camera and black matte.',reference:{kind:'verified-render',
      receipt:await ref('original.json'),image:reference,sourceDigestPointer:'/model',imageDigestPointer:'/pixels'},
    features:[{id:'plate',kind:'silhouette',selector:{...selector([0,0,0,255],[0,0,0,255]),invert:true},
      referenceRegion:[0,0,1,1],referenceCoverage:[.25,.5],minIoU:.95},
      {id:'printed-L',kind:'marking',selector:selector([245,245,245,255],[255,255,255,255]),
      grid:80,referenceRegion:[.3,.3,.7,.7],referenceCoverage:[.1,.4],minIoU:.95}]};
  await json(path.join(dir,'cad-showcase.json'),{...config,captureReview:'review.json'});
  const state=async name=>{
    await cp(path.join(dir,name+'.png'),capture);
    review.image=await ref('docs/robot/cad/assembly.png');
    await json(receipt,{...record,imageSha256:review.image.sha256});
    await json(path.join(dir,'review.json'),review);
  };
  const run=()=>spawnSync(python,[script('cad_capture.py'),dir,'review.json'],{encoding:'utf8'});
  const readme=()=>spawnSync(python,[script('cad-readmes.py'),dir,'--update'],{encoding:'utf8'});
  spawnSync('git',['init','-q',dir]);
  await state('good');authorizeRender(dir);assert.equal(run().status,0);assert.equal(readme().status,0);
  await buildHighlights(path.join(dir,'project.json'),out);
  await state('stale');
  const outcome=JSON.parse(run().stdout);
  assert.deepEqual(outcome.features.map(f=>f.status),['pass','fail']);
  assert.equal(outcome.features[1].referenceCoverage,outcome.features[1].candidateCoverage);
  assert.notEqual(readme().status,0);await assert.rejects(buildHighlights(path.join(dir,'project.json'),out));
  await state('blank');assert.deepEqual(JSON.parse(run().stdout).features.map(f=>f.overlap),[0,0]);
  review.features[0].referenceCoverage=[.8,.9];await state('good');
  assert.equal(JSON.parse(run().stdout).status,'open');
});
