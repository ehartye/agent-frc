import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {auditStaged} from '../scripts/public-model-release.mjs';
import {fieldPlayerPolicy,verifyRelease,verifyCatalog} from '../scripts/preliminary-release.mjs';
import {gzipSync} from 'node:zlib';
import {reviewScene} from './fixtures/review-scene.mjs';

import {plugin,sha,stockPage,stableViewer,write,tree,objectives,fieldPage,laneTrial,laneObjective,issueRelease,listing,fixture,next} from './fixtures/preliminary-release.mjs';

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
  const projectPage='<h1>Preliminary design review</h1>';
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
  await assert.rejects(auditStaged(approved,site,policy),/cannot be current|current must open/);
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
  await assert.rejects(auditStaged(approved,site,policy),/current must open the effective release, else the newest in-progress one: expected layout-002/);
  listing(site,'layout-001',['layout-001','layout-002'],{'layout-001':'effective'},['layout-001']);
  assert.equal((await auditStaged(approved,site,policy)).preliminary.current,'layout-001','the stable URL opens the effective release');
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

test('a trial the receipt pins for a free payload path can carry the mission task', async t=>{
  const mission=trial=>[{case:'loaded-turn',kind:'field-interaction-trial',accomplishes:'delivered',
    objective:'Carry the sample to the bin',trial:{file:'acquire-trial.json',sha256:sha(trial)}}];
  const trial=JSON.stringify({freePath:{case:'loaded-turn',payload:'sample'}});
  const {approved,site,policy}=fixture(t);
  next(site,'layout-002',{trial,freePath:true,missions:mission(trial)});
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002']);
  // The free-path record must name this mission case, and the receipt stage must pin the trial.
  const other=JSON.stringify({freePath:{case:'park',payload:'sample'}}),wrong=fixture(t);
  next(wrong.site,'layout-002',{trial:other,freePath:true,missions:mission(other)});
  await assert.rejects(auditStaged(wrong.approved,wrong.site,wrong.policy),/not the one the receipt pins/);
  const unpinned=fixture(t);
  next(unpinned.site,'layout-002',{trial,freePath:true,missions:mission(trial),
    edit:r=>{delete r.stages['loaded-turn'].freePath;r.stages.park.freePath={sample:{evidence:{file:'acquire-trial.json',sha256:sha(trial)}}};return r;}});
  await assert.rejects(auditStaged(unpinned.approved,unpinned.site,unpinned.policy),/not the one the receipt pins/);
  // A free-path record does not satisfy a contact-transport pin, nor a transport record a free-path pin.
  for(const [record,asFree] of [[trial,false],[JSON.stringify({transport:{case:'loaded-turn',payload:'sample'}}),true]]){
    const crossed=fixture(t);
    next(crossed.site,'layout-002',{trial:record,freePath:asFree,missions:mission(record)});
    await assert.rejects(auditStaged(crossed.approved,crossed.site,crossed.policy),/not the one the receipt pins/);
  }
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
  // The page is the season's to change; the gate guards the data files instead.
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
  const recase=(d,id,status)=>({...d,cases:d.cases.map(c=>c.id===id?{...c,status}:c)});
  for(const display of [d=>recase(d,'park','fail'),d=>recase(d,'package-displacement-control','pass'),
    d=>({...d,narrativeReview:{source:null,objectives:[]}}),d=>({...d,mass:{...d.mass,inspectionKg:[9,10],remainingKg:4}}),
    d=>({...d,power:[{...d.power[0],status:'fail'}]}),d=>({...d,cases:d.cases.filter(c=>c.id!=='park')})]){
    const {approved,site,policy}=fixture(t);
    next(site,'layout-002',{display});
    await assert.rejects(auditStaged(approved,site,policy),/differ from the receipt/);
  }
  const {approved,site,policy}=fixture(t);
  const legacy='<!doctype html><title>Robot releases</title>';
  write(approved,tree+'/index.html',legacy);write(site,tree+'/index.html',legacy);
  next(site,'layout-002');
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002'],'an approved stable viewer needs no particular wording');
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

test('a scene cannot carry a scripted link, a second control or figures that differ from its published budgets', async t=>{
  for(const [display,pattern] of [[d=>({...d,links:[{label:'Season',href:'javascript:alert(1)'}]}),/links\/0\/href must match/],
    [d=>({...d,cases:[...d.cases,{...d.cases[2],id:'second-control',status:'pass'}]}),/one displaced control/],
    [d=>({...d,mass:{...d.mass,limitKg:99}}),/differ from the published budgets: Scene inspection limit differs from limits.json/],
    [d=>({...d,decision:{status:'layout-checked',firstUnmet:null}}),/decision/]]){
    const {approved,site,policy}=fixture(t);
    next(site,'layout-002',{display});
    await assert.rejects(auditStaged(approved,site,policy),pattern);
  }
});

test('a release publishes only the review scene its receipt pins, and the bundled fonts', async t=>{
  const {approved,site,policy}=fixture(t);
  const {dir}=next(site,'layout-002');
  const fonts=fileURLToPath(new URL('../templates/preliminary-review-fonts/',import.meta.url));
  cpSync(fonts,path.join(site,tree,'fonts'),{recursive:true});
  assert.deepEqual((await verifyRelease(dir)).missionCases,['loaded-turn']);
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002']);
  const scene=readFileSync(path.join(dir,'review-scene.json.gz'));
  write(dir,'review-scene.json.gz',gzipSync(Buffer.from('{"schema":"agent-frc/preliminary-review-scene@1"}')));
  await assert.rejects(verifyRelease(dir),/Published review scene differs from its receipt pin/);
  write(dir,'review-scene.json.gz',scene);
  write(dir,'other.json.gz',scene);
  await assert.rejects(verifyRelease(dir),/Unrecognized preliminary output: releases\/layout-002\/other.json.gz/);
  rmSync(path.join(dir,'other.json.gz'));
  rmSync(path.join(dir,'review-scene.json.gz'));
  await assert.rejects(verifyRelease(dir),/Published review scene differs from its receipt pin/,'the stock page needs its pinned scene');
  write(dir,'review-scene.json.gz',scene);
  // A scene the receipt pins but that is not a valid scene, or that would decompress past its pinned size, is refused.
  for(const [content,pattern] of [[Buffer.from('{"schema":"agent-frc/preliminary-review-scene@1","issue":"x"}'),/not a valid agent-frc\/preliminary-review-scene@1/],
    [Buffer.alloc(4096,32),/within its pinned size|content differs/]]){
    const served=gzipSync(content);write(dir,'review-scene.json.gz',served);
    rewrite(dir,'receipt.json',r=>{r.view.scene={file:'review-scene.json.gz',sha256:sha(served),contentSha256:sha(content),bytes:content.length>1000?16:content.length};});repin(dir);
    await assert.rejects(verifyRelease(dir),pattern);
  }
  write(path.join(site,tree,'fonts'),'barlow-condensed-latin-600-normal.woff2','not the bundled font');
  await assert.rejects(auditStaged(approved,site,policy),/Unrecognized preliminary output: fonts\/barlow-condensed-latin-600-normal.woff2/);
  rmSync(path.join(site,tree,'fonts'),{recursive:true});
  write(path.join(site,tree,'fonts'),'robot.glb','model');
  await assert.rejects(auditStaged(approved,site,policy),/Unrecognized preliminary output: fonts\/robot.glb/);
});

test('a listed, receipt-pinned season field player deploys inside its release', async t=>{
  let f=fixture(t);
  next(f.site,'layout-002',{field:{}});
  assert.deepEqual((await auditStaged(f.approved,f.site,f.policy)).preliminary.added,['layout-002']);
  f=fixture(t);
  next(f.site,'layout-002',{field:{},missions:[{case:'loaded-turn',kind:'field-interaction-trial',accomplishes:'delivered',
    objective:laneObjective,player:'field/lane.html'}]});
  assert.deepEqual((await auditStaged(f.approved,f.site,f.policy)).preliminary.added,['layout-002'],'a mission case can point to the player');
  const {dir}=issueRelease(f.site,'layout-003',{field:{}});
  assert.equal((await verifyRelease(dir)).release,'layout-003');
  f=fixture(t);
  next(f.site,'layout-002',{field:{},missions:[{case:'loaded-turn',kind:'field-interaction-trial',accomplishes:'delivered',
    objective:laneObjective,player:'field/other.html'}]});
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/player/);
});

test('unlisted, mismatched, unpinned or misdirected field players are rejected', async t=>{
  const row=(href,evidence={file:'lane-trial.json',sha256:sha(laneTrial)},objective=laneObjective)=>({title:'Lane',href,objective,evidence});
  const cases=[
    [{extra:{'field/other.html':fieldPage}},/Unrecognized preliminary output/],
    [{extra:{'field/nested/lane.html':fieldPage}},/Unrecognized preliminary output/],
    [{players:[{file:'field/lane.html',sha256:sha('another page'),trial:{file:'lane-trial.json',sha256:sha(laneTrial)},objective:laneObjective}]},/field player/],
    [{players:[{file:'field/lane.html',sha256:sha(fieldPage),trial:{file:'lane-trial.json',sha256:sha('another trial')},objective:laneObjective}]},/field player/],
    [{rows:[row('field/lane.html',{file:'lane-trial.json',sha256:sha('unpinned')})]},/receipt pins/],
    [{rows:[row('field/lane.html','described only')]},/receipt pins/],
    [{rows:[row('field/lane.html',undefined,'Hang from the bar')]},/objective/],
    [{rows:[row('field/missing.html'),row('field/lane.html')]},/listed field player/],
    [{rows:[row('https://example.invalid/lane.html','x'),row('field/lane.html')]},/listed field player/],
    [{rows:[row('../layout-001/index.html','x'),row('field/lane.html')]},/listed field player/],
    [{rows:[row('field/lane.html?case=x')]},/listed field player/],
    [{rows:[]},/listed field player/]];
  for(const [field,pattern] of cases){
    const f=fixture(t);next(f.site,'layout-002',{field});
    await assert.rejects(auditStaged(f.approved,f.site,f.policy),pattern,JSON.stringify(field).slice(0,120));
  }
  // A trial the receipt pins through transportedBy also binds the player.
  const transported=fixture(t);
  next(transported.site,'layout-002',{trial:laneTrial,field:{rows:[row('field/lane.html','Lane trial')]}});
  rmSync(path.join(transported.site,tree,'releases','layout-002','acquire-trial.json'));
  assert.deepEqual((await auditStaged(transported.approved,transported.site,transported.policy)).preliminary.added,['layout-002']);
});

// Tokenizer regressions: markup a browser reads that a naive scanner skips. Each must be found and refused.
const scannerCases={
 "empty-comment": "<!--><a href=\"https://e.example\">x</a><!-- -->",
 "bang-close": "<!-- --!><a href=\"https://e.example\">x</a><!-- -->",
 "svg-style": "<svg><style><a href=\"https://e.example\">x</a></style></svg>",
 "svg-refresh": "<svg><title><meta http-equiv=\"refresh\" content=\"0;url=https://e.example\"></title></svg>",
 "dotted-I": "<script>\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130\u0130</script><a href=https://e.example/>x</a>",
 "svg-breakout-comment": "<svg><p><style>/*<!--*/</style><a href=\"https://e.example\">x</a>--></svg>",
 "svg-cdata-comment": "<svg><![CDATA[ > <!-- ]]><a href=\"https://e.example\">x</a>--></svg>",
 "svg-script-link": "<svg><script>1</script><a href=\"https://e.example\">x</a></svg>",
 "math": "<math><mi>x</mi></math>",
 "foreign-object": "<svg><foreignObject><div>x</div></foreignObject></svg>",
 "uppercase-close": "<SCRIPT>1</SCRIPT ><a href=\"https://e.example\">x</a>"
};
test('a field player must be self-contained', async t=>{
  const policy='<meta http-equiv="Content-Security-Policy" content="'+fieldPlayerPolicy+'">';
  const pages=[
    fieldPage.replace('<canvas>','<script src="https://cdn.example.invalid/physics.js"></script><canvas>'),
    fieldPage.replace('frames.length','fetch("https://example.invalid/trace.json")'),
    fieldPage.replace('frames.length','new WebSocket("wss://example.invalid")'),
    fieldPage.replace('<canvas>','<iframe src="https://example.invalid/"></iframe><canvas>'),
    fieldPage.replace('<canvas>','<img src="https://example.invalid/pixel.png"><canvas>'),
    fieldPage.replace('<canvas>','<link rel="stylesheet" href="../../style.css"><canvas>'),
    fieldPage.replace(policy,''),
    fieldPage.replace("img-src data: blob:","img-src data: blob:; connect-src https:"),
    fieldPage.replace("default-src 'none'",'default-src *'),
    fieldPage.replace("default-src 'none'","default-src"+String.fromCharCode(0xa0)+"'none'"),
    fieldPage.replace("default-src 'none'","default-src"+String.fromCharCode(0x1c)+"'none'"),
    fieldPage.replace('<head>'+policy,'<head><meta charset="utf-8">'+policy),
    fieldPage.replace('<head>','<head><script>top.x=1</script>'),
    fieldPage.replace('<html lang="en">','<html lang="en" data-x=\'>').replace('<title>','\'><title>'),
    '<!doctype html><html data-x=\'><head>'+policy+'\'><body><script>1</script><p>Preliminary design release</p></html>',
    fieldPage.replace('<canvas>','<a href="https://example.invalid/">Source</a><canvas>'),
    fieldPage.replace('<canvas>','<a/href="https://example.invalid/">x</a><canvas>'),
    fieldPage.replace('<canvas>','<a title=">" href="https://example.invalid/">x</a><canvas>'),
    fieldPage.replace('<canvas>','<a href="&#104;ttps://example.invalid/">x</a><canvas>'),
    fieldPage.replace('<canvas>','<meta http-equiv="&#114;efresh" content="0;url=https://example.invalid"><canvas>'),
    String.fromCharCode(0xfeff,0xfeff)+fieldPage,
    ...Object.values(scannerCases).map(body=>fieldPage.replace('<canvas>',body+'<canvas>'))];
  for(const page of pages){
    const f=fixture(t);next(f.site,'layout-002',{field:{page}});
    await assert.rejects(auditStaged(f.approved,f.site,f.policy),/self-contained/,page.slice(0,200));
  }
  // Ordinary script and in-page fragments stay usable. Script-driven top-level navigation is out of scope for the static check.
  for(const page of [String.fromCharCode(0xfeff)+fieldPage,
    fieldPage.replace('<canvas>','<svg viewBox="0 0 10 10"><style>circle{fill:gold}</style><title>Lane</title><circle r="2"/></svg><svg/><canvas>'),fieldPage.replace('frames.length','(()=>{let data=frames;const src=1;return data.length+src})()'),
    fieldPage.replace('<canvas>','<a href="#trace">Trace</a><p>Robot location at release</p><script>const t="</div>";</script><canvas>')]){
    const f=fixture(t);next(f.site,'layout-002',{field:{page}});
    assert.deepEqual((await auditStaged(f.approved,f.site,f.policy)).preliminary.added,['layout-002'],page.slice(0,40));
  }
});

test('the plugin ships one canonical field player policy to both checkers and the starter', ()=>{
  const stage=readFileSync(path.join(plugin,'templates','stage-preliminary-review.py'),'utf8');
  const literal=/FIELD_PLAYER_POLICY = \(([\s\S]*?)\)\n/.exec(stage)[1].match(/"([^"]*)"/g).map(x=>x.slice(1,-1)).join('');
  assert.equal(literal,fieldPlayerPolicy);
  assert.ok(readFileSync(path.join(plugin,'templates','preliminary-review-field-interaction.html'),'utf8')
    .includes('<head>\n<meta http-equiv="Content-Security-Policy" content="'+fieldPlayerPolicy+'">'));
});

