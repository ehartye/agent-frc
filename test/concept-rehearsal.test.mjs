/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
  // The robot started facing the piece (heading 0); it turned to present its back.
  assert.ok(Math.abs(wrapDeg(back.contact.heading-0))>10,'turned from 0 to '+back.contact.heading);
  assert.ok(Math.abs(wrapDeg(back.contact.heading-180))<=45,'back toward the piece: heading '+back.contact.heading);
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

// A window at [360,120] facing east. The robot starts behind it to the north, at [260,240], so its route to the
// stop in front of the window passes poses inside the band. The 38 x 32 in opening leaves 30 x 24 in round a 4 in ball.
// Three preloaded balls; moving shots score 0.6, stationary 0.8.
const passWindow={centerIn:[360,120,60],kind:'window',widthIn:38,heightIn:32,facingDeg:0,factId:'pass-window'};
function passThrough(top,moving){
  const doc=conceptDoc('mover',{top,accel:2000,rotation:360,capacity:{ball:3},outputs:[shooter({elevation:[20,60],moving,fraction:0.8})]});
  return releases(play(arena({docs:[doc],steps:[shoot],goal:[360,120],entry:passWindow}),
    [{concept:'mover',preload:{station:'test-rack',quantity:3}}],10,[[260,240]]).events);
}

