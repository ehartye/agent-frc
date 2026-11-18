import { mkdir, readFile, writeFile, copyFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab, rulesModel } from '../../scripts/kickoff.mjs';
import { stages, purpose } from './guide.mjs';

const source=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(source,'../..');
const output=path.resolve(process.argv[2] || path.join(root,'artifacts/workflow-guide'));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const repo='https://github.com/ehartye/agent-frc';
const link=(label,pathname)=>'<a href="'+repo+'/blob/main/'+pathname+'">'+escape(label)+'</a>';
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
<div class="reading">${s.id==='rules'?'<a href="rules.json" download>Download the 2025 rules model ↓</a> · ':''}${s.docs.map(([label,p])=>link(label+' ↗',p)).join(' · ')}</div></div></details>`).join('\n');
const directory=Object.keys(purpose).map(k=>{
  const uses=stages.filter(s=>s.skills.includes(k));
  if(!uses.length) throw Error('Skill lacks a workflow stage: '+k);
  return `<div class="skill" data-stages="${uses.map(s=>s.id).join(' ')}"><h3>${link(k,'skills/'+k+'/SKILL.md')}</h3><p>${escape(purpose[k])}</p><div class="used">${uses.map(s=>'<a href="#'+s.id+'">'+escape(s.name)+'</a>').join(' · ')}</div></div>`;
}).join('\n');
const style=await readFile(path.join(source,'site.html'),'utf8');
const profile=JSON.parse(await readFile(path.join(root,'case-studies/2025/kickoff-field.json'),'utf8'));
const page=style.replace('<!-- chapters -->',()=>chapters).replace('<!-- skills -->',()=>directory)
  .replace('<!-- stage options -->',()=>stages.map(s=>'<option value="'+s.id+'">'+escape(s.name)+'</option>').join(''))
  .replace('/* field model */',()=>JSON.stringify({field:profile.field,landmarks:profile.landmarks}).replaceAll('<','\\u003c'));
await mkdir(output,{recursive:true});
if((await readdir(output)).length) throw Error('Choose an empty output folder for the workflow guide.');
await writeFile(path.join(output,'index.html'),page);
for(const file of ['guide.css','interact.js']) await copyFile(path.join(source,file),path.join(output,file));
await writeFile(path.join(output,'rules.json'),JSON.stringify(rulesModel(profile),null,2)+'\n');
await buildLab(profile,path.join(output,'field-lab.html'));
console.log('Built '+stages.length+' workflow stages, '+ownedSkills.length+' skills and the current kickoff lab.');
