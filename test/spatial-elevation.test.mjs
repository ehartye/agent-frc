import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {reviewElevation} from '../scripts/hardening.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';

const directory=new URL('../examples/design-methods/',import.meta.url);
const input=JSON.parse(readFileSync(new URL('spatial-elevation.json',directory),'utf8'));
const pinned=evidenceReader(fileURLToPath(directory));
const fixture=()=>structuredClone(pinned(input.inventory));
const review=doc=>reviewElevation(input,()=>doc).mechanisms[0];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
const pair=(actual,expected)=>actual.forEach((value,i)=>near(value,expected[i]));

test('diagonal pair removes only the moment perpendicular to the support line',()=>{
  const [center,offAxis,missed]=review(fixture()).cases;
  const weight=20*9.80665;
  pair(center.balance.loads,[(weight+20)/2,(weight+20)/2]);
  pair(center.balance.unbalancedMomentXYNm,[0,0]);
  assert.equal(center.status,'open');
  pair(offAxis.balance.loads,[weight/2,weight/2]);
  pair(offAxis.balance.unbalancedMomentXYNm,[-.06*weight,-.08*weight]);
  pair(offAxis.balance.requiredRestraintReactionXYNm,[.06*weight,.08*weight]);
  assert.equal(offAxis.status,'fail');
  pair(missed.balance.loads,[weight,0]);pair(missed.balance.unbalancedMomentXYNm,[-.4*weight,.3*weight]);
});

test('external signed couples, coordinate origin and support order conserve force and moment',()=>{
  const doc=fixture(),pose=doc.model.cases[1],weight=20*9.80665;
  pose.appliedMomentXYNm=[.06*weight-8,.08*weight+6];
  assert.equal(review(doc).cases[1].status,'open');
  pose.appliedMomentBasis='Independent fixture force couple about its installed axis.';
  const balance=()=>review(doc).cases[1].balance;
  pair(balance().unbalancedMomentXYNm,[0,0]);
  pair(balance().loads,[weight/2-10,weight/2+10]);
  const shift=([x,y])=>[x+9,y-6];
  pose.cgXYM=shift(pose.cgXYM);
  for(const s of doc.model.supports)s.xyM=shift(s.xyM);
  doc.model.supports.reverse();
  pair(balance().loads,[weight/2+10,weight/2-10]);pair(balance().unbalancedMomentXYNm,[0,0]);
});

test('one rated restraint carries only the permitted axis, mode and installed capacity',()=>{
  const doc=fixture(),model=doc.model,support=model.supports[0];
  const rating={unit:'Nm',kind:'allowable-model',direction:'negative',value:25,basis:'Invented installed bending capacity.'};
  support.momentRestraint={axisXY:[.6,.8],basis:'Fixed teaching bracket along the rail.',path:['anchor','member'].map(kind=>({id:kind,kind,ratings:{hold:{...rating}}}))};
  let result=review(doc).cases[1];
  assert.equal(result.restraint.status,'pass');
  assert.equal(result.status,'open'); // Vertical hardware ratings are missing.
  pair(result.balance.unbalancedMomentXYNm,[0,0]);
  near(result.restraint.demandNm,20*9.80665*.1*1.25);
  support.momentRestraint.path[0].ratings.hold.direction='positive';
  assert.equal(review(doc).cases[1].restraint.status,'open');
  support.momentRestraint.path[0].ratings.hold={...rating,value:10};
  assert.equal(review(doc).cases[1].status,'fail');
  support.momentRestraint.axisXY=[1,0];assert.equal(review(doc).cases[1].status,'open');
  // With only one support the Y component remains unbalanced about this X-only bracket.
  assert.equal(review(doc).cases[2].status,'fail');
});

test('an unknown second coordinate, indeterminate support split or unilateral contact loss cannot pass',()=>{
  const doc=fixture(),model=doc.model,pose=model.cases[0];
  pose.cgXYM=[.3,null];assert.equal(review(doc).cases[0].status,'open');
  pose.cgXYM=[1.2,1.6];let result=review(doc).cases[0];assert.equal(result.supports[0].status,'fail');
  model.supports[0].xyM=model.supports[1].xyM;
  assert.equal(review(doc).cases[0].status,'open');
});

test('balanced spatial poses with complete working ratings pass only within the declared mass bound',()=>{
  const doc=fixture(),model=doc.model;
  const teaching=JSON.parse(readFileSync(new URL('fixture-results.json',directory),'utf8')).elevation;
  for(const [i,s] of model.supports.entries())s.path=structuredClone(teaching.supports[i].path);
  model.cases[1].cgXYM=[.36,.48]; // Shift along the rail, leaving no unbalanced rolling moment.
  model.cases[2].cgXYM=[0,0];
  assert.equal(review(doc).status,'pass');
  model.massEvidence='assumed';
  assert.equal(review(doc).status,'open');
});
