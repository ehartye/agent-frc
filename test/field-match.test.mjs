import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createFieldRehearsal} from '../scripts/field-rehearsal.mjs';
import {createRehearsalGame} from '../scripts/rehearsal-game.mjs';
import {createMatchSeries} from '../scripts/rehearsal-series-core.mjs';

const original=JSON.parse(readFileSync(new URL('../examples/kickoff/training-field.json',import.meta.url)));
const fresh=()=>structuredClone(original);
const robot={id:'B1',side:'blue',length:24,width:24,bumper:3,heading:0,capacity:2,p:[60,48]};
function trial(game,robots=[robot]){
  return {game:game.start(robots),phase:'Opening',phaseIndex:0,phaseHistory:[]};
}

test('complete match rosters include three numbered starts per side and their published phase roles',()=>{
  const p=fresh(),e=createFieldRehearsal(p),published=p.rehearsal.series.matches[0];
  const roster=e.startingRoster();
  assert.deepEqual(roster.map(r=>r.id),['B1','B2','B3','R1','R2','R3']);
  assert.equal(new Set(roster.map(r=>r.plans.Opening)).size,3);
  assert.throws(()=>e.create(roster.slice(1)),/six/);
  assert.throws(()=>e.create([...roster.slice(1),roster.at(-1)]),/unique/);
  const series=createMatchSeries(e,[{...published,roster:published.roster.slice(0,2)}]);
  assert.equal(series.sim.robots.length,6);
  assert.equal(series.match.roster.length,6);
  assert.equal(e.createProbe(roster.slice(0,1)).robots.length,1);
});

test('shared human jobs rotate, independent jobs run concurrently, and interrupted work cannot cross a forbidden period',()=>{
  const p=fresh(),supplies=p.rehearsal.stations.filter(s=>s.service);
  for(const s of supplies)Object.assign(s.service,{operator:'shared operator',secondsPerPiece:1,phases:['Opening']});
  const extra=structuredClone(supplies[0]);extra.id='independent';extra.service.operator='independent operator';
  p.rehearsal.stations.push(extra);
  const game=createRehearsalGame(p),sim=trial(game);
  game.replenish(sim,0);game.replenish(sim,.99);
  assert.ok(supplies.every(s=>sim.game.stock[s.id].length===0));assert.equal(sim.game.stock[extra.id].length,0);
  game.replenish(sim,1);
  assert.equal(sim.game.stock[supplies[0].id].length,1);assert.equal(sim.game.stock[supplies[1].id].length,0);
  assert.equal(sim.game.stock[extra.id].length,1);
  sim.phase='Main play';game.replenish(sim,2);
  assert.equal(sim.game.stock[supplies[1].id].length,0);
  assert.equal(sim.game.reserve[supplies[1].id].length,supplies[1].stock);
  sim.phase='Opening';game.replenish(sim,3);game.replenish(sim,4);
  assert.equal(sim.game.stock[supplies[1].id][0].id,supplies[1].id+'/1');
  assert.equal(sim.game.motion.pieces.filter(p=>p.station===supplies[1].id).length,1);
});

test('a scored return must be served by its new side before independent credit, and misses earn zero',()=>{
  for(const outcome of ['credited','missed']){
    const p=fresh(),[supply,blue,,red]=p.rehearsal.stations;
    const desk={id:'return-desk',kind:'retrieval',piece:supply.piece,side:'red',label:'Opposite return',stock:0,at:red.at,radiusIn:10,
      service:{operator:'red steward',phases:['Main play'],secondsPerPiece:2,capacity:1,outlet:red.at,radiusIn:2,
        delivery:{station:red.id,outcome,basis:'Project-adjudicated delivery scenario.'}}};
    p.rehearsal.stations.push(desk);blue.returns={credited:{station:desk.id,delayS:1}};
    const game=createRehearsalGame(p),sim=trial(game,[{...robot,preload:{station:supply.id,quantity:1}}]);
    const carrier={...robot,p:blue.at},attempt={operation:'attempt',station:blue.id,outcome:'credited'};
    game.apply(sim,carrier,attempt,1);game.apply(sim,carrier,attempt,1.05);
    game.replenish(sim,2);game.replenish(sim,9);
    assert.deepEqual(sim.game.score,{blue:1,red:0});assert.equal(sim.game.reserve[desk.id][0].id,supply.id+'/1');
    sim.phase='Main play';sim.phaseIndex=1;sim.phaseHistory.push({seconds:10});
    game.replenish(sim,0);game.replenish(sim,1.95);assert.equal(sim.game.score.red,0);
    game.replenish(sim,2);game.replenish(sim,8);
    assert.deepEqual(sim.game.score,{blue:1,red:outcome==='credited'?1:0});
    const last=sim.game.events.filter(e=>e.robot==='human/red steward' && e.operation==='attempt');assert.equal(last.length,1);
    assert.equal(last[0].outcome,outcome);assert.deepEqual(last[0].pieces,[supply.id+'/1']);assert.equal(sim.game.terminal.at(-1).id,supply.id+'/1');
  }
});

test('a planned loose ID must physically reach the robot before its cargo and score can change',()=>{
  const p=fresh(),[source,target]=p.rehearsal.stations;
  source.stock=2;source.floor={radiusIn:2,captureReachIn:1,positions:[[85,51],[44,48]]};
  const game=createRehearsalGame(p),sim=trial(game);
  game.apply(sim,robot,{operation:'acquire',station:source.id,quantity:2},1);
  assert.deepEqual(sim.game.cargo.B1.map(p=>p.id),[source.id+'/2']);
  assert.deepEqual(sim.game.motion.pieces.filter(p=>p.station===source.id).map(p=>p.id),[source.id+'/1']);
  const release={...robot,p:target.at},send={operation:'attempt',station:target.id,outcome:'credited',quantity:2};
  game.apply(sim,release,send,2);game.apply(sim,release,send,3);
  assert.equal(sim.game.score.blue,1);assert.equal(sim.game.events.at(-1).outcome,'no-compatible-cargo');
  target.returns={missed:{station:source.id,delayS:0}};
  assert.throws(()=>createRehearsalGame(p),/Returns/);
});


test('opening dispatch uses separate reachable floor locations and yields the third pickup when stock is scarce',()=>{
  const p=fresh(),m=p.rehearsal,[first]=m.stations;
  first.stock=1;first.floor={radiusIn:2,captureReachIn:2,positions:[[73,48]]};
  const second={...first,id:'other-source',at:[73,132],floor:{...first.floor,positions:[[73,132]]}};
  m.stations.push(second);
  m.programs.select={label:'Collect opening piece',steps:[{at:first.at,label:'Collect',operation:'acquire',station:first.id,openingAlternatives:[second.id]}]};
  const e=createFieldRehearsal(p);
  const lineup=e.completeRoster(['blue','red'].flatMap(side=>[1,2,3].map(slot=>({side,slot,plans:{Opening:side==='blue'?'select':'hold','Main play':'hold'}}))));
  const sim=e.create(lineup);
  assert.deepEqual([sim.game.opening.B1.piece,sim.game.opening.B2.piece],['blue-supply/1','other-source/1']);
  assert.ok(sim.game.opening.B3.yieldPickup);
  assert.notDeepEqual(sim.game.opening.B1.approach,sim.game.opening.B2.approach);
  sim.paused=false;e.advance(sim,3);
  assert.deepEqual([sim.game.cargo.B1[0]?.id,sim.game.cargo.B2[0]?.id],['blue-supply/1','other-source/1']);
  assert.deepEqual(sim.game.cargo.B3,[]);
});
