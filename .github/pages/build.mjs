import {analyzeWindow} from '../../scripts/kickoff-window.mjs';
import {compareRoles} from '../../scripts/strategy-lab.mjs';
import {journeyMap} from './journey.mjs';
import {buildHighlights} from '../../scripts/robot-highlights.mjs';
import { mkdir, readFile, writeFile, copyFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab, rulesModel } from '../../scripts/kickoff.mjs';
import { fieldGeometry } from '../../scripts/field-rehearsal-geometry.mjs';
import { stages, purpose } from './guide.mjs';
import { reviewPower } from '../../scripts/power-review.mjs';
import { review as reviewCamera } from '../../examples/sensor-study/camera-reference.mjs';

const source=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(source,'../..');
const output=path.resolve(process.argv[2] || path.join(root,'artifacts/workflow-guide'));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const repo='https://github.com/ehartye/agent-frc';
const link=(label,pathname)=>'<a href="'+repo+'/blob/main/'+pathname+'">'+escape(label)+'</a>';
const powerGuide='docs/shared-power-review.md';
const cameraStudy = JSON.parse(await readFile(path.join(root,'examples/sensor-study/camera-frames.json'),'utf8'));
const retentionStates = JSON.parse(await readFile(path.join(root,'examples/sensor-study/retention-states.json'),'utf8'));
const trayView = study => reviewCamera(study).find(frame => frame.frame === 'tray-backed');
const position = trayView(cameraStudy);
const retention = trayView({...cameraStudy, states: retentionStates});
const cameraComparison = `<details class="reading"><summary>Could the design premise be wrong?</summary>
<p>A camera sees a part sitting on a moving tray. Does that image prove the tray can hold it through a turn?</p>
<p>Checking position gives <strong>${escape(position.decision)}</strong>. Include a loose part with the same outline and the same image gives <strong>${escape(retention.decision)}</strong>. Both ${retention.possible.map(escape).join(' and ')} fit.</p>
<p>Compare a better camera view with sensing grip or changing how the tray captures the part. Test which one distinguishes the failure.</p>
${link('Run the comparison','docs/camera-reference.md')}</details>`;
const serviceWindow = {stock:12, opening:7, incoming:0, arrival:0, goal:7, cycle:1.5,
  travel:0, setup:0, window:6, delivery:'loaded-batch', carryCapacity:12, cap:null, points:1};
const serviceComparison = `<details class="reading"><summary>Can a twelve-piece hopper deliver seven pieces in six seconds?</summary>
<p>Seven pieces can reach the outlet. For each, the gate needs 0.25 s, the transfer 0.50 s and the receiver 0.75 s. Count a handoff when the receiver accepts the piece.</p>
<ul><li>One interlock runs the stages in sequence: <strong>${analyzeWindow(serviceWindow).delivered} handoffs</strong>.</li>
<li>Independent stages overlap: <strong>${analyzeWindow({...serviceWindow, setup:0.75, cycle:0.75}).delivered} handoffs</strong>. The first takes 1.50 s. The receiver then accepts one every 0.75 s.</li>
<li>A fixed guide closes the port: <strong>${analyzeWindow({...serviceWindow, opening:0}).delivered} handoffs</strong>.</li></ul>
<p>Which two consecutive pieces would you track to test the overlap? Record their port crossings, receiver signals and reset times.</p></details>`;
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
const regulator = await reviewPower(path.join(root,'examples/power/regulator/comparison.json'));
const regulatorResults = regulator.trials.map(trial => {
  const inlet = trial.upper[0];
  return '<li><strong>' + escape(trial.condition) + '</strong> gives a ' + inlet.evidence.valueV.toFixed(2) +
    ' V upper bound. ' + escape(inlet.reason) + '.</li>';
}).join('');
const chapter=n=>String(n+1).padStart(2,'0');
const ownedSkills=(await readdir(path.join(root,'skills'),{withFileTypes:true})).filter(v=>v.isDirectory()).map(v=>v.name).sort();
if(ownedSkills.join()!==Object.keys(purpose).sort().join()) throw Error('Update the guide when the skill inventory changes.');
for(const stage of stages){
  for(const skill of stage.skills) if(!purpose[skill]) throw Error('Unknown workflow skill '+skill);
  for(const [,p] of stage.docs) await access(path.join(root,p));
}
const highlightsLink='<a href="robot/index.html">Explore the example robot evidence page ↗</a> · <a href="stroke/index.html">Play the jaw and inspect the target event ↗</a> · ';
const chapters=stages.map((s,i)=>`<details id="${s.id}" class="chapter"${i===0?' open':''}>
<summary><span class="ordinal">${chapter(i)}</span><span>${escape(s.name)}</span><span class="toggle" aria-hidden="true"></span></summary>
<div class="chapter-body"><h3>${escape(s.question)}</h3><p>${escape(s.objective)}</p><p>${escape(s.activity)}</p>
<div class="handoff"><h4>Carry forward</h4><p>${escape(s.handoff)}</p></div>${s.docs.some(([,p])=>p==='docs/camera-reference.md')?cameraComparison:''}${s.id==='contract'?serviceComparison:''}
<h4>Supporting skills</h4><div class="chips">${s.skills.map(k=>link(k,'skills/'+k+'/SKILL.md')).join('')}</div>
<div class="reading">${s.id==='verify'?highlightsLink:''}${s.id==='story'?'<a href="field-lab.html#roleLab">Compare alliance roles and replay the field ↗</a> · ':''}${s.id==='rules'?'<a href="rules.json" download>Download the training rules model ↓</a> · ':''}${s.docs.some(([,p])=>p===powerGuide)?'<a href="#power">Try the shared-power comparison ↓</a> · ':''}${s.docs.map(([label,p])=>link(label+' ↗',p)).join(' · ')}</div></div></details>`).join('\n');
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
const page=style.replace('<!-- journey map -->',()=>journeyMap(stages,false,escape)+journeyMap(stages,true,escape)).replace('<!-- chapters -->',()=>chapters).replace('<!-- skills -->',()=>directory)
  .replace('<!-- regulator results -->',()=>regulatorResults)
  .replace('<!-- power options -->',()=>powerOptions).replace('<!-- power results -->',()=>powerResults)
  .replace('<!-- stage options -->',()=>stages.map(s=>'<option value="'+s.id+'">'+escape(s.name)+'</option>').join(''))
  .replace('/* field model */',()=>JSON.stringify(diagram).replaceAll('<','\\u003c'));
await mkdir(output,{recursive:true});
if((await readdir(output)).length) throw Error('Choose an empty output folder for the workflow guide.');
await writeFile(path.join(output,'index.html'),page);
for(const file of ['guide.css','interact.js']) await copyFile(path.join(source,file),path.join(output,file));
await writeFile(path.join(output,'rules.json'),JSON.stringify(model,null,2)+'\n');
await buildHighlights(path.join(root,'examples/highlights/project.json'),path.join(output,'robot'));
await buildHighlights(path.join(root,'examples/highlights/stroke-chapter-page.json'),path.join(output,'stroke'));
const roleStudy=JSON.parse(await readFile(path.join(root,'examples/design-methods/alliance.json'),'utf8'));
await buildLab(profile,path.join(output,'field-lab.html'),compareRoles(profile,roleStudy));
console.log('Built '+stages.length+' workflow stages, '+ownedSkills.length+' skills and the current kickoff lab.');
