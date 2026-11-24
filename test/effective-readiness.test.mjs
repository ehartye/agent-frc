/**
 * @lane merge
 * @subject scripts/effective-readiness.mjs
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {cycleStages,effectiveReadiness,readinessText} from '../scripts/effective-readiness.mjs';

const plugin=fileURLToPath(new URL('..',import.meta.url));

/** A trial row as the layout judgement reads it from the library's campaign: current and passed unless the edit says otherwise. */
const trial=(name,more={})=>({name,engine:'planar',result:'passed',findings:[],assumptions:[{id:'in-plane',text:'Invented'}],
  inputs:[{path:'materials.tread.friction',value:0.6,source:'assumed',range:[0.4,0.8]}],sensitivity:['materials.tread.friction'],coverage:[],adjustments:[],
  touchedHulled:[],state:'current',changes:[],...more});

/**
 * An invented, complete package: its judgement file with the risk register, and the verdict the layout judgement gives
 * for it: eight cycle phases, two mission cases each backed by a deciding interaction's trial.
 */
function project(t,edit=x=>x){
  const root=mkdtempSync(path.join(tmpdir(),'readiness-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const motions=['acquire','hold','pass-up','deliver','return','hang','park','remove-carrier'];
  const draft={
    plan:{schema:'agent-frc/layout-judgement@2',issue:'synthetic-issue',
      narrative:{file:'narrative.md',objectives:[{objective:'Invented cycle',disposition:'represented',basis:'Invented'}]},
      risks:[{id:'gate-closes-mid-turn',risk:'Invented gate closes during the turn',closedBy:'Invented interlock holds the turn'},
        {id:'belt-slip',risk:'Invented belt slips when wet',benchTest:{measure:'pull at stall',unit:'N',pass:60,fail:40}}]},
    verdict:{schema:'agent-frc/layout-verdict@1',issue:'synthetic-issue',status:'layout-checked',firstUnmet:null,unmet:[],
      motions:Object.fromEntries(motions.map(id=>[id,{status:'pass'}])),
      cycle:cycleStages.map((phase,i)=>({phase,motions:[motions[i]]})),
      weight:{limits:[{name:'invented inspection',status:'pass'}]},electrical:{motions:{acquire:{status:'pass'}}},
      interactions:[
        {id:'pickup',piece:'sample',verdict:'planar is enough',reasons:['Invented'],decides:'Whether the belt intake replaces the roller',trial:trial('pickup')},
        {id:'release',piece:'sample',verdict:'planar is enough',reasons:['Invented'],decides:'Whether the lip can stay fixed',trial:trial('release')}],
      adjustments:[{name:'lip height',kind:'mechanical',input:'parameters.lip',range:[10,20],measured:true,findings:[]}],
      missionCases:[{name:'acquire',trial:'pickup',accomplishes:'acquired',objective:'Invented cycle',state:'current',result:'passed'},
        {name:'deliver',trial:'release',accomplishes:'delivered',objective:'Invented cycle',state:'current',result:'passed'}]}};
  const d=edit(draft)??draft;
  writeFileSync(path.join(root,'judgement.json'),JSON.stringify(d.plan));
  return {root,verdict:d.verdict};
}
const criterion=(report,id)=>report.criteria.find(c=>c.id===id);
const judged=(t,id,edit)=>{const {root,verdict}=project(t,edit);return criterion(effectiveReadiness(root,{verdict}),id);};

test('a complete synthetic package meets every exit criterion',t=>{
  const {root,verdict}=project(t);
  const report=effectiveReadiness(root,{verdict});
  assert.deepEqual(report.criteria.map(c=>[c.id,c.met,c.reasons]),
    [['whole-cycle',true,[]],['interactions',true,[]],['risks-resolved',true,[]]]);
  assert.equal(report.met,3);
  assert.deepEqual(report.verificationItems,[{id:'belt-slip',measure:'pull at stall',unit:'N',pass:60,fail:40}]);
  const text=readinessText(report);
  assert.match(text,/^Effective-readiness report for synthetic-issue\n/);
  assert.match(text,/\[met\]     1\. Whole mission cycle/);
  assert.match(text,/verification items .*: belt-slip\nResult: 3 of 3 criteria met\.\n$/);
});

test('the whole cycle needs a passing motion for every narrative phase in a layout-checked verdict',t=>{
  const cases=[
    [d=>{d.verdict.cycle=d.verdict.cycle.filter(c=>c.phase!=='endgame');},/Narrative phase endgame is not in the cycle/],
    [d=>{d.verdict.motions['pass-up'].status='open';},/Narrative phase transfer: motion pass-up is open/],
    [d=>{d.verdict.status='provisional';d.verdict.unmet=[{kind:'control',text:'Invented: the displaced control was not rejected'}];},
      /The layout judgement is provisional: Invented: the displaced control was not rejected/],
    [d=>{d.verdict={reason:'Refused: invented stale record'};},/Refused: invented stale record/],
    [d=>{d.verdict.weight.limits=[];},/No weight limit is judged/],
    [d=>{d.verdict.weight.limits[0].status='fail';},/Weight limit invented inspection is fail/],
    [d=>{d.verdict.electrical.motions.acquire.status='fail';},/The bus voltage of acquire is fail/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'whole-cycle',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
  const exempt=judged(t,'whole-cycle',d=>{d.verdict.cycle[5]={phase:'endgame',notApplicable:'The invented game has no endgame task'};});
  assert.equal(exempt.met,true);
  assert.deepEqual(exempt.notes,['endgame: not applicable, The invented game has no endgame task']);
});

test('an interaction meets its bar only on a current, passing trial of the engine its screen verdict asks for',t=>{
  const reasonsOf=edit=>judged(t,'interactions',d=>{edit(d.verdict.interactions[0]);}).reasons;
  const cases=[
    [i=>{i.trial={name:'pickup',result:null,state:'not run'};},/Interaction pickup \(planar is enough\): not run yet\. It decides Whether the belt intake replaces the roller\. Run python -m frc_design_kernel try SOURCE --out RECORDS --trial "pickup"/],
    [i=>{i.trial.result='not covered';i.trial.findings=['Invented: the outcome changes inside the assumed range of "materials.tread.friction"'];},/trial pickup is not covered: Invented: the outcome changes/],
    [i=>{i.trial.result='control not rejected';},/trial pickup is control not rejected/],
    [i=>{i.verdict='needs 3D';},/the screen says the answer depends on what one section cannot show, so try it in 3D \("engine": "mujoco"\); trial pickup ran planar/],
    [i=>{delete i.decides;},/Interaction pickup: say in the judgement file what it decides/],
    [i=>{delete i.trial;},/Interaction pickup \(planar is enough\): name its trial/]];
  for(const [edit,reason] of cases){
    const found=reasonsOf(edit);
    assert.ok(found.some(r=>reason.test(r)),String(reason)+' in '+found.join(' | '));
  }
  // The mission case its trial backs is not met while the interaction misses its bar.
  assert.ok(reasonsOf(i=>{i.trial.result='not covered';}).some(r=>/Mission case acquire: its trial pickup backs interaction pickup, which does not meet its bar/.test(r)));
  // A 3D trial meets a needs-3D verdict; a result an adjustment covers meets the bar like a pass.
  assert.deepEqual(reasonsOf(i=>{i.verdict='needs 3D';i.trial.engine='mujoco';}),[]);
  assert.deepEqual(reasonsOf(i=>{i.trial.result='covered by adjustment';}),[]);
  // An override is listed with its reason; an interaction with no trial is listed.
  const over=judged(t,'interactions',d=>{Object.assign(d.verdict.interactions[0],{screened:'needs 3D',verdict:'planar is enough',override:'Invented: the guides are drawn later'});});
  assert.equal(over.met,true,over.reasons.join(' | '));
  assert.ok(over.notes.includes('pickup: screened as needs 3D, taken as planar is enough because Invented: the guides are drawn later'),over.notes.join(' | '));
  const none=judged(t,'interactions',d=>{const i=d.verdict.interactions[0];delete i.trial;i.noTrial='Invented: no result would change the design';});
  assert.ok(none.notes.includes('pickup: planar is enough; no trial, because Invented: no result would change the design'));
});

test('every mission case names a trial whose record is current and passed',t=>{
  const cases=[
    [d=>{d.verdict.missionCases=[];},/No mission case: declare each mission-critical trial under missionCases in the judgement file/],
    [d=>{d.verdict.missionCases[1].result='failed';},/Mission case deliver: trial release is failed/],
    [d=>{d.verdict.missionCases[1]={...d.verdict.missionCases[1],state:'not run',result:null};},/Mission case deliver: trial release is not run yet/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'interactions',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
});

test('a configurable interaction needs a declared adjustment, measured at both ends when it is mechanical',t=>{
  const reasonsOf=(edit,adjust=()=>{})=>judged(t,'interactions',d=>{const i=d.verdict.interactions[1];i.verdict='configurable';edit(i.trial);adjust(d.verdict.adjustments[0]);}).reasons;
  assert.ok(reasonsOf(()=>{}).some(r=>/Interaction release \(configurable\): a simulated result is only a best guess here\. Declare the adjustment/.test(r)));
  assert.deepEqual(reasonsOf(x=>{x.adjustments=['lip height'];}),[]);
  assert.ok(reasonsOf(x=>{x.adjustments=['lip height'];},a=>{a.measured=false;a.hint='Invented hint';}).some(r=>/adjustment lip height is mechanical and is not measured at both ends\. Invented hint/.test(r)));
  assert.ok(reasonsOf(x=>{x.adjustments=['lip height'];},a=>{a.findings=['at 20: lip and frame come closer than 1 mm in deliver'];})
    .some(r=>/adjustment lip height at its ends: at 20: lip and frame come closer than 1 mm in deliver/.test(r)));
  assert.ok(reasonsOf(x=>{x.adjustments=['shim'];}).some(r=>/names adjustment shim, which the design source does not declare/.test(r)));
});

test('every open risk needs a closing design change or a bench test with pass and fail numbers',t=>{
  const cases=[
    [d=>{delete d.plan.risks;},/No risk register/],
    [d=>{d.plan.risks[1]={id:'belt-slip',risk:'Invented'};},/Risk belt-slip has neither/],
    [d=>{d.plan.risks[1].benchTest={measure:'pull',pass:60};},/Risk belt-slip has neither/],
    [d=>{d.plan.risks[1].benchTest={measure:'pull',pass:60,fail:60};},/Risk belt-slip has neither/],
    [d=>{d.plan.risks.push({id:'belt-slip',risk:'Invented repeat',closedBy:'x'});},/unique id/],
    [d=>{d.plan.narrative.objectives.push({objective:'Invented fallback',disposition:'open',basis:'Invented'});},/Narrative objective is still open: Invented fallback/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'risks-resolved',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
  const none=judged(t,'risks-resolved',d=>{d.plan.risks=[];});
  assert.equal(none.met,true,'an empty register is a deliberate statement that no risk remains');
});

test('malformed inputs are findings: nothing is judged met and nothing throws',t=>{
  for(const text of ['[]','null','5','"plan"','{not json']){
    const {root,verdict}=project(t);writeFileSync(path.join(root,'judgement.json'),text);
    const report=effectiveReadiness(root,{verdict});
    assert.equal(report.met,0,text);
    assert.ok(report.criteria.every(c=>c.reasons.some(r=>/^Judgement: judgement\.json is not/.test(r))),text);
  }
  const {root,verdict}=project(t,d=>{d.plan.narrative={objectives:{}};
    d.verdict.interactions=[null,7,{id:'odd',decides:'Invented',trial:5}];d.plan.risks=[null,3,{id:'r',risk:'Invented',benchTest:{id:'other',measure:'pull',pass:1}}];});
  const odd=effectiveReadiness(root,{verdict});
  assert.equal(criterion(odd,'risks-resolved').met,false);
  assert.ok(criterion(odd,'interactions').reasons.some(r=>/Interaction odd \(no verdict\): name its trial/.test(r)),'a malformed trial row is a finding');
  assert.deepEqual(odd.verificationItems,[],'an incomplete bench test is not a verification item');
  const bom=project(t);writeFileSync(path.join(bom.root,'judgement.json'),'﻿'+readFileSync(path.join(bom.root,'judgement.json'),'utf8'));
  assert.equal(effectiveReadiness(bom.root,{verdict:bom.verdict}).met,3,'a byte-order mark is not a JSON error');
});

test('the command is informational: it judges the records, prints the report, exits 0 and writes nothing',t=>{
  const {root}=project(t);
  const run=(...args)=>spawnSync(process.execPath,[path.join(plugin,'scripts','design.mjs'),'effective-readiness',...args],{encoding:'utf8'});
  // Here the judgement names no design source, so judging it is refused: every criterion that reads the verdict says why.
  const text=run(root);
  assert.equal(text.status,0,text.stderr);
  assert.match(text.stdout,/\[not met\] 1\. Whole mission cycle[^\n]*\n\s+- The layout judgement was refused: /);
  assert.match(text.stdout,/\[met\]     3\./);
  assert.match(text.stdout,/Result: 1 of 3 criteria met\./);
  const json=run(root,'--json','--plan','judgement.json');
  assert.equal(json.status,0,json.stderr);
  assert.equal(JSON.parse(json.stdout).schema,'agent-frc/effective-readiness@1');
  const empty=mkdtempSync(path.join(tmpdir(),'readiness-'));t.after(()=>rmSync(empty,{recursive:true,force:true}));
  const bare=run(empty);
  assert.equal(bare.status,0);
  assert.match(bare.stdout,/Judgement: missing file judgement\.json/);
  assert.match(bare.stdout,/Result: 0 of 3 criteria met\./);
  assert.equal(run(path.join(empty,'absent')).status,2);
  assert.equal(run().status,2);
});

test('a release folder under the project root holds the judgement file',t=>{
  const {root,verdict}=project(t),folder='cad/preliminary-design/releases/1.0';
  mkdirSync(path.join(root,folder),{recursive:true});
  writeFileSync(path.join(root,folder,'judgement.json'),readFileSync(path.join(root,'judgement.json')));rmSync(path.join(root,'judgement.json'));
  assert.equal(effectiveReadiness(root,{verdict}).met,0,'the file is no longer at the project root');
  const report=effectiveReadiness(root,{release:folder,verdict});
  assert.equal(report.met,3,report.criteria.flatMap(c=>c.reasons).join(' | '));
  assert.equal(effectiveReadiness(root,{release:folder,plan:'absent.json',verdict}).met,0,'a named file overrides the release folder');
  assert.equal(effectiveReadiness(root,{release:'../outside',verdict}).met,0);
  // A version is titled with its design name: the invented "Tilting carriage 1.0".
  assert.equal(report.design,undefined);
  assert.equal(effectiveReadiness(root,{release:folder,design:'Tilting carriage 1.0',verdict}).design,'Tilting carriage 1.0');
});
