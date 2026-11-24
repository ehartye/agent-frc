import {fieldGeometry} from './field-rehearsal-geometry.mjs';
import {createFieldPieceMotion} from './field-piece-motion.mjs';
import {allocateOpeningTasks} from './auto-allocation.mjs';
import {createScoreAssessment} from './score-assessment.mjs';
import {createArcModel} from './concept-arc.mjs';

/** Project-owned stations and finite stock for the fixed-step field rehearsal. */
export function createRehearsalGame(profile,geom=fieldGeometry(profile),motion=createFieldPieceMotion(profile,geom)) {
  const model = profile.rehearsal;
  const assessment=createScoreAssessment(model);
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
    if(sim.game.concept)land(sim,(sim.ticks+1)*dt);
    if(sim.game.motion.pieces.length)motion.advance(sim.game.motion,dt,sim.robots.map((r,i)=>({...r,previousP:begins[i]})),sim.setup);
  }
  function elapsed(sim,t) {
    return sim.phaseHistory.reduce((sum,p)=>sum+(p.elapsedSeconds??p.seconds),0)+t;
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
          releaseAtTarget(sim,actor,stations.get(svc.delivery.station),[piece],svc.delivery.outcome,t,svc.delivery.basis);
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
  function startObservations(sim,match) {
    if(!assessment)return;
    const frozen=model.series?.matches.find(m=>m.id===match?.id);
    const expected=frozen?.scoreObservations??[];
    // A published trace only describes the original six programs, setup and match.
    const same=frozen && match.setup===frozen.setup && match.tieWinner===frozen.tieWinner &&
      match.endgameAtRestAfterS===frozen.endgameAtRestAfterS &&
      JSON.stringify(match.roster)===JSON.stringify(frozen.roster);
    sim.game.assessment={pending:[],departures:[],used:[],records:assessment.register(same?expected:[],frozen?.id)};
  }
  function observe(sim,t) {
    if(!assessment)return;
    const timeline=sim.game.assessment;
    const now=assessment.phaseStart(sim.phase)+t;
    // Reserve finite physical seats on passage. Score reports have their own clock.
    const changes=[];
    for(const item of timeline.pending){
      const target=stations.get(item.target);
      if(target.capacity!==undefined && item.result.status==='credited' && !item.seat &&
         item.row.observation.passageS<=now+1e-9)
        changes.push({at:item.row.observation.passageS,item,target:target.id});
    }
    for(const arrival of [...changes]){
      const at=arrival.item.row.observation.vacatedS;
      if(at!=null && at<=now+1e-9)changes.push({at,target:arrival.target,item:arrival.item,leave:true});
    }
    for(const departure of timeline.departures){
      if(departure.at<=now+1e-9)changes.push(departure);
    }
    changes.sort((a,b)=>a.at-b.at || Number(Boolean(a.leave))-Number(Boolean(b.leave)));
    for(const change of changes){
      const {target,item}=change;
      if(change.leave){
        if(item && item.seat!=='reserved')continue;
        sim.game.occupied[target]--;
        const index=timeline.departures.indexOf(change);
        if(index!==-1)timeline.departures.splice(index,1);
      }else if(sim.game.occupied[target]>=stations.get(target).capacity){
        item.seat='occupied';
        item.result={...item.result,status:'occupied',pointsPhase:null};
      }else{
        item.seat='reserved';
        sim.game.occupied[target]++;
        const at=item.row.observation.vacatedS;
        if(at!=null && at>now+1e-9)timeline.departures.push({at,target,leave:true});
      }
    }
    for(const item of [...timeline.pending].sort((a,b)=>a.result.reportAtS-b.result.reportAtS)){
      if(item.result.reportAtS>now+1e-9)continue;
      const {row,result}=item;
      const phase=result.pointsPhase??item.releasePhase;
      const s=stations.get(item.target);
      const observedTime=result.reportAtS-assessment.phaseStart(sim.phase);
      dispose(sim,item.robot,s,[item.piece],result.status,observedTime,'Registered piece assessment',
        {phase,seat:item.seat,vacatedS:row.observation?.vacatedS,activity:item.activity,observedAtS:result.reportAtS,releaseId:row.id,releasedAtS:row.releasedS,passageAtS:row.observation?.passageS??null},item.port);
      timeline.pending.splice(timeline.pending.indexOf(item),1);
    }
  }
  function validateStep(step) {
    if(step.deliveryRatePerS!==undefined)legal(step.operation==='attempt' && step.quantity===undefined &&
      Number.isFinite(step.deliveryRatePerS) && step.deliveryRatePerS>0 && step.deliveryRatePerS<=20,
      'A hopper delivery needs an attempt, a positive rate within one piece per simulation tick and no batch limit.');
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
    const concept={},concepts={};
    for (const robot of robots) {
      cargo[robot.id]=[];
      // A concept robot's storage holds each piece type separately; its total bounds the legacy checks.
      capacity[robot.id]=robot.concept?Object.values(robot.concept.storage?.capacity ?? {}).reduce((n,v)=>n+v,0):robot.capacity ?? model.defaults.capacity ?? 1;
      legal(count(capacity[robot.id]),'Invalid robot piece capacity');
      if(robot.concept){
        concept[robot.id]={aim:{},free:{},legKey:null,leg:null};
        concepts[robot.id]={id:robot.concept.id,digest:robot.concept.digest};
      }
      if (!robot.preload) continue;
      const {station:key,quantity}=robot.preload,s=stations.get(key);
      legal(s?.kind==='retrieval' && [robot.side,'both'].includes(s.side) && count(quantity) &&
        quantity<=(robot.concept?robot.concept.storage?.capacity?.[s.piece] ?? 0:capacity[robot.id]) && quantity<=stock[key].length,'Preload exceeds compatible source stock or robot capacity');
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
    return {reserve,operators,motion:motion.start(floor),opening,stock,initial,cargo,capacity,score,attempts,occupied:{...attempts},returning:[],tieWinner,firstPeriodCount:{blue:0,red:0},terminal:[],events:[],
      ...(robots.some(r=>r.concept)?{concept,concepts,ready:{},notices:[]}:{})};
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
  // Concept robots act only through their declared ports. A face's normal is the heading plus its turn.
  // conceptStep returns {done} to end the leg, {waiting} for a recorded wait, or a field {goal} and a field-frame
  // {heading} to drive and turn toward; an empty result holds. Every release or pickup is timed at the tick start.
  const arc=createArcModel();
  const faceTurn={front:0,left:90,back:180,right:-90};
  const wrap=a=>((a%360)+540)%360-180;
  const unit=d=>[Math.cos(d*Math.PI/180),Math.sin(d*Math.PI/180)];
  const bearing=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
  const faceDepth=(r,face)=>(face==='front'||face==='back'?r.length:r.width)/2+r.bumper;
  const portsFor=(list,type)=>(Array.isArray(list)?list:[]).filter(p=>p.pieces?.includes(type));
  const room=(g,r,type)=>(r.concept.storage?.capacity?.[type] ?? 0)-g.cargo[r.id].filter(p=>p.type===type).length-
    (g.concept[r.id].landing ?? []).filter(x=>x.cargo.type===type).length;
  const notice=(g,text)=>{if(!g.notices.includes(text))g.notices.push(text);};
  // The radius of a piece type, by the rule concept:check shares (the arc model's pieceRadiusFor). A point piece (0)
  // flatters the arc check, so the narrative reports it once per robot and type.
  const pieceRadius=type=>arc.pieceRadiusFor([...stations.values()],type);
  // The release point of a ranged output: the centre of its face's bumper surface, at the release height.
  const facePoint=(pose,r,port)=>{const n=unit(pose.heading+faceTurn[port.face]),depth=faceDepth(r,port.face);return [pose.p[0]+n[0]*depth,pose.p[1]+n[1]*depth];};
  function mouth(r,port,heading=r.heading,p=r.p) {
    const forward=unit(heading+faceTurn[port.face]),lateral=[-forward[1],forward[0]];
    const offset=faceDepth(r,port.face)+port.extensionIn,center=p.map((v,i)=>v+offset*forward[i]);
    return {center,forward,lateral,offset,ends:[-1,1].map(sign=>center.map((v,i)=>v+sign*port.widthIn/2*lateral[i]))};
  }
  // The piece touches the robot's bumpered footprint.
  function againstBody(r,piece) {
    const poly=geom.footprint(r.p,r);
    return poly.some((a,i)=>{
      const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((piece.p[0]-a[0])*dx+(piece.p[1]-a[1])*dy)/(dx*dx+dy*dy)));
      return Math.hypot(piece.p[0]-a[0]-t*dx,piece.p[1]-a[1]-t*dy)<=piece.radiusIn+0.5;
    });
  }
  const reachesHeight=(port,piece)=>port.acquireHeightIn.min<=(piece.heightIn ?? 2*piece.radiusIn)+1e-9 && port.acquireHeightIn.max>=-1e-9;
  // The piece touches the face's mouth, or lies inside the deployed intake between the bumper and the mouth, and the
  // face normal is within headingToleranceDeg of the bearing to it.
  function portContact(r,piece,port) {
    const m=mouth(r,port),d=piece.p.map((v,i)=>v-m.center[i]);
    const ahead=d[0]*m.forward[0]+d[1]*m.forward[1],side=Math.abs(d[0]*m.lateral[0]+d[1]*m.lateral[1]);
    const touching=ahead>=-1e-6?Math.hypot(ahead,Math.max(0,side-port.widthIn/2))<=piece.radiusIn+1e-6:
      ahead>=-port.extensionIn-1e-6 && side<=port.widthIn/2+1e-6;
    return touching && reachesHeight(port,piece) &&
      Math.abs(wrap(bearing(r.p,piece.p)-r.heading-faceTurn[port.face]))<=port.headingToleranceDeg+1e-9;
  }
  function conceptStep(sim,r,leg,timeS,dt) {
    const g=sim.game,c=g.concept[r.id],key=typeof leg.station==='string'?leg.station:leg.station[r.side],s=stations.get(key);
    const legKey=sim.phase+'/'+r.leg+'/'+r.visits;
    if(c.legKey!==legKey){
      c.legKey=legKey;c.leg={start:[...r.p]};
      const ignored=['dwell','quantity','deliveryRatePerS'].filter(k=>k==='dwell'?leg.dwell>0:leg[k]!==undefined);
      if(ignored.length)notice(g,r.id+' ignores the step '+ignored.join(' and ')+' of "'+leg.action+'": the port secondsPerPiece governs.');
    }
    if(![r.side,'both'].includes(s.side)){record(sim,r,s,leg.operation,'ineligible-position-or-alliance',[],timeS);return {done:true};}
    return leg.operation==='acquire'?conceptAcquire(sim,r,leg,s,timeS):conceptScore(sim,r,leg,s,c,timeS,dt);
  }
  // A piece taken at once is aboard now. One captured on the move (later) leaves the field now and lands aboard,
  // with its acquisition logged, on the first tick at or after secondsPerPiece; see land().
  // A concept robot held by another robot on a port leg: leave the floor piece it was seeking for 3 s, with every
  // other piece close enough to the blocker to need the same approach (within the blocker's circumscribed radius
  // plus twice its own), or plan the leg again from where it stands.
  function unstick(sim,r,leg,timeS,blocker) {
    const c=sim.game.concept[r.id],until=elapsed(sim,timeS)+3,skip=c.skip??={};
    if(leg.operation==='acquire' && r.pickup?.id){
      skip[r.pickup.id]=until;
      if(blocker){
        const near=geom.circumradius(blocker)+2*geom.circumradius(r);
        for(const piece of sim.game.motion.pieces)if(Math.hypot(piece.p[0]-blocker.p[0],piece.p[1]-blocker.p[1])<=near)skip[piece.id]=until;
      }
      delete r.pickup.id;delete r.pickup.since;delete r.pickup.position;delete r.pickup.pushedSince;
    }else restartLeg(sim,r);
  }
  // Plan the current port leg again from the robot's present pose, keeping what it has already released.
  function restartLeg(sim,r) {
    const c=sim.game.concept[r.id];
    c.leg={start:[...r.p],released:c.leg?.released};
    if(r.pickup)delete r.pickup.rack;
  }
  function take(sim,r,s,piece,port,timeS,later=false) {
    const g=sim.game,[cargo]=g.stock[s.id].splice(g.stock[s.id].findIndex(p=>p.id===piece.id),1);
    const entry={cargo,station:s.id,port:port.id,startedS:timeS,speedInS:r.currentSpeedInS,pose:{p:[...r.p],heading:r.heading}};
    if(piece.p){
      entry.contact={position:[...piece.p],radiusIn:piece.radiusIn,mouth:mouth(r,port).ends,robotPosition:[...r.p],heading:r.heading};
      motion.take(g.motion,piece.id);
    }
    r.pickup.count++;delete r.pickup.id;delete r.pickup.since;delete r.pickup.position;
    if(later)(g.concept[r.id].landing??=[]).push({...entry,dueS:elapsed(sim,timeS)+port.secondsPerPiece});
    else aboard(sim,r,entry,timeS);
  }
  function aboard(sim,r,{cargo,station,...witness},timeS) {
    const g=sim.game;
    Object.assign(record(sim,r,stations.get(station),'acquire','acquired',[cargo],timeS),witness);
    g.cargo[r.id].push(cargo);
    g.ready[cargo.id]=elapsed(sim,timeS)+(r.concept.storage?.transferS ?? 0);
  }
  function land(sim,timeS) {
    for(const r of sim.robots){
      const c=sim.game.concept?.[r.id];
      if(!c?.landing?.length)continue;
      const now=elapsed(sim,timeS),due=c.landing.filter(x=>x.dueS<=now+1e-9);
      c.landing=c.landing.filter(x=>x.dueS>now+1e-9);
      for(const {dueS,...entry} of due)aboard(sim,r,entry,timeS);
    }
  }
  // Acquisition takes secondsPerPiece. With requiresStop the clock starts once the robot is still, and it holds
  // there. Without it, a floor piece is captured on contact at any speed and lands aboard secondsPerPiece later
  // while the robot drives on; the port takes its next piece only then. At a fixed source the clock runs on the move.
  function acquiring(sim,r,s,piece,port,timeS,hold,leg) {
    const c=sim.game.concept[r.id];
    // A busy port waits with the piece at its mouth: brake there rather than drive the mouth over it.
    if(elapsed(sim,timeS)+1e-9<(c.free[port.id] ?? -Infinity))return {heading:hold.heading};
    if(port.requiresStop && r.currentSpeedInS>1e-9)return hold;
    if(!port.requiresStop && piece.p){
      c.free[port.id]=elapsed(sim,timeS)+port.secondsPerPiece;
      take(sim,r,s,piece,port,timeS,true);
      // Drive straight on toward the next pickup, without stopping.
      return conceptAcquire(sim,r,leg,s,timeS);
    }
    r.pickup.since??=timeS;
    if(timeS-r.pickup.since+1e-9<port.secondsPerPiece)return {...hold,action:'Acquiring through '+port.id};
    take(sim,r,s,piece,port,timeS);
    return {};
  }
  // A fixed source's point stands in for the piece. Pick the compatible port that arrives soonest with its face
  // on the bearing to that point, at a goal halfway in from the station radius.
  function rackPlan(r,s,ports) {
    const {topSpeedInS:v,accelInS2:a,rotationDegS}=r.concept.drive;
    let best=null;
    for(const port of ports){
      const toward=Math.hypot(s.at[0]-r.p[0],s.at[1]-r.p[1])>1e-9?bearing(r.p,s.at):r.heading+faceTurn[port.face];
      const n=unit(toward),inset=s.radiusIn/2,goal=[s.at[0]-n[0]*inset,s.at[1]-n[1]*inset],heading=toward-faceTurn[port.face];
      const d=Math.hypot(goal[0]-r.p[0],goal[1]-r.p[1]);
      const time=Math.max(d>=v*v/a?v/a+d/v:2*Math.sqrt(d/a),Math.abs(wrap(heading-r.heading))/rotationDegS);
      if(!best || time<best.time-1e-9)best={time,port,goal,heading};
    }
    return best;
  }
  function conceptAcquire(sim,r,leg,s,timeS) {
    const g=sim.game,type=s.piece,ports=portsFor(r.concept.inputs,type);
    if(!ports.length){notice(g,r.id+' has no input port for '+type+' at '+s.label+'.');return {done:true};}
    if(room(g,r,type)<=0)return {done:true};
    const pickup=r.pickup??={count:0};
    if(!(s.floor || s.service)){
      // Stock moves only while the robot centre is inside the station and the port's face is within
      // headingToleranceDeg of the bearing to the station point.
      const plan=pickup.rack??=rackPlan(r,s,ports),hold={goal:plan.goal,heading:plan.heading};
      if(!inStation(s,r)){delete pickup.since;return hold;}
      if(!g.stock[s.id].length){record(sim,r,s,'acquire','empty-or-full',[],timeS);return {done:true};}
      if(Math.abs(wrap(bearing(r.p,s.at)-r.heading-faceTurn[plan.port.face]))>plan.port.headingToleranceDeg+1e-9){
        delete pickup.since;return {...hold,action:'Turning '+plan.port.id+' to '+s.label};
      }
      return acquiring(sim,r,s,g.stock[s.id][0],plan.port,timeS,hold,leg);
    }
    const c=g.concept[r.id],now=elapsed(sim,timeS),skip=c.skip??={};
    const free=g.motion.pieces.filter(p=>p.station===s.id);
    let current=free.find(p=>p.id===pickup.id);
    // Never plough: a target pressed against the bumper outside the mouth for more than 1 s is left alone for 2 s
    // while the robot seeks another. A nudge from a turn, or a piece that rolls away, is not ploughing.
    if(current){
      const port=ports.find(p=>p.id===pickup.port);
      if(port && !portContact(r,current,port) && againstBody(r,current))pickup.pushedSince??=timeS;
      else delete pickup.pushedSince;
      if(pickup.pushedSince!==undefined && timeS-pickup.pushedSince>1+1e-9){
        skip[current.id]=now+2;delete pickup.id;delete pickup.since;delete pickup.position;delete pickup.pushedSince;current=undefined;
      }
    }
    if(current){
      // A port that must stop drives on to its pickup pose, where the trapezoid brings it to rest.
      const port=ports.find(p=>p.id===pickup.port),hold={goal:pickup.goal,heading:pickup.heading};
      if(port && portContact(r,current,port))return acquiring(sim,r,s,current,port,timeS,hold,leg);
      delete pickup.since;
      if(Math.hypot(current.p[0]-pickup.position[0],current.p[1]-pickup.position[1])<.25)
        return {goal:pickup.goal,heading:pickup.heading,action:'Seeking '+current.id};
    }
    // Choose the piece, port and heading that arrive soonest. The face normal lies on the approach bearing.
    const others=new Set(sim.robots.filter(peer=>peer!==r).map(peer=>peer.pickup?.id));
    if(sim.phaseIndex===0)for(const [id,opening] of Object.entries(g.opening))if(id!==r.id && id[0]===r.id[0])others.add(opening.piece);
    const {topSpeedInS:v,accelInS2:a,rotationDegS}=r.concept.drive;
    let best=null;
    for(const piece of free){
      if(others.has(piece.id) || (skip[piece.id] ?? -Infinity)>now)continue;
      for(const port of ports){
        if(!reachesHeight(port,piece))continue;
        const toward=bearing(r.p,piece.p),heading=toward-faceTurn[port.face],n=unit(toward);
        // A port that need not stop aims its mouth one radius past the piece, so contact comes while still moving;
        // if that port will still be busy on arrival it aims to stop with the piece at its mouth instead.
        const near=Math.hypot(piece.p[0]-r.p[0],piece.p[1]-r.p[1]),eta=near>=v*v/a?v/a+near/v:2*Math.sqrt(near/a);
        const rolls=!port.requiresStop && now+eta+1e-9>=(c.free[port.id] ?? -Infinity);
        const reach=faceDepth(r,port.face)+port.extensionIn+(rolls?-1:.85)*piece.radiusIn,goal=[piece.p[0]-n[0]*reach,piece.p[1]-n[1]*reach];
        if(geom.hit(goal,goal,{...r,heading},sim.setup))continue;
        const d=Math.hypot(goal[0]-r.p[0],goal[1]-r.p[1]);
        const time=Math.max(d>=v*v/a?v/a+d/v:2*Math.sqrt(d/a),Math.abs(wrap(heading-r.heading))/rotationDegS);
        if(!best || time<best.time-1e-9)best={time,piece,port,heading,goal};
      }
    }
    if(!best)return g.cargo[r.id].some(p=>p.type===type) && !g.reserve[s.id]?.length?{done:true}:{waiting:'Waiting for reachable stock'};
    Object.assign(pickup,{id:best.piece.id,position:[...best.piece.p],port:best.port.id,heading:best.heading,goal:best.goal});
    delete pickup.since;
    if(portContact(r,best.piece,best.port))return acquiring(sim,r,s,best.piece,best.port,timeS,{goal:best.goal,heading:best.heading},leg);
    return {goal:best.goal,heading:best.heading,action:'Seeking '+best.piece.id};
  }
  // Plan a scoring leg once, from the robot's position at its start.
  function scoringPlan(sim,r,port,s,start) {
    const g=sim.game;
    if(port.kind==='place'){
      const toward=Math.hypot(s.at[0]-start[0],s.at[1]-start[1])>1e-9?bearing(start,s.at):r.heading+faceTurn[port.face],n=unit(toward);
      const reach=port.place.standOffIn.min+faceDepth(r,port.face);
      return {goal:[s.at[0]-n[0]*reach,s.at[1]-n[1]*reach],heading:toward-faceTurn[port.face]};
    }
    const e=s.entry,E=e.centerIn,depth=faceDepth(r,port.face);
    let away=[start[0]-E[0],start[1]-E[1]],behind=false;
    if(e.kind==='window'){
      const n=unit(e.facingDeg);
      if(away[0]*n[0]+away[1]*n[1]<=1e-9){away=n;behind=true;}  // behind the window: never inside a band
    }
    if(Math.hypot(...away)<1e-9)away=unit(r.heading+180);
    // A window's band depends on the approach, so the band is keyed by a whole-degree approach and the goal is placed
    // along that same rounded direction. A ring's band is the same in every direction.
    let w=away.map(x=>x/Math.hypot(...away));
    const approach=Math.round(Math.atan2(-w[1],-w[0])*180/Math.PI);
    // Rounding must not carry the goal onto or behind the window plane: then approach straight on.
    if(e.kind==='window'){const n=unit(e.facingDeg),r1=unit(approach+180);w=r1[0]*n[0]+r1[1]*n[1]>1e-6?r1:n;}
    const key=[r.concept.digest,port.id,s.id,e.kind==='window'?approach:''].join('/');
    const R=port.ranged;
    const bands=bandCache.get(key) ?? bandCache.set(key,arc.standOffBand(e,pieceRadius(s.piece),{launchSpeedInS:R.launchSpeedInS,elevationDeg:R.elevationDeg},R.releaseHeightIn,approach).bands).get(key);
    if(!bands.length){notice(g,r.id+' has no feasible stand-off from '+s.label+' through '+port.id+'.');return null;}
    // The heading to shoot from comes first; then the goal puts the face point at that heading on the approach line.
    // Without a turret the face turns onto the target. A turret may keep the present heading when the bearing lies in
    // its range (otherwise make the smallest turn that brings it in), but keeping it shifts the face sideways and can
    // lengthen the drive; so a turret robot takes whichever of that heading and the face-on one shoots sooner.
    const toward=Math.atan2(-w[1],-w[0])*180/Math.PI,faceOn=toward-faceTurn[port.face];
    const candidates=[faceOn];
    if(R.turret){
      const off=wrap(toward-r.heading-faceTurn[port.face]),held=Math.min(R.turret.maxDeg,Math.max(R.turret.minDeg,off));
      candidates.unshift(r.heading+off-held);
    }
    const {topSpeedInS:v,accelInS2:a,rotationDegS}=r.concept.drive,turret=c=>c.aim[port.id]?.turretDeg ?? 0;
    let best=null;
    for(const heading of candidates){
      const n=unit(heading+faceTurn[port.face]),face=[start[0]+n[0]*depth,start[1]+n[1]*depth];
      // Distance from the face; a face that is not in front of a window counts as behind it.
      const front=e.kind!=='window' || (face[0]-E[0])*Math.cos(e.facingDeg*Math.PI/180)+(face[1]-E[1])*Math.sin(e.facingDeg*Math.PI/180)>1e-9;
      const d0=behind || !front?-Infinity:Math.hypot(face[0]-E[0],face[1]-E[1]);
      // Stay where the face already lies inside a band; otherwise stop with the face 1 in inside the nearest band
      // edge. A shooter with firesWhileMoving has the same goal and may also release on the way whenever it is under
      // its speed cap, on target and the arc passes, so the capability never delays a release.
      let choice=null;
      for(const b of bands){
        const inside=d0>=b.minIn && d0<=b.maxIn,narrow=b.maxIn-b.minIn<2;
        const lo=narrow?(b.minIn+b.maxIn)/2:b.minIn+1,hi=narrow?lo:b.maxIn-1;
        const near=inside?d0:d0>b.maxIn?hi:lo,gap=Math.abs(near-d0);
        if(!choice || gap<choice.gap)choice={gap,inside,distance:near};
      }
      const goal=choice.inside?[...start]:[E[0]+w[0]*choice.distance-n[0]*depth,E[1]+w[1]*choice.distance-n[1]*depth];
      const d=Math.hypot(goal[0]-start[0],goal[1]-start[1]),slew=R.turret?.slewDegS ?? Infinity;
      const time=Math.max(d>=v*v/a?v/a+d/v:2*Math.sqrt(d/a),Math.abs(wrap(heading-r.heading))/rotationDegS,
        Math.abs(wrap(toward-heading-faceTurn[port.face])-turret(g.concept[r.id]))/slew);
      if(!best || time<best.time-1e-9)best={time,goal,heading};
    }
    return {goal:best.goal,heading:best.heading};
  }
  const bandCache=new Map(),arcCache=new Map();
  // A drag-free arc from the output face at the release height, cached per rounded face point, velocity and elevation.
  function arcAt(pose,r,port,s,velocity,elevation) {
    const R=port.ranged,f=facePoint(pose,r,port);
    const key=[port.id,s.id,...f.map(v=>Math.round(v*4)),...velocity.map(v=>Math.round(v)),elevation===null?'':Math.round(elevation*100),
      R.launchSpeedInS.min,R.launchSpeedInS.max,R.elevationDeg.min,R.elevationDeg.max,R.releaseHeightIn].join('/');
    if(!arcCache.has(key)){
      if(arcCache.size>20000)arcCache.clear();
      arcCache.set(key,arc.arcCheck({positionIn:[f[0],f[1],R.releaseHeightIn]},{...s.entry,pieceRadiusIn:pieceRadius(s.piece)},
        {launchSpeedInS:R.launchSpeedInS,elevationDeg:elevation===null?R.elevationDeg:{min:elevation,max:elevation}},velocity));
    }
    return arcCache.get(key);
  }
  function conceptScore(sim,r,leg,s,c,timeS,dt) {
    const g=sim.game,type=s.piece,aboard=g.cargo[r.id].filter(p=>p.type===type);
    if(!aboard.length){
      if(c.leg.released)return {done:true};
      // Like a legacy robot, an empty-handed robot reports at the step's point rather than looping in place.
      if(Math.hypot(r.p[0]-leg.point[0],r.p[1]-leg.point[1])>1e-6)return {goal:leg.point};
      record(sim,r,s,'attempt','no-compatible-cargo',[],timeS);return {done:true};
    }
    if(!c.leg.port){
      const ports=portsFor(r.concept.outputs,type);
      if(!ports.length){notice(g,r.id+' has no output port for '+type+' at '+s.label+'.');return {done:true};}
      // The first output that can serve this target: a place output whose release-height range covers the entry
      // (or with no entry to check), or a ranged output where an entry exists.
      const z=s.entry?.centerIn[2];
      const port=ports.find(p=>p.kind==='place'?z===undefined || z>=p.place.releaseHeightIn.min-1e-9 && z<=p.place.releaseHeightIn.max+1e-9:Boolean(s.entry));
      if(!port){
        for(const p of ports){
          if(p.kind==='ranged')notice(g,r.id+' cannot score at '+s.label+' through '+p.id+': no entry region.');
          else notice(g,r.id+' cannot place at '+s.label+' through '+p.id+': release height '+p.place.releaseHeightIn.min+'–'+p.place.releaseHeightIn.max+' in misses the entry at '+z+' in.');
        }
        return {done:true};
      }
      if(port.kind==='ranged' && !pieceRadius(type))notice(g,r.id+' piece radius unknown for '+type+'; arc check assumes 0.');
      const plan=scoringPlan(sim,r,port,s,c.leg.start);
      if(!plan)return {done:true};
      Object.assign(c.leg,{port,plan});
    }
    const port=c.leg.port,plan=c.leg.plan,now=elapsed(sim,timeS),moving=r.currentSpeedInS>1e-9;
    const ready=aboard.find(p=>(g.ready[p.id] ?? -Infinity)<=now+1e-9),free=now+1e-9>=(c.free[port.id] ?? -Infinity);
    const arrived=r.waypoints?.length>0 && r.target>=r.waypoints.length;
    let fire=ready && free && (!moving || !port.requiresStop);
    if(port.kind==='place'){
      const normal=r.heading+faceTurn[port.face],f=unit(normal),depth=faceDepth(r,port.face);
      const gap=Math.hypot(s.at[0]-r.p[0]-f[0]*depth,s.at[1]-r.p[1]-f[1]*depth),band=port.place.standOffIn;
      fire=fire && gap>=band.min-1e-6 && gap<=band.max+1e-6 && Math.abs(wrap(bearing(r.p,s.at)-normal))<=port.place.headingToleranceDeg+1e-9;
      if(fire)release(sim,r,leg,s,c,port,ready,timeS,moving);
      return {goal:plan.goal,heading:plan.heading};
    }
    const R=port.ranged,aim=c.aim[port.id]??={turretDeg:0,elevationDeg:R.elevationDeg.min};
    const E=s.entry.centerIn,beta=bearing(r.p,E),normal=r.heading+faceTurn[port.face],off=wrap(beta-normal);
    // Turn the face onto the target. A turret robot holds its planned shooting heading while the bearing from it
    // lies in the turret's range, and otherwise turns only as far as the range needs.
    let heading=beta-faceTurn[port.face],turretGoal=0;
    if(R.turret){
      const clamp=x=>Math.min(R.turret.maxDeg,Math.max(R.turret.minDeg,x)),planned=wrap(beta-plan.heading-faceTurn[port.face]);
      if(Math.abs(planned-clamp(planned))<1e-9)heading=plan.heading;
      else heading=Math.abs(off-clamp(off))>1e-9?r.heading+off-clamp(off):undefined;
      turretGoal=clamp(wrap(beta-(heading ?? r.heading)-faceTurn[port.face]));
      if(heading!==undefined && Math.abs(wrap(heading-r.heading))<1e-9)heading=undefined;
    }
    const next=r.waypoints?.[r.target],toward=next && moving?Math.atan2(next[1]-r.p[1],next[0]-r.p[0]):0;
    const velocity=moving?[r.currentSpeedInS*Math.cos(toward),r.currentSpeedInS*Math.sin(toward)]:[0,0];
    const cap=R.firesWhileMoving?.maxRobotSpeedInS;
    fire=fire && (!moving || cap!==undefined && r.currentSpeedInS<=cap+1e-9) &&
      Math.abs(wrap(beta-normal-(R.turret?aim.turretDeg:0)))<=R.aimToleranceDeg+1e-9 && arcAt(r,r,port,s,velocity,aim.elevationDeg).feasible;
    if(fire)release(sim,r,leg,s,c,port,ready,timeS,moving);
    // Slew after the check: the turret toward the bearing and the hood toward the best arc from this pose.
    if(R.turret)aim.turretDeg+=Math.sign(turretGoal-aim.turretDeg)*Math.min(Math.abs(turretGoal-aim.turretDeg),R.turret.slewDegS*dt);
    let hood=true;
    if(R.elevationDeg.slewDegS && !fire){
      const best=arcAt(r,r,port,s,velocity,null),target=best.feasible?best.elevationDeg:c.leg.elevation??=arcAt({p:plan.goal,heading:plan.heading},r,port,s,[0,0],null).elevationDeg;
      if(Number.isFinite(target)){
        aim.elevationDeg+=Math.sign(target-aim.elevationDeg)*Math.min(Math.abs(target-aim.elevationDeg),R.elevationDeg.slewDegS*dt);
        hood=Math.abs(target-aim.elevationDeg)<1e-6;
      }
    }
    // Give up only from a settled pose: arrived and still, the body turned, the turret and the hood slewed.
    const settled=(heading===undefined || Math.abs(wrap(heading-r.heading))<1e-9) && hood &&
      (!R.turret || Math.abs(turretGoal-aim.turretDeg)<1e-9);
    if(!fire && arrived && !moving && ready && settled && !arcAt(r,r,port,s,[0,0],null).feasible){
      notice(g,r.id+' found no arc into '+s.label+' from ['+r.p.map(v=>Math.round(v)).join(', ')+'] through '+port.id+'.');return {done:true};
    }
    return {goal:plan.goal,heading};
  }
  function release(sim,r,leg,s,c,port,piece,timeS,moving) {
    const g=sim.game;
    g.cargo[r.id]=g.cargo[r.id].filter(p=>p!==piece);
    c.free[port.id]=elapsed(sim,timeS)+port.secondsPerPiece;c.leg.released=true;
    // A moving ranged release scores the moving fraction; a place output has only its own.
    const fraction=moving && port.ranged?.firesWhileMoving?port.ranged.firesWhileMoving.successFraction:port.successFraction;
    // Without a prescribed outcome a release is unresolved, exactly as for a legacy robot.
    const at=port.kind==='ranged'?[...facePoint(r,r,port),port.ranged.releaseHeightIn]:undefined;
    releaseAtTarget(sim,r,s,[piece],leg.outcome ?? 'unresolved',timeS,undefined,
      {port:port.id,successFraction:fraction,moving,speedInS:r.currentSpeedInS,pose:{p:[...r.p],heading:r.heading,...(at?{releaseIn:at}:{})}});
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
    const inRange=inStation(s,robot);
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
    releaseAtTarget(sim,robot,s,pieces,step.outcome ?? 'unresolved',timeS);
  }
  function releaseAtTarget(sim,robot,s,pieces,prescribed,timeS,basis,port){
    const g=sim.game;
    if(assessment && [...assessment.rules.values()].some(r=>r.target===s.id && r.phase===sim.phase)){
      const ledger=g.assessment,now=assessment.phaseStart(sim.phase)+timeS;
      for(const piece of pieces){
        const choices=ledger.records.filter(({row})=>row.piece===piece.id && row.robot===robot.id && row.target===s.id &&
          assessment.rules.get(row.rule).phase===sim.phase && !ledger.used.includes(row.id) &&
          row.releasedS>now-.05-1e-9 && row.releasedS<=now+1e-9);
        if(choices.length!==1){dispose(sim,robot,s,[piece],'unresolved',timeS,'No matching measured release in this tick');continue;}
        const {row,result}=choices[0];
        ledger.used.push(row.id);
        ledger.pending.push({row,result,releasePhase:sim.phase,activity:result.status==='inactive'?'inactive':'active',
          target:s.id,robot:{id:robot.id,side:robot.side},piece,...(port?{port}:{})});
        const event=record(sim,robot,s,'release','awaiting-assessment',[piece],timeS);
        event.releaseId=row.id;event.releasedAtS=row.releasedS;
        if(port)Object.assign(event,port);
      }
      return;
    }
    dispose(sim,robot,s,pieces,prescribed,timeS,basis,undefined,port);
  }
  function stationActivity(sim,s,timeS){
    if(!s.activeWindows)return 'active';
    const windows=s.activeWindows.filter(w=>w.phase===sim.phase && w.fromS<=timeS && timeS<w.toS);
    const counts=sim.game.firstPeriodCount;
    const leader=sim.phaseIndex===0?undefined:counts.blue===counts.red?sim.game.tieWinner:counts.blue>counts.red?'blue':'red';
    if(windows.some(w=>!w.firstPeriodLeader || w.firstPeriodLeader===leader))return 'active';
    return windows.length && !leader?'unresolved':'inactive';
  }
  function mayDeliver(sim,robot,leg,timeS){
    const key=typeof leg.station==='string'?leg.station:leg.station[robot.side],s=stations.get(key);
    return [robot.side,'both'].includes(s.side) && stationActivity(sim,s,timeS)==='active' &&
      (s.capacity===undefined || sim.game.occupied[key]<s.capacity) &&
      sim.game.cargo[robot.id].some(p=>p.type===s.piece) && inStation(s,robot);
  }
  function inStation(s,robot){
    return s.areaIn?robot.p.every((v,i)=>v>=s.areaIn[0][i] && v<=s.areaIn[1][i]):
      Math.hypot(robot.p[0]-s.at[0],robot.p[1]-s.at[1])<=s.radiusIn;
  }
  // port: a concept release's port, pose and successFraction. A credited piece then scores points x fraction.
  function dispose(sim,robot,s,pieces,prescribed,timeS,basis,observed,port){
    const g=sim.game,key=s.id;
    let outcome=prescribed;
    const activity=observed?.activity??stationActivity(sim,s,timeS);
    if(activity!=='active')outcome=activity;
    const admitted=outcome==='credited' && s.capacity!==undefined && observed?.seat!=='reserved' ?
      Math.min(pieces.length,Math.max(0,s.capacity-g.occupied[key])) : pieces.length;
    for(const [result,batch] of [[outcome,pieces.slice(0,admitted)],['occupied',pieces.slice(admitted)]]){
      if(!batch.length)continue;
      const event=record(sim,robot,s,'attempt',result,batch,timeS);
      const scoredPhase=observed?.phase??sim.phase;
      if(observed)Object.assign(event,{creditPhase:observed.phase,observedAtS:observed.observedAtS,
        releaseId:observed.releaseId,releasedAtS:observed.releasedAtS,passageAtS:observed.passageAtS});
      const points=result==='credited'?batch.length*(typeof s.points==='number'?s.points:s.points[scoredPhase])*(port?.successFraction ?? 1):0;
      event.points=points;event.prescribedOutcome=prescribed;event.activity=activity;if(basis)event.basis=basis;
      if(port)Object.assign(event,port);
      g.score[robot.side]+=points;
      if(g.endgame?.assessed)g.endgame.ordinaryScore[robot.side]+=points;
      if(result==='credited'){
        if(observed?.seat!=='reserved')g.occupied[key]+=batch.length;
        if(scoredPhase===model.periods[0].name)g.firstPeriodCount[robot.side]+=batch.length;
      }
      g.attempts[key]+=batch.length;
      for (const piece of batch) {
        const rule=s.returns?.[result];
        if(rule && (observed?.seat!=='reserved' || observed.vacatedS!=null)){
          const entry={piece,at:rule.at,station:rule.station,readyAtS:elapsed(sim,timeS)+rule.delayS};
          if(observed?.seat==='reserved')entry.readyAtS=Math.max(entry.readyAtS,observed.vacatedS);
          else if(result==='credited')entry.releaseSlot=key;
          g.returning.push(entry);
        }else g.terminal.push({...piece,station:key,outcome:result});
      }
    }
  }
  return {start,startObservations,observe,apply,replenish,move,seek,intake,mayDeliver,conceptStep,restartLeg,unstick,mouth};
}


