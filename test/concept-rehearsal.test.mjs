/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFieldRehearsal } from '../scripts/field-rehearsal.mjs';
import { compileConceptBot, applyProfileDefaults } from '../scripts/concept-bot.mjs';
import { rehearsalFindings } from '../scripts/rehearsal-game.mjs';

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

// Port cases. Invented concept documents compile through the concept-bot module, as kickoff embeds them.
const q=value=>({value,label:'assumed',basis:'Invented test value.'});
const span=(min,max,extra={})=>({min,max,label:'assumed',basis:'Invented test range.',...extra});
function conceptDoc(id,{inputs=[],outputs=[],capacity={ball:2},transferS=0,top=120,accel=250,rotation=180}={}){
  return {schema:'agent-frc/concept-bot@1',id,name:id,basis:'Invented test concept.',
    body:{frameLengthIn:q(24),frameWidthIn:q(24),bumperIn:q(3),stowedHeightIn:q(24),maxHeightIn:q(30),maxReachIn:q(6)},
    drive:{type:'swerve',topSpeedInS:q(top),accelInS2:q(accel),rotationDegS:q(rotation)},inputs,
    storage:{capacity:Object.fromEntries(Object.entries(capacity).map(([k,v])=>[k,q(v)])),transferS:q(transferS)},
    outputs,concurrency:{intakeWhileScoring:false}};
}
const input=(face,over={})=>({id:face+'-in',face,widthIn:q(16),extensionIn:q(2),pieces:['ball'],headingToleranceDeg:q(10),
  acquireHeightIn:span(0,10),secondsPerPiece:q(0.2),requiresStop:true,...over});
function shooter({elevation=[60,60],turret=null,moving=false,fraction=1}={}){
  const [lo,hi]=elevation;
  return {id:'shooter',face:'front',kind:'ranged',pieces:['ball'],secondsPerPiece:q(0.4),requiresStop:false,successFraction:q(fraction),
    ranged:{releaseHeightIn:q(22),launchSpeedInS:span(200,400),elevationDeg:span(lo,hi,lo<hi?{slewDegS:q(360)}:{}),
      turret:turret&&span(turret[0],turret[1],{slewDegS:q(turret[2])}),aimToleranceDeg:q(3),
      firesWhileMoving:moving&&{maxRobotSpeedInS:q(moving[0]),successFraction:q(moving[1])}}};
}
const placer={id:'placer',face:'front',kind:'place',pieces:['ball'],secondsPerPiece:q(0.3),requiresStop:true,successFraction:q(1),
  place:{standOffIn:span(2,6),headingToleranceDeg:q(10),releaseHeightIn:span(10,20)}};
// The training field plus invented stations: a ball rack for preloads, loose balls and a ring goal 80 in high.
function arena({docs,steps,goal=[340,60],entry='ring',points=2,balls=[[250,60]],cubes=[]}){
  const p=structuredClone(training),r=p.rehearsal;
  const floor=(id,piece,positions)=>({id,label:id,kind:'retrieval',side:'both',piece,at:positions[0]??[400,240],radiusIn:20,stock:positions.length,
    floor:{positions,radiusIn:4,heightIn:8}});
  r.stations.push({id:'test-rack',label:'Test rack',kind:'retrieval',side:'both',piece:'ball',at:[440,240],radiusIn:16,stock:6},
    floor('test-balls','ball',balls),...(cubes.length?[floor('test-cubes','cube',cubes)]:[]),
    {id:'test-goal',label:'Test goal',kind:'scoring',side:'both',piece:'ball',at:goal,radiusIn:16,points,criterion:'Invented test criterion.',
      ...(entry==='ring'?{entry:{centerIn:[...goal,80],kind:'ring',radiusIn:12,factId:'test-goal-entry'}}:entry?{entry}:{})});
  r.programs.trial={label:'Trial',steps:steps.map((s,i)=>({label:'Step '+i,frame:'field',at:goal,...s}))};
  r.concepts=docs.map(d=>({document:d,record:compileConceptBot(applyProfileDefaults(d,p))}));
  return p;
}
const shoot={operation:'attempt',station:'test-goal',outcome:'credited'};
function play(profile,rows,seconds,starts=[]){
  starts.forEach((s,i)=>{profile.rehearsal.starts[i]=s;});
  const engine=createFieldRehearsal(profile);
  const sim=engine.createProbe(rows.map((row,i)=>({...engine.defaults('blue',i+1),plans:{Opening:'trial','Main play':'trial'},...row})));
  sim.paused=false;engine.advance(sim,seconds);
  return {engine,sim,events:sim.game.events,notes:rehearsalFindings('trial','Invented trial',sim.game,profile.rehearsal.stations).join('\n')};
}
const releases=events=>events.filter(e=>e.operation==='attempt' && e.port);
const preload={station:'test-rack',quantity:1};
const wrapDeg=a=>((a%360)+540)%360-180;
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,a+' vs '+b);

