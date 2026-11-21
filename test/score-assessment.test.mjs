import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadScoreObservations,scoringContext,scoreProfileForOutput} from '../scripts/score-observations.mjs';
import {createScoreAssessment} from '../scripts/score-assessment.mjs';
import {createFieldRehearsal} from '../scripts/field-rehearsal.mjs';
import {createMatchSeries} from '../scripts/rehearsal-series-core.mjs';

const original=JSON.parse(readFileSync(new URL('../examples/kickoff/training-field.json',import.meta.url)));
const trace='e'.repeat(64);
function fixture(){
  const p=structuredClone(original),m=p.rehearsal;
  delete m.endgame;
  const match=m.series.matches[0];
  for(const robot of match.roster){
    robot.plans={Opening:'hold','Main play':'hold'};delete robot.endgame;
    if(robot.slot===1){
      const blue=robot.side==='blue';
      robot.plans[blue?'Opening':'Main play']='place';
      robot.preload={station:robot.side+'-supply',quantity:1};
    }
  }
  m.programs.place={label:'Seat the carried tile',steps:[{label:'Release tile',at:m.starts[0],dwell:.15,
    operation:'attempt',station:{blue:'blue-bay',red:'red-bay'},outcome:'credited'}]};
  for(const s of m.stations.filter(s=>s.kind==='scoring')){
    const [x,y]=m.starts[0];s.at=s.side==='blue'?[x,y]:[p.field.length-x,m.mirror.redY?p.field.width-y:y];s.points={'Opening':6,'Main play':2};
    delete s.activeWindows;
  }
  m.periods=[{name:'Opening',seconds:.5,passiveAfterS:.1},{name:'Main play',seconds:1}];
  m.scoreAssessment={schema:'field-rehearsal/score-assessment@1',clock:'fixture match clock',
    rules:[{id:'opening',category:'seated',phase:'Opening',target:'blue-bay',attributeTo:'release',ruleSha256:trace,
      fromS:0,actionUntilS:.5,passageUntilS:.9,observationUntilS:1.35,entryUntilS:.5}]};
  return {p,m,match};
}
function observed(releasedS){
  const row={id:'one-release',scenario:'trial-1',clock:'fixture match clock',robot:'B1',piece:'blue-supply/1',
    target:'blue-bay',category:'seated',rule:'opening',releasedS,releaseTraceSha256:trace};
  row.observation={releaseId:row.id,clock:row.clock,category:row.category,scenario:row.scenario,
    robot:row.robot,piece:row.piece,target:row.target,result:'met',entryS:.49,passageS:.78,observedS:1.2,traceSha256:trace};
  return row;
}
test('registered release, entry, passage and reported result have independent boundaries',()=>{
  const {m}=fixture(),r=observed(.2),a=createScoreAssessment(m);
  assert.deepEqual(a.judge(r),{status:'credited',pointsPhase:'Opening',reportAtS:1.2});
  for(const [field,value,status] of [['entryS',.51,'outside-entry-window'],['passageS',.91,'outside-assessment-window'],['observedS',1.36,'outside-assessment-window'],['result','failed','missed']]){
    assert.equal(a.judge({...r,observation:{...r.observation,[field]:value}}).status,status);
  }
  assert.equal(a.judge({...r,releasedS:.5}).status,'outside-action-window');
  assert.equal(a.judge({...r,observation:null}).status,'unresolved');
  assert.equal(a.judge({...r,observation:{...r.observation,entryS:null}}).status,'unresolved');
  assert.throws(()=>a.judge({...r,observation:{...r.observation,piece:'other'}}),/differs/);
  assert.throws(()=>a.register([r,r],r.scenario),/Duplicate/);
  m.scoreAssessment.rules[0].attributeTo='passage';assert.equal(createScoreAssessment(m).judge(r).pointsPhase,'Main play');
});
test('live clock holds the named piece until observed and permits unrelated next period play',()=>{
  const {p,m,match}=fixture();
  const probe=createMatchSeries(createFieldRehearsal(p),[match]);
  probe.advance(.5);
  const release=probe.sim.game.events.find(e=>e.robot==='B1' && e.operation==='attempt');
  assert.equal(release.outcome,'unresolved');assert.deepEqual(release.pieces,['blue-supply/1']);
  match.scoreObservations=[observed(release.timeS)];
  const s=createMatchSeries(createFieldRehearsal(p),[match]);
  s.advance(.55);assert.equal(s.sim.phase,'Opening');assert.equal(s.sim.game.score.blue,0);
  assert.equal(s.sim.game.assessment.pending.length,1);assert.equal(s.sim.game.cargo.B1.length,0);
  s.advance(.6);assert.equal(s.sim.phase,'Main play');assert.equal(s.sim.game.score.blue,0);assert.equal(s.sim.game.score.red,2);
  s.advance(.05);assert.equal(s.sim.game.score.blue,6);assert.equal(s.sim.game.assessment.pending.length,0);
  const event=s.sim.game.events.find(e=>e.releaseId && e.points);
  assert.equal(event.creditPhase,'Opening');assert.equal(event.phase,'Main play');assert.equal(event.passageAtS,.78);
  assert.equal(s.sim.game.events.filter(e=>e.releaseId && e.points).length,1);
  s.advance(5);assert.equal(s.done,true);
  const changed=structuredClone(match);changed.roster[3].speed=22;
  const other=createMatchSeries(createFieldRehearsal(p),[changed]);other.advance(5);assert.equal(other.sim.game.score.blue,0);
});


