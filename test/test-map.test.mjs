/** @lane merge */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import {allTests,git,glob,mapFile,reach,readJson,repoFiles,root,selectForChange} from '../scripts/test-selection.mjs';

const map=readJson(mapFile),tests=allTests();
const inGit=(()=>{try{git('rev-parse','--git-dir');return true;}catch{return false;}})()||'Needs the Git file list of a checkout';
const lane=name=>map.lanes[name];

test('every test file is in exactly one lane, and no lane names a missing file',()=>{
  const listed=Object.values(map.lanes).flat();
  assert.deepEqual([...listed].sort(),tests,'add a new test file to one lane in '+mapFile+', and remove a deleted one');
  assert.ok(map.quick.every(lane),'the quick run names existing lanes');
});

// The leading comment of a test file says when it runs and which files it tests without importing them.
// The audit of .testing/risk.yml reads the same tags, so it and the changed-files selection agree.
test('every test file declares its lane, and each subject it names exists',()=>{
  const python=readdirSync(root+'test').filter(name=>name.endsWith('.py')&&/unittest\.TestCase/.test(readFileSync(root+'test/'+name,'utf8')));
  for(const name of [...tests,...python]){
    const text=readFileSync(root+'test/'+name,'utf8'),head=name.endsWith('.py')?text.match(/^(#.*\r?\n|\s*\n)*/)[0]:text.match(/^\s*\/\*\*[^]*?\*\//)?.[0]??'';
    assert.match(head,/@lane (edit|merge|scheduled|release)\b/,name+' starts with a comment that carries @lane');
    for(const [,subject] of head.matchAll(/@subject (\S+)/g)) assert.ok(existsSync(root+subject),`${name}: ${subject} exists`);
  }
});

test('the map and the recorded durations name only files that exist',{skip:inGit!==true&&inGit},()=>{
  const files=repoFiles();
  for(const [key,patterns] of Object.entries(map.covers)){
    assert.ok(lane(key)||tests.includes(key),key+' is a lane or a test file');
    for(const pattern of patterns) assert.ok(files.some(file=>glob(pattern).test(file)),`${key}: ${pattern} matches a file`);
  }
  for(const pattern of [...map.everything,...map.versionFiles]) assert.ok(files.some(file=>glob(pattern).test(file)),pattern+' matches a file');
  for(const name of map.versionTests) assert.ok(tests.includes(name),name);
  for(const [profile,seconds] of Object.entries(readJson('test/durations.json'))) for(const name of Object.keys(seconds)) assert.ok(tests.includes(name),`${profile}: ${name}`);
});

test('a change selects the tests that cover it, and everything when it cannot be attributed',{skip:inGit!==true&&inGit},()=>{
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

  // Every document, page and style sheet in the repository, one at a time: none starts a CAD kernel test or the whole suite.
  const files=repoFiles();
  for(const pattern of map.pages){
    const pages=files.filter(file=>glob(pattern).test(file));
    assert.ok(pages.length,pattern+' matches a file');
    for(const page of pages){
      const chosen=pick(page);
      assert.equal(chosen.all,false,page+' does not run every test');
      assert.deepEqual(chosen.tests.filter(name=>lane('kernel').includes(name)),[],page+' starts no CAD kernel test');
    }
  }
  assert.ok(pick('templates/preliminary-review/review.html').tests.includes('review-layout.test.mjs'),'the review page runs its browser test');

  // A Python helper named like a script stays with the test that runs it.
  assert.deepEqual(pick('test/mission_boundaries.py').tests,['mechanical-readiness.test.mjs']);
  assert.ok(pick('scripts/mechanical_readiness.py').tests.includes('mechanical-readiness.test.mjs'));

  for(const file of [...map.everything,'unmapped/new-tool.xyz']) assert.equal(pick(file).all,true,file+' runs every test');
  // Listing a new test file in the map runs that file and the map's own test, not the whole suite.
  assert.deepEqual(selectForChange([mapFile,'test/atomic-write.test.mjs'],{reached}).tests,['atomic-write.test.mjs','test-map.test.mjs']);
  assert.match(pick('unmapped/new-tool.xyz').reason,/no test is mapped to unmapped\/new-tool\.xyz/);
  // A deleted file runs the tests that still name it, and the documentation tests when nothing does. It never runs everything.
  const retired=['unmapped','retired-'+'tool.xyz'].join('/'); // assembled, so this file does not name it
  const gone=file=>{const deleted=[file],choice=selectForChange(deleted,{deleted,reached:reach(tests,[...files,...deleted])});return {...choice,tests:choice.tests.filter(name=>name!=='test-map.test.mjs')};};
  assert.deepEqual(gone(retired).tests,[...lane('docs')].sort(),'a deleted file that nothing names runs the documentation tests');
  assert.equal(gone(retired).all,false);
  assert.ok(gone('templates/project-ci/ci.yml').tests.includes('project-ci.test.mjs'),'a deleted file runs a test that names it');
  assert.equal(gone('scripts/test-suite.mjs').all,true,'a deleted runner still runs everything');
  assert.deepEqual(selectForChange(['package.json'],{versionOnly:['package.json'],reached}).tests,[...map.versionTests].sort(),'a version number alone runs the manifest tests');
});
