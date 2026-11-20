import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from '../../scripts/study-evidence.mjs';

function runCarriage(plan,system,policy,planSha256,setup){
  const {focal,partner,destination,criterion,windowS}=plan;
  const pads=plan.pads.map(s=>({id:s.id,piece:null})),stock=policy.supply.filter(s=>s.eligibleActors.includes(focal)),events=[];
  let carrier={mode:'free',at:0},receiver={mode:'free',at:0};
  function record(t,actor,action,piece,station){
    events.push({timeS:t,actor,action,piece,station,...(action==='deliver'?{criterion}:{}),
      witness:'Tabletop clock '+t+' · '+actor+' '+action+' '+piece+' at '+station});
  }
  for(let t=0;t<=windowS[1];t++){
    if(receiver.at<=t){
      const pad=pads.find(s=>s.piece!==null);
      if(receiver.mode==='free'&&t===0&&policy.exchangeAvailability[0]>0){
        const reserved=policy.supply.find(s=>s.eligibleActors.includes(partner));
        record(t,partner,'acquire',reserved.id,reserved.station);
        receiver={mode:'loaded',at:t+12,piece:reserved.id};
      }else if(receiver.mode==='free'&&pad&&t>=policy.exchangeAvailability[0]){
        record(t,partner,'receive',pad.piece,pad.id);
        receiver={mode:'loaded',at:t+2,piece:pad.piece};pad.piece=null;
      }else if(receiver.mode==='loaded'){
        record(t,partner,'deliver',receiver.piece,destination);receiver={...receiver,mode:'resetting',at:t+1};
      }else if(receiver.mode==='resetting'){
        record(t,partner,'reset',receiver.piece,destination);receiver={mode:'free',at:t+1};
      }
    }
    if(carrier.at>t)continue;
    if(carrier.mode==='free'&&stock.length&&stock[0].availableS<=t){
      const piece=stock.shift();record(t,focal,'acquire',piece.id,piece.station);
      carrier={mode:'loaded',piece:piece.id,at:t+(system.id==='direct-carriage'?4:1)};
    }else if(carrier.mode==='loaded'&&system.id==='direct-carriage'){
      record(t,focal,'deliver',carrier.piece,destination);carrier={...carrier,mode:'resetting',at:t+1};
    }else if(carrier.mode==='loaded'){
      const pad=pads.find(s=>s.piece===null);
      if(pad){record(t,focal,'deposit',carrier.piece,pad.id);pad.piece=carrier.piece;carrier={mode:'free',at:t+1};}
    }else if(carrier.mode==='resetting'){
      record(t,focal,'reset',carrier.piece,destination);carrier={mode:'free',at:t+1};
    }
  }
  return {identity:{planSha256,architecture:system.id,revision:system.revision,policy:policy.id,clock:plan.clock,criterion,
    evidence:plan.evidence,runId:system.id+'/'+policy.id},setup,hardware:system.source,opening:{focal,partner,emptyActors:true,emptyPads:true},
    observation:{startS:windowS[0],endS:windowS[1],startWitness:'Tabletop timer started',endWitness:'Tabletop timer closed',
      coverage:'all-registered-actor-events',coverageBasis:'Each tick of both carriage state machines with transfer and rearm switches.'},events};
}

export function makeAllianceCompletion(dir){
  mkdirSync(dir,{recursive:true});
  function save(name,v){
    const bytes=JSON.stringify(v,null,2)+'\n';writeFileSync(path.join(dir,name),bytes);
    return {path:name,sha256:digest(bytes),pointer:''};
  }
  const focal='carrier',partner='receiver';
  const edge=(from,to,exchange)=>({from,to,exchange});
  const architectures=[
    {id:'direct-carriage',paths:['focal-direct','partner-direct'],revision:'direct-table-r1',design:'A mobile delivery carriage carries the block to the downstream pocket and rearms its own gate.',
      interfaces:[edge('stock seat','mobile pocket','retained block'),edge('mobile pocket','terminal tray','direct placement')]},
    {id:'relay-carriage',paths:['focal-relay','partner-direct'],revision:'relay-table-r1',design:'A short-travel carrier unloads into either ground bay. A second carriage collects and completes the trip.',
      interfaces:[edge('carrier cradle','ground bay','seated block'),edge('ground bay','second carriage','custody transfer'),edge('second carriage','terminal tray','final placement')]}];
  for(const a of architectures)a.source=save(a.id+'-design.json',{...a});
  const supply=['a','b','c','d'].map((id,i)=>({id,station:'supply-rack',availableS:i===3?8:0,eligibleActors:[focal]}));
  supply.push({id:'reserved',station:'partner-rack',availableS:0,eligibleActors:[partner]});
  const setups=new Map();
  const field=save('tabletop-field.json',{units:'seconds',geometry:'one supply rack, two single-block bays and one terminal tray',otherActors:[]});
  const policies=[['receiver-ready',0],['receiver-occupied',15]].map(([id,start])=>{
    const setup={field,context:'shared tabletop',focalRole:'Move rack inventory toward the terminal',partnerRole:start?'Finish a preceding duty before collection':'Collect from a bay immediately',
      availability:{[focal]:[0,21],[partner]:[0,21]},exchangeAvailability:[start,21],supply};
    const source=save(id+'-setup.json',setup);setups.set(id,source);
    return {id,...setup,fieldSha256:field.sha256,setupSha256:source.sha256};
  });
  const plan={schema:'agent-frc/alliance-completion-plan@1',clock:'tabletop seconds',windowS:[0,20],objective:'completedCycles',
    evidence:'timing-model',criterion:'Block settled in terminal tray',destination:'terminal-tray',terminalCapacity:1,focal,partner,
    pads:[{id:'near-bay',capacity:1},{id:'far-bay',capacity:1}],architectures,policies};
  const pin=save('plan.json',plan),entries=[];
  for(const c of policies)for(const a of architectures){
    const run=runCarriage(plan,a,c,pin.sha256,setups.get(c.id)),id=a.id+'-'+c.id;
    entries.push({id,architecture:a.id,policy:c.id,source:save(id+'.json',run)});
  }
  return save('study.json',{schema:'agent-frc/alliance-completion@1',plan:pin,entries});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3)throw Error('Supply a directory for the classroom trial.');
  console.log(makeAllianceCompletion(process.argv[2]));
}
