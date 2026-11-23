/** @lane merge */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createFieldRehearsal} from '../scripts/field-rehearsal.mjs';
import {createMatchSeries,createRehearsalSetup} from '../scripts/rehearsal-series-core.mjs';
import {createRehearsalGame,rehearsalFindings} from '../scripts/rehearsal-game.mjs';

const profile=JSON.parse(await readFile(new URL('../examples/kickoff/training-field.json',import.meta.url)));
function conserved(game) {
  const ids=[...Object.values(game.stock).flat(),...Object.values(game.reserve).flat(),...Object.values(game.cargo).flat(),...game.terminal,...game.returning.map(r=>r.piece)].map(p=>p.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.length,Object.values(game.initial).reduce((a,b)=>a+b,0));
}
test('series keeps fixed-step clocks, fresh stock and independent period behavior for every trial',()=>{
  const engine=createFieldRehearsal(profile), matches=profile.rehearsal.series.matches;
  const manual=createMatchSeries(engine,matches), fast=createMatchSeries(engine,matches);
  const clock=engine.periods.reduce((v,p)=>v+p.seconds,0)*matches.length;
  for(let tick=0;tick<clock*20;tick++) manual.advance(.05);
  fast.advance(10*(clock/10));
  assert.ok(fast.done && manual.done);
  assert.deepEqual(fast.results,manual.results);
  for(const result of fast.results){
    assert.deepEqual(result.periods.map(p=>p.seconds),engine.periods.map(p=>p.seconds));
    const findings=rehearsalFindings(result.id,result.basis,result.game,profile.rehearsal.stations).join(' ');
    assert.match(findings,/Modeled rehearsal score: Blue/);assert.match(findings,/Main play.*credited/);
    assert.match(findings,/stock 6 initially/);
    conserved(result.game);assert.ok(result.game.score.blue>0 && result.game.score.red>0);
  }
  assert.notDeepEqual(fast.results[0].roster[0].plans,fast.results[1].roster[0].plans);
  assert.notEqual(fast.results[0].game,fast.results[1].game);
});
test('published scenarios and repeated student matches reset to the same edited configuration',()=>{
  const model=profile.rehearsal, engine=createFieldRehearsal(profile), published=model.series.matches;
  const workspace=createRehearsalSetup(engine,engine.startingRoster(),model.setups[0],published);
  const robot={...engine.defaults('red',2),speed:17,plans:{...published[0].roster[0].plans}};
  const setup=model.setups.at(-1);
  const lineup=engine.completeRoster([robot]);workspace.edit(lineup,setup);
  assert.throws(()=>workspace.edit([],'unknown'));
  const presets=workspace.series('published');
  presets.advance(1);
  assert.equal(workspace.reset().robots.find(r=>r.id===robot.id).speed,17);
  presets.advance(1000);
  assert.deepEqual(presets.results.map(m=>m.id),published.map(m=>m.id));
  const custom=workspace.series('student');
  custom.advance(1000);
  for(const trial of custom.results){
    assert.deepEqual(trial.roster,lineup);assert.equal(trial.setup,setup);
    assert.deepEqual(trial.periods.map(p=>p.phase),model.periods.map(p=>p.name));
  }
  assert.equal(custom.results.length,3);
  assert.notEqual(custom.results[0].roster[0].plans,custom.results[1].roster[0].plans);
  assert.deepEqual(workspace.roster,lineup);
  assert.equal(workspace.reset().ticks,0);
  assert.throws(()=>workspace.edit([],setup),/exactly six/);
  assert.equal(workspace.reset().robots.length,6);
  assert.throws(()=>createMatchSeries(engine,[{...published[0],roster:[]}]),/roster/);
});
test('finite stock, typed cargo, inactive/tied targets and delayed return preserve each identity',()=>{
  const p=structuredClone(profile),model=p.rehearsal;
  const supply=model.stations[0],bay=model.stations[1];
  supply.stock=1;supply.side='both';bay.side='both';
  bay.activeWindows=[{phase:'Main play',fromS:0,toS:4,firstPeriodLeader:'blue'}];
  bay.returns={unresolved:{station:supply.id,delayS:2},missed:{station:supply.id,delayS:1}};
  const game=createRehearsalGame(p), b={id:'B1',side:'blue',p:supply.at,capacity:1},r={id:'R1',side:'red',p:supply.at};
  const sim={game:game.start([b,r]),phase:'Main play',phaseIndex:1,phaseHistory:[{seconds:10}]};
  const pick={operation:'acquire',station:supply.id},send={operation:'attempt',station:bay.id,outcome:'credited'};
  game.apply(sim,b,pick,0);game.apply(sim,r,pick,0);
  assert.equal(sim.game.cargo.B1.length,1);assert.equal(sim.game.cargo.R1.length,0);
  game.apply(sim,b,send,.5);assert.equal(sim.game.events.at(-1).outcome,'ineligible-position-or-alliance');
  b.p=bay.at;game.apply(sim,b,send,1);assert.equal(sim.game.events.at(-1).outcome,'unresolved');
  game.replenish(sim,2.95);assert.equal(sim.game.stock[supply.id].length,0);
  game.replenish(sim,3);assert.equal(sim.game.stock[supply.id][0].id,supply.id+'/1');
  game.apply(sim,r,pick,3);r.p=bay.at;sim.game.tieWinner='red';
  game.apply(sim,r,send,3.5);assert.equal(sim.game.events.at(-1).outcome,'inactive');
  assert.equal(sim.game.score.red,0);conserved(sim.game);
  assert.throws(()=>game.start([{...b,preload:{station:supply.id,quantity:2}}]),/Preload exceeds/);
});

test('only available scoring slots admit a batch, and a returning piece reopens its slot',()=>{
  const p=structuredClone(profile);
  const [supply,target]=p.rehearsal.stations;
  target.capacity=1;target.returns={credited:{station:supply.id,delayS:2}};
  const robot={id:'B1',side:'blue',p:target.at,capacity:3,preload:{station:supply.id,quantity:3}};
  const game=createRehearsalGame(p),sim={game:game.start([robot]),phase:'Opening',phaseIndex:0,phaseHistory:[]};
  const attempt={operation:'attempt',station:target.id,outcome:'credited',quantity:2};
  game.apply(sim,robot,attempt,.5);
  assert.deepEqual(sim.game.events.map(e=>[e.outcome,e.points]),[['credited',1],['occupied',0]]);
  assert.equal(sim.game.occupied[target.id],1);assert.equal(sim.game.cargo.B1.length,1);
  game.replenish(sim,2.49);assert.equal(sim.game.occupied[target.id],1);
  game.replenish(sim,2.5);assert.equal(sim.game.occupied[target.id],0);
  game.apply(sim,robot,attempt,2.55);assert.equal(sim.game.score.blue,2);
  assert.equal(sim.game.attempts[target.id],3);conserved(sim.game);
});
