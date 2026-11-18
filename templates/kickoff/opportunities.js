const scoring=profile.scoring;
const area=byId('modelSummary');
paragraph(area,profile.season+' '+profile.game+' · '+profile.edition+' · '+profile.field.source);
if(scoring) {
  for(const i of scoring.inventory) paragraph(area,i.piece+' · '+i.total+' distinct pieces. '+i.distribution);
  paragraph(area,scoring.phases.map(p=>p.name+' '+p.seconds+' seconds').join(' / '));
  const table=document.createElement('table');
  const addRow=(values,tag)=>{
    const row=table.insertRow();
    for(const value of values){const cell=document.createElement(tag);cell.textContent=value;row.append(cell);}
  };
  addRow(['Scoring opportunity',...scoring.phases.map(p=>p.name+' pts/piece')],'th');
  scoring.targets.forEach(t=>addRow([t.name,...t.points],'td'));
  area.append(table);
  paragraph(area,scoring.source);
  if(scoring.fieldMap) paragraph(area,scoring.fieldMap.basis);
  if(profile.routeHypotheses?.length) {
    const routes=document.createElement('details'), heading=document.createElement('summary');
    heading.textContent='Inspect inferred routes before entering the pre-sim';routes.append(heading);
    for(const h of profile.routeHypotheses) paragraph(routes,h.phase+' · '+h.piece+' to '+h.destination+
      ' · '+Math.round(h.lengthIn)+' in · '+h.traffic);
    area.append(routes);
  }
} else paragraph(area,'Scoring inventory, phase timing and route locations are open in this profile.');
byId('modelFile').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(profile,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=profile.season+'-rules-model.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
};

