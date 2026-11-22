import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadScoreObservations} from './score-observations.mjs';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {validateProfile} from './kickoff.mjs';

// Resolve one program step for one rostered robot and screen its footprint there with the rehearsal's own geometry.
export async function stepPose(source,matchId,actorId,period,stepIndex) {
  const bytes=await readFile(source),profile=validateProfile(await loadScoreObservations(JSON.parse(bytes),source));
  const engine=createFieldRehearsal(profile),model=profile.rehearsal;
  const matches=(model.series?.matches ?? []).filter(m=>m.id===matchId);
  if(matches.length!==1)throw Error('Select one rehearsal match');
  const robot=engine.completeRoster(matches[0].roster).find(r=>r.id===actorId);
  if(!robot)throw Error('Select one rostered robot');
  if(!engine.periods.some(p=>p.name===period))throw Error('Select one rehearsal period');
  const program=model.programs[robot.plans[period]];
  const steps=program.byPeriod?.[period] || program.steps;
  if(!Number.isSafeInteger(stepIndex) || stepIndex<0 || stepIndex>=steps.length)throw Error('Select one program step');
  const step=steps[stepIndex],setup=matches[0].setup ?? model.setups[0];
  const station=typeof step.station==='string'?step.station:step.station?.[robot.side] ?? null;
  const target=(model.stations ?? []).find(s=>s.id===station) ?? null;
  const point=engine.waypoint(step,robot.side,robot.slot);
  // A zero-length sweep at the commanded point is the same wall and obstacle test the route planner applies first.
  const contact=engine.geom.hit(point,point,robot,setup);
  return {schema:'agent-frc/rehearsal-step-pose@1',profileSha256:createHash('sha256').update(bytes).digest('hex'),
    match:matchId,actor:actorId,period,program:robot.plans[period],stepIndex,label:step.label,operation:step.operation ?? null,
    station,stationKind:target?.kind ?? null,setup,pointIn:point,
    standoffIn:target?Math.hypot(point[0]-target.at[0],point[1]-target.at[1]):null,
    footprint:contact?{status:'blocked',obstacle:contact.name}:{status:'clear',obstacle:null}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [source,match,actor,period,index,...extra]=process.argv.slice(2);
    if(!source || index===undefined || extra.length || !/^\d+$/.test(index))
      throw Error('Usage: rehearsal-step-pose.mjs PROFILE.json MATCH ACTOR PERIOD STEP_INDEX');
    process.stdout.write(JSON.stringify(await stepPose(source,match,actor,period,Number(index)),null,2)+'\n');
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
