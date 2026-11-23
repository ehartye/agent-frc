/**
 * @lane merge
 * @subject scripts/layout_attachment.py
 * @subject scripts/mechanical_readiness.py
 * @subject scripts/package_budgets.py
 * @subject scripts/preliminary_design.py
 */
import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {availableParallelism,tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test,{describe} from 'node:test';
import {promisify} from 'node:util';

const run=promisify(execFile);

// Each Python test class runs in its own process, several at once. Run one class alone with:
//   npm test -- mechanical-readiness --name FreePath
// The classes and their test counts come from the Python file itself, so a new class or test is picked up without a change here.
const portable=process.env.FRC_TEST_PROFILE==='portable';
const py=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
const hub=fileURLToPath(new URL('./mechanical_readiness.py',import.meta.url));
const classes=portable?{}:JSON.parse(execFileSync(py,[hub,'--list'],{encoding:'utf8'}).trim().split(/\r?\n/).at(-1));
const atOnce=Number(process.env.FRC_TEST_JOBS)||Math.max(1,Math.floor(availableParallelism()/2));

describe('complete mechanical review with geometry and adverse-case controls',{concurrency:atOnce},()=>{
  test('the CAD kernel and rendering controls',{skip:portable && 'Run the CAD kernel and rendering controls at the qualified station'},()=>{
    assert.ok(Object.keys(classes).length>30,'the Python file lists its test classes');
  });
  for(const [name,count] of Object.entries(classes)) test(`${name}: ${count} Python tests`,async()=>{
    const {stderr}=await run(py,[hub,name],{maxBuffer:1<<26});
    assert.match(stderr,new RegExp(`^Ran ${count} tests? `,'m'));
  });
  test('keyed torque example',{skip:portable && 'Run the CAD kernel and rendering controls at the qualified station'},async()=>{
    await run(py,['-B',fileURLToPath(new URL('../examples/mechanical-readiness/keyed-torque.py',import.meta.url))]);
  });
});

test('a results page with a CAD still builds without a mechanical review: it publishes no model of its own',async t=>{
  const {buildHighlights}=await import('../scripts/robot-highlights.mjs');
  const root=mkdtempSync(path.join(tmpdir(),'issued-site-'));t.after(()=>rmSync(root,{force:true,recursive:true}));
  const local=path.join(root,'project');cpSync(fileURLToPath(new URL('../examples/highlights/',import.meta.url)),local,{recursive:true});
  const manifest=path.join(local,'project.json'),out=path.join(root,'site'),original=JSON.parse(readFileSync(manifest));
  // An invented successor: the same page for a design with no readiness review yet.
  writeFileSync(path.join(local,'mounting-plate.step'),'invented successor export');
  writeFileSync(manifest,JSON.stringify({...original,revision:'desk-fixture-r3',sources:original.sources.map(s=>({...s,revision:'desk-fixture-r3'}))}));
  const page=readFileSync(await buildHighlights(manifest,out,{note(){}}),'utf8');
  assert.match(page,/<section id="design"><h2>Explore the design<\/h2>/);assert.doesNotMatch(page,/<iframe/);
});
