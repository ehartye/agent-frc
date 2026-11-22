import {createScoreAssessment} from './score-assessment.mjs';
import {inlineThemeFonts} from './theme-fonts.mjs';
import {loadScoreObservations,scoreProfileForOutput} from './score-observations.mjs';
import {allocateOpeningTasks} from './auto-allocation.mjs';
import {createFieldPieceMotion} from './field-piece-motion.mjs';
import { createRehearsalGame,rehearsalFindings } from './rehearsal-game.mjs';
import { createMatchSeries, createRehearsalSetup } from './rehearsal-series-core.mjs';
import { createTerminalRehearsal } from './rehearsal-terminal.mjs';
import {verifyRuleValues} from './rule-register.mjs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeWindow } from './kickoff-window.mjs';
import { routeStudy } from './kickoff-routes.mjs';
import {framePlan,starterFrameProfile} from './frame-profile.mjs';
import { fieldGeometry } from './field-rehearsal-geometry.mjs';
import { createFieldRehearsal } from './field-rehearsal.mjs';
import { fileURLToPath } from 'node:url';

const plugin = new URL('../', import.meta.url);
const positive = n => Number.isFinite(n) && n > 0;
const label = s => typeof s === 'string' && s.trim().length > 0;

function verifyMatchClock(phases, periods) {
  let phaseIndex = 0;
  let elapsedTicks = 0;
  for (const period of periods) {
    const phase = phases[phaseIndex];
    const parent = period.scoringPhase === undefined ? period.name : period.scoringPhase;
    if (!phase || parent !== phase.name) {
      throw Error('Rehearsal period ' + period.name + ' must belong to the next scoring phase: ' + (phase?.name ?? 'match already complete'));
    }
    elapsedTicks += period.seconds * 20;
    const phaseTicks = phase.seconds * 20;
    if (elapsedTicks > phaseTicks) throw Error('Rehearsal exceeds the scoring clock for ' + phase.name);
    if (elapsedTicks === phaseTicks) {
      phaseIndex++;
      elapsedTicks = 0;
    }
  }
  if (phaseIndex < phases.length) throw Error('Rehearsal does not complete the scoring clock for ' + phases[phaseIndex].name);
}

function sourceLocator(s) {
  if(!label(s) || s!==s.trim() || /[\u0000-\u001f\u007f]/u.test(s))return false;
  if(/^https?:\/\//i.test(s)){
    try {const u=new URL(s);return Boolean(u.hostname) && !u.username && !u.password;} catch {return false;}
  }
  const file=s.replaceAll('\\','/');
  return !file.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(file) &&
    file.split('/').every(part=>part && part!=='.' && part!=='..');
}

export function initialTrial(p) {
  const seed=p.trial || p.rehearsal?.defaults;
  const relative=Math.min(p.field.length,p.field.width)/12;
  const shape=seed?.frameProfile??p.frameProfile??(seed?undefined:starterFrameProfile());
  return {...(shape?{frameProfile:shape}:{}),length:seed?.length ?? relative,width:seed?.width ?? relative,height:seed?.height ?? relative,
    heading:seed?.heading ?? 0,x:p.trial?.x ?? p.field.length/4,y:p.trial?.y ?? p.field.width/3};
}

