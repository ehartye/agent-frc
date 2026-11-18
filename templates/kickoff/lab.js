const byId = id => document.getElementById(id);
const fmt = n => String(Number(n.toFixed(3)));
const state=initialTrial(profile);
const gameTitle=(profile.season?profile.season+' ':'')+profile.game;
const exportName=profile.season || profile.game.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'game';
const observations = [];
const opportunities = [];
const sliders = new Map();
byId('season').textContent=gameTitle+' · '+profile.edition;
function paragraph(parent, content) {
  const p = document.createElement('p');
  p.textContent = content;
  parent.append(p);
}
const sources = byId('sources');
if(/^https?:\/\//i.test(profile.manual)) {
  const a=document.createElement('a');
  a.href=profile.manual;a.textContent='Game manual · '+profile.edition;sources.append(a);
} else {
  paragraph(sources,'Project source file: '+profile.manual+' · '+profile.edition);
}
paragraph(sources, 'Field: ' + profile.field.length + ' × ' + profile.field.width + ' in. ' + profile.field.source);
paragraph(sources, profile.limits.source);
paragraph(sources, profile.geometrySource);
if (profile.levels.length) paragraph(sources, profile.levels.map(v=>v.name+' '+v.height+' in').join(' · '));
paragraph(sources, profile.omissions);
paragraph(sources,'Editable starting box: '+[state.length,state.width,state.height].map(fmt).join(' × ')+' in. '+(profile.trial?'The project supplies this trial.':profile.rehearsal?'Dimensions come from the project rehearsal defaults.':'The initial cube uses one twelfth of the shorter field side as a visual scale reference.')+' X runs downfield from the first end wall. Y runs across the field from the near side.');

function slider(group, key, title, min, max, unit) {
  const item = document.createElement('div');
  item.className = 'slider';
  const label = document.createElement('label');
  label.htmlFor = key;
  label.append(title);
  const out = document.createElement('output');
  out.htmlFor = key;
  label.append(out);
  const input = document.createElement('input');
  Object.assign(input, {id:key, type:'range', min, max, step:key==='heading'?1:'any', value:state[key]});
  state[key] = Number(input.value);
  item.append(label,input);
  byId(group).append(item);
  sliders.set(key,{input,out,unit});
  input.oninput = () => {state[key]=Number(input.value);refresh();};
}
for(const key of ['length','width','height']) slider('sizes',key,key[0].toUpperCase()+key.slice(1),Math.min(1,state[key]),
  Math.max(2*state[key],profile.limits.height || 0,(profile.limits.perimeter || 0)/2), ' in');
slider('pose','x','Downfield X',0,profile.field.length,' in');
slider('pose','y','Across field Y',0,profile.field.width,' in');
slider('pose','heading','Heading',-180,180,'°');
function margin(value, limit) {
  if (limit === null) return 'limit unknown';
  const remaining = limit-value;
  return fmt(Math.abs(remaining))+' in '+(remaining<0?'over limit':'remaining');
}
function checks(box) {
  const perimeter = 2*(box.length+box.width);
  return ['Perimeter '+fmt(perimeter)+' in · '+margin(perimeter,profile.limits.perimeter),
    'Starting height '+fmt(box.height)+' in · '+margin(box.height,profile.limits.height)];
}
const scene = fieldScene(byId('field'),profile,state,(x,y)=>{
  state.x=Math.min(Math.floor(profile.field.length),Math.round(x));
  state.y=Math.min(Math.floor(profile.field.width),Math.round(y));
  refresh();
});
const levelSelect = byId('level');
profile.levels.forEach((level,i)=>levelSelect.add(new Option(level.name+' · '+level.height+' in',String(i))));
levelSelect.onchange=()=>{state.level=Number(levelSelect.value);refresh();};
state.level=profile.levels.length ? 0 : null;
byId('elevations').hidden=state.level===null;
function heightComparison(box) {
  if (box.level===null) return '';
  const level=profile.levels[box.level], delta=box.height-level.height;
  const position=delta===0?'at':fmt(Math.abs(delta))+' in '+(delta>0?'above':'below');
  return 'Box top is '+position+' '+level.name+'.';
}
function refresh() {
  for(const [key,{input,out,unit}] of sliders) {
    input.value=state[key];
    out.value=fmt(state[key])+unit;
  }
  const messages=checks(state);
  byId('screen').textContent=messages.join('\n');
  byId('difference').textContent=heightComparison(state);
  byId('screen').dataset.exceeded=messages.some(m=>m.endsWith('over limit'));
  scene.draw();
}
for(const button of document.querySelectorAll('[data-view]')) {
  button.disabled=button.dataset.view==='target' && !profile.landmarks.length;
  button.onclick=()=>{
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    scene.view(button.dataset.view);
  };
}
document.querySelector('[data-view=field]').click();
byId('zoomIn').onclick=()=>scene.zoom(1.25);
byId('zoomOut').onclick=()=>scene.zoom(.8);

function reportObservation(o) {
  const b=o.box;
  return o.id+' — '+o.finding+'\nBox '+b.length+' × '+b.width+' × '+b.height+
    ' in at ('+b.x+', '+b.y+') in, heading '+b.heading+'°. '+checks(b).join('. ')+'. '+heightComparison(b);
}
byId('capture').onclick=()=>{
  const finding=byId('finding').value.trim();
  if (!finding) {byId('finding').focus();return;}
  const observation={id:'OBS-'+(observations.length+1), box:{...state}, finding};
  observations.push(observation);
  const item=document.createElement('li');
  item.textContent=reportObservation(observation);
  byId('captures').append(item);
  byId('finding').value='';
  byId('feedback').textContent='';
};
byId('download').onclick=()=>{
  const feedback=byId('feedback');
  if(!observations.length && !opportunities.length && !rehearsalNotes.length) {
    feedback.textContent='Save a field observation, scoring opportunity or match snapshot to ground your draft.';
    byId('finding').focus();
    return;
  }
  const sections=[['story','Role and repeatable cycle'],['alternative','Alternative or fallback'],
    ['capability','REQ-1 · Provisional capability'],['experiment','TEST-1 · First experiment for REQ-1']];
  const draft=['# '+gameTitle+' kickoff narrative','Status: student draft for review.',
    '## Release-day evidence',profile.edition+' — '+profile.manual,
    'Field: '+profile.field.length+' × '+profile.field.width+' in. '+profile.field.source,
    profile.limits.source,profile.geometrySource,
    profile.levels.map(v=>v.name+' '+v.height+' in').join(' · '),profile.omissions,
    '## Student observations',...observations.map(reportObservation),
    '## Scoring opportunities and route requirements',...opportunities.map(o=>o.report),
    '## Match rehearsal snapshots',...rehearsalNotes.map(note=>note.report)];
  for (const [id,title] of sections) draft.push('## '+title,byId(id).value.trim() || 'Open for student discussion.');
  draft.push('Evidence for capability review: '+[...observations,...opportunities,...rehearsalNotes].map(o=>o.id).join(', ')+'.',
    'Before technical design, record the team decision, then give the selected capability a measurable acceptance check.');
  const url=URL.createObjectURL(new Blob([draft.join('\n\n')+'\n'],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download=exportName+'-kickoff-narrative.md';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  feedback.textContent='Downloaded the draft with its observations and source edition.';
};
refresh();
