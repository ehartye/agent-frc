import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditStaged} from '../scripts/public-model-release.mjs';
import {verifyRelease,verifyCatalog} from '../scripts/preliminary-release.mjs';

// Synthetic teaching fixtures: invented groups, cases and objectives with no relation to any game.
const plugin=fileURLToPath(new URL('..',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const player=readFileSync(path.join(plugin,'scripts','package-view.html'),'utf8');
const stableViewer=readFileSync(path.join(plugin,'templates','preliminary-review-index.html'));
function write(root,file,data) {
  const target=path.join(root,file);
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2));
}
const tree='preliminary-design';
const objectives=[
  {objective:'Carry the sample to the bin',disposition:'represented',basis:'The loaded-turn case releases the sample over the bin'},
  {objective:'Hang from the bar',disposition:'open',basis:'No hanging mechanism selected yet'},
  {objective:'Return to the start box',disposition:'out-of-scope',basis:'Handled by the drive team'}];

function issueRelease(site,id,{status='layout-checked',edit=r=>r,missions,trial,display=d=>d}={}) {
  const dir=path.join(site,tree,'releases',id);
  const motion=JSON.stringify({cases:[{id:'loaded-turn'},{id:'park'}],issue:id});
  const budgets=JSON.stringify({masses:[],electricalCases:{}}),limits=JSON.stringify({inspectionLimitKg:14});
  const step={file:'package.step',sha256:sha('step '+id)},motionPin={file:'paths.json',sha256:sha(motion)};
  const evidence={'loaded-turn':{status:'pass',pairs:[]},park:{status:'pass',pairs:[]},'package-displacement-control':{status:'fail',pairs:[]}};
  const series={issue:'synthetic-'+id,step,motion:motionPin,cases:[{id:'loaded-turn',stage:'operating',bodies:{}},
    {id:'park',stage:'park',bodies:{}}],evidence,narrativeReview:{objectives},mass:{range:[11,12],remaining:2},
    power:[{case:'weak traverse',status:'pass'}]};
  const view=player.replace('PACKAGE_DATA',JSON.stringify(display(series)).replace(/</g,'\\u003c'));
  const stages={'loaded-turn':{purpose:'operating'},park:{purpose:'park'}};
  if(trial)stages['loaded-turn'].transportedBy={sample:{mechanisms:['carrier'],evidence:{file:'acquire-trial.json',sha256:sha(trial)}}};
  let receipt={schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-'+id,planSha256:sha('plan '+id),status,
    missingInputs:[],reopen:[],step,motion:motionPin,narrativeReview:{source:{file:'narrative.md',sha256:sha('narrative')},objectives},
    stages,cycle:['loaded-turn','park'],cases:[{case:'loaded-turn',status:'pass',pairs:[]},{case:'park',status:'pass',pairs:[]}],
    control:{case:'loaded-turn',displaced:'rail',offsetMm:[0,-50,0],witness:{pair:['head','rail'],status:'fail'}},
    budgets:{source:{file:'budgets.json',sha256:sha(budgets)},limits:{file:'limits.json',sha256:sha(limits)},massStatus:'pass',inspectionKg:[11,12],remainingKg:2,
      electricalCases:[{case:'weak traverse',status:'pass'}]},
    view:{file:'package-motion.html',sha256:sha(view),verified:true}};
  receipt=edit(receipt);
  const receiptBytes=JSON.stringify(receipt,null,2);
  write(dir,'index.html',view);write(dir,'motion.json',motion);write(dir,'budgets.json',budgets);write(dir,'limits.json',limits);
  write(dir,'receipt.json',receiptBytes);
  const record={schema:'agent-frc/preliminary-release@1',release:id,issue:receipt.issue,label:'Work-in-progress preliminary design',
    status:receipt.status,receipt:{file:'receipt.json',sha256:sha(receiptBytes)},view:{file:'index.html',sha256:sha(view)},
    scene:{file:'motion.json',sha256:sha(motion),stepSha256:step.sha256},
    missionCases:missions??[{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Carry the sample to the bin'}]};
  if(trial)write(dir,'acquire-trial.json',trial);
  write(dir,'release.json',record);
  return {dir,record};
}
function listing(site,current,releases){write(site,tree+'/releases.json',{current,releases});}

function fixture(t) {
  const temp=mkdtempSync(path.join(os.tmpdir(),'prelim-gate-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const approved=path.join(temp,'approved'),site=path.join(temp,'site');
  write(approved,'index.html','<a href="preliminary-design/">Preliminary design (work in progress)</a> detailed robot');
  write(approved,'models/robot.glb','approved detailed model');
  write(approved,'media/robot-still.png','approved still');
  write(approved,tree+'/index.html',stableViewer);
  issueRelease(approved,'layout-001');listing(approved,'layout-001',['layout-001']);
  cpSync(approved,site,{recursive:true});
  const policy={schema:'agent-frc/staged-model-policy@1',project:'Teaching project',modelFiles:['models/robot.glb'],mutableFieldPages:[],
    preliminaryReleases:{root:tree,primaryEntryPoints:['index.html','media/robot-still.png']}};
  return {temp,approved,site,policy};
}
function next(site,id,options) {const r=issueRelease(site,id,options);listing(site,id,['layout-001',id]);return r;}

test('approved historical replay and project player preserve the current physics gate',async t=>{
  const {approved,site,policy}=fixture(t);
  const {dir,record}=issueRelease(site,'new-layout');
  const old='past-layout',note='The carrier animation omitted its stop.';
  const historyPage='<aside role="note"><strong>Historical preliminary review</strong> '+note+'</aside>';
  const history={schema:record.schema,release:old,label:'Historical preliminary review',status:'historical-review',
    knownIssue:note,supersededBy:'new-layout'};
  const historyDir=path.join(site,tree,'releases',old);
  write(historyDir,'index.html',historyPage);write(historyDir,'release.json',history);
  const checked=readFileSync(path.join(dir,'index.html'));
  const projectPage='<h1>Work-in-progress preliminary design</h1>';
  write(dir,'package-motion.html',checked);write(dir,'index.html',projectPage);
  record.view.file='package-motion.html';write(dir,'release.json',record);
  listing(site,'new-layout',['layout-001',old,'new-layout']);
  const spec=policy.preliminaryReleases;
  spec.presentations={
    [old]:{historicalRecord:sha(readFileSync(path.join(historyDir,'release.json'))),files:{'index.html':sha(historyPage)}},
    'new-layout':{files:{'index.html':sha(projectPage)}}
  };
  assert.equal((await auditStaged(approved,site,policy)).preliminary.current,'new-layout');
  listing(site,old,['layout-001',old,'new-layout']);
  await assert.rejects(auditStaged(approved,site,policy),/cannot be current/);
  listing(site,'new-layout',['layout-001',old,'new-layout']);
  write(dir,'index.html',projectPage+'changed');
  await assert.rejects(auditStaged(approved,site,policy),/approved assets/);
  write(dir,'index.html',projectPage);
  write(dir,'package-motion.html','unverified');
  await assert.rejects(auditStaged(approved,site,policy),/Published view differs/);
  assert.throws(()=>verifyCatalog(path.join(site,tree),spec));
});

test('a layout-checked preliminary release with a mission case deploys without a signature', async t=>{
  const {approved,site,policy}=fixture(t);
  next(site,'layout-002');
  const result=await auditStaged(approved,site,policy);
  assert.deepEqual(result.preliminary.added,['layout-002']);
  assert.equal(result.preliminary.current,'layout-002');
  assert.equal(result.signed,0);
  listing(site,'layout-001',['layout-001','layout-002']);
  assert.equal((await auditStaged(approved,site,policy)).preliminary.current,'layout-001','the latest pointer may move');
});

test('a field-interaction trial bound by the receipt can carry the mission task', async t=>{
  const {approved,site,policy}=fixture(t);
  const trial=JSON.stringify({transport:{case:'loaded-turn',payload:'sample'}});
  next(site,'layout-002',{trial,missions:[{case:'loaded-turn',kind:'field-interaction-trial',accomplishes:'acquired',
    objective:'Carry the sample to the bin',trial:{file:'acquire-trial.json',sha256:sha(trial)}}]});
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002']);
  write(path.join(site,tree,'releases','layout-002'),'acquire-trial.json',JSON.stringify({transport:{case:'park'}}));
  await assert.rejects(auditStaged(approved,site,policy),/trial/i);
});

test('provisional, reopen and blocked receipts are each rejected', async t=>{
  for(const status of ['provisional','reopen','blocked']){
    const {approved,site,policy}=fixture(t);
    next(site,'layout-002',{status});
    await assert.rejects(auditStaged(approved,site,policy),/layout-checked/,status);
  }
  const {approved,site,policy}=fixture(t);
  next(site,'layout-002',{edit:r=>({...r,missingInputs:['Missing component purpose: rail']})});
  await assert.rejects(auditStaged(approved,site,policy),/missing input/i);
  const second=fixture(t);
  next(second.site,'layout-002',{edit:r=>({...r,control:{...r.control,witness:null}})});
  await assert.rejects(auditStaged(second.approved,second.site,second.policy),/displaced control/i);
  const third=fixture(t);
  next(third.site,'layout-002',{edit:r=>({...r,budgets:{...r.budgets,massStatus:'fail'}})});
  await assert.rejects(auditStaged(third.approved,third.site,third.policy),/mass/i);
  const fourth=fixture(t);
  next(fourth.site,'layout-002',{edit:r=>({...r,cases:[{case:'loaded-turn',status:'fail',pairs:[]},r.cases[1]]})});
  await assert.rejects(auditStaged(fourth.approved,fourth.site,fourth.policy),/clearance/i);
});

test('scene, view and receipt digest mismatches are rejected', async t=>{
  let f=fixture(t);
  let {dir}=next(f.site,'layout-002');
  write(dir,'motion.json','{"cases":[]}');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/scene/i);
  f=fixture(t);({dir}=next(f.site,'layout-002'));
  write(dir,'index.html',readFileSync(path.join(dir,'index.html'),'utf8').replace('</html>','<!-- edited --></html>')+' ');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/view/i);
  f=fixture(t);({dir}=next(f.site,'layout-002'));
  write(dir,'receipt.json',readFileSync(path.join(dir,'receipt.json'),'utf8')+'\n');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/receipt/i);
  f=fixture(t);next(f.site,'layout-002',{edit:r=>({...r,view:{...r.view,sha256:sha('another view')}})});
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/view/i);
});

test('a release without a represented mission case is rejected', async t=>{
  const cases=[[],[{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Hang from the bar'}],
    [{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Return to the start box'}],
    [{case:'park',kind:'operating-case',accomplishes:'delivered',objective:'Carry the sample to the bin'}],
    [{case:'loaded-turn',kind:'operating-case',accomplishes:'admired',objective:'Carry the sample to the bin'}]];
  for(const missions of cases){
    const {approved,site,policy}=fixture(t);
    next(site,'layout-002',{missions});
    await assert.rejects(auditStaged(approved,site,policy),/mission/i,JSON.stringify(missions));
  }
});

test('a changed primary entry point is rejected', async t=>{
  const {approved,site,policy}=fixture(t);
  next(site,'layout-002');
  write(site,'index.html','<iframe src="preliminary-design/"></iframe>');
  await assert.rejects(auditStaged(approved,site,policy),/primary entry point/i);
  const other=fixture(t);
  next(other.site,'layout-002');write(other.site,'media/robot-still.png','preliminary render');
  await assert.rejects(auditStaged(other.approved,other.site,other.policy),/primary entry point/i);
  const viewer=fixture(t);
  next(viewer.site,'layout-002');write(viewer.site,tree+'/index.html','<h1>Robot</h1>');
  await assert.rejects(auditStaged(viewer.approved,viewer.site,viewer.policy),/stable preliminary viewer/i);
});

test('earlier releases stay byte-identical and listed', async t=>{
  let f=fixture(t);
  next(f.site,'layout-002');write(path.join(f.site,tree,'releases','layout-001'),'budgets.json','{"masses":["edited"]}');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/earlier preliminary release/i);
  f=fixture(t);next(f.site,'layout-002');write(path.join(f.site,tree,'releases','layout-001'),'notes.json','{}');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/earlier preliminary release/i);
  f=fixture(t);issueRelease(f.site,'layout-002');listing(f.site,'layout-002',['layout-002']);
  rmSync(path.join(f.site,tree,'releases','layout-001'),{recursive:true});
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/earlier preliminary release/i);
  f=fixture(t);issueRelease(f.site,'layout-002');listing(f.site,'layout-002',['layout-002','layout-001']);
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/append/i);
  f=fixture(t);next(f.site,'layout-002');
  write(f.site,tree+'/releases.json',{current:'layout-002',releases:['layout-001','layout-002'],legacy:['layout-001']});
  assert.deepEqual((await auditStaged(f.approved,f.site,f.policy)).preliminary.added,['layout-002'],'an approved release can be legacy');
  write(f.site,tree+'/releases.json',{current:'layout-002',releases:['layout-001','layout-002'],legacy:['layout-001','layout-002']});
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/legacy/);
  f=fixture(t);next(f.site,'layout-002');write(path.join(f.site,tree,'releases','layout-002'),'model.glb','geometry');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/Unrecognized preliminary output/);
});

