/** @lane merge */
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

const profile = JSON.parse(await readFile(new URL('../examples/kickoff/training-field.json',import.meta.url)));
const cli = fileURLToPath(new URL('../scripts/kickoff.mjs',import.meta.url));

test('release-day profile generates a standalone page outside the plugin and preserves prior exports', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(),'frc-kickoff-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  const run = (...args)=>execFileSync(process.execPath,[cli,...args],{cwd,stdio:'pipe'});
  await writeFile(path.join(cwd,'team-profile.json'),JSON.stringify(profile));
  run('--profile','team-profile.json','--model-output','model.json');
  const saved=JSON.parse(await readFile(path.join(cwd,'model.json'),'utf8'));
  assert.ok(saved.routeHypotheses.every(h=>h.routeIn.length>=2));
  assert.deepEqual(rulesModel(saved),saved);
  run('--profile','model.json','--output','lab.html');
  const html=await readFile(path.join(cwd,'lab.html'),'utf8');
  assert.match(html,/Invented classroom exercise/);
  assert.ok(!html.includes('/* LAB */'));
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.throws(()=>run('--season','0','--output','other.html'),/project-owned profile/);
  assert.throws(()=>run('--profile','team-profile.json','--model-output',path.join(path.dirname(cli),'model.json')),/outside the plugin/);
  await assert.rejects(buildLab(profile,path.join(cwd,'lab.html')),{code:'EEXIST'});
  const custom = {...profile,season:1, game:'Example </script> /* LAB */',manual:'sources/game-release.pdf',
    trial:{length:19.75,width:23,height:26},limits:{perimeter:null,height:null,source:'Unknown'},landmarks:[],levels:[]};
  delete custom.scoring;delete custom.rehearsal;
  await writeFile(path.join(cwd,'profile.json'),JSON.stringify(custom));
  run('--profile','profile.json','--output','custom.html');
  const page=await readFile(path.join(cwd,'custom.html'),'utf8');
  const data=page.match(/<script id="profile" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data),custom);
  assert.match(page,/const state=initialTrial\(profile\)/);
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

test('one-at-a-time shuttle budgets every loaded leg and empty return',()=>{
  const trial={stock:4,opening:4,incoming:0,arrival:0,goal:3,window:15,cycle:1.5,setup:1,travel:2.4,points:2,cap:null};
  assert.equal(analyzeWindow({...trial,delivery:'staged'}).delivered,4);
  const shuttle=analyzeWindow({...trial,delivery:'shuttle'});
  assert.equal(shuttle.delivered,2);
  assert.equal(shuttle.outboundLegs,3);
  assert.equal(shuttle.returnLegs,2);
  assert.equal(analyzeWindow({...trial,delivery:'shuttle',opening:0,incoming:4,arrival:14}).delivered,0);
  assert.equal(analyzeWindow({...trial,delivery:'shuttle',travel:2,returnTravel:1,window:13.5}).delivered,3);
});

test('model infers exposure from start slots and routes without student risk labels',()=>{
  const model=structuredClone(profile),map=model.scoring.fieldMap;
  map.sources.preplaced=[[90,48]];
  map.routes[0].sourceByPhase={Opening:'preplaced'};
  map.routes[0].preloadPhases=['Opening'];
  validateProfile(model);
  const route=routeStudy(model,'Tile','shelf','Opening',null,30);
  assert.equal(route.peers.length,5);
  assert.ok(route.hot.some(p=>p.count>=2));
  assert.ok(route.traffic.includes('slot'));
  assert.notDeepEqual(route.line,routeStudy(model,'Tile','shelf','Main play',null,30).line);
  const unmodeled={...profile,scoring:undefined};
  assert.match(routeStudy(unmodeled,'Tile','shelf','Opening',null,30).traffic,/Unknown/);
  const reroute=routeStudy(profile,'Tile','shelf','Opening',{a:[80,132],b:[280,132]},30);
  assert.ok(reroute.line.length>2);
  assert.ok(reroute.length>190);
  assert.throws(()=>validateProfile({...profile,scoring:{...profile.scoring,fieldMap:{...profile.scoring.fieldMap,starts:[]}}}));
});

