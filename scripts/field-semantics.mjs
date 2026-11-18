import {validateReferenceGeometry} from './field-references.mjs';
// Shared field/game representation. Source authenticity and robot reachability are not inferred.
const check=(ok,message)=>{if(!ok)throw Error(message);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
export function validateFieldModel(model){
 check(model?.schema==='frc-field-semantics/v1','Unknown field schema');
 check(Number.isSafeInteger(model.season),'Field season required');
 for(const collection of ['sources','frames','locations','zones','obstacles'])check(Array.isArray(model[collection]),`Field ${collection} required`);
 const sourceIds=new Map();
 for(const source of model.sources){
  check(id(source.id)&&!sourceIds.has(source.id),'Duplicate/invalid field source');
  check(['rulebook','official-cad','official-drawing','team-update'].includes(source.kind),'Unknown field source kind');
  for(const field of ['url','revision','retrieved','locator'])check(typeof source[field]==='string'&&source[field].trim(),`Source ${field} required`);
  check(/^https:\/\//.test(source.url)&&/^[a-f0-9]{64}$/.test(source.sha256),'Source URL/hash required');
  check(source.season===model.season,'Field source season mismatch');sourceIds.set(source.id,source);
 }
 if(Object.hasOwn(model,'referenceGeometry')){
  validateReferenceGeometry(model.referenceGeometry,model.sources,model.season);
  check(model.frames.length===0&&model.zones.length===0&&model.obstacles.length===0&&model.locations.every(l=>l.geometry?.status==='unknown'),'Reference-only package cannot populate executable world geometry; a separately reviewed geometry schema is required');
 }
 const frames=new Set();
 for(const frame of model.frames){
  check(id(frame.id)&&!frames.has(frame.id),'Duplicate/invalid frame');
  check(['m','mm'].includes(frame.unit)&&[2,3].includes(frame.dimensions),'Explicit metric units and dimensions required');
  check(typeof frame.origin==='string'&&frame.origin.trim()&&typeof frame.axes==='string'&&frame.axes.trim(),'Frame origin/axes required');frames.add(frame.id);
 }
 const entities=new Set();
 for(const collection of ['locations','zones','obstacles'])for(const entity of model[collection]){
  check(id(entity.id)&&!entities.has(entity.id),'Duplicate/invalid field entity');entities.add(entity.id);
  if(collection==='locations')check(['scoring','retrieval'].includes(entity.purpose),'Location purpose required');
  check(entity.reachability==='not-assessed','Field geometry does not establish robot reachability');
  check(entity.semantics && typeof entity.semantics==='object','Game semantics required');
  for(const name of ['phases','conditions','possession','replenishment'])check(Object.hasOwn(entity.semantics,name),`Explicit ${name} or null (unknown) required`);
  check(Array.isArray(entity.semanticSourceRefs)&&entity.semanticSourceRefs.length>0,'Rule source references required');
  for(const ref of entity.semanticSourceRefs)check(['rulebook','team-update'].includes(sourceIds.get(ref)?.kind),'Semantics must cite rulebook/update source');
  const g=entity.geometry;check(g&&['unknown','sourced'].includes(g.status),'Geometry status required');
  if(g.status==='unknown'){
   check(typeof g.reason==='string'&&g.reason.trim(),'Unknown geometry reason required');
   check(!Object.hasOwn(g,'coordinates'),'Unknown geometry cannot invent coordinates');
  }else{
   check(frames.has(g.frame),'Unknown coordinate frame');
   const frame=model.frames.find(f=>f.id===g.frame);
   check(['point','polygon','box'].includes(g.shape),'Supported geometry shape required');
   check(Array.isArray(g.coordinates)&&g.coordinates.length>0,'Coordinates required');
   check(g.coordinates.every(p=>Array.isArray(p)&&p.length===frame.dimensions&&p.every(Number.isFinite)),'Coordinate dimensions/numbers invalid');
   check(g.shape!=='point'||g.coordinates.length===1,'Point requires one coordinate');
   check(g.shape!=='box'||g.coordinates.length===2,'Box requires two corners');
   check(g.shape!=='polygon'||g.coordinates.length>=3,'Polygon requires three vertices');
   check(g.uncertainty===null||(Number.isFinite(g.uncertainty)&&g.uncertainty>=0),'Uncertainty must be explicit, in frame units, or null');
   check(Array.isArray(g.sourceRefs)&&g.sourceRefs.length>0,'Geometry source references required');
   for(const ref of g.sourceRefs)check(['official-cad','official-drawing'].includes(sourceIds.get(ref)?.kind),'Geometry must cite official CAD/drawing source');
  }
 }
 return true;
}
