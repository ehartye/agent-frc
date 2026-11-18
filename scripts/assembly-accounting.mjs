import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readPinned} from './release-height.mjs';

function requireValue(ok, message) {
  if (!ok) throw Error(message);
}
const named = value => typeof value === 'string' && value.trim().length > 0;
const nonnegativeInteger = n => Number.isSafeInteger(n) && n >= 0;

function records(rows, label) {
  requireValue(Array.isArray(rows), 'Supply '+label+' as a list.');
  const result = new Map();
  for (const row of rows) {
    requireValue(named(row?.id) && !result.has(row.id), 'Missing or duplicate '+label+' ID.');
    result.set(row.id,row);
  }
  return result;
}

function names(values, label) {
  requireValue(Array.isArray(values) && values.every(named) && new Set(values).size === values.length,
    'Supply distinct names for '+label+'.');
  return values;
}

function evidence(row, signed=false) {
  requireValue(named(row?.source) && ['estimated','measured'].includes(row.basis), 'Mass needs a source and evidence basis.');
  const r=row.rangeKg;
  requireValue(Array.isArray(r) && r.length===2 && r.every(Number.isFinite) && r[0]<=r[1] && (signed||r[0]>=0),
    'Supply an ordered mass interval in kilograms.');
  return r;
}

function coverage(request, instances) {
  const exports=records(request.exports,'exports');
  requireValue(exports.size>0,'Supply at least one exported occurrence inventory.');
  const assignments=new Map(), variants=new Map();
  for(const entry of exports.values()){
    if(entry.variant!==undefined){
      const {group,choice}=entry.variant;
      requireValue(named(group)&&named(choice)&&(!variants.has(group)||variants.get(group)===choice),
        'Incompatible installed variants in one configuration.');
      variants.set(group,choice);
    }
    for(const occurrence of names(entry.occurrences,'occurrences per export')){
      assignments.set(JSON.stringify([entry.id,occurrence]),[]);
    }
  }
  requireValue(Array.isArray(request.assignments),'Supply occurrence assignments.');
  for(const row of request.assignments){
    const key=JSON.stringify([row.export,row.occurrence]);
    requireValue(assignments.has(key),'Assignment outside the declared occurrence inventory: '+key);
    requireValue(['installed','included','service','external'].includes(row.role),'Unknown occurrence role.');
    if(row.role==='installed'||row.role==='included'){
      requireValue(instances.has(row.instance),'Supply a physical instance or included parent: '+key);
    } else requireValue(row.instance===undefined,'A service or external occurrence cannot own an installed instance.');
    assignments.get(key).push(row);
  }
  const missing=[],duplicates=[],included=[],unattached=[],active=new Set(),bindings=new Map();
  const roles={installed:0,included:0,service:0,external:0};
  for(const [key,rows] of assignments){
    if(rows.length!==1){
      (rows.length?duplicates:missing).push(JSON.parse(key));
      continue;
    }
    const row=rows[0];
    roles[row.role]++;
    if(row.instance!==undefined){
      if(!bindings.has(row.instance)) bindings.set(row.instance,[]);
      bindings.get(row.instance).push({export:row.export,occurrence:row.occurrence,role:row.role});
    }
    if(row.role==='installed'){
      requireValue(instances.get(row.instance).presence==='modeled','Installed occurrence must refer to a modeled instance.');
      active.add(row.instance);
    }
    if(row.role==='included') included.push(row);
  }
  for(const part of instances.values()){
    if(part.presence==='unmodeled') active.add(part.id);
    if(part.presence==='modeled'&&!active.has(part.id)) unattached.push(part.id);
  }
  const orphanIncluded=included.filter(row=>!active.has(row.instance));
  return {active,report:{total:assignments.size,covered:Object.values(roles).reduce((a,b)=>a+b,0),
    roles,missing,duplicates,unattached,orphanIncluded,bindings:Object.fromEntries(bindings)}};
}

