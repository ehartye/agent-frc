/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reviewPower } from '../scripts/power-review.mjs';

test('declared voltage ceilings cannot silently pass a minimum-voltage review', async t => {
  for (const maxV of [10, null]) {
    const file = await fixture(t, comparison => { comparison.locations[0].maxV = maxV; });
    const run = spawnSync(process.execPath, ['scripts/power-review.mjs', file], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8'
    });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /arm-inlet declares maxV.*minimum voltage only/i);
  }
});

test('final review explains electrical evidence, each current kind and unknown functional outcomes',async t=>{
  const file=await fixture(t,(_,traces)=>{
    traces[0].provenance.kind='measured';
    traces[0].rows[0].currents.push({id:'arm',kind:'phase',valueA:15},{id:'panel',kind:'bus-total',valueA:6});
  });
  const {interpretation}=await reviewPower(file);
  assert.match(interpretation,/together[^.]*measured[^.]*electrical[^.]*violated/i);
  assert.match(interpretation,/staggered[^.]*modeled[^.]*electrical[^.]*complete/i);
  for (const kind of ['measured','modeled']) assert.match(interpretation,new RegExp(kind+' outcome \\(unknown\\)','i'));
  for (const [id,kind,amps] of [['arm','source',4],['pump','source',2],['arm','phase',15],['panel','bus total',6]]) {
    assert.match(interpretation,new RegExp(id+' '+kind+'[^,;.]*?'+amps+' A','i'));
  }
});

test('final review rejects lossy raw clock labels in windows, periods, sample edges and witnesses',async t=>{
  for (const [document,field] of [['manifest','fromS'],['manifest','toS'],['manifest','maxSampleIntervalS'],
      ['trace','fromS'],['trace','toS'],['trace','atS']]) {
    const file=await fixture(t,(c,traces)=>{
      c.window={fromS:1800000000,toS:1800000000};
      c.maxSampleIntervalS=1800000000;
      for(const tr of traces) tr.rows=[row(1800000000,1800000000,9,{
        voltages:[{location:'arm-inlet',kind:'point',valueV:9,atS:1800000000}]})];
    });
    const c=JSON.parse(await readFile(file));
    const input=document==='manifest' ? file : path.join(path.dirname(file),c.trials[0].trace.file);
    const original='"'+field+'":1800000000';
    const source=await readFile(input,'utf8');
    assert.ok(source.includes(original));
    const revised=source.replace(original,original+'.00000001');
    await writeFile(input,revised);
    if(document==='trace') {
      c.trials[0].trace.sha256=createHash('sha256').update(revised).digest('hex');
      await writeFile(file,JSON.stringify(c));
    }
    await assert.rejects(reviewPower(file),/clock.*precision|precision.*clock/i);
  }
});

test('final review accepts equivalent exponent and high precision labels and ignores numbers in strings',async t=>{
  const time=0.12345678901234566;
  const file=await fixture(t,(c,traces)=>{
    c.window={fromS:time,toS:time};
    for(const tr of traces) {
      tr.provenance.source='Literal example: "atS": 1800000000.00000001 with a backslash \\ and a quote ".';
      tr.rows=[row(time,time,9)];
    }
  });
  const source=await readFile(file,'utf8');
  await writeFile(file,source.replaceAll(String(time),'1234567890123456600E-19'));
  assert.deepEqual((await reviewPower(file)).trials.map(v=>v.status),['complete','complete']);
});

test('hardening rejects malformed UTF-8 in comparison and pinned trace bytes',async t=>{
  for (const target of ['manifest','trace']) {
    const file=await fixture(t);
    const c=JSON.parse(await readFile(file));
    const input=target==='manifest' ? file : path.join(path.dirname(file),c.trials[0].trace.file);
    const bytes=await readFile(input);
    const index=bytes.indexOf(target==='manifest' ? 'Stagger the pump' : 'Synthetic fixture');
    assert.ok(index>=0);
    bytes[index]=0xff;
    await writeFile(input,bytes);
    if (target==='trace') {
      c.trials[0].trace.sha256=createHash('sha256').update(bytes).digest('hex');
      await writeFile(file,JSON.stringify(c));
    }
    await assert.rejects(reviewPower(file),/utf-?8/i);
  }
});

