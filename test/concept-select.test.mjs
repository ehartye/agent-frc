/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,readdirSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as select from '../scripts/concept-select.mjs';
import * as page from '../scripts/concept-results-page.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const speed='/drive/topSpeedInS/value',success='/outputs/0/successFraction/value',intake='/inputs/0/secondsPerPiece/value',transfer='/storage/transferS/value';
const curve=(values,base,cut)=>values.map(value=>({value,meanMargin:value===base?5:4,worstMargin:3,competitive:cut(value)}));

// A hand-built concept-results@1 file with known ranges, beside its study and the invented turret concept.
// The turret leads the placer (mean 5 against 4). Its four swept pointers: top speed breaks even above, success
// fraction below, intake time on both sides, and transfer time never.
function project(t,over={}){
  const root=mkdtempSync(path.join(tmpdir(),'concept-select-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const put=(name,bytes)=>{mkdirSync(path.dirname(path.join(root,name)),{recursive:true});writeFileSync(path.join(root,name),bytes);return {file:name,sha256:sha(bytes)};};
  const concept=put('concepts/turret.json',readFileSync(new URL('../examples/concept-bots/turret-shooter.json',import.meta.url)));
  const study=put('study.json',JSON.stringify({schema:'agent-frc/alliance-study@1',side:'blue',roles:[],contexts:[]}));
  const range=(pointer,base,values,range,breakEven,role='turret')=>({role,pointer,label:'assumed',base,runnerUp:role==='turret'?'placer':'turret',
    runnerUpMeanMargin:4,competitiveAtBase:true,range,breakEven,margins:curve(values,base,v=>v>=range[0]&&v<=range[1]),heldAtBase:true,
    statement:'Competitive where the mean margin is at least 4 expected points. Other swept quantities are held at their base values.'});
  const signals={massLbMax:95,inputPorts:1,outputPorts:1,ranged:true,turret:true,adjustableElevation:true,firesWhileMoving:true,assumedShare:27/28};
  const results={schema:'agent-frc/concept-results@1',study:{file:'../study.json',sha256:study.sha256},profile:{file:'../profile.json',sha256:'0'.repeat(64)},
    concepts:[{role:'turret',id:'turret-shooter',file:'../concepts/turret.json',sha256:concept.sha256}],
    side:'blue',contexts:[{id:'open',basis:'An open lane.'},{id:'busy',basis:'A shared lane.'}],plannedMatches:20,
    leader:'turret',leaderDecidedBy:'meanMargin',
    ranking:[
      {rank:1,id:'turret',concept:'turret-shooter',meanMargin:5,worstMargin:3,maximumRegret:0,margins:{open:7,busy:3},costSignals:signals,featureCount:5,pareto:true,
        massLb:{min:75,max:95,label:'assumed',basis:'Default 75–95% of the inspection limit (robot-mass)',default:true}},
      {rank:2,id:'placer',concept:null,meanMargin:4,worstMargin:2,maximumRegret:1,margins:{open:6,busy:2},costSignals:null,featureCount:null,pareto:null,massLb:null}],
    fragility:{fragile:true,flips:[{variant:'turret@'+success+'=0.4',pointer:success,value:0.4,newLeader:'placer'}]},
    competitiveRanges:[
      range(speed,180,[90,135,180,225,270],[90,180],{low:null,high:225}),
      range(success,0.8,[0.4,0.6,0.8,1],[0.6,1],{low:0.4,high:null}),
      range(intake,0.5,[0.25,0.375,0.5,0.625,0.75],[0.375,0.625],{low:0.25,high:0.75}),
      range(transfer,0.75,[0.375,0.75,1.125],[0.375,1.125],{low:null,high:null}),
      range(speed,150,[75,150],[150,150],{low:75,high:null},'placer')],
    axes:[],variants:[],invalidVariants:[],scope:'Invented fixture. Expected points use declared success fractions; no physical reliability is inferred.',...over};
  put('runs/results.json',JSON.stringify(results));
  return root;
}
async function cli(root,args){
  const lines=[];
  const code=await select.main(['runs/results.json',...args],{cwd:root,log:s=>lines.push(s),error:s=>lines.push(s)});
  return {code,out:lines.join('\n')};
}
const readJson=(root,name)=>JSON.parse(readFileSync(path.join(root,name),'utf8'));

test('a selection writes its record and one-sided premises only for pointers with a break-even, plus the mass premise',async t=>{
  const root=project(t);
  const run=await cli(root,['--candidate','turret','--basis','Shoots from range; the student accepts the turret effort.','--out','sel']);
  assert.equal(run.code,0,run.out);
  const selection=readJson(root,'sel/concept-selection.json');
  assert.equal(selection.schema,'agent-frc/concept-selection@1');
  assert.equal(selection.selected,'turret');
  assert.equal(selection.basis,'Shoots from range; the student accepts the turret effort.');
  assert.deepEqual([selection.wasFirst,selection.pareto,selection.fragile],[true,true,true]);
  assert.deepEqual(selection.results,{file:'runs/results.json',sha256:sha(readFileSync(path.join(root,'runs/results.json')))});
  assert.deepEqual(selection.concept,{id:'turret-shooter',file:'concepts/turret.json',sha256:sha(readFileSync(path.join(root,'concepts/turret.json')))});
  assert.deepEqual(selection.ranking.map(r=>r.id),['turret','placer']);
  assert.deepEqual(readdirSync(path.join(root,'sel/premises')).sort(),
    ['turret-shooter.drive.topSpeedInS.json','turret-shooter.inputs.0.secondsPerPiece.json','turret-shooter.massLb.json','turret-shooter.outputs.0.successFraction.json']);
  const premise=name=>readJson(root,'sel/premises/turret-shooter.'+name+'.json');
  const common={scenarioId:'study',phase:'conceptual-design',source:{file:'sel/concept-selection.json'}};
  // Top speed breaks even above: the upper bound is the last competitive value; the lower is the validity limit.
  const top=premise('drive.topSpeedInS');
  assert.deepEqual({scenarioId:top.scenarioId,phase:top.phase,source:top.source},common);
  assert.deepEqual([top.id,top.unit,top.interfaces,top.criterion],['turret-shooter.drive.topSpeedInS','in/s',['drive'],{range:[1,180]}]);
  assert.match(top.basis,/225/);assert.match(top.basis,/placer/);assert.match(top.basis,/held at base/);
  assert.ok(typeof top.scenario==='string' && top.scenario.length>0);
  const fraction=premise('outputs.0.successFraction');
  assert.deepEqual([fraction.unit,fraction.interfaces,fraction.criterion],['1',['shooter'],{range:[0.6,1]}]);
  const handling=premise('inputs.0.secondsPerPiece');
  assert.deepEqual([handling.unit,handling.interfaces,handling.criterion],['s',['front-intake'],{range:[0.375,0.625]}]);
  const mass=premise('massLb');
  assert.deepEqual([mass.unit,mass.interfaces,mass.criterion],['lb',['robot'],{range:[0,95]}]);
  assert.match(mass.basis,/75–95 lb/);assert.match(mass.basis,/assumed/);assert.match(mass.basis,/default/);assert.match(mass.basis,/at most 95 lb/);
  assert.deepEqual(selection.premises.map(p=>p.file).sort(),readdirSync(path.join(root,'sel/premises')).map(f=>'sel/premises/'+f).sort());
});

test('selection input errors exit 2, and --interface renames one interface group',async t=>{
  const root=project(t);
  assert.equal((await cli(root,['--candidate','turret','--out','sel'])).code,2);
  assert.equal((await cli(root,['--candidate','turret','--basis','  ','--out','sel'])).code,2);
  const unknown=await cli(root,['--candidate','nobody','--basis','Why.','--out','sel']);
  assert.equal(unknown.code,2);assert.match(unknown.out,/nobody/);
  const renamed=await cli(root,['--candidate','turret','--basis','Why.','--out','sel','--interface','shooter=launcher']);
  assert.equal(renamed.code,0,renamed.out);
  assert.deepEqual(readJson(root,'sel/premises/turret-shooter.outputs.0.successFraction.json').interfaces,['launcher']);
  assert.deepEqual(readJson(root,'sel/premises/turret-shooter.drive.topSpeedInS.json').interfaces,['drive']);
});

test('a rerun removes the conceptual-design premises of this selection it did not write, and nothing else',async t=>{
  const root=project(t),args=['--candidate','turret','--basis','Why.','--out','sel'];
  assert.equal((await cli(root,args)).code,0);
  const folder=path.join(root,'sel/premises'),written=readdirSync(folder).sort();
  const stale={...readJson(root,'sel/premises/turret-shooter.drive.topSpeedInS.json'),id:'turret-shooter.drive.accelInS2'};
  writeFileSync(path.join(folder,'turret-shooter.drive.accelInS2.json'),JSON.stringify(stale));
  // Controls: an upstream preliminary-design premise, an unrelated JSON file and an unreadable one stay.
  writeFileSync(path.join(folder,'upstream.json'),JSON.stringify({...stale,id:'upstream',phase:'preliminary-design'}));
  writeFileSync(path.join(folder,'notes.json'),JSON.stringify({note:'kept'}));
  writeFileSync(path.join(folder,'broken.json'),'{');
  const rerun=await cli(root,args);
  assert.equal(rerun.code,0,rerun.out);
  assert.match(rerun.out,/Removed stale premise sel\/premises\/turret-shooter\.drive\.accelInS2\.json/);
  assert.deepEqual(readdirSync(folder).sort(),[...written,'broken.json','notes.json','upstream.json'].sort());
});

test('the layout check reads every generated premise; a premise without a unit is rejected',async t=>{
  const root=project(t);
  assert.equal((await cli(root,['--candidate','turret','--basis','Why.','--out','sel'])).code,0);
  const python=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
  execFileSync(python,['-B',fileURLToPath(new URL('./concept_premises_check.py',import.meta.url)),root,'sel/premises'],{stdio:'pipe'});
});

test('the results page shows the ranking, the fragility banner, the context table and a curve per axis, without cells',async t=>{
  const root=project(t),results=readJson(root,'runs/results.json');
  results.comparison={cells:[{events:['EVERY-CELL-MARKER']}]};
  const file=path.join(root,'page.html');
  await page.writeResultsPage(results,file);
  const html=readFileSync(file,'utf8');
  assert.match(html,/id="ranking"/);assert.match(html,/id="fragility"/);assert.match(html,/id="contexts"/);
  assert.equal((html.match(/<svg/g)??[]).length,results.competitiveRanges.length);
  assert.doesNotMatch(html,/EVERY-CELL-MARKER/);
  assert.doesNotMatch(html,/<script[^>]*\bsrc=/);
  // Control: a ranking that is not fragile has no banner.
  await page.writeResultsPage({...results,fragility:{fragile:false,flips:[]}},file);
  assert.doesNotMatch(readFileSync(file,'utf8'),/id="fragility"/);
});
