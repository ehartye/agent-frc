import { createHash } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function writePinned(dir,file,value) {
  const bytes=JSON.stringify(value,null,2)+'\n';
  await writeFile(path.join(dir,file),bytes);
  return {file,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export async function example(dir) {
  await mkdir(dir,{recursive:true});
  const save=(file,value)=>writePinned(dir,file,value);
  const sources={};
  for(const [key,data] of Object.entries({
    field:{id:'teaching-course',revision:'A',obstacles:['post']},
    robot:{id:'teaching-carriage',revision:'A',bodies:['frame']},
    transform:{from:'robot',to:'course',length:'m',alignment:'fixture origin'},
    trajectory:{id:'transfer',intervals:[[0,1],[1,2]],basis:'invented teaching evidence'},
  })) sources[key]=await save(key+'.json',data);
  const intervals=[{fromS:0,toS:1,carried:['parcel']},{fromS:1,toS:2,carried:['parcel']}];
  const scenario=await save('scenario.json',{schema:'field-route/scenario@1',clock:'trial',startS:0,
    marginM:.005,robotBodies:['frame'],obstacles:['post'],pieces:['parcel'],sources,intervals});
  const bound={clock:'trial',scenarioSha256:scenario.sha256};
  const detector=await save('detector.json',{schema:'field-route/events@1',...bound,
    sourceEvidence:await save('detector-observation.json',{basis:'synthetic',timeS:2,parcel:'beam-transition'}),
    events:[{id:'beam-transition',piece:'parcel',timeS:2}]});
  const sweep={schema:'field-route/sweep@1',...bound,sourceEvidence:sources.trajectory,refinements:[],intervals:intervals.map(({fromS,toS})=>({
    fromS,toS,method:'continuous-swept-enclosures',moving:{frame:[0,0,0,1,1,1],parcel:[0,0,1,1,1,2]},
    obstacles:{post:[2,0,0,3,1,2]}}))};
  const route=await save('sweep.json',sweep);
  await save('request.json',{scenario,route,detector});
  return {scenario,route,detector,sweep,bound};
}

if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  if(process.argv.length!==3) throw Error('Supply a fresh example directory.');
  await example(process.argv[2]);
}
