import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('complete mechanical review with geometry and adverse-case controls', {skip:process.env.FRC_TEST_PROFILE==='portable' && 'Run the CAD kernel and rendering controls at the qualified station'},()=>{
  const py=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
  const p=fileURLToPath(new URL('./mechanical_readiness.py',import.meta.url));
  execFileSync(py,[p],{stdio:'pipe'});
  const keyedTorque = fileURLToPath(new URL('../examples/mechanical-readiness/keyed-torque.py', import.meta.url));
  execFileSync(py, ['-B', keyedTorque], {stdio:'pipe'});
});

test('failed successor leaves the already generated page and field-only work usable',async t=>{
  const {buildHighlights}=await import('../scripts/robot-highlights.mjs');
  const root=mkdtempSync(path.join(tmpdir(),'issued-site-'));t.after(()=>rmSync(root,{force:true,recursive:true}));
  const local=path.join(root,'project');cpSync(fileURLToPath(new URL('../examples/highlights/',import.meta.url)),local,{recursive:true});
  const manifest=path.join(local,'project.json'),out=path.join(root,'site'),original=JSON.parse(readFileSync(manifest)),analysis={...original};delete analysis.cad;
  writeFileSync(manifest,JSON.stringify(analysis));const page=await buildHighlights(manifest,out),prior=readFileSync(page);
  writeFileSync(manifest,JSON.stringify(original));await assert.rejects(buildHighlights(manifest,out),/mechanical-readiness review/);
  assert.deepEqual(readFileSync(page),prior);
});
