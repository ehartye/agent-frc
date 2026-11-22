import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {audit,auditStaged} from '../scripts/public-model-release.mjs';
import {applyWithdrawal,markEffective,primaryView,refresh,writeIndex} from '../scripts/detailed-design-release.mjs';
import {fixture,issueRelease,plugin,sha,tree,write} from './fixtures/preliminary-release.mjs';

// Synthetic teaching fixtures: invented designs, releases, cases and objectives with no relation to any game.
const root='detailed-design',legacy='draft-001';
const catalog=readFileSync(path.join(plugin,'templates','detailed-design-index.html'));
const prelimIndex='../'+tree+'/releases.json';
const read=(...parts)=>readFileSync(path.join(...parts));
function prelimListing(site,statuses){
  const releases=Object.keys(statuses);
  const current=releases.find(i=>statuses[i]==='effective')??releases.at(-1);
  const effectiveHistory=releases.filter(i=>['effective','superseded'].includes(statuses[i]));
  write(site,tree+'/releases.json',{current,releases,designStatus:statuses,...(effectiveHistory.length?{effectiveHistory}:{})});
}
/** Publish the detailed index from entries; the primary view is computed unless a test overrides it. */
function publish(site,entries,override={}){
  write(site,root+'/index.html',catalog);
  write(site,root+'/designs.json',JSON.stringify({...JSON.parse(writeIndex(entries,prelimIndex)),...override},null,2));
}
/** A checked design directory: the layout-check outputs on the detailed STEP plus its binding record. */
function issueDesign(site,id,{release='layout-001',record=r=>r,...options}={}){
  const scratch=mkdtempSync(path.join(os.tmpdir(),'detail-design-'));
  const {dir:from,record:checked}=issueRelease(scratch,id,options);
  const dir=path.join(site,root,'designs',id);
  cpSync(from,dir,{recursive:true});rmSync(path.join(dir,'release.json'));rmSync(scratch,{recursive:true,force:true});
  const linked=path.join(site,tree,'releases',release);
  const design=record({schema:'agent-frc/detailed-design@1',design:id,issue:checked.issue,label:'In-progress detailed design',
    preliminary:existsSync(linked)?{release,sha256:sha(read(linked,'release.json')),receiptSha256:sha(read(linked,'receipt.json'))}:
      {release,sha256:sha('absent'),receiptSha256:sha('absent')},
    fusion:{authoritySha256:sha('register '+id),lineageSha256:sha('lineage '+id),archiveSha256:sha('archive '+id),
      stepSha256:checked.scene.stepSha256,configuration:'Installed assembly in its stowed pose',revision:'review-'+id},
    receipt:checked.receipt,view:checked.view,scene:checked.scene,missionCases:checked.missionCases});
  write(dir,'design.json',design);
  return {dir,design};
}
/** A site that already publishes a legacy model, an effective preliminary release and the registered legacy design. */
function setup(t,{legacyDesign=legacy}={}){
  const made=fixture(t);
  for(const site of [made.approved,made.site]){
    prelimListing(site,{'layout-001':'effective'});
    publish(site,legacyDesign?[{design:legacyDesign,status:'effective'}]:[]);
  }
  made.policy.detailedDesigns={root,legacy:legacyDesign?{design:legacyDesign}:null};
  return made;
}
const entry=(design,status,extra={})=>({design,status,...extra});
const draft=entry(legacy,'effective');
const progress=id=>entry(id,'in-progress',{preliminary:'layout-001'});
function signer(temp){
  const keys=generateKeyPairSync('ed25519');write(temp,'key.pem',keys.publicKey.export({type:'spki',format:'pem'}));
  return (site,files,{step,archive})=>{
    const body={schema:'agent-frc/signed-model-release@9',project:'Teaching project',scope:'Detailed',configuration:'Mounted',solids:2,
      studySha256:sha('study'),archiveSha256:archive,stepSha256:step,files:files.map(f=>({path:f,sha256:sha(read(site,f))}))};
    write(temp,'packet.json',{body,signature:sign(null,Buffer.from(JSON.stringify(body)),keys.privateKey).toString('base64')});
    return [path.join(temp,'packet.json'),path.join(temp,'key.pem')];
  };
}
/** A directly issued effective design: a record bound to the signed issue's STEP and archive. */
function effectiveRecord(site,id){
  const fusion={stepSha256:sha('reviewed step '+id),archiveSha256:sha('reviewed archive '+id),configuration:'Mounted'};
  write(site,root+'/designs/'+id+'/design.json',{schema:'agent-frc/detailed-design@1',design:id,label:'Effective detailed design',fusion});
  return {step:fusion.stepSha256,archive:fusion.archiveSha256};
}

