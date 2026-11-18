// Project-owned source catalogs and time-bound custody for field-route observations.
const named=x=>typeof x==='string' && x.trim().length>0;
const finite=Number.isFinite;
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const states=['placed','carried','stock','removed','unknown'];
const validBox=b=>Array.isArray(b) && b.length===6 && b.every(finite) && [0,1,2].every(i=>b[i]<b[i+3]);
function check(value,message){if(!value) throw Error(message);}

function valueAt(doc,keys) {
  check(Array.isArray(keys) && keys.every(named),'Supply a path to the complete source collection.');
  for(const key of keys) {
    check(doc && typeof doc==='object' && Object.hasOwn(doc,key),'Inventory source collection not found.');
    doc=doc[key];
  }
  return doc;
}

function collect(doc,rule) {
  const value=valueAt(doc,rule.path);
  if(rule.format==='keys') {
    check(value && typeof value==='object' && !Array.isArray(value),'Inventory path must select an object.');
    return Object.entries(value);
  }
  check(Array.isArray(value) && ['ids','rows'].includes(rule.format),'Inventory path must select an array.');
  if(rule.format==='ids') return value.map(id=>[id,null]);
  check(named(rule.idKey),'An identity column is required.');
  return value.map(row=>[row?.[rule.idKey],row]);
}

function contains(outer,inner) {
  return validBox(outer) && [0,1,2].every(i=>outer[i]<=inner[i] && outer[i+3]>=inner[i+3]);
}

export async function loadInventory(ref,scenario,read) {
  if(!ref) return null;
  const inv=await read(ref);
  check(inv.schema==='field-route/inventory@1' && inv.fieldSha256===scenario.sources?.field?.sha256
    && named(inv.fieldSha256) && inv.clock===scenario.clock && inv.startS===scenario.startS,'Inventory field revision or clock mismatch.');
  check(['whole-field','bounded-study'].includes(inv.scope?.kind) && named(inv.scope.name)
    && Array.isArray(inv.scope.unresolved) && inv.scope.unresolved.every(named),'Identify the source inventory scope and unresolved categories.');
  check(inv.scope.outsideScope===undefined || (Array.isArray(inv.scope.outsideScope) && inv.scope.outsideScope.every(named)),
    'List the named categories outside the study.');
  check(Array.isArray(inv.collections) && inv.collections.length,'Supply the independently reviewed field collections.');
  let doc;
  if(inv.export) {
    doc=await read(inv.export);
    check(doc.fieldSha256===inv.fieldSha256,'Source inventory export belongs to another field.');
  } else doc=await read(scenario.sources.field);
  // A producer can select one source collection for a bounded experiment. Only
  // the source catalog can declare which collections comprise the whole field.
  const key=r=>JSON.stringify([r.path,r.format,r.initial,r.idKey??null,r.bounds??null,r.geometryKey??null]);
  const coverageIssues=[];
  if(inv.scope.kind==='whole-field') {
    const full=doc.fieldRouteInventory;
    const wanted=inv.collections.map(key).sort();
    const authoritative=Array.isArray(full?.collections)?full.collections.map(key).sort():[];
    if(full?.complete!==true || inv.scope.outsideScope?.length || !Array.isArray(full.unresolved) || full.unresolved.length
      || !wanted.length || JSON.stringify(wanted)!==JSON.stringify(authoritative))
      coverageIssues.push('Complete independent field catalog unavailable or collection selection differs.');
  }
  const initial=new Map();
  for(const rule of inv.collections) {
    check(states.includes(rule.initial) && rule.initial!=='removed','Invalid initial occupancy.');
    for(const [id,row] of collect(doc,rule)) {
      check(named(id) && !initial.has(id),'Missing or duplicate source field object.');
      const extent=rule.bounds==='value'?row:rule.bounds===undefined?null:row?.[rule.bounds];
      check(rule.bounds===undefined || (rule.initial==='placed' && validBox(extent)),'Invalid initial object bounds.');
      const geometry = rule.geometryKey === undefined ? undefined : row?.[rule.geometryKey];
      check(rule.geometryKey === undefined || (named(rule.geometryKey) && digest(geometry)),
        'Missing or invalid installed object geometry digest.');
      initial.set(id,{state:rule.initial,extent,geometry});
    }
  }
  const changes=[],exclusions=[];
  const current=new Map(initial);
  const usedTimes=new Map();
  for(const r of inv.transitions??[]) changes.push(await read(r));
  changes.sort((a,b)=>a.timeS-b.timeS);
  for(const r of changes) {
    check(initial.has(r.id) && r.schema==='field-route/state-change@1' && r.fieldSha256===inv.fieldSha256
      && r.trajectorySha256===scenario.sources?.trajectory?.sha256 && r.clock===inv.clock && finite(r.timeS)
      && r.timeS>=inv.startS && named(r.method) && states.includes(r.to) && current.get(r.id).state===r.from
      && usedTimes.get(r.id)!==r.timeS,'Unbound, ambiguous or discontinuous inventory transition.');
    if(r.to==='placed') check(validBox(r.bounds),'A placed or moved object needs its new occupied bounds.');
    if (r.geometrySha256 !== undefined || (r.to === 'placed' && initial.get(r.id).geometry))
      check(digest(r.geometrySha256),'Supply the installed geometry revision for the new state.');
    await read(r.sourceEvidence,false);
    usedTimes.set(r.id,r.timeS);
    current.set(r.id,{state:r.to,extent:r.bounds});
  }
  for(const ref of inv.exclusions??[]) {
    const r=await read(ref);
    check(r.schema==='field-route/exclusion@1' && r.fieldSha256===inv.fieldSha256
      && r.trajectorySha256===scenario.sources?.trajectory?.sha256 && r.clock===inv.clock && initial.has(r.id)
      && finite(r.fromS) && finite(r.toS) && r.fromS<r.toS && r.method==='continuous-lower-bound'
      && finite(r.minGapM) && r.minGapM>scenario.marginM,'Invalid interval exclusion evidence.');
    await read(r.sourceEvidence,false);
    exclusions.push(r);
  }
  return {scope:inv.scope,initial,changes,exclusions,coverageIssues};
}

