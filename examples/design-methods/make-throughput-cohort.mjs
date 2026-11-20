import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';

// An invented timing model. The carrier waits for the aisle, then returns one block every three seconds.
export function makeThroughputCohort(directory){
  mkdirSync(directory,{recursive:true});
  const save=(name,data)=>{
    const bytes=JSON.stringify(data,null,2)+'\n';
    writeFileSync(path.join(directory,name),bytes);
    return {path:name,pointer:'',sha256:digest(bytes)};
  };
  const demand={criterionId:'receiver-switch',criterion:'Receiver switch observes possession',focalRobot:'carrier',
    outcome:'credited',station:'receiver',requiredPieces:2,windowS:10,anchor:{basis:'phase-start',phase:'work',offsetS:0},
    basis:'Two blocks delivered during the first ten seconds of the work phase.'};
  const conditions=[['clear',0,'evaluation'],['busy',2,'evaluation'],['delayed',5,'held-out']];
  const cases=conditions.map(([id,queueS,partition])=>({id,partition,parameters:{queueS}}));
  const contract={schema:'agent-frc/throughput-cohort@1',demand:save('demand.json',demand),
    evidence:'timing-model',
    axes:[{id:'queueS',unit:'s',type:'number',nativePointer:'/initial/aisleOccupiedS'}]};
  const baseline=save('baseline.json',{...contract,purpose:'characterization',revision:'tabletop-v0',cases:cases.slice(0,2)});
  const freeze=save('freeze.json',{...contract,purpose:'refinement',baseline,revision:'tabletop-v1',cases});
  const episodes=cases.map(c=>{
    const phaseStart=20,cutoff=30;
    const initial={aisleOccupiedS:c.parameters.queueS};
    const events=[],clock=[];
    const blocks=['a','b','c'];
    for(let t=0;t<=32;t++){
      let edge={kind:'sample'};
      if(t===0)edge={kind:'match-start'};
      if(t===phaseStart)edge={kind:'phase-start',phase:'work'};
      if(t===31)edge={kind:'phase-end',phase:'work'};
      if(t===32)edge={kind:'match-end'};
      clock.push({...edge,timeS:t,witness:'carrier clock tick '+t});
      const elapsed=t-phaseStart-initial.aisleOccupiedS;
      if(t>=cutoff||elapsed<0)continue;
      const piece=blocks[Math.floor(elapsed/3)];
      if(!piece)continue;
      if(elapsed%3===0)events.push({kind:'acquire',timeS:t,piece,focalRobot:'carrier',station:'tray'});
      if(elapsed%3===2)events.push({kind:'accept',timeS:t,piece,focalRobot:'carrier',station:'receiver',
        criterionId:demand.criterionId,witness:'receiver switch '+t});
    }
    const receipt={schema:'agent-frc/throughput-execution@1',caseId:c.id,runId:'tabletop-'+c.id,revision:'tabletop-v1',
      evidence:'timing-model',cohortSha256:freeze.sha256,criterionId:demand.criterionId,criterion:demand.criterion,
      focalRobot:'carrier',initial,clock,windowS:[phaseStart,cutoff],initialPieces:blocks,events};
    return {id:c.id,source:save(c.id+'.json',receipt)};
  });
  return save('study.json',{schema:'agent-frc/throughput-study@2',cohort:freeze,episodes});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Supply a directory for the synthetic cohort.');
  console.log(makeThroughputCohort(process.argv[2]));
}
