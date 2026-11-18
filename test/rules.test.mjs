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
  register.sources = [{id:'handout',title:'Invented classroom exercise',edition:profile.edition,location:'handout.pdf'}];
  register.facts = [
    {id:'width',sourceId:'handout',locator:'Diagram A',topic:'field',statement:'Width shown on diagram',status:'modeled',pointer:'/field/width',value:profile.field.width},
    {id:'signal',sourceId:'handout',locator:'Task B',topic:'novel-task',statement:'Signal a partner at arrival',status:'unmodeled',reason:'Record this requirement in the strategy narrative.'}
  ];
  return register;
}
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
