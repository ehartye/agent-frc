// Comparison artifacts are hypothetical verification records, never physical evidence.
const check=(ok,message)=>{if(!ok)throw Error(message);};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const equal=(a,b,digest)=>digest(a)===digest(b);
export function validateComparisonArtifact(a,seen,digest){
 if(!a.kind.startsWith('comparison-'))return;
 const c=a.content;
 check(c.basis==='hypothetical-unmeasured','Comparison basis must remain hypothetical');
 const input=ref=>{check(a.inputs.some(r=>equal(r,ref,digest)),'Comparison binding must be an input');const x=seen.get(`${ref.id}@${ref.revision}`);check(x&&x.sha256===ref.sha256,'Comparison binding pin mismatch');return x;};
 if(a.kind==='comparison-input'){
  check(c.schema==='frc-comparison-input/v1'&&['concept','policy','scenario','model'].includes(c.role),'Invalid comparison input role');
  check(c.value&&typeof c.value==='object'&&c.valueSha256===digest(c.value),'Comparison input value hash mismatch');
  if(c.role==='model')check(hash(c.value.sourceSha256)&&typeof c.value.runtime?.node==='string','Comparison model pin required');
  return;
 }
 if(a.kind==='comparison-experiment'){
  check(c.schema==='frc-linked-comparison-experiment/v1'&&c.config?.basis==='hypothetical-unmeasured','Invalid comparison experiment');
  check(c.configSha256===digest(c.config)&&c.config.season===a.season,'Comparison config hash/season mismatch');
  const game=input(c.bindings.game),resources=input(c.bindings.resources),model=input(c.bindings.model);
  check(game.kind==='game-analysis'&&resources.kind==='resource-baseline','Comparison baseline kinds mismatch');
  check(game.content.fieldPackageHash===c.config.fieldPackageSha256,'Comparison field pin differs from Game Analysis');
  check(model.kind==='comparison-input'&&model.content.role==='model','Comparison model input required');
  check(equal(model.content.value,c.model,digest),'Comparison model value mismatch');
  check(hash(c.linkerSourceSha256),'Linker source digest required');
  for(const baseline of [c.bindings.game,c.bindings.resources])check(model.inputs.some(r=>equal(r,baseline,digest)),'Comparison model baseline mismatch');
  const refs=[c.bindings.game,c.bindings.resources,c.bindings.model];
  for(const [key,role]of [['concepts','concept'],['policies','policy'],['scenarios','scenario']]){
   check(Array.isArray(c.bindings[key])&&c.bindings[key].length===c.config[key]?.length,'Comparison bindings incomplete');
   const ids=new Set();for(const binding of c.bindings[key]){
    check(!ids.has(binding.id),'Duplicate comparison binding');ids.add(binding.id);
    const value=c.config[key].find(x=>x.id===binding.id),node=input(binding.ref);
    check(value&&node.kind==='comparison-input'&&node.content.role===role&&equal(value,node.content.value,digest),'Comparison parameter binding mismatch');
    // Each parameter must depend on these exact baseline revisions, not an unrelated case.
    for(const baseline of [c.bindings.game,c.bindings.resources])check(node.inputs.some(r=>equal(r,baseline,digest)),'Comparison parameter baseline mismatch');
    refs.push(binding.ref);
   }
  }
  check(a.inputs.length===refs.length,'Unbound comparison experiment input');
  check(c.selectedCandidate===null,'Comparison cannot select a strategy');
  return;
 }
 if(a.kind==='comparison-run-evidence'){
  check(c.schema==='frc-linked-comparison-run/v1','Invalid comparison run schema');
  check(a.inputs.length===1,'Run evidence requires exactly one experiment pin');
  const experiment=input(a.inputs[0]);check(experiment.kind==='comparison-experiment','Run evidence needs experiment');
  const e=experiment.content,r=c.run,m=r?.manifest;
  check(equal(c.experimentPin,a.inputs[0],digest)&&c.configSha256===e.configSha256&&c.linkerSourceSha256===e.linkerSourceSha256,'Run experiment/config/linker pin mismatch');
  check(r&&m&&c.outcomeSha256===digest(r)&&r.runId===digest(m),'Run outcome/manifest hash mismatch');
  check(hash(r.traceSha256)&&c.traceStorage==='replay-from-exact-inputs','Run trace digest required');
  check(['completed','failed'].includes(r.status),'Unknown execution status');
  check(r.score===null&&r.winProbability===null&&r.physicalReachability==='not-assessed','Abstract run cannot claim scoring or reachability');
  check(m.basis==='hypothetical-unmeasured'&&m.fieldPackageSha256===e.config.fieldPackageSha256&&m.season===a.season,'Run field/season/basis mismatch');
  check(equal(m.model,e.model,digest)&&m.ticks===e.config.ticks&&m.tickSeconds===e.config.tickSeconds,'Run model/time mismatch');
  check(m.assumptionStatement===e.config.assumptionStatement&&m.assumptionStatementSha256===digest(m.assumptionStatement),'Run assumption mismatch');
  check(Array.isArray(m.limitations)&&m.limitations.length>0,'Run limitations required');
  check(e.config.seeds.includes(m.seed),'Run seed outside experiment');
  for(const [key,collection]of [['concept','concepts'],['policy','policies'],['scenario','scenarios']]){
   const value=e.config[collection].find(x=>x.id===m[key]?.id);check(value&&m[key].sha256===digest(value),'Run parameter pin mismatch');
  }
 }
}
