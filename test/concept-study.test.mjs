/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPinned } from '../scripts/release-height.mjs';
import { validateConceptBot } from '../scripts/concept-bot.mjs';
import { expandConceptStudy } from '../scripts/concept-study.mjs';

const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','examples','concept-study');
const study=JSON.parse(await readFile(path.join(dir,'study.json'),'utf8'));
// The example pins must hold: each role's file hashes to its sha256.
const documents=Object.fromEntries(await Promise.all(study.roles.map(async role=>
  [role.id,JSON.parse((await readPinned(dir,role.concept)).toString('utf8'))])));
const edit=(x,change)=>{const copy=structuredClone(x);change(copy);return copy;};
const sweeps=conceptSweeps=>edit(study,s=>{s.conceptSweeps=conceptSweeps;});
const axisValues=(result,role)=>Object.fromEntries(result.axes.filter(a=>a.baseRole===role).map(a=>[a.pointer,a.values]));
const variantValues=(result,role,pointer)=>result.variants.filter(v=>v.baseRole===role&&v.pointer===pointer).map(v=>v.value);
const get=(doc,pointer)=>pointer.split('/').slice(1).reduce((o,k)=>o[k],doc);

// Hand-computed from the turret shooter's assumed values: base × {0.5, 0.75, 1, 1.25, 1.5}, clipped to VALIDITY,
// capacity rounded to whole pieces, duplicates removed.
const turretDefaults={
  '/drive/topSpeedInS/value':[90,135,180,225,270],
  '/drive/accelInS2/value':[125,187.5,250,312.5,375],
  '/drive/rotationDegS/value':[180,270,360,450,540],
  '/inputs/0/secondsPerPiece/value':[0.25,0.375,0.5,0.625,0.75],
  '/storage/capacity/tile/value':[2,3,4,5],
  '/storage/transferS/value':[0.375,0.5625,0.75,0.9375,1.125],
  '/outputs/0/secondsPerPiece/value':[0.2,0.3,0.4,0.5,0.6],
  '/outputs/0/successFraction/value':[0.4,0.6,0.8,1],
  '/outputs/0/ranged/firesWhileMoving/successFraction/value':[0.3,0.45,0.6,0.75,0.9],
};

test('defaults sweep each assumed quantity over its clipped multiples, one quantity per variant',()=>{
  const result=expandConceptStudy(sweeps({}),documents);
  assert.deepEqual(axisValues(result,'fixed-shooter'),turretDefaults);
  assert.deepEqual(axisValues(result,'front-intake-placer')['/storage/capacity/tile/value'],[1,2]);
  assert.deepEqual(axisValues(result,'front-intake-placer')['/outputs/0/successFraction/value'],[0.45,0.675,0.9,1]);
  assert.deepEqual(variantValues(result,'fixed-shooter','/drive/topSpeedInS/value'),[90,135,225,270]);
  assert.equal(result.variants.length,96);
  assert.deepEqual(result.baseRoles.map(r=>r.id),['front-intake-placer','turret-shooter','fixed-shooter']);
  assert.deepEqual(result.roles.map(r=>r.id),[...result.baseRoles.map(r=>r.id),...result.variants.map(v=>v.id)]);
  const conceptIds=new Set(Object.values(documents).map(d=>d.id));
  for(const v of result.variants){
    assert.equal(v.status,'ok');
    assert.equal(v.id,v.baseRole+'@'+v.pointer+'='+v.value);
    const base=documents[v.baseRole],role=result.roles.find(r=>r.id===v.id),baseRole=study.roles.find(r=>r.id===v.baseRole);
    assert.equal(validateConceptBot(v.document),v.document);
    assert.equal(get(v.document,v.pointer),v.value);
    // Only the concept identity and the swept quantity differ from the base document.
    const restored=edit(v.document,d=>{d.id=base.id;d.name=base.name;Object.assign(get(d,v.pointer.replace(/\/value$/,'')),get(base,v.pointer.replace(/\/value$/,'')));});
    assert.deepEqual(restored,base);
    assert.deepEqual([role.plans,role.endgame],[baseRole.plans,baseRole.endgame]);
    assert.equal(role.concept.id,v.document.id);
    assert.ok(!conceptIds.has(v.document.id),v.document.id+' is unique');
    conceptIds.add(v.document.id);
  }
  // Deterministic: the same study expands to the same variant documents.
  assert.deepEqual(expandConceptStudy(sweeps({}),documents).variants,result.variants);
});

