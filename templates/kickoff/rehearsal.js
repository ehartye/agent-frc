(() => {
  if(!rehearsal.supported)return;
  const panel=byId('rehearsal'),canvas=byId('replayField'),context=canvas.getContext('2d');
  const rosterBox=byId('replayRoster'), clock=byId('replayClock'),notice=byId('replayNotice');
  panel.hidden=false;
  let roster=rehearsal.startingRoster();
  let setup=profile.rehearsal.defaults.roster?profile.rehearsal.setups[0]:(profile.rehearsal.series?.matches?.[0]?.setup ?? profile.rehearsal.setups[0]),frame=null,lastTime=0;
  let series=null,seriesPaused=false;
  const config=profile.rehearsal, L=profile.field.length,W=profile.field.width;
  const student=createRehearsalSetup(rehearsal,roster,setup,config.series?.matches);
  let sim=student.reset(),activeSource='';
  const seriesSource=byId('replaySeriesSource');
  if(config.series?.matches?.length)seriesSource.add(new Option('Published scenarios · '+config.series.matches.length+' matches','published'));
  seriesSource.add(new Option('My roster · 3 matches','student'));
  if(config.defaults.roster)seriesSource.value='student';
  for(const setup of config.setups)byId('replaySetup').add(new Option(setup,setup));
  byId('replayBasis').textContent=config.basis+' '+config.boundsNote+
    ' The default bumper adds '+config.defaults.bumper+' in per side. Priorities follow request time, then robot ID for same-tick requests. Completed trips count arrivals and service, with scoring evaluated separately by the project station model.';
  // Concept bots embedded in the profile. A card names one by id; the engine resolves it to the compiled record.
  // The game's own mouth() places each port on its face, so the drawing and the contact test share one geometry.
  const concepts=config.concepts ?? [], prisms=new Map();
  const conceptRecord=r=>{const id=typeof r.concept==='string'?r.concept:r.concept?.id;return id?concepts.find(c=>c.record.concept.id===id):null;};
  const ports=concepts.length?createRehearsalGame(profile,rehearsal.geom,createFieldPieceMotion(profile,rehearsal.geom)):null;
  const points=x=>Math.round(x*1000)/1000;
  if(concepts.length)canvas.parentElement.querySelector('figcaption').append(' Gold bars are input mouths and mint bars output faces. A dashed wedge is a turret’s travel, its solid ray the current aim, and the white arrow each concept robot’s heading.');
  const stations=config.stations ?? [], legend=byId('replayStations'), counters=new Map();
  let highlighted=null,expandedRobot=null;
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
  for(const [i,t] of (config.endgame?.targets ?? []).entries()){
    const row=document.createElement('li');
    row.textContent='T'+(i+1)+' · '+t.label+' · '+t.side+' · '+t.resource+' · '+t.capacity+' slot(s) shared'+
      (t.setups?' · '+t.setups.join(', '):'');
    legend.append(row);
  }
  legend.parentElement.hidden=!stations.length && !config.endgame;
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
    const maxH=Math.max(0,...sim.robots.map(r=>r.height));
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
      if(station.id!==highlighted)context.globalAlpha=.3;
      if(station.areaIn){
        const [[left,bottom],[right,top]]=station.areaIn,xy=at([left,top]);
        context.rect(...xy,(right-left)*scale,(top-bottom)*scale);
      }else context.arc(ax,ay,station.radiusIn*scale,0,Math.PI*2);
      context.stroke();
      context.globalAlpha=1;
      const retrieval=station.kind==='retrieval';
      context.fillStyle=retrieval?'#ffd373':'#d9f7df';
      if(retrieval){
        const stock=sim.game.stock[station.id].length;
        context.fillRect(x-4,y-4,8,8);
        for(let i=0;i<Math.min(station.floor||station.service?0:6,stock);i++){context.beginPath();context.arc(x+(i%3-1)*4,y-6-Math.floor(i/3)*4,1.7,0,Math.PI*2);context.fill();}
      }else{context.beginPath();context.arc(x,y,5,0,Math.PI*2);context.stroke();}
    }
    for(const piece of sim.game.motion.pieces){
      const [x,y]=at(piece.p);
      context.fillStyle=piece.station===highlighted?'#fff':'#ffcc62';context.strokeStyle='#54421e';context.lineWidth=.7;
      context.beginPath();context.arc(x,y,Math.max(1.25,piece.radiusIn*scale),0,2*Math.PI);context.fill();context.stroke();
    }
    for(const s of stations.filter(s=>s.kind==='scoring')){
      const last=sim.game.events.findLast(e=>e.station===s.id && e.operation==='attempt' && e.pieces.length);
      if(!last || last.phase!==sim.phase || sim.ticks*rehearsal.dt-last.timeS>1.5)continue;
      const [x,y]=at(s.displayAt??s.at);
      context.font='bold 13px system-ui';context.textAlign='center';
      context.fillStyle=last.points?'#c3ffd5':'#ffd5af';
      context.fillText(last.points?'+'+last.points:'×',x,y-9);
    }
    for(const h of sim.hotspots){
      const xy=at(h.point);context.fillStyle='#ffbd6e91';context.beginPath();
      context.arc(...xy,Math.max(3,Math.min(13,Math.sqrt(h.ticks)*.8))*Math.max(scale,.55),0,Math.PI*2);context.fill();
    }
    for(const [i,t] of (config.endgame?.targets ?? []).entries()){
      if(t.setups && !t.setups.includes(setup))continue;
      const [x,y]=at(t.at);
      context.save();context.strokeStyle=t.side==='blue'?'#b6daff':'#ffbec8';
      context.setLineDash([2,3]);context.beginPath();context.arc(x,y,t.radiusIn*scale,0,Math.PI*2);context.stroke();
      context.setLineDash([]);const [mx,my]=at(t.displayAt ?? t.at);
      line([t.at,t.displayAt ?? t.at],context.strokeStyle);
      context.font='bold 11px system-ui';context.fillStyle='#fff';context.textAlign='center';
      context.fillText('T'+(i+1),Math.max(x0+10,Math.min(x0+L*scale-10,mx)),Math.max(y0-W*scale+12,Math.min(y0-3,my)));
      context.restore();
    }
    for(const r of sim.robots) {
      if(r.waypoints?.length && r.target<r.waypoints.length) {
        context.setLineDash([3,5]);line([r.p,...r.waypoints.slice(r.target)],r.side==='blue'?'#a3ccff':'#ffb7b3',1.5);context.setLineDash([]);
      }
    }
    // Concept marks: gold input mouths, mint output faces, a dashed turret wedge with its current aim ray, a heading arrow.
    function conceptMarks(r){
      const toward=(from,deg,length)=>[from[0]+length*Math.cos(deg*Math.PI/180),from[1]+length*Math.sin(deg*Math.PI/180)];
      for(const port of r.concept.inputs){const m=ports.mouth(r,port);line(m.ends,'#182d41',4);line(m.ends,'#ffdf85',2);}
      for(const port of r.concept.outputs){
        const span=(port.face==='front'||port.face==='back'?r.width:r.length)+2*r.bumper;
        const m=ports.mouth(r,{face:port.face,extensionIn:0,widthIn:span*.6}),normal=Math.atan2(m.forward[1],m.forward[0])*180/Math.PI;
        line(m.ends,'#182d41',4);line(m.ends,'#7ff0c8',2);
        if(port.kind!=='ranged')continue;
        const turret=port.ranged.turret,reach=Math.max(12,span*.6);
        if(turret){
          const wedge=Array.from({length:25},(_,k)=>toward(m.center,normal+turret.minDeg+(turret.maxDeg-turret.minDeg)*k/24,reach));
          context.setLineDash([3,3]);line([m.center,...wedge,m.center],'#b8f5ff',1.2);context.setLineDash([]);
        }
        const aim=turret?sim.game.concept?.[r.id]?.aim?.[port.id]?.turretDeg ?? 0:0;
        line([m.center,toward(m.center,normal+aim,reach)],'#7ff0c8',1.5);
      }
      const tip=toward(r.p,r.heading,r.length/2+r.bumper+6),wing=d=>toward(tip,r.heading+180+d,5);
      for(const [color,width] of [['#182d41',3.5],['#ffffff',1.6]])line([wing(-28),tip,wing(28),tip,r.p],color,width);
    }
    for(const r of sim.robots){
      const blue=r.side==='blue';
      line(rehearsal.geom.footprint(r.p,r),'#f7faff',1.3,blue?'#2867ab':'#af3849');
      line(rehearsal.geom.footprint(r.p,{...r,bumper:0}),blue?'#9ccbff':'#ffadaf',1,blue?'#22518a':'#8e3240');
      const intake=r.intake?rehearsal.intake(r):null;
      if(intake){line(intake.ends,'#182d41',4);line(intake.ends,'#ffdf85',2);}
      if(r.concept)conceptMarks(r);
      const port=r.concept?.inputs.find(p=>p.id===r.pickup?.port),mouth=intake ?? (port?ports.mouth(r,port):null);
      const target=mouth && sim.game.motion.pieces.find(piece=>piece.id===r.pickup?.id);
      if(target){
        const [tx,ty]=at(target.p);
        context.strokeStyle='#fff5c8';context.lineWidth=2;context.beginPath();
        context.arc(tx,ty,Math.max(4,(target.radiusIn+2)*scale),0,Math.PI*2);context.stroke();
        context.setLineDash([2,4]);line([mouth.center,target.p],'#ffe298');context.setLineDash([]);
      }
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
      if(highlighted!==s.id)continue;
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
  // Choosing a concept keeps the robot's plans; choosing none restores the prism it had, or the profile default prism.
  function chooseConcept(r,id){
    if(!conceptRecord(r))prisms.set(r.id,r);
    const {orders,roster:rows,concept:named,...body}=config.defaults,{concept,...row}=r;
    const prism=prisms.get(r.id) ?? {...row,...body,frameProfile:body.frameProfile??profile.frameProfile,heading:rehearsal.defaults(r.side,r.slot).heading};
    setRoster(roster.map(x=>x.id!==r.id?x:id?{...row,concept:id}:{...prism,plans:r.plans,endgame:r.endgame}));
  }
  function terminalEditor(r,card){
    const spec=config.endgame;if(!spec)return;
    const choices=[];
    for(const t of spec.targets)for(const a of spec.actions)if(rehearsal.terminal.eligible(r,a,t,setup))
      choices.push({action:a.id,target:t.id,label:a.label+' · '+t.label});
    const section=document.createElement('fieldset'),heading=document.createElement('legend');
    heading.textContent='Terminal objective';section.append(heading);card.append(section);
    function select(label,options,value,change){
      const wrap=document.createElement('label'),control=document.createElement('select');
      wrap.append(label);control.setAttribute('aria-label',r.id+' '+label);
      options.forEach(o=>control.add(new Option(o.label,o.value)));
      control.value=value;control.onchange=()=>change(control.value);
      wrap.append(control);section.append(wrap);
    }
    const key=c=>JSON.stringify([c.action,c.target]), options=choices.map(c=>({label:c.label,value:key(c)}));
    const lookup=value=>{const [action,target]=JSON.parse(value);return {action,target};};
    const plan=r.endgame;
    select('Final objective',[{label:'Continue ordinary scoring',value:''},...options],plan?key(plan):'',value=>
      edit(r.id,{endgame:value?{...lookup(value),startS:plan?.startS ?? 0,witnesses:{}}:undefined}));
    if(!plan)return;
    const time=document.createElement('input'),wrap=document.createElement('label');
    wrap.append('Switch at elapsed '+spec.period+' seconds');time.type='number';time.min=0;
    time.max=config.periods.at(-1).seconds;time.step='.05';time.value=plan.startS;
    time.setAttribute('aria-label',r.id+' terminal switch seconds');
    time.onchange=()=>{if(time.value!=='' && time.reportValidity())edit(r.id,{endgame:{...plan,startS:time.valueAsNumber}});};
    wrap.append(time);section.append(wrap);
    const fallback=plan.fallbacks ?? [], selected=[plan,...fallback], used=new Set(selected.map(c=>c.action));
    const remaining=choices.filter(c=>!used.has(c.action));
    if(remaining.length)select('Add fallback',[{label:'Select an alternative',value:''},...remaining.map(c=>({label:c.label,value:key(c)}))],'',v=>{
      if(v)edit(r.id,{endgame:{...plan,fallbacks:[...fallback,lookup(v)]}});
    });
    const criteria=new Set();
    for(const c of selected){
      const a=spec.actions.find(a=>a.id===c.action);
      rehearsal.terminal.criteria(a).forEach(name=>criteria.add(name));
    }
    if(fallback.length){
      const clear=button('Clear fallbacks: '+fallback.map(f=>spec.actions.find(a=>a.id===f.action).label).join(', '),()=>{
        const allowed=rehearsal.terminal.criteria(spec.actions.find(a=>a.id===plan.action));
        const witnesses=Object.fromEntries(Object.entries(plan.witnesses ?? {}).filter(([k])=>allowed.includes(k)));
        edit(r.id,{endgame:{...plan,fallbacks:[],witnesses}});
      });section.append(clear);
    }
    for(const name of criteria)select('At assessment, assume '+name,[
      {value:'unknown',label:'Unknown'},{value:'met',label:'Met at assessment'},{value:'failed',label:'Failed at assessment'}
    ],plan.witnesses?.[name] ?? 'unknown',v=>edit(r.id,{endgame:{...plan,witnesses:{...plan.witnesses,[name]:v}}}));
  }
  function listRoster(){
    rosterBox.replaceChildren();
    for(const side of ['blue','red']){
      const group=document.createElement('div');group.className='replay-group';group.dataset.alliance=side;
      const heading=document.createElement('h3');heading.textContent=(side==='blue'?'Blue':'Red')+' alliance';group.append(heading);
      rosterBox.append(group);
      for(const r of roster.filter(r=>r.side===side).sort((a,b)=>a.slot-b.slot)){
      const card=document.createElement('details');card.className='replay-robot '+r.side;
      card.name='robot-editor';card.open=expandedRobot===r.id;card.ontoggle=()=>{if(card.open)expandedRobot=r.id;else if(expandedRobot===r.id)expandedRobot=null;};
      const title=document.createElement('summary');
      const assignment=sim.game.opening[r.id],role=document.createElement('small');
      title.textContent=r.id+' · '+rehearsal.behaviors[r.plans[config.periods[0].name]];
      const preload=sim.game.cargo[r.id].map(p=>p.id);
      const task=assignment.piece ?? (assignment.yieldPickup?'yield pickup':assignment.fallback==='preload' && preload.length?
        preload[0]+(preload.length>1?' + '+(preload.length-1)+' more':''):assignment.fallback);
      role.textContent='Opening · '+task;role.title=preload.join(', ');title.append(role);
      card.append(title);
      for(const period of config.periods){
        const key=period.name,name=key+' behavior';
        const label=document.createElement('label'),sel=document.createElement('select');
        label.append(name);sel.setAttribute('aria-label',r.id+' '+name);
        for(const [value,text] of Object.entries(rehearsal.behaviors))sel.add(new Option(text,value));
        sel.value=r.plans[key];sel.onchange=()=>edit(r.id,{plans:{...r.plans,[key]:sel.value}});label.append(sel);card.append(label);
      }
      const chosen=conceptRecord(r);
      if(concepts.length){
        const label=document.createElement('label'),sel=document.createElement('select');
        label.append('Concept bot');sel.setAttribute('aria-label',r.id+' concept bot');
        sel.add(new Option('None · prism robot',''));
        for(const c of concepts)sel.add(new Option(c.record.concept.id+' · '+c.document.name,c.record.concept.id));
        sel.value=chosen?.record.concept.id ?? '';sel.onchange=()=>chooseConcept(r,sel.value);label.append(sel);card.append(label);
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
      if(chosen){
        // The concept file owns the body and the drive; the speed, bumper and trial-box edits would not change its motion.
        const d=chosen.record.concept.drive,note=document.createElement('small');
        note.textContent='Body and swerve drive from the concept file: '+d.topSpeedInS+' in/s top, '+d.accelInS2+' in/s², '+d.rotationDegS+'°/s turn.';
        configLine.append(note);
      }else{
        addNumber('Speed (in/s)',r.speed,1,500,1,'speed');
        addNumber('Bumper per side (in)',r.bumper,0,12,.25,'bumper');
        const apply=button('Use trial box',()=>edit(r.id,{length:state.length,width:state.width,height:state.height,heading:state.heading,frameProfile:state.frameProfile??{kind:'square'}}));
        apply.setAttribute('aria-label','Use trial box for '+r.id);
        configLine.append(apply);
      }
      card.append(configLine);terminalEditor(r,card);group.append(card);
      }
    }
  }
  function queues(){
    return Object.entries(sim.resources).map(([name,r])=>name+' holder: '+(r.owner || 'open')+
      '. Requests in order: '+(r.queue.join(', ') || 'none')+'.').join(' ');
  }
  function render(){
    const used=sim.ticks*rehearsal.dt,left=rehearsal.phaseSeconds(sim.phase)-used;
    clock.textContent=left>=0?sim.phase+' · '+left.toFixed(2)+' s':sim.phase+' assessment · '+(-left).toFixed(2)+' s after cutoff';
    const began=Boolean(series) || sim.ticks>0 || sim.phaseIndex>0 || !sim.paused;
    for(const control of rosterBox.querySelectorAll('select,input,button'))control.disabled=began;
    byId('replaySetup').disabled=began;
    byId('scoreBlue').textContent=points(sim.game.score.blue);byId('scoreRed').textContent=points(sim.game.score.red);
    const end=sim.ended;
    byId('replayRun').disabled=!roster.length || (end && sim.phaseIndex===config.periods.length-1);
    if(series)byId('replayRun').disabled=true;
    seriesSource.disabled=Boolean(series && !series.done);
    byId('replaySeries').textContent=series && !series.done ? (seriesPaused?'Resume series at 10×':'Pause series') : 'Play match series at 10×';
    byId('replayScore').textContent=series?activeSource+' · '+series.match.id:sim.game.motion.pieces.length+' loose · '+Object.values(sim.game.cargo).flat().length+' carried';
    const terminal=sim.game.endgame, report=byId('replayTerminal');
    report.hidden=!terminal;
    if(terminal){
      const rows=terminal.attempts.map(a=>a.robot+' · '+a.action+' · '+(a.awardedAction?'awarded '+a.awardedAction+' (+'+a.points+')':a.outcome==='pending'?
        (a.completedAtS!==null?'service complete; awaiting assessment':a.arrivedAtS!==null?'at target':a.interruptedAtS!==null?'approaching':'switch at '+a.startS+' s'):a.outcome));
      if(terminal.assessed){
        rows.unshift('Powered time ended at '+terminal.activeCutoffS+' s. Assessed at '+terminal.assessmentTimeS+' s. Terminal points: Blue '+terminal.terminalScore.blue+', Red '+terminal.terminalScore.red+'.');
        for(const b of terminal.bonusAwards.filter(b=>b.points))rows.push(b.side+' '+b.id+' · '+b.robots.join(', ')+' · +'+b.points);
      }
      report.textContent=rows.join(' · ') || 'Choose a terminal objective in a robot’s roster to interrupt its ordinary scoring cycle.';
    }
    for(const s of stations){
      const count=s.kind==='retrieval'?sim.game.stock[s.id].length+' available'+(s.service?' · '+sim.game.reserve[s.id].length+' in reserve · '+s.service.operator+(sim.game.operators[s.service.operator]?.job?.station===s.id?' serving':''):''):
        sim.game.attempts[s.id]+' attempted'+(s.capacity===undefined?'':' · '+sim.game.occupied[s.id]+'/'+s.capacity+' occupied');
      const output=counters.get(s.id).counts,next=' '+s.piece+' · '+count;
      if(output.textContent!==next)output.textContent=next;
    }
    const following=config.periods[sim.phaseIndex+1];
    byId('replayRun').textContent=end?(following?'Play '+following.name:'Match complete'):(!sim.paused?'Pause match':used?'Resume match':'Play match');
    for(const id of ['replayStep','replayFast'])byId(id).disabled=Boolean(series) || !sim.paused || end || !roster.length;
    for(const r of sim.robots){
      const o=byId('replay-state-'+r.id);
      o.textContent=(r.length+2*r.bumper)+' × '+(r.width+2*r.bumper)+' in occupied, '+r.height+' in tall, heading '+
        (r.concept?r.heading.toFixed(1)+'° (concept '+r.concept.id+')':r.heading+'°')+'. '+
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
  if(roleComparison){
    const roleChoice=byId('roleChoice'),contextChoice=byId('roleContext');
    for(const r of roleComparison.roles)roleChoice.add(new Option(r.id,r.id));
    for(const c of roleComparison.contexts)contextChoice.add(new Option(c.id,c.id));
    function selected(){return roleComparison.cells.find(c=>c.role===roleChoice.value&&c.context===contextChoice.value);}
    function showResult(){
      const c=selected();
      byId('roleBasis').textContent=roleComparison.roles.find(r=>r.id===c.role).basis+' '+roleComparison.contexts.find(r=>r.id===c.context).basis;
      byId('roleOutcome').textContent='Ordinary points · Blue '+c.ordinary.blue+' / Red '+c.ordinary.red+
        ' · Terminal points · Blue '+c.terminal.blue+' / Red '+c.terminal.red+
        ' · '+roleComparison.side+' margin '+c.margin+' · Opportunity cost '+c.regret+' points';
      byId('rolePhases').replaceChildren(...c.byRobot.filter(r=>r.id===c.focalId).map(r=>{
        const li=document.createElement('li');
        li.textContent=r.id+' · '+r.phase+' · waited '+r.waitS.toFixed(2)+' s · traveled '+r.travelIn.toFixed(1)+
          ' in · '+(r.tally['attempt/credited']?.pieces??0)+' accepted · '+r.acceptedPerSecond.toFixed(3)+' pieces/s';
        return li;
      }));
    }
    roleChoice.onchange=contextChoice.onchange=showResult;
    byId('rolePlay').onclick=()=>{
      const c=selected(),source=config.series.matches.find(m=>m.id===c.match);
      stopFrame();
      series=createMatchSeries(rehearsal,[{...source,roster:c.roster}]);
      activeSource=c.role+' / '+c.context;seriesPaused=false;sim=series.sim;setup=sim.setup;roster=series.match.roster;
      byId('replaySetup').value=setup;notice.textContent='';listRoster();seriesResults();render();
      lastTime=performance.now();frame=requestAnimationFrame(playSeries);
    };
    if(roleComparison.files){
      for(const period of config.periods)byId('rolePhase').add(new Option(period.name,period.name));
      for(const station of stations.filter(s=>[roleComparison.side,'both'].includes(s.side)))
        byId('roleStation').add(new Option(station.label,station.id));
      byId('roleExport').hidden=!byId('roleStation').options.length;
      byId('roleSave').onclick=()=>{
        const c=selected(),selection={schema:'agent-frc/role-selection@1',...roleComparison.files,role:c.role,context:c.context,
          phase:byId('rolePhase').value,station:byId('roleStation').value};
        const url=URL.createObjectURL(new Blob([JSON.stringify(selection,null,2)+'\n'],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download='role-selection.json';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      };
    }
    byId('roleLab').hidden=false;showResult();
  }
  function animate(now){
    frame=null;
    if(sim.paused)return;
    rehearsal.advance(sim,Math.max(0,(now-lastTime)/1000));lastTime=now;
    if(sim.ended && config.periods[sim.phaseIndex+1]){rehearsal.nextPhase(sim);sim.paused=false;}
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
  byId('replayFast').onclick=()=>advancePaused(rehearsal.elapsedSeconds(sim.phase));
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
        '; '+(r.concept?'concept '+r.concept.id+', ':'')+r.length+' × '+r.width+' × '+r.height+' in frame, bumper '+r.bumper+' in/side, heading '+
        (r.concept?r.heading.toFixed(1):r.heading)+'°, '+r.speed+(r.concept?' in/s top':' in/s')+'. '+
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
  new ResizeObserver(draw).observe(canvas);listRoster();render();
})();