test('hardening accepts an exact voltage witness in a wide row only for the requested instant',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.window={fromS:.25,toS:.25};
    c.requiredLoads=[];
    for (const [i,tr] of traces.entries()) tr.rows=[row(0,2,9,{
      voltages:[{location:'arm-inlet',kind:'point',valueV:9,atS:i===0 ? .25 : .5}],currents:[]})];
  });
  const {trials}=await reviewPower(file);
  assert.deepEqual(trials.map(v=>v.status),['complete','incomplete']);
  assert.deepEqual(trials[0].unknowns,[]);
  const c=JSON.parse(await readFile(file));
  c.requiredLoads=['arm'];
  await writeFile(file,JSON.stringify(c));
  assert.equal((await reviewPower(file)).trials[0].status,'incomplete');
});

test('hardening student brief names missing evidence and the assessed fallback',async t=>{
  const file=await fixture(t,(_,traces)=>{
    traces[0].rows[0].currents=[];
    traces[1].outcome={description:'Arm reached the stop',status:'observed-success'};
  });
  const supported=(await reviewPower(file)).interpretation;
  assert.match(supported,/missing coincident source-current coverage for pump/i);
  assert.match(supported,/fallback[^.]*Stagger the pump startup[^.]*supported/i);
  const c=JSON.parse(await readFile(file));
  delete c.fallback.trialId;
  await writeFile(file,JSON.stringify(c));
  assert.match((await reviewPower(file)).interpretation,/fallback[^.]*Stagger the pump startup[^.]*unverified/i);
});

test('hardening cannot certify coarse samples by using absolute clock magnitude as tolerance',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.window={fromS:1e16,toS:1e16+2};
    c.maxSampleIntervalS=1;
    for(const tr of traces) tr.rows=[row(c.window.fromS,c.window.toS,9)];
  });
  const {trials}=await reviewPower(file);
  assert.equal(trials[0].status,'incomplete');
  assert.match(trials[0].unknowns.join(' '),/maximum interval/);
});

test('hardening rejects unrepresentable signed voltage margins before serialization',async t=>{
  for(const sign of [1,-1]) {
    const file=await fixture(t,(c,traces)=>{
      c.locations[0].minV=-sign*Number.MAX_VALUE;
      traces[0].rows[0].voltages[0].valueV=sign*Number.MAX_VALUE;
    });
    await assert.rejects(reviewPower(file),/finite.*margin|margin.*finite/i);
  }
});

test('hardening rejects drive-qualified and rooted trace paths before file access',async t=>{
  const file=await fixture(t);
  const c=JSON.parse(await readFile(file));
  for(const tracePath of ['Q:sample.json','Q:/sample.json','//server/share/sample.json','/sample.json']) {
    c.trials[0].trace.file=tracePath;
    await writeFile(file,JSON.stringify(c));
    await assert.rejects(reviewPower(file),/relative trace file/);
  }
});

const action = {actionId:'position-arm', busId:'panel', clockId:'action-clock'};
const comparison = {schema:'frc-power-comparison/v1', ...action, window:{fromS:0,toS:1},
  maxSampleIntervalS:0.5, requiredLoads:['arm','pump'], locations:[{id:'arm-inlet',minV:8}],
  trials:[{id:'t1',condition:'together'},{id:'t2',condition:'staggered'}],
  fallback:{description:'Stagger the pump startup',trialId:'t2'}};
