/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRotaryHolding} from '../scripts/rotary-holding.mjs';
import {dropFlap,makeSeatedStopFixture} from '../examples/design-methods/make-seated-stop-fixture.mjs';

const pose = () => ({id:'loaded',frame:'bench',custody:'jaw grips weight',otherAxesHeld:'rigid jaw',
  originM:[1,2,3],axisUnit:[0,-1,0],intervalRad:[-Math.PI,Math.PI],omissions:[],
  members:[{id:'weight',role:'moving',massKg:2,cgM:[1.5,2,3],basis:'test weight'},
    {id:'motor case',role:'fixed',basis:'mounted to bench'}]});
const review = p => reviewRotaryHolding({schema:'agent-frc/rotary-holding-study@1',source:{pointer:''}},
  () => ({revision:'teaching fixture',gravityMps2:[0,0,-10],poses:[p]})).cases[0];
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-10, a+' vs '+b);

test('Signed gravity changes with pose and mass distribution, including extrema between endpoints', () => {
  const p=pose();
  p.intervalRad=[-7,7];
  const result=review(p);
  near(result.startHoldingNm,10);
  near(result.holdingExtremaNm.min.value,-10);
  near(result.holdingExtremaNm.max.value,10);
  near(result.movingMassKg,2);
  p.members[0].cgM=[1,2,3.5];
  near(review(p).startHoldingNm,0);
  near(review(p).holdingExtremaNm.max.value,10);
  p.axisUnit=[0,0,1];
  near(review(p).holdingExtremaNm.max.value,0);
});
test('Gravity work covers the free stroke and compression with a signed mirrored-axis control', () => {
  const p=pose();
  p.stop={freeRad:-0.1,compressionRad:-0.02};
  const first=review(p).stop;
  near(first.gravityWorkToContactJ,10*Math.sin(.1));
  near(first.meanResistingMagnitudeNmFromRest,10*Math.sin(.12)/.02);
  p.stop.freeRad=-.2;
  assert.ok(review(p).stop.meanResistingMagnitudeNmFromRest>first.meanResistingMagnitudeNmFromRest);
  p.axisUnit=[0,1,0];
  assert.equal(review(p).stop.meanResistingMagnitudeNmFromRest,null);
  p.stop={freeRad:.1,compressionRad:.02};
  near(review(p).stop.meanResistingMagnitudeNmFromRest,first.meanResistingMagnitudeNmFromRest);
  p.intervalRad=[0,.11];
  assert.throws(()=>review(p),/within the interval/);
});
test('Unknown stock stays visible and malformed membership or axis cannot supply demand', () => {
  const p=pose();
  p.omissions=['unknown moving guard'];
  assert.deepEqual(review(p).omissions,p.omissions);
  p.members.push(p.members[0]);
  assert.throws(()=>review(p),/distinct/);
  p.members.pop();
  p.axisUnit=[0,-2,0];
  assert.throws(()=>review(p),/unit axis/);
});

test('The ordinary reader binds the synthetic ledger and reports its controlling signed interval', async () => {
  const {fileURLToPath} = await import('node:url');
  const {readStudy,evidenceReader} = await import('../scripts/study-evidence.mjs');
  const root=fileURLToPath(new URL('../examples/design-methods/',import.meta.url));
  const source=readStudy(root+'/rotary-holding-study.json').value;
  const reader=evidenceReader(root);
  const [row]=reviewRotaryHolding(source,reader).cases;
  near(row.startHoldingNm,10);
  near(row.holdingExtremaNm.min.value,-10);
  near(row.stop.meanResistingMagnitudeNmFromRest,59.85610364445969);
  source.source.sha256='0'.repeat(64);
  assert.throws(()=>reviewRotaryHolding(source,reader),/digest changed/);
});

// Nearly balanced synthetic flap: 2 kg, 15 mm behind and 200 mm above the pivot. Gravity pulls it
// 0.3 N·m away from a negative-direction stop seated at the registered pose.
const balanced = () => ({...pose(),originM:[0,0,0],intervalRad:[-0.01,0.5],
  members:[{id:'flap',role:'moving',massKg:2,cgM:[-0.015,0,0.2],basis:'synthetic nearly balanced flap'}],
  stop:{freeRad:0,compressionRad:-0.002}});
const flapReview = (p, docs={}) => reviewRotaryHolding({schema:'agent-frc/rotary-holding-study@1',source:{pointer:''}},
  ref => ref.path ? docs[ref.path] : ({revision:'teaching fixture',gravityMps2:[0,0,-10],poses:[p]})).cases[0];

