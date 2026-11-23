import {createFieldPieceMotion} from './field-piece-motion.mjs';
import { createRehearsalGame } from './rehearsal-game.mjs';
import { createTerminalRehearsal } from './rehearsal-terminal.mjs';
import { fieldGeometry } from './field-rehearsal-geometry.mjs';

// Functions are serialized by the kickoff builder. Keep this factory self-contained.
export function createFieldRehearsal(profile) {
  const geom=fieldGeometry(profile);
  const model=profile.rehearsal, supported=Boolean(model?.schema==='field-rehearsal/v1');
  const L=profile.field.length,W=profile.field.width,dt=0.05;
  const game=supported ? createRehearsalGame(profile,geom,createFieldPieceMotion(profile,geom)) : null;
  const terminal=supported ? createTerminalRehearsal(profile) : null;
  // A robot-to-robot wait cycle that holds this long without any member moving is reported. With
  // rehearsal.waitCycles "yield" it also triggers one deterministic yield; otherwise motion is unchanged.
  const waitCycleS=1, yieldCycles=model?.waitCycles==='yield', giveWayS=3;
  const behaviors=Object.fromEntries(Object.entries(model?.programs || {}).map(([key,p])=>[key,p.label]));
  const phases=model?.periods || [];
  const duration=name=>Math.round((phases.find(p=>p.name===name)?.seconds || 0)/dt);
  const wallDuration=name=>duration(name)+Math.round((phases.find(p=>p.name===name)?.passiveAfterS??0)/dt);
  const norm=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const sidePoint=(q,side)=>side==='blue'?[...q]:[model.mirror.redX?L-q[0]:q[0],model.mirror.redY?W-q[1]:q[1]];
  const assessRoute=(line,body,setup=model?.setups[0])=>supported?geom.assessRoute(line,body,setup):
    {status:'unknown',obstacle:null,segment:null};
  // A robot that names concept: "<id>" takes the compiled record embedded in rehearsal.concepts: its body,
  // speed and concept block. Its ports replace any directional intake or single capacity it inherited.
  function withConcept(row) {
    if(typeof row.concept!=='string')return row;
    const found=(model.concepts ?? []).find(c=>c.record?.concept?.id===row.concept);
    if(!found)throw Error('Unknown concept "'+row.concept+'": embed it in rehearsal.concepts.');
    const {intake,capacity,...rest}=row;
    return {...rest,...structuredClone(found.record)};
  }
  function defaults(side,slot) {
    const {orders,roster:projectRoster,...body}=model.defaults,order=orders[slot-1];
    if(body.frameProfile===undefined&&profile.frameProfile!==undefined)body.frameProfile=profile.frameProfile;
    const heading=side==='red'?Math.atan2((model.mirror.redY?-1:1)*Math.sin(body.heading*Math.PI/180),
      (model.mirror.redX?-1:1)*Math.cos(body.heading*Math.PI/180))*180/Math.PI:body.heading;
    const plans=Object.fromEntries(phases.map(p=>[p.name,order]));
    return withConcept({id:(side==='blue'?'B':'R')+slot,side,slot,plans,...body,heading});
  }
  function completeRoster(rows=[]) {
    if(!Array.isArray(rows) || rows.some(r=>!sides.includes(r.side) || ![1,2,3].includes(r.slot)) ||
       new Set(rows.map(r=>r.side+'/'+r.slot)).size!==rows.length)throw Error('Use unique alliance slots 1 through 3.');
    return sides.flatMap(side=>[1,2,3].map(slot=>withConcept({...defaults(side,slot),...rows.find(r=>r.side===side&&r.slot===slot)})));
  }
  const sides=['blue','red'];
  function startingRoster(){
    const rows=model.defaults.roster ?? model.series?.matches?.[0]?.roster ?? [];
    return completeRoster(rows);
  }
  function reservations(){
    const names=new Set([model.resourceLabel]);
    for(const program of Object.values(model.programs)){
      for(const list of [program.steps,...Object.values(program.byPeriod || {})]) {
        for(const step of list)if(typeof step.lock==='string')names.add(step.lock);
      }
    }
    return Object.fromEntries([...names].map(key=>[key,{owner:null,queue:[]}]));
  }
  function create(roster,setup,tieWinner=model?.defaultTieWinner,atRestAfterS,match) {
    if(roster?.length!==6)throw Error('A match needs exactly six unique alliance slots, three per side.');
    return createProbe(roster,setup,tieWinner,atRestAfterS,match);
  }
  function createProbe(roster,setup=model?.setups[0],tieWinner,atRestAfterS,match) {
    if(!supported)throw Error('Supply an external rehearsal geometry and behavior model.');
    if(!model.setups.includes(setup))throw Error('Unknown obstacle setup.');
    if(!Array.isArray(roster) || roster.length>6)throw Error('Use up to three robots per alliance.');
    const robots=[];
    for(const row of roster) {
      const b=withConcept(row);
      if(!['blue','red'].includes(b.side) || ![1,2,3].includes(b.slot) ||
        b.id!==defaults(b.side,b.slot).id || robots.some(r=>r.id===b.id) ||
        !b.plans || !phases.every(p=>Object.hasOwn(behaviors,b.plans[p.name])) ||
        !geom.validBody(b) || !Number.isFinite(b.speed) || b.speed<=0 || b.speed>500) {
        throw Error('Check unique alliance slots, positive dimensions and speed (up to 500 in/s).');
      }
      if(b.concept!==undefined){
        // Only the drive is read here. The other concept-bot keys belong to the game and pass through.
        const drive=b.concept?.drive;
        if(!drive || typeof drive!=='object')throw Error(b.id+' concept.drive must describe the drive.');
        if(drive.type!=='swerve')throw Error(b.id+' concept.drive.type must be "swerve"; v1 admits only swerve.');
        for(const key of ['topSpeedInS','accelInS2','rotationDegS'])
          if(!Number.isFinite(drive[key]) || drive[key]<=0)throw Error(b.id+' concept.drive.'+key+' must be a finite positive number.');
      }
      if(b.intake && (!(b.intake.widthIn>0) || b.intake.widthIn>b.width+2*b.bumper || !Number.isFinite(b.intake.extensionIn) || b.intake.extensionIn<0))throw Error('Supply a positive intake width within the footprint and a nonnegative extension.');
      const p=sidePoint(model.starts[b.slot-1],b.side);
      const collision=geom.hit(p,p,b,setup);
      if(collision)throw Error(b.id+' start overlaps '+collision.name+'.');
      for(const other of robots) if(geom.robotContact(p,p,b,other.p,other.p,other)!==null)
        throw Error(b.id+' start overlaps '+other.id+'.');
      robots.push({...b,p,leg:0,waypoints:null,target:0,dwell:0,wait:0,travelIn:0,visits:0,blocked:'',action:'',...(b.concept?{currentSpeedInS:0}:{})});
    }
    robots.sort((a,b)=>a.id.localeCompare(b.id));
    const ledger=game.start(robots,tieWinner,setup);
    if(terminal){
      ledger.endgame=terminal.start(robots,atRestAfterS,setup);
      const g=ledger.endgame;
      if(model.scoreAssessment && g.assessmentTimeS>g.activeCutoffS+(phases.at(-1).passiveAfterS??0)+1e-9)
        throw Error('Include the registered final assessment time in the continuous replay clock.');
    }
    else if(robots.some(r=>r.endgame!==undefined) || atRestAfterS!==undefined)throw Error('Supply an endgame model before scheduling a terminal action.');
    const sim={robots,setup,game:ledger,phase:phases[0].name,phaseIndex:0,ticks:0,paused:true,ended:false,resources:reservations(),hotspots:[],
      log:[], carry:0,phaseHistory:[],deadlocks:[],waitCycles:{},waitCycleLog:[]};
    if(model.scoreAssessment){
      const sameExecution=match && roster.length===6 && setup===match.setup &&
        tieWinner===(match.tieWinner??model.defaultTieWinner) && atRestAfterS===match.endgameAtRestAfterS &&
        JSON.stringify(completeRoster(roster))===JSON.stringify(completeRoster(match.roster));
      game.startObservations(sim,sameExecution?match:null);
    }
    game.replenish(sim,0);
    return sim;
  }
  function program(r,sim){return model.programs[r.plans[sim.phase]];}
  // Resolve an authored step to the field point a robot on this side and slot drives to.
  function waypoint(step,side,slot) {
    const spec=step.at;
    const q=Array.isArray(spec)?spec:spec[side] || spec.slots?.[slot] || spec.default;
    return step.frame==='field'?[...q]:sidePoint(q,side);
  }
  function itinerary(r,sim) {
    const chosen=program(r,sim);
    const steps=chosen.byPeriod?.[sim.phase] || chosen.steps;
    const opening=sim.phaseIndex===0 && r.visits===0?sim.game.opening[r.id]:null;
    const first=opening?steps.findIndex(s=>s.operation==='acquire'):-1;
    return steps.map((step,index)=>{
      if(index===first && opening?.approach)return {...step,station:opening.station,action:step.label,point:opening.approach,dwell:Math.round((step.dwell??0)/dt)};
      if(index===first && opening?.yieldPickup)return {action:'Yield opening pickup',point:r.p,dwell:0};
      return {...step,action:step.label,point:waypoint(step,r.side,r.slot),
        dwell:Math.round((step.dwell || 0)/dt)};
    });
  }
  function event(sim,msg) {
    sim.log.push({phase:sim.phase,t:sim.ticks*dt,message:msg});
    if(sim.log.length>24)sim.log.shift();
  }
  function recordWait(sim,r,why) {
    r.wait++;r.blocked=why;
    const key=[Math.floor(r.p[0]/24),Math.floor(r.p[1]/24)].join(',');
    let spot=sim.hotspots.find(v=>v.key===key);
    if(!spot){spot={key,point:[...r.p],ticks:0};sim.hotspots.push(spot);}
    spot.ticks++;
  }
  function release(sim,r,key) {
    const resource=sim.resources[key];
    if(resource.owner===r.id){resource.owner=null;event(sim,r.id+' cleared '+key);}
    resource.queue=resource.queue.filter(id=>id!==r.id);
  }
  // Swerve concept motion. A leg may carry requiredHeading, in field-frame degrees. The heading turns the
  // shorter way toward it at up to rotationDegS while the robot translates, and the leg ends once both are done.
  // Translation follows a trapezoid from the current speed: accelInS2 up to topSpeedInS, then a stop at the leg
  // end, measured along the remaining waypoints. Corners are taken without slowing. currentSpeedInS is 0
  // whenever the robot does not translate in a tick: at the start, during a dwell, a wait or a turn in place.
  let turnTo,nextSpeed=0,portLeg=false;
  const turnLeft=(r,goal)=>goal===undefined?0:((goal-r.heading)%360+540)%360-180;
  function turned(r,goal) {
    const left=turnLeft(r,goal),most=r.concept.drive.rotationDegS*dt;
    if(Math.abs(left)<1e-9)return r.heading;
    return Math.abs(left)<=most+1e-9?goal:r.heading+Math.sign(left)*most;
  }
  // Distance covered and speed reached after one tick, starting at speed v with distance D left to the stop.
  function trapezoid(v,D,a,top) {
    if(D<=1e-9)return [D,0];
    v=Math.min(v,top);
    // Never brake harder than accelInS2. After a replan onto a route too short to stop on, the robot reaches the
    // goal still moving and coasts past it (see poweredStep).
    const brake=a, peak=Math.max(v,Math.min(top,Math.sqrt((2*a*brake*D+brake*v*v)/(a+brake))));
    const t1=(peak-v)/a, s1=(peak*peak-v*v)/(2*a), s3=peak*peak/(2*brake), s2=Math.max(0,D-s1-s3), t2=s2/peak, t3=peak/brake;
    if(dt<=t1)return [v*dt+a*dt*dt/2,v+a*dt];
    if(dt<=t1+t2)return [s1+peak*(dt-t1),peak];
    const t=dt-t1-t2;
    if(t<t3-1e-12){
      const covered=s1+s2+peak*t-brake*t*t/2;
      // The goal is reached before the speed is spent: stop there at the speed left on arrival.
      return covered<D?[covered,peak-brake*t]:[D,Math.sqrt(Math.max(0,peak*peak-2*brake*(D-s1-s2)))];
    }
    return [D,0];
  }
  function proposal(sim,r) {
    r.blocked='';turnTo=undefined;nextSpeed=0;portLeg=false;
    const goal=terminal?.enter(sim,r,sim.ticks*dt);
    if(goal)delete r.pickup;
    if(goal && terminal.inside(r,goal)){
      r.action='Holding at '+goal.label;return r.p;
    }
    const legs=goal?[{point:goal.at,action:'Approach '+goal.label}]:itinerary(r,sim);
    if(!legs.length || r.leg>=legs.length){r.action=legs.length?'Holding at destination':'Holding position';return r.p;}
    const leg=legs[r.leg];
    r.action=leg.action;
    const key=typeof leg.lock==='string'?leg.lock:model.resourceLabel;
    const resource=sim.resources[key];
    if(leg.lock && resource.owner!==r.id){
      if(!resource.queue.includes(r.id)){resource.queue.push(r.id);event(sim,r.id+' requested '+key);}
      if(resource.owner || resource.queue[0]!==r.id){
        recordWait(sim,r,'Queue at '+key+' for '+(resource.owner || resource.queue[0]));return r.p;
      }
      resource.queue.shift();resource.owner=r.id;event(sim,r.id+' entered '+key);
    }
    if(r.concept)turnTo=leg.requiredHeading;
    function finishLeg(){
      if(leg.release)release(sim,r,key);
      r.leg++;r.dwell=0;r.waypoints=null;delete r.pickup;delete r.goal;delete r.makeRoom;turnTo=undefined;
      if(r.leg===legs.length){
        r.visits++;event(sim,r.id+' completed '+leg.action);
        if(program(r,sim).loop)r.leg=0;
      }
      return r.p;
    }
    // A concept robot's acquisitions and releases go through its ports; the game supplies each goal and heading.
    if(r.concept && leg.operation){
      portLeg=true;
      // Making room to turn: drive to the clear pose at the present heading, then plan the leg again from there.
      if(r.makeRoom){
        r.action='Making room to turn';
        if(r.target<r.waypoints.length)return drive(r);
        delete r.makeRoom;delete r.goal;r.waypoints=null;game.restartLeg(sim,r);
      }
      const next=game.conceptStep(sim,r,leg,sim.ticks*dt,dt);
      if(next.done)return finishLeg();
      turnTo=next.heading;
      if(next.action)r.action=next.action;
      if(next.waiting){recordWait(sim,r,next.waiting);return r.p;}
      if(!next.goal)return r.p;
      if(!r.goal || norm(r.goal,next.goal)>.25){
        r.goal=[...next.goal];r.target=1;
        // With a turn still to make, plan for the circumscribed circle, which clears every heading on the way.
        // Where the circle cannot pass, plan for the body that will move first: the present footprint when the
        // robot cannot turn where it stands, otherwise the footprint at the goal heading (the turn usually ends
        // first). Each tick's check decides, and a static block replans from the pose reached.
        const route=body=>leg.straight?(geom.hit(r.p,r.goal,body,sim.setup)?[]:[r.p,r.goal]):geom.plan(r.p,r.goal,body,sim.setup);
        const turning=Math.abs(turnLeft(r,turnTo))>1e-9,circle={...r,circleIn:geom.circumradius(r)};
        const order=!turning?[r]:geom.hit(r.p,r.p,circle,sim.setup)?[r,{...r,heading:turnTo}]:[circle,{...r,heading:turnTo},r];
        r.waypoints=[];
        for(const body of order)if(!r.waypoints.length)r.waypoints=route(body);
      }
      if(!r.waypoints.length){recordWait(sim,r,'No footprint-clear path · '+leg.action);return r.p;}
      return r.target>=r.waypoints.length?r.p:drive(r);
    }
    const pursuit=game.seek(sim,r,leg);
    if(pursuit?.done)return finishLeg();
    if(pursuit?.waiting){recordWait(sim,r,'Waiting for reachable stock');return r.p;}
    if(pursuit?.piece){
      r.action='Intake contact with '+pursuit.piece.id;
      if(++r.dwell>=Math.max(1,Math.ceil(leg.dwell/(leg.quantity??1)))){
        if(game.apply(sim,r,{...leg,piece:pursuit.piece.id},(sim.ticks+1)*dt))r.pickup.count++;
        delete r.pickup.id;r.waypoints=null;r.dwell=0;
      }
      return r.p;
    }
    if(pursuit?.moving)r.action='Seeking '+r.pickup.id;
    if(!r.waypoints) {
      if(leg.straight) r.waypoints=geom.hit(r.p,leg.point,r,sim.setup)?[]:[r.p,leg.point];
      else r.waypoints=geom.plan(r.p,leg.point,r,sim.setup);
      r.target=1;
    }
    if(r.waypoints.length===0){
      recordWait(sim,r,'No footprint-clear path · '+leg.action);
      return r.p;
    }
    if(r.target>=r.waypoints.length) {
      if(r.concept && Math.abs(turnLeft(r,turnTo))>=1e-9)return r.p;
      if(leg.deliveryRatePerS){
        const time=(sim.ticks+1)*dt;
        if(!game.mayDeliver(sim,r,leg,sim.ticks*dt) || !game.mayDeliver(sim,r,leg,time))return finishLeg();
        r.dwell+=dt*leg.deliveryRatePerS;
        if(r.dwell+1e-9>=1){
          game.apply(sim,r,{...leg,quantity:1},time);
          r.dwell=Math.max(0,r.dwell-1);
          if(!game.mayDeliver(sim,r,leg,time))return finishLeg();
        }
        return r.p;
      }
      if(++r.dwell>=(leg.dwell || 0)) {
        game.apply(sim,r,leg,(sim.ticks+1)*dt);
        return finishLeg();
      }
      return r.p;
    }
    return drive(r);
  }
  function drive(r) {
    const dest=r.waypoints[r.target],d=norm(r.p,dest);
    let reach=r.speed*dt;
    if(r.concept){
      let rest=d;
      for(let i=r.target+1;i<r.waypoints.length;i++)rest+=norm(r.waypoints[i-1],r.waypoints[i]);
      [reach,nextSpeed]=trapezoid(r.currentSpeedInS,rest,r.concept.drive.accelInS2,r.concept.drive.topSpeedInS);
    }
    const f=d?Math.min(1,reach/d):1;
    return [r.p[0]+(dest[0]-r.p[0])*f,r.p[1]+(dest[1]-r.p[1])*f];
  }
  function poweredStep(sim) {
    game.replenish(sim,(sim.ticks+1)*dt);
    const begins=sim.robots.map(r=>[...r.p]), ends=begins.map(p=>[...p]);
    // A robot whose heading changes this tick occupies its circumscribed circle for the whole sweep.
    const bodies=sim.robots.slice(), headings=sim.robots.map(r=>r.heading);
    // Each move reserves a continuous sweep. Earlier movers saw later peers stationary.
    // A later peer may move only if its simultaneous sweep also misses earlier movers.
    for(let i=0;i<sim.robots.length;i++) {
      const r=sim.robots[i],a=begins[i];
      // Giving way after a yield: hold until the yielder is clear (both circumscribed radii and 6 in apart).
      const way=sim.giveWay?.[r.id],yielder=way && sim.robots.find(o=>o.id===way.to);
      if(way && (sim.ticks>=way.untilTick || !yielder ||
        norm(r.p,yielder.p)>geom.circumradius(r)+geom.circumradius(yielder)+6))delete sim.giveWay[r.id];
      let b=sim.giveWay?.[r.id]?r.p:proposal(sim,r);
      if(sim.giveWay?.[r.id]){r.action='Giving way to '+way.to;recordWait(sim,r,'Giving way to '+way.to);}
      r.waitFor=null;
      // A moving concept robot told to hold, or to finish a leg, brakes at accelInS2 along its last direction of
      // travel rather than stopping dead. Only a blocked move stops it at once.
      if(r.concept && norm(a,b)<1e-9 && r.currentSpeedInS>1e-9 && r.motionDir){
        const v=r.currentSpeedInS,after=Math.max(0,v-r.concept.drive.accelInS2*dt),along=(v+after)/2*dt;
        b=[a[0]+r.motionDir[0]*along,a[1]+r.motionDir[1]*along];nextSpeed=after;
      }
      let heading=r.concept && !r.blocked?turned(r,turnTo):r.heading, rotating=heading!==r.heading;
      if(r.concept)r.currentSpeedInS=0;
      if(norm(a,b)<1e-9 && !rotating){
        if(!r.blocked && r.waypoints?.[r.target] && norm(r.p,r.waypoints[r.target])<1e-8)r.target++;
        continue;
      }
      const sweep=body=>{
        let hit=geom.hit(a,b,body,sim.setup);
        for(let j=0;j<sim.robots.length;j++)if(i!==j){
          const t=geom.robotContact(a,b,body,begins[j],ends[j],bodies[j]);
          if(t!==null && (!hit || t<hit.t))hit={name:sim.robots[j].id,t};
        }
        return hit;
      };
      let body=rotating?{...r,circleIn:geom.circumradius(r)}:r,hit=sweep(body);
      // On a port leg the heading is the game's intent, not an authored step. When anything stops the turn, the
      // robot makes this tick's move at its present heading if that sweep is clear, and turns once it is clear.
      // A turn that anything blocks, with no clear move at the present heading either, sends it to the nearest
      // reachable pose where its circle is clear (see roomToTurn), and the leg is planned again from there. Without this two robots can hold each other for ever, one unable to turn
      // while the other is close and the other waiting for it to leave. An authored requiredHeading keeps the rule
      // that a blocked rotation is a wait.
      if(hit && rotating && portLeg){
        if(norm(a,b)>=1e-9 && !sweep(r)){hit=null;body=r;heading=r.heading;rotating=false;}
        else if(!r.makeRoom){
          const room=roomToTurn(sim,r,i,ends);
          if(room){r.makeRoom=true;r.goal=room.goal;r.waypoints=room.route;r.target=1;}
        }
      }
      // Rejected motion stays at its starting point for this entire tick. Earlier
      // movers already cleared that stationary footprint. Clipping one mover after
      // relative sweeps could introduce a late moving-peer overlap.
      if(hit){
        recordWait(sim,r,'Occupied by '+hit.name);
        if(sim.robots.some(p=>p.id===hit.name))r.waitFor=hit.name;
        else if(portLeg)delete r.goal;
        continue;
      }
      ends[i]=b;bodies[i]=body;headings[i]=heading;
      if(r.concept && norm(a,b)>=1e-9){r.currentSpeedInS=nextSpeed;r.motionDir=[(b[0]-a[0])/norm(a,b),(b[1]-a[1])/norm(a,b)];}
      if(r.waypoints?.[r.target] && norm(b,r.waypoints[r.target])<1e-8)r.target++;
    }
    sim.robots.forEach((r,i)=>{r.travelIn+=norm(begins[i],ends[i]);r.p=ends[i];r.heading=headings[i];});
    resolveWaitCycles(sim);
    game.move(sim,dt,begins);
    terminal?.observe(sim,begins,sim.ticks*dt,(sim.ticks+1)*dt);
  }
  // The nearest pose, in 4 in rings out to 48 in, where a concept robot's circumscribed circle clears the walls,
  // obstacles and every other robot's present footprint, with a route there around those footprints.
  function roomToTurn(sim,r,i,ends) {
    const circle={...r,circleIn:geom.circumradius(r)};
    const others=sim.robots.filter((o,j)=>j!==i).map(o=>({...o,p:ends[sim.robots.indexOf(o)]}));
    for(let d=4;d<=48;d+=4)for(let k=0;k<16;k++){
      const q=[r.p[0]+d*Math.cos(k*Math.PI/8),r.p[1]+d*Math.sin(k*Math.PI/8)];
      if(geom.hit(q,q,circle,sim.setup) || others.some(o=>geom.robotContact(q,q,circle,o.p,o.p,o)!==null))continue;
      const route=geom.planAround(r.p,q,r,sim.setup,others);
      if(route.length)return {goal:q,route};
    }
    return null;
  }
  // Robots blocked only by each other in a closed cycle never move again: each next proposal is unchanged.
  // A cycle that holds for waitCycleS is logged with its start and duration. When yielding is enabled, the
  // member latest in roster order that can detour replans around the others' current footprints. Earlier
  // members keep their route. If no member can detour, the yield is recorded as unresolved.
  const ms=x=>Math.round(x*1000)/1000;
  function closeWaitCycle(sim,key,state,ended,endTick=sim.ticks) {
    const durationS=ms((endTick-state.since)*dt);
    if(durationS+1e-9>=waitCycleS)sim.waitCycleLog.push({phase:sim.phase,cycle:state.cycle,startS:ms(state.since*dt),durationS,ended,
      ...(yieldCycles?{yielded:state.yielded ?? null}:{})});
  }
  function resolveWaitCycles(sim) {
    const byId=Object.fromEntries(sim.robots.map(r=>[r.id,r])),active={};
    for(const start of sim.robots){
      // Follow each robot's single blocker. A closed cycle is recorded once, from its earliest roster member.
      const path=[];let r=start;
      while(r?.waitFor && !path.includes(r.id)){path.push(r.id);r=byId[r.waitFor];}
      const order=sim.robots.map(x=>x.id).filter(id=>path.includes(id));
      if(r!==start || order[0]!==start.id)continue;
      const key=path.join('>');
      const state=sim.waitCycles[key] ?? {since:sim.ticks,cycle:path,handled:false};
      active[key]=state;
      if(!yieldCycles || state.handled || (sim.ticks+1-state.since)*dt+1e-9<waitCycleS)continue;
      state.handled=true;
      let yielded=null;
      for(const id of [...order].reverse()){
        const r=byId[id],goal=r.waypoints?.at(-1);
        if(!goal)continue;
        // Detour around every other robot's current footprint, not only the cycle members.
        const route=geom.planAround(r.p,goal,r,sim.setup,sim.robots.filter(o=>o.id!==id));
        if(route.length){r.waypoints=route;r.target=1;yielded=id;break;}
      }
      // The other members give way while the yielder takes its detour, rather than pressing into it: they hold until
      // it is clear of them or giveWayS has passed.
      if(yielded)for(const id of path)if(id!==yielded)(sim.giveWay??={})[id]={to:yielded,untilTick:sim.ticks+Math.round(giveWayS/dt)};
      state.yielded=yielded;
      sim.deadlocks.push({phase:sim.phase,timeS:ms((sim.ticks+1)*dt),sinceS:ms(state.since*dt),cycle:path,yielded});
      event(sim,'Wait cycle '+[...path,path[0]].join(' -> ')+(yielded?'; '+yielded+' yields':'; no member can detour'));
    }
    for(const [key,state] of Object.entries(sim.waitCycles))if(!active[key])closeWaitCycle(sim,key,state,'cleared');
    sim.waitCycles=active;
  }
  function step(sim) {
    if(sim.paused || sim.ended)return;
    // Prior releases may complete before this tick's newly commanded actions.
    game.observe(sim,(sim.ticks+1)*dt);
    if(sim.ticks<duration(sim.phase))poweredStep(sim);
    sim.ticks++;
    game.observe(sim,sim.ticks*dt);
    const endgame=sim.game.endgame;
    if(endgame && model.scoreAssessment && sim.phase===endgame.period){
      const elapsed=endgame.activeCutoffS-endgame.periodCutoffS+sim.ticks*dt;
      if(elapsed+1e-9>=endgame.assessmentTimeS)terminal.assess(sim);
    }
    if(sim.ticks>=wallDuration(sim.phase)){
      // Unpowered ticks after the active clock are not waiting time.
      for(const [key,state] of Object.entries(sim.waitCycles))closeWaitCycle(sim,key,state,'period-end',Math.min(sim.ticks,duration(sim.phase)));
      sim.waitCycles={};
      if(!model.scoreAssessment)terminal?.assess(sim);
      sim.paused=true;sim.ended=true;sim.carry=0;
      sim.phaseHistory.push({phase:sim.phase,seconds:duration(sim.phase)*dt,
        ...(sim.ticks>duration(sim.phase)?{elapsedSeconds:sim.ticks*dt}:{}),
        robots:sim.robots.map(r=>({id:r.id,visits:r.visits,waitSeconds:r.wait*dt,travelIn:r.travelIn,blocked:r.blocked,position:[...r.p]})),
        ...(sim.deadlocks.length?{deadlocks:sim.deadlocks}:{})});
      event(sim,sim.phase+' clock expired');
    }
  }
  function advance(sim,seconds) {
    if(!Number.isFinite(seconds) || seconds<0)throw Error('Use nonnegative elapsed seconds.');
    if(sim.paused || sim.ended)return;
    sim.carry+=seconds;
    const steps=Math.min(wallDuration(sim.phase)-sim.ticks,Math.floor((sim.carry+1e-9)/dt));
    sim.carry-=steps*dt;
    for(let i=0;i<steps;i++)step(sim);
  }
  function nextPhase(sim) {
    if(!sim.ended || sim.phaseIndex===phases.length-1)throw Error('Finish the active period before advancing to a configured next period.');
    sim.phase=phases[++sim.phaseIndex].name;sim.ticks=0;sim.carry=0;sim.ended=false;sim.paused=true;sim.resources=reservations();
    sim.deadlocks=[];sim.waitCycles={};sim.giveWay={};
    game.replenish(sim,0);
    for(const r of sim.robots){delete r.goal;delete r.makeRoom;}
    for(const r of sim.robots)Object.assign(r,{pickup:null,leg:0,waypoints:null,target:0,dwell:0,wait:0,travelIn:0,visits:0,blocked:'',action:'',...(r.concept?{currentSpeedInS:0}:{})});
  }
  return {supported,behaviors,defaults,startingRoster,completeRoster,create,createProbe,advance,nextPhase,assessRoute,geom,waypoint,intake:game?.intake,mouth:game?.mouth,dt,periods:phases,terminal,
    phaseSeconds:name=>duration(name)*dt,elapsedSeconds:name=>wallDuration(name)*dt};
}
