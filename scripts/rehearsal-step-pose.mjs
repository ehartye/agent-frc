import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadScoreObservations} from './score-observations.mjs';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {validateProfile} from './kickoff.mjs';

async function load(source) {
  const bytes=await readFile(source),profile=validateProfile(await loadScoreObservations(JSON.parse(bytes),source));
  return {profile,engine:createFieldRehearsal(profile),sha256:createHash('sha256').update(bytes).digest('hex')};
}

function stepsOf(model,robot,period) {
  const program=model.programs[robot.plans[period]];
  return program.byPeriod?.[period] || program.steps;
}

// Resolve one authored step for one rostered robot and screen its footprint there with the rehearsal's own geometry.
function resolve({profile,engine},match,robot,period,stepIndex) {
  const model=profile.rehearsal,step=stepsOf(model,robot,period)[stepIndex],setup=match.setup ?? model.setups[0];
  const station=typeof step.station==='string'?step.station:step.station?.[robot.side] ?? null;
  const target=(model.stations ?? []).find(s=>s.id===station) ?? null;
  const point=engine.waypoint(step,robot.side,robot.slot);
  // A zero-length sweep at the commanded point is the same wall and obstacle test the route planner applies first.
  const contact=engine.geom.hit(point,point,robot,setup);
  return {match:match.id,actor:robot.id,period,program:robot.plans[period],stepIndex,label:step.label,operation:step.operation ?? null,
    station,stationKind:target?.kind ?? null,setup,pointIn:point,
    standoffIn:target?Math.hypot(point[0]-target.at[0],point[1]-target.at[1]):null,
    footprint:contact?{status:'blocked',obstacle:contact.name}:{status:'clear',obstacle:null}};
}

function rostered(engine,model,matchId,actorId) {
  const matches=(model.series?.matches ?? []).filter(m=>m.id===matchId);
  if(matches.length!==1)throw Error('Select one rehearsal match');
  const robot=engine.completeRoster(matches[0].roster).find(r=>r.id===actorId);
  if(!robot)throw Error('Select one rostered robot');
  return [matches[0],robot];
}

export async function stepPose(source,matchId,actorId,period,stepIndex) {
  const loaded=await load(source),{profile,engine}=loaded;
  const [match,robot]=rostered(engine,profile.rehearsal,matchId,actorId);
  if(!engine.periods.some(p=>p.name===period))throw Error('Select one rehearsal period');
  const steps=stepsOf(profile.rehearsal,robot,period);
  if(!Number.isSafeInteger(stepIndex) || stepIndex<0 || stepIndex>=steps.length)throw Error('Select one program step');
  return {schema:'agent-frc/rehearsal-step-pose@1',profileSha256:loaded.sha256,...resolve(loaded,match,robot,period,stepIndex)};
}

// Every scoring attempt the actor's programs make at one station, in every period of every series match.
export async function stationPoses(source,actorId,station) {
  const loaded=await load(source),{profile,engine}=loaded,model=profile.rehearsal;
  const matches=model.series?.matches ?? [];
  if(!matches.length)throw Error('Select a profile with a rehearsal series');
  const attempts=[];
  for(const match of matches){
    const [,robot]=rostered(engine,model,match.id,actorId);
    for(const {name} of engine.periods)stepsOf(model,robot,name).forEach((step,index)=>{
      const pose=resolve(loaded,match,robot,name,index);
      if(pose.operation==='attempt' && pose.station===station)attempts.push(pose);
    });
  }
  return {schema:'agent-frc/rehearsal-station-poses@1',profileSha256:loaded.sha256,actor:actorId,station,
    matches:matches.map(m=>m.id),attempts};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    let result;
    if(args[1]==='--station' && args.length===4)result=await stationPoses(args[0],args[2],args[3]);
    else {
      const [source,match,actor,period,index,...extra]=args;
      if(!source || index===undefined || extra.length || !/^\d+$/.test(index))
        throw Error('Usage: rehearsal-step-pose.mjs PROFILE.json MATCH ACTOR PERIOD STEP_INDEX | PROFILE.json --station ACTOR STATION');
      result=await stepPose(source,match,actor,period,Number(index));
    }
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
