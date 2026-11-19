import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkChapters } from '../scripts/replay-chapters.mjs';
import { buildHighlights } from '../scripts/robot-highlights.mjs';

test('checked chapter joins and target events survive the student build',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'chapter-check-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(new URL('../examples/highlights/',import.meta.url),root,{recursive:true});
  const file=n=>path.join(root,n);
  const read=async n=>JSON.parse(await readFile(file(n),'utf8'));
  const put=async (name,obj)=>{
    const bytes=JSON.stringify(obj);await writeFile(file(name),bytes);
    return createHash('sha256').update(bytes).digest('hex');
  };
  const register='stroke-chapters.json', original=await read(register);
  const issue=async (cfg,pattern)=>{await put(register,cfg);await assert.rejects(checkChapters(file(register)),pattern);};
  const markup=await readFile(await buildHighlights(file('stroke-chapter-page.json'),file('site')),'utf8');
  assert.match(markup,/Shared checkpoint sample-20/);assert.ok(Math.abs(Number(markup.match(/data-clip-time="([^"]+)">Target plane . reached/)[1])-3.1)<1e-9);
  const e=original.chapters[1].events[0];
  for (const patch of [{type:'counted'}, {timeS:12.4},{outcome:'scored'}]) {
    const cfg=structuredClone(original);Object.assign(cfg.chapters[1].events[0],patch);
    await issue(cfg,/event identity, type or time|event qualification/);
  }
  const trace=await read(original.trace.file);
  const newStart=structuredClone(trace.checkpoints[1]);
  trace.checkpoints.push(newStart);
  const cfg=structuredClone(original);cfg.chapters[1].start='/checkpoints/3';
  newStart.state.jawMm+=1;
  cfg.trace.sha256=await put(cfg.trace.file,trace);
  await issue(cfg,/Different source state/);
  cfg.chapters[1].join.kind='position';
  await put(register,cfg);assert.match((await checkChapters(file(register))).chapters[1].classification,/position only/);
  newStart.position[0]+=2;cfg.trace.sha256=await put(cfg.trace.file,trace);await issue(cfg,/Position discontinuity/);
  cfg.chapters[1].join.kind='fixture';await put(register,cfg);
  assert.match((await checkChapters(file(register))).chapters[1].classification,/Separately initialized/);
  const obs=await read(cfg.observations.file);
  for (const [value,expected] of [[false,'missed'],[null,'unresolved'],[true,'scored']]) {
    Object.assign(obs.clear,{kind:'score',rule:'Counter must confirm passage',qualified:value});
    cfg.observations.sha256=await put(cfg.observations.file,obs);
    cfg.chapters[1].events[0]={...e,outcome:expected};
    await put(register,cfg);assert.equal((await checkChapters(file(register))).chapters[1].events[0].outcome,expected);
    cfg.chapters[1].events[0].outcome='reached';await issue(cfg,/qualification/);
  }
  cfg.observations.sha256='0'.repeat(64);await issue(cfg,/Changed replay source/);
});

test('animated GLB checks the packed clocks and the piece origin across named clips',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'glb-chapters-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp(new URL('../examples/highlights/',import.meta.url),root,{recursive:true});
  const use=name=>path.join(root,name);
  const cfg=JSON.parse(await readFile(use('stroke-chapters.json'),'utf8'));
  const trace=JSON.parse(await readFile(use(cfg.trace.file),'utf8'));
  for (const row of trace.checkpoints) {row.frame='glTF scene';row.unit='m';row.position=[row.timeS-10,0,0];}
  const bytes=JSON.stringify(trace);await writeFile(use(cfg.trace.file),bytes);
  cfg.trace.sha256=createHash('sha256').update(bytes).digest('hex');
  for (const [i,chapter] of cfg.chapters.entries()) {
    chapter.animation=chapter.id;chapter.node='sample';chapter.sync.forEach(a=>{a.clipS-=2*i;});
  }
  const bin=Buffer.alloc(56);
  for(const [i,v] of [0,2,0,0,0,2,0,0,2,0,0,4,0,0].entries()) bin.writeFloatLE(v,i*4);
  const gltf={asset:{version:'2.0'},scenes:[{nodes:[0]}],scene:0,nodes:[{name:'sample',mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:1},mode:0}]}],buffers:[{byteLength:56}],
    bufferViews:[[0,8],[8,24],[32,24]].map(([byteOffset,byteLength])=>({buffer:0,byteOffset,byteLength})),
    accessors:['SCALAR','VEC3','VEC3'].map((type,bufferView)=>({bufferView,type,count:2,componentType:5126})),
    animations:cfg.chapters.map((c,i)=>({name:c.animation,samplers:[{input:0,output:i+1}],
      channels:[{sampler:0,target:{node:0,path:'translation'}}]}))};
  async function issue(){
    const json=Buffer.from(JSON.stringify(gltf)), meta=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(meta);
    const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+meta.length+bin.length,8);
    header.writeUInt32LE(meta.length,12);header.write('JSON',16);
    const chunk=Buffer.alloc(8);chunk.writeUInt32LE(bin.length);chunk.write('BIN',4);
    const data=Buffer.concat([header,meta,chunk,bin]);await writeFile(use('replay.glb'),data);
    cfg.media={file:'replay.glb',sha256:createHash('sha256').update(data).digest('hex')};
    await writeFile(use('chapters.json'),JSON.stringify(cfg));return checkChapters(use('chapters.json'));
  }
  assert.equal((await issue()).chapters[1].events[0].clipS,13.1-12);
  bin.writeFloatLE(2.25,32);await assert.rejects(issue,/actual GLB keys/);
  bin.writeFloatLE(2,32);bin.writeFloatLE(1.5,4);await assert.rejects(issue,/exceeds animated media/);
  bin.writeFloatLE(2,4);gltf.animations[1].name=gltf.animations[0].name;await assert.rejects(issue,/ambiguous animation/);
});