function control(group,id,title,options) {
  const label=document.createElement('label');
  label.textContent=title;
  const input=document.createElement(options?'select':'input');
  input.id=id;
  if(options) options.forEach((v,i)=>input.add(new Option(v,String(i))));
  else input.type='number';
  label.append(input);byId(group).append(label);
  return input;
}
const targetBox=control('choices','opTarget','Scoring target',scoring?.targets.map(t=>t.name) || ['Custom opportunity']);
const phaseBox=control('choices','opPhase','Match phase',scoring?.phases.map(v=>v.name) || ['Custom window']);
const inputs={};
for(const [key,title,initial] of [
  ['stock','Distinct pieces in match',null],['points','Points per scored piece',null],
  ['window','Window length (s)',10],['opening','Accessible here at start',1],
  ['incoming','Additional pieces arriving here',0],['arrival','Their arrival time from window start (s)',0],
  ['goal','Pieces this robot aims to score',1],['setup','Non-scoring time beyond transit (s)',0],
  ['speed','Assumed average transit speed (in/s)',100],['cycle','Candidate time per completed piece (s)',1],
  ['capacity','Open target slots (optional)',null]
]){
  const input=control('numbers','op-'+key,title);input.min=0;input.step='any';
  if(initial!==null) input.value=initial;
  inputs[key]=input;
}
const overrides={};
let study;
const read=key=>inputs[key].value===''?NaN:Number(inputs[key].value);
const selected=()=>scoring?.targets[Number(targetBox.value)];
const phase=()=>scoring?.phases[Number(phaseBox.value)];
const coords=q=>'('+q.map(n=>fmt(n)).join(', ')+') in';
function selectOpportunity() {
  for(const key of ['a','b']) delete overrides[key];
  const t=selected(), p=phase();
  const i=scoring?.inventory.find(v=>v.piece===t.piece);
  inputs.stock.value=i?.total ?? '';
  inputs.stock.readOnly=Boolean(i);
  inputs.points.value=t?.points[Number(phaseBox.value)] ?? '';
  inputs.points.readOnly=Boolean(t);
  inputs.capacity.value=t?.cap ?? '';
  inputs.window.value=p?.seconds ?? 10;
  byId('inventory').textContent=i?i.piece+' · '+i.total+' in the match. '+i.distribution:'Enter a sourced piece inventory and scoring value.';
  byId('scoreSource').textContent=scoring?.source || 'Document the source and edition in the allocation notes.';
  updateRoute();
}
function updateRoute() {
  const t=selected();
  study=routeStudy(profile,t?.piece,t?.goal,phase()?.name,overrides,Math.max(state.length,state.width));
  const endpoints=study.line.length?[study.line[0],study.line.at(-1)]:[];
  const labels=['A','B'];
  scene.setRoute(endpoints.map((q,i)=>({x:q[0],y:q[1],name:labels[i]})),study);
  byId('routeLabel').textContent=endpoints.length?'A '+coords(endpoints[0])+' → B '+coords(endpoints[1])+' · '+fmt(study.length)+' in':
    'Route unresolved'+(overrides.a?' · A '+coords(overrides.a):'')+(overrides.b?' · B '+coords(overrides.b):'');
  byId('traffic').textContent=study.traffic;
  reviewWindow();
}
function evaluate() {
  const t=selected(),p=phase();
  const speed=read('speed');
  if(study.length && (!Number.isFinite(speed) || speed<=0)) throw Error('Enter a positive transit speed.');
  if(p && read('window')>p.seconds) throw Error('The window exceeds the duration of this phase.');
  if(t?.cap!==undefined && read('capacity')>t.cap) throw Error('Open slots exceed the target inventory.');
  const cap=inputs.capacity.value===''?(t?.cap ?? null):read('capacity');
  const trial={};
  for(const key of ['stock','opening','incoming','goal','window','cycle','arrival','setup','points']) trial[key]=read(key);
  trial.cap=cap;trial.travel=study.length?study.length/speed:0;
  const result=analyzeWindow(trial);
  const n=v=>Number(v.toFixed(3));
  const rate=Number.isFinite(result.rate)?n(result.rate)+' pieces/s':'unattainable in the remaining time';
  const lines=[
    'Supply and target ceiling: '+result.available+' pieces · goal '+trial.goal+'.',
    'Transit '+n(trial.travel)+' s + other non-scoring time '+trial.setup+' s leaves '+n(result.usable)+' s.',
    'Required throughput: '+rate+(result.rate>0 && Number.isFinite(result.rate)?' (at most '+n(1/result.rate)+' s/piece).':'.'),
    'Candidate: '+n(1/trial.cycle)+' pieces/s. At most '+result.delivered+' scored for '+result.points+' points. '+
      (result.attainable?'Meets the arithmetic screen.':result.available<trial.goal?'Supply or scoring slots rule out this goal.':'Candidate misses this window.')
  ];
  if(!study.line.length) lines.unshift('Transit unknown. The rate below assumes zero travel time.');
  return {lines,trial};
}
function reviewWindow() {
  try{byId('scoreResult').textContent=evaluate().lines.join('\n');byId('saveWindow').disabled=false;}
  catch(e){byId('scoreResult').textContent=e.message;byId('saveWindow').disabled=true;}
}
for(const name of ['A','B']) byId('mark'+name).onclick=()=>{
  overrides[name.toLowerCase()]=[state.x,state.y];updateRoute();
};
byId('clearRoute').textContent='Restore modeled route';
byId('clearRoute').onclick=()=>{delete overrides.a;delete overrides.b;updateRoute();};
targetBox.onchange=selectOpportunity;phaseBox.onchange=selectOpportunity;
Object.values(inputs).forEach(input=>input.oninput=reviewWindow);
for(const key of ['width','length']) sliders.get(key).input.addEventListener('input',updateRoute);
byId('saveWindow').onclick=()=>{
  const notes=byId('allocation').value.trim();
  if(!notes){byId('windowStatus').textContent='Record the location and basis for the assumed supply and timing.';byId('allocation').focus();return;}
  const {lines,trial}=evaluate(), id='OP-'+(opportunities.length+1);
  const t=selected(),p=phase(),i=scoring?.inventory.find(v=>v.piece===t.piece);
  const text=id+' · '+(t?.name || 'Custom opportunity')+' · '+(p?.name || 'Custom window');
  const report=[text,scoring?.source || '',i?i.distribution:'',
    'Distinct inventory '+trial.stock+'. Opening allocation '+trial.opening+', plus '+trial.incoming+' at '+trial.arrival+
    ' s. Window '+trial.window+' s. Value '+trial.points+' points/piece. Slots '+(trial.cap ?? 'unspecified')+'.',
    'Assumptions: '+notes,'Route: '+byId('routeLabel').textContent+' at assumed '+inputs.speed.value+' in/s.',
    'Traffic inference: '+study.traffic+'. '+(scoring?.fieldMap?.basis || ''),
    'Trial box '+state.length+' × '+state.width+' × '+state.height+' in. Candidate cycle '+trial.cycle+' s/piece.',
    ...lines,'Provisional scoring requirement: sustain this opportunity’s required throughput over its usable window. Resolve supply shortfalls before adopting the target.',
    'Capture mechanism and exposed state: '+(byId('exposure').value.trim() || 'Open.'),
    'Provisional contact requirement: assess the exposed capture mechanism along this route and verify retained function under the specified contact case.',
    'Contact load case and basis: '+(byId('loadCase').value.trim() || 'Unknown. Establish direction, magnitude and load path.'),
    'Retained function and verification: '+(byId('survive').value.trim() || 'Open. Define a post-contact capture and cycle-time check.')];
  opportunities.push({id,report:report.filter(Boolean).join('\n')});
  const li=document.createElement('li');li.textContent=text+' · '+lines.at(-1);byId('savedWindows').append(li);
  byId('windowStatus').textContent='Saved '+id+' for the match story.';
};
selectOpportunity();