function row(fromS, toS, valueV, changes={}) {
  return {fromS,toS,voltages:[{location:'arm-inlet',kind:'minimum',valueV}],
    currents:[{id:'arm',kind:'source',valueA:4},{id:'pump',kind:'source',valueA:2}],...changes};
}
function trace(trial) {
  return {schema:'frc-power-trace/v1',...action,trialId:trial.id,condition:trial.condition,
    units:{time:'s',voltage:'V',current:'A'},provenance:{kind:'modeled',source:'Synthetic fixture'},
    rows:[row(0,0.5,trial.id==='t1'?7:9),row(0.5,1,9)]};
}
async function fixture(t, change=()=>{}) {
  const config=structuredClone(comparison), traces=config.trials.map(trace);
  change(config,traces);
  const folder=await mkdtemp(path.join(tmpdir(),'frc-supply-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  for (const [i, trial] of config.trials.entries()) {
    const bytes=JSON.stringify(traces[i]);
    trial.trace={file:'trial-'+i+'.json',sha256:createHash('sha256').update(bytes).digest('hex')};
    await writeFile(path.join(folder,trial.trace.file),bytes);
  }
  const file=path.join(folder,'comparison.json');
  await writeFile(file,JSON.stringify(config));
  return file;
}
test('shared supply compares coincident draws at the limiting endpoint and keeps functional outcome separate',async t=>{
  const file=await fixture(t,(_,traces)=>{
    traces[1].rows[0].currents[1].valueA=0;
    traces[1].outcome={description:'Arm reached its stop',status:'observed-success'};
  });
  const r=await reviewPower(file);
  assert.deepEqual(r.trials.map(x=>x.status),['violated','complete']);
  const first=r.trials[0].limiting;
  assert.equal(first.location,'arm-inlet');
  assert.equal(first.marginV,-1);
  assert.deepEqual(first.currents.map(x=>x.valueA),[4,2]);
  assert.equal(first.fromS,0);
  assert.equal(first.toS,.5);
  assert.equal(r.trials[0].outcome.status,'unknown');
  assert.equal(r.fallback.status,'supported');
  assert.match(r.interpretation,/arm-inlet/);
});
test('one-sided bound below floor and a minimum outside an unlocalized boundary stay inconclusive',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.window={fromS:.25,toS:.75};
    traces[0].rows[0].voltages[0].kind='lower-bound';
    traces[1].rows[0].voltages[0].valueV=7;
  });
  const r=await reviewPower(file);
  assert.deepEqual(r.trials.map(x=>x.status),['incomplete','incomplete']);
  assert.equal(r.fallback.status,'unverified');
});
test('brief distinguishes an observed bus with no threshold from an unobserved terminal and labels modeled outcome',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.locations=[{id:'arm-inlet'},{id:'motor-inlet',minV:8}];
    traces[1].outcome={status:'observed-success',description:'Arm finished the modeled motion'};
  });
  const r=await reviewPower(file);
  assert.match(r.interpretation,/7 V.*no floor.*margin is unknown/i);
  assert.match(r.interpretation,/motor-inlet.*no voltage observation/i);
  assert.match(r.interpretation,/modeled outcome.*Arm finished the modeled motion/i);
});
test('a witnessed low point proves the violation with missing load and missing interval coverage',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.window.fromS=.25;
    traces[0].rows=[row(0,.5,0,{voltages:[{location:'arm-inlet',kind:'point',valueV:6,atS:.3}],
      currents:[{id:'arm',kind:'phase',valueA:20},{id:'panel',kind:'bus-total',valueA:12}]})];
  });
  const r=await reviewPower(file);
  assert.equal(r.trials[0].status,'violated');
  assert.equal(r.trials[0].limiting.atS,.3);
  assert.match(JSON.stringify(r.trials[0].unknowns),/phase/);
  assert.match(JSON.stringify(r.trials[0].unknowns),/pump/);
  assert.match(JSON.stringify(r.trials[0].unknowns),/coverage/i);
});
test('point, sampled bound and oversized bin preserve their appropriate scope',async t=>{
  const p=await fixture(t,(c,traces)=>{
    c.window={fromS:.2,toS:.2};
    for (const tr of traces) tr.rows[0].voltages=[{location:'arm-inlet',kind:'point',valueV:8,atS:.2}];
  });
  assert.equal((await reviewPower(p)).trials[0].status,'complete');
  const q=await fixture(t,(_,traces)=>{
    for (const v of traces[0].rows) v.voltages[0]={location:'arm-inlet',kind:'lower-bound',valueV:8.1};
    traces[1].rows=[row(0,1,9)];
  });
  const r=await reviewPower(q);
  assert.deepEqual(r.trials.map(x=>x.status),['complete','incomplete']);
});
test('tampered, duplicate, incompatible and overlapping trials fail validation',async t=>{
  const file=await fixture(t);
  await writeFile(path.join(path.dirname(file),'trial-0.json'),'{}');
  await assert.rejects(reviewPower(file),/SHA-256/);
  for(const mutate of [
    (c,tr)=>{tr[0].clockId='other';},
    (c,tr)=>{tr[0].units.current='mA';},
    (c,tr)=>{tr[0].rows[1].fromS=.4;},
    (c,tr)=>{tr[0].rows[0].currents.push(tr[0].rows[0].currents[0]);},
    (c,tr)=>{tr[0].rows[0].voltages[0].atS=1;},
    c=>{c.trials[1].id=c.trials[0].id;},
  ]) await assert.rejects(reviewPower(await fixture(t,mutate)));
});
test('an observation without a project floor retains its value but supplies no compliance margin',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.locations[0].minV=null;
    traces[1].outcome={status:'observed-success',description:'Modeled action finished'};
  });
  const r=await reviewPower(file);
  assert.equal(r.trials[0].endpoints[0].lowestEvidence.valueV,7);
  assert.equal(r.trials[0].endpoints[0].lowestEvidence.marginV,null);
  assert.equal(r.trials[0].status,'incomplete');
  assert.equal(r.trials[1].outcome.status,'observed-success');
  assert.equal(r.fallback.status,'unverified');
});
test('a lone low point reports the voltage coverage still missing from the rest of the window',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.requiredLoads=[];
    traces[0].rows=[row(.2,.2,7)];
  });
  const {trials}=await reviewPower(file);
  assert.equal(trials[0].status,'violated');
  assert.match(JSON.stringify(trials[0].unknowns),/voltage coverage/);
});
test('decimal timestamps preserve a declared sampling period at later clock times',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.window={fromS:8.2,toS:8.3};c.maxSampleIntervalS=.1;
    for (const tr of traces) tr.rows=[row(8.2,8.3,9)];
  });
  assert.equal((await reviewPower(file)).trials[0].status,'complete');
});
test('detached fallback, stale evidence, and source totals preserve their separate scopes',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.fallback.trialId='untried';
    traces[0].rows[0].fresh=false;
    traces[1].rows[0].currents=[{id:'panel',kind:'bus-total',valueA:8}];
  });
  const {trials,fallback}=await reviewPower(file);
  assert.deepEqual(trials.map(x=>x.status),['incomplete','incomplete']);
  assert.equal(trials[0].endpoints[0].violation,null);
  assert.match(JSON.stringify(trials[0].unknowns),/Stale/);
  assert.equal(trials[1].endpoints[0].status,'complete');
  assert.match(JSON.stringify(trials[1].unknowns),/arm/);
  assert.equal(fallback.status,'unverified');
});
test('an attained minimum with an in-window witness localizes a boundary failure',async t=>{
  const file=await fixture(t,(c,traces)=>{
    c.window={fromS:.2,toS:.4};
    traces[0].rows[0].voltages[0].atS=.2;
    traces[1].rows[0].voltages[0]={location:'arm-inlet',kind:'point',valueV:7,atS:.4};
  });
  const {trials}=await reviewPower(file);
  assert.deepEqual(trials.map(x=>x.status),['violated','incomplete']);
  assert.equal(trials[0].limiting.atS,.2);
  assert.equal(trials[1].limiting,null);
});
test('public command and classroom routes use the neutral bundled comparison',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const pkg=JSON.parse(await readFile(path.join(root,'package.json')));
  assert.equal(pkg.scripts['power:review'],'node scripts/power-review.mjs');
  const run=spawnSync(process.execPath,['scripts/power-review.mjs','examples/power/comparison.json'],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.voltageAssessment,'minimum-only');
  assert.deepEqual(report.trials.map(x=>x.status),['violated','complete']);
  assert.match(report.interpretation,/complete for the minimum-voltage check/);
  if (await readFile(path.join(root,'.github/pages/guide.mjs')).catch(()=>null)) {
    const {stages}=await import('../.github/pages/guide.mjs');
    for(const id of ['design','verify']) assert.ok(stages.find(s=>s.id===id).docs.some(([,p])=>p==='docs/shared-power-review.md'));
  }
  assert.match(await readFile(path.join(root,'skills/frc-troubleshoot/SKILL.md'),'utf8'),/shared-power-review/);
});
test('the Pages exercise shows the two outcomes produced by the real review',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const build=path.join(root,'.github/pages/build.mjs');
  if (!await readFile(build).catch(()=>null)) return t.skip('Site source is excluded from installed package');
  const folder=await mkdtemp(path.join(tmpdir(),'frc-power-guide-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const run=spawnSync(process.execPath,[build,folder],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const html=await readFile(path.join(folder,'index.html'),'utf8');
  assert.doesNotMatch(html,/[\u00c2\u00e2][^\x00-\x7f]/u, 'Guide contains misdecoded punctuation');
  assert.match(html,/id="power-choice"/);
  assert.match(html,/data-power-trial="overlap"/);
  assert.match(html,/8\.3 V/);
  assert.match(html,/9\.8 V/);
  assert.match(html,/Standard trim<\/strong> gives a 5\.20 V upper bound/);
  assert.match(html,/Raised trim<\/strong> gives a 5\.35 V upper bound\. Upper guarantee lost/);
});

function withCeiling(config, traces) {
  const scope = {location:'arm-inlet', state:'on load release'};
  config.schema = 'frc-power-comparison/v2';
  config.upperRequirements = [{...scope,maxV:10,ratingSource:'Actuator design brief'}];
  for (const trial of traces) {
    trial.schema = 'frc-power-trace/v2';
    trial.upperEvidence = [{...scope,kind:'upper-bound',valueV:10,source:'Transient envelope'}];
    trial.outcome = {description:'Actuator completed travel', status:'observed-success'};
  }
}

test('ceilings distinguish attained excursions, guarantees and single observations when choosing a fallback', async t => {
  for (const [kind, voltage, status] of [
    ['maximum',11,'violated'], ['maximum',10,'complete'], ['upper-bound',11,'incomplete'],
    ['upper-bound',10,'complete'], ['point',11,'violated'], ['point',10,'incomplete']
  ]) {
    const file = await fixture(t, (config, traces) => {
      withCeiling(config,traces);
      Object.assign(traces[1].upperEvidence[0], {kind,valueV:voltage});
    });
    const report = await reviewPower(file);
    const trial = report.trials[1];
    assert.equal(report.schema,'frc-power-review/v2');
    assert.equal(trial.minimumStatus,'complete');
    assert.equal(trial.status,status);
    assert.equal(trial.upper[0].status,status);
    assert.equal(trial.upper[0].marginV,10-voltage);
    assert.equal(report.fallback.status,status === 'complete' ? 'supported' : 'unverified');
    assert.equal(report.trials[0].status,'violated');
  }
});

test('unknown rating, stale evidence and absent operating states leave ceiling coverage unresolved', async t => {
  const file = await fixture(t, (config,traces) => {
    withCeiling(config,traces);
    const requirement = config.upperRequirements[0];
    config.upperRequirements.push({...requirement,state:'startup'}, {...requirement,location:'second-inlet',maxV:null});
    const record = traces[1].upperEvidence[0];
    traces[1].upperEvidence.push({...record,location:'second-inlet'});
    record.fresh = false;
  });
  const trial = (await reviewPower(file)).trials[1];
  assert.deepEqual(trial.upper.map(row => row.status),Array(3).fill('incomplete'));
  assert.deepEqual(trial.upper.map(row => row.marginV),[null,null,null]);
  assert.deepEqual(trial.upper.map(row => row.reason),['Evidence is stale','No evidence for this location and state','Device ceiling is unknown']);
});

test('incompatible electrical states, unsupported versions and ambiguous sources fail validation', async t => {
  for (const mutate of [
    c => { c.schema = 'frc-power-comparison/v1'; },
    (c,tr) => { tr[0].schema = 'frc-power-trace/v1'; },
    c => { c.upperRequirements.push(c.upperRequirements[0]); },
    c => { delete c.upperRequirements[0].ratingSource; },
    (c,tr) => { tr[0].upperEvidence[0].location = 'upstream-bus'; },
    (c,tr) => { tr[0].upperEvidence[0].state = 'other state'; },
    (c,tr) => { tr[0].upperEvidence[0].kind = 'nominal'; },
    (c,tr) => { tr[0].upperEvidence.push(tr[0].upperEvidence[0]); }
  ]) {
    const file = await fixture(t,(c,tr) => { withCeiling(c,tr); mutate(c,tr); });
    await assert.rejects(reviewPower(file));
  }
});

test('regulator teaching study gives independent loaded and settled headroom at both trims', async () => {
  const file = fileURLToPath(new URL('../examples/power/regulator/comparison.json', import.meta.url));
  const report = await reviewPower(file);
  assert.deepEqual(report.trials.map(t => [t.minimumStatus,t.upper[0].status,t.upper[0].evidence.valueV]),
    [['complete','complete',5.2],['complete','incomplete',5.35]]);
});
