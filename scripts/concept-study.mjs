// Concept study sweep expansion: turn an alliance-study@1 study whose roles pin concept bots into the base roles
// plus one-at-a-time assumption variants, ready for compareRoles.
//
// expandConceptStudy(study, documentsByRole) -> {baseRoles, axes, variants, roles}
//   study            an agent-frc/alliance-study@1 study. A role may pin a concept with `concept: {file, sha256}`.
//                    `conceptSweeps` is optional: {defaults: true|false (default true), axes: {<roleId>: [{pointer, values[]}]}}.
//   documentsByRole  {<roleId>: <concept-bot@1 document>} (an object or a Map) for every role that pins a concept,
//                    already read and pin-checked by the caller. Each base document must be valid.
//   baseRoles        the study's roles, unchanged, in study order. A study needs 2 to 8 of them.
//   axes             [{baseRole, pointer, label, base, values, source: 'default'|'explicit'}]: each swept quantity,
//                    with `values` ascending and including the base value (the point the base role itself plays).
//   variants         [{id, baseRole, pointer, value, document|null, status: 'ok'|'invalid', error?}]: one per axis
//                    value other than the base. An invalid variant has `document: null` and the validator's message.
//   roles            baseRoles followed by one role per `ok` variant, in axis order: the base role with
//                    id `<role>@<pointer>=<value>`, a basis that names the sweep and `concept: {id: <variant concept id>}`.
//                    Plans and endgame are the base role's.
//
// Sweepable quantities are JSON Pointers to a quantity's value: /drive/topSpeedInS/value, /drive/accelInS2/value,
// /drive/rotationDegS/value, /inputs/<i>/secondsPerPiece/value, /storage/capacity/<type>/value,
// /storage/transferS/value, /outputs/<i>/secondsPerPiece/value, /outputs/<i>/successFraction/value and
// /outputs/<i>/ranged/firesWhileMoving/successFraction/value. Ranges ({min, max}) are never swept.
// Defaults sweep each sweepable quantity labelled `assumed` over base × {0.5, 0.75, 1, 1.25, 1.5}, clipped to its
// VALIDITY range; capacities are rounded to whole pieces; duplicates are removed. An explicit axis replaces the
// default for its pointer, may name a sweepable quantity of any label and takes 2 to 9 distinct values including
// the base value. Explicit values are not clipped or rounded: one the validator rejects makes an invalid variant.
// Every value is rounded to 12 significant digits, so 0.4 × 0.75 is 0.3.
//
// A variant document is the base document with one quantity changed: its `value`, and its `basis`, which names the
// sweep. Its concept `id` is `<base id>.<pointer without the leading / and trailing /value, / as .>.<value>`, with
// any character a concept ID does not allow replaced by `_`, for example `turret-shooter.drive.topSpeedInS.90`.
// Its `name` gets the same suffix in parentheses. Two roles that pin the same concept derive the same document for
// the same pointer and value, so an embedder keeps one copy per ID. A derived ID that would name two different
// documents is an error.
import { VALIDITY, validateConceptBot } from './concept-bot.mjs';

