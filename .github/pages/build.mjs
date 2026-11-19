import { mkdir, readFile, writeFile, copyFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab, rulesModel } from '../../scripts/kickoff.mjs';
import { fieldGeometry } from '../../scripts/field-rehearsal-geometry.mjs';
import { stages, purpose } from './guide.mjs';
import { reviewPower } from '../../scripts/power-review.mjs';

const source=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(source,'../..');
const output=path.resolve(process.argv[2] || path.join(root,'artifacts/workflow-guide'));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const repo='https://github.com/ehartye/agent-frc';
const link=(label,pathname)=>'<a href="'+repo+'/blob/main/'+pathname+'">'+escape(label)+'</a>';
const powerGuide='docs/shared-power-review.md';
const power = await reviewPower(path.join(root,'examples/power/comparison.json'));
const powerOptions = power.trials.map(t=>'<option value="'+escape(t.id)+'">'+escape(t.condition)+'</option>').join('');
const powerResults = power.trials.map((trial,i)=>{
  const v=trial.limiting;
  const amps=v.currents.filter(c=>c.kind==='source').map(c=>escape(c.id)+' '+c.valueA+' A').join(' · ');
  const margin=Math.round(v.marginV*100)/100;
  return `<div data-power-trial="${escape(trial.id)}"${i?' hidden':''}>
    <div class="readout"><div><strong>${v.valueV} V</strong><span>at carriage inlet</span></div>
    <div><strong>${margin>0?'+':''}${margin} V</strong><span>margin to required floor</span></div></div>
    <p>At ${v.fromS}–${v.toS} s · ${amps}.</p><p>${escape(trial.outcome.description)}.</p></div>`;
}).join('');
const chapter=n=>String(n+1).padStart(2,'0');
const ownedSkills=(await readdir(path.join(root,'skills'),{withFileTypes:true})).filter(v=>v.isDirectory()).map(v=>v.name).sort();
if(ownedSkills.join()!==Object.keys(purpose).sort().join()) throw Error('Update the guide when the skill inventory changes.');
for(const stage of stages){
  for(const skill of stage.skills) if(!purpose[skill]) throw Error('Unknown workflow skill '+skill);
  for(const [,p] of stage.docs) await access(path.join(root,p));
}
const chapters=stages.map((s,i)=>`<details id="${s.id}" class="chapter"${i===0?' open':''}>
<summary><span class="ordinal">${chapter(i)}</span><span>${escape(s.name)}</span><span class="toggle" aria-hidden="true"></span></summary>
<div class="chapter-body"><h3>${escape(s.question)}</h3><p>${escape(s.objective)}</p><p>${escape(s.activity)}</p>
<div class="handoff"><h4>Carry forward</h4><p>${escape(s.handoff)}</p></div>
<h4>Supporting skills</h4><div class="chips">${s.skills.map(k=>link(k,'skills/'+k+'/SKILL.md')).join('')}</div>
<div class="reading">${s.id==='rules'?'<a href="rules.json" download>Download the training rules model ↓</a> · ':''}${s.docs.some(([,p])=>p===powerGuide)?'<a href="#power">Try the shared-power comparison ↓</a> · ':''}${s.docs.map(([label,p])=>link(label+' ↗',p)).join(' · ')}</div></div></details>`).join('\n');
const directory=Object.keys(purpose).map(k=>{
  const uses=stages.filter(s=>s.skills.includes(k));
  if(!uses.length) throw Error('Skill lacks a workflow stage: '+k);
  return `<div class="skill" data-stages="${uses.map(s=>s.id).join(' ')}"><h3>${link(k,'skills/'+k+'/SKILL.md')}</h3><p>${escape(purpose[k])}</p><div class="used">${uses.map(s=>'<a href="#'+s.id+'">'+escape(s.name)+'</a>').join(' · ')}</div></div>`;
}).join('\n');
const style=await readFile(path.join(source,'site.html'),'utf8');
const profile=JSON.parse(await readFile(path.join(root,'examples/kickoff/training-field.json'),'utf8'));
const model=rulesModel(profile);
const geo=fieldGeometry(profile);
const diagram={field:model.field,boundary:geo.boundary,obstacles:geo.obstacles(),body:model.rehearsal.defaults,
  route:model.routeHypotheses[0].routeIn};
const page=style.replace('<!-- chapters -->',()=>chapters).replace('<!-- skills -->',()=>directory)
  .replace('<!-- power options -->',()=>powerOptions).replace('<!-- power results -->',()=>powerResults)
  .replace('<!-- stage options -->',()=>stages.map(s=>'<option value="'+s.id+'">'+escape(s.name)+'</option>').join(''))
  .replace('/* field model */',()=>JSON.stringify(diagram).replaceAll('<','\\u003c'));
await mkdir(output,{recursive:true});
if((await readdir(output)).length) throw Error('Choose an empty output folder for the workflow guide.');
await writeFile(path.join(output,'index.html'),page);
for(const file of ['guide.css','interact.js']) await copyFile(path.join(source,file),path.join(output,file));
await writeFile(path.join(output,'rules.json'),JSON.stringify(model,null,2)+'\n');
await buildLab(profile,path.join(output,'field-lab.html'));
console.log('Built '+stages.length+' workflow stages, '+ownedSkills.length+' skills and the current kickoff lab.');
