import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseJavaVersion,inspectJavaEnvironment} from '../scripts/java-health.mjs';
import {inspectEnvironment,parseArgs} from '../scripts/setup-health.mjs';

const jdk = path.resolve('fixture jdk');
const success = (exe) => ({status:0, stdout:exe.includes('javac') ? 'javac 17.0.21\r\n' : '', stderr:exe.includes('javac') ? '' : 'openjdk version "17.0.21" 2096-10-20\r\nOpenJDK Runtime Environment\r\n'});
test('Java profile probes only runtime and compiler in the selected JDK without a shell', () => {
  const calls=[];
  const report=inspectEnvironment({task:'java',jdk,expectedJava:'17',run:(exe,args,options) => {
    calls.push(exe); assert.deepEqual(args,['-version']); assert.equal(options.shell,false);
    assert.equal(options.windowsHide,true); assert.equal(options.timeout,20000);
    assert.equal(options.maxBuffer,1024*1024); return success(exe);
  }});
  assert.equal(report.ready,true); assert.equal(report.pythonStatus,'not-needed-for-java');
  assert.equal(report.java.tools.length,2); assert.deepEqual(report.libraries,[]);
  assert.deepEqual(calls.map(exe=>path.dirname(exe)),[path.join(jdk,'bin'),path.join(jdk,'bin')]);
});
test('missing compiler and runtime version mismatch cannot pass', () => {
  const missing=inspectJavaEnvironment({jdk,expectedJava:'17',run:exe=>exe.includes('javac')?{error:{code:'ENOENT'},status:null}:success(exe)});
  assert.equal(missing.ready,false); assert.equal(missing.tools[1].diagnostic,'ENOENT');
  const mixed=inspectJavaEnvironment({jdk,expectedJava:'21',run:exe=>exe.includes('javac')?{status:0,stdout:'javac 21.0.1'}:success(exe)});
  assert.equal(mixed.ready,false); assert.equal(mixed.tools[0].status,'version-mismatch');
});
test('timeout, thrown spawn, nonzero exit and malformed output fail closed', () => {
  for(const run of [()=>({error:{code:'ETIMEDOUT'}}),()=>{throw Object.assign(Error(),{code:'EACCES'});},()=>({status:1,stderr:'openjdk version "17"'}),()=>({status:0,stdout:'wrapper says 17'}),()=>null]) {
    assert.equal(inspectJavaEnvironment({jdk,expectedJava:'17',run}).ready,false);
  }
});
test('version parser accepts standard modern and legacy output, rejects ambiguous banners', () => {
  assert.deepEqual(parseJavaVersion('java version "1.8.0_402"\n','java'),{version:'1.8.0_402',major:8});
  assert.deepEqual(parseJavaVersion('openjdk version "25-ea" 2095-09-16','java'),{version:'25-ea',major:25});
  assert.equal(parseJavaVersion('javac 17.0.1\njavac 21.0.1','javac'),null);
  assert.equal(parseJavaVersion('openjdk version "garbage"','java'),null);
  assert.equal(parseJavaVersion('javac 0','javac'),null);
});
test('JDK selection requires absolute path and explicit valid major, with shell metacharacters passed as data', () => {
  for(const bad of ['', 'relative/jdk', undefined]) assert.throws(()=>inspectJavaEnvironment({jdk:bad,expectedJava:'17'}));
  for(const bad of ['', '17.0', '0', '-1', 17, undefined]) assert.throws(()=>inspectJavaEnvironment({jdk,expectedJava:bad}));
  const special=path.join(jdk,'literal & $input');
  const result=inspectJavaEnvironment({jdk:special,expectedJava:'17',run:exe=>{assert.ok(exe.startsWith(special));return success(exe);}});
  assert.equal(result.ready,true);
});
test('Windows and POSIX select platform executables without shell wrappers', () => {
  assert.throws(()=>inspectJavaEnvironment({jdk:'\\fixture',expectedJava:'17',platform:'win32'}));
  for(const [platform,home,extension] of [['win32','C:\\fixture jdk','.exe'],['linux','/fixture jdk','']]) {
    const report=inspectJavaEnvironment({jdk:home,expectedJava:'17',platform,run:success});
    assert.equal(report.ready,true); assert.ok(report.tools[1].executable.endsWith('javac'+extension));
  }
});
test('CLI returns readiness and exit codes without launching a build', () => {
  const cli=fileURLToPath(new URL('../scripts/check-environment.mjs',import.meta.url));
  const core=spawnSync(process.execPath,[cli,'--task','core'],{encoding:'utf8'});
  assert.equal(core.status,0); assert.equal(JSON.parse(core.stdout).ready,true);
  const missing=spawnSync(process.execPath,[cli,'--task','java','--jdk',path.join(jdk,'does-not-exist'),'--expect-java','17'],{encoding:'utf8'});
  assert.equal(missing.status,2); const report=JSON.parse(missing.stdout);
  assert.equal(report.ready,false); assert.equal(report.java.tools.length,2);
  assert.ok(report.java.tools.every(tool=>tool.status==='probe-failed'));
  const invalid=spawnSync(process.execPath,[cli,'--task','java'],{encoding:'utf8'});
  assert.equal(invalid.status,2); assert.match(invalid.stderr,/requires --jdk/);
});
test('CLI accepts Java options and rejects cross-profile expectations', () => {
  assert.deepEqual(parseArgs(['--task','java','--jdk',jdk,'--expect-java','17']),{task:'java',jdk,expectedJava:'17',expected:{}});
  assert.throws(()=>inspectEnvironment({task:'java',jdk,expectedJava:'17',expected:{numpy:'2'}}));
  assert.throws(()=>inspectEnvironment({task:'core',jdk,expectedJava:'17'}));
  assert.throws(()=>inspectEnvironment({task:'java',jdk,expectedJava:'17',python:'unused'}));
});
