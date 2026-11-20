import {isDeepStrictEqual as equal} from 'node:util';
import {atPointer,label} from './study-evidence.mjs';
import {studyRows} from './strategy-lab.mjs';

const finite=Number.isFinite;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const unique=values=>new Set(values).size===values.length;
const reference=(read,ref)=>atPointer(read(ref),ref.pointer);
const graph=a=>a.interfaces.map(edge=>JSON.stringify([edge.from,edge.to,edge.exchange])).sort();
const validWindow=w=>Array.isArray(w)&&w.length===2&&w.every(finite)&&w[1]>w[0];
const actions=['acquire','deposit','receive','deliver','reset'];
const actors=p=>[p.focal,p.partner];
const open=reason=>({status:'open',reason});

function validate(p){
  assert(p.schema==='agent-frc/alliance-completion-plan@1'&&validWindow(p.windowS)&&
    actors(p).every(label)&&p.focal!==p.partner&&label(p.clock)&&label(p.criterion)&&label(p.destination)&&Number.isSafeInteger(p.terminalCapacity)&&p.terminalCapacity>0&&
    ['deliveries','completedCycles'].includes(p.objective)&&['field-rehearsal','timing-model','integrated-simulation','physical'].includes(p.evidence),
    'Freeze a clock, window, two different actors, final station, criterion, evidence class and objective.');
  const systems=studyRows(p.architectures,'architecture',2,16),policies=studyRows(p.policies,'policy',2,40);
  assert(unique(systems.map(a=>a.revision))&&systems.every(a=>label(a.revision)&&a.source?.pointer===''&&label(a.design)&&Array.isArray(a.paths)&&a.paths.length&&unique(a.paths)&&a.paths.every(x=>['focal-direct','partner-direct','focal-relay'].includes(x))&&Array.isArray(a.interfaces)&&a.interfaces.length&&
    a.interfaces.every(i=>label(i.from)&&label(i.to)&&i.from!==i.to&&label(i.exchange))),'Describe each distinct complete design revision and its installed exchanges.');
  const pads=studyRows(p.pads,'exchange station',0,32);
  assert(pads.every(s=>Number.isSafeInteger(s.capacity)&&s.capacity>0&&s.id!==p.destination),'Declare finite capacity for each exchange station.');
  for(const c of policies){
    assert(label(c.focalRole)&&label(c.partnerRole)&&label(c.context)&&/^[a-f0-9]{64}$/.test(c.setupSha256)&&/^[a-f0-9]{64}$/.test(c.fieldSha256)&&
      actors(p).every(id=>validWindow(c.availability?.[id]))&&(!c.exchangeAvailability||validWindow(c.exchangeAvailability)),'Freeze each strategy, partner availability and pinned field context.');
    if(c.programs)assert(actors(p).every(actor=>Array.isArray(c.programs[actor])&&unique(c.programs[actor])&&
      c.programs[actor].every(action=>actions.includes(action))),'Declare only permitted registered actions in each actor program.');
    const items=studyRows(c.supply,'finite supply',0,1024);
    assert(items.every(item=>label(item.station)&&!pads.some(s=>s.id===item.station)&&item.station!==p.destination&&finite(item.availableS)&&(!item.eligibleActors||Array.isArray(item.eligibleActors)&&item.eligibleActors.length&&unique(item.eligibleActors)&&item.eligibleActors.every(actor=>actors(p).includes(actor)))),
      'Supply must identify each original piece, station and first available time.');
  }
  return {systems,policies};
}

