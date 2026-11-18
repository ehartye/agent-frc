import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadInventory, inventoryIssues, contactRegistrationIssue } from './route-inventory.mjs';

const finite = Number.isFinite;
const named = v => typeof v === 'string' && v.trim().length > 0;
const ids = v => Array.isArray(v) && v.length > 0 && v.every(named) && new Set(v).size === v.length;
const interval = row => finite(row?.fromS) && finite(row.toS) && row.fromS < row.toS;
const requireInput = (condition, message) => { if (!condition) throw Error(message); };

async function pinned(base, ref, json = false) {
  requireInput(named(ref?.file) && /^[0-9a-f]{64}$/.test(ref.sha256), 'Expected file and SHA-256.');
  const file=path.resolve(base,ref.file);
  const hash=createHash('sha256');
  if(json) {
    const bytes=await readFile(file);
    requireInput(hash.update(bytes).digest('hex')===ref.sha256,'Changed input: '+ref.file);
    return JSON.parse(bytes);
  }
  for await(const chunk of createReadStream(file)) hash.update(chunk);
  requireInput(hash.digest('hex')===ref.sha256,'Changed input: '+ref.file);
  return ref.sha256;
}

function box(b) {
  return Array.isArray(b) && b.length === 6 && b.every(finite) && [0,1,2].every(i => b[i] < b[i+3]);
}

function separated(a,b,margin) {
  // Only strict separation in an axis is required. Touching needs refinement.
  return [0,1,2].some(i => a[i+3]+margin < b[i] || b[i+3]+margin < a[i]);
}

function covers(map, expected) {
  return map && Object.keys(map).length === expected.length
    && expected.every(id => Object.hasOwn(map,id) && box(map[id]));
}

function materialContact(r) {
  return r?.method === 'material-intersection' && finite(r.timeS) && r.timeS >= r.fromS && r.timeS <= r.toS
    && finite(r.volumeMm3) && finite(r.toleranceMm3) && r.toleranceMm3 >= 0 && r.volumeMm3 > r.toleranceMm3;
}

function evaluateSlice(scenario, slice, route, evidence, until) {
  const issues = [];
  const moving = [...scenario.robotBodies, ...slice.carried];
  const obstacles=slice.obstacles??scenario.obstacles;
  if (!covers(route?.moving, moving) || !covers(route?.obstacles, obstacles)
      || route.method !== 'continuous-swept-enclosures') {
    return ['Missing continuous bounds or mismatched body inventory.'];
  }
  for (const a of moving) for (const b of obstacles) {
    const matches = evidence.filter(r => r.fromS === slice.fromS && r.toS === slice.toS
      && r.moving === a && r.obstacle === b);
    if (matches.length>1) {issues.push('Conflicting refinements: '+a+' / '+b);continue;}
    if (!matches.length && separated(route.moving[a],route.obstacles[b],scenario.marginM)) continue;
    const r = matches.length === 1 ? matches[0] : null;
    if (r?.method === 'continuous-lower-bound' && finite(r.minGapM) && r.minGapM > scenario.marginM) continue;
    const contactPolicy=scenario.contactResponses?.find(p=>p.moving===a && p.obstacle===b);
    if (r?.method==='coupled-contact-response' && contactPolicy && r.trajectorySha256===scenario.sources?.trajectory?.sha256
        && named(r.contactModel) && r.completeInterval===true && r.continuationIntegrated===true
        && finite(r.maxPenetrationM) && r.maxPenetrationM>=0 && r.maxPenetrationM<=contactPolicy.maxPenetrationM
        && finite(r.maxResidualM) && r.maxResidualM>=0 && r.maxResidualM<=contactPolicy.maxResidualM) continue;
    if (!materialContact(r) || r.timeS > until) issues.push('Unresolved swept pair: ' + a + ' / ' + b);
  }
  return issues;
}

