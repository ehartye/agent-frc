/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyProfileDefaults } from '../scripts/concept-bot.mjs';
import { conceptCheck } from '../scripts/concept-check.mjs';
import { validateProfile } from '../scripts/kickoff.mjs';
import { ROBOT_ROLES, inspectionLimitLb, limitKg, limitLb, validateWeightLimits } from '../scripts/weight-limits.mjs';

const read = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
// The cases both readers of weightLimits must agree on: this one and the design judge's.
const cases = read('test/fixtures/weight-limits-cases.json');
const training = read('examples/kickoff/training-field.json'), turret = read('examples/concept-bots/turret-shooter.json');
const withLimits = weightLimits => ({...structuredClone(training), weightLimits});
const inspection = (limit, more = {}) => ({name: 'inspection', limit, excludesRoles: ['bumper', 'battery'], factId: 'invented-limit', ...more});

test('weight limits: the shared cases are accepted or refused, in the module and in a profile', () => {
  // Catches: a limit the design judge would refuse, or read another way, compiled into the rules model.
  assert.ok(cases.valid.length >= 4 && cases.refused.length >= 10);
  for (const {name, weightLimits} of cases.valid) {
    assert.equal(validateWeightLimits(weightLimits), weightLimits, name);
    assert.doesNotThrow(() => validateProfile(withLimits(weightLimits)), name);
  }
  for (const {name, weightLimits, because} of cases.refused) {
    assert.ok(because, name);
    assert.throws(() => validateWeightLimits(weightLimits), /^Error: weightLimits/, name);
    assert.throws(() => validateProfile(withLimits(weightLimits)), /^Error: weightLimits/, name);
  }
  for (const wrong of [null, 'inspection', 100]) assert.throws(() => validateProfile(withLimits(wrong)), /^Error: weightLimits/, String(wrong));
});

test('weight limits: a refusal names the entry and what is wrong', () => {
  // Catches: one general message that leaves a student to find the entry.
  const refused = name => cases.refused.find(c => c.name === name).weightLimits;
  for (const [name, message] of [
    ['unknown role', /weightLimits\[0\]\.excludesRoles names "wheels".*structure, bumper, drive, battery, mechanism, other/],
    ['payload listed', /weightLimits\[0\]\.excludesRoles names "payload"/],
    ['duplicate name', /weightLimits\[1\]\.name repeats "inspection"/],
    ['bad unit', /weightLimits\[0\]\.limit.*lb.*kg/],
    ['value not above zero', /weightLimits\[0\]\.limit.*above zero/],
    ['missing factId', /weightLimits\[0\].*factId/],
    ['missing excludesRoles', /weightLimits\[0\].*excludesRoles/],
    ['unknown key', /weightLimits\[0\].*"note"/],
    ['not a list', /weightLimits must be a list/],
    ['an empty list', /weightLimits.*leave it out/]
  ]) assert.throws(() => validateWeightLimits(refused(name)), message, name);
  const pounds = {value: 100, unit: 'lb'};
  for (const bad of [inspection({value: Infinity, unit: 'lb'}), inspection({value: '100', unit: 'lb'}), inspection({value: true, unit: 'lb'}),
    inspection({...pounds, note: 1}), inspection(100), inspection(pounds, {name: ' '}), inspection(pounds, {factId: ''}),
    inspection(pounds, {excludesRoles: 'bumper'}), null]) {
    assert.throws(() => validateWeightLimits([bad]), /weightLimits\[0\]/, JSON.stringify(bad));
  }
});

test('weight limits: pounds and kilograms convert exactly', () => {
  // Catches: a rounded pound, or a kilogram limit read as pounds. Control: a rounded factor misses by more than the tolerance.
  for (const {limit, kg} of cases.conversions) assert.ok(Math.abs(limitKg(limit) - kg) < 1e-12, JSON.stringify(limit));
  assert.ok(Math.abs(100 * 0.4536 - cases.conversions[0].kg) > 1e-4);
  assert.equal(limitLb({value: 100.1, unit: 'lb'}), 100.1, 'a printed pound value is not changed on the way');
  assert.ok(Math.abs(limitLb({value: 45.359237, unit: 'kg'}) - 100) < 1e-12);
});

