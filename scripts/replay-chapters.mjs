import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function check(ok, message) { if (!ok) throw Error(message); }
function label(s) { return typeof s === 'string' && s.trim().length > 0; }
function at(record, pointer) {
  check(typeof pointer === 'string' && pointer.startsWith('/') && !/~(?![01])/.test(pointer), 'Invalid source JSON pointer');
  for (const key of pointer.slice(1).split('/').map(s => s.replace(/~1/g,'/').replace(/~0/g,'~'))) {
    check(record !== null && typeof record === 'object' && Object.hasOwn(record,key), 'Missing source field '+pointer);
    record = record[key];
  }
  return record;
}
const identity = ['revision','attempt','piece','clock'];
function endpoint(record, pointer) {
  const row = at(record,pointer);
  check(row && identity.every(k => label(row[k])) && Number.isFinite(row.timeS),'Invalid source checkpoint');
  return row;
}
function boundary(prev, start, join) {
  if (!prev) {
    check(join === undefined,'First chapter has no preceding boundary');
    return 'Start of recording';
  }
  check(join && ['fixture','position','checkpoint'].includes(join.kind),'Declare the chapter boundary');
  if (join.kind === 'fixture') return 'Separately initialized fixture';
  check(prev.piece === start.piece && prev.revision === start.revision &&
    label(prev.frame) && prev.frame === start.frame && label(prev.unit) && prev.unit === start.unit,
    'Position uses different identity, revision, frame or units');
  const xyz = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  check(xyz(prev.position) && xyz(start.position) && Number.isFinite(join.tolerance) && join.tolerance >= 0,'Invalid position comparison');
  const delta = Math.hypot(...start.position.map((v,i)=>v-prev.position[i]));
  check(delta <= join.tolerance,'Position discontinuity at chapter cut');
  if (join.kind === 'position') return 'Matched position only (difference '+delta+' '+start.unit+', allowance '+join.tolerance+' '+start.unit+')';
  check(identity.every(k=>prev[k] === start[k]) && prev.timeS === start.timeS &&
    label(prev.checkpoint) && start.checkpoint === prev.checkpoint &&
    prev.state && typeof prev.state === 'object' && !Array.isArray(prev.state) && Object.keys(prev.state).length > 0 &&
    isDeepStrictEqual(prev.state,start.state),'Different source state, checkpoint, attempt or clock at cut');
  return 'Shared checkpoint '+start.checkpoint;
}
export function clipTime(anchors, timeS) {
  const end = anchors.findIndex((v,i)=>i>0 && v.runS>=timeS);
  check(end > 0 && timeS >= anchors[0].runS,'Observation outside this clip');
  const a=anchors[end-1], b=anchors[end];
  return a.clipS+(timeS-a.runS)*(b.clipS-a.clipS)/(b.runS-a.runS);
}

