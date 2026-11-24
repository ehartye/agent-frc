/** @lane merge */
import {validateProfile} from '../scripts/kickoff.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newRegister, reviewRegister, compileRules } from '../scripts/rules.mjs';
const profile = JSON.parse(await readFile(new URL('../examples/kickoff/training-field.json',import.meta.url)));
function example() {
  const register = newRegister();
  register.edition = profile.edition;
  register.cutoff = 'release packet';
  register.sources = [{id:'handout',title:'Invented classroom exercise',edition:profile.edition,location:profile.manual}];
  register.facts = [
    {id:'width',sourceId:'handout',locator:'Diagram A',topic:'field',statement:'Width shown on diagram',status:'modeled',pointer:'/field/width',value:profile.field.width},
    {id:'signal',sourceId:'handout',locator:'Task B',topic:'novel-task',statement:'Signal a partner at arrival',status:'unmodeled',reason:'Record this requirement in the strategy narrative.'}
  ];
  return register;
}

test('compiled rules and the lab share the ordered scoring clock', () => {
  const register = example();
  register.facts.push({id:'clock', sourceId:'handout', locator:'Clock table', topic:'timing',
    statement:'Ordered scoring phases and active durations',status:'modeled',
    pointer:'/scoring/phases',value:profile.scoring.phases});
  function withPeriods(periods) {
    const {endgame,series,...clockFixture}=profile.rehearsal;
    const stations=clockFixture.stations.map(s=>s.service?{...s,service:{...s.service,phases:periods.map(p=>p.name)}}:s);
    return {...profile,rehearsal:{...clockFixture,periods,stations}};
  }
  const [opening,main] = profile.scoring.phases;
  const split = [
    opening,
    {name:'Collect', scoringPhase:main.name, seconds:30},
    {name:'Deliver', scoringPhase:main.name, seconds:15}
  ];
  assert.deepEqual(compileRules(register,withPeriods(split)).rehearsal.periods,split);
  for (const periods of [
    [{...opening,seconds:opening.seconds+1},main],
    [opening],
    [main,opening],
    [...split,{name:'Overtime',scoringPhase:main.name,seconds:1}],
    [opening,{...split[1],scoringPhase:'Unknown phase'},split[2]]
  ]) {
    assert.throws(()=>compileRules(register,withPeriods(periods)),/scoring (clock|phase)/);
    assert.throws(()=>validateProfile(withPeriods(periods)),/scoring (clock|phase)/);
  }
  const standalone = {...withPeriods([opening])};
  delete standalone.scoring;
  assert.doesNotThrow(()=>validateProfile(standalone));
  assert.throws(()=>validateProfile({...profile,scoring:{...profile.scoring,phases:[opening,opening]}}),/scoring profile/);
});
test('the project model retains reviewed facts and unsupported actions',() => {
  const register = example();
  const model = compileRules(register,profile);
  assert.deepEqual(model.ruleRegister,register);
  assert.equal(model.field.width,profile.field.width);
});
test('a changed field value, edition or missing provenance blocks compilation',() => {
  const register = example();
  assert.throws(() => compileRules(register,{...profile,edition:'different'}),/edition/);
  register.facts[0].value += 1;
  assert.throws(() => compileRules(register,profile),/disagrees/);
  register.facts[0].sourceId = 'unseen';
  assert.throws(() => reviewRegister(register),/source/);
});
test('register review preserves unknowns and rejects missing coverage or duplicate facts',() => {
  const register = example();
  register.openQuestions = [];
  assert.throws(() => reviewRegister(register),/inventory/);
  const other = example();
  other.facts[1].id = other.facts[0].id;
  assert.throws(() => reviewRegister(other),/unique/);
});

test('the lab rejects a compiled model edited out of agreement with its reviewed facts',() => {
  const model = compileRules(example(),structuredClone(profile));
  model.field.width += 1;
  assert.throws(() => validateProfile(model),/disagrees/);
});

test('changing only the manual is detected at compilation and on reopening a reviewed model',() => {
  const register=example();
  const later={...profile,manual:'packet/later.pdf'};
  assert.throws(()=>compileRules(register,later),/governing source/);
  const model=compileRules(register,profile);
  assert.throws(()=>validateProfile({...model,manual:later.manual}),/governing source/);
  model.ruleRegister.sources[0].edition='Revised exercise';
  assert.throws(()=>validateProfile(model),/Saved manual binding/);
});

test('secondary sources cannot substitute for the manual and differing edition labels may be explicit',() => {
  const register=example();
  register.sources.push({id:'drawing',title:'Drawing',edition:'A',location:'drawings/layout.pdf'});
  assert.throws(()=>compileRules(register,profile),/manualSourceId/);
  register.manualSourceId='handout';
  register.sources[0].edition='First printing';
  const local={...profile,manual:'manuals/handout.pdf',manualEdition:'First printing'};
  register.sources[0].location=local.manual;
  assert.equal(compileRules(register,local).manualBinding.sourceId,'handout');
  assert.throws(()=>compileRules(register,{...local,manual:register.sources[1].location}),/governing source/);
  assert.throws(()=>compileRules(register,{...local,manualEdition:'Second printing'}),/manual edition/);
});

test('a mirror requires a matching reviewed digest',() => {
  const register=example();
  const source=register.sources[0];
  source.sha256='a'.repeat(64);
  source.mirrors=[{location:'archive/copy.pdf',sha256:source.sha256}];
  const local={...profile,manual:source.mirrors[0].location,manualSha256:source.sha256};
  assert.equal(compileRules(register,local).manualBinding.location,source.location);
  assert.throws(()=>compileRules(register,{...local,manualSha256:'b'.repeat(64)}),/digest/);
  source.mirrors[0].sha256='b'.repeat(64);
  assert.throws(()=>compileRules(register,local),/same reviewed SHA/);
});

test('rules compile carries entry regions, robot limits and weight limits with the register facts that support them',() => {
  const register=example();
  const bay=profile.rehearsal.stations.findIndex(s=>s.entry), entry=profile.rehearsal.stations[bay].entry;
  const mass=profile.weightLimits[0];
  register.facts.push(
    {id:entry.factId,sourceId:'handout',locator:'Drawing C',topic:'scoring',statement:'Opening above the blue bay',
      status:'modeled',pointer:'/rehearsal/stations/'+bay+'/entry',value:entry},
    {id:mass.factId,sourceId:'handout',locator:'Inspection table',topic:'restrictions',statement:'Robot mass limit',
      status:'modeled',pointer:'/weightLimits/0/limit/value',value:mass.limit.value});
  const model=compileRules(register,profile);
  assert.deepEqual(model.rehearsal.stations[bay].entry,entry);
  assert.deepEqual(model.rehearsal.robotLimits,profile.rehearsal.robotLimits);
  assert.deepEqual(model.weightLimits,profile.weightLimits);
  assert.deepEqual(model.ruleRegister.facts.filter(f=>[entry.factId,mass.factId].includes(f.id)).map(f=>f.pointer),
    ['/rehearsal/stations/'+bay+'/entry','/weightLimits/0/limit/value']);
  // The carried values stay bound to their facts: an edited entry or limit no longer compiles or reopens.
  const moved=structuredClone(profile);moved.rehearsal.stations[bay].entry.centerIn[2]+=1;
  assert.throws(()=>compileRules(register,moved),/disagrees/);
  model.weightLimits[0].limit.value=120;
  assert.throws(()=>validateProfile(model),/disagrees/);
});
