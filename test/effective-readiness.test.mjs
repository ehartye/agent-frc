/**
 * @lane merge
 * @subject scripts/effective-readiness.mjs
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {cycleStages,effectiveReadiness,readinessText} from '../scripts/effective-readiness.mjs';

const plugin=fileURLToPath(new URL('..',import.meta.url));
const sha=text=>createHash('sha256').update(text).digest('hex');

/** A trial row as the layout check records it from the library's campaign: current and passed unless the edit says otherwise. */
const trial=(name,more={})=>({name,engine:'planar',result:'passed',findings:[],assumptions:[{id:'in-plane',text:'Invented'}],
  inputs:[{path:'materials.tread.friction',value:0.6,source:'assumed',range:[0.4,0.8]}],sensitivity:['materials.tread.friction'],coverage:[],adjustments:[],
  touchedHulled:[],state:'current',changes:[],...more});

/** An invented, complete package: eight cycle stages, two mission cases each backed by a deciding interaction, and a closed risk register. */
function project(t,edit=x=>x){
  const root=mkdtempSync(path.join(tmpdir(),'readiness-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const stageIds=['acquire','hold','pass-up','deliver','return','hang','park','remove-carrier'];
  const draft={
    plan:{schema:'agent-frc/layout-judgement@1',issue:'synthetic-issue',
      narrativeReview:{objectives:[{objective:'Invented cycle',disposition:'represented',basis:'Invented'}]},
      presentation:{uncoveredCases:[{id:'gate-closes-mid-turn',condition:'Invented',reason:'Invented'}]}},
    receipt:{schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-issue',status:'layout-checked',missingInputs:[],
      budgets:{massStatus:'pass',electricalCases:[{case:'invented weak traverse',status:'pass'}]},
      cases:stageIds.map(id=>({case:id,status:'pass'})),cycle:stageIds.slice(0,7),
      stages:Object.fromEntries(stageIds.map(id=>[id,{purpose:id==='remove-carrier'?'service':id==='park'?'park':'operating'}])),
      interactions:[
        {id:'pickup',piece:'sample',verdict:'planar is enough',reasons:['Invented'],decides:'Whether the belt intake replaces the roller',cases:['acquire'],trial:trial('pickup')},
        {id:'release',piece:'sample',verdict:'planar is enough',reasons:['Invented'],decides:'Whether the lip can stay fixed',cases:['deliver'],trial:trial('release')}],
      adjustments:[{name:'lip height',kind:'mechanical',input:'parameters.lip',range:[10,20],measured:true,findings:[]}]},
    missions:{missionCases:[{case:'acquire',kind:'operating-case',accomplishes:'acquired',objective:'Invented cycle'},
        {case:'deliver',kind:'operating-case',accomplishes:'delivered',objective:'Invented cycle'}],
      cycle:Object.fromEntries(cycleStages.map((stage,i)=>[stage,{cases:[stageIds[i]]}])),
      risks:[{id:'gate-closes-mid-turn',risk:'Invented gate closes during the turn',closedBy:'Invented interlock holds the turn'},
        {id:'belt-slip',risk:'Invented belt slips when wet',benchTest:{measure:'pull at stall',unit:'N',pass:60,fail:40}}]}};
  const d=edit(draft)??draft;
  const planText=JSON.stringify(d.plan);
  writeFileSync(path.join(root,'judgement.json'),planText);
  if(d.receipt){if(d.receipt.planSha256===undefined)d.receipt.planSha256=sha(planText);writeFileSync(path.join(root,'receipt.json'),JSON.stringify(d.receipt));}
  if(d.missions)writeFileSync(path.join(root,'missions.json'),JSON.stringify(d.missions));
  return root;
}
const criterion=(report,id)=>report.criteria.find(c=>c.id===id);
const judged=(t,id,edit)=>criterion(effectiveReadiness(project(t,edit)),id);

test('a complete synthetic package meets every exit criterion',t=>{
  const report=effectiveReadiness(project(t));
  assert.deepEqual(report.criteria.map(c=>[c.id,c.met,c.reasons]),
    [['whole-cycle',true,[]],['interactions',true,[]],['risks-resolved',true,[]]]);
  assert.equal(report.met,3);
  assert.deepEqual(report.verificationItems,[{id:'belt-slip',measure:'pull at stall',unit:'N',pass:60,fail:40}]);
  const text=readinessText(report);
  assert.match(text,/^Effective-readiness report for synthetic-issue\n/);
  assert.match(text,/\[met\]     1\. Whole mission cycle/);
  assert.match(text,/verification items .*: belt-slip\nResult: 3 of 3 criteria met\.\n$/);
});

test('the whole cycle needs a passing case for every narrative stage in a layout-checked receipt',t=>{
  const cases=[
    [d=>{delete d.missions.cycle.endgame;},/Narrative stage endgame has no case/],
    [d=>{d.missions.cycle.reset={cases:[]};},/Narrative stage reset has no case/],
    [d=>{d.missions.cycle.retain={cases:['absent']};},/Narrative stage retain names absent, which is not a checked case/],
    [d=>{d.receipt.cases[2].status='open';},/Narrative stage transfer: case pass-up is open/],
    [d=>{delete d.missions.cycle;},/No cycle map/],
    [d=>{d.missions.cycle.warmup={cases:['acquire']};},/Unknown narrative stage warmup/],
    [d=>{d.receipt.status='provisional';},/The layout check is provisional/],
    [d=>{d.receipt.partial=true;},/The layout check is partial/],
    [d=>{d.receipt.planSha256='0'.repeat(64);},/belongs to another layout plan/],
    [d=>{d.receipt=null;},/Receipt: missing file receipt\.json/],
    [d=>{d.receipt.missingInputs=['Invented cable loop radius'];},/lists missing inputs: Invented cable loop radius/],
    [d=>{d.receipt.budgets=null;},/inspection weight is not checked/],
    [d=>{d.receipt.budgets.massStatus='fail';},/inspection weight is not checked/],
    [d=>{d.receipt.budgets.electricalCases=[];},/loaded voltage is not checked/],
    [d=>{d.receipt.budgets.electricalCases[0].status='fail';},/loaded voltage is not checked/],
    [d=>{d.missions.cycle.endgame={notApplicable:'Invented',cases:['hang']};},/marked not applicable and also lists cases/],
    [d=>{d.missions.cycle.service={cases:['park']};},/Narrative stage service: case park is checked as park, not as a service case/],
    [d=>{d.missions.cycle.acquire={cases:['remove-carrier']};},/case remove-carrier is checked as service, not as an operating case/],
    [d=>{d.receipt.cases.push({case:'hold',status:'fail'});},/Narrative stage retain: case hold is fail/],
    [d=>{d.receipt.cases.unshift(null);d.missions.cycle.retain={cases:[null]};},/names null, which is not a checked case/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'whole-cycle',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
  const exempt=judged(t,'whole-cycle',d=>{d.missions.cycle.endgame={notApplicable:'The invented game has no endgame task'};});
  assert.equal(exempt.met,true);
  assert.deepEqual(exempt.notes,['endgame: not applicable, The invented game has no endgame task']);
});

test('an interaction meets its bar only on a current, passing trial of the engine its screen verdict asks for',t=>{
  const reasonsOf=edit=>judged(t,'interactions',d=>{edit(d.receipt.interactions[0]);}).reasons;
  const cases=[
    [i=>{i.trial.state='stale';i.trial.changes=['solid "belt" changed (boundsMm)'];},/Interaction pickup \(planar is enough\): the record of trial pickup is stale \(solid "belt" changed \(boundsMm\)\)\. Run it again with --trial "pickup"/],
    [i=>{i.trial={name:'pickup',result:null,state:'not run'};},/trial pickup has not been run\. Run python -m frc_design_kernel try SOURCE --out RECORDS --trial "pickup"/],
    [i=>{i.trial.result='not covered';i.trial.findings=['Invented: the outcome changes inside the assumed range of "materials.tread.friction"'];},/trial pickup is not covered: Invented: the outcome changes/],
    [i=>{i.trial.result='control not rejected';},/trial pickup is control not rejected/],
    [i=>{i.verdict='needs 3D';},/the screen says the answer depends on what one section cannot show, so try it in 3D \("engine": "mujoco"\); trial pickup ran planar/],
    [i=>{delete i.decides;},/Interaction pickup: say in the judgement file what it decides/],
    [i=>{delete i.trial;},/Interaction pickup \(planar is enough\): name its trial/]];
  for(const [edit,reason] of cases){
    const found=reasonsOf(edit);
    assert.ok(found.some(r=>reason.test(r)),String(reason)+' in '+found.join(' | '));
    assert.ok(found.some(r=>/Mission case acquire is backed by no interaction that meets its bar/.test(r))||/decides/.test(String(reason)),found.join(' | '));
  }
  // A 3D trial meets a needs-3D verdict; a result an adjustment covers meets the bar like a pass.
  assert.deepEqual(reasonsOf(i=>{i.verdict='needs 3D';i.trial.engine='mujoco';}),[]);
  assert.deepEqual(reasonsOf(i=>{i.trial.result='covered by adjustment';}),[]);
  // An override is listed with its reason; an interaction with no trial is listed and backs no mission case.
  const over=judged(t,'interactions',d=>{Object.assign(d.receipt.interactions[0],{screened:'needs 3D',verdict:'planar is enough',override:'Invented: the guides are drawn later'});});
  assert.equal(over.met,true,over.reasons.join(' | '));
  assert.ok(over.notes.includes('pickup: screened as needs 3D, taken as planar is enough because Invented: the guides are drawn later'),over.notes.join(' | '));
  const none=judged(t,'interactions',d=>{const i=d.receipt.interactions[0];delete i.trial;i.noTrial='Invented: no result would change the design';});
  assert.ok(none.notes.includes('pickup: planar is enough; no trial, because Invented: no result would change the design'));
  assert.deepEqual(none.reasons,['Mission case acquire is backed by no interaction that meets its bar: list it under the cases of the interaction whose trial decides it']);
});

test('a configurable interaction needs a declared adjustment, measured at both ends when it is mechanical',t=>{
  const reasonsOf=(edit,adjust=()=>{})=>judged(t,'interactions',d=>{const i=d.receipt.interactions[1];i.verdict='configurable';edit(i.trial);adjust(d.receipt.adjustments[0]);}).reasons;
  assert.ok(reasonsOf(()=>{}).some(r=>/Interaction release \(configurable\): a simulated result is only a best guess here\. Declare the adjustment/.test(r)));
  assert.deepEqual(reasonsOf(x=>{x.adjustments=['lip height'];}),[]);
  assert.ok(reasonsOf(x=>{x.adjustments=['lip height'];},a=>{a.measured=false;a.hint='Invented hint';}).some(r=>/adjustment lip height is mechanical and is not measured at both ends\. Invented hint/.test(r)));
  assert.ok(reasonsOf(x=>{x.adjustments=['lip height'];},a=>{a.findings=['at 20: lip and frame come closer than 1 mm in deliver'];})
    .some(r=>/adjustment lip height at its ends: at 20: lip and frame come closer than 1 mm in deliver/.test(r)));
  assert.ok(reasonsOf(x=>{x.adjustments=['shim'];}).some(r=>/names adjustment shim, which the receipt does not record/.test(r)));
  // A receipt of another plan, or one not checked, is not read for interactions.
  const stale=judged(t,'interactions',d=>{d.receipt.planSha256='0'.repeat(64);});
  assert.deepEqual(stale.reasons,['Interactions are read from a whole, layout-checked receipt of this plan: run the layout check']);
});

test('every open risk needs a closing design change or a bench test with pass and fail numbers',t=>{
  const cases=[
    [d=>{delete d.missions.risks;},/No risk register/],
    [d=>{d.missions.risks[1]={id:'belt-slip',risk:'Invented'};},/Risk belt-slip has neither/],
    [d=>{d.missions.risks[1].benchTest={measure:'pull',pass:60};},/Risk belt-slip has neither/],
    [d=>{d.missions.risks[1].benchTest={measure:'pull',pass:60,fail:60};},/Risk belt-slip has neither/],
    [d=>{d.missions.risks.push({id:'belt-slip',risk:'Invented repeat',closedBy:'x'});},/unique id/],
    [d=>{d.missions.risks.shift();},/Uncovered case gate-closes-mid-turn has no entry/],
    [d=>{d.plan.narrativeReview.objectives.push({objective:'Invented fallback',disposition:'open',basis:'Invented'});},/Narrative objective is still open: Invented fallback/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'risks-resolved',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
  const none=judged(t,'risks-resolved',d=>{d.missions.risks=[];d.plan.presentation.uncoveredCases=[];});
  assert.equal(none.met,true,'an empty register is a deliberate statement that no risk remains');
});

test('malformed inputs are findings: nothing is judged met and nothing throws',t=>{
  for(const text of ['[]','null','5','"plan"','{not json']){
    const root=project(t);writeFileSync(path.join(root,'judgement.json'),text);
    const report=effectiveReadiness(root);
    assert.equal(report.met,0,text);
    assert.ok(report.criteria.every(c=>c.reasons.some(r=>/^Layout plan: judgement\.json is not/.test(r))),text);
  }
  const odd=effectiveReadiness(project(t,d=>{d.plan.presentation={uncoveredCases:'x'};d.plan.narrativeReview={objectives:{}};
    d.receipt.interactions=[null,7,{id:'odd',decides:'Invented',trial:5}];d.missions.risks=[null,3,{id:'r',risk:'Invented',benchTest:{id:'other',measure:'pull',pass:1}}];}));
  assert.equal(criterion(odd,'risks-resolved').met,false);
  assert.ok(criterion(odd,'interactions').reasons.some(r=>/Interaction odd \(no verdict\): name its trial/.test(r)),'a malformed trial row is a finding');
  assert.deepEqual(odd.verificationItems,[],'an incomplete bench test is not a verification item');
  const missions=effectiveReadiness(project(t,d=>{d.missions=null;}));
  assert.ok(missions.criteria.every(c=>!c.met&&c.reasons.includes('Missions: missing file missions.json')));
  const bom=project(t);writeFileSync(path.join(bom,'missions.json'),'\uFEFF'+readFileSync(path.join(bom,'missions.json'),'utf8'));
  assert.equal(effectiveReadiness(bom).met,3,'a byte-order mark is not a JSON error');
});

test('the command is informational: it prints the report, exits 0 and writes nothing',t=>{
  const root=project(t,d=>{delete d.missions.cycle.endgame;delete d.missions.risks;});
  const before=readFileSync(path.join(root,'receipt.json'));
  const run=(...args)=>spawnSync(process.execPath,[path.join(plugin,'scripts','design.mjs'),'effective-readiness',...args],{encoding:'utf8'});
  const text=run(root);
  assert.equal(text.status,0,text.stderr);
  assert.match(text.stdout,/\[not met\] 1\. Whole mission cycle[^\n]*\n\s+- Narrative stage endgame has no case/);
  assert.match(text.stdout,/\[met\]     2\./);
  assert.match(text.stdout,/Result: 1 of 3 criteria met\./);
  const json=run(root,'--json','--plan','judgement.json','--receipt','receipt.json','--missions','missions.json');
  assert.equal(json.status,0,json.stderr);
  assert.equal(JSON.parse(json.stdout).schema,'agent-frc/effective-readiness@1');
  assert.deepEqual(readFileSync(path.join(root,'receipt.json')),before);
  // Unreadable inputs are findings, not failures; only an unusable project folder is a usage error.
  const empty=mkdtempSync(path.join(tmpdir(),'readiness-'));t.after(()=>rmSync(empty,{recursive:true,force:true}));
  const bare=run(empty);
  assert.equal(bare.status,0);
  assert.match(bare.stdout,/Layout plan: missing file judgement\.json/);
  assert.match(bare.stdout,/Result: 0 of 3 criteria met\./);
  assert.equal(run(path.join(empty,'absent')).status,2);
  assert.equal(run().status,2);
});

test('a release folder under the project root holds the three files while pins resolve from the root',t=>{
  const root=project(t),folder='cad/preliminary-design/releases/1.0';
  mkdirSync(path.join(root,folder),{recursive:true});
  for(const name of ['judgement.json','receipt.json','missions.json'])
    {writeFileSync(path.join(root,folder,name),readFileSync(path.join(root,name)));rmSync(path.join(root,name));}
  assert.equal(effectiveReadiness(root).met,0,'the files are no longer at the project root');
  const report=effectiveReadiness(root,{release:folder});
  assert.equal(report.met,3,report.criteria.flatMap(c=>c.reasons).join(' | '));
  assert.equal(effectiveReadiness(root,{release:folder,missions:'absent.json'}).met,0,'a named file overrides the release folder');
  const run=spawnSync(process.execPath,[path.join(plugin,'scripts','design.mjs'),'effective-readiness',root,'--release',folder],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/Result: 3 of 3 criteria met\./);
  assert.equal(effectiveReadiness(root,{release:'../outside'}).met,0);
  // A version is titled with its design name: the invented "Tilting carriage 1.0".
  assert.equal(report.design,undefined);
  const titled=spawnSync(process.execPath,[path.join(plugin,'scripts','design.mjs'),'effective-readiness',root,'--release',folder,'--design','Tilting carriage 1.0'],{encoding:'utf8'});
  assert.equal(titled.status,0,titled.stderr);
  assert.match(titled.stdout,/^Effective-readiness report for Tilting carriage 1\.0 \(\S+\)\r?\n/);
  assert.equal(effectiveReadiness(root,{release:folder,design:'Tilting carriage 1.0'}).design,'Tilting carriage 1.0');
});