test('an in-progress detailed design with all three prerequisites deploys beside the effective design without a signature',async t=>{
  const {approved,site,policy}=setup(t);
  issueDesign(site,'detail-001');publish(site,[draft,progress('detail-001')]);
  const result=await auditStaged(approved,site,policy);
  assert.deepEqual(result.designs.added,['detail-001']);
  assert.equal(result.designs.current,legacy,'the effective design keeps the primary view');
  assert.equal(result.designs.beside,'detail-001');
  assert.equal(result.signed,0);
  write(site,'index.html','the in-progress design takes over the entry page');
  await assert.rejects(auditStaged(approved,site,policy),/primary entry point changed without a signed/,'the effective view stays under the signed gate');
});

test('an in-progress design must link an effective preliminary release by ID and digest',async t=>{
  for(const status of ['in-progress','superseded','withdrawn']){
    const {approved,site,policy}=setup(t);
    for(const s of [approved,site])prelimListing(s,{'layout-001':status});
    issueDesign(site,'detail-001');publish(site,[draft,progress('detail-001')]);
    await assert.rejects(auditStaged(approved,site,policy),new RegExp('must link an effective preliminary release; layout-001 is '+status));
  }
  const {approved,site,policy}=setup(t);
  issueDesign(site,'detail-001',{record:r=>({...r,preliminary:undefined})});publish(site,[draft,entry('detail-001','in-progress')]);
  await assert.rejects(auditStaged(approved,site,policy),/must link a preliminary release by ID and digest/);
  issueDesign(site,'detail-001',{release:'layout-009'});publish(site,[draft,entry('detail-001','in-progress',{preliminary:'layout-009'})]);
  await assert.rejects(auditStaged(approved,site,policy),/not published: layout-009/);
  issueDesign(site,'detail-001',{record:r=>({...r,preliminary:{...r.preliminary,sha256:sha('another release')}})});
  publish(site,[draft,progress('detail-001')]);
  await assert.rejects(auditStaged(approved,site,policy),/links preliminary release layout-001 with a different digest/);
});

test('an in-progress design needs a passing layout check on the registered Fusion export',async t=>{
  const {approved,site,policy}=setup(t);
  const listed=()=>publish(site,[draft,progress('detail-001')]);
  for(const [edit,expected,status] of [
    [r=>r,/layout-checked/,'provisional'],
    [r=>({...r,cases:[{case:'loaded-turn',status:'fail',pairs:[]},r.cases[1]]}),/clearance case/],
    [r=>({...r,control:{...r.control,witness:{...r.control.witness,status:'pass'}}}),/displaced control/],
    [r=>({...r,budgets:{...r.budgets,massStatus:'fail'}}),/mass budget/],
    [r=>({...r,budgets:{...r.budgets,electricalCases:[{case:'weak traverse',status:'fail'}]}}),/loaded-voltage/]]){
    issueDesign(site,'detail-001',{status,edit});listed();
    await assert.rejects(auditStaged(approved,site,policy),expected);
    rmSync(path.join(site,root,'designs','detail-001'),{recursive:true});
  }
  issueDesign(site,'detail-001',{record:r=>({...r,fusion:{...r.fusion,stepSha256:sha('some other export')}})});listed();
  await assert.rejects(auditStaged(approved,site,policy),/STEP other than the registered Fusion export/);
  issueDesign(site,'detail-001',{record:({fusion:{archiveSha256,...rest},...r})=>({...r,fusion:rest})});listed();
  await assert.rejects(auditStaged(approved,site,policy),/bind the registered Fusion authority, lineage, archive and exported STEP/);
  // The check must cover the linked release's cases, cycle and displaced control.
  issueDesign(site,'detail-001',{edit:r=>({...r,control:{...r.control,displaced:'another group'}})});listed();
  await assert.rejects(auditStaged(approved,site,policy),/motion cases, cycle and displaced control of preliminary release layout-001/);
});

