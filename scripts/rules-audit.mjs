import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function buildRuleAudit({season,asOf,eventStage}) {
 if(![2024,2025,2026].includes(season))throw Error('No verified study snapshot for selected season');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf||'')||Number.isNaN(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)throw Error('Valid as-of date required');
 if(typeof eventStage!=='string'||!eventStage.trim()||eventStage.length>120)throw Error('Explicit event stage required');
 const data=JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname,'../case-studies/'+season+'/rule-reading-map.json'),'utf8'));
 return {...data,asOf,eventStage,stale:data.reviewDue<asOf,applicability:eventStage==='archive-study'?'study-snapshot-only':'event-edition-needs-resolution',inspectionStatus:'not-assessed',networkAccess:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const options={},args=process.argv.slice(2);for(let i=0;i<args.length;i++){const k=args[i];if(!['--season','--as-of','--event-stage'].includes(k)||!args[i+1])throw Error('Invalid option');const value=args[++i];options[k==='--as-of'?'asOf':k==='--event-stage'?'eventStage':'season']=k==='--season'?Number(value):value;}console.log(JSON.stringify(buildRuleAudit(options),null,2));}
 catch(e){console.error('Rule reading map failed: '+e.message);process.exitCode=1;}
}
