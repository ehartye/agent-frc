import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeExercise} from '../examples/design-methods/loaded-route.mjs';
import {digest,evidenceReader} from '../scripts/study-evidence.mjs';
import {reviewLoadedRoute} from '../scripts/loaded-route.mjs';

function setup(t) {
  const root=mkdtempSync(path.join(os.tmpdir(),'ground-roster-'));
  t.after(()=>rmSync(root,{force:true,recursive:true}));
  const pin=makeExercise(root);
  const raw=readFileSync(path.join(root,pin.path));
  assert.equal(digest(raw),pin.sha256);
  return {reg:JSON.parse(raw),read:evidenceReader(root)};
}
test('same physical load and clock can clear or meet the partner on its frozen route',t=>{
  const {reg,read}=setup(t);
  const [clear,occupied]=reviewLoadedRoute(reg,read).findings;
  assert.equal(clear.disposition,'peer-clear-in-frozen-model');
  assert.equal(clear.checkpoints[0].peerRoute,'permitted-through-observation');
  assert.deepEqual(clear.entry.actualFieldIds,['blue-supply/1']);
  assert.equal(occupied.firstConflict.peer,'B2');
  assert.equal(occupied.firstConflict.matchS,3.3);
  assert.equal(occupied.firstConflict.physicalS,1.3);
  assert.deepEqual(occupied.firstConflict.carriedIds,['tile-a']);
  assert.equal(occupied.checkpoints[0].peerRoute,'precluded-by-earlier-conflict');
});
test('sampled motion, an unmatched origin/custody, or a chassis-only envelope cannot close the loaded route',t=>{
  const {reg,read}=setup(t);reg.contexts=reg.contexts.slice(0,1);
  delete reg.motion.centerLaw;
  let result=reviewLoadedRoute(reg,read).findings[0];
  assert.equal(result.clearance,'clear-at-samples');assert.equal(result.disposition,'open');
  reg.motion.centerLaw='/centerLaw';reg.entry.pieceIds={};reg.motion.fieldOriginIn=[1,0];
  assert.throws(()=>reviewLoadedRoute(reg,read),/Recorded field pose differs/);
  delete reg.contexts[0].clock.samples;
  result=reviewLoadedRoute(reg,read).findings[0];
  assert.equal(result.entry.custody,false);assert.equal(result.entry.positionErrorIn,1);assert.equal(result.disposition,'open');
  reg.motion.fieldOriginIn=[0,0];reg.entry.pieceIds={'tile-a':'blue-supply/1'};reg.footprint.scope='chassis-only';
  assert.equal(reviewLoadedRoute(reg,read).findings[0].disposition,'open');
});
test('stale history, wrong time registration and a missing actor cannot produce a matched result',t=>{
  const {reg,read}=setup(t);
  const changed=ref=>{
    const raw=read(ref);if(ref!==reg.baseline)return raw;
    const copy=structuredClone(raw);copy.matches[0].periods[0].robots[0].waitSeconds+=1;return copy;
  };
  assert.throws(()=>reviewLoadedRoute(reg,changed),/did not reproduce/);
  const tamper=ref=>{
    const raw=structuredClone(read(ref));
    if(ref===reg.contexts[0].clock.source)raw.departures[0].samples[20].peers[0].center[0]+=1;
    return raw;
  };
  assert.throws(()=>reviewLoadedRoute(reg,tamper),/Recorded field pose differs/);
  reg.contexts[0].offsetS=2.05;assert.throws(()=>reviewLoadedRoute(reg,read),/clock witness differs/);
  delete reg.contexts[0].clock;
  reg.contexts[0].offsetS=2.001;assert.throws(()=>reviewLoadedRoute(reg,read),/actual rehearsal tick/);
  reg.contexts[0].offsetS=2;reg.focal='reserve';assert.throws(()=>reviewLoadedRoute(reg,read),/focal robot/);
});
test('two clear endpoint poses can still prove an intermediate crossing',t=>{
  const {reg,read}=setup(t);reg.contexts=[reg.contexts[1]];
  const changed=ref=>{
    const raw=structuredClone(read(ref));
    if(ref===reg.motion.source){
      raw.stations=[{seconds:0,center:[90,48],yaw:0,onboard:['tile-a']},
        {seconds:.05,center:[90,180],yaw:0,onboard:['tile-a']}];raw.checks[0].seconds=.05;
    }
    return raw;
  };
  delete reg.contexts[0].clock.samples;
  reg.motion.windowS=[0,.05];
  const result=reviewLoadedRoute(reg,changed).findings[0];
  assert.equal(result.firstConflict.kind,'enclosed-disks-overlap');assert.equal(result.firstConflict.peer,'B2');
  assert.equal(result.disposition,'blocked');assert.equal(result.checkpoints[0].peerRoute,'precluded-by-earlier-conflict');
});
