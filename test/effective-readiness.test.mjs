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

/** An invented, complete package: eight cycle stages, two trial-driven mission cases and a closed risk register. */
function project(t,edit=x=>x){
  const root=mkdtempSync(path.join(tmpdir(),'readiness-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const qualification={result:'pass',control:{condition:'Invented roller unpowered',rejected:true},
    brackets:[{input:'roller speed',unit:'rev/s',passing:20,failing:8}],timestep:{coarseS:0.002,fineS:0.001,sameOutcome:true}};
  const files={
    'intake-trial.json':{transport:{case:'acquire'},qualification},
    'release-trial.json':{freePath:{case:'deliver'},qualification},
  };
  const stageIds=['acquire','hold','pass-up','deliver','return','hang','park','remove-carrier'];
  const draft={
    plan:{schema:'agent-frc/preliminary-layout@1',issue:'synthetic-issue',
      narrativeReview:{objectives:[{objective:'Invented cycle',disposition:'represented',basis:'Invented'}]},
      presentation:{uncoveredCases:[{id:'gate-closes-mid-turn',condition:'Invented',reason:'Invented'}]}},
    receipt:{schema:'agent-frc/preliminary-layout-result@1',issue:'synthetic-issue',status:'layout-checked',missingInputs:[],
      cases:stageIds.map(id=>({case:id,status:'pass'})),cycle:stageIds.slice(0,7),
      stages:Object.fromEntries(stageIds.map(id=>[id,{purpose:id==='remove-carrier'?'service':id==='park'?'park':'operating'}]))},
    missions:{missionCases:[{case:'acquire',kind:'operating-case',accomplishes:'acquired',objective:'Invented cycle'},
        {case:'deliver',kind:'field-interaction-trial',accomplishes:'delivered',objective:'Invented cycle'}],
      cycle:Object.fromEntries(cycleStages.map((stage,i)=>[stage,{cases:[stageIds[i]]}])),
      risks:[{id:'gate-closes-mid-turn',risk:'Invented gate closes during the turn',closedBy:'Invented interlock holds the turn'},
        {id:'belt-slip',risk:'Invented belt slips when wet',benchTest:{measure:'pull at stall',unit:'N',pass:60,fail:40}}]},
    files};
  const d=edit(draft)??draft;
  for(const [name,body] of Object.entries(d.files))writeFileSync(path.join(root,name),typeof body==='string'?body:JSON.stringify(body));
  const pin=name=>({file:name,sha256:sha(readFileSync(path.join(root,name)))});
  if(d.receipt&&d.files['intake-trial.json'])d.receipt.stages.acquire.transportedBy={sample:{mechanisms:['carrier'],evidence:d.pins?.intake??pin('intake-trial.json')}};
  if(d.receipt&&d.files['release-trial.json'])d.receipt.stages.deliver.freePath={sample:{basis:'Invented',evidence:d.pins?.release??pin('release-trial.json')}};
  const planText=JSON.stringify(d.plan);
  writeFileSync(path.join(root,'layout.json'),planText);
  if(d.receipt){if(d.receipt.planSha256===undefined)d.receipt.planSha256=sha(planText);writeFileSync(path.join(root,'receipt.json'),JSON.stringify(d.receipt));}
  if(d.missions)writeFileSync(path.join(root,'missions.json'),JSON.stringify(d.missions));
  return root;
}
const criterion=(report,id)=>report.criteria.find(c=>c.id===id);
const judged=(t,id,edit)=>criterion(effectiveReadiness(project(t,edit)),id);

test('a complete synthetic package meets every exit criterion',t=>{
  const report=effectiveReadiness(project(t));
  assert.deepEqual(report.criteria.map(c=>[c.id,c.met,c.reasons]),
    [['whole-cycle',true,[]],['trial-driven',true,[]],['risks-resolved',true,[]]]);
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

test('each mission case needs a pinned trial with a pass, a control, brackets and a timestep check',t=>{
  const q=(d,change)=>{const trial=d.files['release-trial.json'];trial.qualification={...trial.qualification,...change};};
  const cases=[
    [d=>{delete d.files['release-trial.json'];},/Mission case deliver \(delivered\): the motion is prescribed/],
    [d=>{delete d.files['release-trial.json'].qualification;},/trial release-trial\.json has no qualification record/],
    [d=>q(d,{result:'fail'}),/does not record a passing result/],
    [d=>q(d,{control:{condition:'Invented',rejected:false}}),/lacks a control/],
    [d=>q(d,{control:undefined}),/lacks a control/],
    [d=>q(d,{brackets:[]}),/lacks sensitivity brackets/],
    [d=>q(d,{brackets:[{input:'speed',unit:'rev/s',passing:20,failing:20}]}),/lacks sensitivity brackets/],
    [d=>q(d,{brackets:[{input:'speed',unit:'rev/s',passing:20}]}),/lacks sensitivity brackets/],
    [d=>q(d,{timestep:{coarseS:0.001,fineS:0.001,sameOutcome:true}}),/lacks a timestep check/],
    [d=>q(d,{timestep:{coarseS:0.002,fineS:0.001,sameOutcome:false}}),/lacks a timestep check/],
    [d=>{d.pins={release:{file:'release-trial.json',sha256:'0'.repeat(64)}};},/differs from its pinned SHA-256/],
    [d=>{d.pins={release:{file:'gone.json',sha256:'0'.repeat(64)}};},/missing file gone\.json/],
    [d=>{d.pins={release:{file:'../outside.json',sha256:'0'.repeat(64)}};},/not a project-relative file/],
    [d=>{d.missions.missionCases=[];},/No mission case/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'trial-driven',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
  // A mission trial pin or a linked field interaction that records the case also binds the motion.
  const viaMission=judged(t,'trial-driven',d=>{
    const text=JSON.stringify(d.files['release-trial.json']);d.files['mission-trial.json']=text;delete d.files['release-trial.json'];
    d.missions.missionCases[1].trial={file:'mission-trial.json',sha256:sha(text)};});
  assert.equal(viaMission.met,true,viaMission.reasons.join(' | '));
  const viaLink=judged(t,'trial-driven',d=>{
    const record={case:'deliver',qualification:d.files['release-trial.json'].qualification},text=JSON.stringify(record);
    d.files['lane-trial.json']=text;delete d.files['release-trial.json'];
    d.plan.presentation.fieldInteractions=[{title:'Invented lane',href:'field/lane.html',objective:'Invented cycle',evidence:{file:'lane-trial.json',sha256:sha(text)}}];});
  assert.equal(viaLink.met,true,viaLink.reasons.join(' | '));
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

test('the command is informational: it prints the report, exits 0 and writes nothing',t=>{
  const root=project(t,d=>{delete d.missions.cycle.endgame;delete d.missions.risks;});
  const before=readFileSync(path.join(root,'receipt.json'));
  const run=(...args)=>spawnSync(process.execPath,[path.join(plugin,'scripts','design.mjs'),'effective-readiness',...args],{encoding:'utf8'});
  const text=run(root);
  assert.equal(text.status,0,text.stderr);
  assert.match(text.stdout,/\[not met\] 1\. Whole mission cycle[^\n]*\n\s+- Narrative stage endgame has no case/);
  assert.match(text.stdout,/\[met\]     2\./);
  assert.match(text.stdout,/Result: 1 of 3 criteria met\./);
  const json=run(root,'--json','--plan','layout.json','--receipt','receipt.json','--missions','missions.json');
  assert.equal(json.status,0,json.stderr);
  assert.equal(JSON.parse(json.stdout).schema,'agent-frc/effective-readiness@1');
  assert.deepEqual(readFileSync(path.join(root,'receipt.json')),before);
  // Unreadable inputs are findings, not failures; only an unusable project folder is a usage error.
  const empty=mkdtempSync(path.join(tmpdir(),'readiness-'));t.after(()=>rmSync(empty,{recursive:true,force:true}));
  const bare=run(empty);
  assert.equal(bare.status,0);
  assert.match(bare.stdout,/Layout plan: missing file layout\.json/);
  assert.match(bare.stdout,/Result: 0 of 3 criteria met\./);
  assert.equal(run(path.join(empty,'absent')).status,2);
  assert.equal(run().status,2);
});

test('stage.py prints the report when a release is marked effective',t=>{
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const season=mkdtempSync(path.join(tmpdir(),'readiness-season-'));t.after(()=>rmSync(season,{recursive:true,force:true}));
  const author=path.join(season,'cad','preliminary-design'),inputs=project(t);
  mkdirSync(path.join(author,'releases'),{recursive:true});
  writeFileSync(path.join(author,'stage.py'),readFileSync(path.join(plugin,'templates','stage-preliminary-review.py')));
  const script=String.raw`
import importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("stage", sys.argv[1])
stage = importlib.util.module_from_spec(spec); spec.loader.exec_module(stage)
stage.readiness_report(Path(sys.argv[2]), Path(sys.argv[3]) if len(sys.argv) > 3 else None)
`;
  const run=(...args)=>spawnSync(python,['-c',script,path.join(author,'stage.py'),...args],{encoding:'utf8'});
  const shown=run(inputs,path.join(plugin,'scripts','effective-readiness.mjs'));
  assert.equal(shown.status,0,shown.stderr);
  assert.match(shown.stdout,/Effective-readiness report for synthetic-issue/);
  assert.match(shown.stdout,/Result: 3 of 3 criteria met\./);
  const hint=run(inputs);
  assert.equal(hint.status,0,hint.stderr);
  assert.match(hint.stdout,/effective-readiness/);
  assert.doesNotMatch(hint.stdout,/Result:/);
  const absent=run(path.join(inputs,'absent'),path.join(plugin,'scripts','effective-readiness.mjs'));
  assert.equal(absent.status,0,'a missing inputs folder never stops a status change');
});
