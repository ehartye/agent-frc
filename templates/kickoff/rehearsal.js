(() => {
  if(!rehearsal.supported)return;
  const panel=byId('rehearsal'),canvas=byId('replayField'),context=canvas.getContext('2d');
  const rosterBox=byId('replayRoster'), clock=byId('replayClock'),notice=byId('replayNotice');
  panel.hidden=false;
  let roster=[rehearsal.defaults('blue',1),rehearsal.defaults('red',1)];
  let setup=profile.rehearsal.setups[0],frame=null,lastTime=0;
  let series=null,seriesPaused=false;
  const config=profile.rehearsal, L=profile.field.length,W=profile.field.width;
  const student=createRehearsalSetup(rehearsal,roster,setup,config.series?.matches);
  let sim=student.reset(),activeSource='';
  const seriesSource=byId('replaySeriesSource');
  if(config.series?.matches?.length)seriesSource.add(new Option('Published scenarios','published'));
  seriesSource.add(new Option('My roster · 3 matches','student'));
  for(const setup of config.setups)byId('replaySetup').add(new Option(setup,setup));
  byId('replayBasis').textContent=config.basis+' '+config.boundsNote+
    ' The default bumper adds '+config.defaults.bumper+' in per side. Priorities follow request time, then robot ID for same-tick requests. Completed trips count arrivals and service, with scoring evaluated separately by the project station model.';
  const stations=config.stations ?? [], legend=byId('replayStations'), counters=new Map();
  let highlighted=null;
  for(const [i,s] of stations.entries()){
    const row=document.createElement('li'), select=document.createElement('button'), counts=document.createElement('span');
    select.type='button';select.textContent=(i+1)+' · '+s.label;
    select.setAttribute('aria-pressed','false');
    select.onclick=()=>{
      highlighted=highlighted===s.id?null:s.id;
      for(const [id,c] of counters)c.button.setAttribute('aria-pressed',String(highlighted===id));
      draw();
    };
    row.append(select,counts);legend.append(row);counters.set(s.id,{button:select,counts});
  }
  legend.parentElement.hidden=!stations.length;
  function draw() {
    const box=canvas.getBoundingClientRect();if(!box.width || !box.height)return;
    const dpr=window.devicePixelRatio || 1;
    if(canvas.width!==Math.round(box.width*dpr) || canvas.height!==Math.round(box.height*dpr)){
      canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
    }
    context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,box.width,box.height);
    const scale=Math.min((box.width-22)/L,(box.height-22)/W);
    const x0=(box.width-L*scale)/2,y0=(box.height+W*scale)/2;
    const at=p=>[x0+p[0]*scale,y0-p[1]*scale];
    function line(points,color,width=1,fill=null){
      if(!points.length)return;
      context.beginPath();points.forEach((p,i)=>{const xy=at(p);if(i)context.lineTo(...xy);else context.moveTo(...xy);});
      if(fill){context.closePath();context.fillStyle=fill;context.fill();}
      context.strokeStyle=color;context.lineWidth=width;context.stroke();
    }
    line(rehearsal.geom.boundary,'#dce8f6',2,'#274a70');
    context.save();context.clip();
    for(let x=36;x<L;x+=36)line([[x,0],[x,W]],'#446887');
    for(let y=36;y<W;y+=36)line([[0,y],[L,y]],'#446887');
    context.setLineDash([4,4]);for(const band of config.bands)line([band.from,band.to],'#c8d7e5');
    context.setLineDash([]);
    const maxH=Math.max(0,...roster.map(r=>r.height));
    for(const ob of rehearsal.geom.obstacles(setup)){
      if(ob.kind==='overlay' && maxH<ob.low)continue;
      const blocks=maxH>=ob.low;
      line(ob.poly,blocks?'#dce7f3':'#a4b9cb',1,blocks?'#667d93':'#506d88');
      if(blocks && ob.kind!=='landmark'){
        context.save();context.clip();
        const left=Math.min(...ob.poly.map(q=>q[0])),right=Math.max(...ob.poly.map(q=>q[0]));
        const bottom=Math.min(...ob.poly.map(q=>q[1])),top=Math.max(...ob.poly.map(q=>q[1]));
        for(let x=left-(top-bottom);x<right;x+=7)line([[x,bottom],[x+top-bottom,top]],'#bbcad7');
        context.restore();
      }
    }
    for(const station of config.stations ?? []){
      const [x,y]=at(station.displayAt ?? station.at), [ax,ay]=at(station.at);
      context.strokeStyle='#f1ce80';context.lineWidth=1;context.beginPath();
      if(station.areaIn){
        const [[left,bottom],[right,top]]=station.areaIn,xy=at([left,top]);
        context.rect(...xy,(right-left)*scale,(top-bottom)*scale);
      }else context.arc(ax,ay,station.radiusIn*scale,0,Math.PI*2);
      context.stroke();
      const retrieval=station.kind==='retrieval';
      context.fillStyle=retrieval?'#ffd373':'#d9f7df';
      if(retrieval){
        const stock=sim.game.stock[station.id].length;
        context.fillRect(x-4,y-4,8,8);
        for(let i=0;i<Math.min(6,stock);i++){context.beginPath();context.arc(x+(i%3-1)*4,y-6-Math.floor(i/3)*4,1.7,0,Math.PI*2);context.fill();}
      }else{context.beginPath();context.arc(x,y,5,0,Math.PI*2);context.stroke();}
    }
    for(const h of sim.hotspots){
      const xy=at(h.point);context.fillStyle='#ffbd6e91';context.beginPath();
      context.arc(...xy,Math.max(3,Math.min(13,Math.sqrt(h.ticks)*.8))*Math.max(scale,.55),0,Math.PI*2);context.fill();
    }
    for(const r of sim.robots) {
      if(r.waypoints?.length && r.target<r.waypoints.length) {
        context.setLineDash([3,5]);line([r.p,...r.waypoints.slice(r.target)],r.side==='blue'?'#a3ccff':'#ffb7b3',1.5);context.setLineDash([]);
      }
    }
    for(const r of sim.robots){
      const blue=r.side==='blue';
      line(rehearsal.geom.footprint(r.p,r),'#f7faff',1.3,blue?'#2867ab':'#af3849');
      line(rehearsal.geom.footprint(r.p,{...r,bumper:0}),blue?'#9ccbff':'#ffadaf',1,blue?'#22518a':'#8e3240');
      const [x,y]=at(r.p);context.font='bold '+Math.max(10,Math.min(17,12*scale))+'px system-ui';
      context.textAlign='center';context.textBaseline='middle';context.fillStyle='white';context.fillText(r.id,x,y);
      if(sim.game.cargo[r.id].length){context.fillStyle='#ffe291';context.fillText('● '+sim.game.cargo[r.id].length,x,y+11);}
      if(r.blocked){context.strokeStyle='#ffc66f';context.lineWidth=2;context.beginPath();context.arc(x,y,17*scale,0,Math.PI*2);context.stroke();}
    }
    context.restore();
    // Render station keys after releasing the field clip. Keep physical anchors
    // exact and lead to a readable badge when several objectives share a face.
    const placed=[];
    for(const [i,s] of stations.entries()){
      if(highlighted && highlighted!==s.id)continue;
      const [x,y]=at(s.displayAt ?? s.at);
      const count=s.kind==='retrieval'?sim.game.stock[s.id].length:sim.game.attempts[s.id];
      const label=(i+1)+'·'+count;
      context.font='bold 11px system-ui';
      const w=context.measureText(label).width+8,h=16;
      let best;
      for(let ring=0;ring<=4;ring++){
        for(const [dx,dy] of [[0,-1],[1,0],[-1,0],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]]){
          const bx=Math.max(1,Math.min(box.width-w-1,x-w/2+dx*(10+ring*14)));
          const by=Math.max(1,Math.min(box.height-h-1,y-h/2+dy*(10+ring*14)));
          const overlap=placed.reduce((sum,b)=>sum+Math.max(0,Math.min(bx+w,b.x+b.w)-Math.max(bx,b.x))*
            Math.max(0,Math.min(by+h,b.y+b.h)-Math.max(by,b.y)),0);
          const cost=overlap*100+Math.hypot(bx+w/2-x,by+h/2-y);
          if(!best || cost<best.cost)best={x:bx,y:by,w,h,cost};
        }
        if(best.cost<100)break;
      }
      placed.push(best);
      context.strokeStyle='#f5e0a3';context.lineWidth=1;context.beginPath();context.moveTo(x,y);
      context.lineTo(best.x+w/2,best.y+h/2);context.stroke();
      context.fillStyle=s.kind==='retrieval'?'#f2cc72':'#d6f1e0';context.fillRect(best.x,best.y,w,h);
      context.fillStyle='#102b33';context.textBaseline='middle';context.textAlign='center';
      context.fillText(label,best.x+w/2,best.y+h/2);
    }
  }
  function button(label,fn) {
    const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=fn;return b;
  }
  function setRoster(newRoster,newSetup=setup){
    try{
      const next=student.edit(newRoster,newSetup);
      roster=newRoster;setup=newSetup;sim=next;notice.textContent='';
    } catch(e){notice.textContent=e.message;}
    byId('replaySetup').value=setup;
    listRoster();render();
  }
  function edit(id,patch){setRoster(roster.map(r=>r.id===id?{...r,...patch}:r));}
  function listRoster(){
    rosterBox.replaceChildren();
    for(const side of ['blue','red']){
      const group=document.createElement('div');group.className='replay-group';group.dataset.alliance=side;
      const heading=document.createElement('h3');heading.textContent=(side==='blue'?'Blue':'Red')+' alliance';group.append(heading);
      rosterBox.append(group);
      for(const r of roster.filter(r=>r.side===side).sort((a,b)=>a.slot-b.slot)){
      const card=document.createElement('section');card.className='replay-robot '+r.side;
      const title=document.createElement('strong');title.textContent=(r.side==='blue'?'Blue ':'Red ')+r.slot+' · '+r.id;
      card.append(title);
      for(const period of config.periods){
        const key=period.name,name=key+' behavior';
        const label=document.createElement('label'),sel=document.createElement('select');
        label.append(name);sel.setAttribute('aria-label',r.id+' '+name);
        for(const [value,text] of Object.entries(rehearsal.behaviors))sel.add(new Option(text,value));
        sel.value=r.plans[key];sel.onchange=()=>edit(r.id,{plans:{...r.plans,[key]:sel.value}});label.append(sel);card.append(label);
      }
      const o=document.createElement('output');o.id='replay-state-'+r.id;card.append(o);
      const configLine=document.createElement('div');configLine.className='replay-robot-actions';
      const addNumber=(text,value,min,max,step,patch)=>{
        const label=document.createElement('label'),i=document.createElement('input');
        label.append(text+' ');i.type='number';i.min=min;i.max=max;i.step=step;i.value=value;
        i.style.width='5em';i.setAttribute('aria-label',r.id+' '+text);
        i.onchange=()=>{if(i.checkValidity() && i.value!=='')edit(r.id,{[patch]:i.valueAsNumber});else i.reportValidity();};
        label.append(i);configLine.append(label);
      };
      addNumber('Speed (in/s)',r.speed,1,500,1,'speed');
      addNumber('Bumper per side (in)',r.bumper,0,12,.25,'bumper');
      const apply=button('Use trial box',()=>edit(r.id,{length:state.length,width:state.width,height:state.height,heading:state.heading}));
      apply.setAttribute('aria-label','Use trial box for '+r.id);
      const remove=button('Remove',()=>setRoster(roster.filter(other=>other.id!==r.id)));
      remove.setAttribute('aria-label','Remove '+r.id);configLine.append(apply,remove);card.append(configLine);group.append(card);
      }
    }
  }
  function queues(){
    return Object.entries(sim.resources).map(([name,r])=>name+' holder: '+(r.owner || 'open')+
      '. Requests in order: '+(r.queue.join(', ') || 'none')+'.').join(' ');
  }
  function render(){
    const used=sim.ticks*rehearsal.dt,left=rehearsal.phaseSeconds(sim.phase)-used;
    clock.textContent=sim.phase+' · '+left.toFixed(2)+' s';
    const began=Boolean(series) || sim.ticks>0 || sim.phaseIndex>0 || !sim.paused;
    for(const control of rosterBox.querySelectorAll('select,input,button'))control.disabled=began;
    byId('replaySetup').disabled=began;
    for(const side of ['blue','red'])byId(side==='blue'?'addBlue':'addRed').disabled=began || roster.filter(r=>r.side===side).length>=3;
    const end=sim.ended;
    byId('replayRun').disabled=!roster.length || (end && sim.phaseIndex===config.periods.length-1);
    if(series)byId('replayRun').disabled=true;
    seriesSource.disabled=Boolean(series && !series.done);
    byId('replaySeries').textContent=series && !series.done ? (seriesPaused?'Resume series at 10×':'Pause series') : 'Play match series at 10×';
    byId('replayScore').textContent=(config.stations?.length?'Modeled rehearsal score · Blue '+sim.game.score.blue+' · Red '+sim.game.score.red+
      '. '+config.stations.filter(s=>s.kind==='retrieval').map(s=>s.label+' '+sim.game.stock[s.id].length+' '+s.piece+' available').join(' · '):
      'This profile has no registered piece or scoring stations.')+(series?' · '+activeSource+' · Match '+series.match.id+' · '+series.match.basis:'');
    for(const s of stations){
      const count=s.kind==='retrieval'?sim.game.stock[s.id].length+' available':
        sim.game.attempts[s.id]+' attempted'+(s.capacity===undefined?'':' · '+sim.game.occupied[s.id]+'/'+s.capacity+' occupied');
      const output=counters.get(s.id).counts,next=' '+s.piece+' · '+count;
      if(output.textContent!==next)output.textContent=next;
    }
    const following=config.periods[sim.phaseIndex+1];
    byId('replayRun').textContent=end?(following?'Start '+following.name:'Match complete'):(!sim.paused?'Pause':used?'Resume':'Start '+sim.phase);
    for(const id of ['replayStep','replayFast'])byId(id).disabled=Boolean(series) || !sim.paused || end || !roster.length;
    for(const r of sim.robots){
      const o=byId('replay-state-'+r.id);
      o.textContent=(r.length+2*r.bumper)+' × '+(r.width+2*r.bumper)+' in occupied, '+r.height+' in tall, heading '+r.heading+'°. '+
        (r.blocked || r.action || 'At start')+' · '+sim.game.cargo[r.id].length+' aboard · '+(r.wait*rehearsal.dt).toFixed(2)+' s waiting · '+r.visits+' completed trips';
    }
    byId('replayQueue').textContent=queues()+' '+(end?'Period frozen. ':'')+'Trip counts are unscored.';
    byId('replayEvents').replaceChildren(...sim.log.map(ev=>{const item=document.createElement('li');item.textContent=ev.phase+' '+ev.t.toFixed(2)+' s · '+ev.message;return item;}));
    const last=sim.game.events.at(-1);
    if(last)byId('replayQueue').textContent+=' Last piece event: '+last.robot+' '+last.outcome+' at '+last.station+' ('+last.pieces.length+').';
    draw();
  }
  function seriesResults(){
    byId('replayResults').replaceChildren(...(series?.results ?? []).map(match=>{
      const item=document.createElement('li');
      item.textContent=match.id+' · '+match.periods.map(p=>p.phase+' '+p.seconds+' s').join(', ')+
        ' · modeled Blue '+match.game.score.blue+' / Red '+match.game.score.red;
      return item;
    }));
  }
  function playSeries(now){
    frame=null;if(seriesPaused || !series || series.done)return;
    const before=series.match;
    series.advance(10*Math.max(0,now-lastTime)/1000);lastTime=now;
    sim=series.sim;setup=sim.setup;
    if(before!==series.match){roster=series.match.roster;listRoster();byId('replaySetup').value=setup;}
    seriesResults();render();if(!series.done)frame=requestAnimationFrame(playSeries);
  }
  byId('replaySeries').onclick=()=>{
    stopFrame();
    if(series && !series.done){seriesPaused=!seriesPaused;}
    else{
      try{series=student.series(seriesSource.value);}catch(error){notice.textContent=error.message;return;}
      activeSource=seriesSource.selectedOptions[0].text;
      sim=series.sim;setup=sim.setup;roster=series.match.roster;seriesPaused=false;
      byId('replaySetup').value=setup;notice.textContent='';listRoster();seriesResults();
    }
    lastTime=performance.now();if(!seriesPaused)frame=requestAnimationFrame(playSeries);render();
  };
  function animate(now){
    frame=null;
    if(sim.paused)return;
    rehearsal.advance(sim,Math.max(0,(now-lastTime)/1000));lastTime=now;
    render();
    if(!sim.paused)frame=requestAnimationFrame(animate);
  }
  function stopFrame(){if(frame!==null)cancelAnimationFrame(frame);frame=null;}
  byId('replayRun').onclick=()=>{
    if(sim.ended && config.periods[sim.phaseIndex+1]){rehearsal.nextPhase(sim);notice.textContent=sim.phase+' starts from the frozen poses.';}
    if(!sim.paused){sim.paused=true;stopFrame();render();return;}
    sim.paused=false;lastTime=performance.now();frame=requestAnimationFrame(animate);render();
  };
  function advancePaused(seconds){sim.paused=false;rehearsal.advance(sim,seconds);sim.paused=true;render();}
  byId('replayStep').onclick=()=>advancePaused(1);
  byId('replayFast').onclick=()=>advancePaused(rehearsal.phaseSeconds(sim.phase));
  byId('replayReset').onclick=()=>{
    stopFrame();series=null;seriesPaused=false;activeSource='';seriesResults();
    sim=student.reset();roster=student.roster;setup=student.setup;
    byId('replaySetup').value=setup;listRoster();render();
    notice.textContent='Your roster, period behaviors and obstacle setup are restored at '+sim.phase+' start.';
  };
  byId('replaySave').onclick=()=>{
    const id='MATCH-'+(rehearsalNotes.length+1);
    const lines=[id+' · '+profile.game+' '+profile.edition+' prescribed rehearsal',
      sim.phase+' active time '+(sim.ticks*rehearsal.dt).toFixed(2)+' s; '+(sim.ended?'clock frozen':'snapshot')+
      '. Obstacle setup: '+setup+'. Sources: '+config.sources.join(', '),
      ...sim.robots.map(r=>r.id+' '+r.side+' · '+config.periods.map(p=>p.name+' '+rehearsal.behaviors[r.plans[p.name]]).join(', ')+
        '; '+r.length+' × '+r.width+' × '+r.height+' in frame, bumper '+r.bumper+' in/side, heading '+r.heading+'°, '+r.speed+' in/s. '+
        'Position '+r.p.map(x=>x.toFixed(2)).join(', ')+' in. '+r.visits+' completed trips, '+(r.wait*rehearsal.dt).toFixed(2)+
        ' s waiting; '+(r.blocked || r.action || 'at start')+'.'),
      queues()];
    if(series)lines.push('Match series: '+activeSource+'.');
    for(const summary of sim.phaseHistory)lines.push(summary.phase+' cutoff at '+summary.seconds+' s: '+
      summary.robots.map(r=>r.id+' '+r.visits+' trips, '+r.waitSeconds.toFixed(2)+' s waiting').join('; ')+'.');
    const waits=sim.hotspots.slice().sort((a,b)=>b.ticks-a.ticks).slice(0,3);
    lines.push('Largest waiting areas: '+(waits.map(h=>h.point.map(v=>v.toFixed(1)).join(', ')+
      ' in, '+(h.ticks*rehearsal.dt).toFixed(2)+' robot-s').join('; ') || 'none')+'.',
      'Trips are unscored. '+config.boundsNote);
    for(const m of series?.results ?? [])lines.push(...rehearsalFindings(m.id,m.basis,m.game,config.stations));
    if(!series?.done)lines.push(...rehearsalFindings(series?.match.id ?? id,series?.match.basis ?? config.basis,sim.game,config.stations));
    lines.push('Rehearsal points use prescribed behavior, target eligibility and actual available cargo. Verify the pickup, release and scoring result independently.');
    rehearsalNotes.push({id,report:lines.join('\n')});
    notice.textContent='Saved '+id+' for the narrative download.';
  };
  byId('replaySetup').onchange=e=>setRoster(roster,e.target.value);
  function addRobot(side){
    const slot=[1,2,3].find(n=>!roster.some(r=>r.side===side && r.slot===n));
    if(slot)setRoster([...roster,rehearsal.defaults(side,slot)]);
  }
  byId('addBlue').onclick=()=>addRobot('blue');byId('addRed').onclick=()=>addRobot('red');
  new ResizeObserver(draw).observe(canvas);listRoster();render();
})();
