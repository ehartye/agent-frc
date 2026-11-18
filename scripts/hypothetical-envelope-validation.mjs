const check=(ok,m)=>{if(!ok)throw Error(m);};
const keys=(o,ks)=>{check(o&&typeof o==='object'&&!Array.isArray(o),'Object required');check(Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k)),'Closed hypothetical envelope schema required');};
const txt=x=>typeof x==='string'&&x.trim().length>0;
const num=x=>Number.isFinite(x)&&x>0&&x<=100000;
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(x);
const axes=['length','width','height'];
export function validateCandidateInput(c){
 keys(c,['schema','id','basis','configuration','alignment','footprintReference','dimensionsMm','uncertaintyMm','assumptionStatement','sourceArtifactPin']);
 check(c.schema==='frc-static-envelope-input/v1'&&ident(c.id)&&c.basis==='hypothetical-design-assumption','Hypothetical descriptor required');
 check(c.configuration==='stowed-static-upright'&&c.alignment==='width-across-aperture'&&c.footprintReference==='complete-robot-including-bumpers','Only explicit static bumper-inclusive configuration supported');
 for(const k of ['dimensionsMm','uncertaintyMm']){keys(c[k],axes);for(const a of axes)check(c[k][a]===null||(k==='dimensionsMm'?num(c[k][a]):Number.isFinite(c[k][a])&&c[k][a]>=0&&c[k][a]<=100000),'Invalid dimension or uncertainty');}
 check(txt(c.assumptionStatement)&&c.assumptionStatement.length<=4096,'Explicit assumption statement required');keys(c.sourceArtifactPin,['id','revision','sha256']);check(ident(c.sourceArtifactPin.id)&&Number.isSafeInteger(c.sourceArtifactPin.revision)&&c.sourceArtifactPin.revision>0&&/^[a-f0-9]{64}$/.test(c.sourceArtifactPin.sha256),'Exact descriptor source pin required');return true;
}
export function validateComponentAssumptions(c){
 keys(c,['schema','basis','source','frame','assumptions','unknowns']);check(c.schema==='frc-hypothetical-component-assumptions/v1'&&c.basis==='hypothetical-not-owned','Component assumptions are not inventory');
 keys(c.source,['id','url','revision','sha256','locator','facts']);check(txt(c.source.id)&&/^https:\/\//.test(c.source.url)&&txt(c.source.revision)&&/^[a-f0-9]{64}$/.test(c.source.sha256)&&txt(c.source.locator)&&txt(c.source.facts),'Pinned component source required');
 keys(c.frame,['configuration','lengthInch','widthInch','lengthMm','widthMm','scope']);check(ident(c.frame.configuration)&&c.frame.scope==='bare-frame','Bare frame scope required');for(const a of ['length','width'])check(num(c.frame[a+'Inch'])&&Math.abs(c.frame[a+'Inch']*25.4-c.frame[a+'Mm'])<1e-6,'Frame conversion mismatch');
 keys(c.assumptions,['bumperProjectionPerSideMm','completeHeightMm','uncertaintyMm','statement']);check(num(c.assumptions.bumperProjectionPerSideMm)&&num(c.assumptions.completeHeightMm)&&txt(c.assumptions.statement),'Positive explicit design assumptions required');keys(c.assumptions.uncertaintyMm,axes);for(const a of axes)check(c.assumptions.uncertaintyMm[a]===null||(Number.isFinite(c.assumptions.uncertaintyMm[a])&&c.assumptions.uncertaintyMm[a]>=0&&c.assumptions.uncertaintyMm[a]<=100000),'Unknown or assumed uncertainty required');check(Array.isArray(c.unknowns)&&c.unknowns.length>0&&c.unknowns.every(txt),'Unresolved engineering checks required');return true;
}
export function validateHypotheticalEnvelopeArtifact(a,seen,digest){
 if(a.kind==='component-assumptions'){validateComponentAssumptions(a.content);return;}
 if(a.kind!=='robot-envelope')return;
 const previous=a.previous?seen.get(a.previous.id+'@'+a.previous.revision):null;
 const hasComponents=a.inputs.some(r=>seen.get(r.id+'@'+r.revision)?.kind==='component-assumptions');
 if(hasComponents||previous?.content?.schema==='frc-hypothetical-robot-envelope/v1')check(a.content.schema==='frc-hypothetical-robot-envelope/v1','Typed hypothetical envelope cannot downgrade schema');
 if(a.content.schema!=='frc-hypothetical-robot-envelope/v1')return;
 const c=a.content;keys(c,['schema','candidateInput','componentInputPin','decision','status','teamFeasibility','budgets','calculated','openChecks']);
 check(c.decision==='not-selected'&&c.status==='unresolved'&&c.teamFeasibility==='not-assessed','No candidate feasibility or selection assertion');
 validateCandidateInput(c.candidateInput);const ref=c.componentInputPin;keys(ref,['id','revision','sha256']);const source=seen.get(ref.id+'@'+ref.revision);check(source?.kind==='component-assumptions'&&source.sha256===ref.sha256&&a.inputs.some(x=>digest(x)===digest(ref)),'Exact component assumption dependency required');
 const s=source.content;check(c.candidateInput.id===a.id&&digest(c.candidateInput.sourceArtifactPin)===digest(ref),'Descriptor identity/pin mismatch');
 const expected={length:s.frame.lengthMm+2*s.assumptions.bumperProjectionPerSideMm,width:s.frame.widthMm+2*s.assumptions.bumperProjectionPerSideMm,height:s.assumptions.completeHeightMm};check(digest(expected)===digest(c.candidateInput.dimensionsMm)&&digest(s.assumptions.uncertaintyMm)===digest(c.candidateInput.uncertaintyMm)&&c.candidateInput.assumptionStatement===s.assumptions.statement,'Envelope must derive exactly from pinned assumptions');
 keys(c.budgets,['massKg','powerW','batteryCurrentA','centerOfMassMm']);check(Object.values(c.budgets).every(x=>x===null),'Unverified budgets must remain unknown');
 keys(c.calculated,['bareFramePerimeterMm','completeBoxPerimeterMm','legality','physicalReachability']);check(c.calculated.bareFramePerimeterMm===2*(s.frame.lengthMm+s.frame.widthMm)&&c.calculated.completeBoxPerimeterMm===2*(expected.length+expected.width)&&c.calculated.legality==='not-established'&&c.calculated.physicalReachability==='not-assessed','No legality/reachability promotion');check(digest(c.openChecks)===digest(s.unknowns),'Preserve unresolved checks');
}
