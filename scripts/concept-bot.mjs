// Concept bot: one season-neutral JSON document per candidate robot, schema agent-frc/concept-bot@1.
// Units are inches, seconds and degrees. Two shapes carry every physical number:
//   quantity  {"value": n, "label": "required"|"assumed"|"observed", "basis": "<text>"}
//   range     {"min": n, "max": n, "label": ..., "basis": ...} with min <= max; a fixed value is min == max.
// An elevation or turret range also carries "slewDegS": a quantity, or null when nothing moves.
// A turret range is measured from the face normal and must include 0, where every match starts.
// Every number lies inside its VALIDITY range; capacities are integers. Unknown fields are rejected.
// compileConceptBot unwraps the document into the rehearsal robot record: the body fields the
// engine already reads plus a `concept` block of plain numbers.
// applyProfileDefaults lists each field it fills under `defaultsApplied`. The concept digest hashes the
// source document, without those fields and that list, so one file has one digest under any profile.
import { createHash } from 'node:crypto';
import { framePlan } from './frame-profile.mjs';

export const CONCEPT_SCHEMA='agent-frc/concept-bot@1';
export const LABELS=Object.freeze(['required','assumed','observed']);
export const FACES=Object.freeze(['front','back','left','right']);
// Field path (array index as [], capacity key as *) -> [lo, hi], inclusive.
export const VALIDITY=Object.freeze({
  'body.frameLengthIn':[1,300],'body.frameWidthIn':[1,300],'body.bumperIn':[0,12],
  'body.stowedHeightIn':[1,300],'body.maxHeightIn':[1,300],'body.maxReachIn':[0,300],
  'massLb':[0,500],
  'drive.topSpeedInS':[1,500],'drive.accelInS2':[1,2000],'drive.rotationDegS':[1,2000],
  'inputs[].widthIn':[1,300],'inputs[].extensionIn':[0,300],'inputs[].headingToleranceDeg':[0,180],
  'inputs[].acquireHeightIn':[0,300],'inputs[].secondsPerPiece':[0.01,60],
  'storage.capacity.*':[1,50],'storage.transferS':[0,60],
  'outputs[].secondsPerPiece':[0.01,60],'outputs[].successFraction':[0,1],
  'outputs[].place.standOffIn':[0,300],'outputs[].place.headingToleranceDeg':[0,180],'outputs[].place.releaseHeightIn':[0,300],
  'outputs[].ranged.releaseHeightIn':[0,300],'outputs[].ranged.launchSpeedInS':[1,2000],
  'outputs[].ranged.elevationDeg':[-90,90],'outputs[].ranged.elevationDeg.slewDegS':[1,5000],
  'outputs[].ranged.turret':[-180,180],'outputs[].ranged.turret.slewDegS':[1,5000],
  'outputs[].ranged.aimToleranceDeg':[0,180],
  'outputs[].ranged.firesWhileMoving.maxRobotSpeedInS':[1,500],'outputs[].ranged.firesWhileMoving.successFraction':[0,1],
});
const INTEGER=new Set(['storage.capacity.*']);
// Fields applyProfileDefaults may fill from the profile.
const DEFAULTABLE=Object.freeze(['massLb']);

const fail=(path,message)=>{throw Error(path+': '+message);};
const text=s=>typeof s==='string'&&s.trim().length>0;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const at=(path,key)=>path?path+'.'+key:key;
const generic=path=>path.replace(/\[\d+\]/g,'[]').replace(/^storage\.capacity\..+$/,'storage.capacity.*');
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':
  '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';