test('field player links name the served page and player missions bind their own case', async t=>{
  const row=href=>({title:'Lane',href,objective:laneObjective,evidence:{file:'lane-trial.json',sha256:sha(laneTrial)}});
  for(const href of ['field%2flane.html','field\\lane.html','field/LANE.html','field//lane.html','/field/lane.html']){
    const f=fixture(t);next(f.site,'layout-002',{field:{rows:[row(href)]}});
    // A backslash or root-relative link is refused by the scene schema before the player check.
    await assert.rejects(auditStaged(f.approved,f.site,f.policy),/listed field player|fieldInteractions\/0\/href must match/,href);
  }
  let f=fixture(t);next(f.site,'layout-002',{field:{rows:[row('./field/lane.html')]}});
  assert.deepEqual((await auditStaged(f.approved,f.site,f.policy)).preliminary.added,['layout-002']);
  f=fixture(t);
  next(f.site,'layout-002',{field:{},missions:[{case:'park',kind:'field-interaction-trial',accomplishes:'delivered',
    objective:laneObjective,player:'field/lane.html'}]});
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/operating case|different case/);
  f=fixture(t);
  const {dir}=next(f.site,'layout-002',{field:{},missions:[{case:'loaded-turn',kind:'field-interaction-trial',accomplishes:'delivered',
    objective:laneObjective,player:'field/lane.html'}]});
  const other=JSON.stringify({case:'park'});write(dir,'lane-trial.json',other);
  const record=JSON.parse(readFileSync(path.join(dir,'release.json'),'utf8'));record.fieldPlayers[0].trial.sha256=sha(other);write(dir,'release.json',record);
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/receipt pins|different case/);
});

