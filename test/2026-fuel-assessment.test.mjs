import test from 'node:test';
import assert from 'node:assert/strict';
import {RULE_SNAPSHOT,phaseAt,assessFuelPassage,assessFuelLedger} from '../scripts/2026-fuel-assessment.mjs';
const context=(firstInactiveAlliance='RED')=>({ruleSnapshot:{...RULE_SNAPSHOT},clockBasis:'nominal-scenario',eventApplicability:'unverified-archive',firstInactiveAlliance});
const event=(hubAlliance,a,b,period='TELEOP')=>({passageId:'passage-1',pieceId:'fuel-1',hubAlliance,basis:'hypothetical-external-event',evidenceRefs:['hand-authored-test'],topEntry:{period,elapsedMs:a*1000},sensorPassage:{period,elapsedMs:b*1000}});
const contribution=(alliance,a,b,first='RED',period='TELEOP')=>assessFuelPassage(event(alliance,a,b,period),context(first)).nominalFuelPointContribution;

test('Hand-calculated RED-first inactive interior/grace/crossing vectors',()=>{
 // Independent review vectors. Units seconds relative to TELEOP, not combined match time.
 for(const [alliance,a,b,expected] of [['RED',11,12,null],['BLUE',11,12,1],['RED',14,15,0],['RED',36,37,1],['BLUE',36,37,null],['BLUE',39,40,0],['BLUE',9,11,null]])assert.equal(contribution(alliance,a,b),expected,`${alliance} ${a}->${b}`);
});
test('BLUE-first schedule swaps alliance results, not phase times',()=>{
 assert.equal(contribution('BLUE',11,12,'BLUE'),null);assert.equal(contribution('RED',11,12,'BLUE'),1);assert.equal(contribution('BLUE',14,15,'BLUE'),0);assert.equal(contribution('BLUE',36,37,'BLUE'),1);assert.equal(contribution('RED',36,37,'BLUE'),null);
});
test('Nominal half-open phase boundaries are independent from conservative event boundary rejection',()=>{
 const starts=[[0,'TRANSITION'],[10000,'SHIFT1'],[35000,'SHIFT2'],[60000,'SHIFT3'],[85000,'SHIFT4'],[110000,'ENDGAME']];
 for(let i=0;i<starts.length;i++){const [ms,id]=starts[i];assert.equal(phaseAt({period:'TELEOP',elapsedMs:ms},context()).phase,id);assert.equal(phaseAt({period:'TELEOP',elapsedMs:ms+1},context()).phase,id);if(i)assert.equal(phaseAt({period:'TELEOP',elapsedMs:ms-1},context()).phase,starts[i-1][1]);assert.equal(contribution('BLUE',ms/1000,ms/1000+0.001),null);}
 assert.equal(phaseAt({period:'TELEOP',elapsedMs:139999},context()).phase,'ENDGAME');assert.equal(phaseAt({period:'TELEOP',elapsedMs:140000},context()).phase,null);
 assert.equal(phaseAt({period:'AUTO',elapsedMs:19999},context()).phase,'AUTO');assert.equal(phaseAt({period:'AUTO',elapsedMs:20000},context()).phase,null);
});
test('All four shifts alternate; both hubs active outside alliance shifts',()=>{
 for(const [ms,red,blue]of [[5000,'ACTIVE','ACTIVE'],[20000,'INACTIVE','ACTIVE'],[45000,'ACTIVE','INACTIVE'],[70000,'INACTIVE','ACTIVE'],[95000,'ACTIVE','INACTIVE'],[120000,'ACTIVE','ACTIVE']]){const s=phaseAt({period:'TELEOP',elapsedMs:ms},context());assert.equal(s.redHubStatus,red);assert.equal(s.blueHubStatus,blue);}
 for(const first of ['RED','BLUE','UNKNOWN']){const s=phaseAt({period:'AUTO',elapsedMs:10000},context(first));assert.equal(s.redHubStatus,'ACTIVE');assert.equal(s.blueHubStatus,'ACTIVE');}
});
test('Unknown selection is not guessed during shifts, but does not obscure always-active phases',()=>{
 for(const a of [14,39,64,89])assert.equal(contribution('RED',a,a+1,'UNKNOWN'),null);
 for(const [a,b,period]of [[1,2,'AUTO'],[1,2,'TELEOP'],[115,116,'TELEOP']])for(const side of ['RED','BLUE'])assert.equal(contribution(side,a,b,'UNKNOWN',period),1);
});
test('Grace exclusion follows only newly inactive hub and includes exact grace endpoint conservatively',()=>{
 for(const [start,inactive,active]of [[10,'RED','BLUE'],[35,'BLUE','RED'],[60,'RED','BLUE'],[85,'BLUE','RED']]){
  assert.equal(contribution(inactive,start+1,start+2),null);assert.equal(contribution(active,start+1,start+2),1);assert.equal(contribution(inactive,start+3,start+4),null);assert.equal(contribution(inactive,start+3.001,start+4),0);
 }
});
test('Same active status across a phase boundary is still unsupported',()=>{
 assert.equal(contribution('BLUE',9,11),null);assert.equal(contribution('RED',109,111),null);assert.equal(contribution('RED',19,21,'RED','AUTO'),null);assert.equal(contribution('RED',139,141),null);
});
test('Reject malformed/reversed/missing/cross-period observations rather than repairing clocks',()=>{
 for(const mutate of [e=>e.topEntry.elapsedMs=-1,e=>e.topEntry.elapsedMs=NaN,e=>e.sensorPassage.elapsedMs=Infinity,e=>e.topEntry.elapsedMs=1.5,e=>e.sensorPassage.elapsedMs=e.topEntry.elapsedMs,e=>e.sensorPassage.elapsedMs=0,e=>delete e.sensorPassage,e=>e.sensorPassage.period='AUTO',e=>e.basis='measured',e=>e.evidenceRefs=[]]){const e=event('RED',14,15);mutate(e);assert.throws(()=>assessFuelPassage(e,context()));}
 for(const mutate of [c=>c.clockBasis='driver-station-time',c=>c.eventApplicability='verified-event',c=>c.firstInactiveAlliance='',c=>c.ruleSnapshot.sha256='0'.repeat(64),c=>c.ruleSnapshot.season=2025]){const c=context();mutate(c);assert.throws(()=>phaseAt({period:'AUTO',elapsedMs:1000},c));}
});
test('AUTO assessment delay and TELEOP clock stay separate; postperiod is not zero points',()=>{
 const auto=assessFuelPassage(event('RED',20.5,21,'AUTO'),context());assert.equal(auto.status,'unsupported');assert.equal(auto.nominalFuelPointContribution,null);assert.equal(contribution('RED',0.5,1),1);assert.equal(contribution('BLUE',140.5,141),null);
});
test('Ledger preserves unsupported events, duplicate passage prevention and distinct recycled passages',()=>{
 const events=[event('BLUE',11,12),{...event('RED',11,12),passageId:'p2',pieceId:'fuel-2'},{...event('RED',14,15),passageId:'p3',pieceId:'fuel-3'},{...event('RED',36,37),passageId:'p4'}];const before=JSON.stringify(events),r=assessFuelLedger(events,context());assert.equal(r.supportedEventSubtotal,2);assert.equal(r.supportedEvents,3);assert.equal(r.unresolvedEvents,1);assert.equal(r.results.length,4);assert.equal(r.matchScore,null);assert.equal(r.rankingPoints,null);assert.equal(r.winProbability,null);assert.equal(r.inventoryLinkage,'not-implemented');assert.equal(JSON.stringify(events),before);assert.deepEqual(r,assessFuelLedger(events,context()));
 assert.throws(()=>assessFuelLedger([events[0],events[0]],context()),/Duplicate/);assert.equal(assessFuelLedger([],context()).supportedEventSubtotal,0);
});
test('Outputs preserve source/basis/coverage without fabricated coordinates or robot facts',()=>{
 const r=assessFuelPassage(event('BLUE',11,12),context());assert.equal(r.event.basis,'hypothetical-external-event');assert.deepEqual(r.ruleSnapshot,RULE_SNAPSHOT);assert.equal(r.clockBasis,'nominal-scenario');assert.equal(r.legality,'not-assessed');assert.ok(r.limitations.some(x=>x.includes('No complete match')));assert.doesNotMatch(JSON.stringify(r),/coordinates|robotMass|shotAccuracy/);
});

test('Sensor-at-boundary and grace-crossing observations stay unsupported',()=>{
 for(const boundary of [10,35,60,85,110,140])for(const alliance of ['RED','BLUE'])assert.equal(contribution(alliance,boundary-0.001,boundary),null);
 assert.equal(contribution('RED',19.999,20,'RED','AUTO'),null);assert.equal(contribution('RED',12,14),null);assert.equal(contribution('BLUE',37,39),null);
});