test('an in-progress design needs a mission animation with passing evidence',async t=>{
  const {approved,site,policy}=setup(t);
  issueDesign(site,'detail-001',{missions:[]});publish(site,[draft,progress('detail-001')]);
  await assert.rejects(auditStaged(approved,site,policy),/declares no mission-task case/);
  issueDesign(site,'detail-001',{missions:[{case:'loaded-turn',kind:'operating-case',accomplishes:'delivered',objective:'Hang from the bar'}]});
  await assert.rejects(auditStaged(approved,site,policy),/represented narrative objective/);
});

test('an effective detailed design still requires the signed mechanical-readiness issue',async t=>{
  const {temp,approved,site,policy}=setup(t);
  const packet=signer(temp);
  const issue=effectiveRecord(site,'detail-002');
  publish(site,[entry(legacy,'superseded',{supersededBy:'detail-002'}),entry('detail-002','effective')]);
  write(site,'models/robot.glb','reviewed replacement model');
  await assert.rejects(auditStaged(approved,site,policy),/needs the signed mechanical-readiness issue/);
  const record=root+'/designs/detail-002/design.json';
  await assert.rejects(auditStaged(approved,site,policy,...packet(site,[record,'models/robot.glb'],{step:sha('a different issue'),archive:issue.archive})),
    /needs the signed mechanical-readiness issue/,'the packet must be the issue the record names');
  await assert.rejects(auditStaged(approved,site,policy,...packet(site,['models/robot.glb'],issue)),/needs the signed mechanical-readiness issue/);
  const result=await auditStaged(approved,site,policy,...packet(site,[record,'models/robot.glb'],issue));
  assert.equal(result.designs.current,'detail-002');
  assert.deepEqual(result.designs.designs.map(d=>d.status),['superseded','effective'],'the second effective design supersedes the first');
  publish(site,[draft,entry('detail-002','effective')]);
  await assert.rejects(auditStaged(approved,site,policy,...packet(site,[record,'models/robot.glb'],issue)),/At most one detailed design can be effective/);
  // A passing automated gate never makes a design effective.
  rmSync(path.join(site,root,'designs','detail-002'),{recursive:true});
  write(site,'models/robot.glb','approved detailed model');
  issueDesign(site,'detail-002');
  publish(site,[entry(legacy,'superseded',{supersededBy:'detail-002'}),entry('detail-002','effective',{preliminary:'layout-001'})]);
  await assert.rejects(auditStaged(approved,site,policy),/needs the signed mechanical-readiness issue/);
});

test('an in-progress design becomes effective only through the signed issue on its own export',async t=>{
  const {temp,approved,site,policy}=setup(t);
  const {design}=issueDesign(approved,'detail-001');publish(approved,[draft,progress('detail-001')]);
  cpSync(path.join(approved,root),path.join(site,root),{recursive:true});
  publish(site,[entry(legacy,'superseded',{supersededBy:'detail-001'}),entry('detail-001','effective',{preliminary:'layout-001'})]);
  await assert.rejects(auditStaged(approved,site,policy),/needs the signed mechanical-readiness issue/);
  const packet=signer(temp),record=root+'/designs/detail-001/design.json';
  const result=await auditStaged(approved,site,policy,...packet(site,[record],{step:design.fusion.stepSha256,archive:design.fusion.archiveSha256}));
  assert.deepEqual([result.designs.current,result.designs.beside],['detail-001',null]);
});

test('the primary view follows the status rule in each combination',async t=>{
  assert.deepEqual(primaryView([entry('a','effective')]),{current:'a',beside:null});
  assert.deepEqual(primaryView([entry('a','effective'),entry('b','in-progress')]),{current:'a',beside:'b'});
  assert.deepEqual(primaryView([entry('a','withdrawn'),entry('b','in-progress')]),{current:'b',beside:null});
  assert.deepEqual(primaryView([entry('a','withdrawn'),entry('b','superseded')]),{current:null,beside:null});
  const {approved,site,policy}=setup(t);
  issueDesign(site,'detail-001');
  publish(site,[draft,progress('detail-001')],{current:'detail-001',beside:null});
  await assert.rejects(auditStaged(approved,site,policy),/expected current draft-001 and beside detail-001/,'an in-progress design cannot take the primary spot from an effective one');
  publish(site,[draft,progress('detail-001')],{beside:null});
  await assert.rejects(auditStaged(approved,site,policy),/expected current draft-001 and beside detail-001/);
});