test('stage.py --check-index applies the same field player rules', async t=>{
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const cases=[[{},0],[{extra:{'field/other.html':fieldPage}},/Unrecognized release files/],
    [{players:[{file:'field/lane.html',sha256:sha('x'),trial:{file:'lane-trial.json',sha256:sha(laneTrial)},objective:laneObjective}]},/differs from its pin/],
    [{page:fieldPage.replace('<canvas>','<script src="https://cdn.example.invalid/x.js"></script><canvas>')},/not self-contained/],
    [{page:fieldPage.replace('frames.length','fetch("https://example.invalid/")')},/not self-contained/],
    [{rows:[{title:'Lane',href:'field/missing.html',objective:laneObjective,evidence:'x'}]},/listed field player/],
    [{rows:[{title:'Lane',href:'field/lane.html',objective:laneObjective,evidence:'unpinned'}]},/receipt pins/],
    [{page:fieldPage.replace('<html lang="en">','<html lang="en" data-x=\'>').replace('<title>','\'><title>')},/not self-contained/],
    [{page:fieldPage.replace("default-src 'none'","default-src"+String.fromCharCode(0xa0)+"'none'")},/not self-contained/],
    [{page:fieldPage.replace("default-src 'none'","default-src"+String.fromCharCode(0x1c)+"'none'")},/not self-contained/],
    [{page:fieldPage.replace('<canvas>','<a title=">" href="https://example.invalid/">x</a><canvas>')},/not self-contained/],
    [{page:String.fromCharCode(0xfeff,0xfeff)+fieldPage},/not self-contained/],
    ...Object.values(scannerCases).map(body=>[{page:fieldPage.replace('<canvas>',body+'<canvas>')},/not self-contained/]),
    [{page:String.fromCharCode(0xfeff)+fieldPage},0],
    [{rows:[{title:'Lane',href:'field%2flane.html',objective:laneObjective,evidence:'x'}]},/listed field player/]];
  for(const [field,expected] of cases){
    const temp=mkdtempSync(path.join(os.tmpdir(),'prelim-index-'));
    t.after(()=>rmSync(temp,{recursive:true,force:true}));
    const docs=path.join(temp,'docs');
    write(temp,'cad/preliminary-design/stage.py',readFileSync(path.join(plugin,'templates','stage-preliminary-review.py')));
    issueRelease(docs,'layout-002',{field});listing(docs,'layout-002',['layout-002']);
    const run=spawnSync(python,[path.join(temp,'cad','preliminary-design','stage.py'),'--check-index'],{encoding:'utf8'});
    if(expected===0)assert.equal(run.status,0,run.stderr);
    else assert.match(run.stderr,expected,JSON.stringify(field).slice(0,100));
  }
});