test('ports: a concept named by id takes its compiled body and drive; an unknown id is refused',()=>{
  const doc=conceptDoc('named',{outputs:[shooter()]}),p=arena({docs:[doc],steps:[shoot]});
  p.rehearsal.defaults.concept='named';
  const engine=createFieldRehearsal(p),b1=engine.defaults('blue',1);
  assert.equal(b1.concept.id,'named');assert.equal(b1.length,24);assert.equal(b1.speed,120);
  assert.equal(engine.completeRoster([{side:'red',slot:2,concept:'named'}]).find(r=>r.id==='R2').concept.drive.accelInS2,250);
  assert.throws(()=>engine.createProbe([{...engine.defaults('blue',1),concept:'missing'}]),/Unknown concept "missing"/);
});

test('ports: only the back input acquires, with the heading on the approach bearing + 180',()=>{
  // The piece sits on the front mouth line of a robot at [200,60] facing 0 degrees.
  const docs=[conceptDoc('back',{inputs:[input('back')]}),conceptDoc('front',{inputs:[input('front')]})];
  const run=id=>play(arena({docs,steps:[{operation:'acquire',station:'test-balls'}],balls:[[220,60]]}),[{concept:id}],3,[[200,60]]);
  const front=run('front').events.find(e=>e.operation==='acquire');
  within(front.timeS,0.2,dt,'front contact plus secondsPerPiece');
  const back=run('back').events.find(e=>e.operation==='acquire');
  assert.ok(back.timeS>0.5,'the front face touching the piece is not a back-port contact');
  assert.equal(back.port,'back-in');
  // The turning robot nudges the piece, so the approach bearing is the one at contact, from robot to piece.
  const approach=Math.atan2(back.contact.position[1]-back.contact.robotPosition[1],back.contact.position[0]-back.contact.robotPosition[0])*180/Math.PI;
  assert.ok(Math.abs(wrapDeg(back.contact.heading-approach-180))<=10,'heading '+back.contact.heading+' for bearing '+approach);
});

test('ports: a turret fires after its slew without turning; a fixed shooter turns first',()=>{
  // The robot faces -60 degrees and the goal bears 0 degrees, 100 in away: inside the fixed 60-degree arc band.
  const docs=[conceptDoc('turret',{outputs:[shooter({turret:[-90,90,360]})]}),conceptDoc('fixed',{outputs:[shooter()]})];
  const first=id=>{
    const run=play(arena({docs,steps:[shoot]}),[{concept:id,heading:-60,preload}],2,[[240,60]]);
    return releases(run.events)[0];
  };
  const turret=first('turret'),fixed=first('fixed');
  within(turret.timeS,60/360,0.05,'turret slew');
  assert.equal(turret.pose.heading,-60,'the turret robot keeps its heading');
  within(fixed.timeS-turret.timeS,60/180-60/360,0.05,'rotation minus slew');
  assert.ok(Math.abs(fixed.pose.heading)<=3);
});

test('ports: a fixed elevation is denied a pose that only an adjusted elevation reaches',()=>{
  // At 100 in from the ring a 45-degree launch cannot pass (its band starts near 109 in); 20-60 degrees can.
  const docs=[conceptDoc('fixed45',{outputs:[shooter({elevation:[45,45]})]}),conceptDoc('hood',{outputs:[shooter({elevation:[20,60]})]})];
  const first=id=>releases(play(arena({docs,steps:[shoot]}),[{concept:id,preload}],4,[[240,60]]).events)[0];
  assert.deepEqual(first('hood').pose.p,[240,60]);
  const fixed=first('fixed45');
  assert.ok(Math.hypot(fixed.pose.p[0]-340,fixed.pose.p[1]-60)>=109-1e-6,'fixed elevation released from '+fixed.pose.p);
});

test('ports: firing while moving obeys its speed cap and fraction; without it the robot stops first',()=>{
  // Two preloaded balls, a long straight approach to a ring at [420,60]. Moving shots score 0.6, stationary 0.8.
  const run=(top,moving)=>{
    const doc=conceptDoc('mover',{top,accel:2000,outputs:[shooter({elevation:[20,60],moving,fraction:0.8})]});
    return releases(play(arena({docs:[doc],steps:[shoot],goal:[420,60]}),[{concept:'mover',preload:{station:'test-rack',quantity:2}}],10,[[40,60]]).events);
  };
  const slow=run(50,[60,0.6]);
  assert.ok(slow.length>=1);
  assert.ok(slow[0].moving && Math.abs(slow[0].speedInS-50)<1e-6,'fires while passing at 50 in/s');
  assert.equal(slow[0].successFraction,0.6);close(slow[0].points,2*0.6);
  const fast=run(80,[60,0.6]);
  assert.ok(fast.length>=1 && fast.every(e=>e.speedInS<=60+1e-9),'no release above the 60 in/s cap');
  const stopping=run(50,false);
  assert.ok(stopping.length>=1 && stopping.every(e=>e.speedInS===0 && !e.moving),'stops before firing');
  assert.equal(stopping[0].successFraction,0.8);
});

