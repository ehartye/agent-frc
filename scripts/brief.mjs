import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {lookup} from './lookup.mjs';
const definitions=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../references/workflows.json'),'utf8'));
export function buildBrief(options,env=process.env){
 const {workflow,season,asOf,includeHistorical=false}=options;
 if(!Object.hasOwn(definitions.workflows,workflow))throw Error('Unknown workflow');
 const definition=definitions.workflows[workflow],sources=new Map(),groups=[],unmatchedQueries=[];let mode;
 for(const topic of definition.queries){const result=lookup({topic,season,asOf,includeHistorical},env);mode=result.mode;groups.push(result.records);if(!result.records.length)unmatchedQueries.push(topic);}
 // Interleave query results so one broad query cannot consume the whole display budget.
 for(let i=0;i<20;i++)for(const group of groups)if(group[i])sources.set(group[i].url,group[i]);
 const records=[...sources.values()],shown=records.slice(0,12);
 return {schema:'frc-learning-brief/v1',workflow,title:definition.title,season,asOf,mode,
 evidenceLevel:'metadata-and-original-checklist-only',requiredContext:definition.context,
 steps:definition.steps,acceptance:definition.acceptance,deliverable:definition.deliverable,
 sources:shown,retrievedCandidateCount:records.length,sourcesOmittedFromRetrieved:Math.max(0,records.length-shown.length),lookupPerQueryLimit:20,
 unmatchedQueries,groundingState:!shown.length?'missing-matching-source-links':unmatchedQueries.length?'partial-links-require-reading':'links-require-reading',
 lab:definition.lab?{path:definition.lab,testedBaseline:'Java17 / WPILib2026.2.1 / Windows x86-64',
 status:season===2026?'available-as-separate-pinned-exercise':'not-verified-for-selected-season'}:null,
 rulesAuthority:'requires-current-official-source-review',
 limits:['Static checklist and metadata only; no source body read or automatic rules interpretation',
 'No robot operation, deployment, CAD execution or installed-plugin effectiveness claim',
 'asOf compares review dates; it does not reconstruct historical web content']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const key=args[i];if(key==='--historical')options.includeHistorical=true;else if(['--workflow','--season','--as-of'].includes(key)){if(!args[i+1])throw Error('Missing value');const value=args[++i];options[key==='--as-of'?'asOf':key.slice(2)]=key==='--season'?Number(value):value;}else throw Error('Unknown argument');}console.log(JSON.stringify(buildBrief(options),null,2));}
 catch{console.error('Brief failed: provide --workflow season|java|mechanism-cad|vision|modes|troubleshoot --season YEAR --as-of YYYY-MM-DD; check any explicitly configured catalog.');process.exitCode=1;}
}
