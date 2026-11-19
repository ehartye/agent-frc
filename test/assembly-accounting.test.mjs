import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewAssembly} from '../scripts/assembly-accounting.mjs';

const sample=fileURLToPath(new URL('../examples/assembly-accounting/mapping.json',import.meta.url));
async function run(t,edit){
  const dir=await mkdtemp(path.join(tmpdir(),'assembly-account-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const request=JSON.parse(await readFile(sample,'utf8'));
  request.sources[0].file=path.join(path.dirname(sample),'bench.json');
  edit(request);
  const file=path.join(dir,'mapping.json');
  await writeFile(file,JSON.stringify(request));
  return reviewAssembly(file);
}

test('counts installed units, included subparts and service space separately across poses',async t=>{
  const r=await run(t,x=>{
    x.exports.push({...x.exports[0],id:'reopened'});
    x.assignments.push(...x.assignments.map(row=>({...row,export:'reopened'})));
  });
  assert.equal(r.coverage.covered,12);
  assert.equal(r.coverage.roles.service,2);
  assert.equal(r.coverage.roles.included,2);
  assert.equal(r.coverage.bindings.drive.length,4);
  assert.equal(r.buy[0].requiredUnits,2);
  assert.equal(r.buy[0].packsToCoverKnownShortfall,1);
  assert.equal(r.buy[1].shortfall,null);
  assert.equal(r.orderQuantitiesKnown,false);
  assert.deepEqual(r.undecided,['retainer']);
  assert.ok(Math.abs(r.mass.configurationMarginKg[0]+.05)<1e-12);
});
test('preserves missing, duplicate and orphan included assignments, partial mass and unmodeled requirements',async t=>{
  const r=await run(t,x=>{
    x.assignments=x.assignments.filter(row=>row.occurrence!=='motor');
    x.assignments.push({...x.assignments[0]});
    x.instances.push({id:'clip',presence:'unmodeled',disposition:'make'});
    x.mass.baseline=null;
  });
  assert.equal(r.coverage.missing.length,1);
  assert.equal(r.coverage.duplicates.length,1);
  assert.equal(r.coverage.orphanIncluded.length,1);
  assert.equal(r.inventoryComplete,false);
  assert.ok(r.make.includes('clip'));
  assert.deepEqual(r.mass.knownInstanceSubtotalKg,[0,0]);
  assert.equal(r.mass.configurationMarginKg,null);
});
test('keeps a partial or unaudited mass margin open while reporting represented quantities',async t=>{
  for(const edit of [x=>{x.scope='partial';},x=>x.mass.omissions.push('fasteners')]){
    const r=await run(t,edit);
    assert.ok(r.mass.representedMarginKg[0]<0);
    assert.equal(r.mass.configurationMarginKg,null);
    assert.deepEqual(r.mass.knownInstanceSubtotalKg,[.14,.14]);
  }
  const uncertain=await run(t,x=>{x.changes[1].delta=null;});
  assert.equal(uncertain.mass.representedMarginKg,null);
  assert.deepEqual(uncertain.mass.missingDeltas,['retainer']);
});
test('applies a replacement once and recalculates the make and buy list for the resulting configuration',async t=>{
  const r=await run(t,x=>{
    x.selected=['shield'];
    x.changes[0].remove=['left'];
    x.instances.find(p=>p.id==='shield').disposition='buy';
    x.instances.find(p=>p.id==='shield').article='drive';
    Object.assign(x.articles[1],{sku:'sample/drive',onHand:2,unitsPerPack:4});
  });
  assert.equal(r.orderQuantitiesKnown,true);
  assert.deepEqual(r.buy[0].instances,['right']);
  assert.deepEqual(r.buy[1].instances,['drive','shield']);
  assert.equal(r.buy[1].packsToCoverKnownShortfall,0);
  assert.ok(Math.abs(r.mass.configurationMarginKg[0]-.04)<1e-12);
});
test('rejects conflicting alternatives, double removal credit, missing identities and altered evidence',async t=>{
  const cases=[
    [x=>x.changes.forEach(c=>{c.exclusiveGroup='guard';}),/alternatives/],
    [x=>x.changes.forEach(c=>{c.remove=['guard'];}),/twice-credited/],
    [x=>{x.exports[0].variant={group:'skin',choice:'light'};x.exports.push({...x.exports[0],id:'other',variant:{group:'skin',choice:'dark'}});},/variants/],
    [x=>{x.assignments[0].instance='absent';},/physical instance/],
    [x=>{x.mass.baseline.rangeKg=[1,2];},/differs from pinned/],
    [x=>{x.sources[0].sha256='0'.repeat(64);},/digest mismatch/],
    [x=>{x.changes[0].configuration='other';},/baseline mismatch/]
  ];
  for(const [edit,expected] of cases) await assert.rejects(()=>run(t,edit),expected);
});

test('counts only the final installation while retaining each signed revision',async t=>{
  const result=await run(t,request=>{
    request.selected=['shield','swap-shield'];
    for(const part of request.instances.filter(p=>p.id==='shield'||p.id==='retainer')){
      part.disposition='buy';
      part.article='drive';
    }
  });
  assert.deepEqual(result.buy.find(line=>line.article==='drive').instances,['drive','retainer']);
  assert.deepEqual(result.mass.changes.map(row=>row.id),['shield','swap-shield']);
  assert.deepEqual(result.mass.changes.map(row=>row.delta.rangeKg),[[0.16,0.16],[-0.07,-0.07]]);
  for(const [index,expected] of [3.69,3.89].entries()){
    assert.ok(Math.abs(result.mass.representedRangeKg[index]-expected)<1e-12);
  }
});

test('requires a previously installed candidate and rejects repeated additions and removal credits',async t=>{
  for(const order of [['swap-shield'],['swap-shield','shield']]){
    await assert.rejects(run(t,request=>{request.selected=order;}),/Absent or twice-credited removal: shield/);
  }
  for(const [remove,add,error] of [
    [['shield'],[],/Absent or twice-credited removal: shield/],
    [[],['shield'],/Unknown or repeated added instance: shield/]
  ]){
    await assert.rejects(run(t,request=>{
      request.changes.push({...request.changes[0],id:'last',remove,add,delta:null});
      request.selected=['shield','swap-shield','last'];
    }),error);
  }
});

test('distinguishes a pinned limit from a planning allowance and an unknown limit', async t => {
  const pinned = await run(t, () => {});
  assert.equal(pinned.mass.limitBasis, 'source-pinned');
  assert.deepEqual(pinned.mass.limitEvidence, {source: 'bench', pointer: '/mass/inspectionLimitKg'});
  const legacy = await run(t, request => { delete request.mass.limitEvidence; });
  assert.equal(legacy.mass.limitBasis, 'project-declared');
  assert.deepEqual(legacy.mass.representedMarginKg, pinned.mass.representedMarginKg);
  assert.equal(legacy.mass.configurationMarginKg, null);
  const unknown = await run(t, request => {
    delete request.mass.limitEvidence;
    request.mass.limitKg = null;
  });
  assert.equal(unknown.mass.limitBasis, 'unknown');
  assert.equal(unknown.mass.representedMarginKg, null);
  await assert.rejects(run(t, request => { request.mass.limitKg += 0.3; }), /Inspection limit differs/);
  await assert.rejects(run(t, request => { request.mass.limitEvidence.pointer = '/missing'; }), /Locator absent/);
});
