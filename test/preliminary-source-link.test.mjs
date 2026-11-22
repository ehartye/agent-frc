import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {audit,auditStaged} from '../scripts/public-model-release.mjs';

// Synthetic teaching fixtures only: invented release IDs, solids and objectives.
const sha=value=>createHash('sha256').update(value).digest('hex');
function write(root,file,data){
  const target=path.join(root,file);
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,typeof data==='string'?data:JSON.stringify(data,null,2));
}
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const inputs='cad/preliminary-design/releases';

test('feature a preliminary still only with the exact previous README preserved',async t=>{
  const {repo}=sourceRepo(t,{field:false});
  const before='Archived model',after='Preliminary design',image='synthetic picture';
  write(repo,'README.md',before);
  write(repo,'.github/source-policy.json',{schema:'agent-frc/public-model-policy@1',project:'Fixture',
    publicRoots:['cad'],modelFiles:['README.md','cad/robot.step'],preliminaryReadmeArchive:{
      archive:'rough-draft.md',archivedSha256:sha(before),readmeSha256:sha(after),
      image:'cad/review.png',imageSha256:sha(image)}});
  git(repo,'add','.');git(repo,'commit','-qm','Approve README handoff');
  const base=git(repo,'rev-parse','HEAD');
  write(repo,'README.md',after);write(repo,'rough-draft.md',before);write(repo,'cad/review.png',image);
  await run(repo,base);
  write(repo,'rough-draft.md','abridged archive');
  await assert.rejects(run(repo,base),/archive or preliminary still/);
});

/** Write one release input directory as the checker leaves it, with a receipt that pins every input. */
/** An invented field fixture STEP: one named product per solid, as the checker's loader reads them. */
const fixtureStep=(names,extra='')=>'ISO-10303-21;\nDATA;\n'+names.map((n,i)=>"#"+(i*2+1)+"=PRODUCT('"+n+"','"+n+"','',(#90));\n#"+
  (i*2+2)+"=MANIFOLD_SOLID_BREP('',#91);").join('\n')+extra+'\nENDSEC;\nEND-ISO-10303-21;\n';
