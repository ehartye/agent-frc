import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateProfile,buildLab} from './kickoff.mjs';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {createMatchSeries} from './rehearsal-series-core.mjs';

const label = value => typeof value === 'string' && value.trim().length > 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function studyRows(rows, name, minimum = 1, maximum = 32) {
  if (!Array.isArray(rows) || rows.length < minimum || rows.length > maximum ||
      rows.some(row => !row || !label(row.id)) || new Set(rows.map(row => row.id)).size !== rows.length)
    throw Error('Expected '+minimum+'–'+maximum+' distinct '+name+' IDs.');
  return rows;
}

export function compareRoles(profile, study) {
  validateProfile(profile);
  const engine = createFieldRehearsal(profile);
  if (study?.schema !== 'agent-frc/alliance-study@1' || !['blue','red'].includes(study.side) ||
      !Array.isArray(profile.rehearsal?.series?.matches))
    throw Error('Supply an alliance study and a rules profile with published match rosters.');
  if (new Set(profile.rehearsal.series.matches.map(row=>row.id)).size!==profile.rehearsal.series.matches.length)
    throw Error('Published match IDs must be unique.');
  const roles = studyRows(study.roles, 'role', 2, 12);
  const contexts = studyRows(study.contexts, 'context', 2, 16);
  const side = study.side, opponent = side === 'blue' ? 'red' : 'blue';
  const duration = engine.periods.reduce((sum,p) => sum+engine.phaseSeconds(p.name),0);
  const cells = [];
  for (const context of contexts) {
    const match = profile.rehearsal.series.matches.find(row => row.id === context.match);
    if (!match || !label(context.basis) || !Number.isInteger(context.slot) ||
        match.roster.filter(row => row.side === side && row.slot === context.slot).length !== 1)
      throw Error('Context '+context.id+' must name a published match, a single focal roster slot and a basis.');
    for (const role of roles) {
      if (!label(role.basis) || !role.plans || typeof role.plans!=='object' || Array.isArray(role.plans) ||
          !Object.entries(role.plans).every(([phase,program])=>engine.periods.some(p=>p.name===phase) && Object.hasOwn(engine.behaviors,program)))
        throw Error('Role '+role.id+' requires a basis and registered phase overrides.');
      const roster = structuredClone(match.roster);
      const peers=context.peers??[];
      if(!Array.isArray(peers)||peers.length>5 || new Set(peers.map(p=>p.side+'/'+p.slot)).size!==peers.length)
        throw Error('Use distinct context peer slots.');
      for(const peer of peers){
        if(peer.side===side&&peer.slot===context.slot)throw Error('Context peer replaces focal robot.');
        const i=roster.findIndex(row=>row.side===peer.side&&row.slot===peer.slot);
        if(i<0)roster.push(structuredClone(peer));else roster[i]={...roster[i],...peer};
      }
      const focal = roster.find(row => row.side === side && row.slot === context.slot);
      focal.plans = {...focal.plans,...role.plans};
      if (Object.hasOwn(role, 'endgame')) {
        if (role.endgame === null) delete focal.endgame;
        else {
          if (!profile.rehearsal.endgame || !role.endgame || typeof role.endgame !== 'object' || Array.isArray(role.endgame))
            throw Error('Role '+role.id+' requires a configured terminal objective.');
          focal.endgame = role.endgame;
        }
      }
      const run = createMatchSeries(engine,[{...match,roster}]);
      run.advance(duration);
      if (!run.done) throw Error('Incomplete match clock.');
      const {game,periods,setup} = run.results[0];
      const byRobot = periods.flatMap(period=>period.robots.map(robot=>{
        const actions = game.events.filter(ev=>ev.phase===period.phase && ev.robot===robot.id);
        const tally = {};
        for (const ev of actions) {
          const key=ev.operation+'/'+ev.outcome;
          tally[key] ??= {events:0,pieces:0,points:0};
          tally[key].events++; tally[key].pieces+=ev.pieces.length; tally[key].points+=ev.points??0;
        }
        return {id:robot.id,phase:period.phase,seconds:period.seconds,waitS:robot.waitSeconds,
          travelIn:robot.travelIn,tally,acceptedPerSecond:(tally['attempt/credited']?.pieces??0)/period.seconds};
      }));
      cells.push({context:context.id, match:match.id, role:role.id, setup, focal, roster:run.match.roster, periods, byRobot,
        score:game.score, ordinary:game.endgame?.ordinaryScore ?? game.score,
        terminal:game.endgame?.terminalScore ?? {blue:0,red:0},
        occupied:game.occupied, attempts:game.attempts, events:game.events, endgame:game.endgame ?? null,
        margin:game.score[side]-game.score[opponent]});
    }
  }
  const best = new Map(contexts.map(c=>[c.id,Math.max(...cells.filter(r=>r.context===c.id).map(r=>r.margin))]));
  for (const cell of cells) cell.regret = best.get(cell.context)-cell.margin;
  for (const cell of cells) {
    const baseline=cells.find(peer=>peer.context===cell.context && peer.role===roles[0].id);
    cell.marginalAlliancePoints=cell.score[side]-baseline.score[side];
    cell.marginChange=cell.margin-baseline.margin;
  }
  const summaries = roles.map(role=>{
    const row = cells.filter(cell=>cell.role===role.id);
    return {id:role.id,basis:role.basis,worstMargin:Math.min(...row.map(s=>s.margin)),
      maximumRegret:Math.max(...row.map(s=>s.regret))};
  });
  const tippingPoints=[];
  for(let x=0;x<contexts.length;x++)for(let y=x+1;y<contexts.length;y++){
    const pair=[contexts[x].id,contexts[y].id];
    const payoff=(role,context)=>cells.find(c=>c.context===context&&c.role===role.id).margin;
    for(let a=0;a<roles.length;a++)for(let b=a+1;b<roles.length;b++){
      const gaps=pair.map(c=>payoff(roles[a],c)-payoff(roles[b],c));
      if(gaps[0]*gaps[1]<0)tippingPoints.push({contexts:pair,roles:[roles[a].id,roles[b].id],
        shareOfSecondContext:gaps[0]/(gaps[0]-gaps[1]),marginDifferences:gaps});
    }
  }
  const maximin = Math.max(...summaries.map(r=>r.worstMargin));
  const minimaxRegret = Math.min(...summaries.map(r=>r.maximumRegret));
  return {schema:'agent-frc/alliance-comparison@1', game:profile.game, edition:profile.edition, side,
    contexts, cells, tippingPoints, roles:summaries, maximin:summaries.filter(r=>r.worstMargin===maximin).map(r=>r.id),
    minimaxRegret:summaries.filter(r=>r.maximumRegret===minimaxRegret).map(r=>r.id),
    scope:'Prescribed field behavior and scoring criteria for the supplied match contexts. No opponent probability or physical scoring reliability is inferred.'};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [profile,study,...extra]=process.argv.slice(2);
    if (!study || (extra.length && !(extra.length===4 && extra[0]==='--replay') && !(extra.length===2 && extra[0]==='--html'))) throw Error('Usage: strategy-lab.mjs PROFILE.json STUDY.json [--html NEW_LAB.html | --replay ROLE CONTEXT NEW_PROFILE.json]');
    const [p,s]=[profile,study].map(f=>readFileSync(f));
    const decode = b => JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
    const profileData=decode(p),comparison=compareRoles(profileData,decode(s));
    if(extra[0]==='--html'){
      const files=[profile,study].map(f=>path.resolve(f));
      const within=(base,file)=>{const rel=path.relative(base,file);return !path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
      let base=process.cwd();
      if(!files.every(f=>within(base,f))){
        base=path.dirname(files[0]);
        while(!files.every(f=>within(base,f))&&base!==path.dirname(base))base=path.dirname(base);
      }
      if(files.every(f=>within(base,f))){
        comparison.files=Object.fromEntries(files.map((f,i)=>[i?'study':'profile',{path:path.relative(base,f).split(path.sep).join('/'),sha256:hash(i?s:p)}]));
      }
      await buildLab(profileData,extra[1],comparison);
    }
    if(extra[0]==='--replay'){
      const [,role,context,destination]=extra;
      const cell=comparison.cells.find(row=>row.role===role && row.context===context);
      if(!cell)throw Error('Unknown role or context for replay.');
      const original=profileData.rehearsal.series.matches.find(m=>m.id===cell.match);
      profileData.rehearsal.series.matches=[{...original,basis:original.basis+' · '+role+' / '+context,roster:cell.roster}];
      writeFileSync(destination,JSON.stringify(profileData,null,2)+'\n',{flag:'wx'});
    }
    console.log(JSON.stringify({...comparison,profileSha256:hash(p),studySha256:hash(s)},null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
