// Original discrete-event teaching fixture. Times are assumed, not measured hardware properties.
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readStudy,evidenceReader} from '../../scripts/study-evidence.mjs';
import {deriveRoleDemand} from '../../scripts/role-handoff.mjs';

export function simulateFixture(demand) {
  const d=demand.identity, runs={};
  for(const concept of ['shared','independent']){
    runs[concept]={};
    for(const [condition,availableAt] of [['nominal',0],['receiver-busy',12]]){
      const initialPieces=Object.values(demand.openingStock).flat();
      const preloadedPieces=[...demand.preloadedPieces];
      const events=[],runId=concept+'/'+condition;
      const [startS,endS]=d.windowS;
      let robotAvailable=startS,receiverAvailable=startS+availableAt;
      for(const [i,piece] of [...preloadedPieces,...initialPieces].entries()){
        const preloaded=i<preloadedPieces.length;
        const pickup=robotAvailable+3;
        if(!preloaded&&pickup<endS)events.push({timeS:pickup,piece,kind:'acquire',station:'blue-supply',focalRobot:d.focalRobot,witness:'Pickup dwell completed.'});
        const releaseStart=Math.max((preloaded?startS:pickup)+3,receiverAvailable);
        const accepted=releaseStart+3;
        if(accepted>=endS)break;
        events.push({timeS:accepted,piece,kind:'accept',station:d.station,focalRobot:d.focalRobot,witness:'Receiver dwell completed.'});
        receiverAvailable=accepted+4;
        robotAvailable=concept==='shared'?receiverAvailable:accepted;
      }
      runs[concept][condition]={concept,case:condition,runId,lastAcceptedS:events.filter(e=>e.kind==='accept').at(-1)?.timeS??null,
        roleEpisode:'/runs/'+concept+'/'+condition+'/episode',
        episode:{concept,case:condition,runId,contractKey:demand.contractKey,phase:d.phase,station:d.station,
          criterion:d.criterion,focalRobot:d.focalRobot,revision:concept+'-fixture-r1',evidence:'timing-model',
          windowS:d.windowS,fieldConditions:demand.fieldConditions,
          clockWitnesses:[{timeS:startS,witness:'Simulator initialized.'},{timeS:endS,witness:'Complete window evaluated, including idle tail.'}],
          variation:{receiverAvailableS:availableAt},initialPieces,preloadedPieces,events}};
    }
  }
  return {basis:'Original teaching model. One drive, one receiver, finite identified stock, serial or independent reset.',
    runs};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root=fileURLToPath(new URL('../..',import.meta.url));
  const selection=readStudy(path.join(root,'examples/design-methods/role-selection.json')).value;
  console.log(JSON.stringify(simulateFixture(deriveRoleDemand(selection,evidenceReader(root))),null,2));
}