function inspectTrace(native,p,a,c,planSha256,read){
  const id=native.identity,context=reference(read,native.setup);
  reference(read,context.field);
  const hardware=reference(read,native.hardware);
  assert(native.hardware.pointer===''&&native.hardware.sha256===a.source.sha256&&hardware.revision===a.revision&&
    equal(hardware.interfaces,a.interfaces)&&equal(hardware.paths,a.paths),'The execution must identify the registered installed architecture and material path.');
  assert(id?.planSha256===planSha256&&id.architecture===a.id&&id.revision===a.revision&&id.policy===c.id&&
    id.clock===p.clock&&id.evidence===p.evidence&&id.criterion===p.criterion&&label(id.runId)&&
    native.setup.sha256===c.setupSha256&&native.setup.pointer===''&&context.context===c.context&&context.field.pointer===''&&context.field.sha256===c.fieldSha256&&
    equal(context.programs,c.programs)&&equal(context.exchangeAvailability,c.exchangeAvailability)&&context.focalRole===c.focalRole&&context.partnerRole===c.partnerRole&&equal(context.availability,c.availability)&&equal(context.supply,c.supply)&&
    equal(native.opening,{focal:p.focal,partner:p.partner,emptyActors:true,emptyPads:true}),
    'The native trace must match the frozen strategy, actors, starting inventory, setup, revision, clock and criterion.');
  const clock=native.observation;
  assert(clock?.startS===p.windowS[0]&&finite(clock.endS)&&clock.endS>=clock.startS&&label(clock.startWitness)&&label(clock.endWitness),
    'Supply original observation bounds and clock witnesses.');
  assert(Array.isArray(native.events)&&native.events.length<=100000,'Supply the continuous native event history.');
  const [lo,hi]=p.windowS,states=new Map(c.supply.map(s=>[s.id,{kind:'stock',station:s.station,availableS:s.availableS,eligibleActors:s.eligibleActors??actors(p)}]));
  const pads=new Map(p.pads.map(s=>[s.id,new Set()])),busy=new Map(),terminal=new Set(),witnesses=[],late=[];
  const counts={acquisitions:0,focalDeposits:0,partnerReceipts:0,deliveries:0,completedCycles:0,relayCycles:0,directFocalCycles:0,independentPartnerCycles:0};
  let previous=lo;
  for(const e of native.events){
    assert(finite(e.timeS)&&e.timeS>=previous&&e.timeS<=clock.endS&&label(e.witness)&&
      actors(p).includes(e.actor)&&states.has(e.piece)&&actions.includes(e.action),'Malformed or unsorted native custody witness.');
    previous=e.timeS;
    if(e.timeS>=hi){late.push(e);continue;}
    const availability=c.availability[e.actor];
    assert((!c.programs||c.programs[e.actor].includes(e.action))&&e.timeS>=availability[0]&&e.timeS<availability[1],'Actor acted outside the frozen service window.');
    const state=states.get(e.piece),owned=busy.get(e.actor);
    switch(e.action){
      case 'acquire':
        assert((e.actor===p.focal?a.paths.includes('focal-direct')||a.paths.includes('focal-relay'):a.paths.includes('partner-direct'))&&!owned&&state.kind==='stock'&&state.eligibleActors.includes(e.actor)&&e.station===state.station&&e.timeS>=state.availableS,'Acquisition exceeds available stock or actor capacity.');
        states.set(e.piece,{kind:'held',actor:e.actor,since:e.timeS});busy.set(e.actor,e.piece);counts.acquisitions++;break;
      case 'deposit':{
        const contents=pads.get(e.station),pad=p.pads.find(s=>s.id===e.station);
        assert(a.paths.includes('focal-relay')&&e.actor===p.focal&&owned===e.piece&&state.kind==='held'&&e.timeS>state.since&&contents&&contents.size<pad.capacity,
          'A deposit needs focal custody, transport time and space at its registered exchange station.');
        contents.add(e.piece);busy.delete(e.actor);states.set(e.piece,{kind:'on-pad',station:e.station,since:e.timeS});counts.focalDeposits++;break;
      }
      case 'receive':{
        const contents=pads.get(e.station),service=c.exchangeAvailability??availability;
        assert(e.timeS>=service[0]&&e.timeS<service[1]&&!owned&&e.actor===p.partner&&state.kind==='on-pad'&&state.station===e.station&&contents?.has(e.piece)&&e.timeS>state.since,
          'The partner needs free capacity and the same piece at the same exchange station.');
        contents.delete(e.piece);busy.set(e.actor,e.piece);states.set(e.piece,{kind:'held',actor:e.actor,viaRelay:true,since:e.timeS});counts.partnerReceipts++;break;
      }
      case 'deliver':
        assert(a.paths.includes(state.viaRelay?'focal-relay':e.actor===p.focal?'focal-direct':'partner-direct')&&
          owned===e.piece&&state.kind==='held'&&state.actor===e.actor&&e.timeS>state.since&&
          e.station===p.destination&&e.criterion===p.criterion&&terminal.size<p.terminalCapacity,'A final delivery needs same-piece custody, elapsed transport and the registered downstream criterion.');
        terminal.add(e.piece);states.set(e.piece,{kind:'delivered-awaiting-reset',actor:e.actor,viaRelay:state.viaRelay??false,since:e.timeS});counts.deliveries++;break;
      case 'reset':
        assert(owned===e.piece&&state.kind==='delivered-awaiting-reset'&&state.actor===e.actor&&e.timeS>=state.since&&e.station===p.destination,
          'A completed cycle needs a terminal reset by the actor who delivered that piece.');
        terminal.delete(e.piece);busy.delete(e.actor);states.set(e.piece,{kind:'complete',actor:e.actor,since:e.timeS});counts.completedCycles++;
        counts[state.viaRelay?'relayCycles':e.actor===p.focal?'directFocalCycles':'independentPartnerCycles']++;break;
    }
    witnesses.push(e);
  }
  for(const s of states.values())if(s.kind==='stock'&&s.availableS>=Math.min(clock.endS,hi))s.kind='not-yet-available';
  const elapsed=hi-lo,observed=counts[p.objective];
  const complete=clock.endS>=hi&&clock.coverage==='all-registered-actor-events'&&label(clock.coverageBasis);
  return {status:complete?'complete':'open',reason:complete?null:'The observed prefix cannot establish a full-window total.',runId:id.runId,
    asOfS:Math.min(clock.endS,hi),counts,ratePerS:complete?observed/elapsed:null,objectiveCount:complete?observed:null,witnesses,late,
    finalCustody:Object.fromEntries(states),evidence:p.evidence};
}

