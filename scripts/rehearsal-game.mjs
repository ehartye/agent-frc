/** Project-owned stations and finite stock for the fixed-step field rehearsal. */
export function createRehearsalGame(profile) {
  const model = profile.rehearsal;
  const stations = new Map();
  const periods = new Map(model.periods.map(p => [p.name,p.seconds]));
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const label = value => typeof value === 'string' && value.trim();
  const sides = ['blue','red'];
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
    p[0]>=0 && p[1]>=0 && p[0]<=profile.field.length && p[1]<=profile.field.width;
  const legal = (ok,message) => {if (!ok) throw Error(message);};
  for (const s of model.stations ?? []) {
    legal(label(s.id) && !stations.has(s.id) && label(s.label) && label(s.piece) &&
      ['retrieval','scoring'].includes(s.kind) && [...sides,'both'].includes(s.side) && point(s.at) &&
      (s.displayAt === undefined || point(s.displayAt)) && Number.isFinite(s.radiusIn) && s.radiusIn>0,
      'Invalid or duplicate rehearsal station');
    if (s.areaIn !== undefined) legal(Array.isArray(s.areaIn) && s.areaIn.length===2 && s.areaIn.every(point) &&
      s.areaIn[0].every((v,i)=>v<s.areaIn[1][i]),'Invalid rectangular station area');
    if (s.kind === 'retrieval') legal(count(s.stock) && s.stock<=10000,'Invalid initial station stock');
    else {
      legal(s.capacity===undefined || count(s.capacity),'Invalid target piece capacity');
      legal(label(s.criterion) && (count(s.points) || s.points && typeof s.points==='object' &&
        [...periods.keys()].every(phase=>count(s.points[phase]))),'Supply a scoring criterion and period points');
      for (const w of s.activeWindows ?? []) legal(periods.has(w.phase) && Number.isFinite(w.fromS) &&
        Number.isFinite(w.toS) && w.fromS>=0 && w.toS>w.fromS && w.toS<=periods.get(w.phase) &&
        (w.firstPeriodLeader===undefined || sides.includes(w.firstPeriodLeader)), 'Invalid station activity window');
    }
    stations.set(s.id,s);
  }
  for (const s of stations.values()) {
    for (const [outcome,rule] of Object.entries(s.returns ?? {})) {
      const target=stations.get(rule.station);
      legal(s.kind==='scoring' && ['credited','missed','inactive','unresolved','occupied'].includes(outcome) &&
        target?.kind==='retrieval' && target.piece===s.piece && Number.isFinite(rule.delayS) && rule.delayS>=0,
        'Returns need a compatible retrieval station and nonnegative delay');
    }
  }
  function elapsed(sim,t) {
    return sim.phaseHistory.reduce((sum,p)=>sum+p.seconds,0)+t;
  }
  function replenish(sim,t) {
    const time=elapsed(sim,t), pending=[];
    for (const entry of sim.game.returning) {
      if(entry.readyAtS<=time+1e-9) {
        sim.game.stock[entry.station].push(entry.piece);
        if(entry.releaseSlot)sim.game.occupied[entry.releaseSlot]--;
      }
      else pending.push(entry);
    }
    sim.game.returning=pending;
  }
  function validateStep(step) {
    if (step.operation===undefined && step.station===undefined) return;
    legal(['acquire','attempt'].includes(step.operation) && (step.quantity===undefined ||
      count(step.quantity) && step.quantity>0), 'Invalid piece operation or quantity');
    legal(step.outcome===undefined || step.operation==='attempt' && ['credited','missed','unresolved'].includes(step.outcome),
      'Invalid attempt outcome');
    for (const side of sides) {
      const key = typeof step.station==='string' ? step.station : step.station?.[side];
      const station = stations.get(key);
      legal(station && station.kind===(step.operation==='acquire'?'retrieval':'scoring'), 'Piece operation requires a compatible registered station');
    }
  }
  for (const program of Object.values(model.programs)) {
    for (const path of [program.steps,...Object.values(program.byPeriod ?? {})]) for (const step of path) validateStep(step);
  }
  function start(robots, tieWinner) {
    legal(tieWinner===undefined || sides.includes(tieWinner),'Invalid tied first-period decision');
    const stock={},cargo={},score={blue:0,red:0},initial={},capacity={};
    const supplies = [...stations.values()].filter(s=>s.kind==='retrieval');
    for (const s of supplies) {
      stock[s.id]=Array.from({length:s.stock},(_,i)=>({id:s.id+'/'+(i+1),type:s.piece}));
      initial[s.id]=s.stock;
    }
    for (const robot of robots) {
      cargo[robot.id]=[];
      capacity[robot.id]=robot.capacity ?? model.defaults.capacity ?? 1;
      legal(count(capacity[robot.id]),'Invalid robot piece capacity');
      if (!robot.preload) continue;
      const {station:key,quantity}=robot.preload,s=stations.get(key);
      legal(s?.kind==='retrieval' && [robot.side,'both'].includes(s.side) && count(quantity) &&
        quantity<=capacity[robot.id] && quantity<=stock[key].length,'Preload exceeds compatible source stock or robot capacity');
      cargo[robot.id]=stock[key].splice(0,quantity);
    }
    const attempts=Object.fromEntries([...stations.values()].filter(s=>s.kind==='scoring').map(s=>[s.id,0]));
    return {stock,initial,cargo,capacity,score,attempts,occupied:{...attempts},returning:[],tieWinner,firstPeriodCount:{blue:0,red:0},terminal:[],events:[]};
  }
  function record(sim,robot,station,operation,outcome,pieces,timeS) {
    const entry={phase:sim.phase,timeS,robot:robot.id,station:station.id,operation,outcome,pieces:pieces.map(p=>p.id)};
    sim.game.events.push(entry);
    return entry;
  }
  function apply(sim,robot,step,timeS) {
    if (!step.operation) return;
    const key = typeof step.station==='string' ? step.station : step.station[robot.side];
    const s=stations.get(key),g=sim.game,bay=g.cargo[robot.id],n=step.quantity ?? 1;
    const inRange=s.areaIn ? robot.p.every((v,i)=>v>=s.areaIn[0][i] && v<=s.areaIn[1][i]) :
      Math.hypot(robot.p[0]-s.at[0],robot.p[1]-s.at[1])<=s.radiusIn;
    if (![robot.side,'both'].includes(s.side) || !inRange) {
      record(sim,robot,s,step.operation,'ineligible-position-or-alliance',[],timeS);return;
    }
    if (step.operation==='acquire') {
      const pieces=g.stock[key].splice(0,Math.min(n,g.capacity[robot.id]-bay.length));
      bay.push(...pieces);
      record(sim,robot,s,step.operation,pieces.length?'acquired':'empty-or-full',pieces,timeS);
      return;
    }
    const pieces=bay.filter(p=>p.type===s.piece).slice(0,n);
    if (!pieces.length) {record(sim,robot,s,'attempt','no-compatible-cargo',[],timeS);return;}
    const used=new Set(pieces);
    g.cargo[robot.id]=bay.filter(p=>!used.has(p));
    let outcome=step.outcome ?? 'unresolved';
    let activity='active';
    if (s.activeWindows) {
      const possible=s.activeWindows.filter(w=>w.phase===sim.phase && w.fromS<=timeS && timeS<w.toS);
      const counts=g.firstPeriodCount;
      const leader=sim.phaseIndex===0 ? undefined : counts.blue===counts.red ? g.tieWinner : counts.blue>counts.red?'blue':'red';
      if (!possible.some(w=>!w.firstPeriodLeader || w.firstPeriodLeader===leader)) {
        activity=possible.length && !leader?'unresolved':'inactive';
        outcome=activity;
      }
    }
    const admitted=outcome==='credited' && s.capacity!==undefined ?
      Math.min(pieces.length,Math.max(0,s.capacity-g.occupied[key])) : pieces.length;
    for(const [result,batch] of [[outcome,pieces.slice(0,admitted)],['occupied',pieces.slice(admitted)]]){
      if(!batch.length)continue;
      const event=record(sim,robot,s,'attempt',result,batch,timeS);
      const points=result==='credited'?batch.length*(typeof s.points==='number'?s.points:s.points[sim.phase]):0;
      event.points=points;event.prescribedOutcome=step.outcome ?? 'unresolved';event.activity=activity;
      g.score[robot.side]+=points;
      if(result==='credited'){
        g.occupied[key]+=batch.length;
        if(sim.phaseIndex===0)g.firstPeriodCount[robot.side]+=batch.length;
      }
      g.attempts[key]+=batch.length;
      for (const piece of batch) {
        const rule=s.returns?.[result];
        if(rule){
          const entry={piece,station:rule.station,readyAtS:elapsed(sim,timeS)+rule.delayS};
          if(result==='credited')entry.releaseSlot=key;
          g.returning.push(entry);
        }else g.terminal.push({...piece,station:key,outcome:result});
      }
    }
  }
  return {start,apply,replenish};
}


