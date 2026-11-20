// Browser-safe geometry. Coordinates use the caller's units, +X forward and +Y left.
export function starterFrameProfile() {
  return {kind:'rear-chamfer',shortSideFractions:[0.1,0.1]};
}

export function framePlan(length,width,profile,offset=0,mmPerUnit=1) {
  if(![length,width,mmPerUnit].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(offset)||offset<0)
    throw Error('Supply positive frame dimensions and a nonnegative normal offset.');
  const x=length/2,y=width/2;
  const kind=profile===undefined?'square':profile?.kind;
  let points,edgeNames;
  if(kind==='square'){
    if(profile&&Object.keys(profile).some(k=>k!=='kind'))throw Error('Square profiles do not take cutbacks.');
    points=[[-x,-y],[x,-y],[x,y],[-x,y]];
    edgeNames=['right','front','left','rear'];
  }else if(kind==='rear-chamfer'){
    const units=['cutbacksMm','shortSideFractions'].filter(key=>Object.hasOwn(profile,key));
    const values=profile[units[0]];
    if(units.length!==1||Object.keys(profile).length!==2||!Array.isArray(values)||values.length!==2||!values.every(n=>Number.isFinite(n)&&n>0))
      throw Error('Rear chamfers need two positive cutbacks in millimetres or fractions of the shorter side.');
    const scale=units[0]==='cutbacksMm'?1/mmPerUnit:Math.min(length,width);
    const [dx,dy]=values.map(n=>n*scale);
    if(dx>=length||dy>=y)throw Error('Cutbacks must leave positive side and rear frame faces.');
    points=[[-x+dx,-y],[x,-y],[x,y],[-x+dx,y],[-x,y-dy],[-x,-y+dy]];
    edgeNames=['right','front','left','rear-left','rear','rear-right'];
  }else if(kind==='convex-outline'){
    const vertices=profile.vertices;
    if(Object.keys(profile).length!==2||!Array.isArray(vertices)||vertices.length<3||vertices.length>32||
      !vertices.every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=.5)))
      throw Error('A custom outline takes 3–32 normalized XY vertices in the enclosing frame rectangle.');
    for(const axis of [0,1]){
      const coords=vertices.map(v=>v[axis]);
      if(Math.min(...coords)!==-.5||Math.max(...coords)!==.5)throw Error('The custom outline must span both declared frame dimensions.');
    }
    for(let i=0;i<vertices.length;i++){
      const a=vertices[i],j=(i+1)%vertices.length,b=vertices[j];
      if(vertices.some((p,k)=>k!==i&&k!==j&&(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])<=1e-10))
        throw Error('Use strictly convex counterclockwise vertices without duplicates.');
    }
    points=vertices.map(([u,v])=>[u*length,v*width]);
    edgeNames=points.map((_,i)=>'edge-'+(i+1));
  }else throw Error('Unknown frame profile.');

  const edges=points.map((p,i)=>{
    const next=points[(i+1)%points.length],dx=next[0]-p[0],dy=next[1]-p[1];
    const len=Math.hypot(dx,dy);
    return {length:len,normal:[dy/len,-dx/len]};
  });
  const outer=points.map((p,i)=>{
    const prev=edges[(i+edges.length-1)%edges.length].normal,next=edges[i].normal;
    const distance=offset/(1+prev[0]*next[0]+prev[1]*next[1]);
    return [p[0]+distance*(prev[0]+next[0]),p[1]+distance*(prev[1]+next[1])];
  });
  return {points,outer,edgeNames,perimeter:edges.reduce((sum,e)=>sum+e.length,0)};
}