test('output outside the preliminary tree still requires the signed packet', async t=>{
  const {temp,approved,site,policy}=fixture(t);
  next(site,'layout-002');write(site,'models/robot-v2.glb','unsigned replacement');
  await assert.rejects(auditStaged(approved,site,policy),/Unreviewed added/);
  const {preliminaryReleases,...legacy}=policy;
  rmSync(path.join(site,'models','robot-v2.glb'));
  await assert.rejects(auditStaged(approved,site,legacy),/Unreviewed (added|changed)/,'the class is opt-in from the approved policy');
  const keys=generateKeyPairSync('ed25519');write(temp,'key.pem',keys.publicKey.export({type:'spki',format:'pem'}));
  const body={schema:'agent-frc/signed-model-release@9',project:policy.project,scope:'Detailed',configuration:'Mounted',solids:2,
    studySha256:sha('study'),archiveSha256:sha('archive'),stepSha256:sha('step'),files:[{path:tree+'/releases/layout-002/index.html',
    sha256:sha(readFileSync(path.join(site,tree,'releases','layout-002','index.html')))}]};
  write(temp,'packet.json',{body,signature:sign(null,Buffer.from(JSON.stringify(body)),keys.privateKey).toString('base64')});
  await assert.rejects(auditStaged(approved,site,policy,path.join(temp,'packet.json'),path.join(temp,'key.pem')),/signed packet/i);
});