export async function checkChapters(filename, project=path.dirname(path.resolve(filename))) {
  const root = await realpath(project);
  const config = JSON.parse(await readFile(filename,'utf8'));
  check(config.schema === 'agent-frc/replay-chapters@1' && label(config.revision),'Invalid replay chapters register');
  async function source(ref) {
    check(ref && label(ref.file) && !path.win32.isAbsolute(ref.file) && !path.isAbsolute(ref.file),'Expected relative source');
    const file=await realpath(path.resolve(root,ref.file)), rel=path.relative(root,file);
    check(rel !== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel),'Source outside project');
    const bytes=await readFile(file);
    check(createHash('sha256').update(bytes).digest('hex') === ref.sha256,'Changed replay source '+ref.file);
    return bytes;
  }
  const [, trace, observed]=await Promise.all([source(config.media),source(config.trace),source(config.observations)]);
  check(new Set([config.media.sha256, config.trace.sha256, config.observations.sha256]).size===3,'Provide distinct media, checkpoints and observation evidence');
  const states=JSON.parse(trace), observations=JSON.parse(observed);
  const type=path.extname(config.media.file).toLowerCase();
  check(['.webm','.mp4','.glb'].includes(type),'Unsupported chapter media');
  check(Array.isArray(config.chapters) && config.chapters.length,'Missing replay chapters');
  let animations;
  if (type === '.glb') {
    const script=fileURLToPath(new URL('./replay_glb.py',import.meta.url));
    const exec=spawnSync(process.env.PYTHON || (process.platform==='win32'?'python':'python3'),
      [script,path.resolve(root,config.media.file),config.media.sha256],
      {input:JSON.stringify(config.chapters),encoding:'utf8'});
    check(exec.status===0,exec.stderr || exec.error?.message || 'Invalid animation');
    animations=JSON.parse(exec.stdout);
  }
  const seen=new Set(), eventIds=new Set(), usedAnimations=new Set();
  let previous, lastClipS;
  const chapters=config.chapters.map((c,i)=>{
    check(label(c.id) && !seen.has(c.id) && label(c.label),'Invalid or duplicate chapter');
    seen.add(c.id);
    const start=endpoint(states,c.start), end=endpoint(states,c.end);
    check(identity.every(k=>start[k]===end[k]) && end.timeS>start.timeS,'Chapter endpoints differ in identity or clock');
    const classification=boundary(previous,start,c.join); previous=end;
    const a=c.sync;
    check(Array.isArray(a) && a.length>=2 && a.every((v,i)=>Number.isFinite(v.clipS) && v.clipS>=0 &&
      Number.isFinite(v.runS) && (!i || v.clipS>a[i-1].clipS && v.runS>a[i-1].runS)) &&
      a[0].runS===start.timeS && a.at(-1).runS===end.timeS,'Invalid clock synchronization for chapter endpoints');
    if (animations) {
      check(label(c.animation) &&
        !usedAnimations.has(c.animation) && a[0].clipS===0,'Missing, ambiguous or repeated named animation');
      usedAnimations.add(c.animation);
      const geometry=animations[i];
      // glTF clocks use float32. Permit its rounding at the last authored key.
      check(a.at(-1).clipS <= geometry.duration + 1e-6,'Observation register exceeds animated media');
      if ((c.join && c.join.kind!=='fixture') || (config.chapters[i+1]?.join && config.chapters[i+1].join.kind!=='fixture')) {
        check(label(c.node) && start.frame==='glTF scene' && start.unit==='m' &&
          end.frame===start.frame && end.unit===start.unit && Math.abs(geometry.firstTime-a[0].clipS)<=1e-6 &&
          Math.abs(geometry.lastTime-a.at(-1).clipS)<=1e-6,'Register the complete root piece translation in glTF scene metres');
        const near=(point,reference)=>Array.isArray(point) && point.length===3 && point.every(Number.isFinite) &&
          Math.hypot(...point.map((x,k)=>x-reference[k]))<=1e-6;
        check(near(start.position,geometry.start) && near(end.position,geometry.end),'Source position differs from actual GLB keys');
        if (c.join && c.join.kind!=='fixture') {
          const prior=animations[i-1];
          check(prior.node===geometry.node && Math.hypot(...geometry.start.map((v,k)=>v-prior.end[k]))<=c.join.tolerance,
            'Actual piece occurrence or GLB endpoint differs across the cut');
        }
      }
    } else {
      check(c.animation===undefined && (lastClipS === undefined ? a[0].clipS===0 : a[0].clipS>=lastClipS),
        'Overlapping or misordered video chapters');
    }
    lastClipS=a.at(-1).clipS;
    check(Array.isArray(c.events),'Missing chapter event list');
    const events=c.events.map(e=>{
      const v=at(observations,e.pointer);
      check(label(e.id) && !eventIds.has(e.id),'Duplicate or invalid event ID'); eventIds.add(e.id);
      check(v && identity.every(k=>start[k]===v[k]) && label(e.type) && v.type===e.type &&
        Number.isFinite(e.timeS) && e.timeS===v.timeS,'Independent event identity, type or time differs');
      check(label(v.target) && label(v.criterion) && ['target','score'].includes(v.kind),'Invalid source target criterion');
      const outcome=v.qualified===null?'unresolved':v.qualified===false?'missed':v.kind==='score'?'scored':'reached';
      check([true,false,null].includes(v.qualified) && e.outcome===outcome && (v.kind!=='score'||label(v.rule)),
        'Independent event qualification or rule differs');
      return {id:e.id,type:v.type,target:v.target,criterion:v.criterion,rule:v.rule,outcome,timeS:v.timeS,
        clipS:clipTime(a,v.timeS),pointer:e.pointer};
    });
    return {id:c.id,label:c.label,classification,animation:c.animation,revision:start.revision,attempt:start.attempt,
      piece:start.piece,clock:start.clock,startS:a[0].clipS,endS:lastClipS,events};
  });
  return {schema:'agent-frc/verified-chapters@1',revision:config.revision,mediaSha256:config.media.sha256,
    traceSha256:config.trace.sha256,observationsSha256:config.observations.sha256,chapters};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    check(process.argv.length===3 || process.argv.length===4,'Usage: replay-chapters.mjs CHAPTERS.json [PROJECT]');
    console.log(JSON.stringify(await checkChapters(process.argv[2],process.argv[3]),null,2));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
