import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFieldRehearsal } from '../scripts/field-rehearsal.mjs';
import { validateProfile } from '../scripts/kickoff.mjs';

const profile=JSON.parse(await readFile(new URL('../examples/kickoff/training-field.json',import.meta.url)));
const engine=createFieldRehearsal(profile);
const body={length:30,width:30,height:30,bumper:0,heading:0};
const square=(width)=>({...body,length:width,width});
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,a+' vs '+b);
const both=()=>['blue','red'].map(s=>engine.defaults(s,1));

test('project-owned clipped corners include the entire rotated footprint and bumpers',()=>{
  assert.equal(engine.geom.boundary.length,6);
  assert.match(engine.assessRoute([[20,20]],body).obstacle,/corner face/);
  assert.equal(engine.assessRoute([[35,35]],body).status,'clear');
  assert.match(engine.assessRoute([[35,35]],{...body,bumper:3}).obstacle,/corner face/);
  const crossing=engine.assessRoute([[85,132],[225,132]],body);
  assert.equal(crossing.obstacle,'West pedestal');
  close(crossing.distance,27);
  const detour=engine.geom.plan([85,132],[204,132],body);
  assert.ok(detour.length>2);assert.equal(engine.assessRoute(detour,body).status,'clear');
  assert.equal(createFieldRehearsal({...profile,rehearsal:undefined}).assessRoute(detour,body).status,'unknown');
  assert.equal(engine.assessRoute([[NaN,0]],body).status,'unknown');
  assert.equal(engine.assessRoute([[90,90]],body,'unverified variant').status,'unknown');
});

test('gate aperture, robot occupancy and obstacle height change a route assessment',()=>{
  const through=y=>[[198,y],[282,y]];
  assert.equal(engine.assessRoute(through(160),square(32)).status,'clear');
  assert.match(engine.assessRoute(through(160),square(37)).obstacle,/Gate rail/);
  assert.match(engine.assessRoute(through(160),{...square(32),bumper:3}).obstacle,/Gate rail/);
  assert.equal(engine.assessRoute(through(132),{...body,height:24},'raised').status,'clear');
  assert.match(engine.assessRoute(through(132),{...body,height:24},'lowered').obstacle,/Gate rail/);
  assert.match(engine.assessRoute(through(132),{...body,height:35},'raised').obstacle,/Gate rail/);
  const invalid=structuredClone(profile);
  invalid.rehearsal.obstacles[0].poly=[[0,0],[0,10],[5,4],[10,10],[10,0]];
  assert.throws(()=>validateProfile(invalid),/convex/);
});

test('continuous relative sweep detects crossing, exchanging ends, rotation and departure at contact',()=>{
  const contact=engine.geom.robotContact;
  close(contact([0,0],[100,0],square(10),[60,-60],[60,40],square(10)),0.5);
  close(contact([0,0],[100,0],square(10),[100,0],[0,0],square(10)),.45);
  assert.equal(contact([0,0],[100,0],square(10),[0,11],[100,11],square(10)),null);
  assert.equal(contact([0,0],[-10,0],body,[30,0],[30,0],body),null);
  assert.equal(contact([0,0],[0,0],{...body,heading:45},[35,0],[35,0],body),0);
  assert.equal(engine.assessRoute([[85,132],[225,132]],body).obstacle,'West pedestal');
});

test('exclusive opening queues competing arrivals and is physically unavailable to an oversized robot',()=>{
  const sim=engine.createProbe(both());sim.paused=false;engine.advance(sim,15);
  assert.ok(sim.robots.every(r=>r.visits===1));
  assert.ok(sim.robots.some(r=>r.wait>0));
  const events=sim.log.map(e=>e.message);
  assert.ok(events.includes('B1 requested practice gate'));
  assert.ok(events.indexOf('B1 entered practice gate')>events.indexOf('R1 cleared practice gate'));
  assert.ok(sim.hotspots.length);
  const big=engine.createProbe([{...engine.defaults('blue',1),width:38,bumper:0}]);
  big.paused=false;engine.advance(big,15);
  assert.equal(big.robots[0].visits,0);
  assert.match(big.robots[0].blocked,/No footprint-clear path/);
});

