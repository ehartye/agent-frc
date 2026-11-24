import {loadScoreObservations,scoreProfileForOutput} from './score-observations.mjs';
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateProfile,buildLab,embedConcepts} from './kickoff.mjs';
import {validateConceptBot} from './concept-bot.mjs';
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

// A role may pin a concept bot as {file, sha256}, resolved from studyDir (the study file's folder), or name
// one already embedded in rehearsal.concepts as {id}. Pinned documents are embedded into a copy of the profile.
function embedRoleConcepts(profile, roles, studyDir) {
  const pinned=Array.isArray(roles)?roles.filter(role=>role && Object.hasOwn(role,'concept')):[];
  if(!pinned.length)return {profile,conceptIds:new Map()};
  const conceptIds=new Map(),documents=new Map();
  const embedded=id=>(profile.rehearsal?.concepts??[]).find(c=>c.document?.id===id)?.document;
  for(const role of pinned){
    const pin=role.concept;
    if(typeof pin==='string')
      throw Error('Role '+role.id+' concept must be an object: {file, sha256} or {id}, not the bare string "'+pin+'".');
    if(pin && typeof pin==='object' && !Array.isArray(pin) && Object.keys(pin).length===1 && Object.hasOwn(pin,'id')){
      if(!label(pin.id))throw Error('Role '+role.id+' concept {id} needs a non-empty concept ID.');
      if(!embedded(pin.id))throw Error('Role '+role.id+' concept "'+pin.id+'" is not embedded in rehearsal.concepts.');
      conceptIds.set(role.id,pin.id);continue;
    }
    if(!pin || typeof pin!=='object' || !label(pin.file) || !/^[a-f0-9]{64}$/.test(pin.sha256))
      throw Error('Role '+role.id+' concept must be a {file, sha256} pin or {id} naming an embedded concept.');
    let bytes;
    try{bytes=readFileSync(path.resolve(studyDir,pin.file));}catch{throw Error('Role '+role.id+' concept file '+pin.file+' cannot be read.');}
    if(hash(bytes)!==pin.sha256)throw Error('Concept digest mismatch for '+pin.file+' (role '+role.id+').');
    let document;
    try{document=JSON.parse(bytes.toString('utf8').replace(/^﻿/,''));validateConceptBot(document);}
    catch(error){throw Error(pin.file+': '+error.message);}
    const same=other=>other!==undefined && JSON.stringify(other)===JSON.stringify(document);
    if(documents.has(document.id) && !same(documents.get(document.id)))
      throw Error(pin.file+': another role pins a different concept with ID '+document.id+'.');
    if(!same(embedded(document.id)))documents.set(document.id,document);
    conceptIds.set(role.id,document.id);
  }
  return {profile:validateProfile(embedConcepts(profile,[...documents.values()])),conceptIds};
}

// Validates the profile and study and builds the engine every cell shares. maxRoles raises the 12-role cap.
export function prepareComparison(input, study, {maxRoles=12, studyDir=process.cwd()}={}) {
  validateProfile(input);
  if(!Number.isInteger(maxRoles) || maxRoles<2)throw Error('maxRoles must be an integer of at least 2.');
  const {profile,conceptIds}=embedRoleConcepts(input,study?.roles,studyDir);
  const engine = createFieldRehearsal(profile);
  if (study?.schema !== 'agent-frc/alliance-study@1' || !['blue','red'].includes(study.side) ||
      !Array.isArray(profile.rehearsal?.series?.matches))
    throw Error('Supply an alliance study and a rules profile with published match rosters.');
  if (new Set(profile.rehearsal.series.matches.map(row=>row.id)).size!==profile.rehearsal.series.matches.length)
    throw Error('Published match IDs must be unique.');
  const roles = studyRows(study.roles, 'role', 2, maxRoles);
  const contexts = studyRows(study.contexts, 'context', 2, 16);
  const side = study.side, opponent = side === 'blue' ? 'red' : 'blue';
  const duration = engine.periods.reduce((sum,p) => sum+engine.elapsedSeconds(p.name),0);
  return {profile,engine,side,opponent,duration,roles,contexts,conceptIds};
}

