import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const cli=fileURLToPath(new URL('../scripts/project-checks.mjs',import.meta.url));
const lint=process.env.FRC_ACTIONLINT;

test('pre-push check follows the selected commit through the local workflow call',
  {skip:!lint && 'Set FRC_ACTIONLINT to the approved executable to exercise GitHub Actions syntax'},
  t=>{
    const project=mkdtempSync(path.join(os.tmpdir(),'workflow-fixture-'));
    t.after(()=>rmSync(project,{recursive:true,force:true}));
    const dir=path.join(project,'.github','workflows');
    mkdirSync(dir,{recursive:true});
    const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8'});
    git('init','-q');
    git('config','user.email','fixture@example.invalid');
    git('config','user.name','Fixture');
    const caller='on: push\njobs:\n  evidence:\n    uses: ./.github/workflows/checks.yml\n';
    const called='on: workflow_call\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ready\n';
    const write=(a,b)=>{
      writeFileSync(path.join(dir,'entry.yaml'),a);
      writeFileSync(path.join(dir,'checks.yml'),b);
    };
    function commit(a,b){
      write(a,b);
      git('add','.');
      git('commit','-qm','register fixture workflow');
      return git('rev-parse','HEAD').trim();
    }
    const probe=rev=>spawnSync(process.execPath,[cli,project,'workflows',rev,lint],{encoding:'utf8'});
    const nested=path.join(project,'example','.github','workflows');
    mkdirSync(nested,{recursive:true});
    writeFileSync(path.join(nested,'demo.yml'),called);
    const good=commit(caller,called);
    for(const [a,b,file] of [
      [caller.replace('on: push','on: [push'),called,'entry.yaml'],
      [caller,called.replace('echo ready','echo one: two'),'checks.yml'],
      [caller+'    with:\n      undeclared: value\n',called,'entry.yaml']
    ]){
      const bad=commit(a,b);
      write(caller,called);
      // The literal pushed commit remains authoritative even when local history substitutes a good tree.
      git('replace',bad,good);
      const result=probe(bad);
      assert.equal(result.status,1,result.stdout+result.stderr);
      assert.ok((result.stdout+result.stderr).includes(file));
      const subdir=spawnSync(process.execPath,[cli,path.join(project,'example'),'workflows',bad,lint],{encoding:'utf8'});
      assert.equal(subdir.status,1);
      assert.match(subdir.stderr,/project root/);
      git('replace','-d',bad);
    }
    const ok=probe(good);
    assert.equal(ok.status,0,ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout).workflows,['.github/workflows/checks.yml','.github/workflows/entry.yaml']);
    assert.equal(JSON.parse(ok.stdout).commit,good);
  });

