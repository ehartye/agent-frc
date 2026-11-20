import {fieldGeometry} from './field-rehearsal-geometry.mjs';
import {createFieldPieceMotion} from './field-piece-motion.mjs';
import {allocateOpeningTasks} from './auto-allocation.mjs';

/** Project-owned stations and finite stock for the fixed-step field rehearsal. */
export function createRehearsalGame(profile,geom=fieldGeometry(profile),motion=createFieldPieceMotion(profile,geom)) {
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
    if(s.floor || s.service) {
      const physical=s.floor ?? s.service;
      legal(s.kind==='retrieval' && !(s.floor && s.service) && Number.isFinite(physical.radiusIn) && physical.radiusIn>0 &&
        (physical.captureReachIn===undefined || Number.isFinite(physical.captureReachIn) && physical.captureReachIn>=0),
        'Supply a physical retrieval radius and nonnegative capture reach.');
      const location=s.floor?.positions?.[0] ?? s.service?.outlet ?? s.at;
      motion.start([physicalPiece(s,{id:'validation',type:s.piece},location)]);
      if(s.floor)legal(Array.isArray(s.floor.positions) && s.floor.positions.every(point),'Supply floor coordinates in field inches.');
      if(s.service)legal(label(physical.operator) && Number.isFinite(physical.secondsPerPiece) && physical.secondsPerPiece>0 &&
        count(physical.capacity) && physical.capacity>0 && point(physical.outlet) && Array.isArray(physical.phases) &&
        physical.phases.length>0 && physical.phases.every(p=>periods.has(p)), 'Invalid human station operator, outlet, service time, capacity or phases.');
    }
    stations.set(s.id,s);
  }
  for (const s of stations.values()) {
    const job=s.service?.delivery;
    if(job) {
      const target=stations.get(job.station);
      legal(sides.includes(s.side) && target?.kind==='scoring' && target.piece===s.piece &&
        [s.side,'both'].includes(target.side) && ['credited','missed','unresolved'].includes(job.outcome) && label(job.basis),
        'A human delivery needs a side-eligible target, compatible piece, outcome and basis.');
    }
    for (const [outcome,rule] of Object.entries(s.returns ?? {})) {
      const target=stations.get(rule.station);
      legal(s.kind==='scoring' && ['credited','missed','inactive','unresolved','occupied'].includes(outcome) &&
        target?.kind==='retrieval' && target.piece===s.piece && (!target.floor || point(rule.at)) && Number.isFinite(rule.delayS) && rule.delayS>=0,
        'Returns need a compatible retrieval station and nonnegative delay');
    }
  }
  function physicalPiece(station,piece,p) {
    const {radiusIn,heightIn,massKg,dragInS2,restitution}=station.floor ?? station.service;
    return {...piece,p,radiusIn,heightIn,massKg,dragInS2,restitution,station:station.id};
  }
  function receive(g,station,piece,p) {
    if(station.service)g.reserve[station.id].push(piece);
    else {
      g.stock[station.id].push(piece);
      if(station.floor)motion.put(g.motion,physicalPiece(station,piece,p));
    }
  }
  function move(sim,dt,begins){
    if(sim.game.motion.pieces.length)motion.advance(sim.game.motion,dt,sim.robots.map((r,i)=>({...r,previousP:begins[i]})),sim.setup);
  }
  function elapsed(sim,t) {
    return sim.phaseHistory.reduce((sum,p)=>sum+p.seconds,0)+t;
  }
  function replenish(sim,t) {
    const time=elapsed(sim,t), pending=[];
    for (const entry of sim.game.returning) {
      if(entry.readyAtS<=time+1e-9) {
        receive(sim.game,stations.get(entry.station),entry.piece,entry.at);
        if(entry.releaseSlot)sim.game.occupied[entry.releaseSlot]--;
      }
      else pending.push(entry);
    }
    sim.game.returning=pending;
    for(const operator of Object.values(sim.game.operators)){
      const g=sim.game, choices=operator.stations;
      const allowed=id=>stations.get(id).service.phases.includes(sim.phase);
      if(operator.job && !allowed(operator.job.station))operator.job=null;
      if(operator.job && operator.job.due<=time+1e-9){
        const s=stations.get(operator.job.station),svc=s.service,piece=g.reserve[s.id].shift();
        if(svc.delivery){
          const actor={id:'human/'+svc.operator,side:s.side};
          dispose(sim,actor,stations.get(svc.delivery.station),[piece],svc.delivery.outcome,t,svc.delivery.basis);
        } else{
          g.stock[s.id].push(piece);
          motion.put(g.motion,physicalPiece(s,piece,svc.outlet));
          record(sim,{id:'human/'+svc.operator},s,'release','available',[piece],t);
        }
        operator.job=null;
      }
      if(operator.job)continue;
      for(let n=0;n<choices.length;n++){
        const index=(operator.next+n)%choices.length,id=choices[index],s=stations.get(id);
        if(!allowed(id)||!g.reserve[id].length||(!s.service.delivery&&g.stock[id].length>=s.service.capacity))continue;
        operator.job={station:id,due:time+s.service.secondsPerPiece};
        operator.next=(index+1)%choices.length;
        break;
      }
    }
  }
  function validateStep(step) {
    if(step.openingAlternatives!==undefined)legal(step.operation==='acquire' && Array.isArray(step.openingAlternatives) &&
      step.openingAlternatives.every(id=>stations.get(id)?.kind==='retrieval'), 'Opening alternatives must be registered pickup sources.');
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
  function start(robots, tieWinner,setup) {
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
    const reserve={},operators={},floor=[];
    for(const s of supplies){
      if(s.floor){
        const available=stock[s.id],coords=s.floor.positions;
        legal(coords.length===available.length || coords.length===s.stock,'Floor positions must account for each initial piece at '+s.id);
        for(const [i,piece] of available.entries())floor.push(physicalPiece(s,piece,coords[coords.length-available.length+i]));
      }else if(s.service){
        reserve[s.id]=stock[s.id];stock[s.id]=[];
        const op=operators[s.service.operator] ??= {stations:[],next:0,job:null};
        op.stations.push(s.id);
      }
    }
    const opening=openingTasks(robots,stock,cargo,floor,setup);
    const attempts=Object.fromEntries([...stations.values()].filter(s=>s.kind==='scoring').map(s=>[s.id,0]));
    return {reserve,operators,motion:motion.start(floor),opening,stock,initial,cargo,capacity,score,attempts,occupied:{...attempts},returning:[],tieWinner,firstPeriodCount:{blue:0,red:0},terminal:[],events:[]};
  }
  function openingTasks(robots,stock,cargo,floor,setup) {
    const phase=model.periods[0],places=new Map(floor.map(p=>[p.id,p.p]));
    const destinations=new Map(),eligibleRobots=new Set();
    const rows=robots.map(r=>{
      const program=model.programs[r.plans?.[phase.name]],steps=program?.byPeriod?.[phase.name] ?? program?.steps ?? [];
      const candidates=[],fallback=cargo[r.id].length?'preload':steps.length?'follow program':'hold position';
      const row={robot:r.id,candidates,fallback},first=steps.findIndex(s=>s.operation==='acquire');
      if(!r.p || first<0)return row;
      if((r.capacity ?? model.defaults.capacity ?? 1)<=cargo[r.id].length && !steps.slice(0,first).some(s=>s.operation==='attempt'))return row;
      let origin=r.p,spent=0;
      const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
      function routeTime(to,straight){
        if(straight)return geom.hit(origin,to,r,setup)?Infinity:distance(origin,to)/r.speed;
        const route=geom.plan(origin,to,r,setup);
        return route.length?route.slice(1).reduce((n,p,i)=>n+distance(p,route[i]),0)/r.speed:Infinity;
      }
      for(const [index,leg] of steps.entries()){
        const at=leg.at,q=Array.isArray(at)?at:at[r.side] ?? at.slots?.[r.slot] ?? at.default;
        const to=leg.frame==='field'||r.side==='blue'?q:[model.mirror.redX?profile.field.length-q[0]:q[0],model.mirror.redY?profile.field.width-q[1]:q[1]];
        spent+=leg.dwell??0;
        if(index!==first){spent+=routeTime(to,leg.straight);origin=to;continue;}
        const id=typeof leg.station==='string'?leg.station:leg.station[r.side];
        for(const key of [id,...(leg.openingAlternatives??[])]){
          const s=stations.get(key);
          if(![r.side,'both'].includes(s.side) || s.piece!==stations.get(id).piece)continue;
          if(stock[key].length)eligibleRobots.add(r.id);
          const ranked=[];
          for(const piece of stock[key]){
            const p=places.get(piece.id);
            let approach=key===id?to:s.at;
            if(p && r.intake){
              approach=pickupPose(r,p,s.floor.radiusIn);
            }else if(p){
              const dx=p[0]-origin[0],dy=p[1]-origin[1],d=Math.hypot(dx,dy);
              if(d>1e-8){
                const angle=r.heading*Math.PI/180,ux=dx/d,uy=dy/d;
                const length=(r.length/2+r.bumper)/Math.abs(ux*Math.cos(angle)+uy*Math.sin(angle));
                const width=(r.width/2+r.bumper)/Math.abs(uy*Math.cos(angle)-ux*Math.sin(angle));
                const offset=Math.min(d,Math.min(length,width)+s.floor.radiusIn+(s.floor.captureReachIn??0)*.5);
                approach=[p[0]-ux*offset,p[1]-uy*offset];
              }else approach=origin;
              if(!canReach({...r,p:approach},p,s.floor))continue;
            }
            ranked.push({piece:piece.id,station:key,approach,lower:spent+distance(origin,approach)/r.speed});
          }
          ranked.sort((a,b)=>a.lower-b.lower||a.piece.localeCompare(b.piece));
          const best=[];
          for(const item of ranked){
            if(item.lower>phase.seconds || best.length>=robots.length && item.lower>best.at(-1).timeS)break;
            const timeS=spent+routeTime(item.approach,leg.straight);
            if(timeS>phase.seconds)continue;
            best.push({...item,timeS});best.sort((a,b)=>a.timeS-b.timeS||a.piece.localeCompare(b.piece));
            if(best.length>robots.length)best.pop();
          }
          for(const choice of best){
            candidates.push(choice);destinations.set(r.id+'/'+choice.piece,choice.approach);
          }
        }
        break;
      }
      return row;
    });
    const assignment=allocateOpeningTasks(rows);
    for(const [id,choice] of Object.entries(assignment)){
      if(choice.piece)choice.approach=destinations.get(id+'/'+choice.piece);
      else if(eligibleRobots.has(id))choice.yieldPickup=true;
    }
    return assignment;
  }
  function intake(robot) {
    const angle=robot.heading*Math.PI/180, forward=[Math.cos(angle),Math.sin(angle)];
    const lateral=[-forward[1],forward[0]], {widthIn,extensionIn}=robot.intake;
    const offset=robot.length/2+robot.bumper+extensionIn;
    const center=robot.p.map((v,i)=>v+offset*forward[i]);
    const ends=[-1,1].map(sign=>center.map((v,i)=>v+sign*widthIn/2*lateral[i]));
    return {center,forward,lateral,ends,offset};
  }
  function contact(robot,piece) {
    const mouth=intake(robot), d=piece.p.map((v,i)=>v-mouth.center[i]);
    const front=d[0]*mouth.forward[0]+d[1]*mouth.forward[1];
    const side=Math.abs(d[0]*mouth.lateral[0]+d[1]*mouth.lateral[1]);
    return front>=-1e-6 && Math.hypot(front,Math.max(0,side-robot.intake.widthIn/2))<=piece.radiusIn+1e-6;
  }
  function pickupPose(robot,p,radius) {
    const {forward,offset}=intake(robot);
    return p.map((v,i)=>v-forward[i]*(offset+radius*.85));
  }
  function seek(sim,r,leg) {
    if(!r.intake || leg.operation!=='acquire')return null;
    const key=typeof leg.station==='string'?leg.station:leg.station[r.side], s=stations.get(key);
    if(!(s.floor || s.service) || ![r.side,'both'].includes(s.side))return null;
    const g=sim.game,bay=g.cargo[r.id];
    const pickup=r.pickup??={count:0};
    if(bay.length>=g.capacity[r.id] || pickup.count>=(leg.quantity??1))return {done:true};
    const free=g.motion.pieces.filter(p=>p.station===key);
    const current=free.find(p=>p.id===pickup.id);
    if(current && contact(r,current))return {piece:current};
    if(current && r.waypoints?.length && r.target<r.waypoints.length &&
       Math.hypot(...current.p.map((v,i)=>v-pickup.position[i]))<.25)return {moving:true};
    const another=new Set(sim.robots.filter(peer=>peer!==r).map(peer=>peer.pickup?.id));
    if(sim.phaseIndex===0)for(const [id,opening] of Object.entries(g.opening)){
      if(id!==r.id && id[0]===r.id[0])another.add(opening.piece);
    }
    const first=sim.phaseIndex===0 && !r.visits && !pickup.count?g.opening[r.id]?.piece:null;
    const candidates=free.filter(p=>!another.has(p.id)).map(piece=>{
      const goal=pickupPose(r,piece.p,piece.radiusIn);
      return {piece,goal,distance:Math.hypot(...goal.map((v,i)=>v-r.p[i]))};
    }).sort((a,b)=>Number(b.piece.id===first)-Number(a.piece.id===first) || a.distance-b.distance || a.piece.id.localeCompare(b.piece.id));
    r.waypoints=null;r.dwell=0;delete pickup.id;delete pickup.position;
    for(const {piece,goal} of candidates){
      const path=leg.straight?(geom.hit(r.p,goal,r,sim.setup)?[]:[r.p,goal]):geom.plan(r.p,goal,r,sim.setup);
      if(!path.length)continue;
      pickup.id=piece.id;pickup.position=[...piece.p];r.waypoints=path;r.target=1;
      return contact(r,piece)?{piece}:{moving:true};
    }
    // Depart with a partial batch only after exhausting reachable released stock.
    // A staffed outlet may still release the remainder of its batch.
    if(bay.length && candidates.length===free.length && !g.reserve[key]?.length)return {done:true};
    return {waiting:true};
  }
  function canReach(robot,p,physical){
    if(robot.intake)return contact(robot,{p,radiusIn:physical.radiusIn});
    const poly=geom.footprint(robot.p,robot);
    if(poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>=0;}) ||
       poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])<=0;}))return true;
    const reach=physical.radiusIn+(physical.captureReachIn??0)+1e-6;
    return poly.some((a,i)=>{
      const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
      return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=reach;
    });
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
    if (![robot.side,'both'].includes(s.side) || (!s.floor && !(s.service && robot.intake) && !inRange)) {
      record(sim,robot,s,step.operation,'ineligible-position-or-alliance',[],timeS);return;
    }
    if (step.operation==='acquire') {
      const physical=s.floor ?? s.service;
      if(physical && robot.intake){
        const piece=g.motion.pieces.find(p=>p.id===step.piece && p.station===key);
        const index=piece?g.stock[key].findIndex(p=>p.id===piece.id):-1;
        if(index<0 || bay.length>=g.capacity[robot.id] || !contact(robot,piece))return false;
        const [cargo]=g.stock[key].splice(index,1);
        const witness={position:[...piece.p],radiusIn:piece.radiusIn,mouth:intake(robot).ends,robotPosition:[...robot.p]};
        motion.take(g.motion,piece.id);bay.push(cargo);
        record(sim,robot,s,'acquire','acquired',[cargo],timeS).contact=witness;
        return true;
      }
      const own=g.opening[robot.id]?.piece;
      const reserved=sim.phaseIndex===0?new Set(Object.entries(g.opening).filter(([id])=>id!==robot.id && id[0]===robot.id[0]).map(([,a])=>a.piece)):new Set();
      const nearby=physical?new Set(g.motion.pieces.filter(p=>p.station===key && canReach(robot,p.p,physical)).map(p=>p.id)):null;
      const eligible=g.stock[key].filter(p=>!reserved.has(p.id)&&(!nearby||nearby.has(p.id)));
      if(sim.phaseIndex===0&&own)eligible.sort((a,b)=>Number(b.id===own)-Number(a.id===own));
      const pieces=eligible.slice(0,Math.min(n,g.capacity[robot.id]-bay.length));
      const ids=new Set(pieces.map(p=>p.id));
      g.stock[key]=g.stock[key].filter(p=>!ids.has(p.id));
      if(physical)for(const piece of pieces)motion.take(g.motion,piece.id);
      bay.push(...pieces);
      record(sim,robot,s,step.operation,pieces.length?'acquired':'empty-or-full',pieces,timeS);
      return;
    }
    const pieces=bay.filter(p=>p.type===s.piece).slice(0,n);
    if (!pieces.length) {record(sim,robot,s,'attempt','no-compatible-cargo',[],timeS);return;}
    const used=new Set(pieces);
    g.cargo[robot.id]=bay.filter(p=>!used.has(p));
    dispose(sim,robot,s,pieces,step.outcome ?? 'unresolved',timeS);
  }
  function dispose(sim,robot,s,pieces,prescribed,timeS,basis){
    const g=sim.game,key=s.id;
    let outcome=prescribed;
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
      event.points=points;event.prescribedOutcome=prescribed;event.activity=activity;if(basis)event.basis=basis;
      g.score[robot.side]+=points;
      if(result==='credited'){
        g.occupied[key]+=batch.length;
        if(sim.phaseIndex===0)g.firstPeriodCount[robot.side]+=batch.length;
      }
      g.attempts[key]+=batch.length;
      for (const piece of batch) {
        const rule=s.returns?.[result];
        if(rule){
          const entry={piece,at:rule.at,station:rule.station,readyAtS:elapsed(sim,timeS)+rule.delayS};
          if(result==='credited')entry.releaseSlot=key;
          g.returning.push(entry);
        }else g.terminal.push({...piece,station:key,outcome:result});
      }
    }
  }
  return {start,apply,replenish,move,seek,intake};
}