export function rehearsalFindings(id,basis,game,stations) {
  if (!stations?.length && !game.endgame) return [id+' · '+basis+'. The profile has no registered stock or scoring criterion.'];
  // Concept credit is fractional (points x successFraction); show it to 0.001.
  const round=x=>Math.round(x*1000)/1000;
  const lines=[id+' · '+basis+'. Modeled rehearsal score: Blue '+round(game.score.blue)+', Red '+round(game.score.red)+'.'];
  for(const [robot,c] of Object.entries(game.concepts ?? {}))lines.push(robot+' concept '+c.id+' · digest '+c.digest+'.');
  lines.push(...game.notices ?? []);
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
    const key=[ev.phase,ev.station,ev.robot,ev.outcome,...(ev.port?['via '+ev.port]:[]),
      ...(ev.successFraction!==undefined?['success fraction '+ev.successFraction]:[])].join(' · ');
    const existing=groups.get(key) ?? {count:0,pieces:0,points:0};
    existing.count++;existing.pieces+=ev.pieces.length;existing.points+=ev.points ?? 0;groups.set(key,existing);
  }
  for(const [key,v] of groups)lines.push(key+': '+v.count+' actions, '+v.pieces+' pieces, '+round(v.points)+' modeled points.');
  lines.push(Object.entries(game.cargo).map(([robot,pieces])=>robot+' '+pieces.length+' aboard').join(', ')+
    '; '+game.returning.length+' pieces awaiting a configured return.');
  return lines;
}
