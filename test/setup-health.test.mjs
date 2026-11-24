/** @lane merge */
import test from 'node:test';import assert from 'node:assert/strict';import {inspectEnvironment,parseArgs,selectLibraries} from '../scripts/setup-health.mjs';
function fake(overrides={}){return (_exe,args,options)=>{assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.equal(args[0],'-B');const specs=JSON.parse(args.at(-1));return {status:0,stdout:JSON.stringify({interpreter:{executable:'fixture-python',version:'3.14.10',prefix:'env',basePrefix:'base',virtualEnvironment:true},libraries:specs.map(r=>({...r,version:'4.0.1',origin:'fixture',importStatus:'ok',...(overrides[r.distribution]??{})}))})};};}
test('core never probes optional physics',()=>{const r=inspectEnvironment({task:'core',run:()=>{throw Error('must not execute');}});assert.equal(r.pythonStatus,'not-needed-for-core');assert.deepEqual(r.libraries,[]);});
test('physics reports chosen interpreter and exact required versions',()=>{const r=inspectEnvironment({task:'physics',python:'selected-python',expected:{mujoco:'4.0.1'},run:fake()});assert.equal(r.ready,true);assert.equal(r.python.virtualEnvironment,true);assert.equal(r.libraries[0].expectedVersion,'4.0.1');});
test('required mismatch/import failure blocks, optional failure does not',()=>{assert.equal(inspectEnvironment({task:'physics',expected:{mujoco:'other'},run:fake()}).ready,false);assert.equal(inspectEnvironment({task:'physics',run:fake({mujoco:{importStatus:'failed',errorType:'ImportError'}})}).ready,false);const r=inspectEnvironment({task:'physics',run:fake({matplotlib:{importStatus:'failed',errorType:'ModuleNotFoundError'}})});assert.equal(r.ready,true);assert.equal(r.nextSteps[0].required,false);});
test('metadata absence and unavailable interpreter are distinct',()=>{const r=inspectEnvironment({task:'physics',run:fake({mujoco:{version:null}})});assert.equal(r.libraries[0].status,'metadata-missing');assert.equal(r.ready,false);assert.equal(inspectEnvironment({task:'physics',run:()=>({error:{code:'ENOENT'}})}).pythonStatus,'probe-failed');});
test('bad args/profile/expectations and malformed output fail closed',()=>{assert.throws(()=>selectLibraries('everything'));assert.throws(()=>parseArgs(['--install','mujoco']));assert.throws(()=>parseArgs(['--python']));assert.throws(()=>inspectEnvironment({task:'physics',expected:{notSelected:'1'}}));assert.equal(inspectEnvironment({task:'physics',run:()=>({status:0,stdout:'not json'})}).ready,false);assert.equal(inspectEnvironment({task:'physics',run:()=>({status:0,stdout:'{}'})}).ready,false);});
test('options are passed as data, not shell commands; OCP distribution/module differ',()=>{let seen;inspectEnvironment({task:'native-cad',python:'path with spaces/python',run:(exe,args,opts)=>{seen=exe;return fake()(exe,args,opts);}});assert.equal(seen,'path with spaces/python');assert.equal(selectLibraries('native-cad')[0].distribution,'cadquery-ocp');assert.equal(selectLibraries('native-cad')[0].module,'OCP');assert.deepEqual(parseArgs(['--task','physics','--expect','numpy=2.0']),{task:'physics',expected:{numpy:'2.0'}});});
test('native CAD pins require the selected bindings together for this invocation',()=>{
  const expected={'cadquery-ocp':'4.0.1',numpy:'4.0.1',vtk:'4.0.1'};
  const probe=(pins,changes)=>inspectEnvironment({task:'native-cad',expected:pins,run:fake(changes)});
  const matched=probe(expected);
  assert.equal(matched.ready,true);
  assert.deepEqual(matched.libraries.map(row=>[row.distribution,row.required,row.expectedVersion]),
    Object.entries(expected).map(([name,version])=>[name,true,version]));
  for(const [distribution,observation,status] of [
    ['numpy',{version:'other'},'version-mismatch'],
    ['vtk',{importStatus:'failed',errorType:'ImportError'},'import-failed'],
    ['vtk',{version:null},'metadata-missing']
  ]){
    const changes={[distribution]:observation};
    const pinned=probe(expected,changes);
    assert.equal(pinned.ready,false);
    assert.equal(pinned.libraries.find(row=>row.distribution===distribution).status,status);
    assert.equal(pinned.nextSteps[0].required,true);
    const unpinned=probe({},changes);
    assert.equal(unpinned.ready,true);
    if(distribution==='vtk')assert.ok(unpinned.libraries.every(row=>row.module!=='vtk'));
    else assert.equal(unpinned.libraries.find(row=>row.distribution===distribution).required,false);
  }
  assert.throws(()=>probe({unknown:'1'}),/native-cad: cadquery-ocp, numpy, vtk/);
  assert.throws(()=>parseArgs(['--expect','vtk=1','--expect','vtk=2']),/Conflicting exact versions for vtk/);
  const repeated=parseArgs(['--expect','vtk=1','--expect','vtk=1']);
  assert.deepEqual(repeated.expected,{vtk:'1'});
  const unknown=parseArgs(['--task','native-cad','--expect','__proto__=1']);
  assert.throws(()=>inspectEnvironment(unknown),/native-cad: cadquery-ocp, numpy, vtk/);
});
test('the preliminary design task needs the design library and says how to install or update it',()=>{const missing=inspectEnvironment({task:'preliminary-design',run:fake({'frc-design-kernel':{importStatus:'failed',errorType:'ModuleNotFoundError',version:null}})});assert.equal(missing.ready,false);assert.match(missing.nextSteps[0].action,/pip install --upgrade git\+https:\/\/github\.com\/ehartye\/frc-design-kernel\. It has no pinned version: main is the release/);const found=inspectEnvironment({task:'preliminary-design',run:fake()});assert.equal(found.ready,true);assert.deepEqual(found.libraries.map(r=>r.module),['OCP','frc_design_kernel']);});
test('an interpreter older than the suite Python is not ready, and the next step names the version',()=>{
  // Catches a check that calls an older Python ready. Control: the same probe on the suite version is ready.
  const at=version=>inspectEnvironment({task:'physics',run:(exe,args,options)=>{const made=fake()(exe,args,options),data=JSON.parse(made.stdout);data.interpreter.version=version;return {...made,stdout:JSON.stringify(data)};}});
  for(const version of ['3.13.12','3.9.1','2.7.18','',undefined]){const found=at(version);assert.equal(found.ready,false,String(version));assert.match(found.nextSteps[0].action,/Use Python 3\.14 or newer/);}
  for(const version of ['3.14.0','3.15.1','4.0.0'])assert.equal(at(version).ready,true,version);
});
