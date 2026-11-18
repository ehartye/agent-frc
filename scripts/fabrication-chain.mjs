import {appendArtifact,pin,validateStudy,impactReport,digest} from './decision-chain.mjs';
import {compareFabrication} from './fabrication-capabilities.mjs';
import {fabricationModelSha} from './fabrication-chain-validation.mjs';
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
export function linkFabricationComparison(study,{envelopeId,plan,profile=null,asOf,prefix='fabrication',schoolArtifactId='school-capabilities',modelArtifactId='fabrication-assessor'}){
 validateStudy(study);const envelope=head(study,envelopeId);if(envelope?.kind!=='robot-envelope')throw Error('Existing robot envelope required');if(impactReport(study).heads.find(a=>a.id===envelopeId)?.stale)throw Error('Stale envelope must be revised first');
 const output=compareFabrication(plan,profile,{asOf});let result=study;
 const add=(id,kind,branch,inputs,content)=>{result=appendArtifact(result,{id,kind,branch,inputs,content});return pin(head(result,id));};
 const shared=(id,kind,content)=>{const old=head(result,id);if(old){if(old.kind!==kind||digest(old.content)!==digest(content))throw Error('Revise shared fabrication input explicitly before linking');return pin(old);}return add(id,kind,'shared',[],content);};
 const profilePin=shared(schoolArtifactId,'school-capability-profile',{schema:'frc-school-capability-input/v1',profile});
 const modelPin=shared(modelArtifactId,'fabrication-model',{schema:'frc-fabrication-model/v1',modelId:'declared-fabrication-comparator/v1',sourceSha256:fabricationModelSha()});
 const designBindings=plan.parts.map(part=>({partId:part.id,ref:add(prefix+'.design.'+part.id,'fabrication-design-input',envelope.branch,[pin(envelope)],{schema:'frc-fabrication-design-input/v1',partId:part.id,designRef:part.designRef,scope:'hypothetical-or-external-unverified'})}));
 const planPin=add(prefix+'.plan','fabrication-plan',envelope.branch,[pin(envelope),...designBindings.map(b=>b.ref)],{schema:'frc-fabrication-plan-input/v1',plan,designBindings});
 const comparisonPin=add(prefix+'.comparison','fabrication-comparison',envelope.branch,[planPin,profilePin,modelPin],{schema:'frc-fabrication-linked-comparison/v1',planPin,profilePin,modelPin,asOf,output,outputSha256:digest(output)});
 return {study:result,comparisonPin};
}
export function currentFabricationComparison(study,id,{asOf}){
 validateStudy(study);const a=head(study,id);if(a?.kind!=='fabrication-comparison')throw Error('Fabrication comparison required');if(impactReport(study).heads.find(x=>x.id===id)?.stale)throw Error('Stale fabrication comparison requires reassessment');if(a.content.asOf!==asOf)throw Error('Comparison date changed; reassessment required');const ref=a.content.modelPin,m=study.artifacts.find(x=>x.id===ref.id&&x.revision===ref.revision);if(m.content.sourceSha256!==fabricationModelSha())throw Error('Installed comparator source differs; reassessment required');return structuredClone({comparisonPin:pin(a),...a.content});
}
