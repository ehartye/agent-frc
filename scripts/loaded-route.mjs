/** Compare a ground-transport study against five unchanged rehearsal robots. */
import {isDeepStrictEqual} from 'node:util';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {createMatchSeries} from './rehearsal-series-core.mjs';
import {loadScoreObservations} from './score-observations.mjs';
import {validateProfile} from './kickoff.mjs';
import {atPointer,evidenceReader,readStudy} from './study-evidence.mjs';

const rad=Math.PI/180, eps=1e-8;
const point=v=>Array.isArray(v) && v.length===2 && v.every(Number.isFinite);
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const same=(a,b)=>isDeepStrictEqual([...a].sort(),[...b].sort());
function check(ok,message){if(!ok)throw Error(message);}
function names(value){check(Array.isArray(value)&&value.every(v=>typeof v==='string' && v.trim())&&new Set(value).size===value.length,'Expected distinct physical IDs');return value;}
function place(vertex,center,angle) {
  return [center[0]+vertex[0]*Math.cos(angle)-vertex[1]*Math.sin(angle),center[1]+vertex[0]*Math.sin(angle)+vertex[1]*Math.cos(angle)];
}
function validOutline(vertices) {
  check(Array.isArray(vertices) && vertices.length>=3 && vertices.length<=128 && vertices.every(point),'Supply the occupied planar outline in local inches');
  let sign=0;
  for(let i=0;i<vertices.length;i++){
    const p=vertices[i],edge=sub(vertices[(i+1)%vertices.length],p);
    check(Math.hypot(...edge)>eps,'Repeated footprint point');
    for(const v of vertices){
      const rel=sub(v,p),cross=edge[0]*rel[1]-edge[1]*rel[0];
      if(Math.abs(cross)>eps){sign ||= Math.sign(cross);check(Math.sign(cross)===sign,'Footprint must be convex and ordered');}
    }
  }
  check(sign,'Degenerate footprint');
}
// A positive gap on any tested axis separates the two closed convex polygons.
function signedGap(a,b) {
  let best=-Infinity;
  for(const poly of [a,b])for(let i=0;i<poly.length;i++) {
    const edge=sub(poly[(i+1)%poly.length],poly[i]),len=Math.hypot(...edge);
    const n=[-edge[1]/len,edge[0]/len],u=a.map(p=>dot(p,n)),v=b.map(p=>dot(p,n));
    best=Math.max(best,Math.min(...u)-Math.max(...v),Math.min(...v)-Math.max(...u));
  }
  if(best<=eps) return best;
  // A positive face-axis projection underestimates true corner-to-corner distance.
  let distance=Infinity;
  for(const [vertices,edges] of [[a,b],[b,a]])for(const vertex of vertices)for(let i=0;i<edges.length;i++){
    distance=Math.min(distance,segmentDistance(sub(edges[i],vertex),sub(edges[(i+1)%edges.length],vertex)));
  }
  return distance;
}
function innerRadius(poly,center){
  let radius=Infinity,side=0;
  for(let i=0;i<poly.length;i++){
    const edge=sub(poly[(i+1)%poly.length],poly[i]),toward=sub(center,poly[i]);
    const offset=(edge[0]*toward[1]-edge[1]*toward[0])/Math.hypot(...edge);
    if(Math.abs(offset)<=eps)return 0;
    side ||= Math.sign(offset);
    if(side!==Math.sign(offset))return 0;
    radius=Math.min(radius,Math.abs(offset));
  }
  return radius;
}
function closestFraction(start,end) {
  const delta=sub(end,start),square=dot(delta,delta);
  return square?Math.max(0,Math.min(1,-dot(start,delta)/square)):0;
}
function segmentDistance(start,end){
  const delta=sub(end,start),t=closestFraction(start,end);
  return Math.hypot(start[0]+t*delta[0],start[1]+t*delta[1]);
}

