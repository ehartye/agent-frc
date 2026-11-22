import {analyzeWindow} from '../../scripts/kickoff-window.mjs';
import {makeLiftFaultFixture} from '../../examples/design-methods/make-lift-fault-fixture.mjs';
import {reviewLiftPaths} from '../../scripts/lift-path-faults.mjs';
import {makeActuatorDutyFixture} from '../../examples/design-methods/make-actuator-duty-fixture.mjs';
import {reviewActuatorDuties} from '../../scripts/actuator-duties.mjs';
import {makeSupportFixture} from '../../examples/design-methods/make-support-fixture.mjs';
import {reviewCoupled} from '../../scripts/coupled-support.mjs';
import {makeThroughputCohort} from '../../examples/design-methods/make-throughput-cohort.mjs';
import {tmpdir} from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';
import {reviewElevation,reviewThroughput} from '../../scripts/hardening.mjs';
import {evidenceReader} from '../../scripts/study-evidence.mjs';
import {reviewConcepts} from '../../scripts/design-review.mjs';
import {makeAllianceCompletion} from '../../examples/design-methods/make-alliance-completion.mjs';
import {reviewAllianceCompletion} from '../../scripts/alliance-completion.mjs';
import {buildAllianceReport,buildRoleReport} from '../../scripts/role-design-report.mjs';
import {compareRoles} from '../../scripts/strategy-lab.mjs';
import {createDesign,deriveGeometry} from '../../scripts/design-artifact.mjs';
import {frameDxf} from '../../scripts/frame-dxf.mjs';
import {journeyMap} from './journey.mjs';
import {buildHighlights} from '../../scripts/robot-highlights.mjs';
import { mkdir, readFile, writeFile, copyFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab, rulesModel } from '../../scripts/kickoff.mjs';
import { fieldGeometry } from '../../scripts/field-rehearsal-geometry.mjs';
import { stages, purpose } from './guide.mjs';
import { themeFontFiles } from '../../scripts/theme-fonts.mjs';
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
const studyFolder=path.join(root,'examples/design-methods');
const suspensionInput=JSON.parse(await readFile(path.join(studyFolder,'spatial-elevation.json'),'utf8'));
const suspension=reviewElevation(suspensionInput,evidenceReader(studyFolder)).mechanisms[0];
const suspensionStudy=`<details class="reading"><summary>Can this two-point suspension tip?</summary>
<p>A 20 kg carriage hangs from a diagonal rail. Its supports are one metre apart. Change the load position or remove one support.</p>
<label>Suspended pose <select id="suspensionChoice">${suspension.cases.map((c,i)=>'<option value="'+i+'">'+escape(c.id)+'</option>').join('')}</select></label>
${suspension.cases.map((c,i)=>{
  const b=c.balance,fmt=values=>values.map(n=>n.toFixed(2)).join(', ');
  return '<div data-suspension-pose="'+i+'"'+(i?' hidden':'')+'><p>Vertical reactions: '+fmt(b.loads)+' N.</p><p>Unbalanced moments about X and Y: <strong>'+fmt(b.unbalancedMomentXYNm)+' N·m</strong>. '+(b.momentEquilibrium==='balanced'?'The pose balances. Component capacity is open.':'The carriage can rotate from this pose.')+'</p></div>';
}).join('')}</details>`;
const throughputDir=await mkdtemp(path.join(tmpdir(),'agent-frc-guide-cohort-'));
let throughput,coupled,duties,completion,liftFaults;
try{
  const study=makeThroughputCohort(throughputDir),read=evidenceReader(throughputDir);
  throughput=reviewThroughput(read(study),read);
  const relayDir=path.join(throughputDir,'relay'),relayFile=makeAllianceCompletion(relayDir),readRelay=evidenceReader(relayDir);
  completion=reviewAllianceCompletion(readRelay(relayFile),readRelay);
  const demo=path.join(throughputDir,'spring'),file=makeSupportFixture(demo),readSpring=evidenceReader(demo);
  coupled=reviewCoupled(readSpring(file),readSpring);
  const dutyFolder=path.join(throughputDir,'carriage'),dutyFile=makeActuatorDutyFixture(dutyFolder),readDuty=evidenceReader(dutyFolder);
  duties=reviewActuatorDuties(readDuty(dutyFile),readDuty);
  const liftDir=path.join(throughputDir,'lift-fault'),liftFile=makeLiftFaultFixture(liftDir),readLift=evidenceReader(liftDir);
  liftFaults=reviewLiftPaths(readLift(liftFile),readLift);
}finally{await rm(throughputDir,{recursive:true,force:true});}
const throughputStudy=`<details class="reading"><summary>Can the carrier repeat its delivery rate?</summary>
<p>The tabletop timing model needs two accepted blocks in the first ten seconds of the work phase. The phase begins at match time 20 s. Check how much time an occupied aisle leaves.</p>
<label>Frozen trial <select id="throughputChoice">${throughput.episodes.map((r,i)=>'<option value="'+i+'">'+escape(r.id)+' · '+r.parameters.queueS+' s queue</option>').join('')}</select></label>
${throughput.episodes.map((r,i)=>'<div data-throughput-trial="'+i+'"'+(i?' hidden':'')+'><p>'+escape(r.partition)+' · '+r.windowS.join('–')+' s on the match clock</p><p><strong>'+r.accepted+' of '+throughput.demand.requiredPieces+' required</strong> · '+r.acceptedPerSecond.toFixed(2)+' blocks/s · '+escape(r.status)+'</p></div>').join('')}
<p>The frozen cohort includes all three starts. Each rate uses the entire ten seconds.</p>${link('Run the rate study','docs/mechanism-hardening.md')}</details>`;
const faultExamples=liftFaults.rows.filter(r=>['right-belt-out','both-holders-out','loose-link-and-right-holder-out'].includes(r.case));
const faultLab=`<details class="reading"><summary>Can the other holder catch both sides?</summary>
<p>Trace a broken connection in the two-tier teaching lift. Its shafts sit on the far side of the local belts. Compare attaching the cross-link to the tiers themselves.</p>
<label>Connection and fault <select id="liftFaultChoice">${faultExamples.map((r,i)=>'<option value="'+i+'">'+escape(r.layout+' · '+r.case)+'</option>').join('')}</select></label>
${faultExamples.map((r,i)=>{
  const m=r.motion,[left,right]=m.lastDisplacementMm.map(x=>20+5*x),routes=r.paths.map(s=>s.load+' · '+(s.steps?s.steps.join(' → '):s.status));
  return '<div data-lift-fault="'+i+'"'+(i?' hidden':'')+'><svg role="img" aria-label="Two tier positions at the last paired sample" viewBox="0 0 245 92" width="245" height="92">'+
    '<path d="M18 20H217" stroke="#859baa" stroke-dasharray="4 3"/><path d="M36 '+left+'L195 '+right+'" stroke="#bd8b31" stroke-width="4"/>'+
    '<circle cx="36" cy="'+left+'" r="7" fill="#173d5b"/><circle cx="195" cy="'+right+'" r="7" fill="#173d5b"/></svg>'+
    '<p>Peak racking <strong>'+m.peaks.rackMm.toFixed(2)+' mm</strong> · peak common descent <strong>'+m.peaks.commonDropMm.toFixed(2)+' mm</strong></p>'+
    '<p>'+escape(r.topology)+' · '+escape(m.status)+' over '+m.throughS+' s</p><details><summary>Trace each support to its anchor</summary><ul>'+routes.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></details></div>';
}).join('')}
${link('Run the failure comparison','docs/lift-path-faults.md')}</details>`;
const dutyLab=`<details class="reading"><summary>What happens when the lift jams or loses power?</summary>
<p>This teaching carriage must lift a load, withstand a stop and stay raised for four seconds without power. Try the force switch and latch with a delayed response.</p>
<label>Carriage and condition <select id="dutyChoice">${duties.rows.map((r,i)=>'<option value="'+i+'">'+escape(r.architecture+' · '+r.caseId)+'</option>').join('')}</select></label>
${duties.rows.map((r,i)=>{
  const jam=r.obstruction,hold=r.hold;
  return '<div data-duty-case="'+i+'"'+(i?' hidden':'')+'><p>Powered travel · '+r.normal.status+'</p><p>Obstruction · <strong>'+jam.demand.maxN+' N</strong> against a 90 N teaching limit · '+jam.status+'</p><p>'+
    (jam.responseDelayS==null?'Protection action unresolved.':'Drive disabled '+jam.responseDelayS.toFixed(2)+' s after the trigger.')+'</p><p>Four-second hold · '+hold.status+
    (hold.witnessedLossAtS!=null?' · first observed loss '+(hold.witnessedLossAtS-hold.fromS).toFixed(2)+' s after cutoff':'')+'</p><p>Installed hardware · '+r.installedStatus+'</p></div>';
}).join('')}
${link('Run the three-duty study','docs/actuator-duty-review.md')}</details>`;
const supportLab=`<details class="reading"><summary>Can the guides hold the carrier at this pose?</summary>
<p>Two seats carry the weight. Opposed guides also have to resist rotation. Change one feature of the spring fixture and inspect the force and all three moments.</p>
<label>Load case <select id="coupledChoice">${coupled.cases.map((r,i)=>'<option value="'+i+'">'+escape(r.id)+'</option>').join('')}</select></label>
${coupled.cases.map((r,i)=>'<div data-coupled-case="'+i+'"'+(i?' hidden':'')+'><p>Net force X, Y, Z: '+r.residualForceN.join(', ')+' N</p><p>Residual roll, pitch, yaw: <strong>'+r.residualMomentNm.join(', ')+' N·m</strong></p><p>Lower brace: '+r.reactions[3].magnitudeN+' N on the 28 N classroom envelope · '+escape(r.status)+'</p></div>').join('')}
${link('Review a recorded free body','docs/coupled-support.md')}</details>`;
const captureLab=`<details class="reading"><summary>Inspect the saved CAD still</summary>
<p>Compare the visible outline of this teaching module with the preview inside its saved Fusion archive. The lower wheel and fork must also appear in their registered region.</p>
<label>Inspect <select id="captureChoice"><option value="0">Entire module</option><option value="1">Wheel and fork</option></select></label>
<svg width="300" height="300" viewBox="0 0 1024 1024" role="img" aria-label="Saved Fusion preview with inspection rectangle">
<image width="1024" height="1024" href="module-preview.png"/><rect id="captureRegion" x="2" y="2" width="1020" height="1020" fill="none" stroke="#bd7900" stroke-width="8"/></svg>
<p id="captureNote">Check the assembly silhouette against its saved projection.</p>${link('Check a project capture','docs/cad-capture-review.md')}</details>`;
const rearPlan=deriveGeometry(createDesign()).framePlan;
const squarePlan=deriveGeometry(createDesign({frameProfile:{kind:'square'}})).framePlan;
const frameOptions=[rearPlan,squarePlan].map((plan,i)=>{
  const loops=Object.entries(plan.layerLoops).reverse();
  const fill={cover:'#183650',padding:'#e7ba5c',backing:'#9cb8cb',frame:'#f3f7fa'};
  const shapes=loops.map(([name,points])=>'<polygon fill="'+fill[name]+'" stroke="#2a4757" stroke-width="1" points="'+
    points.map(([x,y])=>[130+250*x,110-250*y].join(',')).join(' ')+'"/>').join('');
  return '<div data-frame-option="'+i+'"'+(i?' hidden':'')+'><svg width="290" height="220" viewBox="0 0 290 220" role="img" aria-label="'+
    (i?'Square frame':'Two diagonal rear corners')+' with backing, padding and cover"><title>Frame and bumper in plan view</title>'+shapes+
    '<text x="245" y="115" fill="#15354a" font-size="12">+X →</text></svg><p>Frame perimeter '+(plan.perimeter*1000).toFixed(1)+' mm · '+
    (i?'Four square corners.':'64 mm rear cutbacks along each axis.')+'</p></div>';
}).join('');
const frameStudy='<details class="reading"><summary>Explore the rear frame corners</summary><p>Look down on a 700 × 640 mm frame. The gold padding follows the backing and cover around both rear corners.</p>'+
  '<label>Frame profile <select id="frameChoice"><option value="0">Rear chamfers</option><option value="1">Square</option></select></label>'+frameOptions+
  '<a href="starter-frame.dxf" download>Download the rear-chamfer Fusion plan (DXF)</a></details>';
