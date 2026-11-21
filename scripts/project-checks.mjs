/** Run the same project-owned test entry points on a student's checkout and in CI. */
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {checkWorkflows} from './workflow-preflight.mjs';

function main() {
  const [project,mode,base,...rest]=process.argv.slice(2);
  if(mode==='workflows'){
    if(!project || !base || rest.length!==1)throw Error('Usage: project-checks.mjs PROJECT workflows FULL_COMMIT ABSOLUTE_ACTIONLINT');
    console.log(JSON.stringify(checkWorkflows(path.resolve(project),base,rest[0])));
    return;
  }
  if(!project || rest.length || !(mode==='full' && !base || mode==='changed' && /^[a-f\d]{40}$/.test(base)))
    throw Error('Usage: project-checks.mjs PROJECT changed BASE_COMMIT | PROJECT full');
  const cwd=path.resolve(project);
  const git=(...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',maxBuffer:64*1024*1024});
  if(path.resolve(git('rev-parse','--show-toplevel').trim())!==cwd)throw Error('Use the project root');
  let changed=[];
  if(mode==='changed') {
    git('merge-base','--is-ancestor',base,'HEAD');
    changed=[...git('diff','--no-renames','--name-only','-z',base,'--').split('\0'),
      ...git('ls-files','--others','--exclude-standard','-z').split('\0')].filter(Boolean);
  }
  function run(command,args) {
    const result=spawnSync(command,args,{cwd,stdio:'inherit'});
    if(result.error)throw result.error;
    if(result.status!==0)throw Error(command+' failed with status '+result.status);
  }
  const manifest='tests/ci.json';
  const config=JSON.parse(readFileSync(path.join(cwd,manifest),'utf8'));
  if(config.schema!=='agent-frc/project-checks@1' || !Array.isArray(config.checks) || !config.checks.length)
    throw Error('Register at least one project test in '+manifest);
  const layout=config.layout??'robot-project';
  if(!['robot-project','software-only'].includes(layout)) throw Error('Choose robot-project or software-only layout');
  if(layout==='robot-project') run(process.execPath,[fileURLToPath(new URL('./project-layout.mjs',import.meta.url)),'check',cwd]);
  const runAll=mode==='full' || changed.includes(manifest) || changed.some(name=>name.startsWith('.github/workflows/'));
  const selected=[],skipped=[],seen=new Set();
  for(const check of config.checks) {
    if(typeof check.name!=='string' || !check.name.trim() || seen.has(check.name) ||
      !Array.isArray(check.argv) || !check.argv.length || check.argv.some(x=>typeof x!=='string'||!x.length) ||
      !Array.isArray(check.inputs) || check.inputs.some(x=>typeof x!=='string'||!x.length||x.startsWith('/')||
        x.includes('\\') || x.includes('*') || x.split('/').includes('..')))
      throw Error('Each check needs a unique name, executable argv and exact input paths or directory prefixes');
    seen.add(check.name);
    const wanted=runAll || !check.inputs.length || changed.some(name=>check.inputs.some(input=>
      input.endsWith('/')?name.startsWith(input):name===input));
    if(!wanted){skipped.push(check.name);continue;}
    selected.push(check.name);
    const [exe,...args]=check.argv;
    if(exe==='gradle-wrapper') {
      const safeTasks=new Set(['build','test','check','--offline','--no-daemon','--stacktrace','--console=plain']);
      if(!args.some(arg=>['build','test','check'].includes(arg)) || !args.every(arg=>safeTasks.has(arg)))
        throw Error('Use the Gradle wrapper for build, test or check with supported build options');
      if(process.platform==='win32')run(process.env.ComSpec || 'cmd.exe',['/d','/c','gradlew.bat',...args]);
      else run(path.join(cwd,'gradlew'),args);
    } else run(exe==='node'?process.execPath:exe,args);
  }
  console.log(JSON.stringify({mode,base:base??null,selected,skipped}));
}
try { main(); } catch(error){console.error(error.message);process.exitCode=1;}