test('A stop seated at the registered pose reports custody from gravity alone and loses it without preload', () => {
  const p=balanced();
  near(flapReview(p).startHoldingNm,-0.3);
  const stop=flapReview(p).stop;
  assert.equal(stop.seated,true);
  assert.equal(stop.direction,-1);
  near(stop.gravityWorkToContactJ,0);
  near(stop.restingReactionNm,-0.3);
  near(stop.restingMarginNm.registeredGravity,-0.3);
  near(stop.restingMarginNm.reversedGravity,0.3);
  near(stop.unresolvedAwayFromStopNm,0.3);
  assert.equal(stop.custodyAtRest,'unresolved');
});

test('A preload law holds the seated flap and adds its work toward the stop', () => {
  const p=balanced();
  p.stop.preload={law:'linear',torqueNm:1.0,zeroAtRad:0.2,basis:'synthetic torsion spring'};
  p.stop.compliance={stiffnessNmPerRad:6000,dampingNmSPerRad:40,basis:'synthetic pad'};
  const stop=flapReview(p).stop;
  near(stop.preloadAtContactNm,1.0);
  near(stop.restingReactionNm,0.7);
  near(stop.restingMarginNm.registeredGravity,0.7);
  near(stop.restingMarginNm.reversedGravity,1.3);
  near(stop.unresolvedAwayFromStopNm,0);
  assert.equal(stop.custodyAtRest,'stop');
  near(stop.staticCompressionRad,0.7/6000);
  // The linear law continues through compression: 1.0*(0.2+0.002)/0.2 at the end.
  near(stop.preloadWorkToEndJ,(1.0+1.0*0.202/0.2)/2*0.002);
  assert.equal(stop.downhillThroughout,true);
  assert.ok(Number.isFinite(stop.meanResistingMagnitudeNmFromRest));
  p.stop.preload={law:'constant',torqueNm:0.2,basis:'synthetic constant-force spring'};
  assert.equal(flapReview(p).stop.custodyAtRest,'unresolved');
  near(flapReview(p).stop.restingReactionNm,-0.1);
});

test('Preload contributes to the from-rest mean only through the travel it acts over', () => {
  const p=pose();
  p.stop={freeRad:-0.1,compressionRad:-0.02};
  const bare=review(p).stop;
  p.stop.preload={law:'linear',torqueNm:2,zeroAtRad:-0.05,basis:'short synthetic spring'};
  const sprung=review(p).stop;
  // The spring engages from -0.05 and reaches 2 N·m at contact (-0.1), continuing to -0.12.
  const work=2/0.05*((0.07**2)/2);
  near(sprung.preloadWorkToEndJ,work);
  near(sprung.meanResistingMagnitudeNmFromRest,bare.meanResistingMagnitudeNmFromRest+work/0.02);
});

test('Missing or contradictory stop, preload and compliance records fail closed', () => {
  const bad=[
    s=>{s.compressionRad=0;}, s=>{delete s.compressionRad;}, s=>{s.freeRad=0.001;},
    s=>{s.preload={law:'linear',torqueNm:1,zeroAtRad:-0.1,basis:'x'};},
    s=>{s.preload={law:'linear',torqueNm:1,basis:'x'};},
    s=>{s.preload={law:'constant',torqueNm:-1,basis:'x'};},
    s=>{s.preload={law:'constant',torqueNm:1};},
    s=>{s.preload={law:'cubic',torqueNm:1,basis:'x'};},
    s=>{s.preload={law:'constant',torqueNm:1,zeroAtRad:0.1,basis:'x'};},
    s=>{s.compliance={stiffnessNmPerRad:0,dampingNmSPerRad:1,basis:'x'};},
    s=>{s.compliance={stiffnessNmPerRad:10,dampingNmSPerRad:-1,basis:'x'};},
    s=>{s.compliance={stiffnessNmPerRad:10,dampingNmSPerRad:1};},
    s=>{s.preloadNm=1;},
  ];
  for (const change of bad) {
    const p=balanced();
    change(p.stop);
    assert.throws(()=>flapReview(p),Error,JSON.stringify(p.stop));
  }
});

const triangle = {units:{time:'s',torque:'N·m',angle:'rad'},
  timeS:[0,0.01,0.02,0.5,0.51,0.52], restraintTorqueNm:[0,10,0,0,-2,0]};
const pin = name => ({path:name,sha256:'f'.repeat(64),pointer:''});

