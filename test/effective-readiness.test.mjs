import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {gzipSync} from 'node:zlib';
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
      budgets:{massStatus:'pass',electricalCases:[{case:'invented weak traverse',status:'pass'}]},
      cases:stageIds.map(id=>({case:id,status:'pass'})),cycle:stageIds.slice(0,7),
      stages:Object.fromEntries(stageIds.map(id=>[id,{purpose:id==='remove-carrier'?'service':id==='park'?'park':'operating'}]))},
    missions:{missionCases:[{case:'acquire',kind:'operating-case',accomplishes:'acquired',objective:'Invented cycle'},
        {case:'deliver',kind:'field-interaction-trial',accomplishes:'delivered',objective:'Invented cycle'}],
      cycle:Object.fromEntries(cycleStages.map((stage,i)=>[stage,{cases:[stageIds[i]]}])),
      risks:[{id:'gate-closes-mid-turn',risk:'Invented gate closes during the turn',closedBy:'Invented interlock holds the turn'},
        {id:'belt-slip',risk:'Invented belt slips when wet',benchTest:{measure:'pull at stall',unit:'N',pass:60,fail:40}}]},
    files};
  const d=edit(draft)??draft;
  for(const [name,body] of Object.entries(d.files))writeFileSync(path.join(root,name),typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
  const pin=name=>({file:name,sha256:sha(readFileSync(path.join(root,name)))});
  if(d.receipt&&d.files['intake-trial.json'])d.receipt.stages.acquire.transportedBy={sample:{mechanisms:['carrier'],evidence:d.pins?.intake??pin('intake-trial.json')}};
  if(d.receipt&&d.files['release-trial.json'])d.receipt.stages.deliver[d.relation??'freePath']={sample:{basis:'Invented',evidence:d.pins?.release??pin('release-trial.json')}};
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

test('a trial pinned through supportedBy drives its mission case, and one for another case does not',t=>{
  const rest=d=>{const {freePath,...trial}=d.files['release-trial.json'];d.relation='supportedBy';return trial;};
  const supported=effectiveReadiness(project(t,d=>{d.files['release-trial.json']={...rest(d),support:{case:'deliver',fixtures:['lane']}};}));
  assert.equal(supported.met,3,supported.criteria.flatMap(c=>c.reasons).join(' | '));
  const other=effectiveReadiness(project(t,d=>{d.files['release-trial.json']={...rest(d),support:{case:'acquire',fixtures:['lane']}};}));
  assert.match(other.criteria.flatMap(c=>c.reasons).join(' | '),/Mission case deliver \(delivered\): trial release-trial\.json records another case/);
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
    [d=>{d.missions.missionCases[1]={kind:'operating-case'};},/A mission case names no case/],
    [d=>q(d,{brackets:[{input:'speed',unit:'rev/s',passing:'20',failing:20}]}),/lacks sensitivity brackets/],
    // A trial pinned for one case does not qualify another, through a stage pin or a mission trial pin.
    [d=>{d.files['release-trial.json'].freePath.case='acquire';},/Mission case deliver \(delivered\): trial release-trial\.json records another case/],
    [d=>{const text=JSON.stringify(d.files['intake-trial.json']);delete d.files['release-trial.json'];
      d.missions.missionCases[1].trial={file:'intake-trial.json',sha256:sha(text)};},/trial intake-trial\.json records another case/],
    // Stage pins are read only from a layout-checked receipt of this plan.
    [d=>{d.receipt.status='provisional';},/Mission case deliver \(delivered\): the motion is prescribed.*layout-checked receipt/],
    [d=>{d.receipt.planSha256='0'.repeat(64);},/Mission case acquire \(acquired\): the motion is prescribed/],
  ];
  for(const [edit,reason] of cases){
    const c=judged(t,'trial-driven',edit);
    assert.equal(c.met,false,String(reason));
    assert.ok(c.reasons.some(r=>reason.test(r)),String(reason)+' in '+c.reasons.join(' | '));
  }
});