export function rehearsalFindings(id,basis,game,stations) {
  if (!stations?.length) return [id+' · '+basis+'. The profile has no registered stock or scoring criterion.'];
  const lines=[id+' · '+basis+'. Modeled rehearsal score: Blue '+game.score.blue+', Red '+game.score.red+'.'];
  for (const station of stations) {
    if(station.kind==='retrieval') lines.push(station.label+' · '+station.piece+' stock '+game.initial[station.id]+' initially, '+game.stock[station.id].length+' available at snapshot.');
    else lines.push(station.label+' · '+game.attempts[station.id]+' pieces attempted. Criterion: '+station.criterion);
  }
  const groups=new Map();
  for(const ev of game.events){
    const key=[ev.phase,ev.station,ev.robot,ev.outcome].join(' · ');
    const existing=groups.get(key) ?? {count:0,pieces:0,points:0};
    existing.count++;existing.pieces+=ev.pieces.length;existing.points+=ev.points ?? 0;groups.set(key,existing);
  }
  for(const [key,v] of groups)lines.push(key+': '+v.count+' actions, '+v.pieces+' pieces, '+v.points+' modeled points.');
  lines.push(Object.entries(game.cargo).map(([robot,pieces])=>robot+' '+pieces.length+' aboard').join(', ')+
    '; '+game.returning.length+' pieces awaiting a configured return.');
  return lines;
}
