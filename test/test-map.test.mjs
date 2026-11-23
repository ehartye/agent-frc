import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {allTests,glob,mapFile,reach,readJson,repoFiles,root,selectForChange} from '../scripts/test-selection.mjs';

const map=readJson(mapFile),tests=allTests();
const inGit=existsSync(root+'.git')&&'Needs the Git file list of a checkout';
const lane=name=>map.lanes[name];

test('every test file is in exactly one lane, and no lane names a missing file',()=>{
  const listed=Object.values(map.lanes).flat();
  assert.deepEqual([...listed].sort(),tests,'add a new test file to one lane in '+mapFile+', and remove a deleted one');
  assert.ok(map.quick.every(lane),'the quick run names existing lanes');
});

test('the map and the recorded durations name only files that exist',{skip:!inGit},()=>{
  const files=repoFiles();
  for(const [key,patterns] of Object.entries(map.covers)){
    assert.ok(lane(key)||tests.includes(key),key+' is a lane or a test file');
    for(const pattern of patterns) assert.ok(files.some(file=>glob(pattern).test(file)),`${key}: ${pattern} matches a file`);
  }
  for(const pattern of [...map.everything,...map.versionFiles]) assert.ok(files.some(file=>glob(pattern).test(file)),pattern+' matches a file');
  for(const name of map.versionTests) assert.ok(tests.includes(name),name);
  for(const [profile,seconds] of Object.entries(readJson('test/durations.json'))) for(const name of Object.keys(seconds)) assert.ok(tests.includes(name),`${profile}: ${name}`);
});

test('a change selects the tests that cover it, and everything when it cannot be attributed',{skip:!inGit},()=>{
  const reached=reach();
  // This file names the files it asks about, so it counts as covering them; leave it out of the answers.
  const pick=(...changed)=>{const choice=selectForChange(changed,{reached});return {...choice,tests:choice.tests.filter(name=>name!=='test-map.test.mjs')};};
  const script=pick('scripts/atomic-write.mjs');
  assert.equal(script.all,false);
  assert.ok(script.tests.includes('atomic-write.test.mjs')&&script.tests.length<tests.length/2);
  assert.ok(pick('test/atomic-write.test.mjs').tests.includes('atomic-write.test.mjs'),'a changed test file runs itself');

  const words=pick('README.md','docs/project-ci.md','skills/frc-setup/SKILL.md');
  assert.equal(words.all,false);
  for(const name of lane('docs')) assert.ok(words.tests.includes(name),name+' runs for a documentation change');
  assert.deepEqual(words.tests.filter(name=>lane('kernel').includes(name)),[],'a documentation change runs no CAD kernel test');

  // A Python helper named like a script stays with the test that runs it.
  assert.deepEqual(pick('test/free_path.py').tests,['mechanical-readiness.test.mjs']);
  assert.ok(pick('scripts/mechanical_readiness.py').tests.includes('mechanical-readiness.test.mjs'));

  for(const file of [...map.everything,'unmapped/new-tool.xyz']) assert.equal(pick(file).all,true,file+' runs every test');
  assert.match(pick('unmapped/new-tool.xyz').reason,/no test is mapped to unmapped\/new-tool\.xyz/);
  assert.deepEqual(selectForChange(['package.json'],{versionOnly:['package.json'],reached}).tests,[...map.versionTests].sort(),'a version number alone runs the manifest tests');
});