function configure(request, instances, active) {
  const options=records(request.changes,'changes');
  const selected=names(request.selected,'selected changes').map(id=>{
    requireValue(options.has(id),'Unknown selected change: '+id);
    return options.get(id);
  });
  const groups=new Set(),removals=new Set(),additions=new Set();
  for(const change of selected){
    if(change.exclusiveGroup!==undefined){
      requireValue(named(change.exclusiveGroup)&&!groups.has(change.exclusiveGroup),'Incompatible alternatives selected.');
      groups.add(change.exclusiveGroup);
    }
    requireValue(change.revision===request.revision&&change.configuration===request.configuration,'Change baseline mismatch.');
    const removed=names(change.remove,'removed instances'),added=names(change.add,'added instances');
    requireValue(removed.length+added.length>0,'Change needs physical instance identities.');
    for(const id of removed){
      requireValue(active.has(id)&&!removals.has(id),'Absent or twice-credited removal: '+id);
      removals.add(id);
    }
    for(const id of added){
      requireValue(instances.get(id)?.presence==='candidate'&&!additions.has(id),'Unknown or repeated added instance: '+id);
      additions.add(id);
    }
    if(change.delta!==null){
      const [low,high]=evidence(change.delta,true);
      requireValue((removed.length||low>=0)&&(added.length||high<=0),'Mass sign contradicts the physical change.');
    }
  }
  return {selected,configured:new Set([...active].filter(id=>!removals.has(id)).concat([...additions]))};
}

function inventory(instances, configured, articles) {
  const make=[],undecided=[],buys=new Map();
  for(const id of configured){
    const part=instances.get(id);
    if(part.disposition==='make') make.push(id);
    if(part.disposition==='undecided') undecided.push(id);
    if(part.disposition==='buy'){
      if(!buys.has(part.article)) buys.set(part.article,[]);
      buys.get(part.article).push(id);
    }
  }
  const buy=[...buys].map(([id,ids])=>{
    const a=articles.get(id), units=ids.length;
    const shortfall=a.onHand==null?null:Math.max(0,units-a.onHand);
    return {article:id,sku:a.sku??null,instances:ids,requiredUnits:units,unitsPerPack:a.unitsPerPack??null,
      onHand:a.onHand??null,shortfall,packsToCoverKnownShortfall:shortfall===0?0:
        (shortfall!==null&&a.unitsPerPack&&a.sku?Math.ceil(shortfall/a.unitsPerPack):null)};
  });
  return {make,buy,undecided};
}

function massReport(request, instances, configured, selected, complete) {
  const m=request.mass;
  requireValue(m?.unit==='kg' && m.configuration===request.configuration && m.revision===request.revision,
    'Mass scope, configuration, revision or units mismatch.');
  requireValue(m.limitKg===null||(Number.isFinite(m.limitKg)&&m.limitKg>0),'Invalid mass limit.');
  const omissions=names(m.omissions,'mass omissions');
  let knownLow=0,knownHigh=0;
  const unweighed=[],bases=new Set();
  for(const id of configured){
    const item=instances.get(id);
    if(item.mass==null){unweighed.push(id);continue;}
    const [lo,hi]=evidence(item.mass);
    knownLow+=lo;knownHigh+=hi;bases.add(item.mass.basis);
  }
  let range=m.baseline===null?null:[...evidence(m.baseline)];
  const baselineBasis=m.baseline?.basis??null;
  const missingDeltas=[];
  for(const change of selected){
    if(change.delta===null){range=null;missingDeltas.push(change.id);continue;}
    if(range){range[0]+=change.delta.rangeKg[0];range[1]+=change.delta.rangeKg[1];}
  }
  requireValue(!range||range[0]>=0,'Credited removals exceed the baseline mass.');
  const scopeMargin=range&&m.limitKg!==null?[m.limitKg-range[1],m.limitKg-range[0]]:null;
  const eligible=complete&&omissions.length===0;
  return {unit:'kg',limitKg:m.limitKg,knownInstanceSubtotalKg:[knownLow,knownHigh],instanceMassBases:[...bases],
    unweighed,baseline:m.baseline,baselineBasis,changes:selected.map(c=>({id:c.id,delta:c.delta})),missingDeltas,
    omissions,representedRangeKg:range,representedMarginKg:scopeMargin,configurationMarginKg:eligible?scopeMargin:null};
}