function fields(o,path,required,optional=[]) {
  if(!object(o))fail(path||'concept','supply an object.');
  for(const k of required)if(o[k]===undefined)fail(at(path,k),'is required.');
  for(const k of Object.keys(o))if(!required.includes(k)&&!optional.includes(k))fail(at(path,k),'is not a concept-bot field.');
  return o;
}
function provenance(o,path) {
  if(!LABELS.includes(o.label))fail(path+'.label','use required, assumed or observed.');
  if(!text(o.basis))fail(path+'.basis','state the basis for this value.');
}
function number(n,path,where=path) {
  const [lo,hi]=VALIDITY[generic(path)];
  if(!Number.isFinite(n)||n<lo||n>hi)fail(where,'must lie within '+lo+' to '+hi+'.');
  if(INTEGER.has(generic(path))&&!Number.isInteger(n))fail(where,'must be a whole number.');
  return n;
}
function quantity(o,path) {
  if(!object(o))fail(path,'supply a {value, label, basis} quantity.');
  fields(o,path,['value','label','basis']);provenance(o,path);
  return number(o.value,path);
}
function range(o,path,optional=[]) {
  if(!object(o))fail(path,'supply a {min, max, label, basis} range.');
  fields(o,path,['min','max','label','basis'],optional);provenance(o,path);
  const min=number(o.min,path,path+'.min'),max=number(o.max,path,path+'.max');
  if(min>max)fail(path,'min '+min+' exceeds max '+max+'.');
  return {min,max};
}
// An adjustable range (min < max) needs a slew rate; a fixed one may give null or omit it.
function slewing(o,path) {
  const {min,max}=range(o,path,['slewDegS']);
  const slew=o.slewDegS??null;
  if(slew===null&&min<max)fail(path+'.slewDegS','an adjustable range needs a slew rate.');
  return {min,max,slewDegS:slew===null?null:quantity(slew,path+'.slewDegS')};
}
function flag(v,path) {
  if(typeof v!=='boolean')fail(path,'use true or false.');
  return v;
}
function pieces(list,path) {
  if(!Array.isArray(list)||!list.length||!list.every(text)||new Set(list).size!==list.length)
    fail(path,'list one or more distinct piece types.');
  return [...list];
}
function face(v,path) {
  if(!FACES.includes(v))fail(path,'use front, back, left or right.');
  return v;
}

