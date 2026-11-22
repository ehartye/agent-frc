import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';

// Synthetic, nearly balanced inspection flap: 2 kg, 15 mm behind and 200 mm above its pivot, in an assumed
// 10 m/s² field. At the registered pose gravity pulls it 0.3 N·m away from a stop seated in the negative
// direction. A linear closing spring reaches zero 0.2 rad open. The flap is released 0.05 rad open and a
// unilateral spring-damper pad is integrated with a fine explicit step.
export const flapMembers=[{id:'flap',role:'moving',massKg:2,cgM:[-0.015,0,0.2],basis:'synthetic nearly balanced flap'}];
export function dropFlap({preloadNm,dampingNmSPerRad,stiffnessNmPerRad=6000,durationS=1}){
  const J=2*(0.015**2+0.2**2),dt=2e-6,every=50;
  const gravity=q=>0.3*Math.cos(q)+4*Math.sin(q); // gravity torque on the flap about the signed axis
  const spring=q=>preloadNm*Math.max(0,(0.2-q)/0.2); // closing torque toward the negative stop
  let q=0.05,w=0;const t=[],angle=[],torque=[];
  for(let i=0;i*dt<=durationS;i++){
    const R=q<0?Math.max(0,-stiffnessNmPerRad*q-dampingNmSPerRad*w):0;
    if(i%every===0){t.push(Math.round(i*dt*1e6)/1e6);angle.push(q);torque.push(R);}
    w+=dt*(gravity(q)-spring(q)+R)/J;q+=dt*w;
  }
  return {units:{time:'s',torque:'N·m',angle:'rad'},basis:'synthetic explicit integration, 2 µs step, every 50th step recorded',
    timeS:t,restraintTorqueNm:torque,angleRad:angle};
}

export function makeSeatedStopFixture(directory){
  mkdirSync(directory,{recursive:true});
  const save=(name,value)=>{
    const bytes=Buffer.from(JSON.stringify(value,null,1)+'\n');
    writeFileSync(path.join(directory,name),bytes);
    return {path:name,sha256:digest(bytes),pointer:''};
  };
  const cases=[
    {id:'unpreloaded high-loss pad',preloadNm:0,dampingNmSPerRad:40},
    {id:'preloaded high-loss pad',preloadNm:1,dampingNmSPerRad:40},
    {id:'preloaded low-loss pad',preloadNm:1,dampingNmSPerRad:0.5},
  ];
  const poses=cases.map((c,i)=>({id:c.id,frame:'bench +Z up, +X outboard',custody:'empty flap',
    otherAxesHeld:'single rigid flap',originM:[0,0,0],axisUnit:[0,-1,0],intervalRad:[-0.01,0.5],omissions:[],
    members:flapMembers,stop:{freeRad:0,compressionRad:-0.002,
      ...(c.preloadNm?{preload:{law:'linear',torqueNm:c.preloadNm,zeroAtRad:0.2,basis:'synthetic torsion spring'}}:{}),
      compliance:{stiffnessNmPerRad:6000,dampingNmSPerRad:c.dampingNmSPerRad,basis:'synthetic pad'},
      history:{source:save('seated-stop-history-'+(i+1)+'.json',dropFlap(c)),windowsS:[0.01,0.1,0.5],
        contactToleranceRad:0.0009,settle:{targetRad:0,toleranceRad:0.0009}}}}));
  const model=save('seated-stop-model.json',{revision:'Synthetic nearly balanced flap, model A',gravityMps2:[0,0,-10],poses});
  return save('study.json',{schema:'agent-frc/rotary-holding-study@1',source:model}).path;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Supply the teaching study output directory.');
  console.log(path.join(process.argv[2],makeSeatedStopFixture(process.argv[2])));
}
