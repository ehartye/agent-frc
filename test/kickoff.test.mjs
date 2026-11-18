import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab, rulesModel, validateProfile } from '../scripts/kickoff.mjs';
import { analyzeWindow } from '../scripts/kickoff-window.mjs';
import { routeStudy } from '../scripts/kickoff-routes.mjs';

const profile = JSON.parse(await readFile(new URL('../case-studies/2025/kickoff-field.json',import.meta.url)));
const cli = fileURLToPath(new URL('../scripts/kickoff.mjs',import.meta.url));

test('release-day profile generates a standalone page outside the plugin and preserves prior exports', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(),'frc-kickoff-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  const run = (...args)=>execFileSync(process.execPath,[cli,...args],{cwd,stdio:'pipe'});
  run('--season','2025','--model-output','model.json');
  const saved=JSON.parse(await readFile(path.join(cwd,'model.json'),'utf8'));
  assert.ok(saved.routeHypotheses.every(h=>h.routeIn.length>=2));
  assert.deepEqual(rulesModel(saved),saved);
  run('--profile','model.json','--output','lab.html');
  const html=await readFile(path.join(cwd,'lab.html'),'utf8');
  assert.match(html,/Kickoff · V0/);
  assert.ok(!html.includes('/* LAB */'));
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.throws(()=>run('--season','2026','--output','other.html'),/release-day sources/);
  await assert.rejects(buildLab(profile,path.join(cwd,'lab.html')),{code:'EEXIST'});
  const custom = {...profile,season:2030, game:'Example </script>',limits:{perimeter:null,height:null,source:'Unknown'},landmarks:[],levels:[]};
  delete custom.scoring;
  await writeFile(path.join(cwd,'profile.json'),JSON.stringify(custom));
  run('--profile','profile.json','--output','custom.html');
  const page=await readFile(path.join(cwd,'custom.html'),'utf8');
  const data=page.match(/<script id="profile" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data),custom);
});

test('screen rate, deadline, supply, points and limited slots independently',()=>{
  const trial={stock:25,opening:25,incoming:0,goal:25,window:5,cycle:.25,arrival:0,setup:0,travel:0,points:3,cap:null};
  const initial=analyzeWindow(trial);
  assert.equal(initial.rate,5);
  assert.equal(initial.delivered,20);
  assert.equal(initial.attainable,false);
  assert.equal(analyzeWindow({...trial,cycle:.20}).attainable,true);
  const late=analyzeWindow({...trial,opening:5,incoming:20,arrival:4,cycle:.20});
  assert.equal(late.rate,20);
  assert.equal(late.delivered,10);
  assert.equal(analyzeWindow({...trial,cap:6}).points,18);
  assert.equal(analyzeWindow({...trial,travel:5}).delivered,0);
  assert.equal(analyzeWindow({...trial,opening:0,incoming:25,arrival:5}).rate,Infinity);
  assert.throws(()=>analyzeWindow({...trial,incoming:1}));
  assert.throws(()=>analyzeWindow({...trial,cycle:0}));
});

test('model infers exposure from start slots and routes without student risk labels',()=>{
  const route=routeStudy(profile,'CORAL','reef','AUTO',null,30);
  assert.equal(route.peers.length,5);
  assert.ok(route.hot.some(p=>p.count>=2));
  assert.ok(route.traffic.includes('slot'));
  assert.notDeepEqual(route.line,routeStudy(profile,'CORAL','reef','TELEOP',null,30).line);
  const unmodeled={...profile,scoring:undefined};
  assert.match(routeStudy(unmodeled,'CORAL','reef','AUTO',null,30).traffic,/Unknown/);
  const reroute=routeStudy(profile,'CORAL','reef','AUTO',{a:[80,158.5],b:[270,158.5]},30);
  assert.ok(reroute.line.length>2);
  assert.ok(reroute.length>190);
  assert.throws(()=>validateProfile({...profile,scoring:{...profile.scoring,fieldMap:{...profile.scoring.fieldMap,starts:[]}}}));
});

test('reject ungrounded dimensions and invalid scene coordinates',()=>{
  for(const bad of [{units:'m'}, {field:{...profile.field,source:''}},
    {landmarks:[{...profile.landmarks[0],x:-1}]},{edition:''},
    {limits:{height:0,perimeter:100,source:'Example'}}]) {
    assert.throws(()=>validateProfile({...profile,...bad}));
  }
});