test('a trial that drives the motion is told from a trial attached to a prescribed motion',t=>{
  const motion=(c,id)=>c.interactions.find(i=>i.case===id);
  // A stage pin: the layout check bound the checked path to the trial.
  const bound=judged(t,'trial-driven');
  assert.equal(bound.met,true,bound.reasons.join(' | '));
  assert.deepEqual(motion(bound,'deliver'),{case:'deliver',motion:'bound',trials:['release-trial.json']});
  assert.ok(bound.notes.includes('deliver: motion driven by the trial (the layout check bound the checked path to it): release-trial.json (matches its recorded SHA-256)'),bound.notes.join(' | '));
  // A qualified trial pinned on the mission case alone leaves the case's motion prescribed: reported, and not met.
  const attach=d=>{
    const text=JSON.stringify(d.files['release-trial.json']);d.files['mission-trial.json']=text;delete d.files['release-trial.json'];
    d.missions.missionCases[1].trial={file:'mission-trial.json',sha256:sha(text)};return text;};
  const attached=judged(t,'trial-driven',d=>{attach(d);});
  assert.equal(attached.met,false);
  assert.deepEqual(attached.reasons.filter(r=>r.startsWith('Mission case deliver')),
    ['Mission case deliver (delivered): prescribed motion with a trial attached (mission-trial.json). The trial records this case, but the animation is not driven by it. '
      +'Declare the payload path through transportedBy, freePath or supportedBy so the layout check binds the checked motion to the trial, or play the recorded run as a review replay']);
  assert.deepEqual(motion(attached,'deliver'),{case:'deliver',motion:'attached',trials:['mission-trial.json']});
  assert.equal(motion(attached,'acquire').motion,'bound');
  const text=readinessText(effectiveReadiness(project(t,d=>{attach(d);})));
  assert.match(text,/\[not met\] 2\.[^\n]*\n\s+- Mission case deliver \(delivered\): prescribed motion with a trial attached \(mission-trial\.json\)/);
  assert.match(text,/· deliver: prescribed motion with a trial attached: mission-trial\.json/);
  // The same pin counts once a review replay plays that trial: the animation is the recorded run.
  for(const gzip of [false,true]){
    const replayed=judged(t,'trial-driven',d=>{
      const trial=attach(d),set=JSON.stringify({schema:'agent-frc/review-replays@1',replays:[{id:'lane-run',evidence:[{file:'mission-trial.json',sha256:sha(trial),role:'recorded run'}]}]});
      d.files['replays.json']=gzip?gzipSync(set):set;
      d.plan.presentation.replays=[{file:'replays.json',sha256:'0'.repeat(64)}];});
    assert.equal(replayed.met,true,replayed.reasons.join(' | '));
    assert.equal(motion(replayed,'deliver').motion,'played');
    assert.ok(replayed.notes.some(n=>n.startsWith('deliver: animation played from the trial (a review replay or a linked field player); the checked case motion is prescribed: mission-trial.json')));
  }
  // A replay of another case's trial plays nothing for this one.
  const elsewhere=judged(t,'trial-driven',d=>{
    attach(d);
    d.files['replays.json']=JSON.stringify({replays:[{id:'intake-run',evidence:[{file:'intake-trial.json',sha256:'0'.repeat(64)}]}]});
    d.plan.presentation.replays=[{file:'replays.json',sha256:'0'.repeat(64)}];});
  assert.equal(motion(elsewhere,'deliver').motion,'attached');
  // A linked field player whose trial records the case plays it too.
  const viaLink=judged(t,'trial-driven',d=>{
    const record={case:'deliver',qualification:d.files['release-trial.json'].qualification},text=JSON.stringify(record);
    d.files['lane-trial.json']=text;delete d.files['release-trial.json'];
    d.plan.presentation.fieldInteractions=[{title:'Invented lane',href:'field/lane.html',objective:'Invented cycle',evidence:{file:'lane-trial.json',sha256:sha(text)}}];});
  assert.equal(viaLink.met,true,viaLink.reasons.join(' | '));
  assert.equal(motion(viaLink,'deliver').motion,'played');
  // No trial at all stays the plain prescribed finding.
  const none=judged(t,'trial-driven',d=>{delete d.files['release-trial.json'];});
  assert.equal(motion(none,'deliver').motion,'prescribed');
});

