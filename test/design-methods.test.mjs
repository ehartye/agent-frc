import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {compareRoles} from '../scripts/strategy-lab.mjs';
import {reviewConcepts} from '../scripts/design-review.mjs';
import {reviewElevation,reviewThroughput} from '../scripts/hardening.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';

const examples=new URL('../examples/design-methods/',import.meta.url);
const read=id=>JSON.parse(readFileSync(new URL(id+'.json',examples),'utf8'));
const pinned=evidenceReader(fileURLToPath(examples));

test('one focal role changes a complete matched result and the preferred role reverses with traffic',()=>{
  const profile=read('../kickoff/training-field'),study=read('alliance');
  const run=compareRoles(profile,study);
  assert.deepEqual(run.cells.map(c=>c.margin),[0,-4,-6,-5]);
  assert.equal(run.tippingPoints[0].shareOfSecondContext,0.8);
  const congested=run.cells[2],clear=run.cells[0];
  assert.ok(congested.byRobot.find(r=>r.id==='B1').waitS>clear.byRobot.find(r=>r.id==='B1').waitS);
  assert.ok(clear.byRobot.some(r=>r.travelIn>0 && r.acceptedPerSecond>0));
  assert.deepEqual(run.cells[3].roster.filter(r=>r.slot!==1||r.side!=='blue'),congested.roster.filter(r=>r.slot!==1||r.side!=='blue'));
  assert.equal(run.cells[3].endgame.attempts.find(a=>a.robot==='B1').points,1);
  study.contexts[0].peers=[{side:'blue',slot:1}];
  assert.throws(()=>compareRoles(profile,study),/focal/);
});

test('architecture receipts bind the case and source metrics, summing simultaneous resource uses',()=>{
  const input=read('architectures'),result=reviewConcepts(input,pinned);
  assert.deepEqual(result.qualifiedForTheseCases,['separate']);
  const resource=result.concepts[0].cases[1].resources[0];
  assert.equal(resource.margin,-4);assert.deepEqual(resource.activities,['drive','transfer']);
  assert.equal(result.concepts[1].cases[1].resources[0].peak,16);
  const [nominal,adverse]=input.concepts[0].runs;
  adverse.values=nominal.values;
  assert.throws(()=>reviewConcepts(input,pinned),/Metric must belong/);
  adverse.execution=nominal.execution;
  assert.throws(()=>reviewConcepts(input,pinned),/Execution identity/);
  assert.throws(()=>pinned({...nominal.source,sha256:'0'.repeat(64)}),/digest changed/);
});

test('elevation preserves every inventory item and distinguishes rating duty, mass and signed support balance',()=>{
  const input=read('elevation'),doc=structuredClone(pinned(input.inventory));
  const model=doc.elevation, review=()=>reviewElevation(input,()=>doc);
  doc.inventory.push('unmodeled');
  assert.equal(review().mechanisms[1].status,'open');
  const cases=review().mechanisms[0].cases;
  assert.ok(Math.abs(cases[0].supports[0].loadN-40*(9.80665+1)/2)<1e-9);
  assert.equal(cases[2].status,'fail');
  for(const s of model.supports)for(const stage of s.path)for(const cap of Object.values(stage.ratings))cap.value=10000;
  assert.equal(review().mechanisms[0].status,'pass');
  model.supports[0].path[0].ratings['power-loss'].powerState='powered';
  assert.equal(review().mechanisms[0].status,'open');
  model.supports[0].path[0].ratings['power-loss'].powerState='unpowered';
  model.supports[0].path[2].ratings.hold.kind='basic-dynamic';
  assert.equal(review().mechanisms[0].status,'open');
  model.supports[0].path[2].ratings.hold.kind='working-load';
  model.massEvidence='assumed';assert.equal(review().mechanisms[0].status,'open');
  model.cases[1].unavailableSupport='left';
  assert.ok(review().mechanisms[0].cases[1].unsupportedMomentNm<0);
  assert.equal(review().mechanisms[0].cases[1].status,'fail');
});

test('single hanger distinguishes settled pose, unbalanced pose and separately rated moment restraint',()=>{
  const input=read('elevation'),d=structuredClone(pinned(input.inventory)),m=d.elevation;
  m.geometry='single-support';m.supports.splice(1);
  const p=m.cases[0];p.cgXM=0;
  const result=()=>reviewElevation(input,()=>d).mechanisms[0].cases[0];
  assert.equal(result().status,'fail'); // The force exceeds the weakest stage at this design factor.
  for(const c of m.supports[0].path)c.ratings.raise.value=2000;
  assert.equal(result().status,'pass');
  p.cgXM=.1;assert.equal(result().status,'fail');
  assert.ok(Math.abs(result().unsupportedMomentNm-43.2266)<1e-8);
  const rating={unit:'Nm',direction:'positive',value:100,kind:'allowable-model',basis:'invented installed bracket'};
  m.supports[0].momentRestraint={path:['member','anchor'].map(kind=>({id:kind,kind,ratings:{raise:{...rating}}}))};
  assert.equal(result().status,'pass');
  m.supports[0].momentRestraint.path[1].ratings.raise.value=3;
  assert.equal(result().status,'fail');
});

test('rate uses the entire common scoring window, distinctly varied runs, finite arrivals and robot possession',()=>{
  const input=read('throughput'),d=structuredClone(pinned(input.demand)),review=()=>reviewThroughput(input,()=>d);
  const [first,second]=d.episodes;
  assert.equal(review().status,'fail');
  assert.deepEqual(review().episodes.map(r=>r.acceptedPerSecond),[.2,.1]);
  Object.assign(second,structuredClone(first),{runId:'new-label'});
  assert.equal(review().status,'open');
  second.variation={queueS:1}; assert.equal(review().status,'pass');
  second.criterion='Partner received piece';assert.throws(review,/criterion/);second.criterion=first.criterion;
  second.preloadedPieces=['a'];assert.throws(review,/disjoint/);
  second.initialPieces=['b'];second.events.shift();
  assert.equal(review().status,'pass');
  second.events[0].piece='unknown';assert.throws(review,/Accepted piece/);
});

