import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProfiledCandidates,screenCandidateLayout} from '../scripts/profiled-wheel-candidates.mjs';
test('Three distinct sourced proposals preserve baselines and require new contact evidence',()=>{
 const r=buildProfiledCandidates();assert.deepEqual(r.candidates.map(c=>c.season),[2024,2025,2026]);
 for(const c of r.candidates){assert.equal(c.baseline.changed,false);assert.match(c.baseline.sha256,/^[a-f0-9]{64}$/);assert.equal(c.oldContactEvidenceReusable,false);assert.equal(c.engineeringAcceptance,'blocked');assert.equal(c.evidence.simulationExecuted,false);}
});
test('Nominal wheel-only layout brackets bank without asserting full assembly clearance',()=>{
 for(const c of buildProfiledCandidates().candidates){const s=screenCandidateLayout(c);assert.equal(s.nominalWheelEnvelopeBracketing,'passes-layout-only');assert.match(s.fullAssemblyClearance,/unverified/);assert.equal(s.contactEquivalenceToContinuousSleeve,false);assert.equal(s.engineeringAcceptance,'blocked');}
});
test('Wrong support layout, short shaft and overlapping wheels reject',()=>{
 const source=buildProfiledCandidates().candidates[0];
 for(const mutate of [c=>c.supports.bearingCentersYmm=[0,1],c=>c.shaft.proposedFinishedLengthMm=50,c=>c.layout.wheelCentersYmm[1]=c.layout.wheelCentersYmm[0]+1,c=>c.layout.wheelCentersYmm[0]=NaN]){
  const c=structuredClone(source);mutate(c);assert.throws(()=>screenCandidateLayout(c));
 }
});
test('CORAL direct-hex wheel preserves unresolved material discrepancy',()=>{
 const c=buildProfiledCandidates().candidates[1];assert.equal(c.hub.sku,null);assert.match(c.materialIdentity,/conflict/);assert.equal(c.wheel.forceLaw,null);
});
test('Shaft blank has no invented tapped ends and hub/retainer requirements remain open',()=>{
 for(const c of buildProfiledCandidates().candidates){assert.equal(c.shaft.stockSku,'REV-21-1135');assert.match(c.shaft.ends,/untapped/);assert.equal(c.supports.housingDesign,null);assert.equal(c.retention.holdingForceN,null);assert.equal(c.retention.axialStack,null);}
});