test('ports: storage holds a piece for transferS and caps each piece type separately',()=>{
  const steps=[{operation:'acquire',station:'test-balls'},shoot];
  const run=transferS=>{
    const doc=conceptDoc('feeder',{transferS,inputs:[input('front')],outputs:[shooter({elevation:[20,60]})]});
    const ev=play(arena({docs:[doc],steps,goal:[350,60]}),[{concept:'feeder'}],4,[[200,60]]).events;
    return {got:ev.find(e=>e.operation==='acquire'),shot:releases(ev)[0]};
  };
  const held=run(1);
  assert.ok(held.shot.timeS>=held.got.timeS+1-1e-9 && held.shot.timeS<held.got.timeS+1.15,'released '+(held.shot.timeS-held.got.timeS)+' s after acquisition');
  const quick=run(0);
  assert.ok(quick.shot.timeS-quick.got.timeS<0.5,'control: no transfer delay');
  // Capacity one ball and two cubes: three balls on offer still leave one ball aboard.
  const doc=conceptDoc('sorter',{capacity:{ball:1,cube:2},inputs:[input('front',{pieces:['ball','cube']})]});
  const {sim}=play(arena({docs:[doc],steps:[{operation:'acquire',station:'test-balls'},{operation:'acquire',station:'test-cubes'}],
    balls:[[250,60],[250,90],[250,30]],cubes:[[300,180],[330,180],[360,180]]}),[{concept:'sorter'}],10,[[200,60]]);
  const aboard=sim.game.cargo.B1.map(p=>p.type).sort();
  assert.deepEqual(aboard,['ball','cube','cube']);
});

test('ports: a credited release scores the expected points, and step rates are ignored with a notice',()=>{
  const doc=f=>conceptDoc('half',{outputs:[shooter({fraction:f})]});
  // The step's own dwell and quantity would delay and batch the release; the port's rate governs instead.
  const run=f=>play(arena({docs:[doc(f)],steps:[{...shoot,dwell:1,quantity:3}]}),[{concept:'half',preload}],2,[[240,60]]);
  const half=run(0.5);
  close(half.sim.game.score.blue,1);
  assert.equal(releases(half.events)[0].timeS,0,'released without the step dwell');
  assert.match(half.notes,/success fraction 0\.5/);
  assert.match(half.notes,/ignores the step dwell and quantity/);
  assert.match(half.notes,/B1 concept half · digest [0-9a-f]{64}/);
  // Control: a fraction of 1 matches today's credit for the same target.
  const full=run(1);
  const legacy=play(arena({docs:[],steps:[{...shoot,dwell:0.1}]}),[{preload}],2,[[340,60]]);
  assert.equal(full.sim.game.score.blue,2);assert.equal(legacy.sim.game.score.blue,2);
});

test('ports: a ranged concept scores nothing at a target without an entry region',()=>{
  const run=play(arena({docs:[conceptDoc('blind',{outputs:[shooter()]})],steps:[shoot],entry:null}),[{concept:'blind',preload}],2,[[240,60]]);
  assert.equal(run.sim.game.score.blue,0);
  assert.equal(run.sim.game.cargo.B1.length,1,'the piece stays aboard');
  assert.match(run.notes,/no entry region/);
});

test('ports: an unknown piece radius is reported once the arc check assumes a point piece',()=>{
  // The radius-less ball rack comes before the loose balls, so the radius is the loose balls' 4 in.
  const known=play(arena({docs:[conceptDoc('sized',{outputs:[shooter()]})],steps:[shoot]}),[{concept:'sized',preload}],1,[[240,60]]);
  assert.doesNotMatch(known.notes,/piece radius unknown/);
  const p=arena({docs:[conceptDoc('sized',{outputs:[shooter()]})],steps:[shoot]});
  p.rehearsal.stations=p.rehearsal.stations.filter(s=>s.id!=='test-balls');
  const unknown=play(p,[{concept:'sized',preload}],1,[[240,60]]);
  assert.equal(unknown.notes.match(/B1 piece radius unknown for ball; arc check assumes 0\./g).length,1);
});

test('ports: a place output releases from its stand-off with the face toward the target',()=>{
  const docs=[conceptDoc('placer',{outputs:[placer]})];
  const run=play(arena({docs,steps:[shoot],goal:[300,150],entry:null,points:1}),[{concept:'placer',preload}],4,[[200,150]]);
  const shot=releases(run.events)[0];
  assert.equal(shot.port,'placer');assert.equal(run.sim.game.score.blue,1);
  const face=shot.pose.p[0]+15;
  assert.ok(300-face>=2-1e-6 && 300-face<=6+1e-6,'face point '+face);
  assert.ok(Math.abs(wrapDeg(shot.pose.heading))<=10);
  // A window above the release-height range cannot be served.
  const high=play(arena({docs,steps:[shoot],goal:[300,150],points:1,entry:{centerIn:[300,150,40],kind:'window',widthIn:18,heightIn:12,facingDeg:180,factId:'high'}}),
    [{concept:'placer',preload}],4,[[200,150]]);
  assert.equal(high.sim.game.score.blue,0);assert.match(high.notes,/release height/);
});
