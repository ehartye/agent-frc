// Derive this register from the original film and separately evaluated target criterion.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const file=name=>new URL(name,import.meta.url);
const read=async name=>JSON.parse(await readFile(file(name),'utf8'));
const ref=async name=>({file:name,sha256:createHash('sha256').update(await readFile(file(name))).digest('hex')});
const save=(name,obj)=>writeFile(file(name),JSON.stringify(obj,null,2)+'\n');
const film=await ref('stroke.webm');
const source=await read('stroke.json');
const page=await read('stroke-page.json');
const common={revision:page.revision,attempt:'centered',piece:source.piece,clock:'fixture'};
const indices=[0,20,40];
const checkpoints=indices.map(index=>{
  const f=source.frames[index];
  return {...common,checkpoint:'sample-'+index,timeS:f.runS,frame:'fixture',unit:'mm',position:[f.pieceMm,0,0],
    state:{pieceMm:f.pieceMm,jawMm:f.jawMm}};
});
await save('stroke-checkpoints.json',{trace:await ref('stroke.json'),checkpoints});
const frame=source.frames.find(row=>row.pieceMm-8>=105);
await save('stroke-targets.json',{trace:await ref('stroke.json'),clear:{...common,type:'trailing-edge-crossing',
  target:'Target plane',criterion:'Trailing edge first reached 105 mm on the recorded sample clock.',
  kind:'target',qualified:true,timeS:frame.runS}});
const trace=await ref('stroke-checkpoints.json'),observations=await ref('stroke-targets.json');
const chapters=['Extend the jaw','Retract and release'].map((label,i)=>({
  id:'stroke-'+i,label,start:'/checkpoints/'+i,end:'/checkpoints/'+(i+1),
  ...(i?{join:{kind:'checkpoint',tolerance:0}}:{}),sync:[i,i+1].map(j=>({clipS:2*j,runS:checkpoints[j].timeS})),
  events:i?[{id:'clear',pointer:'/clear',type:'trailing-edge-crossing',timeS:frame.runS,outcome:'reached'}]:[]
}));
await save('stroke-chapters.json',{schema:'agent-frc/replay-chapters@1',revision:page.revision,media:film,trace,observations,chapters});
const register=await ref('stroke-chapters.json');
for (const [id,r,label] of [['checkpoints',trace,'Source checkpoints'],['targets',observations,'Target observations'],
  ['chapters',register,'Chapter register']]) {
  page.sources.push({id,...r,label,shareable:true,revision:page.revision});
}
delete page.media[0].motion;
page.media[0].chapters={register:'chapters',trace:'checkpoints',observations:'targets'};
await save('stroke-chapter-page.json',page);
