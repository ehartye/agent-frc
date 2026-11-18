import {buildEnvelopeStudy} from './envelope-study.mjs';
import {unknownResources} from './resource-baseline.mjs';
import {forkBranch,appendArtifact,pin,validateStudy,impactReport} from './decision-chain.mjs';
import {validateCandidateInput,validateComponentAssumptions} from './hypothetical-envelope-validation.mjs';
const head=(s,id)=>s.artifacts.filter(a=>a.id===id).at(-1);
export function buildHypotheticalCandidates(inputs,{hardwareCatalog=null}={}){
 if(!Array.isArray(inputs)||inputs.length!==2)throw Error('Exactly two candidate inputs required');
 let study=buildEnvelopeStudy({resources:unknownResources(2026)});
 if(hardwareCatalog!==null)study=appendArtifact(study,{id:'hardware-rules-2026',kind:'hardware-catalog',content:hardwareCatalog});
 for(let i=0;i<inputs.length;i++){
  const content=inputs[i];validateComponentAssumptions(content);const branch='hypothetical-'+content.frame.configuration;
  study=forkBranch(study,branch);const add=(id,kind,deps,content)=>{study=appendArtifact(study,{id,kind,branch,inputs:deps.map(x=>pin(head(study,x))),content});return head(study,id);};
  const common=['game-2026','resources-2026',...(hardwareCatalog===null?[]:['hardware-rules-2026'])];const source=add(branch+'-components','component-assumptions',common,content);
  const strategy=add(branch+'-strategy','strategy-brief',[...common,source.id],{role:content.frame.configuration==='square'?'Investigate low-profile FUEL collection and delivery':'Investigate longer storage layout and alternative routes',basis:'hypothesis',decision:'not-selected',teamFeasibility:'not-assessed',unknowns:content.unknowns});
  const {frame,assumptions}=content,id=branch+'-envelope';
  const dimensionsMm={length:frame.lengthMm+2*assumptions.bumperProjectionPerSideMm,width:frame.widthMm+2*assumptions.bumperProjectionPerSideMm,height:assumptions.completeHeightMm};
  add(id,'robot-envelope',[...common,strategy.id,source.id],{schema:'frc-hypothetical-robot-envelope/v1',candidateInput:{schema:'frc-static-envelope-input/v1',id,basis:'hypothetical-design-assumption',configuration:'stowed-static-upright',alignment:'width-across-aperture',footprintReference:'complete-robot-including-bumpers',dimensionsMm,uncertaintyMm:assumptions.uncertaintyMm,assumptionStatement:assumptions.statement,sourceArtifactPin:pin(source)},componentInputPin:pin(source),decision:'not-selected',status:'unresolved',teamFeasibility:'not-assessed',budgets:{massKg:null,powerW:null,batteryCurrentA:null,centerOfMassMm:null},calculated:{bareFramePerimeterMm:2*(frame.lengthMm+frame.widthMm),completeBoxPerimeterMm:2*(dimensionsMm.length+dimensionsMm.width),legality:'not-established',physicalReachability:'not-assessed'},openChecks:content.unknowns});
 }
 return study;
}
export function exportStaticCandidate(study,id){
 validateStudy(study);const a=head(study,id);if(a?.content?.schema!=='frc-hypothetical-robot-envelope/v1')throw Error('Hypothetical envelope required');if(impactReport(study).heads.find(x=>x.id===id)?.stale)throw Error('Stale envelope requires revision/reassessment');
 const result=structuredClone(a.content.candidateInput);result.sourceArtifactPin=pin(a);validateCandidateInput(result);return result;
}
