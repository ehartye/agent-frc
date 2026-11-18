import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBrief,renderBrief} from '../scripts/strategy-brief.mjs';
test('All three briefs preserve distinct source pins and unresolved user decisions',()=>{
 const recommendations=new Set();
 for(const year of [2024,2025,2026]){const b=buildBrief(year);assert.match(b.source.manual,new RegExp('/frc'+year+'/'));assert.equal(b.decision.selectedByUser,null);assert.equal(b.decision.status,'proposal-for-review');assert.equal(b.source.fingerprint.sha256.length,64);recommendations.add(b.decision.recommendation);const ids=new Set([...b.rules,...b.assumptions].map(x=>x.id));for(const c of b.capabilities)for(const basis of c.basis)assert.ok(ids.has(basis));assert.match(renderBrief(b),/User-selected strategy: \*\*none\*\*/);}
 assert.equal(recommendations.size,3);
});
test('Changing scope changes recommended strategy and mechanism capability for every season',()=>{for(const year of [2024,2025,2026]){const a=buildBrief(year),b=buildBrief(year,{developmentScope:'expanded'});assert.notEqual(a.decision.recommendation,b.decision.recommendation);assert.notEqual(a.capabilities[2].requirement,b.capabilities[2].requirement);assert.equal(b.decision.selectedByUser,null);assert.deepEqual(a.rules,b.rules);}});
test('Half window doubles required rate without rewriting rules or declaring success',()=>{for(const year of [2024,2025,2026]){const a=buildBrief(year,{usableWindowSeconds:10,desiredPieces:6}),b=buildBrief(year,{usableWindowSeconds:5,desiredPieces:6});assert.match(a.capabilities[3].requirement,/0.600 pieces/);assert.match(b.capabilities[3].requirement,/1.200 pieces/);assert.match(b.capabilities[3].evidence,/OPEN/);assert.deepEqual(a.rules,b.rules);}});
test('Bad, unknown and decision-forging assumptions fail closed',()=>{for(const input of [{usableWindowSeconds:0},{usableWindowSeconds:'5'},{desiredPieces:1.5},{developmentScope:'magic'},{selectedByUser:'approved'},{eventContext:''}])assert.throws(()=>buildBrief(2026,input));assert.throws(()=>buildBrief(2027));});

test('Committed review artifacts match deterministic generator output',()=>{for(const year of [2024,2025,2026]){const b=buildBrief(year);assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../case-studies/'+year+'/strategy-brief.json',import.meta.url))),b);assert.equal(fs.readFileSync(new URL('../case-studies/'+year+'/strategy-brief.md',import.meta.url),'utf8'),renderBrief(b));}});

test('External review export uses resolvable evidence URLs and refuses overwrite',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'frc-strategy-'));try{const out=path.join(root,'review');const cli=new URL('../scripts/strategy-brief.mjs',import.meta.url);const result=spawnSync(process.execPath,[fileURLToPath(cli),'--season','2026','--output',out],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const file=path.join(out,'strategy-brief.json');const before=fs.readFileSync(file,'utf8');const brief=JSON.parse(before);assert.match(brief.existingEvidence.caseManifest,/^https:\/\/github.com\/ehartye\/agent-frc\//);const second=spawnSync(process.execPath,[fileURLToPath(cli),'--season','2026','--output',out],{encoding:'utf8'});assert.notEqual(second.status,0);assert.equal(fs.readFileSync(file,'utf8'),before);}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}});

test('Pose/alignment gating cites an explicit proposal, never the 2024 inventory rule',()=>{
 for(const year of [2024,2025,2026]){const b=buildBrief(year);const gate=b.capabilities.find(c=>c.id===year+'-CAP-GATE');assert.deepEqual(gate.basis,['A-GATE']);assert.equal(gate.kind,'strategic inference');assert.match(b.assumptions.find(a=>a.id==='A-GATE').kind,/not an official/);}
});