export const SWEEP_MULTIPLIERS=Object.freeze([0.5,0.75,1,1.25,1.5]);
const MIN_ROLES=2, MAX_ROLES=8, MIN_VALUES=2, MAX_VALUES=9;

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const quantity=x=>object(x)&&Number.isFinite(x.value)&&typeof x.label==='string';
const tidy=n=>Number(n.toPrecision(12));
const escape=key=>String(key).replace(/~/g,'~0').replace(/\//g,'~1');
const unescape=key=>key.replace(/~1/g,'/').replace(/~0/g,'~');
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':
  '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';

// Every sweepable quantity of a document, in document order: [{pointer, validity, integer, label, base}].
export function sweepableQuantities(doc) {
  const found=[];
  const add=(segments,field,q)=>{
    if(!quantity(q))return;
    found.push({pointer:'/'+[...segments.map(escape),'value'].join('/'),validity:VALIDITY[field],
      integer:field==='storage.capacity.*',label:q.label,base:q.value});
  };
  for(const k of ['topSpeedInS','accelInS2','rotationDegS'])add(['drive',k],'drive.'+k,doc.drive?.[k]);
  (doc.inputs??[]).forEach((p,i)=>add(['inputs',i,'secondsPerPiece'],'inputs[].secondsPerPiece',p?.secondsPerPiece));
  for(const [type,q] of Object.entries(doc.storage?.capacity??{}))add(['storage','capacity',type],'storage.capacity.*',q);
  add(['storage','transferS'],'storage.transferS',doc.storage?.transferS);
  (doc.outputs??[]).forEach((p,i)=>{
    add(['outputs',i,'secondsPerPiece'],'outputs[].secondsPerPiece',p?.secondsPerPiece);
    add(['outputs',i,'successFraction'],'outputs[].successFraction',p?.successFraction);
    if(object(p?.ranged?.firesWhileMoving))add(['outputs',i,'ranged','firesWhileMoving','successFraction'],
      'outputs[].ranged.firesWhileMoving.successFraction',p.ranged.firesWhileMoving.successFraction);
  });
  return found;
}

function defaultValues({base,validity:[lo,hi],integer}) {
  const values=SWEEP_MULTIPLIERS.map(m=>{
    const v=integer?Math.round(base*m):tidy(base*m);
    return Math.min(hi,Math.max(lo,v));
  });
  return [...new Set(values)];
}

function explicitValues(roleId,axis,q) {
  if(!Array.isArray(axis.values)||axis.values.length<MIN_VALUES||axis.values.length>MAX_VALUES||!axis.values.every(Number.isFinite))
    throw Error('conceptSweeps.axes.'+roleId+' '+axis.pointer+': give 2–9 values.');
  const values=axis.values.map(tidy);
  if(new Set(values).size!==values.length)throw Error('conceptSweeps.axes.'+roleId+' '+axis.pointer+': values must be distinct.');
  if(!values.includes(tidy(q.base)))
    throw Error('conceptSweeps.axes.'+roleId+' '+axis.pointer+': include the base value '+q.base+'.');
  return values.sort((a,b)=>a-b);
}

function quantityAt(doc,pointer) {
  return pointer.split('/').slice(1,-1).map(unescape).reduce((o,k)=>o[k],doc);
}

// The sweep tag of a variant: the pointer without its leading / and trailing /value, / as ., then the value.
const sweepTag=(pointer,value)=>pointer.replace(/^\//,'').replace(/\/value$/,'').split('/').map(unescape).join('.')+'.'+value;
export const variantConceptId=(baseId,pointer,value)=>(baseId+'.'+sweepTag(pointer,value)).replace(/[^A-Za-z0-9._-]/g,'_');

function readSweeps(study) {
  const s=study.conceptSweeps??{};
  if(!object(s)||Object.keys(s).some(k=>k!=='defaults'&&k!=='axes'))
    throw Error('conceptSweeps: supply {defaults, axes}.');
  if(s.defaults!==undefined&&typeof s.defaults!=='boolean')throw Error('conceptSweeps.defaults: use true or false.');
  const axes=s.axes??{};
  if(!object(axes))throw Error('conceptSweeps.axes: map each role ID to a list of {pointer, values}.');
  return {defaults:s.defaults??true,axes};
}

export function expandConceptStudy(study,documentsByRole) {
  const docs=documentsByRole instanceof Map?documentsByRole:new Map(Object.entries(documentsByRole??{}));
  if(!Array.isArray(study?.roles)||study.roles.length<MIN_ROLES||study.roles.length>MAX_ROLES)
    throw Error('A concept study needs 2–8 base roles.');
  const baseRoles=study.roles, ids=new Set(baseRoles.map(r=>r?.id));
  const {defaults,axes:explicit}=readSweeps(study);
  for(const roleId of Object.keys(explicit)){
    if(!ids.has(roleId))throw Error('conceptSweeps.axes.'+roleId+': is not a role in this study.');
    if(!docs.has(roleId))throw Error('conceptSweeps.axes.'+roleId+': the role pins no concept.');
  }

  const axes=[], variants=[], roles=[...baseRoles], derived=new Map();
  for(const role of baseRoles){
    if(!role?.concept)continue;
    const base=docs.get(role.id);
    if(!base)throw Error('Role '+role.id+' pins a concept that was not supplied.');
    try{validateConceptBot(base);}catch(e){throw Error('Role '+role.id+' concept '+(role.concept.file??'')+': '+e.message);}
    if(derived.has(base.id)&&derived.get(base.id)!==canonical(base))
      throw Error('Concept ID '+base.id+' names two different documents.');
    derived.set(base.id,canonical(base));
    const quantities=sweepableQuantities(base), given=explicit[role.id]??[];
    if(!Array.isArray(given))throw Error('conceptSweeps.axes.'+role.id+': supply a list of {pointer, values}.');
    const chosen=new Map();
    for(const axis of given){
      const q=quantities.find(x=>x.pointer===axis?.pointer);
      if(!q)throw Error('conceptSweeps.axes.'+role.id+' '+axis?.pointer+': is not a sweepable quantity of '+base.id+'.');
      if(chosen.has(q.pointer))throw Error('conceptSweeps.axes.'+role.id+' '+q.pointer+': appears twice.');
      chosen.set(q.pointer,{values:explicitValues(role.id,axis,q),source:'explicit'});
    }
    for(const q of quantities){
      const axis=chosen.get(q.pointer)??(defaults&&q.label==='assumed'?{values:defaultValues(q),source:'default'}:null);
      if(!axis||axis.values.length<2)continue;
      axes.push({baseRole:role.id,pointer:q.pointer,label:q.label,base:q.base,values:axis.values,source:axis.source});
      for(const value of axis.values){
        if(value===tidy(q.base))continue;
        const id=role.id+'@'+q.pointer+'='+value;
        const document=structuredClone(base), target=quantityAt(document,q.pointer);
        document.id=variantConceptId(base.id,q.pointer,value);
        document.name=base.name+' ('+sweepTag(q.pointer,value)+')';
        target.value=value;
        target.basis='Concept study sweep of '+q.pointer+' to '+value+' from the base value '+q.base+
          '; every other quantity is held at base. Base basis: '+target.basis;
        try{validateConceptBot(document);}
        catch(e){variants.push({id,baseRole:role.id,pointer:q.pointer,value,document:null,status:'invalid',error:e.message});continue;}
        const key=canonical(document);
        if(derived.has(document.id)&&derived.get(document.id)!==key)
          throw Error('Variant concept ID '+document.id+' would name two different documents; rename a concept or piece type.');
        derived.set(document.id,key);
        variants.push({id,baseRole:role.id,pointer:q.pointer,value,document,status:'ok'});
        roles.push({...role,id,basis:role.basis+' Sweep: '+q.pointer+' = '+value+' (base '+q.base+'); other quantities held at base.',
          concept:{id:document.id}});
      }
    }
  }
  return {baseRoles,axes,variants,roles};
}