function issueInputs(repo,id,{status='layout-checked',step='solid '+id,edit=r=>r,fixtures,fixtureBody,fixtureRole='other',fixtureKg=[0,0],
  fixturePin}={}){
  const dir=path.join(repo,inputs,id),pin=(file,body)=>{write(dir,file,body);return {file,sha256:sha(body)};};
  const stepPin=pin('package.step',step);
  const ids=fixtures??[];
  const fixturePinned=ids.length?pin('field-fixtures.step',fixtureBody??fixtureStep(ids)):null;
  const caseFixtures=ids.map(n=>({id:n,solid:n,file:fixturePin??fixturePinned,basis:'Invented field part'}));
  const motion=pin('paths.json',JSON.stringify({cases:[{id:'turn',fixtures:caseFixtures}]}));
  const limits=pin('package-limits.json','{"inspectionLimitKg":14}');
  const masses=ids.length?[{id:'field fixtures (not robot)',members:ids,kg:fixtureKg,basis:'Field equipment'}]:[];
  const budgets=pin('budgets.json',JSON.stringify({requirements:limits,masses,electricalCases:{}}));
  const view=pin('package-motion.html','<html>'+id+'</html>');
  const plan=pin('layout.json',JSON.stringify({issue:'synthetic-'+id,step:stepPin,motion,budgets,view:view.file}));
  const receipt=edit({schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-'+id,planSha256:plan.sha256,status,
    missingInputs:[],reopen:[],step:stepPin,motion,cases:[{case:'turn',status:'pass',pairs:[]}],
    control:{witness:{pair:['head','rail'],status:'fail'}},view:{...view,verified:true},
    budgets:{source:budgets,limits,massStatus:'pass',electricalCases:[{case:'weak',status:'pass'}]},
    groups:{carrier:{role:'mechanism',members:['head']},...(ids.length?{field:{role:fixtureRole,members:ids}}:{})}});
  write(dir,'receipt.json',receipt);
  return dir;
}
function sourceRepo(t,{field=true}={}){
  const temp=mkdtempSync(path.join(os.tmpdir(),'prelim-source-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const repo=path.join(temp,'project');mkdirSync(repo);
  git(repo,'init','-q');git(repo,'config','user.name','Fixture');git(repo,'config','user.email','fixture@example.invalid');
  git(repo,'config','core.autocrlf','false');
  write(repo,'cad/robot.step','approved detailed robot');
  const policy={schema:'agent-frc/public-model-policy@1',project:'Teaching project',publicRoots:['cad'],modelFiles:['cad/robot.step']};
  if(field)policy.preliminaryInputs={root:inputs};
  write(repo,'.github/source-policy.json',policy);
  issueInputs(repo,'layout-001');
  git(repo,'add','.');git(repo,'commit','-qm','Approved');
  return {repo,base:git(repo,'rev-parse','HEAD')};
}
const run=(repo,base)=>audit(repo,base,'.github/source-policy.json');

test('a layout-checked preliminary input passes the source audit without a signature', async t=>{
  const {repo,base}=sourceRepo(t);
  issueInputs(repo,'layout-002');
  const result=await run(repo,base);
  assert.deepEqual(result.preliminaryInputs,['layout-002']);
  git(repo,'add','.');git(repo,'commit','-qm','Issue layout-002');
  assert.deepEqual((await audit(repo,base,'.github/source-policy.json',undefined,undefined,git(repo,'rev-parse','HEAD'))).preliminaryInputs,['layout-002']);
});

test('provisional, reopen and blocked source receipts and digest mismatches are rejected', async t=>{
  for(const status of ['provisional','reopen','blocked']){
    const {repo,base}=sourceRepo(t);issueInputs(repo,'layout-002',{status});
    await assert.rejects(run(repo,base),/layout-checked/,status);
  }
  let {repo,base}=sourceRepo(t);
  const dir=issueInputs(repo,'layout-002');write(dir,'package.step','a different solid');
  await assert.rejects(run(repo,base),/differs from its receipt/);
  ({repo,base}=sourceRepo(t));
  write(issueInputs(repo,'layout-002'),'layout.json','{"issue":"edited"}');
  await assert.rejects(run(repo,base),/differs from its receipt/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{edit:r=>({...r,control:{witness:null}})});
  await assert.rejects(run(repo,base),/displaced control/);
});

test('issued preliminary inputs are immutable', async t=>{
  for(const change of [d=>write(d,'package.step','rewritten'),d=>write(d,'budgets.json','{}'),d=>write(d,'notes.md','late note'),
    d=>rmSync(path.join(d,'paths.json'))]){
    const {repo,base}=sourceRepo(t);
    change(path.join(repo,inputs,'layout-001'));
    await assert.rejects(run(repo,base),/issued preliminary input/i);
  }
});

test('other CAD in the source tree keeps the full gate', async t=>{
  let {repo,base}=sourceRepo(t);
  write(issueInputs(repo,'layout-002'),'extra.glb','unreviewed mesh');
  await assert.rejects(run(repo,base),/Unreviewed new public model asset/);
  ({repo,base}=sourceRepo(t));
  write(repo,inputs+'/layout-002/nested/package.step','solid');
  await assert.rejects(run(repo,base),/Unreviewed new public model asset/);
  ({repo,base}=sourceRepo(t));
  write(repo,'cad/arm.step','new detailed arm');
  await assert.rejects(run(repo,base),/Unreviewed new public model asset/);
  ({repo,base}=sourceRepo(t));
  write(repo,'cad/robot.step','replaced');
  await assert.rejects(run(repo,base),/Changed public model asset/);
  ({repo,base}=sourceRepo(t,{field:false}));
  issueInputs(repo,'layout-002');
  await assert.rejects(run(repo,base),/Unreviewed new public model asset/,'the class is opt-in from the approved policy');
});

test('a preliminary input cannot copy an existing model, and loose files do not break the audit', async t=>{
  let {repo,base}=sourceRepo(t);
  issueInputs(repo,'layout-002',{step:'approved detailed robot'});
  await assert.rejects(run(repo,base),/duplicates an existing model/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{step:'solid layout-001'});
  assert.deepEqual((await run(repo,base)).preliminaryInputs,['layout-002'],'a revision may reuse an earlier preliminary STEP');
  ({repo}=sourceRepo(t));
  write(repo,inputs+'/README.md','Release inputs');git(repo,'add','.');git(repo,'commit','-qm','Readme');
  base=git(repo,'rev-parse','HEAD');issueInputs(repo,'layout-002');
  assert.deepEqual((await run(repo,base)).preliminaryInputs,['layout-002']);
});

test('a preliminary input can never be a registered primary model', async t=>{
  const {repo}=sourceRepo(t);
  write(repo,'.github/source-policy.json',{schema:'agent-frc/public-model-policy@1',project:'Teaching project',publicRoots:['cad'],
    modelFiles:['cad/robot.step',inputs+'/layout-001/package.step'],preliminaryInputs:{root:inputs}});
  git(repo,'add','.');git(repo,'commit','-qm','Bad policy');
  await assert.rejects(run(repo,git(repo,'rev-parse','HEAD')),/outside the preliminary/);
});

function siteFixture(t,link=true){
  const temp=mkdtempSync(path.join(os.tmpdir(),'prelim-link-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const approved=path.join(temp,'approved'),site=path.join(temp,'site');
  const index='<header><nav><a href="robot/">Robot</a> <a href="kickoff/">Kickoff</a></nav></header>\n<main><img src="media/robot-still.png"></main>\n';
  for(const root of [approved,site]){write(root,'index.html',index);write(root,'media/robot-still.png','still');write(root,'models/robot.glb','model');}
  const policy={schema:'agent-frc/staged-model-policy@1',project:'Teaching project',modelFiles:['models/robot.glb'],mutableFieldPages:[],
    preliminaryReleases:{root:'preliminary-design',primaryEntryPoints:['index.html','media/robot-still.png'],...(link?{secondaryLink:'index.html'}:{})}};
  const edit=change=>write(site,'index.html',change(index));
  return {approved,site,policy,edit};
}
const link='<a href="preliminary-design/">Preliminary design (work in progress)</a>';

test('the declared index can gain exactly one secondary link to the preliminary tree', async t=>{
  const f=siteFixture(t);
  f.edit(i=>i.replace('</nav>',' '+link+'</nav>'));
  assert.equal((await auditStaged(f.approved,f.site,f.policy)).secondaryLink,'index.html');
  for(const change of [i=>i.replace('</nav>',' '+link+'</nav>').replace('Robot','Old robot'),
    i=>i.replace('</nav>',' '+link+' '+link+'</nav>'),
    i=>i.replace('</nav>',' '+link.replace('preliminary-design/','preliminary-design/../models/robot.glb')+'</nav>'),
    i=>i.replace('</nav>',' '+link.replace('preliminary-design/','https://example.invalid/preliminary-design/')+'</nav>'),
    i=>i.replace('</nav>',' <a href="preliminary-design/" onclick="x()">Preliminary design</a></nav>'),
    i=>i.replace('</nav>',' <a href="preliminary-design/"><img src="robot.png"></a></nav>'),
    i=>i.replace('src="media/robot-still.png"','src="preliminary-design/still.png"')]){
    const g=siteFixture(t);g.edit(change);
    await assert.rejects(auditStaged(g.approved,g.site,g.policy),/primary entry point/,change.toString());
  }
  for(const [page,change] of [
    ['<div title="AB">x</div>',p=>p.replace('AB','A'+link+'B')],
    ['<div title="a><b">x</div>',p=>p.replace('a><b','a>'+link+'<b')],
    ['<script>var a=1;\n</script>',p=>p.replace(';\n',';\n'+link+'\n')],
    ['<!-- note -->\n<p>x</p>',p=>p.replace(' note ',' '+link+' ')],
    ['<img alt=it\'s><div title="x\' >AB">x</div>',p=>p.replace('AB','A'+link+'B')],
    ['<!doctype html x=\'><p title="y >AB">x</p>',p=>p.replace('AB','A'+link+'B')],
    ['<nav></nav>',p=>p.replace('</nav>',"<a href='preliminary-design/'>Preliminary</a></nav>")],
    ['<nav></nav>',p=>p.replace('</nav>','<a href="preliminary-design/">Pre"liminary</a></nav>')]]){
    const g=siteFixture(t);write(g.approved,'index.html',page);write(g.site,'index.html',change(page));
    await assert.rejects(auditStaged(g.approved,g.site,g.policy),/primary entry point/,page);
  }
  const spaced=siteFixture(t);spaced.edit(i=>i.replace('</nav>','\n      '+link+'\n    </nav>'));
  assert.equal((await auditStaged(spaced.approved,spaced.site,spaced.policy)).secondaryLink,'index.html');
  const undeclared=siteFixture(t,false);
  undeclared.edit(i=>i.replace('</nav>',' '+link+'</nav>'));
  await assert.rejects(auditStaged(undeclared.approved,undeclared.site,undeclared.policy),/primary entry point/);
  const still=siteFixture(t);
  still.policy.preliminaryReleases.secondaryLink='media/robot-still.png';
  await assert.rejects(auditStaged(still.approved,still.site,still.policy),/secondaryLink/);
});

test('a field fixture STEP the motion study pins passes beside the package', async t=>{
  let {repo,base}=sourceRepo(t);
  issueInputs(repo,'layout-002',{fixtures:['hub body','tower base']});
  assert.deepEqual((await run(repo,base)).preliminaryInputs,['layout-002']);
  git(repo,'add','.');git(repo,'commit','-qm','Issue fixtures');
  assert.deepEqual((await audit(repo,base,'.github/source-policy.json',undefined,undefined,git(repo,'rev-parse','HEAD'))).preliminaryInputs,['layout-002']);
  // A package-only release still passes.
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002');
  assert.deepEqual((await run(repo,base)).preliminaryInputs,['layout-002']);
});

test('unpinned, mispinned, robot-registered, massed or duplicate fixture STEPs are rejected', async t=>{
  let {repo,base}=sourceRepo(t);
  write(issueInputs(repo,'layout-002'),'extra.step','an unpinned solid');
  await assert.rejects(run(repo,base),/Unreviewed new public model asset/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{fixtures:['hub body'],fixturePin:{file:'field-fixtures.step',sha256:sha('another fixture file')}});
  await assert.rejects(run(repo,base),/fixture/);
  ({repo,base}=sourceRepo(t));
  write(issueInputs(repo,'layout-002',{fixtures:['hub body']}),'field-fixtures.step',fixtureStep(['hub body'])+' ');
  await assert.rejects(run(repo,base),/fixture|differs/);
  ({repo}=sourceRepo(t));
  write(repo,'cad/arena.step',fixtureStep(['hub body']));git(repo,'add','.');git(repo,'commit','-qm','Arena');
  base=git(repo,'rev-parse','HEAD');
  issueInputs(repo,'layout-002',{fixtures:['hub body']});
  await assert.rejects(run(repo,base),/duplicates an existing model/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{fixtures:['hub body'],fixtureRole:'mechanism'});
  await assert.rejects(run(repo,base),/robot member/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{fixtures:['hub body'],fixtureKg:[0,1.5]});
  await assert.rejects(run(repo,base),/robot mass/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{fixtures:['hub body'],fixtureBody:fixtureStep(['hub body','spare arm'])});
  await assert.rejects(run(repo,base),/registered fixture/);
  ({repo,base}=sourceRepo(t));
  issueInputs(repo,'layout-002',{fixtures:['hub body'],fixtureBody:fixtureStep(['hub body'],"\n#50=MANIFOLD_SOLID_BREP('',#91);")});
  await assert.rejects(run(repo,base),/registered fixture/);
});

test('an issued fixture STEP is immutable', async t=>{
  const {repo}=sourceRepo(t);
  issueInputs(repo,'layout-002',{fixtures:['hub body']});git(repo,'add','.');git(repo,'commit','-qm','Issued');
  const base=git(repo,'rev-parse','HEAD');
  write(path.join(repo,inputs,'layout-002'),'field-fixtures.step',fixtureStep(['hub body','hub top']));
  await assert.rejects(run(repo,base),/issued preliminary input/);
});