test('reject ungrounded dimensions and invalid scene coordinates',()=>{
  for(const bad of [{units:'m'}, {field:{...profile.field,source:''}},
    {landmarks:[{...profile.landmarks[0],x:-1}]},{edition:''},{manual:'file:///manual.pdf'},
    {manual:'../private.pdf'},{manual:'https://user:password@example.org/file'},{trial:{length:0,width:1,height:1}},
    {limits:{height:0,perimeter:100,source:'Example'}}]) {
    assert.throws(()=>validateProfile({...profile,...bad}));
  }
});


test('one loaded batch departs only after its pieces are aboard; early and late alternatives never add together',()=>{
  const trial={delivery:'loaded-batch',stock:50,opening:0,incoming:12,goal:12,cap:null,carryCapacity:12,
    window:16,arrival:4,travel:3,setup:3,cycle:.5,points:2};
  const r=analyzeWindow(trial);
  assert.deepEqual([r.ready,r.usable,r.rate,r.points,r.bestDepartureS],[10,6,2,24,4]);
  assert.equal(analyzeWindow({...trial,delivery:'staged'}).ready,6);
  assert.equal(analyzeWindow({...trial,travel:6}).delivered,6);
  const expired=analyzeWindow({...trial,arrival:10});
  assert.deepEqual([expired.usable,expired.rate,expired.delivered],[0,Infinity,0]);
  const tooSmall=analyzeWindow({...trial,carryCapacity:4});
  assert.deepEqual([tooSmall.targetDepartureS,tooSmall.available,tooSmall.delivered,tooSmall.rate],[null,4,4,Infinity]);
  const blocked=analyzeWindow({...trial,cap:0});assert.equal(blocked.delivered,0);
  const early=analyzeWindow({...trial,opening:5,incoming:7,arrival:15});
  assert.deepEqual([early.bestDepartureS,early.delivered,early.rate],[0,5,Infinity]);
  const tie=analyzeWindow({...trial,opening:3,incoming:3,arrival:3,goal:3,cap:3});
  assert.deepEqual([tie.targetDepartureS,tie.bestDepartureS,tie.points],[0,0,6]);
  assert.throws(()=>analyzeWindow({...trial,carryCapacity:0}),/carrying capacity/);
});

test('scoring entry regions and robot limits are optional, and strictly shaped when present',()=>{
  const bay=profile.rehearsal.stations.findIndex(s=>s.kind==='scoring');
  const supply=profile.rehearsal.stations.findIndex(s=>s.kind==='retrieval');
  assert.ok(profile.rehearsal.stations[bay].entry && profile.rehearsal.robotLimits.massLb.value===100,'the training field demonstrates both');
  const variant=edit=>{const p=structuredClone(profile);edit(p);return p;};
  const withEntry=(entry,at=bay)=>variant(p=>{p.rehearsal.stations[at].entry=entry;});
  const withLimits=limits=>variant(p=>{p.rehearsal.robotLimits=limits;});
  const ring={centerIn:[175,194,40],kind:'ring',radiusIn:9,factId:'invented-ring'};
  const window={centerIn:[175,194,30],kind:'window',widthIn:18,heightIn:12,facingDeg:180,factId:'invented-window'};
  const known=value=>({value,factId:'invented-limit'});
  const limits={perimeterIn:known(116),startingHeightIn:known(46),maxHeightIn:null,maxExtensionIn:known(12),massLb:known(100)};
  for(const ok of [withEntry(ring),withEntry(window),withLimits(limits),
    variant(p=>{delete p.rehearsal.robotLimits;for(const s of p.rehearsal.stations)delete s.entry;})]) assert.doesNotThrow(()=>validateProfile(ok));
  for(const bad of [{...ring,centerIn:[175,194]},{...ring,centerIn:[175,999,40]},{...ring,centerIn:[175,194,-1]},
    {...ring,kind:'hoop'},{...ring,radiusIn:0},{...ring,factId:''},{...ring,widthIn:4},
    {...window,facingDeg:undefined},{...window,heightIn:-2},{...window,radiusIn:9},{...window,extra:true}]) {
    assert.throws(()=>validateProfile(withEntry(bad)),/entry/,JSON.stringify(bad));
  }
  assert.throws(()=>validateProfile(withEntry(ring,supply)),/scoring station/);
  for(const bad of [{...limits,massLb:100},{...limits,massLb:known(0)},{...limits,perimeterIn:{value:116}},
    {...limits,maxExtensionIn:undefined},{...limits,width:known(1)},{...limits,maxHeightIn:known(40)},[],null]) {
    assert.throws(()=>validateProfile(withLimits(bad)),/robotLimits/,JSON.stringify(bad));
  }
});

