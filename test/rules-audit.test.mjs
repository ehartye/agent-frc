import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildRuleAudit} from '../scripts/rules-audit.mjs';
const audit=(season,extra={})=>buildRuleAudit({season,asOf:'2026-11-15',eventStage:'archive-study',...extra});
test('Hardware facts remain attached to distinct official snapshots',()=>{
 assert.deepEqual([2024,2025,2026].map(y=>audit(y).selectedFacts.R104.startingHeightLimitIn),[48,42,30]);
 assert.deepEqual([2024,2025,2026].map(y=>audit(y).selectedFacts.R103.weightLimitLb),[125.5,115,115]);
 assert.match(audit(2024).eventCaution,/Update 21/);
});
test('A named event never silently adopts the archive as its rules',()=>{
 assert.throws(()=>audit(2024,{eventStage:''}));
 assert.equal(audit(2024,{eventStage:'March regional'}).applicability,'event-edition-needs-resolution');
 assert.equal(audit(2024).inspectionStatus,'not-assessed');
});
test('Future seasons and impossible dates are rejected while old reviews remain visible',()=>{
 assert.throws(()=>audit(2027));assert.throws(()=>audit(2026,{asOf:'2026-02-30'}));
 assert.equal(audit(2026,{asOf:'2027-01-01'}).stale,true);
});
test('Each review map is tied to its case fingerprint and leaves physical evidence open',()=>{
 for(const y of [2024,2025,2026]){const d=audit(y),c=JSON.parse(fs.readFileSync(new URL('../case-studies/'+y+'/case.json',import.meta.url)));
 assert.equal(d.manualSha256,c.manualFingerprint.sha256);assert.equal(d.manual,c.manual);
 assert.equal(d.readingMap.length,7);assert(d.readingMap.every(r=>r.page>0&&r.rules&&r.status==='review-required'));
 assert.equal(d.networkAccess,false);}
});