export function contactRegistrationIssue(inventory,scenario,observation,witness) {
  if (!inventory) return null;
  function stateAt(id) {
    let state = inventory.initial.get(id);
    for (const change of inventory.changes) {
      if (change.timeS > witness.timeS) break;
      if (change.id === id) state = {state:change.to,extent:change.bounds,geometry:change.geometrySha256};
    }
    return state;
  }
  const obstacle = stateAt(witness.obstacle);
  if (obstacle?.state !== 'placed') return 'Obstacle is not registered as placed at contact.';
  if (obstacle.extent && !contains(observation?.obstacles?.[witness.obstacle],obstacle.extent))
    return 'Witness sweep does not enclose the registered obstacle at contact.';
  if (obstacle.geometry && witness.obstacleGeometrySha256 !== obstacle.geometry)
    return 'Witness does not match the registered obstacle geometry revision.';
  if (!scenario.robotBodies.includes(witness.moving) && stateAt(witness.moving)?.state !== 'carried')
    return 'Moving piece is not registered as carried at contact.';
  return null;
}

export function inventoryIssues(inventory,scenario,slice,observed,until) {
  if(!inventory) return ['Independent starting inventory unavailable.'];
  const issues=[...inventory.coverageIssues,...inventory.scope.unresolved.map(reason=>'Unresolved inventory: '+reason)];
  const current=new Map(inventory.initial);
  for(const r of inventory.changes) {
    if(r.timeS<=slice.fromS) current.set(r.id,{state:r.to,extent:r.bounds});
    else if(r.timeS<until) issues.push('Split the route interval at the state change of '+r.id);
  }
  const obstacles=new Set(slice.obstacles??scenario.obstacles);
  const carried=new Set(slice.carried);
  for(const [id,{state,extent}] of current) {
    const exclusion=inventory.exclusions.some(r=>r.id===id && r.fromS<=slice.fromS && r.toS>=until);
    if(state==='unknown') issues.push('Unknown starting or current location: '+id);
    else if(state==='placed' && !obstacles.has(id) && !exclusion) issues.push('Source field object omitted: '+id);
    else if(state==='placed' && extent && obstacles.has(id) && !contains(observed?.obstacles?.[id],extent))
      issues.push('Sweep does not enclose registered field object: '+id);
    if((state==='carried')!==carried.has(id)) issues.push('Carried inventory differs for '+id);
    if(state!=='placed' && obstacles.has(id)) issues.push('Field occupancy differs for '+id);
  }
  if(inventory.scope.kind==='whole-field')
    for(const id of [...obstacles,...carried]) if(!current.has(id)) issues.push('Object outside the source register: '+id);
  return issues;
}