function motionFrames(reg,read){
  const spec=reg.motion,raw=read(spec.source),units={m:1/.0254,mm:1/25.4,in:1};
  check(Object.hasOwn(units,spec.units) && ['rad','deg'].includes(spec.angleUnits) &&
    point(spec.fieldOriginIn) && Number.isFinite(spec.fieldYawDeg),'Register coordinate units and the planar source-to-field transform');
  const stock=names(atPointer(raw,spec.inventory)),rows=atPointer(raw,spec.frames);
  check(stock.length && Array.isArray(rows) && rows.length>=2,'Supply an actual named load and a complete sampled window');
  check(typeof spec.basis==='string'&&spec.basis.trim(),'Describe the physical or prescribed source motion');
  const samples=rows.map(row=>{
    const t=atPointer(row,spec.time),xy=atPointer(row,spec.center),yaw=atPointer(row,spec.yaw),onboard=names(atPointer(row,spec.onboard));
    check(Number.isFinite(t)&&t>=0&&point(xy)&&Number.isFinite(yaw)&&onboard.every(id=>stock.includes(id)),'Invalid physical sample or unknown cargo identity');
    return {t,p:place(xy.map(v=>v*units[spec.units]),spec.fieldOriginIn,spec.fieldYawDeg*rad),
      yaw:yaw*(spec.angleUnits==='deg'?rad:1)+spec.fieldYawDeg*rad,onboard};
  });
  const bounds=spec.windowS;
  check(point(bounds)&&bounds[1]>bounds[0] && samples[0].t===bounds[0] && samples.at(-1).t===bounds[1] &&
    samples.every((s,i)=>!i||s.t>samples[i-1].t),'Match the full commissioned physical window and preserve chronological samples');
  check(same(samples[0].onboard,stock),'Initial physical custody differs from the complete registered load');
  for(let i=1;i<samples.length;i++){
    check(samples[i].onboard.every(id=>samples[i-1].onboard.includes(id)),
      'A released article reappears during the same carry; register a separate acquisition duty');
  }
  const envelope=read(reg.footprint.source);
  let outline;
  if(reg.footprint.boundsMm!==undefined){
    const pointers=names(reg.footprint.boundsMm);
    check(pointers.length && !reg.footprint.pointer,'Register the selected local solid bounds');
    const boxes=pointers.map(p=>atPointer(envelope,p));
    check(boxes.every(b=>Array.isArray(b)&&b.length===6&&b.every(Number.isFinite)&&b.slice(0,3).every((v,i)=>v<=b[i+3])),'Invalid source solid XYZ bounds');
    const x0=Math.min(...boxes.map(b=>b[0]))/25.4,y0=Math.min(...boxes.map(b=>b[1]))/25.4;
    const x1=Math.max(...boxes.map(b=>b[3]))/25.4,y1=Math.max(...boxes.map(b=>b[4]))/25.4;
    outline=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  }else outline=atPointer(envelope,reg.footprint.pointer);
  validOutline(outline);
  check(['chassis-only','chassis-and-carried-load'].includes(reg.footprint.scope),'Declare coverage of the loaded footprint');
  check(typeof reg.footprint.basis==='string'&&reg.footprint.basis.trim(),'Identify the installed or conservative loaded envelope');
  let linear=false;
  if(spec.centerLaw!==undefined){
    const law=atPointer(raw,spec.centerLaw);
    check(['sampled','piecewise-linear-between-observations'].includes(law),'Unsupported focal-center interpolation');
    linear=law==='piecewise-linear-between-observations';
  }
  const checkpoints=[];
  for(const definition of spec.checkpoints??[]){
    const records=atPointer(raw,definition.rows);
    check(definition.label?.trim() && records && typeof records==='object','Expected named observed physical checkpoints');
    for(const row of Object.values(records)){
      const id=atPointer(row,definition.piece),t=atPointer(row,definition.time);
      check(stock.includes(id)&&Number.isFinite(t)&&t>=bounds[0]&&t<=bounds[1],'Physical checkpoint falls outside registered cargo or time');
      checkpoints.push({label:definition.label,piece:id,physicalS:t});
    }
  }
  return {stock,samples,outline,linear,checkpoints,scope:reg.footprint.scope,inner:innerRadius(outline,[0,0]),radius:Math.max(...outline.map(p=>Math.hypot(...p)))};
}