test('kickoff embeds each --concept as its document and compiled record, and the lab inlines the arc model',async t=>{
  const {applyProfileDefaults,compileConceptBot}=await import('../scripts/concept-bot.mjs');
  const concept=async rel=>JSON.parse(await readFile(new URL('../examples/concept-bots/'+rel,import.meta.url),'utf8'));
  const turret=await concept('turret-shooter.json'),placer=await concept('front-intake-placer.json');
  const cwd=await mkdtemp(path.join(tmpdir(),'frc-kickoff-concept-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  const run=(...args)=>execFileSync(process.execPath,[cli,...args],{cwd,stdio:'pipe'});
  await writeFile(path.join(cwd,'team-profile.json'),JSON.stringify(profile));
  await writeFile(path.join(cwd,'turret.json'),JSON.stringify(turret));
  await writeFile(path.join(cwd,'placer.json'),JSON.stringify(placer));
  run('--profile','team-profile.json','--concept','turret.json','--concept','placer.json','--model-output','model.json');
  const saved=JSON.parse(await readFile(path.join(cwd,'model.json'),'utf8'));
  assert.deepEqual(saved.rehearsal.concepts,[turret,placer].map(document=>({document,record:compileConceptBot(applyProfileDefaults(document,profile))})));
  assert.equal(saved.rehearsal.concepts[0].record.concept.massLb.default,true,'the mass default comes from the profile being built');
  assert.deepEqual(validateProfile(structuredClone(saved)).rehearsal.concepts,saved.rehearsal.concepts);
  run('--profile','team-profile.json','--concept','turret.json','--output','lab.html');
  const html=await readFile(path.join(cwd,'lab.html'),'utf8');
  assert.match(html,/function createArcModel\(/);
  assert.ok(html.indexOf('function createArcModel(')<html.indexOf('function createRehearsalGame('));
  assert.throws(()=>run('--profile','team-profile.json','--concept','turret.json','--concept','turret.json','--output','twice.html'),/turret-shooter/);
  assert.throws(()=>run('--profile','team-profile.json','--concept','--output','none.html'));
  const broken={...turret,drive:{...turret.drive,type:'tank'}};
  await writeFile(path.join(cwd,'broken.json'),JSON.stringify(broken));
  assert.throws(()=>run('--profile','team-profile.json','--concept','broken.json','--output','broken.html'),/drive\.type/);

  // Failing controls on reopening a saved model: a tampered record, a duplicate ID and an unknown reference.
  const model=()=>structuredClone(saved);
  const tampered=model();tampered.rehearsal.concepts[0].record.speed+=1;
  assert.throws(()=>validateProfile(tampered),/record/);
  const twice=model();twice.rehearsal.concepts.push(structuredClone(twice.rehearsal.concepts[0]));
  assert.throws(()=>validateProfile(twice),/duplicate|turret-shooter/i);
  const invalid=model();invalid.rehearsal.concepts[0].document.drive.type='tank';
  assert.throws(()=>validateProfile(invalid),/drive\.type/);
  const referenced=model();referenced.rehearsal.defaults.concept='turret-shooter';
  referenced.rehearsal.series.matches[0].roster[0].concept='front-intake-placer';
  assert.doesNotThrow(()=>validateProfile(referenced));
  const unknownDefault=model();unknownDefault.rehearsal.defaults.concept='absent-bot';
  assert.throws(()=>validateProfile(unknownDefault),/absent-bot/);
  const unknownRow=model();unknownRow.rehearsal.series.matches[0].roster[0].concept='absent-bot';
  assert.throws(()=>validateProfile(unknownRow),/absent-bot/);
  const noConcepts=structuredClone(profile);noConcepts.rehearsal.defaults.concept='turret-shooter';
  assert.throws(()=>validateProfile(noConcepts),/turret-shooter/);
});
