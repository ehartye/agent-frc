import {framePlan} from './frame-profile.mjs';

// Embedded in the offline lab as well as used directly by the Node tests.
export function fieldGeometry(profile) {
  const EPS = 1e-8;
  const L = profile.field.length, W = profile.field.width;
  const config = profile.rehearsal;
  const dot = (p,q) => p[0]*q[0] + p[1]*q[1];
  const rect = (x,y,l,w) => [[x-l/2,y-w/2],[x+l/2,y-w/2],[x+l/2,y+w/2],[x-l/2,y+w/2]];
  const add = (p,q) => [p[0]+q[0],p[1]+q[1]];
  const minus = (p,q) => [p[0]-q[0],p[1]-q[1]];
  const validPoint = p => Array.isArray(p) && p.length===2 && p.every(Number.isFinite);
  const profileOf=b=>b.frameProfile??profile.frameProfile;
  const validShape=b=>{try{framePlan(b.length,b.width,profileOf(b),b.bumper,25.4);return true;}catch{return false;}};
  const validBody = b => b && [b.length,b.width,b.height].every(n=>Number.isFinite(n) && n>0) &&
    Number.isFinite(b.heading) && Number.isFinite(b.bumper) && b.bumper>=0 && validShape(b);
  const planes = [
    {name:'Blue end wall',normal:[1,0],origin:[0,0]}, {name:'Red end wall',normal:[-1,0],origin:[L,0]},
    {name:'South guardrail',normal:[0,1],origin:[0,0]}, {name:'North guardrail',normal:[0,-1],origin:[0,W]}
  ];
  for (const face of config?.planes || []) {
    const a=face.inwardDeg*Math.PI/180;
    planes.push({name:face.name,normal:[Math.cos(a),Math.sin(a)],origin:face.at});
  }
  function clip(poly,plane) {
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length];
      const x=dot(minus(a,plane.origin),plane.normal),y=dot(minus(b,plane.origin),plane.normal);
      if(x>=0) result.push(a);
      if((x>=0)!==(y>=0)) result.push([a[0]+(b[0]-a[0])*x/(x-y),a[1]+(b[1]-a[1])*x/(x-y)]);
    }
    return result;
  }
  const boundary=planes.reduce(clip,rect(L/2,W/2,L,W));
  // A body with circleIn occupies a polygon circumscribing that circle (a rotating robot), at any heading.
  function offsets(body) {
    if(body.circleIn>0){
      const n=24,r=body.circleIn/Math.cos(Math.PI/n);
      return Array.from({length:n},(_,i)=>[r*Math.cos(2*Math.PI*i/n),r*Math.sin(2*Math.PI*i/n)]);
    }
    const a=body.heading*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    return framePlan(body.length,body.width,profileOf(body),body.bumper,25.4).outer
      .map(([x,y])=>[x*c-y*s,x*s+y*c]);
  }
  // Radius of the circle that circumscribes the frame outline plus bumper, about the robot centre.
  const circumradius=body=>Math.max(...framePlan(body.length,body.width,profileOf(body),body.bumper,25.4).outer.map(q=>Math.hypot(...q)));
  const footprint=(p,body)=>offsets(body).map(q=>add(p,q));
  // Counterclockwise convex hull for Minkowski expansion by a reflected footprint.
  function hull(points) {
    const sorted=points.slice().sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    function chain(list) {
      const h=[];
      for(const p of list) {
        while(h.length>=2){
          const a=h.at(-2),b=h.at(-1);
          if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])>EPS)break;
          h.pop();
        }
        h.push(p);
      }
      h.pop();return h;
    }
    return [...chain(sorted),...chain(sorted.slice().reverse())];
  }
  const expand=(poly,shape)=>hull(poly.flatMap(p=>shape.map(q=>minus(p,q))));
  function solid(name,poly,low,kind) {return {name,poly,low,kind};}
  function obstacles(setup=config?.setups[0]) {
    const solids=profile.landmarks.map(m=>{
      const r=m.acrossFlats/(2*Math.cos(Math.PI/m.sides));
      return solid(m.name,Array.from({length:m.sides},(_,i)=>{
        const a=(2*i+1)*Math.PI/m.sides;return [m.x+r*Math.cos(a),m.y+r*Math.sin(a)];
      }),0,'landmark');
    });
    for(const item of config?.obstacles || []){
      const low=typeof item.lower==='number'?item.lower:item.lower[setup];
      solids.push(solid(item.name,item.poly,low,item.kind));
    }
    return solids;
  }
  // The forbidden region is convex. Clip the swept center segment by every inward face.
  // Return first intersection of the interiors. Tangency alone permits sliding and separation.
  function prepare(poly) {
    return poly.map((p,i)=>{
      const q=poly[(i+1)%poly.length],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
      const n=[-dy/length,dx/length];return {n,offset:dot(p,n)};
    });
  }
  function enter(a,b,faces) {
    let low=0,high=1;
    const delta=minus(b,a);
    for(const {n,offset} of faces){
      const start=dot(a,n)-offset-EPS, velocity=dot(delta,n);
      if(Math.abs(velocity)<EPS){if(start<=0)return null;continue;}
      const t=-start/velocity;
      if(velocity>0)low=Math.max(low,t);else high=Math.min(high,t);
      if(low>=high)return null;
    }
    return low;
  }
  const cache=new Map();
  function space(body,setup) {
    const key=[body.length,body.width,body.height,body.heading,body.bumper,JSON.stringify(profileOf(body)),body.circleIn,setup].join('/');
    if(cache.has(key))return cache.get(key);
    const shape=offsets(body);
    const walls=planes.map(p=>({...p,offset:dot(p.normal,p.origin)-Math.min(...shape.map(q=>dot(q,p.normal)))}));
    const solids=obstacles(setup).filter(o=>body.height>=o.low-EPS).map(o=>{
      const inflated=expand(o.poly,shape);return {...o,inflated,faces:prepare(inflated)};
    });
    // No search through field-exterior nodes. Offset corner candidates outward to avoid numeric grazing.
    const nodes=solids.flatMap(o=>{
      const c=o.inflated.reduce((v,p)=>add(v,p),[0,0]).map(v=>v/o.inflated.length);
      return o.inflated.map(p=>{
        const d=minus(p,c),size=Math.hypot(...d);
        return [p[0]+d[0]/size*.15,p[1]+d[1]/size*.15];
      });
    }).filter(q=>walls.every(w=>dot(q,w.normal)>=w.offset) && solids.every(o=>enter(q,q,o.faces)===null));
    const prepared={walls,solids,nodes};
    if(cache.size>80)cache.clear();
    cache.set(key,prepared);return prepared;
  }
  function hit(a,b,body,setup=config?.setups[0]) {
    const {walls,solids}=space(body,setup);
    let result=null;
    function consider(name,t) {if(t!==null && (!result || t<result.t))result={name,t};}
    for(const w of walls){
      const x=dot(a,w.normal)-w.offset,y=dot(b,w.normal)-w.offset;
      if(x < -EPS)consider(w.name,0);
      else if(y < -EPS)consider(w.name,Math.max(0,x/(x-y)));
    }
    for(const o of solids)consider(o.name,enter(a,b,o.faces));
    return result;
  }
  function assessRoute(line,body,setup=config?.setups[0]) {
    if(!config || !config.setups.includes(setup) || !validBody(body) || !Array.isArray(line) || !line.length || !line.every(validPoint))
      return {status:'unknown',obstacle:null,segment:null};
    let walked=0;
    for(let i=0;i<Math.max(1,line.length-1);i++){
      const a=line[i],b=line[i+1] || a, contact=hit(a,b,body,setup);
      const length=Math.hypot(...minus(b,a));
      if(contact)return {status:'blocked',obstacle:contact.name,segment:i,distance:walked+length*contact.t};
      walked+=length;
    }
    return {status:'clear',obstacle:null,segment:null,distance:walked};
  }
  function robotContact(a,b,body,c,d,peer) {
    const relativeA=minus(a,c),relativeB=minus(b,d);
    const key='relative/'+[body.length,body.width,body.bumper,body.heading,JSON.stringify(profileOf(body)),body.circleIn,peer.length,peer.width,peer.bumper,peer.heading,JSON.stringify(profileOf(peer)),peer.circleIn].join('/');
    if(!cache.has(key))cache.set(key,prepare(expand(offsets(peer),offsets(body))));
    return enter(relativeA,relativeB,cache.get(key));
  }
  function plan(a,b,body,setup=config?.setups[0]) {
    if(hit(a,a,body,setup) || hit(b,b,body,setup))return [];
    if(!hit(a,b,body,setup))return [a,b];
    return search([a,b,...space(body,setup).nodes],(p,q)=>hit(p,q,body,setup));
  }
  // Plan as above while also treating the current footprints of named peers as stationary obstacles.
  function planAround(a,b,body,setup=config?.setups[0],peers=[]) {
    const extra=peers.map(q=>{const inflated=expand(footprint(q.p,q),offsets(body));return {name:q.id,inflated,faces:prepare(inflated)};});
    const blocked=(p,q)=>{
      let result=hit(p,q,body,setup);
      for(const o of extra){const t=enter(p,q,o.faces);if(t!==null && (!result || t<result.t))result={name:o.name,t};}
      return result;
    };
    if(blocked(a,a) || blocked(b,b))return [];
    if(!blocked(a,b))return [a,b];
    const {walls}=space(body,setup);
    const corners=extra.flatMap(o=>{
      const c=o.inflated.reduce((v,p)=>add(v,p),[0,0]).map(v=>v/o.inflated.length);
      return o.inflated.map(p=>{const d=minus(p,c),size=Math.hypot(...d);return [p[0]+d[0]/size*.15,p[1]+d[1]/size*.15];});
    });
    const nodes=[...space(body,setup).nodes,...corners].filter(q=>walls.every(w=>dot(q,w.normal)>=w.offset) && !blocked(q,q));
    return search([a,b,...nodes],blocked);
  }
  // A* over visibility nodes from nodes[0] to nodes[1], where blocked(p,q) rejects a straight segment.
  function search(nodes,blocked) {
    const b=nodes[1];
    const cost=nodes.map(()=>Infinity), prev=[],seen=new Set();
    const distance=(p,q)=>Math.hypot(...minus(p,q));
    cost[0]=0;
    while(true){
      let i=-1,f=Infinity;
      nodes.forEach((p,j)=>{
        const priority=cost[j]+distance(p,b);
        if(!seen.has(j) && priority<f){i=j;f=priority;}
      });
      if(i===-1)return [];
      if(i===1)break;
      seen.add(i);
      nodes.forEach((p,j)=>{
        if(seen.has(j))return;
        const next=cost[i]+distance(nodes[i],p);
        if(next<cost[j] && !blocked(nodes[i],p)){prev[j]=i;cost[j]=next;}
      });
    }
    const line=[b];
    for(let i=prev[1];i!==undefined;i=prev[i])line.unshift(nodes[i]);
    return line;
  }
  return {boundary,obstacles,footprint,circumradius,hit,assessRoute,robotContact,plan,planAround,validBody};
}