function checkClock(reg,context,read,start,physicalStart) {
  if(!context.clock)return false;
  const spec=context.clock,record=read(spec.source);
  const expected={match:context.match,phase:context.phase,focal:reg.focal,matchS:start,physicalS:physicalStart,
    traceSha256:reg.motion.source.sha256,profileSha256:reg.profile.sha256,baselineSha256:reg.baseline.sha256};
  for(const [key,value] of Object.entries(expected)){
    check(typeof spec[key]==='string' && atPointer(record,spec[key])===value,
      'Physical-to-match clock witness differs: '+key);
  }
  if (!spec.samples) return null;
  const rows=atPointer(record,spec.samples.rows);
  check(Array.isArray(rows),'Supply the recorded six-actor pose series');
  return {rows,fields:spec.samples};
}

function confirmRecordedPose(record,index,sample,time,actors,focal) {
  const row=record.rows[index],fields=record.fields;
  const observedMatch=atPointer(row,fields.matchS),observedPhysical=atPointer(row,fields.physicalS);
  check(Number.isFinite(observedMatch) && Number.isFinite(observedPhysical) &&
    Math.abs(observedMatch-time)<eps && Math.abs(observedPhysical-sample.t)<eps,
    'Intermediate clock witness differs');
  function compare(actor,id,xy,yaw) {
    const observed=atPointer(actor,fields.center),heading=atPointer(actor,fields.yaw);
    check(atPointer(actor,fields.id)===id && point(observed) && Number.isFinite(heading) &&
      Math.hypot(...sub(observed,xy))<1e-6 &&
      Math.abs(Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw)))<1e-7,
      'Recorded field pose differs for '+id+' at match '+time);
  }
  const own=atPointer(row,fields.focal),peerRows=atPointer(row,fields.peers);
  compare(own,focal,sample.p,sample.yaw);
  check(same(names(atPointer(own,fields.cargo)),sample.onboard),'Recorded focal cargo differs');
  const peers=actors.filter(r=>r.id!==focal);
  check(Array.isArray(peerRows) && peerRows.length===5 &&
    same(names(peerRows.map(p=>atPointer(p,fields.id))),peers.map(r=>r.id)),'Incomplete recorded peer roster');
  for (const peer of peers) {
    compare(peerRows.find(p=>atPointer(p,fields.id)===peer.id),peer.id,peer.p,peer.heading*rad);
  }
}
function compareContext(engine,match,context,reg,motion,read) {
  const {focal,clearanceIn:margin,entry}=reg;
  const period=engine.periods.find(p=>p.name===context.phase);
  check(period && Number.isFinite(context.offsetS) && context.offsetS>=0,'Unknown phase or offset');
  const start=engine.periods.slice(0,engine.periods.indexOf(period)).reduce((s,p)=>s+engine.elapsedSeconds(p.name),0)+context.offsetS;
  const clockRecord=checkClock(reg,context,read,start,motion.samples[0].t);
  if(clockRecord)check(clockRecord.rows.length===motion.samples.length,'Recorded roster must cover the entire physical window');
  const end=start+motion.samples.at(-1).t-motion.samples[0].t;
  check(context.offsetS+end-start<engine.phaseSeconds(period.name)-eps,'Window must fit within the registered match phase');
  const trial=createMatchSeries(engine,[match]);
  let previous=null,elapsed=0,min=null,firstConflict=null,firstUnbounded=null,continuous=motion.linear;
  let alignment;
  for(const [index,sample] of motion.samples.entries()){
    const time=start+sample.t-motion.samples[0].t,tick=Math.round(time/engine.dt);
    check(Math.abs(tick*engine.dt-time)<eps,'Physical observation does not coincide with an actual rehearsal tick');
    trial.advance(time-elapsed);elapsed=time;
    const sim=trial.sim;
    check(sim.phase===period.name,'Phase clock mismatch');
    const actors=sim.robots,own=actors.find(r=>r.id===focal);
    check(actors.length===6 && new Set(actors.map(r=>r.id)).size===6 &&
      actors.filter(r=>r.side==='blue').length===3 && actors.filter(r=>r.side==='red').length===3 && own,'Expected a frozen 3v3 roster with the focal robot');
    if(clockRecord)confirmRecordedPose(clockRecord,index,sample,time,actors,focal);
    if(!alignment){
      const actual=(sim.game.cargo[focal]??[]).map(p=>p.id);
      const mapped=motion.stock.map(id=>entry.pieceIds[id]);
      const positionErrorIn=Math.hypot(...sub(own.p,sample.p));
      const yawErrorDeg=Math.abs(Math.atan2(Math.sin(own.heading*rad-sample.yaw),Math.cos(own.heading*rad-sample.yaw)))/rad;
      const custody=mapped.every(id=>typeof id==='string'&&id.length)&&new Set(mapped).size===mapped.length&&same(actual,mapped);
      alignment={positionErrorIn,yawErrorDeg,actualFieldIds:actual,physicalIds:motion.stock,fieldIds:mapped,custody,
        matched:positionErrorIn<=entry.positionToleranceIn+eps && yawErrorDeg<=entry.angleToleranceDeg+eps && custody};
    }
    const proposed=motion.outline.map(p=>place(p,sample.p,sample.yaw));
    const points={};
    for(const robot of actors.filter(r=>r.id!==focal)){
      const polygon=engine.geom.footprint(robot.p,robot);
      const gap=signedGap(proposed,polygon);
      if(min===null || gap<min.signedGapIn)min={signedGapIn:gap,peer:robot.id,matchS:time,physicalS:sample.t};
      if(gap<=margin+eps && (!firstConflict || time<firstConflict.matchS)) firstConflict={kind:'observed-pose',peer:robot.id,matchS:time,physicalS:sample.t,signedGapIn:gap,
        focalCenterIn:sample.p,peerCenterIn:[...robot.p],carriedIds:sample.onboard,previousObservationS:previous?.matchS??time,intersection:gap<=eps};
      points[robot.id]=sub(sample.p,robot.p);
      if(previous){
        // One rehearsal tick translates the peer center along a segment. Circumscribed disks include every heading.
        const peerRadius=Math.max(...polygon.map(v=>Math.hypot(...sub(v,robot.p))));
        const begin=previous.points[robot.id],finish=points[robot.id];
        const centerGap=segmentDistance(begin,finish);
        const bound=centerGap-motion.radius-peerRadius;
        const peerInner=innerRadius(polygon,robot.p);
        if(motion.linear && tick===previous.tick+1 && motion.inner>0 && peerInner>0 && centerGap<motion.inner+peerInner-eps){
          const fraction=closestFraction(begin,finish);
          const witness=previous.matchS+fraction*(time-previous.matchS);
          if(fraction>eps && fraction<1-eps && (!firstConflict || witness<firstConflict.matchS)){
            firstConflict={kind:'enclosed-disks-overlap',peer:robot.id,matchS:witness,physicalS:sample.t-(time-witness),
              upperGapIn:centerGap-motion.inner-peerInner,carriedIds:sample.onboard,previousObservationS:previous.matchS,intersection:true};
          }
        }
        if(!motion.linear || tick!==previous.tick+1 || bound<=margin+eps){
          continuous=false;
          firstUnbounded??={peer:robot.id,fromMatchS:previous.matchS,toMatchS:time};
        }
      }
    }
    previous={tick,points,matchS:time};
  }
  // Complete the original roster with the same simulation, including its original focal role.
  const total=engine.periods.reduce((s,p)=>s+engine.elapsedSeconds(p.name),0);
  trial.advance(total-elapsed);
  check(trial.done,'The original match did not reach its cutoff');
  const clearance=firstConflict?'occupied-or-below-margin':continuous?'bounded-clear':'clear-at-samples';
  const disposition=firstConflict?'blocked':continuous&&clockRecord&&alignment.matched&&motion.scope==='chassis-and-carried-load'?'peer-clear-in-frozen-model':'open';
  const checkpoints=motion.checkpoints.map(event=>{
    const matchS=start+event.physicalS-motion.samples[0].t;
    const blocked=firstConflict && firstConflict.matchS<=matchS+eps;
    const unresolved=(!clockRecord || !alignment.matched || motion.scope!=='chassis-and-carried-load' ||
      (firstUnbounded && firstUnbounded.fromMatchS<matchS-eps));
    return {...event,matchS,peerRoute:blocked?'precluded-by-earlier-conflict':unresolved?'open':'permitted-through-observation'};
  });
  return {original:trial.results[0],finding:{match:match.id,phase:period.name,focal,windowMatchS:[start,end],clearance,disposition,
    clockWitness:clockRecord?context.clock.source:null,entry:alignment,checkpoints,minimumSample:min,firstConflict,firstUnbounded,finalPhysicalIds:motion.samples.at(-1).onboard,
    downstream:firstConflict?'Later physical events cannot establish a completion on this route':disposition==='open'?
      'Clock registration, entry, loaded footprint or intersample occupancy remains open':'Peer occupancy permits the modeled ground route; mechanical completion needs its own evidence'}};
}