function rewrite(dir,file,change){const v=JSON.parse(readFileSync(path.join(dir,file),'utf8'));change(v);write(dir,file,v);}
function repin(dir){rewrite(dir,'release.json',r=>{r.receipt.sha256=sha(readFileSync(path.join(dir,'receipt.json')));});}

test('a release cannot smuggle script, geometry or unpinned files into the tree', async t=>{
  let f=fixture(t);
  let {dir}=next(f.site,'layout-002');
  const html=readFileSync(path.join(dir,'index.html'),'utf8').replace('"issue":','"x":"</script><script>alert(1)</script>","issue":');
  write(dir,'index.html',html);
  rewrite(dir,'receipt.json',r=>{r.view.sha256=sha(html);});
  rewrite(dir,'release.json',r=>{r.view.sha256=sha(html);});repin(dir);
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/checked player/);
  for(const [file,bytes] of [['budgets.json','glTF\u0002 binary'],['limits.json','<html><script></script></html>'],
    ['budgets.json',JSON.stringify({asset:{version:'2.0'},meshes:[],masses:[],electricalCases:{}})]]){
    f=fixture(t);({dir}=next(f.site,'layout-002'));write(dir,file,bytes);
    rewrite(dir,'receipt.json',r=>{r.budgets[file==='budgets.json'?'source':'limits'].sha256=sha(bytes);});repin(dir);
    await assert.rejects(auditStaged(f.approved,f.site,f.policy),/Unreadable|expected evidence JSON/,file);
  }
  for(const extra of [{asset:{version:'2.0'},buffers:[],meshes:[{}]},'data:model/gltf-binary;base64,AAAA','Z2xURgIAAAA=']){
    f=fixture(t);({dir}=next(f.site,'layout-002'));
    const bytes=JSON.stringify({cases:[{id:'loaded-turn'}],extra:{nested:[extra]}});write(dir,'motion.json',bytes);
    rewrite(dir,'receipt.json',r=>{r.motion.sha256=sha(bytes);});
    rewrite(dir,'release.json',r=>{r.scene.sha256=sha(bytes);});repin(dir);
    await assert.rejects(auditStaged(f.approved,f.site,f.policy),/expected evidence JSON/,JSON.stringify(extra));
  }
  f=fixture(t);
  next(f.site,'layout-002',{missions:[{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',
    objective:'Carry the sample to the bin',trial:{file:'extra.json',sha256:sha('{}')}}]});
  write(path.join(f.site,tree,'releases','layout-002'),'extra.json','{}');
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/Only a field-interaction-trial/);
});

