// Compare corridor geometry only. Counts refer to modeled start slots, not recorded traffic.
export function routeStudy(profile, piece, goal, phase, custom, bodyWidth) {
  const map=profile.scoring?.fieldMap;
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const nearest=(p,points)=>points.reduce((best,q)=>distance(p,q)<distance(p,best)?q:best);
  const same=(a,b)=>distance(a,b)<1e-7;
  const segmentDistance=(p,a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
    return distance(p,[a[0]+u*dx,a[1]+u*dy]);
  };
  // Bend sight lines around bounding squares of modeled solids. These are directional estimates.
  const rectangles=profile.landmarks.map(m=>{
    const r=m.acrossFlats/(2*Math.cos(Math.PI/m.sides));
    return [m.x-r,m.y-r,m.x+r,m.y+r];
  });
  const corners=rectangles.flatMap(([l,b,r,t])=>[[l,b],[l,t],[r,b],[r,t]]);
  function crosses(a,b,[left,bottom,right,top]) {
    let lo=0, hi=1;
    for (const [i,min,max] of [[0,left,right],[1,bottom,top]]) {
      const delta=b[i]-a[i];
      if(Math.abs(delta)<1e-10) {
        if(a[i]<=min+1e-8 || a[i]>=max-1e-8) return false;
      } else {
        const u=(min+1e-8-a[i])/delta, v=(max-1e-8-a[i])/delta;
        lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));
      }
    }
    return hi>lo;
  }
  function path(a,b) {
    if(same(a,b)) return [a,b];
    const nodes=[a,b,...corners], costs=nodes.map(()=>Infinity), prev=[], visited=new Set();
    costs[0]=0;
    while(true){
      let i=-1;
      nodes.forEach((_,j)=>{if(!visited.has(j) && Number.isFinite(costs[j]) && (i<0 || costs[j]<costs[i])) i=j;});
      if(i<0) return [];
      if(i===1) break;
      visited.add(i);
      nodes.forEach((q,j)=>{
        const cost=costs[i]+distance(nodes[i],q);
        if(!visited.has(j) && cost<costs[j] && !rectangles.some(r=>crosses(nodes[i],q,r))){
          costs[j]=cost;prev[j]=i;
        }
      });
    }
    const result=[b];
    for(let i=prev[1];i!==undefined;i=prev[i]) result.unshift(nodes[i]);
    return result;
  }
  const routeType=map?.routes.find(r=>r.piece===piece && r.goal===goal);
  const first=profile.scoring?.phases[0]?.name;
  // Older external profiles identify the opening period's alternate source with autoSource.
  const sourceFor=r=>r.sourceByPhase?.[phase] || (phase===first && r.autoSource) || r.piece;
  const preload=r=>r.preloadPhases?.includes(phase) ?? Boolean(phase===first && r.autoSource);
  const start=map?.starts[0];
  const a=custom?.a || (routeType && nearest(start,map.sources[sourceFor(routeType)]));
  const b=custom?.b || (a && routeType && nearest(a,map.targets[goal]));
  if(!a || !b) return {line:[], peers:[], hot:[], length:0, traffic:'Unknown · route endpoints unavailable'};
  const line=path(a,b);
  if(!line.length) return {line:[],peers:[],hot:[],length:0,traffic:'Unresolved · endpoint inside a modeled obstruction'};
  const length=line.slice(1).reduce((n,q,i)=>n+distance(line[i],q),0);
  const peers=[];
  if(map) for(const side of [0,1]) for(const [slot,p] of map.starts.entries()) {
    if(!side && slot===0) continue;
    const mirror=map.mirror || profile.rehearsal?.mirror;
    if(side && !mirror)continue;
    const transform=q=>side?[mirror.redX?profile.field.length-q[0]:q[0],mirror.redY?profile.field.width-q[1]:q[1]]:q;
    const paths=[];
    for(const r of map.routes){
      const supply=nearest(p,map.sources[sourceFor(r)]);
      const dest=nearest(supply,map.targets[r.goal]);
      const legs=[[p,supply],[supply,dest]];
      if(preload(r)) legs.push([p,nearest(p,map.targets[r.goal])]);
      for(const [from,to] of legs){
        const part=path(transform(from),transform(to));
        if(part.length) paths.push(part);
      }
    }
    peers.push({name:(side?'Red opponent':'Blue partner')+' slot '+(slot+1),alliance:side?'red':'blue',paths});
  }
  const hot=[];
  const names=new Set();
  for(let i=1;i<line.length;i++){
    const p=line[i-1],q=line[i],steps=Math.max(1,Math.ceil(distance(p,q)/12));
    for(let j=0;j<=steps;j++){
      const u=j/steps, point=[p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u];
      const at=peers.filter(peer=>peer.paths.some(leg=>leg.slice(1).some((v,k)=>segmentDistance(point,leg[k],v)<=bodyWidth)));
      if(at.length){hot.push({point,count:at.length});at.forEach(peer=>names.add(peer.name));}
    }
  }
  const peak=hot.reduce((n,h)=>Math.max(n,h.count),0);
  const traffic=!map?'Unknown · missing start, piece and target model':(peak>=2?'High potential overlap':peak?'Potential overlap':'No overlap in sampled routes')+
    ' · up to '+peak+' other start slot(s) near one point'+(names.size?' ('+[...names].join(', ')+')':'');
  return {line,peers,hot,length,traffic};
}
