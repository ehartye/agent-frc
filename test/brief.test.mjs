import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {buildBrief} from '../scripts/brief.mjs';
const base={season:2096,asOf:'2096-11-15'};
test('installed mode and mechanism brief queries resolve to relevant primary sources',()=>{
  for (const [workflow,query,id] of [['modes','autonomous','P06'],['mechanism-cad','mechanisms','P14']]) {
    const brief=buildBrief({...base,workflow},{});
    assert.equal(brief.mode,'public-reference-only');
    assert.ok(!brief.unmatchedQueries.includes(query));
    assert.ok(brief.sources.some(source=>source.id===id));
  }
});
test('Public brief requires explicit context and returns actionable checks',()=>{const b=buildBrief({...base,workflow:'modes'},{});assert.equal(b.mode,'public-reference-only');assert.ok(b.requiredContext.length>=3);assert.ok(b.steps.length>=3);assert.ok(b.sources.some(s=>s.id==='P06'));});
test('Future season does not imply pinned lab compatibility',()=>{const b=buildBrief({...base,season:2097,workflow:'java'},{});assert.equal(b.lab,null);assert.ok(b.sources.some(s=>s.id==='P06'));});
test('Invalid workflow and impossible date fail before a brief is returned',()=>{assert.throws(()=>buildBrief({...base,workflow:'__proto__'},{}));assert.throws(()=>buildBrief({...base,workflow:'modes',asOf:'2096-02-30'},{}));});
test('Brief reports evidence level and refuses automatic rule authority',()=>{const b=buildBrief({...base,workflow:'season'},{});assert.equal(b.rulesAuthority,'requires-current-official-source-review');assert.equal(b.evidenceLevel,'metadata-and-original-checklist-only');assert.equal(b.lab,null);});
test('Source bounds and omitted retrieved count remain explicit',()=>{const b=buildBrief({...base,workflow:'java'},{});assert.ok(b.sources.length<=12);assert.equal(b.sourcesOmittedFromRetrieved,b.retrievedCandidateCount-b.sources.length);assert.equal(b.lookupPerQueryLimit,20);});
test('Explicit catalog cannot smuggle source bodies or paths into a brief',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frc-brief-'));try{fs.mkdirSync(path.join(dir,'catalog'));fs.writeFileSync(path.join(dir,'catalog/sources.json'),JSON.stringify({schema:'frc-source-catalog/v1',as_of:'2096-11-15',sources:[{id:'fixture',title:'commands fixture',url:'https://example.org/source',seasons:[2096],privateBody:'SENTINEL_BODY',capture_path:'SENTINEL_PATH'}]}));const b=buildBrief({...base,workflow:'java'},{FRC_VAULT_PATH:dir});assert.equal(b.mode,'explicit-local-vault');assert.ok(b.unmatchedQueries.length>0);assert.equal(b.groundingState,'partial-links-require-reading');assert.ok(b.sources.some(s=>s.id==='fixture'));assert.ok(!JSON.stringify(b).includes('SENTINEL'));}finally{const base=fs.realpathSync(os.tmpdir());const target=fs.realpathSync(dir);const relative=path.relative(base,target);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));fs.rmSync(target,{recursive:true,force:true});}});
test('Query groups share the display budget',()=>{const t=buildBrief({...base,workflow:'troubleshoot'},{});assert.ok(t.sources.some(s=>s.id==='PUBLIC-PN03'));});
import { execFileSync } from 'node:child_process';

test('public 2095 mechanism brief routes an existing design to its packaged guide', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const env = { ...process.env };
  delete env.FRC_VAULT_PATH;
  const output = execFileSync(process.execPath, [
    path.join(root, 'scripts/brief.mjs'), '--workflow', 'mechanism-cad',
    '--season', '2095', '--as-of', '2096-11-18'
  ], { env, cwd: os.tmpdir(), encoding: 'utf8' });
  const brief = JSON.parse(output);
  assert.equal(brief.schema, 'frc-learning-brief/v1');
  assert.equal(brief.mode, 'public-reference-only');
  assert.equal(brief.season, 2095);
  assert.equal(brief.asOf, '2096-11-18');
  assert.ok(brief.sources.length > 0);
  assert.ok(brief.steps.includes('Sketch acquisition, transfer, staging and release states'));
  assert.ok(brief.requiredContext.includes('Game-piece geometry and season envelope'));

  const guide = 'docs/strategy-first-continuation.md';
  const step = brief.steps.find(text => text.includes(guide));
  assert.ok(step, 'returning teams need a route to the continuation guide');
  assert.match(step, /existing design/i);
  assert.match(step, /selected strategy/i);
  assert.match(step, /latest test result/i);
  assert.match(step, /plugin root/i);
  assert.ok(fs.statSync(path.join(root, guide)).isFile());

  const other = buildBrief({workflow: 'vision', season: 2095, asOf: '2096-11-18'}, {});
  assert.ok(other.steps.every(text => !text.includes(guide)));
});
