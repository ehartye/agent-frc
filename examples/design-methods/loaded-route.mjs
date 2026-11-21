/** Original ground-transport exercise: one robot carries a tile while its teammate holds or vacates the lane. */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';
import {createFieldRehearsal} from '../../scripts/field-rehearsal.mjs';
import {createMatchSeries} from '../../scripts/rehearsal-series-core.mjs';

export function makeExercise(root){
  mkdirSync(root,{recursive:true});
  function save(file,data){
    const bytes=JSON.stringify(data,null,2)+'\n';
    writeFileSync(path.join(root,file),bytes,{flag:'wx'});return {path:file,sha256:digest(bytes)};
  }
  const profile=JSON.parse(readFileSync(new URL('../kickoff/training-field.json',import.meta.url)));
  const model=profile.rehearsal;
  model.programs.vacate={label:'Wait clear of the transfer',steps:[{at:[32,132],label:'Leave the pickup lane'}]};
  const matches=['vacate','hold'].map(plan=>{
    const match=structuredClone(model.series.matches[0]);match.id=plan;match.basis='Frozen partner '+plan+'; identical carried tile and focal chassis path';
    for(const r of match.roster){
      r.plans=Object.fromEntries(model.periods.map(p=>[p.name,'hold']));
      if(r.side==='blue' && r.slot===2)r.plans.Opening=plan;
      if(r.side==='blue' && r.slot===1)r.preload={station:'blue-supply',quantity:1};
    }
    return match;
  });
  model.series.matches=matches;
  const field=save('profile.json',profile),engine=createFieldRehearsal(profile),series=createMatchSeries(engine,matches);
  const modelSeconds=model.periods.reduce((s,p)=>s+p.seconds,0)*matches.length;
  series.advance(modelSeconds);
  const baseline=save('series.json',{schema:'agent-frc/rehearsal-series@1',profileSha256:field.sha256,stepS:engine.dt,
    playbackRate:10,modelSeconds,playbackSeconds:modelSeconds/10,matches:series.results});
  const stations=Array.from({length:41},(_,i)=>({seconds:i/20,center:[90,48+i*84/40],yaw:0,onboard:['tile-a']}));
  const motion=save('carriage.json',{stock:['tile-a'],centerLaw:'piecewise-linear-between-observations',stations,checks:[{id:'tile-a',seconds:2}]});
  const footprint=save('occupied-outline.json',{boundsIn:[[-15,-15],[15,-15],[15,15],[-15,15]]});
  const clock=save('clock.json',{profile:field.sha256,baseline:baseline.sha256,trace:motion.sha256,
    departures:matches.map(match=>{
      const recorded=createMatchSeries(engine,[match]);
      recorded.advance(2);
      const samples=stations.map((s,i)=>{
        if(i)recorded.advance(s.seconds-stations[i-1].seconds);
        return {physicalS:s.seconds,matchS:2+s.seconds,focal:{id:'B1',center:s.center,yaw:s.yaw,cargo:s.onboard},
          peers:recorded.sim.robots.filter(r=>r.id!=='B1').map(r=>({id:r.id,center:[...r.p],yaw:r.heading*Math.PI/180}))};
      });
      return {match:match.id,phase:'Opening',focal:'B1',physicalS:0,matchS:2,samples};
    })});
  const registration={schema:'agent-frc/loaded-route@1',focal:'B1',profile:field,baseline,clearanceIn:0,
    entry:{positionToleranceIn:.001,angleToleranceDeg:.001,pieceIds:{'tile-a':'blue-supply/1'}},
    motion:{source:motion,inventory:'/stock',frames:'/stations',time:'/seconds',center:'/center',yaw:'/yaw',onboard:'/onboard',
      units:'in',angleUnits:'deg',fieldOriginIn:[0,0],fieldYawDeg:0,windowS:[0,2],centerLaw:'/centerLaw',checkpoints:[{rows:'/checks',label:'Tile still onboard at the far end',piece:'/id',time:'/seconds'}],basis:'Synthetic fixture; a preloaded tile stays inside a box undergoing a prescribed straight translation.'},
    footprint:{source:footprint,pointer:'/boundsIn',scope:'chassis-and-carried-load',basis:'Box enclosing chassis and internal tile throughout the prescribed exercise'},
    contexts:matches.map((m,i)=>{const row='/departures/'+i;return {match:m.id,phase:'Opening',offsetS:2,
      clock:{source:clock,match:row+'/match',phase:row+'/phase',focal:row+'/focal',physicalS:row+'/physicalS',matchS:row+'/matchS',
        samples:{rows:row+'/samples',matchS:'/matchS',physicalS:'/physicalS',focal:'/focal',peers:'/peers',id:'/id',center:'/center',yaw:'/yaw',cargo:'/cargo'},
        profileSha256:'/profile',baselineSha256:'/baseline',traceSha256:'/trace'}};})};
  const pin=save('registration.json',registration);
  return pin;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv.length!==3)throw Error('Usage: loaded-route.mjs NEW_EXERCISE_DIRECTORY');
  console.log(makeExercise(process.argv[2]).sha256);
}
