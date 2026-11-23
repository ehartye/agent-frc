/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessSimulationChecks as assess } from '../scripts/simulation-checks.mjs';

const request=kind=>({schema:'frc-simulation-checks/request-v1',kind});
const receipt=kind=>({schema:'frc-simulation-checks/receipt-v1',kind});
const label={run:'fine',kind:'cold',step:12};
const metrics=[{name:'component',units:'m/s',maxAbs:.003},{name:'energy',units:'J',maxAbs:1}];
const replay={...request('replay-inventory'),replays:[{...label,metrics}]};
const observation={...label,metrics:[{name:'component',units:'m/s',difference:.01},{name:'energy',units:'J',difference:.1}]};
const check=rows=>assess(replay,{...receipt('replay-inventory'),replays:rows});
test('required replay kinds and metrics survive aggregation',()=>{
  assert.equal(check([observation]).status,'failed');
  assert.deepEqual(check([observation]).replays[0].metrics.map(m=>m.status),['failed','passed']);
  assert.equal(check([]).status,'unknown');
  assert.equal(check([{...observation,kind:'ordinary'}]).otherReplays.length,1);
  assert.equal(check([observation,observation]).replays[0].inventory,'duplicate');
  assert.equal(check([{...observation,metrics:[observation.metrics[0]]}]).replays[0].metrics[0].status,'failed');
  assert.equal(check([{...observation,metrics:[observation.metrics[1]]}]).status,'unknown');
  assert.equal(check([{...observation,metrics:observation.metrics.map(m=>({...m,difference:0}))}]).status,'passed');
  assert.throws(()=>assess({...replay,replays:[]},{...receipt('replay-inventory'),replays:[]}));
});
const clock={origin:'run-start',tickSeconds:.0001,quantity:'velocity-x',units:'m/s'};
const alignment={...request('trace-alignment'),...clock,maxAbs:.003,interval:[0,40],requiredTicks:[0,20,40],traces:['coarse','fine']};
const times=(id,ticks)=>({id,...clock,timeBasis:'common-clock',samples:ticks.map(t=>[t,t*.0001])});
const continuous={...receipt('trace-alignment'),traces:[times('coarse',[0,10,20,30,40]),times('fine',[0,4,8,12,16,20,24,28,32,36,40])]};
test('nonintegral grids compare only common ticks and preserve unmatched regions',()=>{
  const result=assess(alignment,continuous);
  assert.equal(result.status,'passed');assert.deepEqual(result.shared.map(s=>s.tick),[0,20,40]);
  assert.deepEqual(result.unmatched[0].ticks,[10,30]);
  const shifted={...continuous,traces:[continuous.traces[0],times('fine',[1,21,41])]};
  assert.equal(assess(alignment,shifted).status,'unknown');
  const changed=structuredClone(continuous);changed.traces[1].samples[5][1]+=.01;
  changed.diagnostics=[{timeBasis:'phase-relative',verdict:'passed'}];
  assert.equal(assess(alignment,changed).status,'failed');
  changed.traces[1].timeBasis='phase-relative';
  assert.throws(()=>assess(alignment,changed),/time basis/);
});
test('normal CLI binds receipt to frozen request and preserves exit codes',t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'frc-checks-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const expected=JSON.stringify(replay),sha=createHash('sha256').update(expected).digest('hex');
  writeFileSync(path.join(dir,'request.json'),expected);
  const run=(hash,rows)=>{
    writeFileSync(path.join(dir,'obs.json'),JSON.stringify({...receipt('replay-inventory'),requestSha256:hash,replays:rows}));
    return spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/simulation-checks.mjs',import.meta.url)),
      'request.json','obs.json'],{cwd:dir,encoding:'utf8'});
  };
  assert.equal(run(sha,[observation]).status,1);
  assert.equal(run(sha,[]).status,2);
  assert.equal(JSON.parse(run('0'.repeat(64),[]).stdout).status,'unknown');
});
