import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {inspectJavaEnvironment} from './java-health.mjs';
const profiles={java:[],core:[],physics:[{distribution:'mujoco',module:'mujoco',required:true},{distribution:'numpy',module:'numpy',required:true},{distribution:'matplotlib',module:'matplotlib',required:false}], 'native-cad':[{distribution:'cadquery-ocp',module:'OCP',required:true},{distribution:'numpy',module:'numpy',required:false},{distribution:'vtk',module:'vtk',required:false}]};
export function selectLibraries(task){
 if(task==='cad-physics') {
  const combined=new Map();
  for(const library of [...profiles.physics,...profiles['native-cad']]){
   const previous=combined.get(library.module);
   combined.set(library.module,{...library,required:library.required||previous?.required===true});
  }
  return [...combined.values()];
 }
 if(!Object.hasOwn(profiles,task))throw Error('Unknown task; choose core, java, physics, native-cad or cad-physics');
 return structuredClone(profiles[task]);
}
export function assessLibraries(libraries,expected={}){
 return libraries.map(r=>({...r,status:r.importStatus!=='ok'?'import-failed':!r.version?'metadata-missing':expected[r.distribution]&&r.version!==expected[r.distribution]?'version-mismatch':'available',expectedVersion:expected[r.distribution]??null}));
}
export function inspectEnvironment({task='core',python,expected={},jdk,expectedJava,cwd,appendPaths=[],run=spawnSync}={}){
 if((cwd!==undefined||appendPaths.length)&&!['cad-physics','native-cad','physics'].includes(task))throw Error('Python launch context requires a Python task');
 if(cwd!==undefined&&(typeof cwd!=='string'||!cwd.trim()))throw Error('Choose the test working directory');
 if(!Array.isArray(appendPaths)||appendPaths.some(p=>typeof p!=='string'||!p.trim()))throw Error('Each appended import path must be nonempty');
 if(task!=='java'&&(jdk!==undefined||expectedJava!==undefined))throw Error('Java options require --task java');
 if(task==='java'&&python!==undefined)throw Error('Python options do not apply to --task java');
 const selected=selectLibraries(task);
 for(const [name,version] of Object.entries(expected)){
  const library=selected.find(item=>item.distribution===name);
  if(!library||typeof version!=='string'||!version.trim()){
   const available=selected.map(item=>item.distribution).join(', ')||'none';
   throw Error(`Use a nonempty exact version. Selectable distributions for ${task}: ${available}`);
  }
  library.required=true;
 }
 const [major,minor]=process.versions.node.split('.').map(Number);const nodeOkay=major>20||(major===20&&minor>=11);
 const report={schema:'agent-frc/environment-health@1',task,node:{version:process.versions.node,supported:nodeOkay},python:null,libraries:[],ready:nodeOkay,limitations:['Installed/importable is not physics calibration or runtime compatibility proof.','No native renderer, GPU, Fusion session, robot hardware or plugin installation is tested.','No software is installed or updated. Reports may contain private executable/module paths; review before sharing.']};
 if(task==='java'){
  report.java=inspectJavaEnvironment({jdk,expectedJava,run});
  report.pythonStatus='not-needed-for-java';report.ready=nodeOkay&&report.java.ready;
  report.limitations.push('Java readiness checks runtime/compiler major versions only; Gradle wrapper/cache, WPILib, native libraries and compilation remain unverified.');
  return report;
 }
 if(!selected.length){report.pythonStatus='not-needed-for-core';return report;}
 python??='python';
 if(typeof python!=='string'||!python.trim()||python.startsWith('-'))throw Error('Choose an explicit Python executable or command name, not shell arguments');
 const probe=new URL('./python-health.py',import.meta.url);
 const useTestContext=task==='cad-physics'||cwd!==undefined||appendPaths.length>0;
 // -c gives the test working directory the same import precedence as python -m.
 const args=useTestContext?['-B','-c',readFileSync(probe,'utf8'),JSON.stringify(selected),JSON.stringify(appendPaths)]:
  ['-B',fileURLToPath(probe),JSON.stringify(selected)];
 const child=run(python,args,{cwd,encoding:'utf8',timeout:20000,maxBuffer:1024*1024,windowsHide:true,shell:false});
 if(child.error||child.status!==0){report.pythonStatus='probe-failed';report.ready=false;report.diagnostic=child.error?.code??'nonzero-exit';report.detail=String(child.stderr??'').slice(0,1000);return report;}
 let data;try{data=JSON.parse(child.stdout);}catch{report.pythonStatus='invalid-probe-output';report.ready=false;return report;}
 if(!data?.interpreter||!Array.isArray(data.libraries)||data.libraries.length!==selected.length||data.libraries.some((r,i)=>r.distribution!==selected[i].distribution||r.module!==selected[i].module||r.required!==selected[i].required||!['ok','failed'].includes(r.importStatus))){report.pythonStatus='invalid-probe-shape';report.ready=false;return report;}
 report.python=data.interpreter;report.pythonStatus='probed';report.libraries=assessLibraries(data.libraries,expected);report.ready=nodeOkay&&report.libraries.every(r=>!r.required||r.status==='available');
 report.nextSteps=report.libraries.filter(r=>r.status!=='available').map(r=>({distribution:r.distribution,required:r.required,action:r.status==='version-mismatch'?'Compare with project lockfile; do not silently upgrade':r.status==='metadata-missing'?'Import succeeded but distribution version is unresolved; inspect this interpreter':r.errorType==='ModuleNotFoundError'?'Confirm selected interpreter and project dependency manifest before proposing installation':'Inspect import exception and native dependency compatibility in the selected interpreter'}));return report;
}
export function parseArgs(args){const opts={expected:{}};for(let i=0;i<args.length;i++){const k=args[i],v=args[++i];if(!v)throw Error('Missing option value');if(k==='--task')opts.task=v;else if(k==='--python')opts.python=v;else if(k==='--cwd')opts.cwd=v;else if(k==='--append-path')(opts.appendPaths??=[]).push(v);else if(k==='--jdk')opts.jdk=v;else if(k==='--expect-java')opts.expectedJava=v;else if(k==='--expect'){const at=v.indexOf('=');if(at<1)throw Error('Use distribution=exact-version');opts.expected[v.slice(0,at)]=v.slice(at+1);}else throw Error('Unknown option '+k);}return opts;}
