import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {lookup} from './lookup.mjs';
import {buildBrief} from './brief.mjs';
const root=path.resolve(import.meta.dirname,'..');
const spec=JSON.parse(fs.readFileSync(path.join(root,'eval/grounding-cases.json'),'utf8'));
const allowed=new Set(['id','title','url','versionScope','seasons','authorityState','reviewed','reviewDue','stale','license','handling','limits']);
const results=spec.cases.map(c=>{
 const options={asOf:spec.defaultAsOf,...c.options};let output,error=false;
 try{output=c.operation==='brief'?buildBrief(options,{}):lookup(options,{});}catch{error=true;}
 const records=output?.records||output?.sources||[];
 const ids=records.map(r=>r.id);
 const failures=[];
 if(Boolean(c.expectError)!==error)failures.push('error expectation');
 if(!error){
  if(output.mode!=='public-reference-only')failures.push('mode');
  if(c.expectEvidenceLevel&&output.evidenceLevel!==c.expectEvidenceLevel)failures.push('evidence level');
  if(c.expectLabStatus&&output.lab?.status!==c.expectLabStatus)failures.push('lab compatibility');
  if(c.operation==='brief'&&(!output.steps?.length||output.rulesAuthority!=='requires-current-official-source-review'))failures.push('brief contract');
  for(const id of c.include||[])if(!ids.includes(id))failures.push('missing '+id);
  for(const id of c.exclude||[])if(ids.includes(id))failures.push('unexpected '+id);
  if(c.atLeastOneStale&&!records.some(r=>r.stale===true))failures.push('staleness missing');
  if(records.some(r=>Object.keys(r).some(k=>!allowed.has(k))))failures.push('unexpected metadata field');
 }
 return {id:c.id,options,selectedIds:ids,error,passed:failures.length===0,failures};
});
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const record={schema:'frc-grounding-results/v1',asOf:spec.defaultAsOf,scope:spec.scope,
 inputs:['scripts/lookup.mjs','references/public-sources.json','eval/grounding-cases.json','scripts/brief.mjs','references/workflows.json'].map(file=>({file,sha256:hash(file)})),
 passed:results.filter(r=>r.passed).length,total:results.length,results,
 limits:['No language-model response was generated or graded','No installed-host or user study','asOf compares review dates; it does not reconstruct a historical web snapshot']};
console.log(JSON.stringify(record,null,2));if(record.passed!==record.total)process.exitCode=1;