test('the player must display the receipt results and the viewer must carry the label', async t=>{
  for(const display of [d=>({...d,evidence:{...d.evidence,park:{status:'fail',pairs:[]}}}),
    d=>({...d,evidence:{...d.evidence,'package-displacement-control':{status:'pass',pairs:[]}}}),
    d=>({...d,narrativeReview:{objectives:[]}}),d=>({...d,mass:{range:[9,10],remaining:4}}),
    d=>({...d,power:[{case:'weak traverse',status:'fail'}]})]){
    const {approved,site,policy}=fixture(t);
    next(site,'layout-002',{display});
    await assert.rejects(auditStaged(approved,site,policy),/differ from the receipt/);
  }
  const {approved,site,policy}=fixture(t);
  const legacy='<!doctype html><title>Preliminary design releases</title>';
  write(approved,tree+'/index.html',legacy);write(site,tree+'/index.html',legacy);
  next(site,'layout-002');
  await assert.rejects(auditStaged(approved,site,policy),/work-in-progress label/);
  listing(site,'layout-001',['layout-001']);rmSync(path.join(site,tree,'releases','layout-002'),{recursive:true});
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,[],'unchanged history still deploys');
});

test('an author can check one release directory before committing it', async t=>{
  const {site}=fixture(t);
  const {dir}=issueRelease(site,'layout-002');
  assert.equal((await verifyRelease(dir)).release,'layout-002');
  const bad=issueRelease(site,'layout-003',{status:'provisional'});
  await assert.rejects(verifyRelease(bad.dir),/layout-checked/);
});

