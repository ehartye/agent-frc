import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {validateStudy,impactReport,digest} from './decision-chain.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function validateRollerContext(study,caseBytes,year){
 if(![2024,2025,2026].includes(year))throw Error('Unsupported roller season');
 const branch=year===2024?'fixed-speaker':year===2025?'coral-l1':'fuel-feeder',c=JSON.parse(caseBytes);
 validateStudy(study);if(study.season!==year||c.season!==year)throw Error('Season mismatch');
 const game=study.artifacts.filter(a=>a.kind==='game-analysis').at(-1);
 if(game.content.caseFileSha256!==hash(caseBytes)||game.content.caseContentSha256!==digest(c))throw Error('Case bytes/content changed from graph');
 const pins={},heads=impactReport(study).heads;
 for(const kind of ['strategy-brief','robot-envelope','capability-contract','subsystem-spec']){
  const a=study.artifacts.filter(a=>a.branch===branch&&a.kind===kind).at(-1);
  if(!a||heads.find(x=>x.id===a.id)?.stale)throw Error('Missing/stale candidate artifact');
  pins[kind]={id:a.id,revision:a.revision,sha256:a.sha256};
 }
 return pins;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const year=Number(process.argv[2]);if(![2024,2025,2026].includes(year))throw Error('Unsupported roller season');
 const root=new URL('../',import.meta.url),studyPath='case-studies/'+year+'/prototype-study.json',casePath='case-studies/'+year+'/case.json';
 const sb=fs.readFileSync(new URL(studyPath,root)),cb=fs.readFileSync(new URL(casePath,root));
 const pins=validateRollerContext(JSON.parse(sb),cb,year),files={[studyPath]:hash(sb),[casePath]:hash(cb)};
 for(const name of fs.readdirSync(new URL('scripts/',root)).filter(n=>n.endsWith('.mjs')))files['scripts/'+name]=hash(fs.readFileSync(new URL('scripts/'+name,root)));
 console.log(JSON.stringify({pins,files,scope:'Exact graph integrity/freshness and case consistency; declared provenance is not authentication'}));
}