test('a fresh acquisition is required to reuse a scored physical ID',()=>{
  const {m}=fixture(), a=createScoreAssessment(m), r=observed(.1);
  const one={...r,observation:{...r.observation,entryS:.11,passageS:.12,observedS:.13}};
  const two={...r,id:'new release',releasedS:.27,previousReleaseId:one.id,reacquiredS:.25,observation:null};
  assert.equal(a.register([one,two],r.scenario).length,2);
  assert.throws(()=>a.register([one,{...two,reacquiredS:.12}],r.scenario),/intervening/);
  assert.throws(()=>a.register([one,{...two,previousReleaseId:'unrelated'}],r.scenario),/intervening/);
});

test('ordinary profile loading binds the original result, criterion time and match context',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'field-observation-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  function save(file,document){
    const data=JSON.stringify(document);
    writeFileSync(path.join(directory,file),data);
    return {file,sha256:createHash('sha256').update(data).digest('hex')};
  }
  const {p,m,match}=fixture(),row=observed(.2),o=row.observation;
  const manual=save('edition.json',{category:'seated',edition:'training'});
  Object.assign(m.scoreAssessment.rules[0],{source:manual,ruleSha256:manual.sha256});
  const source=save('trace.json',{piece:row.piece,releasedS:row.releasedS,entryS:o.entryS,
    passageS:o.passageS,observedS:o.observedS,result:true});
  const proof=keys=>Object.fromEntries(keys.map(key=>[key,{sha256:source.sha256,pointer:'/'+key}]));
  const action={...row,schema:'field-rehearsal/piece-release@1',sources:[source],witnesses:proof(['piece','releasedS'])};
  delete action.observation;
  const release=save('release.json',action);
  const sensor={...o,schema:'field-rehearsal/criterion-observation@1',sources:[source],
    releaseSha256:release.sha256,witnesses:proof(['piece','entryS','passageS','observedS','result'])};
  const journal={schema:'field-rehearsal/score-journal@1',contextSha256:scoringContext(p,match),clock:row.clock,
    scenario:match.id,roster:match.roster,setup:match.setup};
  async function load(observation){
    match.scoreJournal=save('journal.json',{...journal,attempts:[{release,observation:save('observation.json',observation)}]});
    return loadScoreObservations(structuredClone(p),path.join(directory,'profile.json'));
  }
  const accepted=await load(sensor);
  const [record]=accepted.rehearsal.series.matches[0].scoreObservations;
  assert.equal(createScoreAssessment(m).judge(record).status,'credited');
  const destination=path.join(directory,'exports','model.json');
  const exported=scoreProfileForOutput(accepted,path.join(directory,'profile.json'),destination);
  const roundTrip=await loadScoreObservations(exported,destination);
  assert.deepEqual(roundTrip.rehearsal.series.matches[0].scoreObservations[0],record);
  await assert.rejects(load({...sensor,passageS:o.passageS-.02}),/Source observation disagrees/);
  await assert.rejects(load({...sensor,result:'failed'}),/Source observation disagrees/);
  save('trace.json',{piece:'other ID'});
  await assert.rejects(load(sensor),/Changed score evidence/);
});

test('a one-place target is occupied on physical passage before its scoreboard reports',()=>{
  const {p,m,match}=fixture();
  m.stations.find(s=>s.id==='blue-bay').capacity=1;
  const first=observed(.2);
  Object.assign(first.observation,{passageS:.54,observedS:1.2});
  const second=structuredClone(first);
  Object.assign(second,{id:'second',piece:'blue-supply/2',robot:'B2'});
  Object.assign(second.observation,{releaseId:'second',piece:second.piece,robot:'B2',passageS:.7,observedS:.9});
  const review=(rows)=>createScoreAssessment(m).register(rows,match.id);
  for(const time of [.54,.7]){
    second.observation.passageS=time;
    assert.throws(()=>review([second,first]),/Conflicting physical occupancy/);
    match.scoreObservations=[first,second];
    assert.throws(()=>createMatchSeries(createFieldRehearsal(p),[match]),/Conflicting physical occupancy/);
  }
  first.observation.vacatedS=.7;
  assert.throws(()=>review([first,second]),/Conflicting physical occupancy/);
  first.observation.vacatedS=.65;
  assert.equal(review([second,first]).length,2);
  match.scoreObservations=[first];
  const series=createMatchSeries(createFieldRehearsal(p),[match]);
  series.advance(.55);
  assert.equal(series.sim.game.occupied['blue-bay'],1);
  assert.equal(series.sim.game.score.blue,0);
  series.advance(.15);
  assert.equal(series.sim.game.occupied['blue-bay'],0);
  series.advance(.5);
  assert.equal(series.sim.game.score.blue,6);
  assert.equal(series.sim.game.occupied['blue-bay'],0);
});
