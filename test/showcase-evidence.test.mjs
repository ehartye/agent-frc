import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {buildHighlights} from '../scripts/robot-highlights.mjs';
import {workflowRows} from '../scripts/project-layout.mjs';

const bytesHash = data => createHash('sha256').update(data).digest('hex');
const example=new URL('../examples/highlights/',import.meta.url);
test('kickoff publication, independent slow-motion event clock and versioned workflow are inspectable',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'evidence-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(example,root,{recursive:true});
  const spec=JSON.parse(await readFile(path.join(root,'project.json'),'utf8'));
  spec.stage='analysis';delete spec.cad;delete spec.build;
  const store=async (id,file,bytes)=>{
    const sha256=bytesHash(bytes);await writeFile(path.join(root,file),bytes);
    spec.sources.push({id,file,revision:spec.revision,label:id,shareable:true,sha256});
    return sha256;
  };
  const clipSha256=await store('film','clip.webm',Buffer.from('test clip pointer'));
  const evidence={schema:'agent-frc/replay-events@1',revision:spec.revision,clock:'trial',attempt:'one',observedRevision:spec.revision,
    piece:'sample',initialState:'checkpoint-4',scope:'independent-start',clipSha256,traceSha256:spec.sources[0].sha256,
    sync:[{clipS:0,runS:5},{clipS:2,runS:7},{clipS:6,runS:8}],
    events:[{id:'finish',timeS:7.5,target:'seat',criterion:'both contacts remain closed',outcome:'missed'}]};
  await store('events','events.json',JSON.stringify(evidence));
  spec.media=[{asset:'film',description:'Jaw closes',caption:'Pickup',source:'record',motion:{trace:'record',observations:'events',
    movingPart:'Jaw',basis:'simulated',clock:'trial',attempt:'one'}}];
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  git('init','-q');await mkdir(path.join(root,'kickoff'));
  await writeFile(path.join(root,'kickoff','analysis.md'),'# Pickup opportunities');
  await writeFile(path.join(root,'docs','workflow.md'),'| Agent FRC skill | Project output | Supporting evidence |\n| --- | --- | --- |\n| frc-case-study | [Opportunities](../kickoff/analysis.md) | [Run](../observations.json) |\n');
  git('add','docs/workflow.md','kickoff/analysis.md','observations.json');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
  const head=git('rev-parse','HEAD');
  spec.workflow={revisionUrl:'https://github.com/example/fixture/blob/'+head};
  const manifest=path.join(root,'project.json'),out=path.join(root,'out');
  const render=async()=>{await writeFile(manifest,JSON.stringify(spec));return readFile(await buildHighlights(manifest,out),'utf8');};
  const markup=await render();
  assert.match(markup,/Analysis revision/);assert.doesNotMatch(markup,/Build sheet/);
  assert.match(markup,/data-clip-time="4"/);assert.match(markup,/<strong>missed<\/strong>/);
  assert.ok(markup.includes(head+'/kickoff/analysis.md'));assert.match(markup,/independent-start/);
  for(const [update,err] of [[{scope:'capacity-only',events:[{...evidence.events[0],outcome:'scored'}]},/capacity target/],
    [{observedRevision:'earlier'},/earlier-revision/],[{clipSha256:'0'.repeat(64)},/this clip/],
    [{events:[{...evidence.events[0],timeS:10}]},/outside this clip/]]){
    const bytes=JSON.stringify({...evidence,...update});spec.sources.at(-1).sha256=bytesHash(bytes);
    await writeFile(path.join(root,'events.json'),bytes);await assert.rejects(render,err);
  }
  await writeFile(path.join(root,'docs','workflow.md'),(await readFile(path.join(root,'docs','workflow.md'),'utf8')).replace('analysis.md','missing.md'));
  assert.throws(()=>workflowRows(root),/unavailable/);
});
test('publication geometry uses placed model bytes and separates missing, unknown, omitted and proxy',()=>{
  const script=fileURLToPath(new URL('./showcase_inventory_fixture.py',import.meta.url));
  const result=spawnSync(process.platform==='win32'?'python':'python3',[script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+result.stdout);
});