const chapter=n=>String(n+1).padStart(2,'0');
const ownedSkills=(await readdir(path.join(root,'skills'),{withFileTypes:true})).filter(v=>v.isDirectory()).map(v=>v.name).sort();
if(ownedSkills.join()!==Object.keys(purpose).sort().join()) throw Error('Update the guide when the skill inventory changes.');
for(const stage of stages){
  for(const skill of stage.skills) if(!purpose[skill]) throw Error('Unknown workflow skill '+skill);
  for(const [,p] of stage.docs) await access(path.join(root,p.split('#')[0]));
}
const highlightsLink='<a href="robot/index.html">Explore the example robot evidence page ↗</a> · <a href="stroke/index.html">Play the jaw and inspect the target event ↗</a> · ';
const chapters=stages.map((s,i)=>`<details id="${s.id}" class="chapter"${i===0?' open':''}>
<summary><span class="ordinal">${chapter(i)}</span><span>${escape(s.name)}</span><span class="toggle" aria-hidden="true"></span></summary>
<div class="chapter-body"><h3>${escape(s.question)}</h3><p>${escape(s.objective)}</p><p>${escape(s.activity)}</p>
<div class="handoff"><h4>Carry forward</h4><p>${escape(s.handoff)}</p></div>${s.docs.some(([,p])=>p==='docs/camera-reference.md')?cameraComparison:''}${s.id==='contract'?serviceComparison:''}${s.id==='design'?frameStudy:''}${s.id==='verify'?suspensionStudy+supportLab+faultLab+dutyLab+throughputStudy+captureLab:''}
<h4>Supporting skills</h4><div class="chips">${s.skills.map(k=>link(k,'skills/'+k+'/SKILL.md')).join('')}</div>
<div class="reading">${s.id==='design'?'<a href="role-design.html">Compare robot designs against a selected match role ↗</a> · <a href="alliance-completion.html">Which robot design wins when the partner is busy? ↗</a> · ':''}${s.id==='verify'?highlightsLink:''}${s.id==='story'?'<a href="field-lab.html#roleLab">Compare alliance roles and replay the field ↗</a> · ':''}${s.id==='rules'?'<a href="rules.json" download>Download the training rules model ↓</a> · ':''}${s.docs.some(([,p])=>p===powerGuide)?'<a href="#power">Try the shared-power comparison ↓</a> · ':''}${s.docs.map(([label,p])=>link(label+' ↗',p)).join(' · ')}</div></div></details>`).join('\n');
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
await writeFile(path.join(output,'starter-frame.dxf'),frameDxf(rearPlan));
await copyFile(path.join(root,'examples/swerve/assembly.png'),path.join(output,'module-preview.png'));
for(const file of ['guide.css','interact.js']) await copyFile(path.join(source,file),path.join(output,file));
// The theme fonts and their OFL licenses, so the guide renders the same on every reader's machine.
await mkdir(path.join(output,'fonts'));
for(const {name,url} of themeFontFiles()) await copyFile(url,path.join(output,'fonts',name));
await writeFile(path.join(output,'rules.json'),JSON.stringify(model,null,2)+'\n');
await buildHighlights(path.join(root,'examples/highlights/project.json'),path.join(output,'robot'));
await buildHighlights(path.join(root,'examples/highlights/stroke-chapter-page.json'),path.join(output,'stroke'));
const roleStudy=JSON.parse(await readFile(path.join(root,'examples/design-methods/alliance.json'),'utf8'));
const selection=JSON.parse(await readFile(path.join(studyFolder,'role-selection.json'),'utf8'));
const architectureStudy=JSON.parse(await readFile(path.join(studyFolder,'role-architectures.json'),'utf8'));
buildAllianceReport(completion,path.join(output,'alliance-completion.html'));
buildRoleReport(reviewConcepts(architectureStudy,evidenceReader(root)),path.join(output,'role-design.html'));
await buildLab(profile,path.join(output,'field-lab.html'),{...compareRoles(profile,roleStudy),files:{profile:selection.profile,study:selection.study}});
console.log('Built '+stages.length+' workflow stages, '+ownedSkills.length+' skills and the current kickoff lab.');
