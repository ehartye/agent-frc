import {validateChassisArtifact} from './chassis-chain-validation.mjs';
import {validateFabricationArtifact} from './fabrication-chain-validation.mjs';
import {validateHardwareCatalogArtifact} from './hardware-catalog.mjs';
import {validateHypotheticalEnvelopeArtifact} from './hypothetical-envelope-validation.mjs';
import {validateFuelAnnotationArtifact} from './fuel-annotation-validation.mjs';
import {validateComparisonArtifact} from './comparison-link-validation.mjs';
import {validateResources} from './resource-baseline.mjs';
import {validateFieldModel} from './field-semantics.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const prerequisites = {
 'game-analysis': [], 'resource-baseline': [], 'hardware-catalog': [], 'chassis-source': [],
 'configured-chassis-ledger': ['robot-envelope','component-assumptions','chassis-source'], 'chassis-coverage-summary': ['configured-chassis-ledger'], 'school-capability-profile': [], 'fabrication-model': [],
 'fabrication-design-input': ['robot-envelope'], 'fabrication-plan': ['robot-envelope','fabrication-design-input'], 'fabrication-comparison': ['fabrication-plan','school-capability-profile','fabrication-model'],
 'strategy-brief': ['game-analysis', 'resource-baseline'],
 'robot-envelope': ['game-analysis', 'resource-baseline', 'strategy-brief'],
 'component-assumptions': ['game-analysis', 'resource-baseline'],
 'capability-contract': ['strategy-brief', 'robot-envelope'],
 'architecture-trade': ['capability-contract'],
 'subsystem-spec': ['architecture-trade'],
 'evidence': ['subsystem-spec'],
 'comparison-input': ['game-analysis', 'resource-baseline'],
 'comparison-experiment': ['game-analysis', 'resource-baseline', 'comparison-input'],
 'comparison-run-evidence': ['comparison-experiment'],
 'fuel-assessor-model': ['game-analysis'],
 'hypothetical-fuel-source': ['game-analysis'],
 'hypothetical-fuel-event-set': ['comparison-experiment', 'game-analysis', 'fuel-assessor-model'],
 'fuel-assessment-evidence': ['hypothetical-fuel-event-set', 'fuel-assessor-model']
};
const identifier = x => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(x);
const canonical = x => {
 if (x === null || typeof x !== 'object') return JSON.stringify(x);
 if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
 return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
};
export const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
export const pin = a => ({id:a.id, revision:a.revision, sha256:a.sha256});
const key = a => `${a.id}@${a.revision}`;
const latest = (study,id) => study.artifacts.filter(a=>a.id===id).at(-1);
const assert = (ok,message) => { if (!ok) throw Error(message); };

export function createStudy(season) {
 assert(Number.isSafeInteger(season) && season >= 1992,'Invalid season');
 return {schema:'frc-decision-chain/v1', season, branches:[{id:'shared',parent:null}], artifacts:[], decisions:[]};
}
export function forkBranch(study,id,parent='shared') {
 validateStudy(study);
 assert(identifier(id) && !study.branches.some(b=>b.id===id),'Branch ID must be new');
 assert(study.branches.some(b=>b.id===parent),'Unknown parent branch');
 const result=structuredClone(study); result.branches.push({id,parent}); return result;
}
const ancestors = (study,branch) => {
 const ids=new Set(); let current=branch;
 while(current!==null){assert(!ids.has(current),'Branch cycle');ids.add(current);const b=study.branches.find(x=>x.id===current);assert(b,'Unknown branch');current=b.parent;}
 return ids;
};

// Append-only API: updates create another revision, never mutate an existing record.
export function appendArtifact(study,{id,kind,branch='shared',inputs=[],content,expectedRevision=0}) {
 validateStudy(study);
 const old=latest(study,id);
 assert((old?.revision??0)===expectedRevision,'Revision conflict');
 const result=structuredClone(study);
 const body={id,kind,branch,season:study.season,revision:expectedRevision+1,previous:old?pin(old):null,status:'hypothesis',inputs:structuredClone(inputs),content:structuredClone(content)};
 result.artifacts.push({...body,sha256:digest(body)});
 validateStudy(result); return result;
}

