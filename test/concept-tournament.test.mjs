/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as tournament from '../scripts/concept-tournament.mjs';
import {applyProfileDefaults} from '../scripts/concept-bot.mjs';

const read=rel=>JSON.parse(readFileSync(new URL(rel,import.meta.url),'utf8'));
const training=read('../examples/kickoff/training-field.json');

// A hand-built tournament with known margins: three base candidates over two contexts, and one-at-a-time variants.
// A: 8, 6 (mean 7, worst 6). B: 10, 4 (mean 7, worst 4), heavier and with more features. C: 2, 0 (mean 1), lightest.
const transfer='/storage/transferS/value',speed='/drive/topSpeedInS/value';
function fixture(label='assumed'){
  const margins={A:[8,6],B:[10,4],C:[2,0],
    ['A@'+transfer+'=0.5']:[9,9],['A@'+transfer+'=0.75']:[8,8],['A@'+transfer+'=1.25']:[6.5,6.5],['A@'+transfer+'=1.5']:[5,5],
    ['C@'+speed+'=2']:[7.5,7.5]};
  const contexts=[{id:'one'},{id:'two'}];
  const cells=Object.entries(margins).flatMap(([role,m])=>contexts.map((c,i)=>({role,context:c.id,margin:m[i]})));
  const variant=(baseRole,pointer,value,status='ok')=>({id:baseRole+'@'+pointer+'='+value,baseRole,pointer,value,status,
    ...(status==='ok'?{}:{error:'outside its validity range'})});
  return {
    baseRoles:[{id:'A'},{id:'B'},{id:'C'}],contexts,cells,
    axes:[{baseRole:'A',pointer:transfer,label,base:1,values:[0.5,0.75,1,1.25,1.5]},
      {baseRole:'C',pointer:speed,label,base:1,values:[0.5,1,2]}],
    variants:[variant('A',transfer,0.5),variant('A',transfer,0.75),variant('A',transfer,1.25),variant('A',transfer,1.5),
      variant('C',speed,0.5,'invalid'),variant('C',speed,2)],
    signals:{
      A:{massLbMax:100,inputPorts:1,outputPorts:1,ranged:false,turret:false,adjustableElevation:false,firesWhileMoving:false,assumedShare:0.5},
      B:{massLbMax:120,inputPorts:1,outputPorts:1,ranged:true,turret:true,adjustableElevation:true,firesWhileMoving:true,assumedShare:0.9},
      C:{massLbMax:80,inputPorts:1,outputPorts:1,ranged:false,turret:false,adjustableElevation:false,firesWhileMoving:false,assumedShare:0.5}}
  };
}

test('ranking orders base candidates by mean, then worst margin, with base-only regret, cost signals and Pareto flags',()=>{
  const result=tournament.analyzeTournament(fixture());
  assert.deepEqual(result.ranking.map(r=>[r.id,r.rank,r.meanMargin,r.worstMargin,r.maximumRegret]),
    [['A',1,7,6,2],['B',2,7,4,2],['C',3,1,0,8]]);
  assert.equal(result.leaderDecidedBy,'worstMargin');
  assert.deepEqual(result.ranking.map(r=>[r.id,r.featureCount,r.pareto]),[['A',2,true],['B',5,false],['C',2,true]]);
  assert.deepEqual(result.ranking.find(r=>r.id==='B').costSignals,fixture().signals.B);
  assert.deepEqual(result.invalidVariants,[{id:'C@'+speed+'=0.5',baseRole:'C',pointer:speed,value:0.5,error:'outside its validity range'}]);
});

test('fragility lists each assumed variant that would change the leader; the same sweep of observed values is not fragile',()=>{
  const fragile=tournament.analyzeTournament(fixture()).fragility;
  assert.equal(fragile.fragile,true);
  assert.deepEqual(fragile.flips,[
    {variant:'A@'+transfer+'=1.25',pointer:transfer,value:1.25,newLeader:'B'},
    {variant:'A@'+transfer+'=1.5',pointer:transfer,value:1.5,newLeader:'B'},
    {variant:'C@'+speed+'=2',pointer:speed,value:2,newLeader:'C'}]);
  assert.deepEqual(tournament.analyzeTournament(fixture('observed')).fragility,{fragile:false,flips:[]});
});

test('a competitive range ends at a found break-even on one side and the sweep end on the other, held at base',()=>{
  const ranges=tournament.analyzeTournament(fixture()).competitiveRanges;
  const leader=ranges.find(r=>r.role==='A'&&r.pointer===transfer);
  assert.equal(leader.runnerUp,'B');
  assert.deepEqual(leader.range,[0.5,1]);
  assert.deepEqual(leader.breakEven,{low:null,high:1.25});
  assert.equal(leader.heldAtBase,true);
  assert.match(leader.statement,/held at their base values/);
  // C is not competitive at its base value; it reports where it would overtake the leader. Its invalid value is not played.
  const trailing=ranges.find(r=>r.role==='C'&&r.pointer===speed);
  assert.equal(trailing.runnerUp,'A');
  assert.equal(trailing.range,null);
  assert.deepEqual(trailing.overtakes,{low:null,high:2});
  assert.deepEqual(trailing.margins.map(m=>m.value),[1,2]);
});