test('with no effective design the in-progress design takes the primary view, and none says so',async t=>{
  const {approved,site,policy}=setup(t,{legacyDesign:null});
  // The policy declares that no model was published before the status process; the registered model keeps the gate anyway.
  write(site,'index.html','entry page rewritten');
  await assert.rejects(auditStaged(approved,site,policy),/primary entry point changed without a signed/);
  for(const s of [approved,site])rmSync(path.join(s,'models','robot.glb'));
  policy.modelFiles=['index.html'];
  let result=await auditStaged(approved,site,policy);
  assert.deepEqual([result.designs.current,result.designs.beside],[null,null]);
  issueDesign(site,'detail-001');publish(site,[progress('detail-001')]);
  write(site,'index.html','in-progress detailed design, front and center');
  result=await auditStaged(approved,site,policy);
  assert.deepEqual([result.designs.current,result.designs.beside],['detail-001',null]);
  write(site,'models/robot.glb','an unreviewed model beside the page');
  await assert.rejects(auditStaged(approved,site,policy),/primary entry point changed without a signed/,'any published model locks the entry points again');
  write(site,'index.html',read(approved,'index.html'));
  await assert.rejects(auditStaged(approved,site,policy),/Unreviewed added or removed output: models\/robot.glb/);
});

test('several designs can be in progress and the newest is shown',async t=>{
  const {approved,site,policy}=setup(t);
  for(const s of [approved,site]){issueDesign(s,'detail-001');publish(s,[draft,progress('detail-001')]);}
  issueDesign(site,'detail-002');
  publish(site,[draft,progress('detail-001'),progress('detail-002')]);
  assert.equal((await auditStaged(approved,site,policy)).designs.beside,'detail-002');
  // Superseded is for a replaced effective design; an abandoned in-progress design is withdrawn by declaration.
  publish(site,[draft,entry('detail-001','superseded',{preliminary:'layout-001',supersededBy:'detail-002'}),progress('detail-002')]);
  await assert.rejects(auditStaged(approved,site,policy),/Only an effective design can be superseded/);
  publish(site,[draft,entry('detail-001','withdrawn',{preliminary:'layout-001',reason:'Abandoned.'}),progress('detail-002')]);
  await assert.rejects(auditStaged(approved,site,policy),/needs its declaration in the approved policy/);
  policy.detailedDesigns.withdrawn=[{design:'detail-001',reason:'Abandoned.',files:[]}];
  assert.deepEqual((await auditStaged(approved,site,policy)).designs.withdrawn,['detail-001']);
  write(path.join(site,root,'designs','detail-001'),'motion.json','{"cases":[]}');
  await assert.rejects(auditStaged(approved,site,policy),/issued detailed design or its archive changed/);
});

test('a declared withdrawal archives the model and frees the primary view',async t=>{
  const {temp,approved,site,policy}=setup(t);
  const withdrawnEntry=entry(legacy,'withdrawn',{reason:'Rough draft published before the design-status process.'});
  const apply=()=>{
    for(const f of ['index.html','media/robot-still.png','models/robot.glb'])write(site,root+'/archive/'+legacy+'/'+f,read(approved,f));
    rmSync(path.join(site,'models','robot.glb'),{force:true});
    write(site,'index.html','No detailed design is published. See the current preliminary design.');
    write(site,'media/robot-still.png','preliminary still');
    publish(site,[withdrawnEntry]);
  };
  apply();
  await assert.rejects(auditStaged(approved,site,policy),/needs its declaration in the approved policy/,'an undeclared withdrawal fails');
  policy.detailedDesigns.withdrawn=[{design:legacy,reason:withdrawnEntry.reason,files:['index.html','media/robot-still.png']}];
  await assert.rejects(auditStaged(approved,site,policy),/must free every registered model file and primary entry point/);
  policy.detailedDesigns.withdrawn[0].files.push('models/robot.glb');
  const result=await auditStaged(approved,site,policy);
  assert.deepEqual([result.designs.current,result.designs.beside],[null,null]);
  assert.deepEqual(result.designs.withdrawn,[legacy]);
  assert.deepEqual(result.designs.designs,[{design:legacy,status:'withdrawn'}],'the design stays listed, labelled withdrawn');
  assert.equal(result.signed,0);
  // Nothing is deleted from history, and the model cannot stay published.
  write(site,root+'/archive/'+legacy+'/models/robot.glb','trimmed');
  await assert.rejects(auditStaged(approved,site,policy),/Archive every withdrawn file byte for byte/);
  apply();write(site,'models/robot.glb','approved detailed model');
  await assert.rejects(auditStaged(approved,site,policy),/A withdrawn model is still published/);
  apply();publish(site,[{...withdrawnEntry,reason:'Another reason.'}]);
  await assert.rejects(auditStaged(approved,site,policy),/reason differs from the approved declaration/);
  // Once withdrawn and approved, an in-progress design can take the primary view; the archive stays immutable.
  apply();
  const next=path.join(temp,'next');cpSync(site,next,{recursive:true});
  issueDesign(next,'detail-001');publish(next,[withdrawnEntry,progress('detail-001')]);
  write(next,'index.html','in-progress detailed design, front and center');
  assert.equal((await auditStaged(site,next,policy)).designs.current,'detail-001');
  rmSync(path.join(next,root,'archive'),{recursive:true});
  await assert.rejects(auditStaged(site,next,policy),/issued detailed design or its archive changed or was removed/);
});

