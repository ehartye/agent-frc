import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {writeDirectoryAtomic,writeFileAtomic} from '../scripts/atomic-write.mjs';

test('a file is replaced whole and a failed write keeps the previous bytes',t=>{
  const root=mkdtempSync(path.join(tmpdir(),'atomic-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'index.json');
  writeFileAtomic(file,'first');writeFileAtomic(file,Buffer.from('second'));
  assert.equal(readFileSync(file,'utf8'),'second');
  // A target that cannot be replaced: the rename fails, the previous content stays and no temporary file remains.
  const blocked=path.join(root,'blocked');mkdirSync(blocked);writeFileSync(path.join(blocked,'kept'),'previous');
  assert.throws(()=>writeFileAtomic(blocked,'next'));
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