export function reviewLoadedRoute(reg,read) {
  check(reg.schema==='agent-frc/loaded-route@1','Expected loaded-route@1');
  const profile=validateProfile(read(reg.profile)),history=read(reg.baseline);
  check(history.schema==='agent-frc/rehearsal-series@1' && history.profileSha256===reg.profile.sha256,'Frozen result does not belong to the exact field profile');
  const engine=createFieldRehearsal(profile),matches=profile.rehearsal.series.matches;
  check(history.stepS===engine.dt && history.matches.length===matches.length,'Frozen schedule or tick differs');
  const motion=motionFrames(reg,read),selected=reg.contexts;
  check(Array.isArray(selected)&&selected.length&&new Set(selected.map(c=>c.match)).size===selected.length,'Register distinct match contexts');
  check(typeof reg.focal==='string'&&reg.focal && Number.isFinite(reg.clearanceIn)&&reg.clearanceIn>=0,'Register focal robot and required clearance');
  const entry=reg.entry;
  check(entry && Number.isFinite(entry.positionToleranceIn)&&entry.positionToleranceIn>=0 &&
    Number.isFinite(entry.angleToleranceDeg)&&entry.angleToleranceDeg>=0&&entry.angleToleranceDeg<=180 &&
    entry.pieceIds && typeof entry.pieceIds==='object'&&!Array.isArray(entry.pieceIds),'Register required entry tolerances and piece correspondence');
  const findings=[];
  for(const context of selected){
    const i=matches.findIndex(m=>m.id===context.match);
    check(i!==-1 && history.matches[i].id===context.match,'Unrecognized frozen match or changed order');
    const {original,finding}=compareContext(engine,matches[i],context,reg,motion,read);
    check(isDeepStrictEqual(JSON.parse(JSON.stringify(original)),history.matches[i]),'Original published match did not reproduce: '+context.match);
    findings.push(finding);
  }
  return {schema:'agent-frc/loaded-route-review@1',source:reg.motion.source,field:reg.profile,baseline:reg.baseline,footprint:reg.footprint,
    basis:reg.motion.basis,findings,scope:'Frozen five-peer counterfactual. Scoring, powered motion, structural suitability and partner reactions require independent evidence.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try {
    const [root,input,expected,out,...extra]=process.argv.slice(2);
    check(root&&input&&/^[0-9a-f]{64}$/.test(expected)&&!extra.length,'Usage: loaded-route.mjs PROJECT REGISTRATION.json EXPECTED_SHA256 [NEW_RESULT.json]');
    const {value,sha256}=readStudy(input);
    check(sha256===expected,'Registration differs from the independently frozen SHA-256');
    const read=evidenceReader(root);
    const profile=await loadScoreObservations(read(value.profile),path.resolve(root,value.profile.path));
    const result=reviewLoadedRoute(value,ref=>ref===value.profile?profile:read(ref));
    result.registrationSha256=sha256;
    const json=JSON.stringify(result,null,2)+'\n';
    if(out)writeFileSync(out,json,{flag:'wx'});else process.stdout.write(json);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