export function validateProfile(p) {
  if (p && Object.hasOwn(p,'manualBinding') && !Object.hasOwn(p,'ruleRegister')) throw Error('A reviewed manual binding requires its source register.');
  if (p && Object.hasOwn(p,"ruleRegister")) verifyRuleValues(p.ruleRegister,p);
  if (!p || (p.season!==undefined && !Number.isInteger(p.season)) || !label(p.game) || !label(p.edition) ||
      !sourceLocator(p.manual) || p.units !== 'in') {
    throw Error('Specify a game, edition, manual URL or project-relative source file, and inch units.');
  }
  if (![p.field?.length, p.field?.width].every(positive) || !label(p.field.source)) {
    throw Error('Field extents need positive dimensions and a source section.');
  }
  if(p.trial && (![p.trial.length,p.trial.width,p.trial.height].every(positive) ||
     p.trial.heading!==undefined && (!Number.isFinite(p.trial.heading) || Math.abs(p.trial.heading)>180) ||
     ['x','y'].some((axis,i)=>p.trial[axis]!==undefined && (!Number.isFinite(p.trial[axis]) ||
       p.trial[axis]<0 || p.trial[axis]>[p.field.length,p.field.width][i])))) throw Error('Invalid trial box or starting pose.');
  const trial=initialTrial(p);
  framePlan(trial.length,trial.width,trial.frameProfile,0,25.4);
  if(p.rehearsal?.defaults){
    const body=p.rehearsal.defaults;
    framePlan(body.length,body.width,body.frameProfile??p.frameProfile,body.bumper,25.4);
  }
  if (!p.limits || ![p.limits.height, p.limits.perimeter].every(n => n === null || positive(n)) ||
      !label(p.limits.source)) throw Error('Provide sourced limits or use null for an unknown.');
  if (!label(p.geometrySource) || !label(p.omissions) || !Array.isArray(p.landmarks) || !Array.isArray(p.levels)) {
    throw Error('Describe the geometry, source sections and omissions.');
  }
  for (const m of p.landmarks) {
    if (!label(m.name) || !Number.isFinite(m.x) || m.x < 0 || m.x > p.field.length ||
        !Number.isFinite(m.y) || m.y < 0 || m.y > p.field.width || !positive(m.acrossFlats) ||
        !positive(m.height) || ![4, 6, 8].includes(m.sides)) throw Error('Invalid landmark.');
  }
  if (!p.levels.every(v => label(v.name) && positive(v.height))) throw Error('Invalid height reference.');
  if (p.scoring) {
    const {source, inventory, phases, targets}=p.scoring;
    const count=n=>Number.isSafeInteger(n) && n>=0;
    if (!label(source) || ![inventory,phases,targets].every(a=>Array.isArray(a) && a.length) ||
        !inventory.every(i=>label(i.piece) && count(i.total) && label(i.distribution)) ||
        !phases.every(v=>label(v.name) && positive(v.seconds)) || new Set(phases.map(v=>v.name)).size!==phases.length ||
        !targets.every(t=>label(t.name) && inventory.some(i=>i.piece===t.piece) &&
          Array.isArray(t.points) && t.points.length===phases.length && t.points.every(count) &&
          (t.cap===undefined || count(t.cap)))) throw Error('Invalid scoring profile inventory, phases or targets.');
  }
  const map=p.scoring?.fieldMap;
  if (map) {
    const locations=a=>Array.isArray(a) && a.length>0 && a.every(q=>Array.isArray(q) && q.length===2 &&
      q.every(Number.isFinite) && q[0]>=0 && q[0]<=p.field.length && q[1]>=0 && q[1]<=p.field.width);
    if (!label(map.basis) || !locations(map.starts) || !map.sources || !map.targets ||
        !Array.isArray(map.routes) || !map.routes.length ||
        !map.routes.every(r=>p.scoring.inventory.some(i=>i.piece===r.piece) && locations(map.sources[r.piece]) &&
          (!r.autoSource || locations(map.sources[r.autoSource])) && locations(map.targets[r.goal]) &&
          Object.entries(r.sourceByPhase || {}).every(([name,key])=>p.scoring.phases.some(v=>v.name===name) && locations(map.sources[key])) &&
          (!r.preloadPhases || Array.isArray(r.preloadPhases) && r.preloadPhases.every(name=>p.scoring.phases.some(v=>v.name===name)))) ||
        (map.mirror && (typeof map.mirror.redX!=='boolean' || typeof map.mirror.redY!=='boolean')) ||
        !p.scoring.targets.every(t=>map.routes.some(r=>r.piece===t.piece && r.goal===t.goal))) {
      throw Error('Each modeled opportunity needs starting slots, piece locations and a compatible scoring location.');
    }
  }
  if(p.rehearsal){
    const r=p.rehearsal, pt=q=>Array.isArray(q) && q.length===2 && q.every(Number.isFinite);
    const nonnegative=n=>Number.isFinite(n) && n>=0;
    const labels=a=>Array.isArray(a) && a.length>0 && a.every(label) && new Set(a).size===a.length;
    if(r.schema!=='field-rehearsal/v1' || !label(r.basis) || !label(r.boundsNote) || !labels(r.sources) ||
      !label(r.resourceLabel) || !labels(r.setups) || !Array.isArray(r.planes) ||
      !r.planes.every(f=>label(f.name) && pt(f.at) && Number.isFinite(f.inwardDeg)) ||
      !Array.isArray(r.obstacles) || !r.obstacles.every(o=>label(o.name) && label(o.kind) &&
        Array.isArray(o.poly) && o.poly.length>=3 && o.poly.every(pt) &&
        (nonnegative(o.lower) || (o.lower && r.setups.every(s=>nonnegative(o.lower[s]))))) ||
      !Array.isArray(r.bands) || !r.bands.every(v=>pt(v.from) && pt(v.to)) ||
      !Array.isArray(r.starts) || r.starts.length!==3 || !r.starts.every(pt) ||
      typeof r.mirror?.redX!=='boolean' || typeof r.mirror.redY!=='boolean' ||
      !Array.isArray(r.periods) || !labels(r.periods.map(v=>v.name)) ||
      !r.periods.every(v=>positive(v.seconds) && Number.isSafeInteger(v.seconds*20)) ||
      !r.programs || !Object.keys(r.programs).length) throw Error('Invalid rehearsal geometry, setups, starts or periods.');
    if (r.waitCycles!==undefined && r.waitCycles!=='yield') throw Error('Set rehearsal.waitCycles to "yield" or omit it.');
    if (p.scoring) verifyMatchClock(p.scoring.phases,r.periods);
    else if (r.periods.some(v=>v.scoringPhase!==undefined)) throw Error('A rehearsal scoringPhase needs a scoring clock.');
    for(const ob of r.obstacles){
      // Require a consistently wound convex polygon with no degenerate edges.
      let sign=0;
      for(let i=0;i<ob.poly.length;i++){
        const a=ob.poly[i],b=ob.poly[(i+1)%ob.poly.length],c=ob.poly[(i+2)%ob.poly.length];
        const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
        if(!cross || (sign && Math.sign(cross)!==sign))throw Error('Use a convex rehearsal obstacle polygon.');
        sign=Math.sign(cross);
      }
    }
    const d=r.defaults;
    if(!d || ![d.length,d.width,d.height,d.speed].every(positive) || d.speed>500 ||
       !Number.isFinite(d.heading) || !nonnegative(d.bumper) || !Array.isArray(d.orders) || d.orders.length!==3 ||
       !d.orders.every(k=>Object.hasOwn(r.programs,k)))throw Error('Invalid rehearsal robot defaults.');
    const waypoint=w=>w && label(w.label) && (!w.frame || ['alliance','field'].includes(w.frame)) &&
      (w.lock===undefined || w.lock===true || label(w.lock)) && (w.release===undefined || w.release===true && Boolean(w.lock)) &&
      (w.dwell===undefined || nonnegative(w.dwell)) && (pt(w.at) || (w.at && (pt(w.at.blue) && pt(w.at.red) ||
        pt(w.at.default) && Object.values(w.at.slots || {}).every(pt))));
    createRehearsalGame(p);
    const terminal=createTerminalRehearsal(p);
    if(terminal)for(const match of r.series?.matches ?? []){
      const robots=match.roster.map(row=>({...row,id:(row.side==='blue'?'B':'R')+row.slot}));
      terminal.start(robots,match.endgameAtRestAfterS,match.setup ?? r.setups[0]);
    }
    for(const program of Object.values(r.programs)){
      if(!label(program.label) || !Array.isArray(program.steps) || !program.steps.every(waypoint) ||
         Object.entries(program.byPeriod || {}).some(([name,steps])=>!r.periods.some(p=>p.name===name) ||
           !Array.isArray(steps) || !steps.every(waypoint)))throw Error('Invalid rehearsal behavior or waypoint.');
    }
  }
  return p;
}

