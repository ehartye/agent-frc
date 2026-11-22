import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('season review appends immutable releases and refuses a changed source', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'preliminary-releases-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = path.join(root, 'cad', 'preliminary-design');
  const site = path.join(root, 'docs', 'preliminary-design');
  await mkdir(author, { recursive: true });
  const script = path.join(author, 'stage.py');
  await writeFile(script, await readFile(fileURLToPath(new URL('../templates/stage-preliminary-review.py', import.meta.url))));
  async function fixture(id) {
    const dir = path.join(author, 'releases', id);
    await mkdir(dir, { recursive: true });
    async function pin(file, content) {
      await writeFile(path.join(dir, file), content);
      return { file, sha256: createHash('sha256').update(content).digest('hex') };
    }
    const motion = await pin('paths.json', '{"cases":[]}');
    const view = await pin('viewer.html', '<html>'+id+'</html>');
    const limits = await pin('package-limits.json', '{"inspectionLimitKg":14}');
    const budgets = await pin('budgets.json', JSON.stringify({requirements: limits, masses: [], electricalCases: {}}));
    const plan = await pin('layout.json', JSON.stringify({motion, budgets, view: view.file}));
    await pin('receipt.json', JSON.stringify({planSha256: plan.sha256, view: {...view, verified: true}, issue: 'synthetic-' + id,
      status: 'layout-checked', missingInputs: [], reopen: [], step: {file: 'package.step', sha256: 'a'.repeat(64)}, motion,
      stages: {turn: {purpose: 'operating'}}, cycle: ['turn'], control: {witness: {pair: ['head', 'rail'], status: 'fail'}},
      budgets: {source: budgets, limits, massStatus: 'pass', electricalCases: [{case: 'weak', status: 'pass'}]},
      cases: [{case: 'turn', status: 'pass'}], narrativeReview: {objectives: [{objective: 'Move the sample', disposition: 'represented'}]}}));
    await pin('missions.json', JSON.stringify({missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample'}]}));
    return dir;
  }
  const stage = id => spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [script, id], {encoding: 'utf8'});
  const a = await fixture('a');
  await writeFile(path.join(a, 'missions.json'), JSON.stringify({missionCases: []}));
  assert.match(stage('a').stderr, /mission-task case/);
  await writeFile(path.join(a, 'missions.json'), JSON.stringify({missionCases: [{case: 'turn', kind: 'operating-case', accomplishes: 'admired', objective: 'Move the sample'}]}));
  assert.match(stage('a').stderr, /Mission case turn/);
  await fixture('a');
  assert.equal(stage('a').status, 0);
  const record = JSON.parse(await readFile(path.join(site, 'releases', 'a', 'release.json')));
  assert.equal(record.label, 'Work-in-progress preliminary design');
  assert.equal(record.view.sha256, createHash('sha256').update('<html>a</html>').digest('hex'));
  assert.deepEqual(record.missionCases.map(m => m.case), ['turn']);
  const b = await fixture('b');
  await writeFile(path.join(b, 'paths.json'), 'changed');
  assert.match(stage('b').stderr, /Missing or changed release input/);
  await writeFile(path.join(b, 'paths.json'), '{"cases":[]}');
  assert.equal(stage('b').status, 0);
  assert.match(stage('a').stderr, /Release already exists/);
  assert.deepEqual(JSON.parse(await readFile(path.join(site,'releases.json'))), {current:'b',releases:['a','b']});
  const listing = path.join(site, 'releases.json');
  await writeFile(listing, JSON.stringify({current:'a',releases:['a']}));
  assert.match(stage('--check-index').stderr, /immutable directories disagree/);
  await fixture('c');
  assert.notEqual(stage('c').status, 0);
  assert.equal(stage('b').status, 0, 'resume an interrupted index update using the original bytes');
  assert.equal(stage('--check-index').status, 0);
  for (const id of ['a','b'])
    assert.equal(await readFile(path.join(site,'releases',id,'index.html'),'utf8'), '<html>'+id+'</html>');
  // A release published before release records existed fails the check until it is listed as legacy.
  const old = path.join(site, 'releases', 'old');
  await mkdir(old);
  await writeFile(path.join(old, 'index.html'), '<html>old</html>');
  await writeFile(path.join(old, 'receipt.json'), JSON.stringify({view: {sha256: createHash('sha256').update('<html>old</html>').digest('hex')}}));
  await writeFile(listing, JSON.stringify({current:'b',releases:['old','a','b']}));
  assert.match(stage('--check-index').stderr, /no release record/);
  await writeFile(listing, JSON.stringify({current:'b',releases:['old','a','b'],legacy:['old']}));
  assert.equal(stage('--check-index').status, 0);
  await writeFile(listing, JSON.stringify({current:'b',releases:['old','a','b'],legacy:['old','b']}));
  assert.match(stage('--check-index').stderr, /earliest entries/, 'a legacy entry cannot excuse a later release');
});
