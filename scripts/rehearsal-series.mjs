import {loadScoreObservations} from './score-observations.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {createMatchSeries} from './rehearsal-series-core.mjs';
import {validateProfile} from './kickoff.mjs';

function cycleLine(match,c) {
  return '[rehearsal] '+match+' '+c.phase+' wait cycle '+[...c.cycle,c.cycle[0]].join(' -> ')+' from '+c.startS.toFixed(2)+' s for '+
    c.durationS.toFixed(2)+' s ('+(c.ended==='cleared'?'cleared':'held to period end')+')'+
    (c.yielded===undefined?'':c.yielded?'; '+c.yielded+' yielded':'; no member could detour');
}

try {
  const args=process.argv.slice(2),report=args.includes('--report-deadlocks');
  const [source,output,...extra]=args.filter(a=>a!=='--report-deadlocks');
  if (!source || extra.length) throw Error('Usage: rehearsal-series.mjs PROFILE.json [OUTPUT.json] [--report-deadlocks]');
  const bytes=await readFile(source),profile=validateProfile(await loadScoreObservations(JSON.parse(bytes),source));
  const engine=createFieldRehearsal(profile);
  const matches=profile.rehearsal.series?.matches;
  const run=createMatchSeries(engine,matches);
  const matchSeconds=engine.periods.reduce((sum,p)=>sum+engine.elapsedSeconds(p.name),0);
  run.advance(matchSeconds*matches.length);
  if (!run.done) throw Error('The match series did not reach its final cutoff');
  const result={schema:'agent-frc/rehearsal-series@1',profileSha256:createHash('sha256').update(bytes).digest('hex'),
    stepS:engine.dt,playbackRate:10,modelSeconds:matchSeconds*matches.length,
    playbackSeconds:matchSeconds*matches.length/10,matches:run.results};
  const json=JSON.stringify(result,null,2)+'\n';
  for(const {match,cycles} of run.waitCycles)for(const c of cycles)console.error(cycleLine(match,c));
  if(report){
    // The report never replaces a saved result: it names the result it describes by hash.
    const cycles=run.waitCycles.flatMap(m=>m.cycles.map(c=>({match:m.match,...c})));
    const summary={schema:'agent-frc/rehearsal-wait-cycles@1',profileSha256:result.profileSha256,
      resultSha256:createHash('sha256').update(json).digest('hex'),waitCycles:profile.rehearsal.waitCycles ?? 'report',
      cycleCount:cycles.length,permanentCount:cycles.filter(c=>c.ended==='period-end').length,
      matchesWithCycles:run.waitCycles.filter(m=>m.cycles.length).map(m=>m.match),cycles};
    if(output) await writeFile(output,json);
    process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  } else if(output) await writeFile(output,json); else process.stdout.write(json);
} catch(error) {console.error(error.message);process.exitCode=1;}
