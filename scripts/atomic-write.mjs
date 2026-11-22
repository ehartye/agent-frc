import {closeSync,fsyncSync,mkdtempSync,openSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const busy=new Set(['EPERM','EBUSY','EACCES']);
function pause(ms){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}
/** Rename, waiting briefly while a reader on Windows holds the target open. */
function rename(from,to){
  for(let attempt=0;;attempt++){
    try{renameSync(from,to);return;}
    catch(e){if(!busy.has(e.code)||attempt===49)throw e;pause(20);}
  }
}
/**
 * Write a file through a temporary file in the same directory, then rename it over the target. A reader sees the
 * previous bytes or the new bytes, never a gap. A failed write leaves the previous file intact.
 */
export function writeFileAtomic(file,data){
  const temp=path.join(path.dirname(file),'.'+path.basename(file)+'.'+process.pid+'.'+Date.now().toString(36)+'.tmp');
  try{
    const handle=openSync(temp,'wx');
    try{writeFileSync(handle,data);fsyncSync(handle);}finally{closeSync(handle);}
    rename(temp,file);
  }catch(e){rmSync(temp,{force:true});throw e;}
}
/**
 * Fill a new directory through a temporary sibling, then rename it into place. `fill` receives the temporary
 * directory. The target appears complete or not at all.
 */
export function writeDirectoryAtomic(directory,fill){
  const temp=mkdtempSync(path.join(path.dirname(directory),'.'+path.basename(directory)+'.tmp-'));
  try{fill(temp);rename(temp,directory);}
  catch(e){rmSync(temp,{recursive:true,force:true});throw e;}
}
