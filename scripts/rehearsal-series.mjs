import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFieldRehearsal} from './field-rehearsal.mjs';
import {createMatchSeries} from './rehearsal-series-core.mjs';
import {validateProfile} from './kickoff.mjs';

try {
  const [source,output,...extra]=process.argv.slice(2);
  if (!source || extra.length) throw Error('Usage: rehearsal-series.mjs PROFILE.json [OUTPUT.json]');
  const bytes=await readFile(source),profile=validateProfile(JSON.parse(bytes));
  const engine=createFieldRehearsal(profile);
  const matches=profile.rehearsal.series?.matches;
  const run=createMatchSeries(engine,matches);
  const matchSeconds=engine.periods.reduce((sum,p)=>sum+engine.phaseSeconds(p.name),0);
  run.advance(matchSeconds*matches.length);
  if (!run.done) throw Error('The match series did not reach its final cutoff');
  const result={schema:'agent-frc/rehearsal-series@1',profileSha256:createHash('sha256').update(bytes).digest('hex'),
    stepS:engine.dt,playbackRate:10,modelSeconds:matchSeconds*matches.length,
    playbackSeconds:matchSeconds*matches.length/10,matches:run.results};
  const json=JSON.stringify(result,null,2)+'\n';
  if(output) await writeFile(output,json); else process.stdout.write(json);
} catch(error) {console.error(error.message);process.exitCode=1;}
