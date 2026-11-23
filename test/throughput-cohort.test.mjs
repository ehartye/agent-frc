/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {deriveRoleDemand} from '../scripts/role-handoff.mjs';
import {simulateFixture} from '../examples/design-methods/role-fixture.mjs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {makeThroughputCohort} from '../examples/design-methods/make-throughput-cohort.mjs';
import {reviewThroughput} from '../scripts/hardening.mjs';
import {evidenceReader} from '../scripts/study-evidence.mjs';

function fixture(t){
  const dir=mkdtempSync(path.join(tmpdir(),'rate-review-'));
  t.after(()=>rmSync(dir,{force:true,recursive:true}));
  const file=makeThroughputCohort(dir),read=evidenceReader(dir),study=read(file);
  return {study,cohort:read(study.cohort),native:id=>read(study.episodes.find(r=>r.id===id).source),
    run:(freeze)=>reviewThroughput(study,read,freeze),read};
}

test('native clock and whole frozen roster retain held-out queue failure and incomplete episodes',t=>{
  const {study,cohort,native,run}=fixture(t);
  assert.equal(run(study.cohort.sha256).independentlyCheckedFreeze,true);
  assert.throws(()=>run('0'.repeat(64)),/freeze digest/);
  assert.deepEqual(run().episodes.map(r=>r.accepted),[3,2,1]);
  assert.equal(run().status,'fail');
  study.episodes.pop();
  assert.deepEqual([run().status,run().requiredRuns,run().qualifiedRuns],['open',3,2]);
  const r=native('busy');
  r.windowS=[100,110];assert.match(run().episodes[1].reason,/clock anchor/);
  r.windowS=[20,30];r.clock=r.clock.filter(v=>v.timeS!==30);
  assert.match(run().episodes[1].reason,/opening or cutoff/);
  cohort.cases.pop();assert.throws(()=>run(),/held-out/);
});

test('truthful independent settings can produce identical observations while renamed or mistyped runs stay open',t=>{
  const {study,cohort,native,run,read}=fixture(t);
  const clear=native('clear'),busy=native('busy');
  cohort.purpose='characterization';cohort.cases.pop();study.episodes.pop();
  busy.events=structuredClone(clear.events);
  assert.equal(run().status,'pass');
  busy.initial.aisleOccupiedS='2';assert.deepEqual([run().status,run().distinctVariations],['open',1]);
  busy.initial.aisleOccupiedS=0;assert.match(run().episodes[1].reason,/parameters/);
  busy.initial.aisleOccupiedS=2;busy.runId=clear.runId;assert.match(run().episodes[1].reason,/reused/);
  busy.runId='distinct';busy.events.find(e=>e.kind==='accept').focalRobot='teammate';assert.equal(run().qualifiedRuns,1);
  busy.events=structuredClone(clear.events);
  busy.events.filter(e=>e.kind==='accept').forEach(e=>{e.station='transfer-table';});
  assert.equal(run().episodes[1].accepted,0);
  const demand=read(cohort.demand);
  demand.anchor={basis:'match-start',offsetS:20};assert.equal(run().qualifiedRuns,2);
  demand.anchor.offsetS=0;assert.equal(run().qualifiedRuns,0);
});

test('a refinement cannot omit baseline starts, tune on its holdout or change the source criterion',t=>{
  const {cohort,run,read}=fixture(t);
  cohort.cases[2].parameters.queueS=2;assert.throws(()=>run(),/held-out setting/);
  cohort.cases[2].parameters.queueS=5;
  const baseline=read(cohort.baseline);
  baseline.cases[0].parameters.queueS=1;assert.throws(()=>run(),/entire original roster/);
  baseline.cases[0].parameters.queueS=0;baseline.demand.sha256='0'.repeat(64);
  assert.throws(()=>run(),/same demand/);
});

test('a Field Lab selection replays the exact robot, stock and station across an offset native clock',t=>{
  const {study,cohort,native,read}=fixture(t);
  const repo=evidenceReader(fileURLToPath(new URL('..',import.meta.url)));
  const selection=JSON.parse(readFileSync(new URL('../examples/design-methods/role-selection.json',import.meta.url)));
  const role=deriveRoleDemand(selection,repo),d=role.identity;
  cohort.demand={path:'role.json',pointer:'',sha256:'1'.repeat(64)};
  cohort.purpose='characterization';cohort.cases.pop();study.episodes.pop();
  const resolve=ref=>ref.path==='role.json'?selection:ref.path.startsWith('examples/')?repo(ref):read(ref);
  const episodes=simulateFixture(role).runs.independent;
  for(const [id,condition] of [['clear','nominal'],['busy','receiver-busy']]){
    const r=native(id),original=episodes[condition].episode;
    Object.assign(r,{criterionId:role.contractKey,criterion:d.criterion,focalRobot:d.focalRobot,
      revision:original.revision,initial:{aisleOccupiedS:original.variation.receiverAvailableS},
      fieldConditions:original.fieldConditions,preloadedPieces:original.preloadedPieces,initialPieces:original.initialPieces,
      windowS:[10,55],events:original.events.map(e=>({...e,timeS:10+e.timeS,criterionId:role.contractKey})),
      clock:[{kind:'match-start',timeS:0},{kind:'phase-start',phase:d.phase,timeS:10},
        {kind:'phase-end',phase:d.phase,timeS:55},{kind:'match-end',timeS:60}].map(e=>({...e,witness:'native clock edge'}))});
    cohort.revision=r.revision;cohort.cases.find(c=>c.id===id).parameters.queueS=r.initial.aisleOccupiedS;
  }
  const run=()=>reviewThroughput(study,resolve);
  assert.deepEqual(run().episodes.map(r=>r.accepted),[5,4]);
  native('clear').initialPieces=['unrelated'];
  assert.match(run().episodes[0].reason,/stock or focal preload/);
});
