import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';

const sides=['left','right'];
const holders=sides.map(s=>s+'-holder'),transfers=sides.map(s=>s+'-belt');
const componentIds=[...holders,...transfers,'cross-link','mount'];

function topology(id){
  const shaft=id==='shaft-link',edges=[];
  function link(from,to,requires,basis){edges.push({id:from+'-to-'+to,from,to,requires,basis,state:'modeled'});}
  for(const side of sides){
    link(side,side+'-shaft',[side+'-belt'],'The local flexible drive transmits the downward tier load to its shaft.');
    link(side+'-shaft','fixed-base',[side+'-holder','mount'],'An engaged holder transfers reaction through its support mount.');
  }
  for(const [i,side] of sides.entries()){
    const suffix=shaft?'-shaft':'';
    link(side+suffix,sides[1-i]+suffix,['cross-link'],'This elastic connector transfers differential force in either direction at its actual attachment.');
  }
  return {schema:'agent-frc/unpowered-paths@1',revision:id+'-table-r1',scope:'complete-within-model',
    basis:'Original two-tier teaching fixture. The graph contains every modeled downward load path.',loads:sides,axes:sides.map(load=>({load,alignedZeroMm:0,downSign:1,datum:'Aligned tier reference plane'})),anchors:['fixed-base'],
    anchorEvidence:{'fixed-base':{kind:'fixed-world',state:'modeled',basis:'Grounded support of the tabletop fixture.'}},
    nodes:[...sides,...sides.map(s=>s+'-shaft'),'fixed-base'],components:componentIds.map(id=>({id,basis:'Declared classroom model element.',
      faultWitness:{pointer:'/'+id,failedValue:false}})),edges,faultInventory:{holders,localTransfers:transfers,shared:['cross-link','mount']}};
}
function simulate(id,c,stepS,durationS){
  const channels=Object.fromEntries(componentIds.map(key=>[key,!c.unavailable.includes(key)]));
  const {lostMotionMm,loadN}=c.conditions,dragNsPerMm=2,springNPerMm=4,holdingN=16;
  const link=channels['cross-link']&&(id==='tier-link'||transfers.every(k=>channels[k]));
  const positions=[[0,0]];
  for(let tick=1;tick<=Math.round(durationS/stepS);tick++){
    const old=positions.at(-1),delta=old[1]-old[0];
    const cross=link?Math.sign(delta)*Math.max(0,Math.abs(delta)-lostMotionMm)*springNPerMm:0;
    const next=old.map((x,i)=>{
      const load=loadN+(i===0?cross:-cross);
      const brake=channels.mount&&channels[holders[i]]&&channels[transfers[i]]?holdingN:0;
      const speed=Math.sign(load)*Math.max(0,Math.abs(load)-brake)/dragNsPerMm;
      return x+speed*stepS;
    });
    positions.push(next);
  }
  return {channels,positions};
}
export function makeLiftFaultFixture(dir){
  mkdirSync(dir,{recursive:true});
  function save(name,data){const bytes=JSON.stringify(data)+'\n';writeFileSync(path.join(dir,name),bytes);return {path:name,pointer:'',sha256:digest(bytes)};}
  const graphs=['shaft-link','tier-link'].map(id=>({id,graph:topology(id)}));
  const layouts=graphs.map(l=>({id:l.id,source:save(l.id+'-topology.json',l.graph)}));
  const referenceConditions={lostMotionMm:.25,loadN:6};
  const cases=[['healthy',[]],['left-holder-out',[holders[0]]],['right-holder-out',[holders[1]]],['both-holders-out',holders],
    ['left-belt-out',[transfers[0]]],['right-belt-out',[transfers[1]]],['link-out',['cross-link']],['mount-out',['mount']],
    ['loose-link-and-right-holder-out',[holders[1]]],['right-holder-out-fine',[holders[1]]]].map(([id,unavailable])=>({id,unavailable,basis:'Original model fault injection.',
      conditions:id.startsWith('loose')?{...referenceConditions,lostMotionMm:4}:referenceConditions}));
  const durationS=4,plan=save('plan.json',{schema:'agent-frc/lift-fault-plan@1',layouts,cases,referenceConditions,
    resolutionChecks:[{id:'refined-tier-link',layout:'tier-link',coarse:'right-holder-out',fine:'right-holder-out-fine',peakToleranceMm:.02,crossingToleranceS:.02,basis:'Teaching position scale and coarser native clock step.'}],
    evidence:'integrated-simulation',durationS,maxRackMm:2.5,maxCommonDropMm:5,maxSideDropMm:[6,6],
    thresholdBasis:'Invented two-tier fixture first-contact and permitted descent limits. No service rating.'});
  const runs=[];
  for(const [i,l] of layouts.entries())for(const c of cases){
    const stepS=c.id.endsWith('-fine')?.01:.02,runId=l.id+'-'+c.id,{channels,positions}=simulate(l.id,c,stepS,durationS),revision=graphs[i].graph.revision;
    const controls=save(runId+'-controls.json',{runId,revision,case:c.id,conditions:c.conditions,drivePowered:false,stepS,cutS:0,sampleCount:positions.length,observedThroughS:durationS,initialPositionMm:positions[0],unavailable:c.unavailable,channels,
      intervals:[{fromS:0,toS:durationS,drivePowered:false,channels:'/channels'}],coverage:'executed-state-intervals',coverageBasis:'Power and the selected cut mask are constant inputs over all native ticks.',
      basis:'Channels passed to the original spring, damping and holding equations throughout the power cut.'});
    runs.push({id:runId,layout:l.id,case:c.id,source:save(runId+'-motion.json',{identity:{runId,planSha256:plan.sha256,topologySha256:l.source.sha256,topologyPointer:l.source.pointer,
      topology:l.id,case:c.id,revision,conditions:c.conditions,duty:'unpowered-downward-hold',evidence:'integrated-simulation'},controls,
      axes:graphs[i].graph.axes,positions,
      unit:'mm',stepS,cutS:0,cutWitness:'Teaching drive removed at first tick',coverage:'every-integration-step',coverageBasis:'Paired displacement at each overdamped integration step.'})});
  }
  return save('study.json',{schema:'agent-frc/lift-fault-study@1',plan,runs});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Supply the output directory for the original lesson.');
  console.log(makeLiftFaultFixture(process.argv[2]));
}