test('stage.py --check-index accepts a mission trial pinned for a free payload path', async t=>{
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const trial=JSON.stringify({freePath:{case:'loaded-turn',payload:'sample'}});
  const missions=[{case:'loaded-turn',kind:'field-interaction-trial',accomplishes:'delivered',
    objective:'Carry the sample to the bin',trial:{file:'acquire-trial.json',sha256:sha(trial)}}];
  for(const [freePath,expected] of [[true,0],['other-case',/Mission case loaded-turn/],['unpinned',/Mission case loaded-turn/]]){
    const temp=mkdtempSync(path.join(os.tmpdir(),'prelim-index-'));
    t.after(()=>rmSync(temp,{recursive:true,force:true}));
    const docs=path.join(temp,'docs');
    write(temp,'cad/preliminary-design/stage.py',readFileSync(path.join(plugin,'templates','stage-preliminary-review.py')));
    const used=freePath==='other-case'?JSON.stringify({freePath:{case:'park',payload:'sample'}}):trial;
    issueRelease(docs,'layout-002',{trial:used,freePath:true,missions:[{...missions[0],trial:{file:'acquire-trial.json',sha256:sha(used)}}],
      edit:r=>{if(freePath==='unpinned')delete r.stages['loaded-turn'].freePath;return r;}});
    listing(docs,'layout-002',['layout-002']);
    const run=spawnSync(python,[path.join(temp,'cad','preliminary-design','stage.py'),'--check-index'],{encoding:'utf8'});
    if(expected===0)assert.equal(run.status,0,run.stderr);
    else assert.match(run.stderr,expected);
  }
});

