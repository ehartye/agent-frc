import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProfile} from '../scripts/kickoff.mjs';
import {createFieldRehearsal} from '../scripts/field-rehearsal.mjs';
import {createMatchSeries} from '../scripts/rehearsal-series-core.mjs';
import {rehearsalFindings} from '../scripts/rehearsal-game.mjs';
const original=JSON.parse(readFileSync(new URL('../examples/kickoff/training-field.json',import.meta.url)));
function fixture(){
  const p=structuredClone(original), e=p.rehearsal.endgame;
  e.actions[0].serviceS=2;
  e.targets=['blue','red'].flatMap(side=>p.rehearsal.starts.map(([x,y],index)=>({
    id:side+(index+1),side,label:'Pad '+(index+1),at:side==='blue'?[x,y]:[p.field.length-x,p.field.width-y],
    resource:'rack',radiusIn:4,capacity:3,witnesses:{indicator:'met'}
  })));
  e.bonuses=[
    {id:'pair',label:'Grouped partners',scope:'resource',per:'additionalRobot',actions:['dock'],minRobots:2,points:2},
    {id:'lit',label:'Lit resource',scope:'resource',per:'robot',actions:['dock'],minRobots:1,points:1,targetRequires:['indicator']}
  ];
  return p;
}
function roster(side,slot,startS=0,met='met'){
  return {side,slot,plans:{Opening:'hold','Main play':'hold'},
    endgame:{action:'dock',target:side+slot,startS,witnesses:{'latch-held':met}}};
}
function run(p,roster,extra={}) {
  const engine=createFieldRehearsal(p);
  const match={id:'test',basis:'Synthetic shared rack',setup:'lowered',roster:engine.completeRoster(['blue','red'].flatMap(side=>[1,2,3].map(slot=>roster.find(r=>r.side===side&&r.slot===slot) ?? {side,slot,plans:{Opening:'hold','Main play':'hold'}}))),...extra};
  const series=createMatchSeries(engine,[match]);series.advance(100);
  assert.ok(series.done);return series.results[0].game;
}
test('exclusive actions, resource capacity and additive awards are side-specific at passive assessment',()=>{
  const p=fixture(), lineup=['red','blue'].flatMap(s=>[3,2,1].map(i=>roster(s,i)));
  const both=run(p,lineup,{endgameAtRestAfterS:4});
  assert.deepEqual(both.score,{blue:22,red:22}); // 3 × (5+1) + 2 additional × 2
  assert.equal(both.endgame.assessmentTimeS,57);
  for(const target of p.rehearsal.endgame.targets.filter(t=>t.side==='red')){
    target.capacity=2;target.witnesses.indicator='unknown';
  }
  const g=run(p,lineup);
  assert.equal(g.endgame.assessmentTimeS,56);assert.deepEqual(g.score,{blue:22,red:12});
  assert.equal(g.endgame.attempts.find(a=>a.robot==='R3').outcome,'resource-full');
  const report=rehearsalFindings('trial','Modeled assumptions',g,p.rehearsal.stations).join('\n');
  assert.match(report,/assessment 56 s/);assert.match(report,/Terminal points Blue 22 \/ Red 12/);
});
test('an occupied region, a post-cutoff slip and a late arrival grant no automatic base points',()=>{
  const p=fixture(), r=roster('blue',1,1,'failed');
  r.endgame.fallbacks=[{action:'stand',target:'blue1'}];r.endgame.witnesses['supported-on-pad']='met';
  let g=run(p,[r]);assert.equal(g.score.blue,1);
  assert.equal(g.endgame.attempts[0].outcome,'failed');
  assert.equal(g.endgame.attempts[0].awardedAction,'stand');
  delete r.endgame.witnesses['supported-on-pad'];g=run(p,[r]);
  assert.equal(g.score.blue,0);assert.equal(g.endgame.attempts[0].fallbacks[0].outcome,'unresolved');
  r.endgame.witnesses['supported-on-pad']='met';r.endgame.fallbacks[0].target='blue2';
  assert.equal(run(p,[r]).score.blue,0);
  const late=run(p,[roster('red',1,44)]);
  assert.equal(late.endgame.attempts[0].outcome,'service-incomplete');assert.equal(late.score.red,0);
  assert.equal(run(p,[roster('red',1,45)]).endgame.attempts[0].outcome,'did-not-start');
});
test('switching interrupts a real unfinished scoring task; ordinary stock and scores are preserved',()=>{
  const p=fixture(), row=roster('blue',1,0);row.plans['Main play']='shuttle';
  const usual=structuredClone(row);delete usual.endgame;
  const support=['blue','red'].map(side=>({side,slot:2,plans:{Opening:'receive','Main play':'receive'}}));
  const planned=run(p,[row,...support]),normal=run(p,[usual,...support]);
  assert.equal(planned.events.filter(e=>e.robot==='B1' && e.phase==='Main play').length,0);
  assert.ok(normal.events.some(e=>e.outcome==='credited'));
  assert.equal(planned.endgame.ordinaryScore.blue,0);assert.equal(planned.score.blue,6);
  assert.equal(normal.score.blue,normal.endgame.ordinaryScore.blue);
  assert.equal(planned.endgame.attempts[0].interruptedBehavior,'shuttle');
  const p2=structuredClone(p);delete p2.rehearsal.endgame;const legacy=run(p2,[usual,...support]);
  assert.equal('endgame' in legacy,false);assert.deepEqual(legacy.events,normal.events);
  assert.deepEqual(legacy.score,normal.score);
  const wrong=fixture();wrong.rehearsal.endgame.actions[0].eligibleRobots=['R1'];
  assert.throws(()=>run(wrong,[row]),/ineligible/);
  const conflict=fixture();conflict.rehearsal.endgame.targets[2].capacity=1;
  assert.throws(()=>validateProfile(conflict),/agree on capacity/);
});
test('a target at the same position can have different eligibility in two obstacle configurations',()=>{
  const p=fixture(),t=p.rehearsal.endgame.targets[0];
  t.setups=['lowered'];
  const other=p.rehearsal.setups.find(s=>s!=='lowered');
  const row=roster('blue',1);
  assert.equal(run(p,[row]).endgame.attempts[0].awardedAction,'dock');
  assert.throws(()=>run(p,[row],{setup:other}),/ineligible.*setup/);
  p.rehearsal.series.matches=[{id:'invalid',basis:'setup mismatch',setup:other,roster:[row]}];
  assert.throws(()=>validateProfile(p),/ineligible.*setup/);
});
