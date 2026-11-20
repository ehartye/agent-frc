/** Top-down loose-piece contact for the fixed-step field rehearsal. Serialized into the offline lab. */
export function createFieldPieceMotion(profile, geom) {
  const pair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  const positive = value => Number.isFinite(value) && value > 0;
  const ordered = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

  function body(row) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || typeof row.type !== 'string' ||
        !row.type.trim() || !pair(row.p) || !positive(row.radiusIn)) throw Error('Invalid loose field piece.');
    const piece = {...row, p:[...row.p], v:[...(row.v ?? [0,0])]};
    // Per-piece project values override these classroom rolling/sliding assumptions.
    piece.heightIn ??= 2*piece.radiusIn;
    piece.massKg ??= 1;
    piece.dragInS2 ??= 18;
    piece.restitution ??= .22;
    if (!pair(piece.v) || !positive(piece.heightIn) || !positive(piece.massKg) ||
        !Number.isFinite(piece.dragInS2) || piece.dragInS2 < 0 ||
        !Number.isFinite(piece.restitution) || piece.restitution < 0 || piece.restitution > 1) {
      throw Error('Invalid field piece motion parameters.');
    }
    return piece;
  }

  function start(positions) {
    const pieces = positions.map(body).sort(ordered);
    if (new Set(pieces.map(p => p.id)).size !== pieces.length) throw Error('Duplicate field piece identity.');
    return {pieces};
  }
  function put(state,row) {
    if (state.pieces.some(p => p.id === row.id)) throw Error('Field piece already present: '+row.id);
    const piece = body(row);
    state.pieces.push(piece);
    state.pieces.sort(ordered);
    return piece;
  }
  function take(state,id) {
    const i = state.pieces.findIndex(p => p.id === id);
    return i < 0 ? null : state.pieces.splice(i,1)[0];
  }

  // Edge normals point inward for either winding; moving bumpers reuse these faces under translation.
  function polygon(points) {
    const area2 = points.reduce((s,[x,y],i) => {
      const q=points[(i+1)%points.length];
      return s+x*q[1]-y*q[0];
    },0);
    const edges=[];
    for (let i=0;i<points.length;i++) {
      const a=points[i], b=points[(i+1)%points.length];
      const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy);
      if (len>1e-9) edges.push({a,dx,dy,len2:len*len,nx:-Math.sign(area2)*dy/len,ny:Math.sign(area2)*dx/len});
    }
    if(edges.length < 3 || !area2) throw Error('Field pieces need a nonempty convex contact polygon.');
    return {edges,x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),
      y0:Math.min(...points.map(p=>p[1])),y1:Math.max(...points.map(p=>p[1]))};
  }
  const boundary=polygon(geom.boundary);
  const wallsBySetup=new Map();
  function walls(setup) {
    if (!wallsBySetup.has(setup)) wallsBySetup.set(setup,
      geom.obstacles(setup).map(ob=>({shape:polygon(ob.poly),under:ob.low ?? 0})));
    return wallsBySetup.get(setup);
  }
  function separate(piece,nx,ny,depth,vx,vy) {
    piece.p[0]+=nx*depth;
    piece.p[1]+=ny*depth;
    const closing=(piece.v[0]-vx)*nx+(piece.v[1]-vy)*ny;
    if (closing<0) {
      piece.v[0]-=(1+piece.restitution)*closing*nx;
      piece.v[1]-=(1+piece.restitution)*closing*ny;
    }
  }
  function insideField(piece) {
    let moved=false;
    for (const e of boundary.edges) {
      const gap=(piece.p[0]-e.a[0])*e.nx+(piece.p[1]-e.a[1])*e.ny;
      if (gap<piece.radiusIn-1e-8) {
        separate(piece,e.nx,e.ny,piece.radiusIn-gap,0,0);
        moved=true;
      }
    }
    return moved;
  }
  function outsideSolid(piece,s,x,y,vx,vy) {
    const px=piece.p[0]-x, py=piece.p[1]-y, r=piece.radiusIn;
    if (px+r<=s.x0 || px-r>=s.x1 || py+r<=s.y0 || py-r>=s.y1) return false;
    let depth=Infinity, face, nearest2=Infinity, rx=0, ry=0;
    for (const e of s.edges) {
      const dx=px-e.a[0],dy=py-e.a[1],d=dx*e.nx+dy*e.ny;
      if (d<=-r) return false;
      if (d<depth) {depth=d;face=e;}
      const t=Math.min(1,Math.max(0,(dx*e.dx+dy*e.dy)/e.len2));
      const ax=dx-t*e.dx,ay=dy-t*e.dy,d2=ax*ax+ay*ay;
      if(d2<nearest2) {nearest2=d2;rx=ax;ry=ay;}
    }
    if(depth>=0) separate(piece,-face.nx,-face.ny,r+depth,vx,vy);
    else {
      const distance=Math.sqrt(nearest2);
      if(distance>=r-1e-8) return false;
      separate(piece,rx/distance,ry/distance,r-distance,vx,vy);
    }
    return true;
  }
  function bump(a,b) {
    const dx=b.p[0]-a.p[0], dy=b.p[1]-a.p[1], r=a.radiusIn+b.radiusIn;
    if (Math.abs(dx)>=r || Math.abs(dy)>=r) return false;
    const d=Math.hypot(dx,dy);
    if(d>=r-1e-8) return false;
    const nx=d>1e-9?dx/d:1,ny=d>1e-9?dy/d:0;
    const shareA=b.massKg/(a.massKg+b.massKg),shareB=1-shareA;
    a.p[0]-=nx*(r-d)*shareA; a.p[1]-=ny*(r-d)*shareA;
    b.p[0]+=nx*(r-d)*shareB; b.p[1]+=ny*(r-d)*shareB;
    const closing=(b.v[0]-a.v[0])*nx+(b.v[1]-a.v[1])*ny;
    if(closing<0) {
      const impulse=-(1+Math.min(a.restitution,b.restitution))*closing;
      a.v[0]-=nx*impulse*shareA; a.v[1]-=ny*impulse*shareA;
      b.v[0]+=nx*impulse*shareB; b.v[1]+=ny*impulse*shareB;
    }
    return true;
  }

  // A uniform grid keeps separated field stock out of the narrow-phase pair loop.
  function neighbors(pieces,cell) {
    const bins=new Map();
    let moved=false;
    for(const a of pieces) {
      const x=Math.floor(a.p[0]/cell),y=Math.floor(a.p[1]/cell);
      for(let i=x-1;i<=x+1;i++) for(let j=y-1;j<=y+1;j++) {
        for(const b of bins.get(i+','+j) ?? []) if(bump(b,a)) moved=true;
      }
      const key=x+','+y;
      if (!bins.has(key)) bins.set(key,[]);
      bins.get(key).push(a);
    }
    return moved;
  }

  function advance(state,dt,robots=[],setup=profile.rehearsal?.setups?.[0]) {
    if (!Number.isFinite(dt) || dt<0) throw Error('Use nonnegative elapsed time for field pieces.');
    if (!dt || !state.pieces.length) return;
    const solids=walls(setup);
    const bumpers=robots.map(r=>{
      const from=r.previousP ?? r.p;
      const vx=(r.p[0]-from[0])/dt,vy=(r.p[1]-from[1])/dt;
      return {shape:polygon(geom.footprint([0,0],r)),from,vx,vy};
    });
    let maxSpeed=0,minRadius=Infinity,cell=0;
    for(const piece of state.pieces) {
      maxSpeed=Math.max(maxSpeed,Math.hypot(...piece.v));
      minRadius=Math.min(minRadius,piece.radiusIn);
      cell=Math.max(cell,2*piece.radiusIn);
    }
    for(const b of bumpers) maxSpeed=Math.max(maxSpeed,2*Math.hypot(b.vx,b.vy));
    // Short substeps resolve thin rails even when a piece or pushing bumper crosses them in one field tick.
    const n=Math.max(1,Math.ceil(2*dt*maxSpeed/minRadius)), h=dt/n;
    for(let step=1;step<=n;step++) {
      for(const piece of state.pieces) {
        const speed=Math.hypot(...piece.v);
        if (!speed) continue;
        const next=Math.max(0,speed-piece.dragInS2*h);
        const movingTime=next===0 && piece.dragInS2>0 ? speed/piece.dragInS2 : h;
        const travel=movingTime*(speed+next)/(2*speed);
        piece.p[0]+=piece.v[0]*travel; piece.p[1]+=piece.v[1]*travel;
        piece.v[0]*=next/speed; piece.v[1]*=next/speed;
      }
      for(let pass=0;pass<6;pass++) {
        let moved=neighbors(state.pieces,cell);
        for(const piece of state.pieces) {
          for(const b of bumpers) if(outsideSolid(piece,b.shape,b.from[0]+step*h*b.vx,b.from[1]+step*h*b.vy,b.vx,b.vy)) moved=true;
          for(const wall of solids) if(piece.heightIn>=wall.under && outsideSolid(piece,wall.shape,0,0,0,0)) moved=true;
          if(insideField(piece)) moved=true;
        }
        if(!moved) break;
      }
    }
  }
  return {start,put,take,advance};
}