test('an issued field player is immutable', async t=>{
  const f=fixture(t);
  issueRelease(f.approved,'layout-002',{field:{}});listing(f.approved,'layout-002',['layout-001','layout-002']);
  cpSync(f.approved,f.site,{recursive:true});
  assert.deepEqual((await auditStaged(f.approved,f.site,f.policy)).preliminary.added,[]);
  write(path.join(f.site,tree,'releases','layout-002'),'field/lane.html',fieldPage.replace('0.2','0.3'));
  await assert.rejects(auditStaged(f.approved,f.site,f.policy),/earlier preliminary release/);
});

test('design status lives in the index: effective, superseded and withdrawn without touching an issued release', async t=>{
  const {approved,site,policy}=fixture(t);
  next(site,'layout-002');
  cpSync(site,approved,{recursive:true,force:true});
  const audit=()=>auditStaged(approved,site,policy),ids=['layout-001','layout-002'];
  listing(site,'layout-001',ids,{'layout-001':'effective'},['layout-001']);
  const flipped=await audit();
  assert.deepEqual([flipped.preliminary.effective,flipped.preliminary.added],['layout-001',[]],'an index change alone marks a release effective');
  for(const [statuses,history,current,pattern] of [
    [{'layout-001':'final'},[],'layout-002',/designStatus maps listed release IDs/],
    [{'layout-009':'effective'},[],'layout-002',/designStatus maps listed release IDs/],
    [{'layout-001':'effective','layout-002':'effective'},['layout-001','layout-002'],'layout-001',/At most one/],
    [{'layout-001':'effective'},[],'layout-001',/last entry in effectiveHistory/],
    [{'layout-001':'superseded'},[],'layout-002',/cannot move from in-progress to superseded/]]){
    listing(site,current,ids,statuses,history);
    await assert.rejects(audit(),pattern,JSON.stringify(statuses));
  }
  // Approve layout-001 as effective. A successor cannot supersede it without its checkpoint, and nothing is superseded alone.
  listing(site,'layout-001',ids,{'layout-001':'effective'},['layout-001']);
  cpSync(site,approved,{recursive:true,force:true});
  listing(site,'layout-002',ids,{'layout-001':'superseded'},['layout-001']);
  await assert.rejects(audit(),/cannot move from effective to superseded/,'superseded needs a successor');
  listing(site,'layout-002',ids,{'layout-001':'superseded','layout-002':'effective'},['layout-001','layout-002']);
  await assert.rejects(audit(),/checked against the previous effective one, layout-001/);
  // Withdrawing the effective release first does not skip the check: the history remembers it.
  listing(site,'layout-002',ids,{'layout-001':'withdrawn'},['layout-001']);
  assert.equal((await audit()).preliminary.current,'layout-002','a withdrawn release is never current');
  cpSync(site,approved,{recursive:true,force:true});
  listing(site,'layout-002',ids,{'layout-001':'withdrawn','layout-002':'effective'},['layout-001','layout-002']);
  await assert.rejects(audit(),/checked against the previous effective one, layout-001/);
  listing(site,'layout-001',ids,{'layout-001':'effective'},['layout-001']);
  await assert.rejects(audit(),/cannot move from withdrawn to effective/,'nothing returns from withdrawn');
  const issued=readFileSync(path.join(site,tree,'releases','layout-002','receipt.json'));
  write(path.join(site,tree,'releases','layout-002'),'receipt.json',Buffer.concat([issued,Buffer.from(' ')]));
  listing(site,'layout-002',ids,{'layout-001':'withdrawn'},['layout-001']);
  await assert.rejects(audit(),/An earlier preliminary release changed/,'an issued release stays byte-immutable');
});