test('A recorded stop duty reports peaks, stated sustained windows and opposite demand unresolved by the stop', () => {
  const p=balanced();
  p.stop.history={source:pin('h.json'),windowsS:[0.01,0.1,0.5,1]};
  const duty=flapReview(p,{'h.json':triangle}).stop.duty;
  assert.equal(duty.stopServes,'positive');
  near(duty.directions.positive.peakNm,10);
  near(duty.directions.positive.peakTimeS,0.01);
  const [w10,w100,w500,w1000]=duty.directions.positive.sustained;
  near(w10.meanNm,7.5); near(w10.startS,0.005);
  near(w100.meanNm,1.0);
  near(w500.meanNm,0.2);
  assert.equal(w1000.meanNm,null);
  near(duty.directions.negative.peakNm,2);
  assert.equal(duty.unresolvedByStop,true);
  assert.equal(duty.contact,null);
  const positiveOnly={...triangle,restraintTorqueNm:[0,10,0,0,0,0]};
  assert.equal(flapReview(p,{'h.json':positiveOnly}).stop.duty.unresolvedByStop,false);
});

test('A recorded history needs explicit units, ordered time, windows and complete pose settings', () => {
  const variants=[
    d=>{d.units.torque='lbf·in';}, d=>{delete d.units;}, d=>{d.timeS=[0,0.02,0.01,0.5,0.51,0.52];},
    d=>{d.restraintTorqueNm=d.restraintTorqueNm.slice(1);}, d=>{d.restraintTorqueNm[2]=NaN;},
    d=>{d.angleRad=[0,0,0,0,0,0];},
  ];
  for (const change of variants) {
    const doc=structuredClone(triangle); change(doc);
    const p=balanced(); p.stop.history={source:pin('h.json'),windowsS:[0.1]};
    assert.throws(()=>flapReview(p,{'h.json':doc}),Error,JSON.stringify(doc));
  }
  for (const windowsS of [[],[0],[-0.1],undefined]) {
    const p=balanced(); p.stop.history={source:pin('h.json'),windowsS};
    assert.throws(()=>flapReview(p,{'h.json':triangle}));
  }
});

test('Dynamic controls separate a damped seat, a low-loss rebound and an unpreloaded flap that leaves the stop', () => {
  const run = (preloadNm, history) => {
    const p=balanced();
    if (preloadNm) p.stop.preload={law:'linear',torqueNm:preloadNm,zeroAtRad:0.2,basis:'synthetic torsion spring'};
    p.stop.history={source:pin('h.json'),windowsS:[0.01,0.1],contactToleranceRad:0.0009,
      settle:{targetRad:0,toleranceRad:0.0009}};
    return flapReview(p,{'h.json':history}).stop.duty;
  };
  const damped=run(1,dropFlap({preloadNm:1,dampingNmSPerRad:40}));
  assert.ok(damped.directions.positive.peakNm>damped.directions.positive.sustained[1].meanNm);
  assert.equal(damped.contact.separations,0);
  assert.ok(damped.contact.firstContactS>0);
  assert.ok(Number.isFinite(damped.contact.settleS));
  const lively=run(1,dropFlap({preloadNm:1,dampingNmSPerRad:0.5}));
  assert.ok(lively.contact.separations>=1);
  assert.ok(lively.contact.maxReboundRad>0.0009);
  assert.ok(lively.contact.settleS===null || lively.contact.settleS>damped.contact.settleS);
  const loose=run(0,dropFlap({preloadNm:0,dampingNmSPerRad:40}));
  assert.equal(loose.contact.firstContactS,null);
  assert.equal(loose.contact.settleS,null);
  near(loose.directions.positive.peakNm,0);
});

test('The seated-stop teaching fixture runs through the ordinary CLI with pinned histories', async () => {
  const {mkdtempSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {execFileSync} = await import('node:child_process');
  const {fileURLToPath} = await import('node:url');
  const dir=mkdtempSync(tmpdir()+'/seated-stop-');
  try {
    const study=makeSeatedStopFixture(dir);
    const cli=fileURLToPath(new URL('../scripts/hardening.mjs',import.meta.url));
    const out=JSON.parse(execFileSync(process.execPath,[cli,'rotary',dir+'/'+study]));
    const [loose,held,lively]=out.cases.map(c=>c.stop);
    assert.equal(loose.custodyAtRest,'unresolved');
    assert.equal(held.custodyAtRest,'stop');
    assert.equal(held.duty.contact.separations,0);
    assert.ok(lively.duty.contact.separations>=1);
    assert.equal(loose.duty.contact.firstContactS,null);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
