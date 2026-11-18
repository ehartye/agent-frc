import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab, validateProfile } from '../scripts/kickoff.mjs';

const profile = JSON.parse(await readFile(new URL('../case-studies/2025/kickoff-field.json',import.meta.url)));
const cli = fileURLToPath(new URL('../scripts/kickoff.mjs',import.meta.url));

test('release-day profile generates a standalone page outside the plugin and preserves prior exports', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(),'frc-kickoff-'));
  t.after(()=>rm(cwd,{recursive:true,force:true}));
  const run = (...args)=>execFileSync(process.execPath,[cli,...args],{cwd,stdio:'pipe'});
  run('--season','2025','--output','lab.html');
  const html=await readFile(path.join(cwd,'lab.html'),'utf8');
  assert.match(html,/Kickoff · V0/);
  assert.ok(!html.includes('/* LAB */'));
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.throws(()=>run('--season','2026','--output','other.html'),/release-day sources/);
  await assert.rejects(buildLab(profile,path.join(cwd,'lab.html')),{code:'EEXIST'});
  const custom = {...profile,season:2030, game:'Example </script>',limits:{perimeter:null,height:null,source:'Unknown'},landmarks:[],levels:[]};
  await writeFile(path.join(cwd,'profile.json'),JSON.stringify(custom));
  run('--profile','profile.json','--output','custom.html');
  const page=await readFile(path.join(cwd,'custom.html'),'utf8');
  const data=page.match(/<script id="profile" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data),custom);
});

test('reject ungrounded dimensions and invalid scene coordinates',()=>{
  for(const bad of [{units:'m'}, {field:{...profile.field,source:''}},
    {landmarks:[{...profile.landmarks[0],x:-1}]},{edition:''},
    {limits:{height:0,perimeter:100,source:'Example'}}]) {
    assert.throws(()=>validateProfile({...profile,...bad}));
  }
});
