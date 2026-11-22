import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stepPose} from '../scripts/rehearsal-step-pose.mjs';

const example=fileURLToPath(new URL('../examples/kickoff/training-field.json',import.meta.url));
const script=fileURLToPath(new URL('../scripts/rehearsal-step-pose.mjs',import.meta.url));

function variant(t,edit) {
  const root=mkdtempSync(path.join(tmpdir(),'step-pose-'));t.after(()=>rmSync(root,{force:true,recursive:true}));
  const profile=JSON.parse(readFileSync(example));edit(profile);
  const file=path.join(root,'field.json');writeFileSync(file,JSON.stringify(profile,null,2));return file;
}

test('a delivery step resolves on each alliance and reports its stand-off from the scoring station',async t=>{
  const blue=await stepPose(variant(t,p=>{p.rehearsal.programs.shuttle.steps[1].at=[175,174];}),'trial-1','B1','Main play',1);
  assert.deepEqual([blue.label,blue.operation,blue.station,blue.stationKind],['Deliver to bay','attempt','blue-bay','scoring']);
  assert.deepEqual(blue.pointIn,[175,174]);assert.equal(blue.standoffIn,20);
  assert.equal(blue.footprint.status,'clear');
  // The alliance-frame step mirrors onto the red bay at the same stand-off.
  const red=await stepPose(variant(t,p=>{p.rehearsal.programs.shuttle.steps[1].at=[175,174];}),'trial-1','R1','Main play',1);
  assert.equal(red.station,'red-bay');assert.deepEqual(red.pointIn,[305,90]);assert.equal(red.standoffIn,20);
});

test('a footprint across the field boundary or inside an obstacle is blocked',async t=>{
  const wall=await stepPose(variant(t,p=>{p.rehearsal.programs.shuttle.steps[1].at=[175,254];}),'trial-1','B1','Main play',1);
  assert.deepEqual(wall.footprint,{status:'blocked',obstacle:'North guardrail'});assert.equal(wall.standoffIn,60);
  const pedestal=await stepPose(variant(t,p=>{p.rehearsal.programs.shuttle.steps[1].at=[150,132];}),'trial-1','B1','Main play',1);
  assert.deepEqual(pedestal.footprint,{status:'blocked',obstacle:'West pedestal'});
});

test('the command line rejects an unknown match, robot, period or step',t=>{
  const file=variant(t,()=>{});
  const run=(...args)=>()=>execFileSync(process.execPath,[script,file,...args],{stdio:'pipe'});
  assert.equal(JSON.parse(run('trial-1','B1','Main play','1')()).schema,'agent-frc/rehearsal-step-pose@1');
  assert.throws(run('missing','B1','Main play','1'),/Select one rehearsal match/);
  assert.throws(run('trial-1','B9','Main play','1'),/Select one rostered robot/);
  assert.throws(run('trial-1','B1','Overtime','1'),/Select one rehearsal period/);
  assert.throws(run('trial-1','B1','Main play','7'),/Select one program step/);
});

test('a station listing covers every attempt one robot makes there across the series',async t=>{
  const {stationPoses}=await import('../scripts/rehearsal-step-pose.mjs');
  const file=variant(t,p=>{p.rehearsal.programs.shuttle.steps[1].at=[175,184];});
  const listed=await stationPoses(file,'B1','blue-bay');
  assert.equal(listed.schema,'agent-frc/rehearsal-station-poses@1');
  assert.deepEqual(listed.matches,['trial-1','trial-2','trial-3']);
  // B1 shuttles in both periods of the first match and in the second period of the others.
  assert.deepEqual(listed.attempts.map(a=>a.match+'/'+a.period),['trial-1/Opening','trial-1/Main play','trial-2/Main play','trial-3/Main play']);
  assert.ok(listed.attempts.every(a=>a.standoffIn===10 && a.footprint.status==='clear'));
  assert.deepEqual((await stationPoses(file,'B1','red-bay')).attempts,[]);
  const cli=JSON.parse(execFileSync(process.execPath,[script,file,'--station','R1','red-bay']));
  assert.equal(cli.attempts.length,4);assert.deepEqual(cli.attempts[0].pointIn,[305,80]);
});