// Plays one role in one context: the cell compareRoles reports, before regret and baseline changes are added.
export function playRoleCell(prepared, role, context) {
  const {profile,engine,side,opponent,duration,conceptIds}=prepared;
  const match = profile.rehearsal.series.matches.find(row => row.id === context.match);
  if (!match || !label(context.basis) || !Number.isInteger(context.slot) ||
      match.roster.filter(row => row.side === side && row.slot === context.slot).length !== 1)
    throw Error('Context '+context.id+' must name a published match, a single focal roster slot and a basis.');
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
  if (conceptIds.has(role.id)) focal.concept = conceptIds.get(role.id);
  const run = createMatchSeries(engine,[{...match,roster}]);
  run.advance(duration);
  if (!run.done) throw Error('Incomplete match clock.');
  const {game,periods,setup} = run.results[0];
  const byRobot = periods.flatMap(period=>period.robots.map(robot=>{
    const actions = game.events.filter(ev=>(ev.creditPhase??ev.phase)===period.phase && ev.robot===robot.id);
    const tally = {};
    for (const ev of actions) {
      const key=ev.operation+'/'+ev.outcome;
      tally[key] ??= {events:0,pieces:0,points:0};
      tally[key].events++; tally[key].pieces+=ev.pieces.length; tally[key].points+=ev.points??0;
    }
    return {id:robot.id,phase:period.phase,seconds:period.seconds,waitS:robot.waitSeconds,
      travelIn:robot.travelIn,tally,acceptedPerSecond:(tally['attempt/credited']?.pieces??0)/period.seconds};
  }));
  return {context:context.id, match:match.id, role:role.id, setup, focal, roster:run.match.roster, periods, byRobot,
    score:game.score, ordinary:game.endgame?.ordinaryScore ?? game.score,
    terminal:game.endgame?.terminalScore ?? {blue:0,red:0},
    occupied:game.occupied, attempts:game.attempts, events:game.events, endgame:game.endgame ?? null,
    margin:game.score[side]-game.score[opponent]};
}

// Adds regret and the change from the first (baseline) role to each cell, then summarizes every role.
// cells holds one playRoleCell result for every role in every context, contexts outermost as compareRoles plays them.
export function summarizeComparison(prepared, cells) {
  const {profile,side,roles,contexts}=prepared;
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

const playAll=prepared=>prepared.contexts.flatMap(context=>prepared.roles.map(role=>playRoleCell(prepared,role,context)));

// options: {maxRoles (default 12), studyDir (where concept pins resolve; default the working directory)}.
export function compareRoles(profile, study, options) {
  const prepared=prepareComparison(profile,study,options);
  return summarizeComparison(prepared,playAll(prepared));
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [profile,study,...extra]=process.argv.slice(2);
    if (!study || (extra.length && !(extra.length===4 && extra[0]==='--replay') && !(extra.length===2 && extra[0]==='--html'))) throw Error('Usage: strategy-lab.mjs PROFILE.json STUDY.json [--html NEW_LAB.html | --replay ROLE CONTEXT NEW_PROFILE.json]');
    const [p,s]=[profile,study].map(f=>readFileSync(f));
    const decode = b => JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
    // Concept pins resolve from the study's folder; the HTML lab and the replay use the profile with them embedded.
    const prepared=prepareComparison(await loadScoreObservations(decode(p),profile),decode(s),{studyDir:path.dirname(path.resolve(study))});
    const profileData=prepared.profile,comparison=summarizeComparison(prepared,playAll(prepared));
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
      // A changed role schedule requires fresh physical observations.
      const {scoreJournal,scoreObservations,...sourceMatch}=original;
      profileData.rehearsal.series.matches=[{...sourceMatch,basis:original.basis+' · '+role+' / '+context,
        // A concept robot's row carries its compiled record; the profile names the embedded concept by ID.
        roster:cell.roster.map(row=>typeof row.concept?.id==='string'?{...row,concept:row.concept.id}:row)}];
      writeFileSync(destination,JSON.stringify(scoreProfileForOutput(profileData,profile,destination),null,2)+'\n',{flag:'wx'});
    }
    console.log(JSON.stringify({...comparison,profileSha256:hash(p),studySha256:hash(s)},null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
