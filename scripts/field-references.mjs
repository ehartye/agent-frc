import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const closed=(o,keys)=>{check(o&&typeof o==='object'&&!Array.isArray(o),'Reference object required');for(const k of Object.keys(o))check(keys.includes(k),'Unknown reference field '+k);for(const k of keys)check(Object.hasOwn(o,k),'Missing reference field '+k);};
const text=x=>typeof x==='string'&&x.trim().length>0;
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
export const REFERENCE_USES=Object.freeze(['visualization','preliminary-strategy-reference']);
export const FORBIDDEN_USES=Object.freeze(['robot-goal','approach-pose','collision','path-planning','path-execution','drivetrain-feasibility','scoring-success','pickup-availability','certified-transform']);
const same=(a,b)=>digest(a)===digest(b);
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
function sourcePin(pin,sources,kind,season){closed(pin,['id','revision','sha256']);check(ident(pin.id)&&text(pin.revision)&&/^[a-f0-9]{64}$/.test(pin.sha256),'Invalid reference source pin');const s=sources.find(s=>s.id===pin.id);check(s&&typeof s.url==='string'&&s.url.startsWith('https://')&&s.kind===kind&&s.season===season&&s.revision===pin.revision&&s.sha256===pin.sha256,'Reference source pin mismatch');}
export function validateReferenceGeometry(c,sources,season){
 check(Array.isArray(sources)&&new Set(sources.map(s=>s.id)).size===sources.length,'Unique reference source catalog required');
 closed(c,['schema','season','revision','status','frames','features','cadCandidates','coverage','auditLimitations']);
 check(c.schema==='frc-nominal-field-references/v1'&&c.season===season&&Number.isSafeInteger(season)&&Number.isSafeInteger(c.revision)&&c.revision>0,'Reference schema/season/revision mismatch');
 check(c.status==='reference-only'&&text(c.coverage)&&Array.isArray(c.auditLimitations)&&c.auditLimitations.length>0,'Reference status/coverage required');
 check(Array.isArray(c.frames)&&c.frames.length<=8&&Array.isArray(c.features)&&c.features.length<=256&&Array.isArray(c.cadCandidates)&&c.cadCandidates.length<=8,'Reference collection limit');
 const frames=new Map(),ids=new Set();
 for(const f of c.frames){closed(f,['id','variant','unit','dimensions','origin','axes','sourcePin','locator','certifiedCadTransform']);check(ident(f.id)&&!frames.has(f.id),'Duplicate/invalid reference frame');check(ident(f.variant)&&f.unit==='mm'&&f.dimensions===3&&text(f.origin)&&text(f.axes)&&text(f.locator),'Explicit reference frame/units required');check(f.certifiedCadTransform===null,'Reference frame cannot carry certified transform');sourcePin(f.sourcePin,sources,'official-drawing',season);frames.set(f.id,f);}
 for(const r of c.features){
  closed(r,['id','role','shape','variant','alliance','frame','coordinatesMm','originalInches','sourcePin','locator','derivation','status','confidence','uncertaintyMm','reachability','allowedUses','forbiddenUses']);
  check(ident(r.id)&&!ids.has(r.id),'Duplicate/invalid feature reference');ids.add(r.id);const f=frames.get(r.frame);
  check(f&&r.variant===f.variant&&['blue','red'].includes(r.alliance),'Mixed reference variant/frame/alliance');
  check(r.status==='nominal-reference'&&r.uncertaintyMm===null&&r.reachability==='not-assessed','Nominal references cannot be promoted to verified geometry/reachability');
  check(same(r.allowedUses,REFERENCE_USES)&&same(r.forbiddenUses,FORBIDDEN_USES),'Reference uses cannot be broadened');
  check(text(r.locator)&&text(r.derivation),'Reference derivation/locator required');sourcePin(r.sourcePin,sources,'official-drawing',season);check(same(r.sourcePin,f.sourcePin),'Mixed frame/feature source revision');
  const line=r.shape==='line';check(ident(r.role) && (line || r.shape==='point'),'Explicit role and supported shape required');
  check(r.confidence===(line?'nominal-layout-inference':'drawing-derived-nominal'),'Role/shape/confidence mismatch');
  check(Array.isArray(r.coordinatesMm)&&r.coordinatesMm.length===(line?2:1)&&r.coordinatesMm.every(point),'Invalid reference coordinates');
  if(line)check(r.originalInches===null&&r.coordinatesMm.every(p=>p[2]===0),'Layout line is only a ground-projected reference');
  else check(point(r.originalInches)&&r.originalInches.every((v,i)=>Math.abs(v*25.4-r.coordinatesMm[0][i])<1e-6),'Reference unit conversion mismatch');
 }
 for(const t of c.cadCandidates){
  closed(t,['id','variant','targetFrame','sourcePin','targetSourcePin','inputUnit','outputUnit','matrix','status','allowedUses','certified','reason']);
  check(ident(t.id)&&!ids.has(t.id),'Duplicate/invalid transform candidate');ids.add(t.id);const f=frames.get(t.targetFrame);
  check(f && t.variant===f.variant&&t.inputUnit==='mm'&&t.outputUnit==='mm','Candidate must use its declared frame and millimetres');
  check(t.status==='candidate-not-certified'&&t.certified===false&&same(t.allowedUses,['inspection-only'])&&text(t.reason),'Candidate transform cannot be promoted');
  sourcePin(t.sourcePin,sources,'official-cad',season);sourcePin(t.targetSourcePin,sources,'official-drawing',season);check(same(t.targetSourcePin,f.sourcePin),'Transform target source mismatch');
  check(Array.isArray(t.matrix)&&t.matrix.length===4&&t.matrix.every(row=>Array.isArray(row)&&row.length===4&&row.every(Number.isFinite))&&same(t.matrix[3],[0,0,0,1]),'Invalid inspection-only candidate matrix');
 }
 return true;
}
function prepare(pkg,request){
 check(pkg?.schema==='frc-sourced-field-package/v1'&&Number.isSafeInteger(pkg.season)&&pkg.fieldModel?.season===pkg.season,'Sourced project field package required');
 check(request.expectedPackageSha256===digest(pkg),'Field reference package hash mismatch');
 check(ident(request.fieldVariant),'Explicit field variant required');
 const c=pkg.fieldModel.referenceGeometry;check(c,'No nominal reference catalog');validateReferenceGeometry(c,pkg.fieldModel.sources,pkg.season);return c;
}
export function getFieldReference(pkg,request){
 closed(request,['featureId','fieldVariant','expectedFrameId','intendedUse','expectedPackageSha256']);
 check(REFERENCE_USES.includes(request.intendedUse),'Nominal reference use is prohibited');const c=prepare(pkg,request),r=c.features.find(x=>x.id===request.featureId);
 check(r&&r.variant===request.fieldVariant&&r.frame===request.expectedFrameId,'Reference ID/variant/frame mismatch');const frame=c.frames.find(f=>f.id===r.frame);
 return structuredClone({fieldPackageSha256:request.expectedPackageSha256,referenceCatalogSha256:digest(c),intendedUse:request.intendedUse,reference:r,frame,limitations:c.auditLimitations,physicalReachability:'not-assessed'});
}
export function inspectCadCandidate(pkg,request){
 closed(request,['candidateId','fieldVariant','intendedUse','expectedPackageSha256']);check(request.intendedUse==='inspection-only','Candidate transform cannot be applied');const c=prepare(pkg,request),candidate=c.cadCandidates.find(t=>t.id===request.candidateId&&t.variant===request.fieldVariant);check(candidate,'No candidate for this explicit variant');
 return structuredClone({fieldPackageSha256:request.expectedPackageSha256,candidate,executionAllowed:false,limitations:c.auditLimitations});
}