function reconcileAssembly(request) {
  requireValue(request?.schema==='agent-frc/assembly-accounting@1' && named(request.configuration)
    && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(request.revision) && ['partial','complete'].includes(request.scope),
    'Supply a versioned mapping, source commit or digest, named configuration and coverage scope.');
  const instances=records(request.instances,'physical instances'),articles=records(request.articles,'articles');
  for(const a of articles.values()){
    requireValue((a.sku==null||named(a.sku))&&(a.unitsPerPack==null||(nonnegativeInteger(a.unitsPerPack)&&a.unitsPerPack>0))
      &&(a.onHand==null||nonnegativeInteger(a.onHand)),'Invalid SKU, pack size or available quantity.');
  }
  names([...articles.values()].map(a=>a.sku).filter(s=>s!=null),'supplier-qualified SKUs');
  for(const part of instances.values()){
    requireValue(['make','buy','undecided'].includes(part.disposition)&&['modeled','unmodeled','candidate'].includes(part.presence),
      'Invalid physical instance disposition or presence.');
    requireValue(part.disposition==='buy'?articles.has(part.article):part.article===undefined,'Invalid supplied article link.');
  }
  const {active,report}=coverage(request,instances);
  const {selected,configured}=configure(request,instances,active);
  const gaps=names(request.omissions,'unrepresented inventory');
  const complete=request.scope==='complete'&&!gaps.length&&[report.missing,report.duplicates,report.unattached,report.orphanIncluded].every(r=>!r.length);
  const counts=inventory(instances,configured,articles);
  const orderQuantitiesKnown=complete&&!counts.undecided.length&&counts.buy.every(a=>a.packsToCoverKnownShortfall!==null);
  return {configuration:request.configuration,revision:request.revision,scope:request.scope,
    selected:request.selected,coverage:report,inventoryComplete:complete,omissions:gaps,
    representedInstances:configured.size,orderQuantitiesKnown,...counts,
    mass:massReport(request,instances,configured,selected,complete)};
}

export async function reviewAssembly(file) {
  const request=JSON.parse(await readFile(file,'utf8'));
  const pins=records(request.sources,'sources'), bytes=new Map(), documents=new Map();
  for(const [id,pin] of pins) bytes.set(id,await readPinned(path.dirname(file),pin));
  function locate(row) {
    requireValue(pins.has(row.source),'Unknown pinned source.');
    requireValue(typeof row.pointer==='string' && (row.pointer===''||row.pointer.startsWith('/')),'Supply a JSON pointer.');
    if(!documents.has(row.source)) documents.set(row.source,JSON.parse(bytes.get(row.source).toString('utf8')));
    let value=documents.get(row.source);
    for(const token of row.pointer===''?[]:row.pointer.slice(1).split('/')){
      const key=token.replaceAll('~1','/').replaceAll('~0','~');
      requireValue(value!==null&&typeof value==='object'&&Object.hasOwn(value,key),'Locator absent from pinned source.');
      value=value[key];
    }
    return value;
  }
  for(const snapshot of request.exports){
    const inventory=locate(snapshot);
    requireValue(inventory!==null&&typeof inventory==='object','Expected a named occurrence inventory.');
    requireValue(!Object.hasOwn(snapshot,'occurrences'),'Declare the pinned inventory location instead of copying occurrences.');
    if(Array.isArray(inventory)){
      snapshot.occurrences=snapshot.idField===undefined?inventory:inventory.map(row=>row?.[snapshot.idField]);
    }else{
      requireValue(snapshot.idField===undefined,'A keyed inventory already supplies its occurrence names.');
      snapshot.occurrences=Object.keys(inventory);
    }
  }
  const result=reconcileAssembly(request);
  for(const row of [...request.instances.map(part=>part.mass),request.mass.baseline,...result.mass.changes.map(change=>change.delta)]){
    if(row==null) continue;
    const value=locate(row);
    const actual=Array.isArray(value)?value:[value,value];
    requireValue(actual.length===2&&actual.every((n,i)=>Number.isFinite(n)&&n===row.rangeKg[i]),'Mass interval differs from pinned source.');
  }
  return result;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length!==3) throw Error('Usage: assembly-accounting mapping.json');
    console.log(JSON.stringify(await reviewAssembly(path.resolve(process.argv[2])),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
