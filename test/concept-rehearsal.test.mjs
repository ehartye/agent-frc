/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFieldRehearsal } from '../scripts/field-rehearsal.mjs';

const training=JSON.parse(await readFile(new URL('../examples/kickoff/training-field.json',import.meta.url)));
const dt=0.05;
// An invented swerve concept record, built inline in the shape the concept-bot compiler produces.
const drive=(over={})=>({type:'swerve',topSpeedInS:120,accelInS2:150,rotationDegS:180,...over});
const conceptOf=(over)=>({id:'invented-block',digest:'sha256:0',drive:drive(over),body:{},massLb:null,inputs:[],storage:{},outputs:[],concurrency:{}});
// One blue robot runs one program of plain movement legs from a chosen start, in field coordinates.
function rig(steps,start=[90,48]){
  const profile=structuredClone(training);
  profile.rehearsal.starts[0]=start;
  profile.rehearsal.programs.motion={label:'Motion trial',steps:steps.map((s,i)=>({label:'Leg '+i,frame:'field',...s}))};
  const engine=createFieldRehearsal(profile);
  const robot=over=>{const r=engine.defaults('blue',1);r.plans=Object.fromEntries(Object.keys(r.plans).map(k=>[k,'motion']));return {...r,...over};};
  return {engine,robot};
}
// Seconds from the start of the match until the robot first holds the pose (position and, if given, heading).
function arrival(engine,robot,goal,heading,limitS=6){
  const sim=engine.createProbe([robot]);sim.paused=false;
  for(let tick=1;tick*dt<=limitS+1e-9;tick++){
    engine.advance(sim,dt);
    const r=sim.robots[0];
    if(Math.hypot(r.p[0]-goal[0],r.p[1]-goal[1])<1e-6 && (heading===undefined || Math.abs(r.heading-heading)<1e-9))return {t:tick*dt,sim};
  }
  return {t:Infinity,sim};
}
const trapezoid=(d,a,v)=>d>=v*v/a?v/a+d/v:2*Math.sqrt(d/a);
const within=(actual,expected,tol,why)=>assert.ok(Math.abs(actual-expected)<=tol+1e-9,why+': '+actual+' vs '+expected);

test('motion: a concept leg from rest follows the trapezoid, and a robot without a concept keeps constant speed',()=>{
  for(const [name,length,accel] of [['long',200,150],['short triangle',40,150]]){
    const goal=[90+length,48],{engine,robot}=rig([{at:goal}]);
    assert.ok(name!=='long' || length>120*120/accel,'the long leg reaches top speed');
    const concept=arrival(engine,robot({speed:120,concept:conceptOf({accelInS2:accel})}),goal);
    within(concept.t,trapezoid(length,accel,120),dt,name+' leg trapezoid time');
    assert.equal(concept.sim.robots[0].currentSpeedInS,0,'the robot stops at the leg end');
    // Control: the same leg without a concept moves at today's constant speed.
    const legacy=arrival(engine,robot({speed:120}),goal);
    assert.equal(legacy.t,Math.ceil(length/(120*dt)-1e-9)*dt,name+' leg constant-speed time');
    assert.ok(concept.t-legacy.t>dt,'acceleration costs time on the '+name+' leg');
  }
});

