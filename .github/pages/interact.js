'use strict';

const powerChoice = document.getElementById('power-choice');
function selectPowerTrial() {
  document.querySelectorAll('[data-power-trial]').forEach(result => {
    result.hidden = result.dataset.powerTrial !== powerChoice.value;
  });
}
powerChoice.addEventListener('change', selectPowerTrial);
selectPowerTrial();

const field=JSON.parse(document.getElementById('fieldModel').textContent);
const pitch=document.getElementById('pitch');
const ctx=pitch.getContext('2d');
const start=field.route[0],end=field.route.at(-1);
const poses=[start,field.route.length>2?field.route[Math.floor(field.route.length/2)]:start.map((v,i)=>(v+end[i])/2),end];
const notes=['Pickup · Start with a trial pose near a piece source.',
  'Transit · Check where the cycle shares space with other routes.',
  'Approach · Compare the robot envelope with the target approach.'];
let selected=0;
function draw(){
  if(!ctx) return;
  const width=pitch.clientWidth;
  if(!width) return;
  const ratio=Math.min(3,window.devicePixelRatio||1);
  pitch.width=Math.round(width*ratio);
  pitch.height=Math.round(width*375/730*ratio);
  ctx.setTransform(pitch.width/730,0,0,pitch.height/375,0,0);
  ctx.clearRect(0,0,730,375);
  const L=field.field.length,W=field.field.width;
  const view=([x,y,z=0])=>[25+502*x/L+177*y/W,235+78*x/L-149*y/W-z*.78];
  function path(points,fill,stroke,lineWidth=1,close=true){
    ctx.beginPath();
    points.forEach((point,i)=>{const p=view(point);if(i)ctx.lineTo(...p);else ctx.moveTo(...p);});
    if(close)ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
  }
  const corners=field.boundary;
  path(corners.map(([x,y])=>[x+9,y-6,-12]),'#95b3c2');
  path([[0,0],[L,0],[L,0,-12],[0,0,-12]],'#5b7d94','#3a5b72');
  path([[L,0],[L,W],[L,W,-12],[L,0,-12]],'#6e91a4','#3a5b72');
  path(corners,'#7e9fae','#365c77',2);
  for(let x=24;x<L;x+=24)path([[x,0],[x,W]],null,'#95b2bd',.7,false);
  for(let y=24;y<W;y+=24)path([[0,y],[L,y]],null,'#95b2bd',.7,false);
  path([[0,0],[9,0],[9,W],[0,W]],'#326aa1');
  path([[L-9,0],[L,0],[L,W],[L-9,W]],'#d07660');
  ctx.setLineDash([5,4]);path([[L/2,0],[L/2,W]],null,'#e5f0ef',2,false);ctx.setLineDash([]);
  function prism(p,z,h,top,face){
    const visible=p.map((a,i)=>[a,p[(i+1)%p.length]]).sort((a,b)=>view(a[0])[1]+view(a[1])[1]-view(b[0])[1]-view(b[1])[1]);
    for(const [a,b] of visible)path([[...a,z],[...b,z],[...b,h],[...a,h]],face,'#395567',1.3);
    path(p.map(a=>[...a,h]),top,'#395567',1.5);
  }
  for(const o of field.obstacles){
    if(o.kind==='overlay')continue;
    const h=o.kind==='landmark'?field.body.height*.8:Math.max(4,o.low+5);
    prism(o.poly,0,h,o.kind==='landmark'?'#bdd2dc':'#f3d4a8','#506f82');
  }
  ctx.setLineDash([5,5]);path(poses.map(p=>[...p,2]),null,'#fff3c1',2.4,false);ctx.setLineDash([]);
  const [rx,ry]=poses[selected];
  const box=(l,w)=>[[rx-l,ry-w],[rx+l,ry-w],[rx+l,ry+w],[rx-l,ry+w]];
  prism(box(field.body.length/2+field.body.bumper,field.body.width/2+field.body.bumper),0,6,'#244265','#173451');
  prism(box(field.body.length/2,field.body.width/2),6,field.body.height,'#ffd4aa','#f4a16b');
  const [px,py]=view([rx,ry,28]);
  ctx.strokeStyle='#172f55';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(px,py-5);ctx.lineTo(px-13,py-32);ctx.lineTo(px-62,py-32);ctx.stroke();
  ctx.font='bold 14px Consolas, monospace';ctx.fillStyle='#173552';ctx.textAlign='right';ctx.fillText(['PICKUP','TRANSIT','APPROACH'][selected],px-17,py-39);
  ctx.font='13px Consolas, monospace';ctx.textAlign='left';ctx.fillText('Illustrative route',24,349);
}
document.querySelectorAll('[data-pose]').forEach(button=>button.addEventListener('click',()=>{
  selected=Number(button.dataset.pose);
  document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  document.getElementById('poseText').textContent=notes[selected];draw();
}));
new ResizeObserver(draw).observe(pitch);

function openLinkedChapter(){
  const target=document.getElementById(location.hash.slice(1));
  if(target?.matches('details.chapter'))target.open=true;
}
openLinkedChapter();window.addEventListener('hashchange',openLinkedChapter);
document.querySelector('.directory').addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');
  if(a){const chapter=document.getElementById(a.hash.slice(1));if(chapter)chapter.open=true;}
});

const filter=document.getElementById('skillFilter');
function filterSkills(){
  let count=0;
  document.querySelectorAll('.skill').forEach(skill=>{
    skill.hidden=filter.value!=='all' && !skill.dataset.stages.split(' ').includes(filter.value);
    if(!skill.hidden)count++;
  });
  document.getElementById('skillCount').textContent=count+' supporting skill'+(count===1?'':'s');
}
filter.addEventListener('change',filterSkills);filterSkills();
const form=document.getElementById('rateForm');
function updateRate(){
  const inputs=Array.from(form.querySelectorAll('input'));
  const [target,time,cadence]=inputs.map(i=>i.valueAsNumber);
  const valid=inputs.every(i=>i.validity.valid);
  document.getElementById('required').value=valid?Number((target/time).toFixed(2)):'—';
  document.getElementById('capacity').value=valid?Number((1/cadence).toFixed(2)):'—';
  const delivered=Math.min(target,Math.floor(time/cadence+1e-10));
  document.getElementById('rateNote').textContent=valid?
    'At this cadence, the loader can deliver '+delivered+' of '+target+' pieces in the window.':
    'Enter a positive whole piece count and positive times within the field limits.';
}
form.addEventListener('input',updateRate);form.addEventListener('submit',e=>e.preventDefault());updateRate();

document.querySelectorAll('.journey-map [data-chapter]').forEach(link=>{
  link.addEventListener('click',()=>{ document.getElementById(link.dataset.chapter).open=true; });
});

document.getElementById('suspensionChoice').addEventListener('change',event=>{
  for(const row of document.querySelectorAll('[data-suspension-pose]'))
    row.hidden=row.dataset.suspensionPose!==event.target.value;
});

document.getElementById('frameChoice').addEventListener('change',event=>{
  for(const row of document.querySelectorAll('[data-frame-option]'))row.hidden=row.dataset.frameOption!==event.target.value;
});