test('independent named resources permit concurrent reservations',()=>{
  const p=structuredClone(profile);
  for(const [id,name] of [['left','Left gate'],['right','Right gate']]){
    p.rehearsal.programs[id]={label:name,steps:[{at:p.rehearsal.starts[0],label:'Occupy',dwell:.5,lock:name,release:true}]};
  }
  validateProfile(p);
  const run=createFieldRehearsal(p),b=run.defaults('blue',1),r=run.defaults('red',1);
  b.plans.Opening='left';r.plans.Opening='right';
  const sim=run.createProbe([b,r]);sim.paused=false;run.advance(sim,.05);
  assert.equal(sim.resources['Left gate'].owner,b.id);
  assert.equal(sim.resources['Right gate'].owner,r.id);
  run.advance(sim,1);assert.equal(sim.resources['Right gate'].owner,null);
  assert.equal(sim.resources['Left gate'].owner,null);
});

test('clock freezes on each active deadline and retained footprint positions replay deterministically',()=>{
  const start=()=>{const s=engine.createProbe(both());s.paused=false;return s;};
  const sim=start();engine.advance(sim,18);
  assert.equal(sim.ticks,200);assert.ok(sim.ended && sim.paused);
  const frozen=JSON.stringify(sim.robots);engine.advance(sim,3);assert.equal(JSON.stringify(sim.robots),frozen);
  const positions=sim.robots.map(r=>r.p);
  engine.nextPhase(sim);assert.equal(sim.phase,'Main play');assert.equal(sim.ticks,0);
  assert.deepEqual(sim.robots.map(r=>r.p),positions);
  sim.paused=false;engine.advance(sim,60);assert.equal(sim.ticks,900);assert.ok(sim.ended);
  assert.deepEqual(sim.phaseHistory.map(h=>h.seconds),[10,45]);
  assert.throws(()=>engine.nextPhase(sim),/Finish the active period/);
  const replay=start();for(let i=0;i<150;i++)engine.advance(replay,.1);
  assert.equal(JSON.stringify(replay.robots),frozen);
  assert.throws(()=>engine.create([engine.defaults('red',1),engine.defaults('red',1)]),/unique/);
});

test('six moving robots stay separate between ticks using independent axis interval checks',()=>{
  const roster=[];
  for(const side of ['blue','red'])for(const n of [1,2,3])roster.push({...engine.defaults(side,n),speed:n===1?220:140});
  const sim=engine.create(roster);
  // An independent 1D moving interval calculation for default 0/180-degree headings.
  // Simultaneous strict overlap on both axes at any interior time would be a collision.
  const crossing=(a,b,c,d,reach)=>{
    const p=a-c,delta=(b-a)-(d-c);
    if(Math.abs(delta)<1e-9)return Math.abs(p)<reach-1e-6?[0,1]:[2,1];
    const t0=(-reach+1e-6-p)/delta,t1=(reach-1e-6-p)/delta;
    return [Math.min(t0,t1),Math.max(t0,t1)];
  };
  for(const steps of [200,900]){
    sim.paused=false;
    for(let tick=0;tick<steps;tick++){
      const before=sim.robots.map(r=>r.p);
      engine.advance(sim,.05);
      for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
        const a=sim.robots[i],b=sim.robots[j];
        const bounds=[0,1].map(k=>crossing(before[i][k],a.p[k],before[j][k],b.p[k],
          (k?(a.width+b.width):(a.length+b.length))/2+a.bumper+b.bumper));
        assert.ok(Math.max(0,bounds[0][0],bounds[1][0])>=Math.min(1,bounds[0][1],bounds[1][1]));
      }
    }
    if(steps===200)engine.nextPhase(sim);
  }
});
