import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeWindow } from './kickoff-window.mjs';
import { routeStudy } from './kickoff-routes.mjs';
import { fileURLToPath } from 'node:url';

const plugin = new URL('../', import.meta.url);
const positive = n => Number.isFinite(n) && n > 0;
const label = s => typeof s === 'string' && s.trim().length > 0;

export function validateProfile(p) {
  if (!p || !Number.isInteger(p.season) || !label(p.game) || !label(p.edition) ||
      !label(p.manual) || !/^https?:\/\//.test(p.manual) || p.units !== 'in') {
    throw Error('Specify a season, game, release edition, manual URL and inch units.');
  }
  if (![p.field?.length, p.field?.width].every(positive) || !label(p.field.source)) {
    throw Error('Field extents need positive dimensions and a source section.');
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
        !phases.every(v=>label(v.name) && positive(v.seconds)) ||
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
          (!r.autoSource || locations(map.sources[r.autoSource])) && locations(map.targets[r.goal])) ||
        !p.scoring.targets.every(t=>map.routes.some(r=>r.piece===t.piece && r.goal===t.goal))) {
      throw Error('Each modeled opportunity needs starting slots, piece locations and a compatible scoring location.');
    }
  }
  return p;
}

export function rulesModel(profile) {
  validateProfile(profile);
  const {routeHypotheses: previous, ...model}=profile;
  if(!model.scoring?.fieldMap) return model;
  const hypotheses=[];
  for(const phase of model.scoring.phases) for(const route of model.scoring.fieldMap.routes) {
    const study=routeStudy(model,route.piece,route.goal,phase.name,null,30);
    hypotheses.push({phase:phase.name,piece:route.piece,destination:route.goal,
      trialBoxWidthIn:30,routeIn:study.line,lengthIn:study.length,traffic:study.traffic});
  }
  return {...model,routeHypotheses:hypotheses};
}

export async function buildLab(input, destination) {
  const profile=rulesModel(input);
  const asset = name => readFile(new URL('templates/kickoff/' + name, plugin), 'utf8');
  const [page, renderer, controls, opportunities] = await Promise.all(['index.html', 'scene.js', 'lab.js', 'opportunities.js'].map(asset));
  const json = JSON.stringify(profile).replaceAll('<', '\\u003c');
  const output = page.replace('/* PROFILE */', () => json)
    .replace('/* SCENE */', () => renderer).replace('/* LAB */', () => controls)
    .replace('/* ROUTE MODEL */', () => routeStudy.toString())
    .replace('/* WINDOW MODEL */', () => analyzeWindow.toString())
    .replace('/* OPPORTUNITIES */', () => opportunities);
  await writeFile(destination, output, {flag: 'wx'});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [option, input, out, destination, ...extra] = process.argv.slice(2);
    if (!input || !['--output','--model-output'].includes(out) || !destination || extra.length || !['--season', '--profile'].includes(option)) {
      throw Error('Usage: node scripts/kickoff.mjs (--season 2025 | --profile profile.json) --output field.html');
    }
    if (option === '--season' && input !== '2025') {
      throw Error('Only 2025 has a bundled kickoff profile. Supply --profile with release-day sources for this season.');
    }
    const source = option === '--season' ? new URL('case-studies/2025/kickoff-field.json', plugin) : input;
    const profile=validateProfile(JSON.parse(await readFile(source,'utf8')));
    if(out==='--model-output') {
      await writeFile(destination,JSON.stringify(rulesModel(profile),null,2)+'\n',{flag:'wx'});
    } else {
      await buildLab(profile,destination);
    }
    console.log(path.resolve(destination));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
