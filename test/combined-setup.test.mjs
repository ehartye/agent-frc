import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {inspectEnvironment, parseArgs, selectLibraries} from '../scripts/setup-health.mjs';

test('mixed tasks require both bindings and retain the stronger shared NumPy requirement',()=>{
  const selected=selectLibraries('cad-physics');
  assert.deepEqual(selected.map(row=>[row.module,row.required]),[
    ['mujoco',true],['numpy',true],['matplotlib',false],['OCP',true]
  ]);
  assert.deepEqual(parseArgs(['--task','cad-physics','--cwd','project','--append-path','one','--append-path','two']),
    {task:'cad-physics',cwd:'project',appendPaths:['one','two'],expected:{}});
  for(const absent of ['mujoco','OCP','numpy',null]){
    let calls=0;
    const report=inspectEnvironment({task:'cad-physics',cwd:'project',run:(exe,args,options)=>{
      calls++;
      assert.equal(options.cwd,'project');
      assert.deepEqual(JSON.parse(args[3]),selected);
      return {status:0,stdout:JSON.stringify({interpreter:{executable:exe},libraries:selected.map(row=>({
        ...row,version:'1',importStatus:row.module===absent?'failed':'ok'
      }))})};
    }});
    assert.equal(report.ready,!absent);
    assert.equal(calls,1);
  }
  assert.throws(()=>inspectEnvironment({task:'core',appendPaths:['unused']}));
  assert.throws(()=>inspectEnvironment({task:'java',cwd:'unused'}));
});

test('the actual Python process preserves project and fallback precedence and reports import exceptions',t=>{
  const python=['python','python3'].find(exe=>spawnSync(exe,['-S','-c','import importlib.metadata']).status===0);
  if(!python)return t.skip('Requires a Python interpreter with importlib.metadata');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'paired-libraries-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'project'),fallback=path.join(root,'fallback');
  fs.mkdirSync(project);fs.mkdirSync(fallback);
  function fixture(dir,module,distribution,body){
    fs.writeFileSync(path.join(dir,module+'.py'),body);
    const metadata=path.join(dir,distribution.replaceAll('-','_')+'-1.dist-info');
    fs.mkdirSync(metadata);
    fs.writeFileSync(path.join(metadata,'METADATA'),'Metadata-Version: 2.1\nName: '+distribution+'\nVersion: 1\n');
  }
  fixture(project,'mujoco','mujoco','active = True\n');
  fixture(project,'numpy','numpy','value = 1\n');
  fixture(fallback,'OCP','cadquery-ocp',"import sys\nassert sys.modules['mujoco'].active\n");
  // Keep the fixtures independent of the host's installed packages.
  const run=(exe,args,opts)=>spawnSync(exe,['-E','-S',...args],opts);
  const options={task:'cad-physics',python,cwd:project,run};
  assert.equal(inspectEnvironment(options).ready,false);
  const good=inspectEnvironment({...options,appendPaths:[fallback]});
  assert.equal(good.ready,true);
  assert.equal(fs.realpathSync(good.python.workingDirectory),fs.realpathSync(project));
  assert.equal(fs.realpathSync(good.python.importPath.at(-1)),fs.realpathSync(fallback));
  assert.equal(fs.realpathSync(good.libraries.find(r=>r.module==='OCP').origin),fs.realpathSync(path.join(fallback,'OCP.py')));
  fs.writeFileSync(path.join(project,'OCP.py'),"raise RuntimeError('project binding cannot load')\n");
  const bad=inspectEnvironment({...options,appendPaths:[fallback]});
  assert.equal(bad.ready,false);
  const failure=bad.libraries.find(r=>r.module==='OCP');
  assert.equal(failure.errorType,'RuntimeError');
  assert.equal(failure.error,'project binding cannot load');
  assert.equal(fs.realpathSync(failure.origin),fs.realpathSync(path.join(project,'OCP.py')));
});
