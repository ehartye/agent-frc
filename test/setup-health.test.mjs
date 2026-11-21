import test from 'node:test';import assert from 'node:assert/strict';import {inspectEnvironment,parseArgs,selectLibraries} from '../scripts/setup-health.mjs';
function fake(overrides={}){return (_exe,args,options)=>{assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.equal(args[0],'-B');const specs=JSON.parse(args.at(-1));return {status:0,stdout:JSON.stringify({interpreter:{executable:'fixture-python',version:'3.12',prefix:'env',basePrefix:'base',virtualEnvironment:true},libraries:specs.map(r=>({...r,version:'4.0.1',origin:'fixture',importStatus:'ok',...(overrides[r.distribution]??{})}))})};};}
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
    assert.equal(unpinned.libraries.find(row=>row.distribution===distribution).required,false);
  }
  assert.throws(()=>probe({unknown:'1'}),/native-cad: cadquery-ocp, numpy, vtk/);
});
