import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';

const dt=.05,clock=i=>Math.round(i*dt*1000)/1000;
const coverage={coverage:'every-native-step',coverageBasis:'Extrema of each original piecewise-linear teaching step.'};

function move(identity,delayed,brake){
  const cut=2,finish=6,engaged=brake?2.2:0;
  const positions=[],intervals=[];
  let stroke=0;
  for(let i=0;clock(i)<=finish;i++){
    const t=clock(i),powered=t<cut,previous=stroke;
    if(i>0){
      const prior=clock(i-1);
      if(prior<cut)stroke=Math.min(.10,stroke+.08*dt);
      else if(delayed&&(!brake||prior<engaged))stroke=Math.max(0,stroke-.004*dt);
      intervals.push({fromS:prior,toS:t,minStrokeM:Math.min(stroke,previous),maxStrokeM:Math.max(stroke,previous),
        minClearanceM:.6*Math.min(stroke,previous),maxClearanceM:.6*Math.max(stroke,previous),
        powered:prior<cut,loadRetained:true,holderId:identity.holder,holderEngaged:!brake||prior>=engaged,
        minHoldForceN:35,maxHoldForceN:35,witness:'Native carriage step '+i});
    }
    positions.push({timeS:t,powered,strokeM:stroke,clearanceM:.6*stroke,loadRetained:true,witness:'Carriage pose '+i});
  }
  return {identity:{...identity,duty:'powered-motion-and-loss',runId:identity.runId+'/motion'},...coverage,
    start:{kind:'drive-powered',timeS:0,witness:'Drive bus on'},cut:{kind:'drive-supply-removed',timeS:cut,witness:'Drive bus off'},
    positions,intervals,holder:{id:identity.holder,kind:brake?'observed-passive-brake':'observed-passive-load-path',powered:false,
      engagedAtS:engaged,witness:brake?'Passive latch state transition':'Passive guide friction in the native carriage model'}};
}

function obstruct(identity,delayed,brake){
  const intervals=[];let force=0,trigger=null,applied=null;
  for(let i=1;clock(i)<=2;i++){
    const t=clock(i),prior=clock(i-1),previous=force;
    if(applied===null)force+=100*dt;
    else force=Math.max(0,force-160*dt);
    if(trigger===null&&force>=60)trigger=t;
    if(brake&&applied===null&&trigger!==null&&t>=trigger+(delayed?.4:.15)-1e-9)applied=t;
    intervals.push({fromS:prior,toS:t,output:identity.output,blocked:true,device:identity.protector,effectSource:'native-output-state',drivePowered:applied===null||prior<applied,
      minForceN:Math.min(previous,force),maxForceN:Math.max(previous,force),witness:'Native spring force '+i});
  }
  return {identity:{...identity,duty:'powered-obstruction',runId:identity.runId+'/jam'},...coverage,
    blocked:{kind:'powered-output-blocked',output:identity.output,powered:true,timeS:0,positionM:.03,witness:'Carriage against stop'},
    intervals,protection:{device:identity.protector,kind:brake?'observed-controller-action':'speed-cutoff',axialTripN:60,effect:'drive-disabled',
      triggerS:trigger,appliedS:applied,triggerWitness:'Force comparator changed',actionWitness:brake?'Drive current disabled in model':'Speed command held at zero'}};
}

export function makeActuatorDutyFixture(folder){
  mkdirSync(folder,{recursive:true});
  function save(file,value){
    const bytes=JSON.stringify(value,null,2)+'\n';writeFileSync(path.join(folder,file),bytes);
    return {path:file,pointer:'',sha256:digest(bytes)};
  }
  const cases=[{id:'ordinary',startId:'loaded-low',settings:{disturbance:'ordinary'}},{id:'delayed',startId:'loaded-low',settings:{disturbance:'low-friction-and-lag'}}];
  const architectures=['drive-only','separate-trip-and-latch'].map((id,i)=>{
    const a={id,revision:id+'-r1',output:'carriage-branch',protector:i?'force-switch':'speed-clamp',holder:i?'spring-latch':'guide-friction',
      tripRangeN:[58,62],protectionRequirement:'demonstrate-action'};
    const common={architecture:id,revision:a.revision,output:a.output,unit:'N',scope:'complete-installed-load-path',
      evidence:'teaching-assumption',durationS:10,basis:'Invented working envelope of the entire classroom branch.'};
    a.allowable=save(id+'-jam-rating.json',{...common,kind:'approved-service-envelope',duty:'powered-obstruction',positiveN:90,negativeN:70});
    a.holdingAllowable=save(id+'-holding-rating.json',{...common,kind:'approved-unpowered-hold-envelope',device:a.holder,powerState:'unpowered',positiveN:50,negativeN:50});
    return a;
  });
  const plan=save('plan.json',{schema:'agent-frc/actuator-duty-plan@1',purpose:'teaching',evidence:'integrated-simulation',
    basis:'Review powered travel, branch force at a jam and four seconds after removal of drive power.',factor:1,architectures,cases,
    normal:{minStrokeM:.095,minClearanceM:.055,deadlineS:2},obstruction:{positionM:[.029,.031],windowS:2,postActionS:.5},
    hold:{minStrokeM:.09,minClearanceM:.05,durationS:4}});
  const entries=[];
  for(const a of architectures)for(const c of cases){
    const id=a.id+'-'+c.id,identity={planSha256:plan.sha256,architecture:a.id,revision:a.revision,output:a.output,protector:a.protector,
      holder:a.holder,startId:c.startId,caseId:c.id,settings:c.settings,runId:id,evidence:'integrated-simulation'};
    const args=[identity,c.id==='delayed',a.id==='separate-trip-and-latch'];
    entries.push({id,architecture:a.id,caseId:c.id,motion:save(id+'-motion.json',move(...args)),obstruction:save(id+'-jam.json',obstruct(...args))});
  }
  return save('study.json',{schema:'agent-frc/actuator-duty-study@1',plan,entries});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Supply the original teaching study output directory.');
  console.log(makeActuatorDutyFixture(process.argv[2]));
}
