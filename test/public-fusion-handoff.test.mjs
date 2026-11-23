/** @lane merge */
import {authorizeRender} from './authorize-render-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspect} from '../scripts/project-layout.mjs';
import {buildHighlights} from '../scripts/robot-highlights.mjs';
import {publicFusionHandoff} from '../scripts/public-fusion-handoff.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('opt-in native handoff binds downloadable bytes, components, edits and observed joint motion', async t=>{
  const root = await mkdtemp(path.join(tmpdir(),'robot-handoff-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(new URL('../examples/highlights/',import.meta.url),root,{recursive:true});
  const spec = JSON.parse(await readFile(path.join(root,'project.json')));
  delete spec.cad;
  const project = path.join(root,'highlights.json');
  await writeFile(project,JSON.stringify(spec));
  assert.equal(publicFusionHandoff(root),undefined);
  await mkdir(path.join(root,'cad'));
  const file = 'cad/student.f3d';
  // Real archive container, synthetic observations for this test only.
  const archive = await readFile(new URL('../examples/swerve/independent-swerve.f3d',import.meta.url));
  await writeFile(path.join(root,file),archive);
  const git = args=>execFileSync('git',['-C',root,...args]);
  git(['init','-q']);
  await writeFile(path.join(root,'.gitattributes'),'*.f3d binary\n');
  const store = (f,data)=>writeFile(path.join(root,f),JSON.stringify(data));
  const config = {publicFusionHandoff:'cad/public-handoff.json'};
  await store('project-layout.json',config);
  const components = ['frame','drive','mechanism'].map(role=>({id:role,role,representation:'project-original',provenance:'Synthetic inventory',editMetric:'extrusions'}));
  components[0].bodyNames=['frame tube'];
  const joint = {id:'travel',type:'slider',occurrenceOne:'frame',occurrenceTwo:'mechanism'};
  const matrix = x=>[1,0,0,x,0,1,0,0,0,0,1,0,0,0,0,1];
  const samples = [{position:0,relativeTransform:matrix(0)},{position:2,relativeTransform:matrix(2)}];
  const receipt = {source:file,sha256:hash(archive),opened:true,
    components:Object.fromEntries(components.map(c=>[c.id,{bodies:1,extrusions:1,bodyNames:[c.role==='frame'?'frame tube':c.role]}])), joints:{travel:{...joint,samples}}};
  const manifest = {schema:'agent-frc/public-fusion-handoff@1',revision:spec.revision,shareable:true,
    archive:{file,sha256:hash(archive)},components,joints:[joint]};
  async function bind(obs=receipt,claims=manifest){
    await store('cad/reopen.json',obs);
    await store(config.publicFusionHandoff,{...claims,reopen:{file:'cad/reopen.json',sha256:hash(JSON.stringify(obs))}});
    git(['add','--','cad','project-layout.json','.gitattributes']);
  }
  await bind();
  assert.equal(publicFusionHandoff(root).joints,1);
  // A manifest that names the archive and the reopen receipt by path, with no typed digest, is read the same way.
  await store('cad/reopen.json',receipt);
  await store(config.publicFusionHandoff,{...manifest,archive:{file},reopen:{file:'cad/reopen.json'}});
  git(['add','--','cad']);
  assert.deepEqual([publicFusionHandoff(root).joints,publicFusionHandoff(root).sha256],[1,hash(archive)]);
  // A typed digest that no longer matches is still refused.
  await store(config.publicFusionHandoff,{...manifest,archive:{file,sha256:'0'.repeat(64)},reopen:{file:'cad/reopen.json'}});
  git(['add','--','cad']);
  assert.throws(()=>publicFusionHandoff(root),/downloaded archive hash differs/);
  await bind();
  const output=path.join(root,'published');
  authorizeRender(root,{archive:file,manifest:'highlights.json'});
  const html=await readFile(await buildHighlights(project,output),'utf8');
  assert.match(html,/Download the student assembly/);
  assert.deepEqual(await readFile(path.join(output,'evidence',hash(archive)+'.f3d')),archive);
  for (const [modify,reason] of [
    [o=>o.source='cad/private-master.f3d',/exact student/],
    [o=>o.sha256='0'.repeat(64),/exact student/],
    [o=>o.components.frame.bodyNames=['Body1'],/claimed body name/],
    [o=>delete o.components.drive,/missing physical/],
    [o=>o.components.frame.extrusions=0,/missing editable/],
    [o=>o.components.supplier={bodies:1},/representation and provenance/],
    [o=>delete o.joints.travel,/claimed joint/],
    [o=>o.joints.travel.occurrenceTwo='drive',/endpoints/],
    [o=>delete o.joints.travel.samples,/missing observed/],
    [o=>o.joints.travel.samples[1].relativeTransform=matrix(0),/relative slider motion/],
  ]){
    const obs=structuredClone(receipt); modify(obs); await bind(obs);
    assert.throws(()=>publicFusionHandoff(root),reason);
  }
  const nested=structuredClone(receipt);
  nested.components['arm assembly']={bodies:0};
  nested.components['carrier assembly']={bodies:0,parent:'arm assembly'};
  nested.components.mechanism.parent='carrier assembly';
  nested.joints.travel.occurrenceTwo='arm assembly';
  const nestedClaim={...manifest,joints:[{...joint,occurrenceTwo:'arm assembly'}]};
  await bind(nested,nestedClaim);
  assert.equal(publicFusionHandoff(root).components,3);
  await bind(nested,manifest);
  assert.throws(()=>publicFusionHandoff(root),/different joint endpoints/);
  for (const [change,reason] of [
    [o=>delete o.components.mechanism.parent,/different joint endpoints/],
    [o=>o.components['carrier assembly'].parent='absent',/unknown native parent/],
    [o=>o.components['arm assembly'].parent='carrier assembly',/cyclic native hierarchy/],
    [o=>o.components.mechanism.parent='mechanism',/cyclic native hierarchy/],
  ]) {
    const obs=structuredClone(nested);change(obs);await bind(obs,nestedClaim);
    assert.throws(()=>publicFusionHandoff(root),reason);
  }
  const swing=structuredClone(receipt);
  swing.joints.travel.type='revolute';
  swing.joints.travel.samples=[{position:0,relativeTransform:matrix(0)},
    {position:90,relativeTransform:[0,-1,0,0,1,0,0,0,0,0,1,0,0,0,0,1]}];
  const swingClaim={...manifest,joints:[{...joint,type:'revolute'}]};
  await bind(swing,swingClaim); assert.equal(publicFusionHandoff(root).joints,1);
  const rules={travel:{frame:'frame',axis:[0,0,1],sign:1}};
  await store('cad/convention.json',rules);
  swingClaim.joints[0].direction={file:'cad/convention.json',sha256:hash(JSON.stringify(rules))};
  await bind(swing,swingClaim); assert.equal(publicFusionHandoff(root).signedJoints,1);
  swing.joints.travel.samples[1].relativeTransform=[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1];
  await bind(swing,swingClaim); assert.throws(()=>publicFusionHandoff(root),/relative revolute motion/);
  swing.joints.travel.samples[1].relativeTransform=matrix(90);
  await bind(swing,swingClaim); assert.throws(()=>publicFusionHandoff(root),/relative revolute motion/);
  await bind(receipt,{...manifest,revision:'unrelated scratch revision'});
  await assert.rejects(buildHighlights(project,output),/revision differs/);
  await bind(); await store('cad/reopen.json',{...receipt,opened:false});
  assert.throws(()=>publicFusionHandoff(root),/receipt hash/);
  await bind(); await writeFile(path.join(root,file),'other archive');
  assert.throws(()=>publicFusionHandoff(root),/archive/);
  await rm(path.join(root,file));
  assert(inspect(root).some(issue=>issue.includes('missing or redirected '+file)));
  await assert.rejects(buildHighlights(project,output),/missing or redirected/);
});