test('a successor checked against the effective release can supersede it', async t=>{
  const {approved,site,policy}=fixture(t);
  listing(site,'layout-001',['layout-001'],{'layout-001':'effective'},['layout-001']);
  cpSync(site,approved,{recursive:true,force:true});
  const prior=readFileSync(path.join(site,tree,'releases','layout-001','receipt.json'));
  const checked=r=>({...r,previousCheckpointSha256:sha(prior),priorDecisions:[{id:'acquire-time',repeatVerified:true}]});
  // Added directly as effective, without its predecessor checkpoint: refused.
  issueRelease(site,'layout-002');
  listing(site,'layout-002',['layout-001','layout-002'],{'layout-001':'superseded','layout-002':'effective'},['layout-001','layout-002']);
  await assert.rejects(auditStaged(approved,site,policy),/checked against the previous effective one, layout-001/);
  issueRelease(site,'layout-002',{edit:r=>({...checked(r),priorDecisions:[{id:'acquire-time',repeatVerified:false}]})});
  await assert.rejects(auditStaged(approved,site,policy),/every held decision repeat-verified/,'a hold the successor did not repeat is not a check against the predecessor');
  // Added directly as effective with the checkpoint: the default path is in progress, this one is effective at once.
  issueRelease(site,'layout-002',{edit:checked});
  const result=await auditStaged(approved,site,policy);
  assert.deepEqual([result.preliminary.added,result.preliminary.effective,result.preliminary.current],[['layout-002'],'layout-002','layout-002'],
    'a new release can enter effective when checked against its predecessor');
  listing(site,'layout-002',['layout-001','layout-002'],{'layout-001':'effective','layout-002':'effective'},['layout-001','layout-002']);
  await assert.rejects(auditStaged(approved,site,policy),/At most one/);
});

