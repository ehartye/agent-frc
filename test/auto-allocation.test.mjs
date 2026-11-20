import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateOpeningTasks} from '../scripts/auto-allocation.mjs';
const task=(piece,timeS,station='floor')=>({piece,station,timeS});
const row=(robot,candidates,fallback='hold position')=>({robot,candidates,fallback});

test('a more flexible partner yields the only reachable piece to its teammate',()=>{
  const plans=allocateOpeningTasks([row('B1',[task('near',1),task('far',4)]),
    row('B2',[task('near',3)]),row('B3',[],'preload')]);
  assert.equal(plans.B1.piece,'far');
  assert.equal(plans.B2.piece,'near');
  assert.deepEqual(plans.B3,{fallback:'preload'});
});

test('among assignments reaching all robots, choose the quickest sum without duplicate stock',()=>{
  const plans=allocateOpeningTasks([row('R1',[task('x',2),task('y',3)]),
    row('R2',[task('x',3),task('y',20)])]);
  assert.equal(plans.R1.piece,'y');
  assert.equal(plans.R2.piece,'x');
});

test('scarce shared stock, ties and sparse diagnostic rosters are deterministic',()=>{
  const options=[task('one',1),task('two',1)];
  const rows=['R3','B3','R2','B2','R1','B1'].map(id=>row(id,options,'follow program'));
  const result=allocateOpeningTasks(rows);
  const selected=Object.values(result).filter(v=>v.piece);
  assert.deepEqual(new Set(selected.map(v=>v.piece)),new Set(['one','two']));
  assert.equal(selected.length,2);
  assert.ok(result.B1.piece && result.R1.piece);
  assert.deepEqual(allocateOpeningTasks(rows.toReversed().map(r=>({...r,candidates:r.candidates.toReversed()}))),result);
  assert.deepEqual(allocateOpeningTasks([]),{});
  assert.throws(()=>allocateOpeningTasks([row('A',[task('one',0),task('one',0,'other')])]),/two stations/);
});