test('cost signals come from the concept with its profile defaults',()=>{
  const signals=id=>tournament.costSignals(applyProfileDefaults(read('../examples/concept-bots/'+id+'.json'),training));
  // Turret shooter: 27 of 28 labelled numbers are assumed, including the default 95 lb mass (95% of 100 lb).
  assert.deepEqual(signals('turret-shooter'),{massLbMax:95,inputPorts:1,outputPorts:1,ranged:true,turret:true,
    adjustableElevation:true,firesWhileMoving:true,assumedShare:27/28});
  assert.deepEqual(signals('front-intake-placer'),{massLbMax:110,inputPorts:1,outputPorts:1,ranged:false,turret:false,
    adjustableElevation:false,firesWhileMoving:false,assumedShare:21/22});
});

// A two-candidate concept study without sweeps, pinned beside its profile and concepts in a temporary folder.
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function project(t,over={}){
  const dir=mkdtempSync(path.join(tmpdir(),'concept-tournament-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const copy=(rel,name)=>{const bytes=readFileSync(new URL(rel,import.meta.url));writeFileSync(path.join(dir,name),bytes);return {file:name,sha256:sha(bytes)};};
  const shuttle={Opening:'shuttle','Main play':'shuttle'};
  const alliance=read('../examples/design-methods/alliance.json');
  const study={schema:'agent-frc/alliance-study@1',side:'blue',profile:copy('../examples/kickoff/training-field.json','profile.json'),
    roles:[{id:'turret',basis:'Invented turret candidate.',plans:shuttle,endgame:null,concept:copy('../examples/concept-bots/turret-shooter.json','turret.json')},
      {id:'placer',basis:'Invented placer candidate.',plans:shuttle,endgame:null,concept:copy('../examples/concept-bots/front-intake-placer.json','placer.json')}],
    contexts:alliance.contexts,conceptSweeps:{defaults:false},...over};
  writeFileSync(path.join(dir,'study.json'),JSON.stringify(study));
  return dir;
}
// Runs the CLI in-process with a clock that advances `stepMs` per reading.
async function cli(args,stepMs=0){
  let clock=0,readings=0;const lines=[];
  const code=await tournament.main(args,{now:()=>{readings++;return clock+=stepMs;},log:s=>lines.push(s),error:s=>lines.push(s)});
  return {code,out:lines.join('\n'),readings};
}

test('the run budget: a max-matches stop before play, a projected long run stopped after three matches, and --allow-long',async t=>{
  // The results go into a nested folder that does not exist yet.
  const dir=project(t),study=path.join(dir,'study.json'),out=path.join(dir,'runs','first','results.json');
  const capped=await cli([study,'--out',out,'--max-matches','2']);
  assert.equal(capped.code,3);assert.match(capped.out,/4 matches/);assert.equal(capped.readings,0);
  // 100 s per match projects 400 s for four matches, above the 300 s guideline.
  const long=await cli([study,'--out',out],100000);
  assert.equal(long.code,3);assert.match(long.out,/after 3 of 4 matches/);assert.match(long.out,/400 s/);
  assert.equal(existsSync(out),false);
  const allowed=await cli([study,'--out',out,'--allow-long'],100000);
  assert.equal(allowed.code,0,allowed.out);
  const results=JSON.parse(readFileSync(out,'utf8'));
  assert.equal(results.schema,'agent-frc/concept-results@1');
  assert.equal(results.comparison.cells.length,4);
  assert.deepEqual(results.comparison.cells.map(c=>c.focal.concept),['turret-shooter','front-intake-placer','turret-shooter','front-intake-placer']);
  assert.match(results.scope,/Expected points use declared success fractions; no physical reliability is inferred\./);
});

test('invalid concept studies exit 2: a stale concept pin names the file, and one base role is too few',async t=>{
  const dir=project(t),study=JSON.parse(readFileSync(path.join(dir,'study.json'),'utf8'));
  study.roles[0].concept.sha256='0'.repeat(64);writeFileSync(path.join(dir,'stale.json'),JSON.stringify(study));
  const stale=await cli([path.join(dir,'stale.json'),'--out',path.join(dir,'r.json')]);
  assert.equal(stale.code,2);assert.match(stale.out,/turret\.json/);
  study.roles=[JSON.parse(readFileSync(path.join(dir,'study.json'),'utf8')).roles[0]];
  writeFileSync(path.join(dir,'one.json'),JSON.stringify(study));
  const one=await cli([path.join(dir,'one.json'),'--out',path.join(dir,'r.json')]);
  assert.equal(one.code,2);assert.match(one.out,/2–8 base roles/);
  // An output folder that cannot be created (its parent is a file) exits 2 before any match, naming the path.
  const blocked=await cli([path.join(dir,'study.json'),'--out',path.join(dir,'study.json','results.json')]);
  assert.equal(blocked.code,2);assert.match(blocked.out,/study\.json/);assert.doesNotMatch(blocked.out,/Planned/);
});