test('an undeclared removal of the primary model still fails',async t=>{
  const {approved,site,policy}=setup(t);
  rmSync(path.join(site,'models','robot.glb'));
  await assert.rejects(auditStaged(approved,site,policy),/Registered model output disappeared/);
  write(site,'models/robot.glb','approved detailed model');
  // A declaration alone changes nothing until the index applies it, and dropping the design from the index is refused.
  policy.detailedDesigns.withdrawn=[{design:legacy,reason:'Rough draft.',files:['index.html','media/robot-still.png','models/robot.glb']}];
  assert.equal((await auditStaged(approved,site,policy)).designs.current,legacy);
  rmSync(path.join(site,'models','robot.glb'));
  await assert.rejects(auditStaged(approved,site,policy),/Registered model output disappeared/);
  publish(site,[]);
  await assert.rejects(auditStaged(approved,site,policy),/may only append|List the legacy design/);
  // Without the index, a declared legacy design holds the primary view exactly as before the status process.
  for(const s of [approved,site])rmSync(path.join(s,root),{recursive:true});
  write(site,'index.html','entry page rewritten');
  await assert.rejects(auditStaged(approved,site,policy),/primary entry point changed without a signed/);
});

test('a superseded preliminary link warns about re-linking without pulling or failing the design',async t=>{
  const {approved,site,policy}=setup(t);
  for(const s of [approved,site]){issueDesign(s,'detail-001');publish(s,[draft,progress('detail-001')]);}
  for(const s of [approved,site]){issueRelease(s,'layout-002');prelimListing(s,{'layout-001':'superseded','layout-002':'effective'});}
  const result=await auditStaged(approved,site,policy);
  assert.equal(result.designs.beside,'detail-001','the design stays published');
  assert.match(result.designs.warnings[0],/detail-001 links preliminary release layout-001, which is now superseded/);
  write(site,'.policy.json',policy);
  assert.match(refresh({site,policyFile:path.join(site,'.policy.json')}).warnings[0],/Re-link it/);
});

test('the stock commands write transitions the gate accepts',async t=>{
  const {temp,approved,site,policy}=setup(t);
  policy.detailedDesigns.withdrawn=[{design:legacy,reason:'Rough draft.',files:['index.html','media/robot-still.png','models/robot.glb']}];
  write(temp,'policy.json',policy);
  const policyFile=path.join(temp,'policy.json');
  applyWithdrawal({site,policyFile,design:legacy});
  assert.equal(existsSync(path.join(site,'models','robot.glb')),false);
  assert.deepEqual(readdirSync(path.join(site,root,'archive',legacy)).sort(),['index.html','media','models']);
  assert.deepEqual((await auditStaged(approved,site,policy)).designs.withdrawn,[legacy]);
  assert.throws(()=>applyWithdrawal({site,policyFile,design:legacy}),/already withdrawn/);
  // effective: a new signed design and its record.
  const second=setup(t);write(second.temp,'policy.json',second.policy);
  const packet=signer(second.temp),issue={step:sha('reviewed step'),archive:sha('reviewed archive')};
  write(second.site,'models/robot.glb','reviewed replacement model');
  const [packetFile]=packet(second.site,['models/robot.glb'],issue);
  markEffective({site:second.site,policyFile:path.join(second.temp,'policy.json'),design:'detail-002',packetFile});
  const result=await auditStaged(second.approved,second.site,second.policy,
    ...packet(second.site,[root+'/designs/detail-002/design.json','models/robot.glb'],issue));
  assert.deepEqual(result.designs.designs,[{design:legacy,status:'superseded'},{design:'detail-002',status:'effective'}]);
});