export function rulesModel(profile) {
  validateProfile(profile);
  const {routeHypotheses: previous, ...model}=profile;
  if(!model.scoring?.fieldMap) return model;
  const hypotheses=[],trial=initialTrial(model),width=Math.max(trial.length,trial.width);
  for(const phase of model.scoring.phases) for(const route of model.scoring.fieldMap.routes) {
    const study=routeStudy(model,route.piece,route.goal,phase.name,null,width);
    hypotheses.push({phase:phase.name,piece:route.piece,destination:route.goal,
      trialBoxWidthIn:width,routeIn:study.line,lengthIn:study.length,traffic:study.traffic});
  }
  return {...model,routeHypotheses:hypotheses};
}

export async function buildLab(input, destination, comparison) {
  const profile=rulesModel(input);
  const asset = name => readFile(new URL('templates/kickoff/' + name, plugin), 'utf8');
  const [page, renderer, controls, opportunities, rehearsalUI] = await Promise.all(['index.html', 'scene.js', 'lab.js', 'opportunities.js', 'rehearsal.js'].map(asset));
  const json = JSON.stringify(profile).replaceAll('<', '\\u003c');
  const replacements={
    'ROLE COMPARISON':JSON.stringify(comparison ? {
      files:comparison.files,roles:comparison.roles,contexts:comparison.contexts.map(({id,basis})=>({id,basis})),side:comparison.side,
      cells:comparison.cells.map(({role,context,match,roster,focal,ordinary,terminal,margin,regret,byRobot})=>
        ({role,context,match,roster,focalId:(focal.side==='blue'?'B':'R')+focal.slot,ordinary,terminal,margin,regret,byRobot}))
    } : null).replaceAll('<','\\u003c'),
    PROFILE:json, SCENE:renderer, LAB:controls, 'ROUTE MODEL':routeStudy.toString(), 'WINDOW MODEL':analyzeWindow.toString(),
    'REHEARSAL MODEL':[framePlan.toString(),starterFrameProfile.toString(),initialTrial.toString(),fieldGeometry.toString(),createFieldPieceMotion.toString(),allocateOpeningTasks.toString(),createScoreAssessment.toString(),createRehearsalGame.toString(),rehearsalFindings.toString(),createTerminalRehearsal.toString(),createFieldRehearsal.toString(),createMatchSeries.toString(),createRehearsalSetup.toString(),
      'const rehearsal=createFieldRehearsal(profile); const rehearsalNotes=[];'].join('\n'),
    OPPORTUNITIES:opportunities, 'REHEARSAL UI':rehearsalUI, 'THEME FONTS':inlineThemeFonts()
  };
  // Match the original template once. Project-owned strings may legitimately contain a template marker.
  const output=page.replace(/\/\* ([A-Z ]+) \*\//g,(token,key)=>Object.hasOwn(replacements,key)?replacements[key]:token);
  await writeFile(destination, output, {flag: 'wx'});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [option, input, out, destination, ...extra] = process.argv.slice(2);
    if(option==='--season')throw Error('Supply a project-owned profile with --profile. A season number cannot identify the rules edition and geometry.');
    if(!input || option!=='--profile' || !['--output','--model-output'].includes(out) || !destination || extra.length) {
      throw Error('Usage: node scripts/kickoff.mjs --profile project.json (--model-output rules.json | --output field.html)');
    }
    const profile=validateProfile(await loadScoreObservations(JSON.parse(await readFile(input,'utf8')),input));
    if(out==='--model-output') {
      const pluginRoot=await realpath(fileURLToPath(plugin));
      const parent=await realpath(path.dirname(path.resolve(destination)));
      const relative=path.relative(pluginRoot,parent);
      if(!relative || (!path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep))){
        throw Error('Save the rules model in your team project, outside the plugin checkout or installed plugin folder.');
      }
      await writeFile(destination,JSON.stringify(scoreProfileForOutput(rulesModel(profile),input,destination),null,2)+'\n',{flag:'wx'});
    } else {
      await buildLab(profile,destination);
    }
    console.log(path.resolve(destination));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