test('weight limits: the listable roles are the group roles of the design judge, less those that never count', () => {
  // Catches: a role added or renamed on one side only, so a limit names a role the judge does not know.
  const source = readFileSync(new URL('../scripts/kernel_layout/inputs.py', import.meta.url), 'utf8');
  const tuple = (text, name) => [...text.match(new RegExp('^' + name + ' = \\(([^)]*)\\)', 'm'))[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const listable = text => tuple(text, 'ROLES').filter(role => ![...tuple(text, 'NOT_ROBOT'), 'fixture'].includes(role));
  assert.deepEqual([...ROBOT_ROLES].sort(), listable(source).sort());
  // Controls: a role added to that line, or renamed in it, is noticed.
  for (const changed of [source.replace('"battery", "mechanism"', '"battery", "ballast", "mechanism"'), source.replace('"bumper"', '"bumpers"')]) {
    assert.notEqual(changed, source);
    assert.notDeepEqual([...ROBOT_ROLES].sort(), listable(changed).sort());
  }
});

test('weight limits are unknown when absent, and only the inspection limit gives the default mass range and the mass check', () => {
  // Catches: another limit, or no limit, taken for the inspection limit.
  const {weightLimits, ...none} = structuredClone(training);
  const other = withLimits([inspection({value: 100, unit: 'lb'}, {name: 'with bumpers'})]);
  for (const profile of [none, other]) {
    assert.doesNotThrow(() => validateProfile(profile));
    assert.equal(inspectionLimitLb(profile), undefined);
    assert.equal(Object.hasOwn(applyProfileDefaults(turret, profile), 'massLb'), false);
    const report = conceptCheck(turret, profile);
    assert.equal(report.limits.mass, 'unresolved');
    assert.deepEqual([report.limitValues.mass.limit, report.mass.min, report.mass.shareOfLimit], [null, null, null]);
  }
  // Controls: the inspection limit among several, wherever it stands, in pounds or kilograms.
  for (const limit of [{value: 100, unit: 'lb'}, {value: 45.359237, unit: 'kg'}]) {
    const profile = withLimits([...other.weightLimits, inspection(limit)]);
    const {min, max, basis} = applyProfileDefaults(turret, profile).massLb;
    assert.ok(Math.abs(min - 75) < 1e-9 && Math.abs(max - 95) < 1e-9, JSON.stringify([limit, min, max]));
    assert.match(basis, /invented-limit/);
    const report = conceptCheck(turret, profile);
    assert.equal(report.limits.mass, 'within');
    assert.ok(Math.abs(report.limitValues.mass.limit.value - 100) < 1e-9 && report.limitValues.mass.limit.factId === 'invented-limit');
  }
});

test('the migrated fields give the default mass ranges they gave before', () => {
  // Catches: a value, unit or factId lost in the move. The expected values are those the fields gave with robotLimits.massLb.
  for (const [file, factId] of [['examples/kickoff/training-field.json', 'robot-mass'], ['examples/concept-study/field.json', 'invented-mass'],
    ['test/fixtures/concept-floor-field.json', 'invented-mass'], ['test/fixtures/concept-parked-field.json', 'invented-mass'],
    ['test/fixtures/concept-yield-field.json', 'invented-mass']]) {
    const profile = validateProfile(read(file));
    assert.equal(Object.hasOwn(profile.rehearsal.robotLimits, 'massLb'), false, file);
    assert.deepEqual(applyProfileDefaults(turret, profile).massLb,
      {min: 75, max: 95, label: 'assumed', basis: 'Default 75–95% of the inspection limit (' + factId + ')', default: true}, file);
    assert.deepEqual(conceptCheck(turret, profile).limitValues.mass, {conceptLb: 95, limit: {value: 100, factId}}, file);
  }
});

test('a profile that still has robotLimits.massLb is refused with a line naming weightLimits', () => {
  // Catches: the old key read, or ignored, beside the new one. Control: the same profile without it.
  for (const massLb of [{value: 100, factId: 'robot-mass'}, null]) {
    const profile = structuredClone(training);
    profile.rehearsal.robotLimits.massLb = massLb;
    assert.throws(() => validateProfile(profile), /^Error: rehearsal\.robotLimits\.massLb [^\n]*weightLimits[^\n]*$/);
    delete profile.weightLimits;
    assert.throws(() => validateProfile(profile), /weightLimits/);
    assert.equal(Object.hasOwn(applyProfileDefaults(turret, profile), 'massLb'), false, 'it is not read either');
  }
  assert.doesNotThrow(() => validateProfile(structuredClone(training)));
});
