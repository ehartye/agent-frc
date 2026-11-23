/**
 * @lane merge
 * @subject scripts/atomic_file.py
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {writeDirectoryAtomic,writeFileAtomic} from '../scripts/atomic-write.mjs';

test('a file is replaced whole and a failed write keeps the previous bytes',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'atomic-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'index.json');
  writeFileAtomic(file,'first');writeFileAtomic(file,Buffer.from('second'));
  assert.equal(readFileSync(file,'utf8'),'second');
  // A target that cannot be replaced: the rename fails, the previous content stays and no temporary file remains.
  const blocked=path.join(root,'blocked');mkdirSync(blocked);writeFileSync(path.join(blocked,'kept'),'previous');
  assert.throws(()=>writeFileAtomic(blocked,'next',{busyMs:0}));
  assert.equal(readFileSync(path.join(blocked,'kept'),'utf8'),'previous');
  assert.deepEqual(readdirSync(root).sort(),['blocked','index.json']);
});

test('a directory appears complete or not at all',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'atomic-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const target=path.join(root,'design-001');
  assert.throws(()=>writeDirectoryAtomic(target,temp=>{writeFileSync(path.join(temp,'receipt.json'),'{}');throw Error('interrupted');}),/interrupted/);
  assert.equal(existsSync(target),false);
  assert.deepEqual(readdirSync(root),[]);
  writeDirectoryAtomic(target,temp=>{
    assert.equal(existsSync(target),false,'nothing is visible while the directory is filled');
    writeFileSync(path.join(temp,'receipt.json'),'{}');
  });
  assert.deepEqual(readdirSync(target),['receipt.json']);
  assert.deepEqual(readdirSync(root),['design-001']);
});

// The layout check and the review scene writer save the receipt and the scene through scripts/atomic_file.py.
test('the Python writer replaces a file whole, keeps the previous bytes on a failed write and never replaces an exclusive target',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'atomic-py-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'receipt.json');writeFileSync(file,'previous');
  const python=process.env.PYTHON??(process.platform==='win32'?'python':'python3');
  const code=['import sys','sys.path.insert(0, sys.argv[1])','from atomic_file import write_atomic','target = sys.argv[2]',
    'write_atomic(target, b"next")','try:','    write_atomic(target, "not bytes")','except TypeError:','    pass',
    'try:','    write_atomic(target, b"other", exclusive=True)','except FileExistsError:','    print("refused")'].join('\n');
  const said=execFileSync(python,['-B','-c',code,fileURLToPath(new URL('../scripts/',import.meta.url)),file],{encoding:'utf8'});
  assert.equal(said.trim(),'refused');
  assert.equal(readFileSync(file,'utf8'),'next','the failed and the exclusive writes left the replaced bytes');
  assert.deepEqual(readdirSync(root),['receipt.json'],'no temporary file is left');
});
