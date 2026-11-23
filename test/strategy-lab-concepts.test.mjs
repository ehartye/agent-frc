/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as lab from '../scripts/strategy-lab.mjs';
import {embedConcepts} from '../scripts/kickoff.mjs';

const {compareRoles}=lab;

const read=rel=>JSON.parse(readFileSync(new URL(rel,import.meta.url),'utf8'));
const training=read('../examples/kickoff/training-field.json'),alliance=read('../examples/design-methods/alliance.json');
// compareRoles(training field, alliance study) as captured before concept-pinned roles existed (compact JSON, gzipped).
const golden=gunzipSync(readFileSync(new URL('fixtures/strategy-lab-golden.json.gz',import.meta.url))).toString('utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('a study without concept roles produces byte-identical comparison JSON, also through the per-cell runner',()=>{
  assert.equal(JSON.stringify(compareRoles(training,alliance)),golden);
  // The exported runner plays one role in one context; summarizing its cells is compareRoles.
  const prepared=lab.prepareComparison(training,alliance);
  const cells=prepared.contexts.flatMap(context=>prepared.roles.map(role=>lab.playRoleCell(prepared,role,context)));
  assert.equal(JSON.stringify(lab.summarizeComparison(prepared,cells)),golden);
});

// Two invented concept bots, written beside a study that pins them by file and SHA-256.
function conceptStudy(){
  const dir=mkdtempSync(path.join(tmpdir(),'strategy-concepts-'));
  const pin=id=>{
    const bytes=readFileSync(new URL('../examples/concept-bots/'+id+'.json',import.meta.url));
    writeFileSync(path.join(dir,id+'.json'),bytes);
    return {file:id+'.json',sha256:sha(bytes)};
  };
  const shuttle={Opening:'shuttle','Main play':'shuttle'};
  const study={...structuredClone(alliance),roles:[
    {id:'turret',basis:'Shoot from range with the invented turret concept.',plans:shuttle,endgame:null,concept:pin('turret-shooter')},
    {id:'placer',basis:'Place at the goal with the invented front-intake concept.',plans:shuttle,endgame:null,concept:pin('front-intake-placer')},
    {id:'plain',basis:'The same delivery cycle with the profile robot.',plans:shuttle,endgame:null}]};
  return {dir,study,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}

test('a concept-pinned role plays its concept as the focal robot in every context; a stale pin names the file',t=>{
  const {dir,study,cleanup}=conceptStudy();t.after(cleanup);
  const run=compareRoles(training,study,{studyDir:dir});
  const expected={turret:'turret-shooter',placer:'front-intake-placer',plain:undefined};
  assert.equal(run.cells.length,6);
  for(const cell of run.cells){
    assert.equal(cell.focal.concept,expected[cell.role],cell.role+' / '+cell.context+' focal concept');
    // The engine drove the compiled concept record, not the profile default body.
    const driven=cell.roster.find(r=>r.side===cell.focal.side&&r.slot===cell.focal.slot);
    assert.equal(driven.concept?.id,expected[cell.role],cell.role+' / '+cell.context+' driven concept');
  }
  // The caller's profile is not modified by embedding.
  assert.equal(training.rehearsal.concepts,undefined);
  const stale=structuredClone(study);stale.roles[0].concept.sha256='0'.repeat(64);
  assert.throws(()=>compareRoles(training,stale,{studyDir:dir}),/turret-shooter\.json/);
  // A role may instead name a concept the profile already embeds, as a variant study does.
  const document=JSON.parse(readFileSync(path.join(dir,'turret-shooter.json'),'utf8'));
  const profile=embedConcepts(training,[document]),byId=structuredClone(study);
  byId.roles[0].concept={id:'turret-shooter'};
  const prepared=lab.prepareComparison(profile,byId,{studyDir:dir});
  const cell=lab.playRoleCell(prepared,prepared.roles[0],prepared.contexts[0]);
  assert.equal(cell.focal.concept,'turret-shooter');
  assert.equal(cell.margin,run.cells[0].margin);
  byId.roles[0].concept={id:'unknown-bot'};
  assert.throws(()=>lab.prepareComparison(profile,byId,{studyDir:dir}),/unknown-bot/);
  // Control: a bare string is not the {id} form.
  byId.roles[0].concept='turret-shooter';
  assert.throws(()=>lab.prepareComparison(profile,byId,{studyDir:dir}),/bare string/);
});

test('the role cap is 2 to 12 unless maxRoles raises it',()=>{
  const roles=Array.from({length:13},(_,i)=>({...alliance.roles[0],id:'role-'+i}));
  // One context fails the context count, so a study that passes the role cap stops before any match is played.
  const study={...alliance,roles,contexts:alliance.contexts.slice(0,1)};
  assert.throws(()=>compareRoles(training,study),/2–12 distinct role/);
  assert.throws(()=>compareRoles(training,study,{maxRoles:13}),/2–16 distinct context/);
});