test('a trial named by path alone is read, and the report says no hash was compared',t=>{
  // A mission trial and a linked interaction that name only their file: nothing typed to compare, so the files are read.
  const viaMission=judged(t,'trial-driven',d=>{
    d.files['mission-trial.json']=JSON.stringify(d.files['release-trial.json']);delete d.files['release-trial.json'];
    d.missions.missionCases[1].trial={file:'mission-trial.json'};});
  // The mission trial is read and qualified, but it is only attached to a prescribed motion, so the criterion stays unmet.
  assert.deepEqual(viaMission.reasons.map(r=>r.split('.')[0]),['Mission case deliver (delivered): prescribed motion with a trial attached (mission-trial']);
  assert.deepEqual(viaMission.notes,['acquire: motion driven by the trial (the layout check bound the checked path to it): intake-trial.json (matches its recorded SHA-256)',
    'deliver: prescribed motion with a trial attached: mission-trial.json (read; no SHA-256 given to compare)']);
  const viaLink=judged(t,'trial-driven',d=>{
    d.files['lane-trial.json']=JSON.stringify({case:'deliver',qualification:d.files['release-trial.json'].qualification});delete d.files['release-trial.json'];
    d.plan.presentation.fieldInteractions=[{title:'Invented lane',href:'field/lane.html',objective:'Invented cycle',evidence:{file:'lane-trial.json'}}];});
  assert.equal(viaLink.met,true,viaLink.reasons.join(' | '));
  assert.ok(viaLink.notes.some(n=>n.startsWith('deliver: animation played from the trial')&&n.endsWith(': lane-trial.json (read; no SHA-256 given to compare)')),viaLink.notes.join(' | '));
  // The digest the layout check recorded in the receipt is kept over a path-only reference to the same file, and still compared.
  const changed=judged(t,'trial-driven',d=>{
    d.pins={release:{file:'release-trial.json',sha256:'0'.repeat(64)}};d.missions.missionCases[1].trial={file:'release-trial.json'};});
  assert.ok(changed.reasons.some(r=>/trial release-trial\.json differs from its pinned SHA-256/.test(r)),changed.reasons.join(' | '));
  // A path-only trial is still held to the case it records and to its qualification.
  const other=judged(t,'trial-driven',d=>{delete d.files['release-trial.json'];d.missions.missionCases[1].trial={file:'intake-trial.json'};});
  assert.ok(other.reasons.some(r=>/trial intake-trial\.json records another case/.test(r)),other.reasons.join(' | '));
  const gone=judged(t,'trial-driven',d=>{delete d.files['release-trial.json'];d.missions.missionCases[1].trial={file:'gone.json'};});
  assert.ok(gone.reasons.some(r=>/missing file gone\.json/.test(r)),gone.reasons.join(' | '));
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
    const root=project(t);writeFileSync(path.join(root,'layout.json'),text);
    const report=effectiveReadiness(root);
    assert.equal(report.met,0,text);
    assert.ok(report.criteria.every(c=>c.reasons.some(r=>/^Layout plan: layout\.json is not/.test(r))),text);
  }
  const odd=effectiveReadiness(project(t,d=>{d.plan.presentation={fieldInteractions:5,uncoveredCases:'x'};d.plan.narrativeReview={objectives:{}};
    d.receipt.stages.acquire.transportedBy=7;d.missions.risks=[null,3,{id:'r',risk:'Invented',benchTest:{id:'other',measure:'pull',pass:1}}];}));
  assert.equal(criterion(odd,'risks-resolved').met,false);
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

test('a release folder under the project root holds the three files while pins resolve from the root',t=>{
  const root=project(t),folder='cad/preliminary-design/releases/layout-002';
  mkdirSync(path.join(root,folder),{recursive:true});
  for(const name of ['layout.json','receipt.json','missions.json'])
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

test('stage.py prints the report when a release is marked effective',t=>{
  const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
  const season=mkdtempSync(path.join(tmpdir(),'readiness-season-'));t.after(()=>rmSync(season,{recursive:true,force:true}));
  const author=path.join(season,'cad','preliminary-design'),inputs=project(t,d=>{d.missions.risks[0].closedBy='Invented “interlock” — holds the turn';});
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
  assert.match(absent.stdout,/report unavailable/);
  const broken=run(inputs,path.join(inputs,'no-such-reporter.mjs'));
  assert.equal(broken.status,0,'a reporter that cannot run never stops a status change');
  assert.match(broken.stdout,/report unavailable/);
});
