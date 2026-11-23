// Runs the plugin's tests: everything, one lane, named files or the tests that cover a change.
import {spawn} from 'node:child_process';
import {appendFileSync,writeFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import path from 'node:path';
import {allTests,changedFiles,git,mapFile,readJson,root,selectForChange} from './test-selection.mjs';

const usage=`Usage: test-suite.mjs [options] [FILE-OR-NAME-PART...]
  (no arguments)     every test file under the station profile
  FILE-OR-NAME-PART  only the test files whose name contains one of these
  --portable         skip the tests that need the CAD kernel or a renderer
  --quick            the logic and docs lanes: no CAD kernel, no browser, no guide build
  --lane NAME        one lane from ${mapFile}
  --changed [BASE]   the tests that cover files changed since the merge base with BASE (default origin/main)
  --name PATTERN     only the tests inside the files whose title matches (node --test-name-pattern)
  --jobs N           test files run at once (default: half the cores, or FRC_TEST_JOBS)
  --list             print the selection and stop
  --record           write the measured seconds per file to test/durations.json`;

const args=process.argv.slice(2),flag=name=>{const at=args.indexOf(name);if(at<0) return false;args.splice(at,1);return true;};
const value=name=>{const at=args.indexOf(name);if(at<0) return undefined;const [,found]=args.splice(at,2);if(found===undefined) throw Error(usage);return found;};
if(flag('--help')){console.log(usage);process.exit(0);}
const profile=flag('--portable')?'portable':'station',quick=flag('--quick'),list=flag('--list'),record=flag('--record'),changed=flag('--changed');
const lane=value('--lane'),name=value('--name'),jobs=Number(value('--jobs')??process.env.FRC_TEST_JOBS??Math.max(1,Math.floor(availableParallelism()/2)));
if(args.some(arg=>arg.startsWith('--'))||!(jobs>=1)) throw Error(usage);

const map=readJson(mapFile),durations=readJson('test/durations.json'),every=allTests();
let selected=every,why=`every test file`;
if(quick||lane){
  const lanes=quick?map.quick:[lane];
  if(lanes.some(key=>!map.lanes[key])) throw Error(`Unknown lane. Lanes: ${Object.keys(map.lanes).join(', ')}`);
  selected=every.filter(test=>lanes.some(key=>map.lanes[key].includes(test)));why=`lane ${lanes.join(' + ')}`;
}
if(changed){
  const isCommit=text=>{try{git('rev-parse','--verify','--quiet',`${text}^{commit}`);return true;}catch{return false;}};
  const base=args.length&&isCommit(args[0])?args.shift():'origin/main',change=changedFiles(base),choice=selectForChange(change.changed,{versionOnly:change.versionOnly});
  selected=selected.filter(test=>choice.tests.includes(test));
  why=`changes since ${base} (${change.from.slice(0,7)}): ${choice.all?`everything, because ${choice.reason}`:choice.reason}`;
}
if(args.length){
  const wanted=args.map(arg=>path.basename(arg)),missing=wanted.filter(part=>!every.some(test=>test.includes(part)));
  if(missing.length) throw Error(`No test file matches ${missing.join(', ')}`);
  selected=selected.filter(test=>wanted.some(part=>test.includes(part)));
}
const seconds=test=>durations[profile]?.[test]??0;
selected=[...selected].sort((a,b)=>seconds(b)-seconds(a)||a.localeCompare(b)); // longest first, so the long files overlap the short ones
console.log(`${selected.length} of ${every.length} test files, ${profile} profile, ${jobs} at once: ${why}`);
if(list||!selected.length){selected.forEach(test=>console.log(`  ${test}`));if(!selected.length) console.log('No test covers this selection; nothing to run.');process.exit(0);}

const started=Date.now(),results=[];
const runOne=test=>new Promise(resolve=>{
  const begun=Date.now(),output=[];
  const child=spawn(process.execPath,['--test','--test-reporter=spec',...(name?[`--test-name-pattern=${name}`]:[]),path.join(root,'test',test)],{cwd:root,env:{...process.env,FRC_TEST_PROFILE:profile,FRC_TEST_JOBS:String(jobs)},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>output.push(chunk));child.stderr.on('data',chunk=>output.push(chunk));
  child.on('close',status=>{
    const text=Buffer.concat(output).toString(),count=key=>Number(text.match(new RegExp(`^\\S+ ${key} (\\d+)`,'m'))?.[1]??0);
    const result={test,ok:status===0,seconds:(Date.now()-begun)/1000,tests:count('tests'),skipped:count('skipped')};
    results.push(result);console.log(`${result.ok?'ok  ':'FAIL'} ${result.seconds.toFixed(1).padStart(7)}s  ${test}`);
    if(!result.ok) console.log(text);
    resolve();
  });
});
const queue=[...selected];
await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{while(queue.length) await runOne(queue.shift());}));

const total=(Date.now()-started)/1000,failed=results.filter(result=>!result.ok),sum=key=>results.reduce((all,result)=>all+result[key],0);
const slowest=[...results].sort((a,b)=>b.seconds-a.seconds).slice(0,5);
const summary=[`${results.length} test files, ${sum('tests')} tests (${sum('skipped')} skipped), ${failed.length} failed files, ${total.toFixed(1)}s wall (${sum('seconds').toFixed(0)}s summed), ${profile} profile`,
  'Slowest files:',...slowest.map(result=>`  ${result.seconds.toFixed(1).padStart(7)}s  ${result.test}`),...(failed.length?['Failed:',...failed.map(result=>`  ${result.test}`)]:[])];
console.log('\n'+summary.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### Tests: ${why}\n\n\`\`\`\n${summary.join('\n')}\n\`\`\`\n`);
if(record){
  durations[profile]=Object.fromEntries(Object.entries({...durations[profile],...Object.fromEntries(results.map(result=>[result.test,Math.round(result.seconds*10)/10]))}).filter(([test])=>every.includes(test)).sort(([a],[b])=>a.localeCompare(b)));
  writeFileSync(path.join(root,'test/durations.json'),JSON.stringify(durations,null,2)+'\n');
}
process.exitCode=failed.length?1:0;