export function rehearsalFindings(id,basis,game,stations) {
  if (!stations?.length && !game.endgame) return [id+' · '+basis+'. The profile has no registered stock or scoring criterion.'];
  const lines=[id+' · '+basis+'. Modeled rehearsal score: Blue '+game.score.blue+', Red '+game.score.red+'.'];
  const terminal=game.endgame;
  if(terminal){
    lines.push(terminal.basis+'. Sources: '+terminal.sources.join(', ')+'. Powered cutoff '+terminal.activeCutoffS+' s; terminal assessment '+terminal.assessmentTimeS+' s. Terminal criteria represent project scenario assumptions, including continued support through assessment.');
    for(const a of terminal.attempts){
      lines.push(a.robot+' switched from '+(a.interruptedBehavior ?? 'ordinary work')+' at '+(a.interruptedAtS ?? 'pending')+' s in '+terminal.period+
        ' for '+a.action+' at '+a.target+'. Primary result '+a.outcome+'. Terminal assumptions '+JSON.stringify(a.witnesses)+
        '. Award '+(a.awardedAction ?? 'none')+' (+'+a.points+').');
    }
    for(const b of terminal.bonusAwards)lines.push(b.id+' · '+b.side+' '+b.group+' · '+b.robots.join(', ')+' · +'+b.points+' bonus points.');
    if(terminal.assessed)lines.push('Ordinary points Blue '+terminal.ordinaryScore.blue+' / Red '+terminal.ordinaryScore.red+
      '. Terminal points Blue '+terminal.terminalScore.blue+' / Red '+terminal.terminalScore.red+'.');
  }
  for (const station of stations ?? []) {
    if(station.kind==='retrieval') lines.push(station.label+' · '+station.piece+' stock '+game.initial[station.id]+' initially, '+game.stock[station.id].length+' available at snapshot.'+(station.service?' '+game.reserve[station.id].length+' in human reserve at '+station.service.operator+'.':''));
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
