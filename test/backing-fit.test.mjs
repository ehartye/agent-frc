import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFit } from '../examples/backing-fit/compare.mjs';

const folder = new URL('../examples/backing-fit/', import.meta.url);
const paths = ['expected.json', 'observed.json'].map(name=>fileURLToPath(new URL(name, folder)));
function inputs() { return paths.map(p=>JSON.parse(readFileSync(p, 'utf8'))); }

test('native archives preserve hidden stock, the failed installed predecessor and the reopened replacement', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('compare.mjs', folder)), ...paths], { encoding:'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const {studies, readyForGeometryReview} = JSON.parse(run.stdout);
  assert.equal(readyForGeometryReview, true);
  assert.equal(studies.candidate.status, 'MATERIAL_INTERFERENCE');
  assert.equal(studies.successor.status, 'GEOMETRIC_CHECK_COMPLETE');
  assert.equal(studies.candidate.collisions[0].intersectionMm3, 4000);
  assert.deepEqual(studies.candidate.collisions[0].other, ['old:1','support']);
  assert.equal(studies.successor.expectedBacking, 4);
  assert.equal(studies.successor.recoveredBacking.length, 4);
  assert(studies.successor.recoveredBacking.every(x=>x.display.occurrenceVisible===false));
  assert.equal(studies.successor.pairs.find(x=>x.other[0]==='front:1').opposedPlanarTrimAreaMm2, 2800);
});

const failures = {
  'omitted hidden physical occurrence': r=>r.successor.physical.splice(1,1),
  'unchanged body count with wrong occurrence': r=>{r.successor.physical[1].id[0]='other:1';},
  'temporary visibility change': r=>{r.successor.physical[1].after.occurrenceVisible=true;},
  'coincident planes alone': r=>{delete r.successor.pairs[1].opposedPlanarTrimAreaMm2;},
  'positive normal gap contradicts bearing': r=>{r.successor.pairs[1].minimumDistanceMm=0.0001;},
  'gross area conceals a missing cutout': r=>{r.successor.pairs[1].opposedPlanarTrimAreaMm2=3200;},
  'insufficient finite area': r=>{r.successor.pairs[1].opposedPlanarTrimAreaMm2=1000;},
  'absent Boolean control': r=>{delete r.successor.controls.known1Mm3;},
  'failed Boolean even with a supplied zero': r=>{r.successor.pairs[1].unknown='Boolean failed';},
  'missing clearance pair': r=>r.successor.pairs.pop(),
  'old body silently dropped from candidate': r=>r.candidate.physical.pop(),
  'old body still in successor': r=>r.successor.physical.push(r.candidate.physical.at(-1)),
  'reused archive under successor name': r=>{r.successor.archiveSha256=r.candidate.archiveSha256;},
  'wrong installed position': r=>{r.successor.physical[1].boundsMm[0]+=1;}
};
for (const [name,change] of Object.entries(failures)) test(name,()=>{
  const [plan,receipt]=inputs();
  change(receipt);
  assert.equal(checkFit(plan,receipt).readyForGeometryReview,false);
});

test('positive material exactly at reporting threshold remains visible',()=>{
  const [plan,receipt]=inputs();
  const pair=receipt.successor.pairs[1];
  pair.intersectionMm3=plan.intersectionThresholdMm3;
  const {studies}=checkFit(plan,receipt);
  assert.equal(studies.successor.belowThreshold.length,1);
  assert.equal(studies.successor.collisions.length,0);
});
test('an incomplete set still records a measured collision',()=>{
  const [plan,receipt]=inputs();
  receipt.candidate.physical.splice(1,1);
  const result=checkFit(plan,receipt).studies.candidate;
  assert.equal(result.complete,false);
  assert.equal(result.status,'MATERIAL_INTERFERENCE');
  assert.equal(result.collisions.length,1);
});
test('a cover-only plan cannot request a backing-fit claim',()=>{
  const [plan,receipt]=inputs();
  plan.installed=plan.installed.filter(x=>x.role!=='backing');
  assert.throws(()=>checkFit(plan,receipt),/backing/);
});

test('issued observation pins both executable native source files', () => {
  const [, receipt] = inputs();
  for (const filename of ['geometry.py', 'study.py']) {
    const bytes = readFileSync(new URL(filename, folder));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sourceSha256[filename]);
  }
});
test('a study without replacement retains its installed collision', () => {
  const [plan, receipt] = inputs();
  delete plan.replacement;
  const result = checkFit(plan, receipt);
  assert.equal(result.readyForGeometryReview, false);
  assert.equal(result.studies.candidate.status, 'MATERIAL_INTERFERENCE');
});
test('a threshold above the positive control cannot conceal a collision', () => {
  const [plan, receipt] = inputs();
  plan.intersectionThresholdMm3 = 5000;
  assert.throws(() => checkFit(plan, receipt), /threshold/);
});
