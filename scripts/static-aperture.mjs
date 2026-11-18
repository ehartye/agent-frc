import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateFieldModel} from './field-semantics.mjs';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
export const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const closed=(o,keys)=>{check(o&&typeof o==='object'&&!Array.isArray(o),'Object required');check(Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),'Missing or unsupported fields');};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const MODEL='frc-2026-static-aperture-screen/v1';
export const LIMITATIONS=Object.freeze([
 'Scalar drawing-limit comparison only; neither a certified rectangular free-space aperture nor collision-free passage.',
 'Closed and locked trench configuration; axis-aligned, stowed, static, upright hypothetical complete robot envelope only.',
 'No world coordinates, traversal depth, approach clearance, hardware protrusions, carpet variation, pitch/roll, deformation or dynamics modeled.',
 'Candidate dimensions and uncertainty are supplied design assumptions, not measured complete-robot performance or actual inventory.',
 'Source and artifact hashes establish consistency, not authenticity; event applicability and robot legality are unresolved.',
 'No conversion to travel time, acquisition, release, sensor passage, score, ranking or selected design; no decision-chain artifact is created.'
]);
const reviewed={welded:{width:50.34,sheet:8},andymark:{width:49.82,sheet:10}};
function aperture(pkg,variant){
 check(pkg?.schema==='frc-sourced-field-package/v1'&&pkg.season===2026&&pkg.fieldModel?.season===2026,'2026 sourced field package required');validateFieldModel(pkg.fieldModel);
 const spec=reviewed[variant];check(spec,'Explicit supported field variant required');
 const found=pkg.dimensions.filter(d=>d.id===`trench-${variant}-clearance`);check(found.length===1,'Exactly one selected aperture dimension required');const d=found[0];
 check(d.season===2026&&d.originalUnit==='inch','Aperture source unit/season mismatch');
 const locator=`2026-dimensions.pdf PDF p${spec.sheet} FE-2026 RevB sheet${spec.sheet}`;
 check(d.drawingLocator===locator&&d.sourceRef?.locator===locator,'Reviewed drawing locator mismatch');
 const s=pkg.fieldModel.sources.find(s=>s.id===d.sourceRef?.id);
 check(s?.id==='2026-dimensions.pdf'&&s.kind==='official-drawing'&&s.url==='https://firstfrc.blob.core.windows.net/frc2026/FieldAssets/2026-field-dimension-dwgs.pdf'&&s.sha256==='3e2c1a0c35424a66821186584dda4f6709221ac8eb88036e09091452b8235f82'&&s.revision==='FE-2026 Rev B 2026-02-26; GE-26500 Rev A; mixed other sheets'&&d.sourceRef.sha256===s.sha256&&d.sourceRef.revision===s.revision,'Reviewed aperture source pin mismatch');
 check(d.values?.width===spec.width&&d.values.height===22.25&&d.toleranceInch?.width===2&&d.toleranceInch.height===0.25,'Reviewed dimension/tolerance mismatch');
 for(const axis of ['width','height'])check(Number.isFinite(d.valuesMm?.[axis])&&Math.abs(d.valuesMm[axis]-d.values[axis]*25.4)<1e-6,'Aperture unit conversion mismatch');
 return {dimensionId:d.id,sourceRef:structuredClone(d.sourceRef),fieldVariant:variant,fieldConfiguration:'hinged-trenches-closed-and-locked',lowerLimitsMm:{width:(d.values.width-d.toleranceInch.width)*25.4,height:(d.values.height-d.toleranceInch.height)*25.4},geometryScope:'source-reviewed-scalar-dimensions-not-free-space',worldPlacement:null,traversalDepthMm:null};
}
export function assessStaticAperture(fieldPackage,candidate,request){
 check(Buffer.byteLength(JSON.stringify({candidate,request}),'utf8')<=16384,'Candidate/request size limit');
 closed(request,['fieldVariant','expectedFieldPackageSha256','expectedCandidateSha256','requiredMarginMm']);
 check(hash(request.expectedFieldPackageSha256)&&request.expectedFieldPackageSha256===digest(fieldPackage),'Field package pin mismatch');
 check(hash(request.expectedCandidateSha256)&&request.expectedCandidateSha256===digest(candidate),'Candidate pin mismatch');
 const a=aperture(fieldPackage,request.fieldVariant);
 closed(candidate,['schema','id','basis','configuration','alignment','footprintReference','dimensionsMm','uncertaintyMm','assumptionStatement','sourceArtifactPin']);
 check(candidate.schema==='frc-static-envelope-input/v1'&&id(candidate.id)&&candidate.basis==='hypothetical-design-assumption','Explicit hypothetical candidate required');
 check(typeof candidate.assumptionStatement==='string'&&candidate.assumptionStatement.trim()&&candidate.assumptionStatement.length<=4096,'Bounded candidate assumption statement required');
 check(['stowed-static-upright','unknown'].includes(candidate.configuration)&&['width-across-aperture','unknown'].includes(candidate.alignment)&&['complete-robot-including-bumpers','unknown'].includes(candidate.footprintReference),'Unsupported candidate configuration/scope');
 closed(candidate.sourceArtifactPin,['id','revision','sha256']);check(id(candidate.sourceArtifactPin.id)&&Number.isSafeInteger(candidate.sourceArtifactPin.revision)&&candidate.sourceArtifactPin.revision>0&&hash(candidate.sourceArtifactPin.sha256),'Candidate artifact pin required');
 for(const k of ['dimensionsMm','uncertaintyMm']){closed(candidate[k],['length','width','height']);for(const v of Object.values(candidate[k]))check(v===null||(Number.isFinite(v)&&(k==='dimensionsMm'?v>0:v>=0)&&v<=100000),'Invalid candidate dimension/uncertainty');}
 closed(request.requiredMarginMm,['width','height']);for(const v of Object.values(request.requiredMarginMm))check(v===null||(Number.isFinite(v)&&v>0&&v<=100000),'Invalid dimensional margin');
 const scopeKnown=candidate.configuration==='stowed-static-upright'&&candidate.alignment==='width-across-aperture'&&candidate.footprintReference==='complete-robot-including-bumpers';
 const axes={};for(const axis of ['width','height']){
  const nominal=candidate.dimensionsMm[axis],uncertainty=candidate.uncertaintyMm[axis],reserve=request.requiredMarginMm[axis];
  const known=scopeKnown&&nominal!==null&&uncertainty!==null&&reserve!==null;
  const upper=known?nominal+uncertainty:null,remaining=known?a.lowerLimitsMm[axis]-upper-reserve:null;
  axes[axis]={fieldLowerLimitMm:a.lowerLimitsMm[axis],candidateUpperMm:upper,requiredDimensionalMarginMm:reserve,remainingMarginMm:remaining,status:!known?'unresolved':remaining>1e-6?'within-conservative-scalar-limit':remaining< -1e-6?'exceeds-conservative-scalar-limit':'boundary-unresolved'};
 }
 const statuses=Object.values(axes).map(x=>x.status);
 const status=statuses.includes('exceeds-conservative-scalar-limit')?'exceeds-conservative-scalar-limit':statuses.every(s=>s==='within-conservative-scalar-limit')?'within-conservative-scalar-limits-only':'unresolved';
 return {schema:'frc-static-aperture-assessment/v1',model:MODEL,modelSourceSha256:digest(Object.fromEntries(['static-aperture.mjs','field-semantics.mjs','field-references.mjs'].map(f=>[f,fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')]))),modelSourceFiles:['static-aperture.mjs','field-semantics.mjs','field-references.mjs'],fieldPackageSha256:request.expectedFieldPackageSha256,candidateSha256:request.expectedCandidateSha256,requestSha256:digest(request),candidate:structuredClone(candidate),request:structuredClone(request),aperture:a,axes,status,marginConvention:'Total reserve per dimension, not per-side clearance; comparison epsilon 0.000001 mm is numerical only, not physical uncertainty.',unassessedDimensions:['length'],limitations:[...LIMITATIONS],sourceArtifactVerification:'pin-recorded-not-authenticated-or-resolved',eventApplicability:'unresolved',collisionFree:null,traversable:null,robotLegality:null,travelTimeSeconds:null,retrievedPieces:null,matchScore:null,selectedCandidate:null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{check(process.argv.length===5,'Usage: node scripts/static-aperture.mjs field-package.json candidate.json request.json');const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));console.log(JSON.stringify(assessStaticAperture(read(process.argv[2]),read(process.argv[3]),read(process.argv[4])),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}


