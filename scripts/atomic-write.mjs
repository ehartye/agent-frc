import {closeSync,existsSync,fsyncSync,mkdtempSync,openSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const busy=new Set(['EPERM','EBUSY','EACCES']),busyMs=10000;
function pause(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}
/** Rename, waiting briefly while a reader on Windows holds the target open. */
function rename(from,to,wait=busyMs){
  for(const deadline=Date.now()+wait;;){
    try{renameSync(from,to);return;}
    catch(e){if(!busy.has(e.code)||Date.now()>deadline)throw e;pause(20);}
  }
}
/**
 * Write a file through a temporary file in the same directory, then rename it over the target. A reader sees the
 * previous bytes or the new bytes, never a gap. A failed write leaves the previous file intact.
 */
export function writeFileAtomic(file,data,{busyMs:wait}={}){
  const temp=path.join(path.dirname(file),'.'+path.basename(file)+'.'+process.pid+'.'+Date.now().toString(36)+'.tmp');
  const handle=openSync(temp,'wx');
  try{
    try{writeFileSync(handle,data);fsyncSync(handle);}finally{closeSync(handle);}
    rename(temp,file,wait);
  }catch(e){rmSync(temp,{force:true});throw e;}
}
/**
 * Fill a new directory through a temporary sibling, then rename it into place. `fill` receives the temporary
 * directory. The target appears complete or not at all.
 */
export function writeDirectoryAtomic(directory,fill){
  if(existsSync(directory))throw Error('Directory already exists: '+directory);
  const temp=mkdtempSync(path.join(path.dirname(directory),'.'+path.basename(directory)+'.tmp-'));
  try{fill(temp);rename(temp,directory);}
  catch(e){rmSync(temp,{recursive:true,force:true});throw e;}
}