export async function reviewFieldRoute(file) {
  const base=path.dirname(path.resolve(file));
  const req=JSON.parse(await readFile(file,'utf8'));
  const [s,route,detector]=await Promise.all([req.scenario,req.route,req.detector].map(ref=>pinned(base,ref,true)));
  requireInput(s.schema==='field-route/scenario@1' && route.schema==='field-route/sweep@1'
    && detector.schema==='field-route/events@1','Unrecognized evidence contract.');
  requireInput(ids(s.robotBodies) && (ids(s.obstacles) || (Array.isArray(s.obstacles) && s.obstacles.length===0)) && ids(s.pieces) && named(s.clock)
    && finite(s.startS) && finite(s.marginM) && s.marginM>=0,'Invalid scenario inventory, clock or margin.');
  requireInput(s.robotBodies.every(id=>!s.pieces.includes(id) && !s.obstacles.includes(id)),
    'Robot body IDs must be distinct from pieces and obstacles.');
  requireInput(Array.isArray(s.intervals) && Array.isArray(route.intervals) && Array.isArray(detector.events),'Missing evidence arrays.');
  const slices=[...s.intervals].sort((a,b)=>a.fromS-b.fromS);
  for (const p of s.contactResponses ?? []) {
    requireInput([...s.robotBodies,...s.pieces].includes(p.moving) && s.obstacles.includes(p.obstacle)
      && finite(p.maxPenetrationM) && p.maxPenetrationM>=0 && finite(p.maxResidualM) && p.maxResidualM>=0,
      'Invalid allowed contact response.');
  }
  let previous=s.startS;
  for (const row of slices) {
    requireInput(interval(row) && row.fromS>=previous && Array.isArray(row.carried)
      && new Set(row.carried).size===row.carried.length && row.carried.every(id=>s.pieces.includes(id)),
      'Invalid or overlapping expected interval.');
    previous=row.toS;
    const obstacles=row.obstacles??s.obstacles;
    requireInput(Array.isArray(obstacles) && new Set(obstacles).size===obstacles.length
      && obstacles.every(id=>s.obstacles.includes(id) && !row.carried.includes(id)),
      'An interval needs distinct declared obstacles and carried pieces.');
  }
  const missing=[];
  for (const key of ['field','robot','transform','trajectory']) {
    if (s.sources?.[key]) await pinned(base,s.sources[key]); else missing.push(key);
  }
  const inventory=s.sources?.field ? await loadInventory(req.inventory,s,(ref,json=true)=>pinned(base,ref,json)) : null;
  for (const journal of [route,detector]) {
    requireInput(journal.scenarioSha256===req.scenario.sha256 && journal.clock===s.clock,'Scenario or clock mismatch.');
    await pinned(base,journal.sourceEvidence);
  }
  const evidence=[];
  requireInput(route.intervals.every(r=>interval(r) && slices.some(i=>i.fromS===r.fromS && i.toS===r.toS)),
    'Observed interval is outside the expected partition.');
  for (const ref of route.refinements ?? []) {
    const r=await pinned(base,ref,true);
    requireInput(r.scenarioSha256===req.scenario.sha256 && r.clock===s.clock && named(r.backend)
      && named(r.moving) && named(r.obstacle) && interval(r),'Unbound refinement.');
    requireInput(slices.some(i=>i.fromS===r.fromS && i.toS===r.toS && [...s.robotBodies,...i.carried].includes(r.moving)
      && (i.obstacles??s.obstacles).includes(r.obstacle)),'Refinement is outside its expected interval or inventory.');
    await pinned(base,r.sourceEvidence);
    if(r.method==='coupled-contact-response') await pinned(base,r.dynamicsEvidence);
    evidence.push({...r,source:ref.sha256});
  }
  const seen=new Set();
  const materialContacts=evidence.filter(materialContact).map(r=>{
    const matches=route.intervals.filter(i=>i.fromS===r.fromS && i.toS===r.toS);
    const issue=contactRegistrationIssue(inventory,s,matches.length===1?matches[0]:null,r);
    return {timeS:r.timeS,moving:r.moving,obstacle:r.obstacle,volumeMm3:r.volumeMm3,source:r.source,
      ...(issue ? {registrationIssue:issue} : {})};
  }).sort((a,b)=>a.timeS-b.timeS);
  const events=detector.events.map(event=>{
    requireInput(named(event.id) && !seen.has(event.id) && s.pieces.includes(event.piece)
      && finite(event.timeS) && event.timeS>s.startS,'Duplicate or invalid detector observation.');
    seen.add(event.id);
    let covered=s.startS;
    const gaps=[];
    const inventoryGaps=[];
    if(inventory?.scope.kind==='whole-field' && !inventory.initial.has(event.piece))
      inventoryGaps.push({fromS:s.startS,toS:event.timeS,reason:'Detector piece absent from source inventory: '+event.piece});
    for (const slice of slices) {
      if (slice.fromS>=event.timeS) break;
      if (slice.fromS>covered) gaps.push({fromS:covered,toS:slice.fromS,reason:'Unexamined time.'});
      const matches=route.intervals.filter(r=>r.fromS===slice.fromS && r.toS===slice.toS);
      const until=Math.min(event.timeS,slice.toS);
      const issues=evaluateSlice(s,slice,matches.length===1?matches[0]:null,evidence,until);
      for(const reason of inventoryIssues(inventory,s,slice,matches.length===1?matches[0]:null,until))
        inventoryGaps.push({fromS:slice.fromS,toS:until,reason});
      for(const reason of issues) gaps.push({fromS:slice.fromS,toS:until,reason});
      covered=until;
    }
    if(covered<event.timeS) gaps.push({fromS:covered,toS:event.timeS,reason:'Unexamined time.'});
    // An exact penetration is still a witness when an adjacent sweep is incomplete.
    // Include the event instant, which may also be the start of the next interval.
    const contacts=materialContacts.filter(c=>c.timeS<=event.timeS);
    const qualifiedContacts=contacts.filter(c=>!c.registrationIssue);
    const declaredRouteStatus=missing.length?'pending':contacts.length?'infeasible':gaps.length?'pending':'supported';
    let routeStatus=declaredRouteStatus;
    if (declaredRouteStatus==='infeasible' && !qualifiedContacts.length) routeStatus='pending';
    if (declaredRouteStatus==='supported' && (!inventory || inventoryGaps.length)) routeStatus='pending';
    const wholeFieldStatus=routeStatus==='supported' && inventory?.scope.kind!=='whole-field'?'pending':routeStatus;
    return {detectorEvent:event, routeStatus, wholeFieldStatus, declaredRouteStatus, gaps, inventoryGaps, contacts,qualifiedContacts};
  });
  return {schema:'field-route/result@2',scenarioSha256:req.scenario.sha256,routeSha256:req.route.sha256,
    inventorySha256:req.inventory?.sha256??null,inventoryScope:inventory?.scope??null,
    detectorSha256:req.detector.sha256,missingRegistration:missing,events,
    scope:'Supplied route and recorded detector events. Rules, actual field scoring and physical qualification are independent.'};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {
    requireInput(process.argv.length===3,'Usage: node scripts/field-route-evidence.mjs request.json');
    console.log(JSON.stringify(await reviewFieldRoute(process.argv[2]),null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