test('motion: rotation runs with translation at the rotation cap, and a leg ends when both are done',()=>{
  // Translation alone on this short leg takes about 0.35 s. A 90-degree turn at 180 deg/s takes 0.5 s.
  const goal=[102,48],{engine,robot}=rig([{at:goal,requiredHeading:90}]);
  const bot=over=>robot({speed:200,concept:conceptOf({topSpeedInS:200,accelInS2:400,rotationDegS:180,...over})});
  const translation=arrival(engine,bot(),goal).t;
  within(translation,trapezoid(12,400,200),dt,'translation alone');
  const turned=arrival(engine,bot(),goal,90);
  within(turned.t,0.5,0.05,'the longer of translation and rotation');
  const r=turned.sim.robots[0];
  assert.equal(r.heading,90,'the record keeps the current heading');
  engine.advance(turned.sim,dt);
  assert.equal(r.leg,1,'the leg completes once the pose is reached');
  // A turn in place adds the whole rotation time to the translation-alone time.
  const here=rig([{at:[90,48],requiredHeading:90}]);
  const inPlace=arrival(here.engine,here.robot({speed:200,concept:conceptOf({rotationDegS:180})}),[90,48],90).t;
  within(inPlace,0.5,0.05,'in-place rotation');
  // The heading turns the shorter way: -170 from 170 is a 20-degree turn, 0.1 s at 200 deg/s.
  const wrap=rig([{at:[90,48],requiredHeading:-170}]);
  within(arrival(wrap.engine,wrap.robot({heading:170,speed:200,concept:conceptOf({rotationDegS:200})}),[90,48],-170).t,0.1,0.05,'shortest turn');
  // Control: a robot without a concept ignores a required heading.
  const legacy=arrival(engine,robot({speed:200}),goal);
  assert.equal(legacy.sim.robots[0].heading,0);
});

test('motion: a concept turning closer to a wall than its circumscribed radius waits; translating without rotation passes',()=>{
  // A 24 in square frame with 3 in bumpers: 15 in to each face, 21.2 in to each corner. Its centre is 19 in from the wall.
  const start=[240,19],goal=[300,19];
  const turning=rig([{at:goal,requiredHeading:45}],start);
  const blocked=arrival(turning.engine,turning.robot({speed:120,concept:conceptOf()}),goal,45,2);
  assert.equal(blocked.t,Infinity);
  const r=blocked.sim.robots[0];
  assert.deepEqual(r.p,start,'a blocked rotation is a wait, not a move');
  assert.equal(r.heading,0);
  assert.match(r.blocked,/South guardrail/);
  assert.ok(r.wait*dt>1.5,'the wait is recorded');
  const straight=rig([{at:goal}],start);
  assert.ok(arrival(straight.engine,straight.robot({speed:120,concept:conceptOf()}),goal).t<2,'translation keeps the swept footprint check');
  // Control: the same turn clear of the wall rotates.
  const open=rig([{at:[300,60],requiredHeading:45}],[240,60]);
  assert.ok(arrival(open.engine,open.robot({speed:120,concept:conceptOf()}),[300,60],45).t<2);
});

test('motion: a turning concept occupies its circumscribed circle against other robots',()=>{
  // Two robots side by side 34 in apart: their square footprints (30 in across) clear, the 42.4 in circle does not.
  const profile=structuredClone(training);
  profile.rehearsal.starts[0]=[240,60];profile.rehearsal.starts[1]=[240,94];
  profile.rehearsal.programs.turn={label:'Turn in place',steps:[{label:'Turn',frame:'field',at:[240,60],requiredHeading:45}]};
  profile.rehearsal.programs.stay={label:'Stay',steps:[]};
  const engine=createFieldRehearsal(profile);
  const plan=(slot,name)=>{const r=engine.defaults('blue',slot);r.plans=Object.fromEntries(Object.keys(r.plans).map(k=>[k,name]));return r;};
  const sim=engine.createProbe([{...plan(1,'turn'),speed:120,concept:conceptOf()},plan(2,'stay')]);
  sim.paused=false;engine.advance(sim,1);
  const r=sim.robots.find(x=>x.id==='B1');
  assert.equal(r.heading,0);assert.match(r.blocked,/Occupied by B2/);
});

test('motion: per-robot validation checks only the concept drive',()=>{
  const {engine,robot}=rig([{at:[120,48]}]);
  const ok=over=>engine.createProbe([robot({concept:over})]);
  // Other concept keys are accepted without inspection.
  assert.doesNotThrow(()=>ok({...conceptOf(),inputs:'not inspected',storage:null}));
  for(const [bad,field] of [[{type:'tank'},/swerve/],[{topSpeedInS:0},/topSpeedInS/],[{accelInS2:NaN},/accelInS2/],
    [{rotationDegS:-1},/rotationDegS/],[{rotationDegS:undefined},/rotationDegS/]])
    assert.throws(()=>ok(conceptOf(bad)),field);
  assert.throws(()=>ok({id:'no-drive'}),/concept\.drive/);
});
