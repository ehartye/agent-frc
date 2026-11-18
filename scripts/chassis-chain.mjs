import {appendArtifact,pin,digest,validateStudy,impactReport} from './decision-chain.mjs';
import {summarizeChassisLedger} from './chassis-ledger.mjs';
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
export function linkChassisLedger(study,{envelopeId,ledger,prefix='chassis'}){
 validateStudy(study);const e=head(study,envelopeId);if(e?.content?.schema!=='frc-hypothetical-robot-envelope/v1')throw Error('Exact hypothetical envelope required');if(impactReport(study).heads.find(a=>a.id===e.id)?.stale)throw Error('Stale envelope cannot seed chassis evidence');const output=summarizeChassisLedger(ledger);let result=study;
 const add=(id,kind,branch,inputs,content)=>{result=appendArtifact(result,{id,kind,branch,inputs,content});return pin(head(result,id));};
 const sourceBindings=ledger.sources.map(source=>{const id='chassis-source.'+source.id,old=head(result,id),content={schema:'frc-chassis-source/v1',source};if(old){if(old.kind!=='chassis-source'||digest(old.content)!==digest(content))throw Error('Revise shared chassis source explicitly before linking');return {sourceId:source.id,ref:pin(old)};}return {sourceId:source.id,ref:add(id,'chassis-source','shared',[],content)};});
 const ledgerPin=add(prefix+'.ledger','configured-chassis-ledger',e.branch,[pin(e),e.content.componentInputPin,...sourceBindings.map(b=>b.ref)],{schema:'frc-configured-chassis-linked/v1',ledger,envelopePin:pin(e),componentPin:e.content.componentInputPin,sourceBindings});
 const summaryPin=add(prefix+'.summary','chassis-coverage-summary',e.branch,[ledgerPin],{schema:'frc-chassis-linked-summary/v1',ledgerPin,output,outputSha256:digest(output)});return {study:result,summaryPin};
}
export function currentChassisSummary(study,id){validateStudy(study);const a=head(study,id);if(a?.kind!=='chassis-coverage-summary')throw Error('Chassis summary required');if(impactReport(study).heads.find(x=>x.id===id)?.stale)throw Error('Stale chassis ledger requires review');return structuredClone({summaryPin:pin(a),...a.content});}