test('a catalog of releases issued with the earlier label still verifies', async t=>{
  const {site}=fixture(t);
  const {dir}=issueRelease(site,'layout-002',{field:{page:fieldPage.replace('<p>Preliminary design release</p>','<p>Work-in-progress preliminary design</p>')}});
  rewrite(dir,'release.json',r=>{delete r.phase;r.label='Work-in-progress preliminary design';});
  assert.equal((await verifyRelease(dir)).release,'layout-002','an issued record keeps its label');
  listing(site,'layout-002',['layout-001','layout-002']);
  assert.deepEqual(verifyCatalog(path.join(site,tree),{}).releases,['layout-001','layout-002']);
});

test('a release identifies itself only by the phase in its record', async t=>{
  for(const [change,pattern] of [[r=>{delete r.phase;},/identify its phase/],[r=>{r.phase='detailed-design';},/identify its phase/],
    [r=>{delete r.phase;r.label='Work-in-progress preliminary design';},/identify its phase/]]){
    const {approved,site,policy}=fixture(t);
    const {dir}=next(site,'layout-002');
    rewrite(dir,'release.json',change);
    await assert.rejects(auditStaged(approved,site,policy),pattern,'a newly added release names its phase');
  }
  const {approved,site,policy}=fixture(t);
  const {dir}=next(site,'layout-002');
  const page=readFileSync(path.join(dir,'index.html'),'utf8').replaceAll('Preliminary design','Robot design');
  write(dir,'index.html',page);
  rewrite(dir,'receipt.json',r=>{r.view.sha256=sha(page);});
  rewrite(dir,'release.json',r=>{r.view.sha256=sha(page);});repin(dir);
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002'],'page wording is the season\'s; the gate reads the record');
});

test('a season may change its copy of the stock page; the template comparison is information only', async t=>{
  const {approved,site,policy}=fixture(t);
  const {dir}=next(site,'layout-002');
  const page=readFileSync(path.join(dir,'index.html'),'utf8').replace('</main>','<section><h2>Season panel</h2></section></main>');
  write(dir,'index.html',page);
  rewrite(dir,'receipt.json',r=>{r.view.sha256=sha(page);});
  rewrite(dir,'release.json',r=>{r.view.sha256=sha(page);});repin(dir);
  assert.deepEqual((await auditStaged(approved,site,policy)).preliminary.added,['layout-002'],'a customized page still deploys');
  const {templateReport}=await import('../scripts/preliminary-release.mjs');
  const report=templateReport(dir);
  assert.equal(report.stockPage,false);
  assert.equal(report.contentSecurityPolicy,true);
  assert.ok(report.differences.length>=1&&/Information only/.test(report.note));
  write(dir,'index.html',stockPage);
  assert.equal(templateReport(dir).stockPage,true);
});