test('a release publishes only the compressed geometry its page and receipt pin, and the bundled fonts', async t=>{
  const {gzipSync}=await import('node:zlib');
  const {approved,site,policy}=fixture(t);
  const content=Buffer.from(JSON.stringify({schema:'agent-frc/package-geometry@1',meshes:[],cases:[]}));
  const compressed=gzipSync(content),file='package-motion.geometry.json.gz';
  const shown={file,contentSha256:sha(content),bytes:content.length};
  const pin={file,sha256:sha(compressed),contentSha256:sha(content)};
  const {dir}=next(site,'layout-002',{display:d=>({...d,geometry:shown}),edit:r=>({...r,view:{...r.view,geometry:pin}})});
  write(dir,file,compressed);
  const fonts=fileURLToPath(new URL('../templates/preliminary-review-fonts/',import.meta.url));
  cpSync(fonts,path.join(site,tree,'fonts'),{recursive:true});
  assert.deepEqual((await verifyRelease(dir)).missionCases,['loaded-turn']);
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002']);
  write(dir,file,gzipSync(Buffer.from('{"meshes":["unchecked"]}')));
  await assert.rejects(verifyRelease(dir),/Published geometry differs from the view and receipt/);
  write(dir,file,compressed);
  write(dir,'other.geometry.json.gz',compressed);
  await assert.rejects(verifyRelease(dir),/Unrecognized preliminary output: releases\/layout-002\/other.geometry.json.gz/);
  rmSync(path.join(dir,'other.geometry.json.gz'));
  rmSync(path.join(dir,file));
  await assert.rejects(verifyRelease(dir),/Published geometry differs/,'a page that fetches geometry needs the pinned file');
  write(dir,file,compressed);
  write(path.join(site,tree,'fonts'),'barlow-condensed-latin-600-normal.woff2','not the bundled font');
  await assert.rejects(auditStaged(approved,site,policy),/Unrecognized preliminary output: fonts\/barlow-condensed-latin-600-normal.woff2/);
  rmSync(path.join(site,tree,'fonts'),{recursive:true});
  write(path.join(site,tree,'fonts'),'robot.glb','model');
  await assert.rejects(auditStaged(approved,site,policy),/Unrecognized preliminary output: fonts\/robot.glb/);
});
