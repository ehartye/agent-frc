import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRotaryHolding} from '../scripts/rotary-holding.mjs';

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
