import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createFieldRehearsal} from '../scripts/field-rehearsal.mjs';
import {createMatchSeries} from '../scripts/rehearsal-series-core.mjs';
import {createRehearsalGame,rehearsalFindings} from '../scripts/rehearsal-game.mjs';

const profile=JSON.parse(await readFile(new URL('../examples/kickoff/training-field.json',import.meta.url)));
function conserved(game) {
  const ids=[...Object.values(game.stock).flat(),...Object.values(game.cargo).flat(),...game.terminal,...game.returning.map(r=>r.piece)].map(p=>p.id);
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
