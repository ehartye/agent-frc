/** @lane merge */
import {execFileSync, spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const cli = fileURLToPath(new URL('../scripts/resolve-plugin-runtime.mjs', import.meta.url));
function writeManifest(root, version) {
  mkdirSync(path.join(root, '.codex-plugin'), {recursive:true});
  writeFileSync(path.join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({name:'agent-frc', version}));
}
function workspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'frc-runtime-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  return root;
}
function active(cache, version, enabled=true) {
  const installed = [{pluginId:'agent-frc@classroom', name:'agent-frc', marketplaceName:'classroom',
    installed:true, enabled, version, source:{path:'mutable-checkout'}}];
  return spawnSync(process.execPath, [cli,'active','classroom',cache],
    {input:JSON.stringify({installed}), encoding:'utf8'});
}

test('refresh the host selection after cache rotation, including the actual manifest identity', t => {
  const dir = workspace(t);
  const plugin = path.join(dir,'classroom','agent-frc');
  writeManifest(path.join(plugin,'1.0.0'),'1.0.0');
  assert.equal(JSON.parse(active(dir,'1.0.0').stdout).version, '1.0.0');
  renameSync(path.join(plugin,'1.0.0'), path.join(dir,'retired'));
  writeManifest(path.join(plugin,'1.0.1'),'1.0.1');
  assert.notEqual(active(dir,'1.0.0').status,0);
  assert.notEqual(active(dir,'1.0.1',false).status,0);
  assert.equal(JSON.parse(active(dir,'1.0.1').stdout).root, path.join(plugin,'1.0.1'));
  writeManifest(path.join(plugin,'1.0.1'),'1.0.2');
  assert.notEqual(active(dir,'1.0.1').status,0);
});

test('Claude describes the bundled resolver selected by the skill across plugin roots', t => {
  const dir = workspace(t);
  for (const version of ['1.0.0', '1.0.1']) {
    const root = path.join(dir, 'plugin copy ' + version);
    mkdirSync(path.join(root, 'scripts'), {recursive:true});
    mkdirSync(path.join(root, '.claude-plugin'));
    const script = path.join(root, 'scripts', 'resolve-plugin-runtime.mjs');
    const file = path.join(root, '.claude-plugin', 'plugin.json');
    copyFileSync(cli, script);
    writeManifest(root, '9.9.9');
    const run = (...args) => spawnSync(process.execPath, [script, 'claude', ...args],
      {cwd:dir, encoding:'utf8'});
    assert.notEqual(run().status, 0);
    writeFileSync(file, JSON.stringify({name:'other-plugin', version}));
    assert.notEqual(run().status, 0);
    writeFileSync(file, JSON.stringify({name:'agent-frc', version}));
    assert.deepEqual(JSON.parse(run().stdout), {mode:'claude', name:'agent-frc', version, root});
    assert.notEqual(run(dir).status, 0);
  }
});

test('historical replay requires the exact clean checkout independently of the cache', t => {
  const dir = workspace(t);
  const git = (...args) => execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
  git('init','-q');
  writeManifest(dir,'1.0.0');
  git('add','.codex-plugin');
  git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
    '-c','commit.gpgsign=false','commit','-qm','fixture');
  const rev = git('rev-parse','HEAD');
  const pinned = (p, hash) => spawnSync(process.execPath,[cli,'pinned',p,hash],{encoding:'utf8'});
  assert.equal(JSON.parse(pinned(dir,rev).stdout).revision,rev);
  assert.notEqual(pinned(dir,'0'.repeat(40)).status,0);
  assert.notEqual(pinned(path.join(dir,'absent'),rev).status,0);
  writeManifest(dir,'1.0.1');
  assert.notEqual(pinned(dir,rev).status,0);
});