function parse(doc) {
  fields(doc,'',['schema','id','name','basis','body','drive','inputs','storage','outputs','concurrency'],['massLb','defaultsApplied']);
  if(doc.schema!==CONCEPT_SCHEMA)fail('schema','use '+CONCEPT_SCHEMA+'.');
  const defaulted=doc.defaultsApplied ?? [];
  if(!Array.isArray(defaulted)||new Set(defaulted).size!==defaulted.length||
    !defaulted.every(k=>DEFAULTABLE.includes(k)&&doc[k]?.default===true))
    fail('defaultsApplied','list only profile defaults the document carries: massLb with default true.');
  if(typeof doc.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(doc.id))fail('id','use letters, digits, dot, dash or underscore.');
  for(const k of ['name','basis'])if(!text(doc[k]))fail(k,'supply a non-empty string.');

  const b=fields(doc.body,'body',['frameLengthIn','frameWidthIn','bumperIn','stowedHeightIn','maxHeightIn','maxReachIn'],['frameProfile']);
  const body=Object.fromEntries(['frameLengthIn','frameWidthIn','bumperIn','stowedHeightIn','maxHeightIn','maxReachIn']
    .map(k=>[k,quantity(b[k],'body.'+k)]));
  if(body.maxHeightIn<body.stowedHeightIn)fail('body.maxHeightIn','must not be below body.stowedHeightIn.');
  if(b.frameProfile!==undefined){
    try{framePlan(body.frameLengthIn,body.frameWidthIn,b.frameProfile,body.bumperIn,25.4);}
    catch(e){fail('body.frameProfile',e.message);}
  }

  let massLb=null;
  if(doc.massLb!==undefined){
    massLb={...range(doc.massLb,'massLb',['default']),label:doc.massLb.label,default:false};
    if(doc.massLb.default!==undefined)massLb.default=flag(doc.massLb.default,'massLb.default');
  }

  const d=fields(doc.drive,'drive',['type','topSpeedInS','accelInS2','rotationDegS']);
  if(d.type!=='swerve')fail('drive.type','v1 admits only swerve.');
  const drive={type:'swerve',topSpeedInS:quantity(d.topSpeedInS,'drive.topSpeedInS'),
    accelInS2:quantity(d.accelInS2,'drive.accelInS2'),rotationDegS:quantity(d.rotationDegS,'drive.rotationDegS')};

  const span=f=>(f==='front'||f==='back'?body.frameWidthIn:body.frameLengthIn)+2*body.bumperIn;
  const ids=new Set();
  const port=(p,path)=>{
    if(typeof p?.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p.id))fail(path+'.id','use letters, digits, dot, dash or underscore.');
    if(ids.has(p.id))fail(path+'.id','"'+p.id+'" is already used by another port.');
    ids.add(p.id);
  };
  if(!Array.isArray(doc.inputs))fail('inputs','supply an array of input ports.');
  const inputs=doc.inputs.map((p,i)=>{
    const path='inputs['+i+']';
    fields(p,path,['id','face','widthIn','extensionIn','pieces','headingToleranceDeg','acquireHeightIn','secondsPerPiece','requiresStop']);
    port(p,path);
    const side=face(p.face,path+'.face'),widthIn=quantity(p.widthIn,path+'.widthIn');
    if(widthIn>span(side))fail(path+'.widthIn','must fit the bumpered '+side+' face ('+span(side)+' in).');
    return {id:p.id,face:side,widthIn,extensionIn:quantity(p.extensionIn,path+'.extensionIn'),pieces:pieces(p.pieces,path+'.pieces'),
      headingToleranceDeg:quantity(p.headingToleranceDeg,path+'.headingToleranceDeg'),
      acquireHeightIn:range(p.acquireHeightIn,path+'.acquireHeightIn'),
      secondsPerPiece:quantity(p.secondsPerPiece,path+'.secondsPerPiece'),requiresStop:flag(p.requiresStop,path+'.requiresStop')};
  });

  const s=fields(doc.storage,'storage',['capacity','transferS']);
  if(!object(s.capacity))fail('storage.capacity','map each piece type to a capacity quantity.');
  const storage={capacity:Object.fromEntries(Object.entries(s.capacity).map(([k,q])=>[k,quantity(q,'storage.capacity.'+k)])),
    transferS:quantity(s.transferS,'storage.transferS')};

  if(!Array.isArray(doc.outputs))fail('outputs','supply an array of output ports.');
  const outputs=doc.outputs.map((p,i)=>{
    const path='outputs['+i+']',kind=p?.kind;
    if(kind!=='place'&&kind!=='ranged')fail(path+'.kind','use place or ranged.');
    fields(p,path,['id','face','kind','pieces','secondsPerPiece','requiresStop','successFraction',kind]);
    port(p,path);
    const out={id:p.id,face:face(p.face,path+'.face'),kind,pieces:pieces(p.pieces,path+'.pieces'),
      secondsPerPiece:quantity(p.secondsPerPiece,path+'.secondsPerPiece'),requiresStop:flag(p.requiresStop,path+'.requiresStop'),
      successFraction:quantity(p.successFraction,path+'.successFraction')};
    const sub=path+'.'+kind;
    if(kind==='place'){
      const q=fields(p.place,sub,['standOffIn','headingToleranceDeg','releaseHeightIn']);
      out.place={standOffIn:range(q.standOffIn,sub+'.standOffIn'),headingToleranceDeg:quantity(q.headingToleranceDeg,sub+'.headingToleranceDeg'),
        releaseHeightIn:range(q.releaseHeightIn,sub+'.releaseHeightIn')};
    }else{
      const q=fields(p.ranged,sub,['releaseHeightIn','launchSpeedInS','elevationDeg','turret','aimToleranceDeg','firesWhileMoving']);
      let turret=null;
      if(q.turret!==null){
        const t=slewing(q.turret,sub+'.turret');
        if(t.min===t.max)fail(sub+'.turret','a turret needs travel (min < max); use null for none.');
        if(t.min>0||t.max<0)fail(sub+'.turret','must include 0, the face normal where each match starts.');
        turret={minDeg:t.min,maxDeg:t.max,slewDegS:t.slewDegS};
      }
      let moving=false;
      if(q.firesWhileMoving!==false){
        const m=fields(q.firesWhileMoving,sub+'.firesWhileMoving',['maxRobotSpeedInS','successFraction']);
        moving={maxRobotSpeedInS:quantity(m.maxRobotSpeedInS,sub+'.firesWhileMoving.maxRobotSpeedInS'),
          successFraction:quantity(m.successFraction,sub+'.firesWhileMoving.successFraction')};
      }
      out.ranged={releaseHeightIn:quantity(q.releaseHeightIn,sub+'.releaseHeightIn'),launchSpeedInS:range(q.launchSpeedInS,sub+'.launchSpeedInS'),
        elevationDeg:slewing(q.elevationDeg,sub+'.elevationDeg'),turret,
        aimToleranceDeg:quantity(q.aimToleranceDeg,sub+'.aimToleranceDeg'),firesWhileMoving:moving};
    }
    return out;
  });
  for(const [list,name] of [[inputs,'inputs'],[outputs,'outputs']])list.forEach((p,i)=>p.pieces.forEach(piece=>{
    if(!Object.hasOwn(storage.capacity,piece))fail('storage.capacity.'+piece,'is required: '+name+'['+i+'] handles '+piece+'.');
  }));

  const c=fields(doc.concurrency,'concurrency',['intakeWhileScoring']);
  const concurrency={intakeWhileScoring:flag(c.intakeWhileScoring,'concurrency.intakeWhileScoring')};
  return {body,frameProfile:b.frameProfile,massLb,drive,inputs,storage,outputs,concurrency};
}

