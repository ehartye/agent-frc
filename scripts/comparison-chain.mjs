import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateStudy,impactReport,forkBranch,appendArtifact,pin,digest} from './decision-chain.mjs';
import {validateResources} from './resource-baseline.mjs';
import {validateExperiment,runComparison} from './comparison-study.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);

// Executes locally and records exact hypothetical evidence. No imported "passed" receipts accepted.
export function executeAndLinkComparison(study,{config,fieldPackage,gameId,resourcesId,prefix}){
 validateStudy(study);validateExperiment(config,fieldPackage);
 check(typeof prefix==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(prefix),'A unique comparison prefix is required');
 check(!study.branches.some(b=>b.id===prefix)&&!study.artifacts.some(a=>a.id.startsWith(prefix+'.')),'Comparison prefix already used');
 const game=head(study,gameId),resources=head(study,resourcesId);
 check(game?.kind==='game-analysis'&&resources?.kind==='resource-baseline','Explicit existing game/resource artifact IDs required');
 check(game.season===config.season&&resources.season===config.season,'Baseline season mismatch');validateResources(resources.content);
 check(game.content.fieldPackageHash===digest(fieldPackage)&&digest(game.content.fieldModel)===digest(fieldPackage.fieldModel),'Game Analysis does not pin this exact field package/model');
 const freshness=impactReport(study).heads;for(const a of [game,resources])check(!freshness.find(x=>x.id===a.id)?.stale,'Cannot execute against stale baseline');
 const runCount=config.concepts.length*config.policies.length*config.scenarios.length*config.seeds.length;
 check(runCount<=256,'Linked evidence limit is 256 runs per cohort');
 const result=runComparison(config,fieldPackage);
 let linked=forkBranch(study,prefix);const baseline=[pin(game),pin(resources)];
 const add=(id,kind,branch,inputs,content)=>{linked=appendArtifact(linked,{id,kind,branch,inputs,content});return pin(head(linked,id));};
 const bindings={game:pin(game),resources:pin(resources)};
 const addParameter=(role,value,branch)=>add(role==='model'?`${prefix}.model`:`${prefix}.${role}.${value.id}`,'comparison-input',branch,baseline,{schema:'frc-comparison-input/v1',role,basis:'hypothetical-unmeasured',value,valueSha256:digest(value),association:'Abstract comparison parameter; not a calibrated robot-envelope or approved strategy'});
 bindings.model=addParameter('model',result.model,prefix);
 for(const [key,role]of [['concepts','concept'],['policies','policy'],['scenarios','scenario']]){
  bindings[key]=[];for(const value of config[key]){const branch=`${prefix}.${role}.${value.id}`;linked=forkBranch(linked,branch);bindings[key].push({id:value.id,ref:addParameter(role,value,branch)});}
 }
 const linkerSourceSha256=digest(Object.fromEntries(['comparison-chain.mjs','comparison-link-validation.mjs'].map(f=>[f,fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')])));
 const experimentId=`${prefix}.experiment`;
 const experiment=add(experimentId,'comparison-experiment',prefix,[...baseline,bindings.model,...['concepts','policies','scenarios'].flatMap(k=>bindings[k].map(b=>b.ref))],{schema:'frc-linked-comparison-experiment/v1',basis:'hypothetical-unmeasured',config,configSha256:digest(config),model:result.model,linkerSourceSha256,bindings,selectedCandidate:null,limitations:result.limitations});
 const runRefs=[];
 for(const {trace,...run}of result.runs){
  check(digest(trace)===run.traceSha256,'Generated trace digest mismatch');
  runRefs.push(add(`${prefix}.run.${run.runId}`,'comparison-run-evidence',prefix,[experiment],{schema:'frc-linked-comparison-run/v1',basis:'hypothetical-unmeasured',experimentPin:experiment,configSha256:result.configSha256,linkerSourceSha256,run,outcomeSha256:digest(run),traceStorage:'replay-from-exact-inputs'}));
 }
 return {study:linked,receipt:{schema:'frc-linked-comparison-receipt/v1',linkerSourceSha256,experiment,runRefs,configSha256:result.configSha256,fieldPackageSha256:result.fieldPackageSha256,model:result.model,runCounts:result.runCounts,outcomesSha256:digest(result.runs.map(({trace,...run})=>run)),selectedCandidate:null,limitations:result.limitations}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{check(process.argv.length===5,'Usage: node scripts/comparison-chain.mjs study.json experiment.json field-package.json');const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));const output=executeAndLinkComparison(read(process.argv[2]),{config:read(process.argv[3]),fieldPackage:read(process.argv[4]),gameId:'game-2026',resourcesId:'resources-2026',prefix:'comparison-2026'});console.log(JSON.stringify(output,null,2));if(output.receipt.runCounts.failed)process.exitCode=1;}catch(e){console.error(e.message);process.exitCode=1;}
}
