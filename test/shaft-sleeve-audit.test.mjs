import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {auditPrototypeInterfaces,screenRoundedHexInRoundBore as screen,shaftEvidence} from '../scripts/shaft-sleeve-audit.mjs';
const nominal={acrossFlatsMm:12.7,cornerCircleMm:13.75,boreDiameterMm:12.7};
test('Exact rounded-hex corner envelope prevents false half-inch fit',()=>{
  const r=screen(nominal);
  assert.equal(r.geometryStatus,'nominal-interference');
  assert.ok(Math.abs(r.nominalDiametralClearanceMm+1.05)<1e-12);
  assert.equal(r.engineeringAcceptance,'blocked');
});
test('Enlarging round bore never approves torque path or assembly',()=>{
  for(const boreDiameterMm of [13.75,14,20]) {
    const r=screen({...nominal,boreDiameterMm});
    assert.equal(r.geometryStatus,'nominal-envelope-only-fit-unverified');
    assert.equal(r.toleranceStack,'missing');
    assert.match(r.torqueTransfer,/unverified/);
    assert.equal(r.engineeringAcceptance,'blocked');
  }
});
test('Invalid, nonfinite, boolean, contradictory and promotion inputs reject',()=>{
  for(const field of Object.keys(nominal)) for(const value of [NaN,Infinity,0,-1,true,'12.7',null])
    assert.throws(()=>screen({...nominal,[field]:value}));
  assert.throws(()=>screen({...nominal,cornerCircleMm:12}));
  assert.throws(()=>screen({...nominal,cornerCircleMm:15}));
  assert.throws(()=>screen({...nominal,engineeringAcceptance:'passed'}));
});
test('Three distinct fixtures remain source-pinned and blocked',()=>{
  const r=auditPrototypeInterfaces(fileURLToPath(new URL('../',import.meta.url)));
  assert.deepEqual(r.cases.map(c=>c.season),[2024,2025,2026]);
  assert.equal(new Set(r.cases.map(c=>c.fixtureSha256)).size,3);
  for(const c of r.cases) {
    assert.match(c.fixtureSha256,/^[a-f0-9]{64}$/);
    assert.equal(c.geometryStatus,'nominal-interference');
    assert.equal(c.simulationInputsChanged,false);
    assert.equal(c.nativeCadExecuted,false);
    assert.equal(c.engineeringAcceptance,'blocked');
  }
});
test('Research component is not inventory, calibrated CAD or historical availability',()=>{
  assert.equal(shaftEvidence.sku,'REV-21-2813');
  assert.equal(shaftEvidence.lengthMm,76.2);
  assert.equal(shaftEvidence.historicSeasonAvailability,null);
  assert.equal(shaftEvidence.bodySha256,null);
  assert.equal(shaftEvidence.nativeCadInspected,false);
  assert.equal(shaftEvidence.role,'research-candidate-not-selected-or-owned');
});
