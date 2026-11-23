/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createDesign,validateDesign,canonicalStringify,reviseDesign,deriveGeometry,worldPoint,exportCad,spatialChecks,rehearsalBudget} from '../scripts/design-artifact.mjs';
const clone=a=>JSON.parse(JSON.stringify(a));
test('seed and serialization roundtrip preserve complete editable artifact',()=>{const a=createDesign(),s=canonicalStringify(a);assert.equal(canonicalStringify(JSON.parse(s)),s);assert.deepEqual(a,JSON.parse(s));assert.equal(validateDesign(a).valid,true)});
const source = {id:'drawing',url:'https://example.org/spec',locator:'edition A, drawing 4',scope:'Fixture geometry',sha256:null};
function profiled() {
  const rules = [['height',1.2],['stow',0],['bumper-zone',.2],['frame-perimeter',2.8]]
    .map(([id,maximumM])=>({id,maximumM,sourceId:'drawing'}));
  return createDesign({rules,sources:[source]});
}
function status(a,id){return spatialChecks(a).find(c=>c.id===id).status}
test('revision edit invalidates prior checks and preserves source',()=>{
  const a=profiled();
  a.checks=spatialChecks(a);
  const saved=canonicalStringify(a);
  const b=reviseDesign(a,x=>x.design.parameters.height=1.3);
  assert.equal(b.revision,2);
  assert.equal(b.parentRevision,1);
  assert.deepEqual(b.checks,[]);
  assert.equal(canonicalStringify(a),saved);
  assert.equal(status(b,'height'),'fail');
  b.checks=a.checks;
  assert.equal(validateDesign(b).valid,false);
});
test('opening reverses and cuts only the linked chassis parts',()=>{
  const original=createDesign(),open=reviseDesign(original,x=>x.operations[0].enabled=true);
  const closed=reviseDesign(open,x=>x.operations[0].enabled=false);
  assert.deepEqual(deriveGeometry(original),deriveGeometry(closed));
  assert.deepEqual(deriveGeometry(open).openings[0].targetIds,['frame-plate','body-envelope']);
  assert.equal(exportCad(open).match(/difference\(\)/g).length,2);
  assert.equal(exportCad(closed).includes('difference()'),false);
});
test('malformed and ambiguous inputs fail closed',()=>{for(const mutate of [a=>a.schema='unsupported',a=>a.units='mm',a=>a.geometry={},a=>a.design.parameters.height=NaN,a=>a.design.parameters.reach=-1,a=>a.design.parameters.height=Infinity,a=>a.design.parameters.opening=.8,a=>a.operations[0].targetIds.push('front-bumper'),a=>a.frames.robot.headingDeg='180',a=>a.strategy.activeNarrativeId='missing',a=>a.strategy.requirements[0].narrativeIds=['missing'],a=>a.checks=[{id:'stale',inputRevision:0,status:'pass',scope:'old',requirementIds:[]}],a=>a.rehearsal.route[1].id=a.rehearsal.route[0].id,a=>a.rehearsal.driveSpeedMps=0,a=>a.disciplinePlans.programming.states[0].requirementIds=['missing']]){const a=createDesign();mutate(a);assert.equal(validateDesign(a).valid,false)}});
test('frames preserve known transformed point and orientation',()=>{assert.deepEqual(worldPoint([1,0,0],{x:2,y:3,z:4,headingDeg:0}),[3,3,4]);const p=worldPoint([1,0,0],{x:2,y:3,z:4,headingDeg:180});assert(Math.abs(p[0]-1)<1e-12);assert(Math.abs(p[1]-3)<1e-12)});
test('project inputs set dimensions, source-backed limits and target placement',()=>{
  const base=profiled();
  const a=createDesign({workspace:{...base.workspace,targetSizeM:[.32,.46,.21],pieceCenterM:[1,2,.4],lengthM:10}});
  assert.equal(deriveGeometry(a).field.length,10);
  assert.deepEqual(deriveGeometry(a).target.size,[.32,.46,.21]);
  assert.deepEqual(deriveGeometry(a).piece.center,[1,2,.4]);
  a.frames.target={x:3,y:2,z:1,headingDeg:45,basis:'fixture datum'};
  assert(exportCad(a).includes('translate([3,2,1]) rotate([0,0,45])'));
  assert(spatialChecks(a).every(c=>c.status==='unknown'));
  for (const id of ['height','stow','bumper-zone','frame-perimeter']) assert.equal(status(base,id),'pass');
  base.design.parameters.reach=.2;
  assert.equal(status(base,'stow'),'fail');
  base.design.parameters.phase='deployed';
  assert.equal(status(base,'stow'),'not-applicable');
  assert.equal(status(base,'bumper-coverage'),'unknown');
});
test('invalid rules or dimensions cannot produce evidence',()=>{
  const a=profiled();
  for(const edit of [
    x=>x.rules[0].sourceId='missing',x=>x.rules.push(x.rules[0]),x=>x.rules[0].maximumM=-1,
    x=>x.rules[0].maximumM=Infinity,x=>x.workspace.targetSizeM=[1,0,1],
    x=>x.workspace.pieceCenterM=['1',2,3],x=>x.workspace.lengthM=0,
  ]) {const b=clone(a);edit(b);assert.equal(validateDesign(b).valid,false);}
  assert.throws(()=>createDesign({unrecognized:true}));
});
test('budget sums components and keeps assumptions',()=>{const b=rehearsalBudget(createDesign());assert.equal(b.totalS,b.driveS+b.turnS+b.actionS);assert.equal(b.basis,'assumed');assert.equal(b.actionS,3);const a=createDesign();a.rehearsal.route=[a.rehearsal.route[0]];assert.equal(rehearsalBudget(a).totalS,0)});
test('CLI new, validate, reversible revision, handoff and no overwrite',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'frc-design-'));try{const run=(...args)=>spawnSync(process.execPath,['scripts/design.mjs',...args],{encoding:'utf8'});const input=path.join(dir,'a.json'),next=path.join(dir,'b.json'),out=path.join(dir,'cad');const profile=path.join(dir,'project.json');fs.writeFileSync(profile,JSON.stringify({id:'custom',rules:profiled().rules,sources:[source]}));assert.equal(run('new',input,profile).status,0);assert.equal(JSON.parse(fs.readFileSync(input)).id,'custom');assert.equal(run('validate',input).status,0);assert.equal(run('opening',input,next,'on').status,0);assert.equal(run('export',next,out).status,0);assert.equal(run('export',next,out).status,1);assert.equal(run('new',input).status,1);assert.deepEqual(JSON.parse(fs.readFileSync(next)),JSON.parse(fs.readFileSync(path.join(out,'design.json'))));for(const name of ['HANDOFF.md','geometry.json','checks.json','blockout.scad'])assert(fs.statSync(path.join(out,name)).size>0);assert(fs.readFileSync(path.join(out,'HANDOFF.md'),'utf8').includes('Project maximum'));}finally{fs.rmSync(dir,{recursive:true,force:true})}});
test('chassis bay preserves provisional front support strip',()=>{const a=createDesign(),cut=deriveGeometry(a).openings[0];assert(Math.abs(a.design.parameters.frameLengthM/2-(cut.center[0]+cut.size[0]/2)-.05)<1e-12);assert.equal(spatialChecks(a).find(x=>x.id==='bumper-support').status,'unknown')});
test('CAD output explicitly converts metres to millimetres',()=>{const s=exportCad(createDesign());assert(s.includes('Output units: millimetres'));assert(s.includes('scale([1000,1000,1000]) {'));assert(s.endsWith('}\n'))});
test('mechanical and controls decisions retain traceability',()=>{
  const a=createDesign();
  for (const id of ['acquire','deliver','piece-variation']) assert(a.design.requirementLinks.tool.includes(id));
  assert(a.design.requirementLinks['frame-plate'].includes('reliability-pit'));
  assert.deepEqual(a.disciplinePlans.programming.states[0].requirementIds,['deliver']);
  assert.equal(a.strategy.narratives[0].status,'exploring');
  assert.equal(a.strategy.requirements.find(r=>r.id==='piece-variation').status,'unknown');
});
