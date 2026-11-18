// Orthographic projection of field coordinates in inches. Z is up.
function fieldScene(canvas, profile, state, place) {
  const ctx = canvas.getContext('2d');
  const field = profile.field;
  const camera = {view: 'field', yaw: -0.27, tilt: 0.77, zoom: 1};
  let project, unproject;
  let route=[], study=null;
  function draw() {
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#123338';
    ctx.fillRect(0, 0, width, height);
    const c = Math.cos(camera.yaw), s = Math.sin(camera.yaw);
    const up = Math.sin(camera.tilt), lift = Math.cos(camera.tilt);
    let x0 = field.length / 2, y0 = field.width / 2;
    let spanX = Math.abs(c) * field.length + Math.abs(s) * field.width;
    let spanY = up * (Math.abs(s) * field.length + Math.abs(c) * field.width);
    if (camera.view === 'robot' || camera.view === 'target') {
      const focus = camera.view === 'robot' ? state : profile.landmarks[0];
      x0 = focus.x;
      y0 = focus.y;
      spanX = 230;
      spanY = 200;
    }
    const scale = Math.min(width * .90 / spanX, height * .75 / spanY) * camera.zoom;
    const cx = width / 2, cy = height * .57;
    const depth = (x,y) => (x-x0)*s + (y-y0)*c;
    project = (x,y,z=0) => [cx + ((x-x0)*c - (y-y0)*s)*scale, cy - (depth(x,y)*up + z*lift)*scale];
    unproject = (px,py) => {
      const a=(px-cx)/scale, b=(cy-py)/(scale*up);
      return [x0+a*c+b*s, y0-a*s+b*c];
    };
    function path(points, color, fill) {
      ctx.beginPath();
      points.forEach(([x,y,z],i) => {
        const [px,py] = project(x,y,z);
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      });
      if (fill) {ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
      ctx.strokeStyle=color;
      ctx.stroke();
    }
    const L=field.length, W=field.width;
    path([[0,0],[L,0],[L,W],[0,W]], '#a9d4c9','#245158');
    for(let x=36;x<L;x+=36) path([[x,0],[x,W]],'#40696c');
    for(let y=36;y<W;y+=36) path([[0,y],[L,y]],'#40696c');
    path([[L/2,0],[L/2,W]],'#afc8bd');
    if(study) {
      for(const peer of study.peers) for(const leg of peer.paths) path(leg,'#669295');
      for(const h of study.hot) {
        const [px,py]=project(...h.point);
        ctx.fillStyle=h.count>=2?'#d89569':'#ae9d70';ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fill();
      }
      if(study.line.length) {ctx.lineWidth=2;path(study.line,'#ffcb77');ctx.lineWidth=1;}
    }
    if(!study && route.length===2) {
      ctx.lineWidth=3;
      path(route.map(p=>[p.x,p.y]),'#ffcb77');
      ctx.lineWidth=1;
    }
    for (const p of route) {
      const [px,py]=project(p.x,p.y);
      ctx.fillStyle='#ffcb77';ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fill();
      ctx.font='bold 15px system-ui';ctx.fillText(p.name,px+9,py+12);
    }
    const objects = profile.landmarks.map(m => {
      const r = m.acrossFlats / (2*Math.cos(Math.PI/m.sides));
      const points = Array.from({length:m.sides},(_,i) => {
        const a = (2*i+1)*Math.PI/m.sides;
        return [m.x+r*Math.cos(a), m.y+r*Math.sin(a)];
      });
      return {...m, points};
    });
    const heading=state.heading*Math.PI/180;
    const rotate=(x,y)=>[state.x+x*Math.cos(heading)-y*Math.sin(heading),state.y+x*Math.sin(heading)+y*Math.cos(heading)];
    const halfL=state.length/2, halfW=state.width/2;
    objects.push({...state, name:'Robot', robot:true, points:[
      rotate(-halfL,-halfW),rotate(halfL,-halfW),rotate(halfL,halfW),rotate(-halfL,halfW)
    ]});
    for(const obj of objects.sort((a,b)=>depth(b.x,b.y)-depth(a.x,a.y))) {
      const roof=obj.points.map(([x,y])=>[x,y,obj.height]);
      const edge=obj.robot?'#edffbd':'#9ac3bf';
      const faces=obj.points.map((p,i)=>{
        const j=(i+1)%roof.length, q=obj.points[j];
        return {points:[p,q,roof[j],roof[i]], depth:depth((p[0]+q[0])/2,(p[1]+q[1])/2)};
      }).sort((a,b)=>b.depth-a.depth);
      for(const face of faces) path(face.points,edge,obj.robot?'#7fa84d':'#42696a');
      path(roof,edge,obj.robot?'#ceeb8c':'#557c79');
      if(obj.robot) path([[...rotate(0,0),obj.height],[...rotate(halfL,0),obj.height]],'#234234');
      let peak=obj.height;
      if(!obj.robot) {
        for(const level of profile.levels) {
          const ring=obj.points.map(([x,y])=>[x,y,level.height]);
          path([...ring,ring[0]],level===profile.levels[state.level]?'#ffcb77':'#86aaa5');
          peak=Math.max(peak,level.height);
        }
      }
      const [px,py]=project(obj.x,obj.y,peak);
      ctx.fillStyle=obj.robot?'#edffbd':'#e4f1ef';
      ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.fillText(obj.name,px,py-12);
    }
  }
  let start;
  canvas.onpointerdown=e=>{
    canvas.setPointerCapture(e.pointerId);
    start={x:e.clientX,y:e.clientY,yaw:camera.yaw,tilt:camera.tilt,moved:false};
  };
  canvas.onpointermove=e=>{
    if(!start) return;
    const dx=e.clientX-start.x, dy=e.clientY-start.y;
    if(Math.hypot(dx,dy)>4) start.moved=true;
    if(start.moved) {
      camera.yaw=start.yaw+dx*.007;
      camera.tilt=Math.max(.18,Math.min(Math.PI/2,start.tilt+dy*.006));
      draw();
    }
  };
  canvas.onpointerup=e=>{
    if(start && !start.moved && unproject) {
      const bounds=canvas.getBoundingClientRect();
      const [x,y]=unproject(e.clientX-bounds.left,e.clientY-bounds.top);
      if(x>=0 && x<=field.length && y>=0 && y<=field.width) place(x,y);
    }
    start=null;
  };
  canvas.onpointercancel=()=>{start=null;};
  function zoom(factor) {camera.zoom=Math.max(.5,Math.min(6,camera.zoom*factor));draw();}
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12);},{passive:false});
  new ResizeObserver(draw).observe(canvas);
  return {draw,zoom,setRoute(points,analysis){route=points;study=analysis;draw();},view(name){
    camera.view=name;camera.yaw=name==='top'?0:-.27;camera.tilt=name==='top'?Math.PI/2:.77;
    camera.zoom=1;draw();
  }};
}