// Throws an Error that names the offending field path; returns the document when it is valid.
export function validateConceptBot(doc) {
  parse(doc);
  return doc;
}

// Returns a copy with profile-derived defaults: a missing mass becomes 75–95% of the inspection limit.
export function applyProfileDefaults(doc,profile) {
  const copy=structuredClone(doc), limit=profile?.rehearsal?.robotLimits?.massLb;
  const value=typeof limit==='number'?limit:limit?.value;
  if(copy?.massLb===undefined&&Number.isFinite(value)&&value>0){
    copy.massLb={min:0.75*value,max:0.95*value,label:'assumed',
      basis:'Default 75–95% of the inspection limit ('+(text(limit?.factId)?limit.factId:'robotLimits.massLb')+')',default:true};
    copy.defaultsApplied=[...(copy.defaultsApplied ?? []),'massLb'];
  }
  return copy;
}

// The source document: the validated document without its profile defaults.
function source(doc) {
  const {defaultsApplied=[],...rest}=doc;
  for(const k of defaultsApplied)delete rest[k];
  return rest;
}

export function compileConceptBot(doc) {
  const {body,frameProfile,...c}=parse(doc);
  return {length:body.frameLengthIn,width:body.frameWidthIn,height:body.stowedHeightIn,bumper:body.bumperIn,speed:c.drive.topSpeedInS,
    ...(frameProfile===undefined?{}:{frameProfile:structuredClone(frameProfile)}),
    concept:{id:doc.id,digest:createHash('sha256').update(canonical(source(doc))).digest('hex'),defaultsApplied:[...(doc.defaultsApplied ?? [])],drive:c.drive,
      body:{maxHeightIn:body.maxHeightIn,maxReachIn:body.maxReachIn},massLb:c.massLb,inputs:c.inputs,storage:c.storage,
      outputs:c.outputs,concurrency:c.concurrency}};
}