test('only quantities labelled assumed are swept by default',()=>{
  const observed=edit(documents,d=>{d['fixed-shooter'].drive.accelInS2.label='observed';});
  const result=expandConceptStudy(sweeps({}),observed);
  assert.equal(axisValues(result,'fixed-shooter')['/drive/accelInS2/value'],undefined);
  assert.deepEqual(axisValues(result,'turret-shooter')['/drive/accelInS2/value'],turretDefaults['/drive/accelInS2/value']);
});

test('defaults: false yields no variants and leaves the base roles to play alone',()=>{
  const result=expandConceptStudy(sweeps({defaults:false}),documents);
  assert.deepEqual([result.variants,result.axes],[[],[]]);
  assert.deepEqual(result.roles,study.roles);
  // Control: the same study with defaults on sweeps something.
  assert.ok(expandConceptStudy(sweeps({defaults:true}),documents).variants.length>0);
});

test('an explicit axis replaces the default for its pointer and nothing else',()=>{
  const result=expandConceptStudy(study,documents);
  assert.deepEqual(axisValues(result,'turret-shooter'),{...turretDefaults,'/drive/topSpeedInS/value':[120,150,180,210,240]});
  assert.deepEqual(axisValues(result,'fixed-shooter')['/drive/topSpeedInS/value'],turretDefaults['/drive/topSpeedInS/value']);
  const only=expandConceptStudy(sweeps({defaults:false,axes:study.conceptSweeps.axes}),documents);
  assert.deepEqual(only.variants.map(v=>v.id),[120,150,210,240].map(n=>'turret-shooter@/drive/topSpeedInS/value='+n));
});

test('an explicit axis needs 2 to 9 values that include the base value',()=>{
  const axis=values=>sweeps({axes:{'turret-shooter':[{pointer:'/drive/topSpeedInS/value',values}]}});
  assert.throws(()=>expandConceptStudy(axis([120,150,210]),documents),/turret-shooter.*\/drive\/topSpeedInS\/value.*base value 180/);
  assert.throws(()=>expandConceptStudy(axis([180]),documents),/2.9 values/);
  assert.throws(()=>expandConceptStudy(axis([100,120,140,160,180,200,220,240,260,280]),documents),/2.9 values/);
  assert.throws(()=>expandConceptStudy(sweeps({axes:{'turret-shooter':[{pointer:'/body/frameLengthIn/value',values:[28,30]}]}}),documents),
    /not a sweepable quantity/);
  assert.throws(()=>expandConceptStudy(sweeps({axes:{'no-such-role':[{pointer:'/drive/topSpeedInS/value',values:[180,200]}]}}),documents),
    /no-such-role/);
});

test('a variant the validator rejects is recorded as invalid and is not playable',()=>{
  const result=expandConceptStudy(sweeps({defaults:false,axes:{
    'turret-shooter':[{pointer:'/outputs/0/successFraction/value',values:[0.8,0.9,1.2]}],
    'fixed-shooter':[{pointer:'/storage/capacity/tile/value',values:[2.5,3]}]}}),documents);
  assert.deepEqual(result.variants.map(v=>[v.id,v.status]),[
    ['turret-shooter@/outputs/0/successFraction/value=0.9','ok'],
    ['turret-shooter@/outputs/0/successFraction/value=1.2','invalid'],
    ['fixed-shooter@/storage/capacity/tile/value=2.5','invalid']]);
  const [, fraction, capacity]=result.variants;
  assert.match(fraction.error,/outputs\[0\]\.successFraction: must lie within 0 to 1/);
  assert.match(capacity.error,/storage\.capacity\.tile: must be a whole number/);
  assert.deepEqual([fraction.document,capacity.document],[null,null]);
  assert.deepEqual(result.roles.map(r=>r.id),[...study.roles.map(r=>r.id),'turret-shooter@/outputs/0/successFraction/value=0.9']);
});

test('a concept study needs 2 to 8 base roles',()=>{
  assert.throws(()=>expandConceptStudy(edit(study,s=>{s.roles=s.roles.slice(0,1);}),documents),/2.8 base roles/);
  const nine=edit(study,s=>{s.roles=Array.from({length:9},(_,i)=>({...s.roles[i%3],id:'role-'+i}));delete s.conceptSweeps;});
  const docs=Object.fromEntries(nine.roles.map((r,i)=>[r.id,documents[study.roles[i%3].id]]));
  assert.throws(()=>expandConceptStudy(nine,docs),/2.8 base roles/);
  assert.equal(expandConceptStudy(edit(nine,s=>{s.roles=s.roles.slice(0,8);}),docs).baseRoles.length,8);
});
