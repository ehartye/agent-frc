/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { screenHeight } from '../scripts/release-height.mjs';
const sample={units:'m,m/s,m/s²',position:[0,0,1],velocity:[4,0,2],gravity:[0,0,-10],boundingRadius:0.1,
  frame:'world',datum:'mat',contactFree:true,gravityOnly:true};
const target={units:'m',lowerEdge:1.5,uncertainty:0.05,locator:'training card A',frame:'world',datum:'mat',registration:'registered'};
test('screen uses the most favorable edge and preserves the future maximum on descent',() => {
  const up=screenHeight(sample,target);
  assert.equal(up.maximumCenterM,1.2); assert.equal(up.status,'below-lower-edge');
  assert.equal(screenHeight({...sample,velocity:[0,0,-2]},target).maximumCenterM,1);
});
test('height alone cannot establish entry or scoring, including with lateral error',() => {
  const result=screenHeight({...sample,position:[400,400,1]}, {...target,lowerEdge:1.1,registration:'assumed'});
  assert.equal(result.status,'requires-passage-test'); assert.equal(result.score,'unverified');
  assert.equal(result.conditionalOnDatum,true);
});
test('unknowns, contacts and incompatible frames remain distinct',() => {
  assert.equal(screenHeight(sample,{...target,uncertainty:null}).status,'unknown-target-uncertainty');
  assert.equal(screenHeight(sample,{...target,datum:'platform'}).status,'unresolved-registration');
  assert.equal(screenHeight({...sample,contactFree:false},target).status,'unresolved-forces');
  assert.throws(()=>screenHeight({...sample,units:'in'},target),/metric/);
});