test('the source audit frees a withdrawn model only with its declaration, its archive and no effective design',async t=>{
  const repo=mkdtempSync(path.join(os.tmpdir(),'detail-source-'));
  t.after(()=>rmSync(repo,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
  git('init','-q');git('config','user.email','student@example.invalid');git('config','user.name','Student');git('config','core.autocrlf','false');
  const reason='Rough draft.',index='docs/'+root+'/designs.json',kept='docs/'+root+'/archive/'+legacy+'/models/robot.glb';
  const policy={schema:'agent-frc/public-model-policy@1',project:'Teaching project',publicRoots:['docs'],modelFiles:['docs/models/robot.glb','docs/index.html']};
  write(repo,'docs/models/robot.glb','approved detailed model');write(repo,'docs/index.html','detailed robot');
  write(repo,index,writeIndex([draft],prelimIndex));
  write(repo,'policy.json',policy);git('add','.');git('commit','-qm','Approved site');
  const before=git('rev-parse','HEAD');
  const withdraw=()=>{
    write(repo,kept,'approved detailed model');write(repo,'docs/'+root+'/archive/'+legacy+'/index.html','detailed robot');
    rmSync(path.join(repo,'docs/models/robot.glb'),{force:true});write(repo,'docs/index.html','No detailed design is published.');
    write(repo,index,writeIndex([entry(legacy,'withdrawn',{reason})],prelimIndex));
  };
  withdraw();
  await assert.rejects(audit(repo,before,'policy.json'),/robot\.glb/,'an undeclared removal fails');
  git('checkout','-q','--','.');git('clean','-qfd');
  write(repo,'policy.json',{...policy,detailedDesigns:{index,withdrawn:[{design:legacy,reason,
    files:{'docs/models/robot.glb':kept,'docs/index.html':'docs/'+root+'/archive/'+legacy+'/index.html'}}]}});
  git('add','.');git('commit','-qm','Declare the withdrawal');
  const base=git('rev-parse','HEAD');
  rmSync(path.join(repo,'docs/models/robot.glb'));
  await assert.rejects(audit(repo,base,'policy.json'),/robot\.glb/,'the declaration alone removes nothing');
  withdraw();
  assert.deepEqual((await audit(repo,base,'policy.json')).withdrawnFiles.sort(),['docs/index.html','docs/models/robot.glb']);
  write(repo,kept,'trimmed');
  await assert.rejects(audit(repo,base,'policy.json'),/archive of a withdrawn file differs from its approved bytes/);
  withdraw();write(repo,'docs/models/robot.glb','an unreviewed model at the freed path');
  await assert.rejects(audit(repo,base,'policy.json'),/A withdrawn model is still published/);
  withdraw();
  write(repo,index,writeIndex([entry(legacy,'withdrawn',{reason}),entry('detail-002','effective')],prelimIndex));
  await assert.rejects(audit(repo,base,'policy.json'),/robot\.glb|index\.html/,'an effective design restores the full gate');
  // A standing declaration cannot retire a later effective design by editing the candidate index.
  write(repo,'docs/models/robot.glb','signed successor model');write(repo,'docs/index.html','signed successor page');
  git('add','.');git('commit','-qm','Approved successor');
  const later=git('rev-parse','HEAD');
  await audit(repo,later,'policy.json');
  for(const forged of [[entry(legacy,'withdrawn',{reason})],[entry(legacy,'withdrawn',{reason}),entry('detail-002','superseded',{supersededBy:'detail-003'})]]){
    write(repo,index,writeIndex(forged,prelimIndex));
    write(repo,'docs/index.html','unsigned page');
    await assert.rejects(audit(repo,later,'policy.json'),/Changed public model asset without matching approved issue: docs\/index\.html/);
    rmSync(path.join(repo,'docs/models/robot.glb'));
    await assert.rejects(audit(repo,later,'policy.json'),/robot\.glb/);
    git('checkout','-q','--','.');
  }
});

test('the detailed class admits nothing outside its declared shape',async t=>{
  const {approved,site,policy}=setup(t);
  // A file named as the tree root, and a record used as a container.
  const bare=setup(t);
  for(const s of [bare.approved,bare.site])rmSync(path.join(s,root),{recursive:true});
  write(bare.site,root,'a file where the tree belongs');
  await assert.rejects(auditStaged(bare.approved,bare.site,bare.policy),/Unrecognized detailed design output/);
  issueDesign(site,'detail-001',{record:r=>({...r,model:{asset:{version:'2.0'},meshes:[]}})});publish(site,[draft,progress('detail-001')]);
  await assert.rejects(auditStaged(approved,site,policy),/holds more than its bindings/);
  write(site,root+'/designs/detail-001/extra.json','{}');
  await assert.rejects(auditStaged(approved,site,policy),/holds more than its bindings|Unrecognized/);
  // A model cannot be registered as an entry point, where the primary view rule would free it.
  policy.preliminaryReleases.primaryEntryPoints.push('models/robot.glb');
  await assert.rejects(auditStaged(approved,site,policy),/register model geometry under modelFiles/);
});

test('a withdrawn path returns only under a signed effective design and is never free beside one',async t=>{
  const {temp,approved,site,policy}=setup(t);
  const reason='Rough draft.',files=['index.html','media/robot-still.png','models/robot.glb'];
  policy.detailedDesigns.withdrawn=[{design:legacy,reason,files}];
  write(temp,'policy.json',policy);
  applyWithdrawal({site,policyFile:path.join(temp,'policy.json'),design:legacy});
  await auditStaged(approved,site,policy);
  // The withdrawn site is now approved; a signed design republishes the model at the registered path.
  const next=path.join(temp,'next');cpSync(site,next,{recursive:true});
  const issue=effectiveRecord(next,'detail-002'),record=root+'/designs/detail-002/design.json';
  write(next,'models/robot.glb','reviewed model');write(next,'index.html','reviewed entry page');
  publish(next,[entry(legacy,'withdrawn',{reason}),entry('detail-002','effective')]);
  await assert.rejects(auditStaged(site,next,policy),/needs the signed mechanical-readiness issue/);
  const packet=signer(temp);
  const result=await auditStaged(site,next,policy,...packet(next,[record,'models/robot.glb','index.html'],issue));
  assert.equal(result.designs.current,'detail-002');
  // With that design effective, the old declaration frees nothing.
  const after=path.join(temp,'after');cpSync(next,after,{recursive:true});
  rmSync(path.join(after,'models','robot.glb'));
  await assert.rejects(auditStaged(next,after,policy),/Registered model output disappeared/);
  write(after,'models/robot.glb','reviewed model');write(after,'index.html','unsigned entry page');
  await assert.rejects(auditStaged(next,after,policy),/primary entry point changed without a signed/);
});

test('staging binds the layout check to the registered Fusion export and the effective preliminary release',async t=>{
  const {temp,approved,site,policy}=setup(t);
  write(temp,'policy.json',policy);
  // An invented offline Fusion register and export lineage in a project checkout.
  const project=path.join(temp,'project'),script=read(plugin,'scripts','fusion_authority.py');
  const pin=(file,body)=>{write(project,file,body);return {file,sha256:sha(body)};};
  const archive=pin('cad/student.f3d','invented native archive'),step=pin('cad/issue.step','step detail-001');
  const spec={schema:'agent-frc/fusion-authority@1',id:'student-assembly',configuration:'Installed assembly in its stowed pose',
    nativeConfiguration:'unconfigured',revision:'review-r1',basis:'Design lead selected the installed assembly.',
    source:{kind:'offline',archive},pinnedChildren:[]};
  const authority=pin('cad/fusion-authority.json',JSON.stringify(spec));
  write(project,'cad/lineage.json',{schema:'agent-frc/fusion-export-lineage@1',authority,exporterSha256:sha(script),id:spec.id,
    configuration:spec.configuration,revision:spec.revision,nativeConfiguration:spec.nativeConfiguration,inspectedAt:'2000-01-01T00:00:00Z',
    archive,step,dirty:false,policy:'registered-offline-archive',externalReferences:[]});
  // Checker outputs as the layout check leaves them.
  const {dir,record}=issueRelease(path.join(temp,'checked'),'detail-001');
  const inputs=path.join(temp,'inputs');
  for(const [from,to] of [['index.html','package-motion.html'],['motion.json','paths.json'],['budgets.json','budgets.json'],
    ['limits.json','limits.json'],['receipt.json','receipt.json'],['review-scene.json.gz','review-scene.json.gz']])write(inputs,to,read(dir,from));
  write(inputs,'missions.json',{missionCases:record.missionCases});
  const {stageInProgress}=await import('../scripts/detailed-design-release.mjs');
  const stage=release=>stageInProgress({site,policyFile:path.join(temp,'policy.json'),design:'detail-001',inputs,release,project,
    authority:'cad/fusion-authority.json',lineage:'cad/lineage.json'});
  assert.throws(()=>stage('layout-009'),/not published/);
  const index=stage('layout-001');
  assert.deepEqual([index.current,index.beside],[legacy,'detail-001']);
  const design=JSON.parse(read(site,root,'designs','detail-001','design.json'));
  assert.deepEqual([design.fusion.stepSha256,design.fusion.archiveSha256,design.fusion.authoritySha256],[step.sha256,archive.sha256,authority.sha256]);
  assert.deepEqual((await auditStaged(approved,site,policy)).designs.added,['detail-001']);
  assert.throws(()=>stage('layout-001'),/already issued/);
  // A layout check on any other STEP is not the registered design.
  rmSync(path.join(site,root),{recursive:true});cpSync(path.join(approved,root),path.join(site,root),{recursive:true});
  write(inputs,'receipt.json',JSON.stringify({...JSON.parse(read(inputs,'receipt.json')),step:{file:'package.step',sha256:sha('a block model')}}));
  assert.throws(()=>stage('layout-001'),/STEP other than the registered Fusion export/);
});

test('the signature lock on the entry points returns the moment a design becomes effective',async t=>{
  const {temp,approved,site,policy}=setup(t,{legacyDesign:null});
  for(const s of [approved,site])rmSync(path.join(s,'models','robot.glb'));
  policy.modelFiles=['index.html'];
  // No design is effective: the entry page is not signature-protected.
  write(site,'index.html','no detailed design is current; see the preliminary design');
  await auditStaged(approved,site,policy);
  // In the same change that makes a design effective, an unsigned entry-page edit fails.
  const issue=effectiveRecord(site,'detail-001'),record=root+'/designs/detail-001/design.json',packet=signer(temp);
  publish(site,[entry('detail-001','effective')]);
  await assert.rejects(auditStaged(approved,site,policy,...packet(site,[record],issue)),/primary entry point changed without a signed/);
  const signed=packet(site,[record,'index.html'],issue);
  assert.equal((await auditStaged(approved,site,policy,...signed)).designs.current,'detail-001');
  // Once the approved site has an effective design, an unsigned entry-page edit fails.
  const next=path.join(temp,'next');cpSync(site,next,{recursive:true});
  write(next,'index.html','unsigned edit');
  await assert.rejects(auditStaged(site,next,policy),/primary entry point changed without a signed/);
});

test('a model in any published format keeps the entry points locked',async t=>{
  for(const name of ['robot.usdz','robot.glb.gz','robot.step.zip','download.zip','robot.fbx']){
    const {approved,site,policy}=setup(t,{legacyDesign:null});
    for(const s of [approved,site]){rmSync(path.join(s,'models','robot.glb'));write(s,'downloads/'+name,'an earlier reviewed model');}
    policy.modelFiles=['index.html'];
    write(site,'index.html','entry page rewritten');
    await assert.rejects(auditStaged(approved,site,policy),/primary entry point changed without a signed/,name);
  }
});

test('one page can gain the preliminary and the detailed link in one change',async t=>{
  const {approved,site,policy}=setup(t);
  policy.preliminaryReleases.secondaryLink='index.html';policy.detailedDesigns.secondaryLink='index.html';
  const page='<main><h1>Robot</h1><p>Effective detailed design.</p></main>';
  const prelimLink='<a href="'+tree+'/">Preliminary design</a>',detailLink='<a href="'+root+'/">Detailed designs</a>';
  write(approved,'index.html',page);
  for(const added of [prelimLink+'\n'+detailLink,detailLink+' '+prelimLink,detailLink]){
    write(site,'index.html',page.replace('</main>','\n'+added+'\n</main>'));
    assert.equal((await auditStaged(approved,site,policy)).secondaryLink,'index.html',added);
  }
  for(const added of [prelimLink+detailLink+detailLink,prelimLink+'<b>new model</b>'+detailLink,
    prelimLink+'<a href="'+root+'/" onclick="x()">Detailed designs</a>',detailLink+'<a href="other/">Other</a>']){
    write(site,'index.html',page.replace('</main>',added+'</main>'));
    await assert.rejects(auditStaged(approved,site,policy),/primary entry point changed without a signed/,added);
  }
});
