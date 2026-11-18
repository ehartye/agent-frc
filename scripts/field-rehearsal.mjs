import { fieldGeometry } from './field-rehearsal-geometry.mjs';

// Functions are serialized by the kickoff builder. Keep this factory self-contained.
export function createFieldRehearsal(profile) {
  const geom=fieldGeometry(profile);
  const model=profile.rehearsal, supported=Boolean(model?.schema==='field-rehearsal/v1');
  const L=profile.field.length,W=profile.field.width,dt=0.05;
  const behaviors=Object.fromEntries(Object.entries(model?.programs || {}).map(([key,p])=>[key,p.label]));
  const phases=model?.periods || [];
  const duration=name=>Math.round((phases.find(p=>p.name===name)?.seconds || 0)/dt);
  const norm=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const sidePoint=(q,side)=>side==='blue'?[...q]:[model.mirror.redX?L-q[0]:q[0],model.mirror.redY?W-q[1]:q[1]];
  const assessRoute=(line,body,setup=model?.setups[0])=>supported?geom.assessRoute(line,body,setup):
    {status:'unknown',obstacle:null,segment:null};
  function defaults(side,slot) {
    const {orders,...body}=model.defaults,order=orders[slot-1];
    const heading=side==='red'?Math.atan2((model.mirror.redY?-1:1)*Math.sin(body.heading*Math.PI/180),
      (model.mirror.redX?-1:1)*Math.cos(body.heading*Math.PI/180))*180/Math.PI:body.heading;
    const plans=Object.fromEntries(phases.map(p=>[p.name,order]));
    return {id:(side==='blue'?'B':'R')+slot,side,slot,plans,...body,heading};
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
  function create(roster,setup=model?.setups[0]) {
    if(!supported)throw Error('Supply an external rehearsal geometry and behavior model.');
    if(!model.setups.includes(setup))throw Error('Unknown obstacle setup.');
    if(!Array.isArray(roster) || roster.length>6)throw Error('Use up to three robots per alliance.');
    const robots=[];
    for(const b of roster) {
      if(!['blue','red'].includes(b.side) || ![1,2,3].includes(b.slot) ||
        b.id!==defaults(b.side,b.slot).id || robots.some(r=>r.id===b.id) ||
        !b.plans || !phases.every(p=>Object.hasOwn(behaviors,b.plans[p.name])) ||
        !geom.validBody(b) || !Number.isFinite(b.speed) || b.speed<=0 || b.speed>500) {
        throw Error('Check unique alliance slots, positive dimensions and speed (up to 500 in/s).');
      }
      const p=sidePoint(model.starts[b.slot-1],b.side);
      const collision=geom.hit(p,p,b,setup);
      if(collision)throw Error(b.id+' start overlaps '+collision.name+'.');
      for(const other of robots) if(geom.robotContact(p,p,b,other.p,other.p,other)!==null)
        throw Error(b.id+' start overlaps '+other.id+'.');
      robots.push({...b,p,leg:0,waypoints:null,target:0,dwell:0,wait:0,visits:0,blocked:'',action:''});
    }
    robots.sort((a,b)=>a.id.localeCompare(b.id));
    return {robots,setup,phase:phases[0].name,phaseIndex:0,ticks:0,paused:true,ended:false,resources:reservations(),hotspots:[],
      log:[], carry:0,phaseHistory:[]};
  }
  function program(r,sim){return model.programs[r.plans[sim.phase]];}
  function itinerary(r,sim) {
    const chosen=program(r,sim);
    return (chosen.byPeriod?.[sim.phase] || chosen.steps).map(step=>{
      const spec=step.at;
      const q=Array.isArray(spec)?spec:spec[r.side] || spec.slots?.[r.slot] || spec.default;
      return {...step,action:step.label,point:step.frame==='field'?[...q]:sidePoint(q,r.side),
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
  function proposal(sim,r) {
    r.blocked='';
    const legs=itinerary(r,sim);
    if(!legs.length || r.leg>=legs.length){r.action=legs.length?'Holding at destination':'Holding position';return r.p;}
    const leg=legs[r.leg];
    r.action=leg.action;
    if(!r.waypoints) {
      if(leg.straight) r.waypoints=geom.hit(r.p,leg.point,r,sim.setup)?[]:[r.p,leg.point];
      else r.waypoints=geom.plan(r.p,leg.point,r,sim.setup);
      r.target=1;
    }
    if(r.waypoints.length===0){
      recordWait(sim,r,'No footprint-clear path · '+leg.action);
      return r.p;
    }
    const key=typeof leg.lock==='string'?leg.lock:model.resourceLabel;
    const resource=sim.resources[key];
    if(leg.lock && resource.owner!==r.id){
      if(!resource.queue.includes(r.id)){resource.queue.push(r.id);event(sim,r.id+' requested '+key);}
      if(resource.owner || resource.queue[0]!==r.id){
        recordWait(sim,r,'Queue at '+key+' for '+(resource.owner || resource.queue[0]));return r.p;
      }
      resource.queue.shift();resource.owner=r.id;event(sim,r.id+' entered '+key);
    }
    if(r.target>=r.waypoints.length) {
      if(++r.dwell>=(leg.dwell || 0)) {
        if(leg.release)release(sim,r,key);
        r.leg++;r.dwell=0;r.waypoints=null;
        if(r.leg===legs.length){
          r.visits++;event(sim,r.id+' completed '+leg.action);
          if(program(r,sim).loop)r.leg=0;
        }
      }
      return r.p;
    }
    const dest=r.waypoints[r.target],d=norm(r.p,dest);
    const f=d?Math.min(1,r.speed*dt/d):1;
    return [r.p[0]+(dest[0]-r.p[0])*f,r.p[1]+(dest[1]-r.p[1])*f];
  }
  function step(sim) {
    if(sim.paused || sim.ended)return;
    const begins=sim.robots.map(r=>[...r.p]), ends=begins.map(p=>[...p]);
    // Each move reserves a continuous sweep. Earlier movers saw later peers stationary.
    // A later peer may move only if its simultaneous sweep also misses earlier movers.
    for(let i=0;i<sim.robots.length;i++) {
      const r=sim.robots[i],a=begins[i],b=proposal(sim,r);
      if(norm(a,b)<1e-9){
        if(!r.blocked && r.waypoints?.[r.target] && norm(r.p,r.waypoints[r.target])<1e-8)r.target++;
        continue;
      }
      let hit=geom.hit(a,b,r,sim.setup);
      for(let j=0;j<sim.robots.length;j++)if(i!==j){
        const t=geom.robotContact(a,b,r,begins[j],ends[j],sim.robots[j]);
        if(t!==null && (!hit || t<hit.t))hit={name:sim.robots[j].id,t};
      }
      // Rejected motion stays at its starting point for this entire tick. Earlier
      // movers already cleared that stationary footprint. Clipping one mover after
      // relative sweeps could introduce a late moving-peer overlap.
      if(hit){recordWait(sim,r,'Occupied by '+hit.name);continue;}
      ends[i]=b;
      if(r.waypoints?.[r.target] && norm(b,r.waypoints[r.target])<1e-8)r.target++;
    }
    sim.robots.forEach((r,i)=>{r.p=ends[i];});
    sim.ticks++;
    if(sim.ticks>=duration(sim.phase)){
      sim.paused=true;sim.ended=true;sim.carry=0;
      sim.phaseHistory.push({phase:sim.phase,seconds:sim.ticks*dt,
        robots:sim.robots.map(r=>({id:r.id,visits:r.visits,waitSeconds:r.wait*dt,blocked:r.blocked,position:[...r.p]}))});
      event(sim,sim.phase+' clock expired');
    }
  }
  function advance(sim,seconds) {
    if(!Number.isFinite(seconds) || seconds<0)throw Error('Use nonnegative elapsed seconds.');
    if(sim.paused || sim.ended)return;
    sim.carry+=seconds;
    const steps=Math.min(duration(sim.phase)-sim.ticks,Math.floor((sim.carry+1e-9)/dt));
    sim.carry-=steps*dt;
    for(let i=0;i<steps;i++)step(sim);
  }
  function nextPhase(sim) {
    if(!sim.ended || sim.phaseIndex===phases.length-1)throw Error('Finish the active period before advancing to a configured next period.');
    sim.phase=phases[++sim.phaseIndex].name;sim.ticks=0;sim.carry=0;sim.ended=false;sim.paused=true;sim.resources=reservations();
    for(const r of sim.robots)Object.assign(r,{leg:0,waypoints:null,target:0,dwell:0,wait:0,visits:0,blocked:'',action:''});
  }
  return {supported,behaviors,defaults,create,advance,nextPhase,assessRoute,geom,dt,periods:phases,
    phaseSeconds:name=>duration(name)*dt};
}