export function reviewAllianceCompletion(study,read){
  assert(study?.schema==='agent-frc/alliance-completion@1'&&study.plan?.pointer==='','Pin the complete alliance decision plan.');
  const p=reference(read,study.plan),{systems,policies}=validate(p);
  const entries=studyRows(study.entries,'alliance execution',0,640),key=(a,c)=>JSON.stringify([a,c]);
  const index=new Map();
  for(const e of entries){
    const k=key(e.architecture,e.policy);
    assert(systems.some(a=>a.id===e.architecture)&&policies.some(c=>c.id===e.policy)&&!index.has(k),'Unknown or repeated architecture/policy cell.');
    index.set(k,e);
  }
  const rows=[],ids=new Map();
  for(const c of policies)for(const a of systems){
    const e=index.get(key(a.id,c.id));let result;
    try{result=e?inspectTrace(reference(read,e.source),p,a,c,study.plan.sha256,read):open('No comparable native execution.');}
    catch(error){result=open(error.message);}
    const r={architecture:a.id,policy:c.id,source:e?.source,...result};rows.push(r);
    if(r.runId){const group=ids.get(r.runId)??[];group.push(r);ids.set(r.runId,group);}
  }
  for(const group of ids.values())if(group.length>1)for(const r of group)Object.assign(r,open('Execution identity reused.'),{objectiveCount:null,ratePerS:null});
  const architecturesDistinct=unique(systems.map(a=>JSON.stringify(graph(a))));
  const distinctPolicies=unique(policies.map(c=>JSON.stringify([c.focalRole,c.partnerRole,c.setupSha256])))&&
    unique(policies.map(c=>c.setupSha256));
  const choices=policies.map(c=>{
    const trials=rows.filter(r=>r.policy===c.id);
    if(!architecturesDistinct||!distinctPolicies)return {policy:c.id,...open('Distinct architecture exchanges and frozen strategy setups are required.')};
    if(trials.some(r=>r.status!=='complete'))return {policy:c.id,...open('A complete trace is required from every candidate in this strategy.')};
    const best=Math.max(...trials.map(r=>r.objectiveCount));
    return {policy:c.id,status:'compared',best,winners:trials.filter(r=>r.objectiveCount===best).map(r=>r.architecture)};
  });
  const comparable=choices.filter(c=>c.status==='compared');
  const rankedPolicy=choice=>policies.find(c=>c.id===choice.policy);
  const program=c=>actors(p).map(id=>[...(c.programs?.[id]??actions)].sort());
  const exchange=c=>c.exchangeAvailability??c.availability[p.partner];
  const comparisons=[];
  for(const [i,left] of comparable.entries())for(const right of comparable.slice(i+1)){
    const a=rankedPolicy(left),b=rankedPolicy(right);
    if(a.fieldSha256!==b.fieldSha256||!equal(a.supply,b.supply))continue;
    if(equal(a.availability,b.availability)&&equal(exchange(a),exchange(b))&&equal(program(a),program(b)))continue;
    comparisons.push({policies:[a.id,b.id],switched:left.winners.length===1&&right.winners.length===1&&left.winners[0]!==right.winners[0]});
  }
  let reversal='open';
  if(comparisons.some(pair=>pair.switched))reversal='observed-in-compared-strategies';
  else if(comparable.length===choices.length&&comparisons.length)reversal='none-observed';
  return {schema:'agent-frc/alliance-completion-result@1',plan:study.plan,objective:p.objective,criterion:p.criterion,windowS:p.windowS,
    architectures:systems,policies,rows,choices,scope:p.evidence,status:comparable.length===choices.length?'compared':'open',
    reversal,matchedStrategyPairs:comparisons,wholeRobotPreference:['field-rehearsal','timing-model'].includes(p.evidence)?'open':reversal,
    limits:'This is the registered two-actor service chain on the frozen clock. Match points, unobserved allies and physical readiness require separate evidence.'};
}
