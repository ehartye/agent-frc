/**
 * @lane merge
 * @subject examples/swerve/check-encoders.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const checker = fileURLToPath(new URL('../examples/swerve/check-encoders.mjs',import.meta.url));
const source = new URL('../examples/swerve/encoder-replay.json',import.meta.url);
const base = JSON.parse(await readFile(source,'utf8'));

function stationarySweep() {
  const modules = base.modules.map((m,i)=>({...m, steerSign:i%2 ? -1 : 1,
    couplingMotorTurnsPerSteerTurn:i<2 ? 1.5 : -.75}));
  const cases = [-1,1].map(sense=>({
    name:'Locked wheels through a full steering turn',fieldVelocityMps:[0,0],
    yawRateRadPerSec:0,gyroDeg:0,pivotM:[0,0],
    frames:Array.from({length:13},(_,i)=>({
      timeS:i*.1,
      readings:modules.map(m=>{
        const azimuth=15+sense*i*30;
        const phase=(m.encoderAtForwardDeg+m.steerSign*azimuth+720)%360;
        const rotor=m.driveSign*m.couplingMotorTurnsPerSteerTurn*azimuth/360;
        return [m.id,phase,rotor];
      })
    }))
  }));
  return {...base,schema:'swerve-encoder-replay/v2',maxSteerRateDegPerS:400,
    phaseResolutionDeg:0,modules,cases};
}

test('raw wheel lock, wrap, polarity, corner identity and timing observability', async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'swerve-replay-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'capture.json');
  for (const [label,change,code] of [
    ['signed full rotations',()=>{},0],
    ['incorrect coupling',r=>{r.modules[0].couplingMotorTurnsPerSteerTurn*=-1;},1],
    ['incorrect steering polarity',r=>{r.modules[2].steerSign*=-1;},1],
    ['exchanged channels with IDs retained',r=>{
      for (const c of r.cases) for (const frame of c.frames) {
        const [a,b] = [frame.readings[0],frame.readings[2]];
        [a[1],b[1]] = [b[1],a[1]];
        [a[2],b[2]] = [b[2],a[2]];
      }
    },1],
    ['out of order',r=>{r.cases[0].frames[0].readings.reverse();},2],
    ['ambiguous wrap',r=>{r.maxSteerRateDegPerS=1801;},2],
    ['duplicate time',r=>{r.cases[0].frames[1].timeS=0;},2],
    ['physically inconsistent rate',r=>{r.maxSteerRateDegPerS=100;},2],
  ]) {
    const replay=stationarySweep();
    change(replay);
    await writeFile(file,JSON.stringify(replay));
    const result=spawnSync(process.execPath,[checker,file],{encoding:'utf8'});
    assert.equal(result.status,code,label+': '+result.stderr);
  }
  assert.equal(spawnSync(process.execPath,[checker]).status,0);
});