test('ports: firing while moving obeys its speed cap and fraction; without it the robot stops first',()=>{
  const run=passThrough;
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

test('ports: the moving-fire capability never delays the first release and keeps the stationary stop',()=>{
  const moving=passThrough(50,[60,0.6]),still=passThrough(50,false);
  assert.ok(moving[0].timeS<=still[0].timeS+1e-9,'first release '+moving[0].timeS+' s with the capability, '+still[0].timeS+' s without');
  // Both stop at the same near-edge pose; the capable shooter adds only the releases on the way.
  const stop=list=>list.filter(e=>!e.moving).map(e=>e.pose.p.map(v=>Math.round(v*1000)/1000).join(','));
  assert.ok(stop(moving).length>=1);
  assert.deepEqual([...new Set(stop(moving))],[...new Set(stop(still))]);
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

test('ports: a concept robot keeps scoring in Main play while its source has stock; an exhausted source is a genuine idle',()=>{
  // The training shuttle loops a fixed blue rack (6 tiles, no returns) into the blue bay, in both periods.
  const doc=JSON.parse(readFileSync(new URL('../examples/concept-bots/turret-shooter.json',import.meta.url)));
  const match=(stock,concept)=>{
    const p=structuredClone(training);
    p.rehearsal.stations.find(s=>s.id==='blue-supply').stock=stock;
    p.rehearsal.concepts=[{document:doc,record:compileConceptBot(applyProfileDefaults(doc,p))}];
    const engine=createFieldRehearsal(p);
    const roster=engine.completeRoster(engine.startingRoster().map(r=>r.id==='B1'?
      {...r,...(concept?{concept:'turret-shooter'}:{}),plans:{Opening:'shuttle','Main play':'shuttle'}}:r));
    const sim=engine.create(roster);
    sim.paused=false;engine.advance(sim,20);engine.nextPhase(sim);sim.paused=false;engine.advance(sim,60);
    const of=(phase,outcome)=>sim.game.events.filter(e=>e.robot==='B1' && e.phase===phase && e.outcome===outcome).length;
    return {opening:of('Opening','credited'),main:of('Main play','credited'),emptyMain:of('Main play','empty-or-full'),left:sim.game.stock['blue-supply'].length};
  };
  // With ample stock the concept robot scores again after the period boundary, as the legacy control does.
  const ample=match(40,true),control=match(40,false);
  assert.ok(ample.opening>0 && ample.main>0,'concept scored '+ample.opening+' then '+ample.main);
  assert.ok(control.main>0,'legacy control scored '+control.main+' in Main play');
  // With the training stock, the faster concept robot empties the rack in Opening; Main play finds it empty.
  const training6=match(6,true);
  assert.equal(training6.opening,6);assert.equal(training6.left,0);
  assert.equal(training6.main,0);assert.ok(training6.emptyMain>0,'Main play reports the empty rack');
});

test('ports: a step without an outcome leaves a concept release unresolved, as for a legacy robot',()=>{
  const step={operation:'attempt',station:'test-goal'};
  const concept=play(arena({docs:[conceptDoc('plain',{outputs:[shooter()]})],steps:[step]}),[{concept:'plain',preload}],2,[[240,60]]);
  const legacy=play(arena({docs:[],steps:[{...step,dwell:0.1}]}),[{preload}],2,[[340,60]]);
  const outcome=run=>run.events.filter(e=>e.operation==='attempt').map(e=>e.outcome);
  assert.deepEqual(outcome(concept),['unresolved']);assert.deepEqual(outcome(legacy),['unresolved']);
  assert.equal(concept.sim.game.score.blue,0);
});

test('ports: a fixed rack hands stock only to an input face turned toward it',()=>{
  // The training rack at [60,48]; the robot starts at [90,48] facing north (90 degrees).
  const tile=face=>conceptDoc(face+'-tile',{capacity:{tile:2},inputs:[input(face,{pieces:['tile']})]});
  const rack=[60,48],steps=[{operation:'acquire',station:'blue-supply',at:rack}];
  for(const face of ['back','front']){
    const got=play(arena({docs:[tile(face)],steps}),[{concept:face+'-tile',heading:90}],4,[[90,48]]).events.find(e=>e.operation==='acquire' && e.outcome==='acquired');
    assert.equal(got.port,face+'-in');
    const toward=Math.atan2(rack[1]-got.pose.p[1],rack[0]-got.pose.p[0])*180/Math.PI;
    assert.ok(Math.abs(wrapDeg(got.pose.heading-toward-(face==='back'?180:0)))<=10,face+' face: heading '+got.pose.heading+' for bearing '+toward);
  }
  // Control: inside a rack radius, a front face that must turn 90 degrees but turns at only 1 deg/s is never
  // aligned in 2 s, so it takes nothing; the same robot turning at 180 deg/s takes.
  const turning=rotation=>{
    const p=arena({docs:[conceptDoc('front-ball',{rotation,inputs:[input('front')]})],steps:[{operation:'acquire',station:'side-rack',at:[250,60]}]});
    p.rehearsal.stations.push({id:'side-rack',label:'Side rack',kind:'retrieval',side:'both',piece:'ball',at:[250,60],radiusIn:16,stock:3});
    return play(p,[{concept:'front-ball',heading:90}],2,[[240,60]]);
  };
  assert.equal(turning(1).events.filter(e=>e.outcome==='acquired').length,0);
  assert.ok(turning(180).events.some(e=>e.outcome==='acquired'));
});

test('ports: an input that need not stop collects on the move and finishes sooner',()=>{
  const balls=[[250,60],[290,60],[330,60]];
  const run=requiresStop=>{
    const doc=conceptDoc('sweeper',{capacity:{ball:3},inputs:[input('front',{requiresStop,secondsPerPiece:q(0.3)})]});
    return play(arena({docs:[doc],steps:[{operation:'acquire',station:'test-balls'}],balls}),[{concept:'sweeper'}],8,[[200,60]])
      .events.filter(e=>e.operation==='acquire' && e.outcome==='acquired');
  };
  const stopping=run(true),rolling=run(false);
  assert.equal(stopping.length,3);assert.equal(rolling.length,3);
  assert.ok(stopping.every(e=>e.speedInS===0),'requiresStop acquires at rest');
  assert.ok(rolling.every(e=>e.speedInS>0),'speeds at contact '+rolling.map(e=>e.speedInS));
  const done=list=>Math.max(...list.map(e=>e.timeS));
  assert.ok(done(stopping)-done(rolling)>3*dt,'finished '+done(rolling)+' s rolling against '+done(stopping)+' s stopping');
});

test('ports: a ranged release leaves from the output face, which stays in front of the window',()=>{
  // A low window facing east at [400,60]. The robot starts with its centre 12 in in front: its face would be past the plane.
  const low={centerIn:[400,60,30],kind:'window',widthIn:30,heightIn:24,facingDeg:0,factId:'low-window'};
  const faceOf=(e,face)=>{const a=(e.pose.heading+(face==='back'?180:0))*Math.PI/180;return [e.pose.p[0]+15*Math.cos(a),e.pose.p[1]+15*Math.sin(a)];};
  for(const face of ['front','back']){
    const doc=conceptDoc(face+'-shot',{outputs:[{...shooter({elevation:[20,60]}),face}]});
    const shots=releases(play(arena({docs:[doc],steps:[shoot],goal:[400,60],entry:low}),[{concept:face+'-shot',heading:180,preload}],4,[[412,60]]).events);
    assert.ok(shots.length>=1,face+' shooter released');
    for(const e of shots){
      const f=faceOf(e,face);
      assert.ok(f[0]>400,face+' face at x '+f[0]+' is past the window plane');
      assert.deepEqual(e.pose.releaseIn.map(v=>Math.round(v*1e6)/1e6),[...f,22].map(v=>Math.round(v*1e6)/1e6),'released from the '+face+' face');
      const toward=Math.atan2(60-e.pose.p[1],400-e.pose.p[0])*180/Math.PI;
      assert.ok(Math.abs(wrapDeg(e.pose.heading+(face==='back'?180:0)-toward))<=3,face+' face aimed at the window');
    }
  }
});

test('ports: a robot that cannot turn where it stands drives clear first, then turns',()=>{
  // The example placer leaves the training bay beside the West pedestal facing away from the rack. Its circle
  // meets the pedestal there, so it must drive out at its present heading before it turns back to the rack.
  const doc=JSON.parse(readFileSync(new URL('../examples/concept-bots/front-intake-placer.json',import.meta.url)));
  const p=structuredClone(training);
  p.rehearsal.concepts=[{document:doc,record:compileConceptBot(applyProfileDefaults(doc,p))}];
  const engine=createFieldRehearsal(p);
  const roster=engine.completeRoster(engine.startingRoster().map(r=>r.id==='B1'?{...r,concept:doc.id,plans:{Opening:'shuttle','Main play':'shuttle'}}:r));
  const sim=engine.create(roster);
  sim.paused=false;engine.advance(sim,20);engine.nextPhase(sim);sim.paused=false;engine.advance(sim,60);
  const b1=sim.robots.find(r=>r.id==='B1');
  assert.equal(sim.game.events.filter(e=>e.robot==='B1' && e.outcome==='credited').length,6,'all six rack tiles placed');
  assert.ok(b1.wait*dt<1,'waited '+b1.wait*dt+' s: '+b1.blocked);
});

// Hardening 2. A concept robot's speed may change by at most accelInS2·dt per tick, except when a move is blocked.
function speedTrace(engine,sim,seconds,id='B1'){
  const trace=[];
  for(let t=0;t<Math.round(seconds/dt);t++){engine.advance(sim,dt);const r=sim.robots.find(x=>x.id===id);trace.push({t:sim.ticks*dt,v:r.currentSpeedInS,blocked:r.blocked});}
  return trace;
}
function assertAccelLimited(trace,accel,why){
  let prev=0;
  for(const {t,v,blocked} of trace){
    if(!/Occupied by/.test(blocked))assert.ok(Math.abs(v-prev)<=accel*dt+1e-6,why+': speed '+prev+' -> '+v+' at '+t+' s');
    prev=v;
  }
}
// The ring at [340,60] is 80 in high; at 300-305 in/s and a fixed 45 degrees its band runs 117-151 in from the face.
const narrowShooter=turret=>{const s=shooter({elevation:[45,45],turret});s.ranged.launchSpeedInS=span(300,305);return s;};

test('ports: a turret shooter places its goal for the heading it will hold and fires no later than a fixed one',()=>{
  const docs=[conceptDoc('turret',{outputs:[narrowShooter([-90,90,360])]}),conceptDoc('fixed',{outputs:[narrowShooter(null)]})];
  const two={station:'test-rack',quantity:2};
  for(const heading of [0,-30,-60,-85]){
    const first=id=>releases(play(arena({docs,steps:[shoot]}),[{concept:id,heading,preload:two}],8,[[100,60]]).events)[0];
    const turret=first('turret'),fixed=first('fixed');
    assert.ok(fixed,'fixed shooter released from heading '+heading);
    assert.ok(turret,'turret shooter released from heading '+heading);
    assert.ok(turret.timeS<=fixed.timeS+1e-9,'heading '+heading+': turret '+turret.timeS+' s, fixed '+fixed.timeS+' s');
  }
});

test('ports: a fixed shooter inside its band turns before it judges the arc',()=>{
  const docs=[conceptDoc('fixed',{outputs:[narrowShooter(null)]})];
  for(const heading of [0,-90,180]){
    const p=arena({docs,steps:[shoot]});p.rehearsal.starts[0]=[190,60];
    const engine=createFieldRehearsal(p);
    const sim=engine.createProbe([{...engine.defaults('blue',1),plans:{Opening:'trial','Main play':'trial'},concept:'fixed',heading,preload}]);
    sim.paused=false;
    assertAccelLimited(speedTrace(engine,sim,4),250,'heading '+heading);
    assert.equal(releases(sim.game.events).length,1,'heading '+heading+': '+sim.game.notices.join(' | '));
  }
});

test('ports: a rolling collection keeps moving through each capture within its acceleration, and logs in time order',()=>{
  const doc=conceptDoc('sweeper',{capacity:{ball:3},inputs:[input('front',{requiresStop:false,secondsPerPiece:q(0.3)})]});
  const p=arena({docs:[doc],steps:[{operation:'acquire',station:'test-balls'}],balls:[[250,60],[290,60],[330,60]]});
  p.rehearsal.starts[0]=[200,60];
  const engine=createFieldRehearsal(p);
  const sim=engine.createProbe([{...engine.defaults('blue',1),plans:{Opening:'trial','Main play':'trial'},concept:'sweeper'}]);
  sim.paused=false;
  const trace=speedTrace(engine,sim,4);
  assertAccelLimited(trace,250,'rolling collection');
  const got=sim.game.events.filter(e=>e.operation==='acquire' && e.outcome==='acquired');
  assert.equal(got.length,3);
  for(const e of got){
    const at=trace.find(x=>Math.abs(x.t-e.startedS-dt)<1e-9);
    assert.ok(e.speedInS>0 && at.v>0,'moving through the capture at '+e.startedS+' s');
    // Logged on the tick the piece lands aboard, secondsPerPiece after contact.
    assert.ok(e.timeS>=e.startedS+0.3-1e-9 && e.timeS<e.startedS+0.3+dt+1e-9,'landed at '+e.timeS+' for contact at '+e.startedS);
  }
  for(let i=1;i<sim.game.events.length;i++)assert.ok(sim.game.events[i].timeS>=sim.game.events[i-1].timeS-1e-9,'event times in order at '+i);
});

test('ports: the first output that can serve the target is used',()=>{
  // The placer's 10-20 in release height cannot reach the ring 80 in up; the shooter listed second can.
  const doc=conceptDoc('both',{outputs:[{...placer,id:'low-placer'},shooter()]});
  const run=play(arena({docs:[doc],steps:[shoot]}),[{concept:'both',preload}],2,[[240,60]]);
  assert.deepEqual(releases(run.events).map(e=>e.port),['shooter']);
  assert.equal(run.sim.game.score.blue,2);
});

test('ports: a place output that need not stop records a release on the move as moving',()=>{
  const rolling={...placer,requiresStop:false};
  const run=play(arena({docs:[conceptDoc('placer',{outputs:[rolling]})],steps:[shoot],goal:[300,150],entry:null,points:1}),[{concept:'placer',preload}],4,[[200,150]]);
  const shot=releases(run.events)[0];
  assert.ok(shot.speedInS>0,'released at '+shot.speedInS+' in/s');
  assert.equal(shot.moving,true);assert.equal(shot.successFraction,1);
});

test('ports: a concept robot sharing a rack is never held for ever by a turn another robot blocks',()=>{
  // B1 and B2 both shuttle the blue rack (40 tiles) into the blue bay in both periods. A concept B1 standing at the
  // rack must turn to shoot, and its circumscribed circle meets B2 queuing behind it, which waits for B1 to leave.
  const doc=JSON.parse(readFileSync(new URL('../examples/concept-bots/fixed-shooter.json',import.meta.url)));
  const match=concept=>{
    const p=structuredClone(training);
    p.rehearsal.stations.find(s=>s.id==='blue-supply').stock=40;
    p.rehearsal.concepts=[{document:doc,record:compileConceptBot(applyProfileDefaults(doc,p))}];
    const engine=createFieldRehearsal(p),shuttle={Opening:'shuttle','Main play':'shuttle'};
    const roster=engine.completeRoster(engine.startingRoster().map(r=>r.id==='B1'?{...r,...(concept?{concept:doc.id}:{}),plans:shuttle}:r.id==='B2'?{...r,plans:shuttle}:r));
    const sim=engine.create(roster);
    sim.paused=false;engine.advance(sim,20);
    const opening=sim.robots.find(r=>r.id==='B1').travelIn;
    engine.nextPhase(sim);sim.paused=false;engine.advance(sim,60);
    const credited=phase=>sim.game.events.filter(e=>e.robot==='B1' && e.phase===phase && e.outcome==='credited').length;
    return {opening,main:sim.robots.find(r=>r.id==='B1').travelIn,credited:[credited('Opening'),credited('Main play')]};
  };
  const concept=match(true);
  assert.ok(concept.opening>50,'concept B1 travelled '+concept.opening+' in during Opening');
  assert.ok(concept.credited[0]>0 && concept.credited[1]>0,'concept B1 credited '+concept.credited.join(' then '));
  // Control: two legacy robots on the same shuttle jam each other at the rack in this profile's report-only mode.
  const legacy=match(false);
  assert.equal(legacy.main,0);assert.deepEqual(legacy.credited,[0,0]);
});

test('ports: a rolling intake collects a tight row without ploughing pieces it cannot take yet',()=>{
  // Balls 12 in apart and a 1 s port interval: the robot reaches the next ball while the port is still busy.
  const balls=[[250,60],[262,60],[274,60],[286,60]];
  const doc=conceptDoc('plough',{capacity:{ball:4},inputs:[input('front',{requiresStop:false,secondsPerPiece:q(1)})]});
  const run=play(arena({docs:[doc],steps:[{operation:'acquire',station:'test-balls'}],balls}),[{concept:'plough'}],10,[[200,60]]);
  const got=run.events.filter(e=>e.operation==='acquire' && e.outcome==='acquired');
  assert.equal(got.length,4,'collected '+got.length+': '+run.sim.robots[0].action);
  // No piece is pushed more than a small distance before it is taken.
  for(const e of got){
    const from=balls.find(b=>Math.hypot(b[0]-e.contact.position[0],b[1]-e.contact.position[1])<=Math.min(...balls.map(c=>Math.hypot(c[0]-e.contact.position[0],c[1]-e.contact.position[1])))+1e-9);
    const moved=Math.hypot(from[0]-e.contact.position[0],from[1]-e.contact.position[1]);
    assert.ok(moved<=6,e.pieces[0]+' moved '+moved.toFixed(1)+' in before capture');
  }
});

test('ports: a port interval runs on the match clock across the period boundary',()=>{
  // A shooter that fires just before Opening ends must not find its port busy far into Main play.
  const doc=conceptDoc('late',{outputs:[shooter()]});
  const p=arena({docs:[doc],steps:[{operation:'attempt',station:'test-goal',outcome:'credited'}]});
  const shot={label:'Shoot',frame:'field',at:[340,60],...shoot};
  p.rehearsal.programs.trial={label:'Trial',steps:[{label:'Wait',frame:'field',at:[240,60],dwell:9.9},shot],byPeriod:{'Main play':[shot]}};
  p.rehearsal.starts[0]=[240,60];
  const engine=createFieldRehearsal(p);
  const sim=engine.createProbe([{...engine.defaults('blue',1),plans:{Opening:'trial','Main play':'trial'},concept:'late',preload:{station:'test-rack',quantity:2}}]);
  sim.paused=false;engine.advance(sim,20);engine.nextPhase(sim);sim.paused=false;engine.advance(sim,12);
  const shots=releases(sim.game.events);
  assert.equal(shots[0].phase,'Opening');
  const second=shots.find(e=>e.phase==='Main play');
  assert.ok(second && second.timeS<1,'second shot at '+(second?.timeS)+' s into Main play');
});

test('ports: under yield, a concept robot and a legacy robot holding each other give way and move on',()=>{
  // The invented concept-study field, context "screened": B1 cycles a rack to a ring while the legacy R2 screens
  // the blue lane. A placer accelerating at 150 in/s2 meets R2 head-on; each waits for the other.
  // Frozen copy of examples/concept-study/field.json as committed in a52c797, so the example can change freely.
  const study=JSON.parse(readFileSync(new URL('./fixtures/concept-yield-field.json',import.meta.url)));
  const doc=JSON.parse(readFileSync(new URL('../examples/concept-bots/front-intake-placer.json',import.meta.url)));
  doc.id='slow-placer';doc.drive.accelInS2.value=150;
  const main=waitCycles=>{
    const p=structuredClone(study);
    if(waitCycles)p.rehearsal.waitCycles=waitCycles;else delete p.rehearsal.waitCycles;
    p.rehearsal.concepts=[{document:doc,record:compileConceptBot(applyProfileDefaults(doc,p))}];
    const engine=createFieldRehearsal(p),match=p.rehearsal.series.matches.find(m=>m.id==='screened');
    const roster=match.roster.map(r=>r.side==='blue' && r.slot===1?{...r,concept:doc.id}:r);
    const sim=engine.create(engine.completeRoster(roster),match.setup,match.tieWinner,match.endgameAtRestAfterS,match);
    sim.paused=false;engine.advance(sim,engine.elapsedSeconds('Opening'));engine.nextPhase(sim);
    sim.paused=false;engine.advance(sim,engine.elapsedSeconds('Main play'));
    const robot=id=>sim.robots.find(r=>r.id===id);
    return {B1:robot('B1'),R2:robot('R2'),credited:sim.game.events.filter(e=>e.robot==='B1' && e.phase==='Main play' && e.outcome==='credited').length};
  };
  const yielded=main('yield');
  for(const id of ['B1','R2'])assert.ok(yielded[id].wait*dt<30 && yielded[id].travelIn>500,id+' waited '+yielded[id].wait*dt+' s, travelled '+yielded[id].travelIn+' in');
  assert.ok(yielded.credited>0,'B1 scored in Main play');
  // Control: without yield the same pair stays held for most of Main play.
  const held=main(undefined);
  assert.ok(held.B1.wait*dt>40,'report-only B1 waited '+held.B1.wait*dt+' s');
});

test('ports: beside a wall a front face that must turn makes room, turns and acquires; boxed in, it waits',()=>{
  // The robot starts inside a rack radius 19 in from the south wall facing north. Its circle (21.2 in) meets the wall,
  // so it cannot turn there: it drives clear, turns its front to the rack and takes stock.
  const beside=pocket=>{
    const p=arena({docs:[conceptDoc('front-ball',{inputs:[input('front')]})],steps:[{operation:'acquire',station:'side-rack',at:[250,19]}]});
    p.rehearsal.stations.push({id:'side-rack',label:'Side rack',kind:'retrieval',side:'both',piece:'ball',at:[250,19],radiusIn:16,stock:3});
    // Control: a 36 in pocket of three blocks lets the robot reach its rack goal but leaves no pose where its 42.4 in
    // circle is clear, so it cannot make room and waits with the turn blocked, as before make-room existed.
    if(pocket)p.rehearsal.obstacles.push(
      {name:'Pocket west',poly:[[206,0],[222,0],[222,60],[206,60]],lower:0,kind:'test'},
      {name:'Pocket east',poly:[[258,0],[274,0],[274,60],[258,60]],lower:0,kind:'test'},
      {name:'Pocket roof',poly:[[206,36],[274,36],[274,60],[206,60]],lower:0,kind:'test'});
    // Run in Main play, so the opening-task allocation does not stand in for the physics being tested.
    p.rehearsal.starts[0]=[240,19];
    const engine=createFieldRehearsal(p);
    const sim=engine.createProbe([{...engine.defaults('blue',1),plans:{Opening:'hold','Main play':'trial'},concept:'front-ball',heading:90}]);
    sim.paused=false;engine.advance(sim,engine.elapsedSeconds('Opening'));engine.nextPhase(sim);sim.paused=false;engine.advance(sim,3);
    return {sim,events:sim.game.events};
  };
  const open=beside(false),got=open.events.find(e=>e.outcome==='acquired');
  assert.ok(got,'acquired after making room: '+open.sim.robots[0].action);
  const toward=Math.atan2(19-got.pose.p[1],250-got.pose.p[0])*180/Math.PI;
  assert.ok(Math.abs(wrapDeg(got.pose.heading-toward))<=10,'front toward the rack: heading '+got.pose.heading);
  const boxed=beside(true);
  assert.equal(boxed.events.filter(e=>e.outcome==='acquired').length,0);
  assert.equal(boxed.sim.robots[0].heading,90);
  assert.match(boxed.sim.robots[0].blocked,/Occupied by (South guardrail|Pocket)/);
});

test('ports: every piece is in exactly one place, and a floor piece never jumps',()=>{
  // A rolling intake (pieces in flight for secondsPerPiece) and a ring shooter cycle a floor row with returns, so pieces
  // leave the floor, fly aboard, score and come back. Each tick every piece has one custody, and every floor piece
  // matches its station's stock and moves continuously.
  const doc=conceptDoc('cycler',{capacity:{ball:3},transferS:0.3,inputs:[input('front',{requiresStop:false,secondsPerPiece:q(0.5)})],
    outputs:[shooter({elevation:[20,60]})]});
  const p=arena({docs:[doc],steps:[{operation:'acquire',station:'test-balls'},shoot],balls:[[250,60],[262,60],[274,60],[286,60],[250,90]]});
  const goal=p.rehearsal.stations.find(s=>s.id==='test-goal');
  goal.returns={credited:{station:'test-balls',at:[300,100],delayS:1}};
  p.rehearsal.programs.trial.loop=true;
  p.rehearsal.starts[0]=[200,60];
  const engine=createFieldRehearsal(p);
  const sim=engine.createProbe([{...engine.defaults('blue',1),plans:{Opening:'trial','Main play':'trial'},concept:'cycler'}]);
  sim.paused=false;
  const ids=[...Array(5)].map((_,i)=>'test-balls/'+(i+1));
  let last=null;
  for(let tick=0;tick<200;tick++){
    engine.advance(sim,dt);
    const g=sim.game,where={};
    const add=(id,place)=>{if(!ids.includes(id))return;(where[id]??=[]).push(place);};
    for(const [station,list] of Object.entries(g.stock))for(const piece of list)add(piece.id,'stock:'+station);
    for(const [robot,list] of Object.entries(g.cargo))for(const piece of list)add(piece.id,'cargo:'+robot);
    for(const entry of g.concept.B1.landing ?? [])add(entry.cargo.id,'landing');
    for(const entry of g.returning)add(entry.piece.id,'returning');
    for(const piece of g.terminal)add(piece.id,'terminal');
    for(const id of ids)assert.equal(where[id]?.length,1,id+' at '+(sim.ticks*dt).toFixed(2)+' s is in '+JSON.stringify(where[id]));
    const floor=new Map(g.motion.pieces.filter(x=>ids.includes(x.id)).map(x=>[x.id,[...x.p]]));
    for(const id of ids)assert.equal(floor.has(id),where[id][0]==='stock:test-balls',id+' on the floor only while in stock');
    // A piece that was on the floor last tick moves continuously. One coming back from a configured return was not on
    // the floor last tick: that reappearance is the profile's legacy teleport.
    if(last)for(const [id,q] of floor){
      const before=last.get(id);
      if(before)assert.ok(Math.hypot(q[0]-before[0],q[1]-before[1])<=10,id+' jumped '+Math.hypot(q[0]-before[0],q[1]-before[1]).toFixed(1)+' in');
    }
    last=floor;
  }
  assert.ok(sim.game.events.some(e=>e.outcome==='credited'),'pieces scored');
});