export function validateStudy(study) {
 assert(study?.schema==='frc-decision-chain/v1','Unknown schema');
 assert(Number.isSafeInteger(study.season) && study.season>=1992,'Invalid season');
 assert(Array.isArray(study.branches)&&Array.isArray(study.artifacts),'Missing collections');
 // Approval is deliberately outside this API. A recommendation or tool-authored name cannot authorize a team decision.
 assert(Array.isArray(study.decisions)&&study.decisions.length===0,'Team decisions require a separate authenticated review workflow; unsupported here');
 assert(study.branches[0]?.id==='shared' && study.branches[0]?.parent===null,'Shared root required');
 const branchIds=new Set();
 for(const b of study.branches){assert(identifier(b.id)&&!branchIds.has(b.id),'Duplicate/invalid branch');branchIds.add(b.id);if(b.id!=='shared')assert(branchIds.has(b.parent),'Parent must precede child');}
 const seen=new Map(), heads=new Map();
 for(const a of study.artifacts){
  assert(identifier(a.id)&&Object.hasOwn(prerequisites,a.kind),'Invalid artifact identity/kind');
  assert(a.season===study.season && a.status==='hypothesis','Season/status mismatch');
  const allowed=ancestors(study,a.branch), old=heads.get(a.id);
  assert(a.revision===(old?.revision??0)+1,'Nonsequential revision');
  assert(canonical(a.previous)===canonical(old?pin(old):null),'Previous revision pin mismatch');
  if(old)assert(old.branch===a.branch && old.kind===a.kind,'Artifact cannot change branch or kind');
  const {sha256,...body}=a; assert(digest(body)===sha256,'Content hash mismatch');
  assert(a.content && typeof a.content==='object'&&!Array.isArray(a.content),'Content object required');
  if(a.kind==='game-analysis' && a.content.fieldModel){validateFieldModel(a.content.fieldModel);assert(a.content.fieldModel.season===study.season,'Field/study season mismatch');}
  if(a.kind==='resource-baseline' && a.content.schema==='frc-resource-baseline/v1'){validateResources(a.content);assert(a.content.season===study.season,'Resource/study season mismatch');}
  assert(Array.isArray(a.inputs),'Inputs array required');
  const kinds=new Set(), refs=new Set();
  for(const ref of a.inputs){
   assert(!refs.has(key(ref)),'Duplicate input');refs.add(key(ref));
   const upstream=seen.get(key(ref));assert(upstream&&upstream.sha256===ref.sha256,'Missing or changed input pin');
   assert(upstream.id!==a.id,'Self dependency');
   assert(allowed.has(upstream.branch)||(a.kind==='comparison-experiment'&&upstream.kind==='comparison-input'),'Cross-branch input requires an explicit fork/lineage or comparison join');
   kinds.add(upstream.kind);
  }
  validateComparisonArtifact(a,seen,digest);
  validateFuelAnnotationArtifact(a,seen,digest);
  validateHypotheticalEnvelopeArtifact(a,seen,digest);
  validateHardwareCatalogArtifact(a);
  validateFabricationArtifact(a,seen,digest);
  validateChassisArtifact(a,seen,digest);
  for(const kind of prerequisites[a.kind])assert(kinds.has(kind),`Missing ${kind} input`);
  if(['game-analysis','resource-baseline','hardware-catalog','chassis-source','school-capability-profile','fabrication-model'].includes(a.kind))assert(a.branch==='shared','Baselines must be shared');
  else assert(a.branch!=='shared','Hypothesis artifact needs an explicit branch');
  seen.set(key(a),a);heads.set(a.id,a);
 }
 return true;
}

export function impactReport(study) {
 validateStudy(study);
 const states=new Map();
 for(const a of study.artifacts){
  const reasons=[];
  for(const ref of a.inputs){
   const head=latest(study,ref.id);
   if(head.revision!==ref.revision)reasons.push(`${key(ref)} superseded by ${key(head)}`);
   if(states.get(key(ref))?.stale)reasons.push(`${key(ref)} has stale upstream evidence`);
  }
  states.set(key(a),{...pin(a),branch:a.branch,kind:a.kind,stale:reasons.length>0,reasons});
 }
 return {season:study.season,decision:'none',artifacts:[...states.values()],heads:[...new Set(study.artifacts.map(a=>a.id))].map(id=>states.get(key(latest(study,id))))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try { assert(process.argv.length===3,'Usage: node scripts/decision-chain.mjs study.json'); console.log(JSON.stringify(impactReport(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2)); }
 catch(error){console.error(error.message);process.exitCode=1;}
}
