import fs from 'node:fs';
export const MAX_VIEWER_JSON_BYTES=5000000;
export const viewerExitCode=result=>result.status==='matched'?0:result.status==='mismatch'?1:2;
// Read only these two JSON documents, never the artifact paths or URLs they name.
export function readViewerBytes(file){
 const fd=fs.openSync(file,'r');
 try{
  const stat=fs.fstatSync(fd);if(!stat.isFile())throw Error('Input must be a regular JSON file');
  if(stat.size>MAX_VIEWER_JSON_BYTES)throw Error('Input exceeds 5 MB');
  const buffer=Buffer.alloc(MAX_VIEWER_JSON_BYTES+1);let total=0,n;
  while(total<buffer.length&&(n=fs.readSync(fd,buffer,total,buffer.length-total,null))>0)total+=n;
  if(total>MAX_VIEWER_JSON_BYTES)throw Error('Input exceeds 5 MB');
  return buffer.subarray(0,total);
 }finally{fs.closeSync(fd);}
}
export function readViewerJSON(file){
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readViewerBytes(file)));
}
export function runViewerPairCLI({args,compare,schema,usage}){
 let result;
 try{
  if(args.length!==2)throw Error(usage);
  let expected,observed;
  try{expected=readViewerJSON(args[0]);}catch(e){e.inputPath='/inputs/manifest';throw e;}
  try{observed=readViewerJSON(args[1]);}catch(e){e.inputPath='/inputs/receipt';throw e;}
  result=compare(expected,observed);
 }catch(e){result={schema,status:'invalid',issues:[{code:'input-error',path:e.inputPath??'/inputs',reason:e.message}],scope:{evidenceBasis:null,limit:'Inputs were not assessed; no native execution or physical qualification.'}};}
 console.log(JSON.stringify(result,null,2));process.exitCode=viewerExitCode(result);return result;
}
