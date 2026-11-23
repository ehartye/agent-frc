/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reviewAssembly} from '../scripts/assembly-accounting.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = 'Synthetic archive identity for an offline fixture; no CAD execution.';
const archiveSha256 = digest(archive);
const configuration = 'weighing bench';
const cli = fileURLToPath(new URL('../scripts/assembly-accounting.mjs', import.meta.url));
function fixture() {
  const catalog = {sku:'Unit-01',unit:'kg per installed unit',rangeKg:[0.4,0.5]};
  const stock = {id:'pad-stock',grade:'Closed-cell sample, type Q',materialIds:['foam-A'],densityKgM3:[48,52]};
  const bench = {occurrences:['block','drive','stand'],padKg:[0.0049,0.0051],catalog,stock,looseKg:[0.02,0.03],limitKg:0.8,
    exclusion:{criterion:'removable bench supply lead',instances:['lead']}};
  const mass = (pointer,rangeKg) => ({source:'bench',basis:'estimated',pointer,rangeKg});
  const mapping = {schema:'agent-frc/assembly-accounting@1',revision:archiveSha256,configuration,scope:'complete',omissions:[],
    exports:[{id:'weigh',source:'bench',pointer:'/occurrences'}],articles:[{id:'drive',sku:catalog.sku}],
    assignments:[{occurrence:'block',role:'installed',instance:'pad'}, {occurrence:'drive',role:'installed',instance:'drive'},
      {occurrence:'stand',role:'external'}].map(row=>({...row,export:'weigh'})),
    instances:[{id:'pad',disposition:'make',presence:'modeled',mass:mass('/padKg',bench.padKg)},
      {id:'drive',disposition:'buy',presence:'modeled',article:'drive',mass:mass('/catalog/rangeKg',catalog.rangeKg)},
      {id:'lead',disposition:'undecided',presence:'unmodeled',mass:mass('/looseKg',bench.looseKg)}],
    changes:[],selected:[],mass:{configuration,revision:archiveSha256,unit:'kg',limitKg:0.8,limitEvidence:{source:'bench',pointer:'/limitKg'},baseline:null,omissions:[]},
    nativeMass:{archive:'archive',observations:'actual',plan:'plan'}};
  const bodies = [['block','core','stock-A','stock','pad'],['drive','housing','housing-A','article-proxy','drive'],
    ['drive','rotor','rotor-B','article-proxy','drive'],['stand','base','base-C','fixture'],['sign','badge','badge-D','display']]
    .map(([occurrence,body,identity,role,instance])=>({occurrence,body,identity,role,...(instance?{instance}:{reason:'separate teaching fixture'}),...(role==='stock'?{stock:stock.id}:{})}));
  const plan = {schema:'agent-frc/engineering-material-plan@1',configuration,archiveSha256,bodies,stocks:[{id:stock.id,source:'bench',pointer:'/stock'}],
    instances:[{id:'pad',basis:'stock',inspection:'counted'},{id:'drive',basis:'supplier',inspection:'counted',supplier:{source:'bench',pointer:'/catalog'}},
      {id:'lead',basis:'allowance',inspection:'excluded',reason:'bench comparison explicitly excludes cable',inspectionEvidence:{source:'bench',pointer:'/exclusion'}}]};
  const actual = {schema:'agent-frc/native-physical-properties@1',opened:true,configuration,archiveSha256,nativeBodyCount:5,rawBodyTotalKg:2.005,
    bodies:bodies.map(({occurrence,body,identity,instance},i)=>({occurrence,body,identity,instance:instance??null,materialId:i?'metal-default':'foam-A',
      volumeCm3:100,massKg:i?0.5:0.005,...(i===0?{stock:stock.id}:{})}))};
  return {mapping,bench,actual,plan};
}
async function emit(t, mutate=()=>{}) {
  const data=fixture();mutate(data);
  const dir=await mkdtemp(path.join(tmpdir(),'native-mass-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const pins=[];
  for(const [id,value] of Object.entries({archive,bench:data.bench,actual:data.actual,plan:data.plan})){
    const content=id==='archive'?value:JSON.stringify(value);
    const file=id+(id==='archive'?'.f3d':'.json');await writeFile(path.join(dir,file),content);
    pins.push({id,file,sha256:digest(content)});
  }
  const file=path.join(dir,'mapping.json');
  await writeFile(file,JSON.stringify({...data.mapping,sources:pins}));return file;
}

test('normal assembly CLI reconciles manufactured stock, one sealed article, two references and an unmodeled allowance',async t=>{
  const file=await emit(t);
  const review=JSON.parse(execFileSync(process.execPath,[cli,file],{encoding:'utf8'})).nativeMass;
  assert.equal(review.nativeBodies,5);
  assert.equal(review.rawNativeKg,2.005);
  assert.equal(review.rawByRoleKg['article-proxy'],1);
  assert.deepEqual(review.inspectionRangeKg,[0.40490000000000004,0.5051]);
  assert.deepEqual(review.inspectionExclusionsKg,[0.02,0.03]);
  assert.deepEqual(review.allowanceSubtotalKg,[0.02,0.03]);
  assert.deepEqual(review.supplierSubtotalKg,[0.4,0.5]);
  assert.ok(Math.abs(review.inspectionMarginKg[0]-0.2949)<1e-10);
});
test('rejects wrong physical stock, a replaced same-name body, missing geometry and double charging',async t=>{
  const cases=[
    [d=>{d.actual.bodies[0].materialId='metal-default'},/physical material mismatch/],
    [d=>{d.actual.bodies[0].stock='same-density-wrong-grade'},/stock binding mismatch/],
    [d=>{d.actual.bodies[0].massKg=0.785;d.actual.rawBodyTotalKg=2.785},/density outside/],
    [d=>{d.actual.bodies[0].identity='badge-D'},/engineering identity mismatch/],
    [d=>{d.actual.bodies.pop()},/missing body/],
    [d=>{d.actual.bodies.push(d.actual.bodies[0])},/duplicate observed bodies/],
    [d=>{d.plan.instances.pop()},/missing configured instance/],
    [d=>{d.plan.instances.push(d.plan.instances[0])},/duplicate engineering instances/],
    [d=>{d.plan.bodies[3].instance='drive'},/reference must have/],
    [d=>{d.plan.bodies[1].instance='pad'; d.actual.bodies[1].instance='pad'},/proxy cannot supply stock/],
    [d=>{Object.assign(d.plan.bodies[3],{role:'stock',instance:'pad',stock:'pad-stock'})},/physical owner differs/],
    [d=>{d.bench.catalog.sku='other'},/supplier mass/],
    [d=>{d.bench.exclusion.instances=[]},/inspection exclusion/],
    [d=>{d.actual.archiveSha256='0'.repeat(64)},/archive or configuration mismatch/],
    [d=>{d.actual.nativeBodyCount++},/body count/],
    [d=>{d.actual.rawBodyTotalKg++},/raw native/]
  ];
  for(const [edit,error] of cases)await assert.rejects(reviewAssembly(await emit(t,edit)),error);
});
test('withholds final ranges for missing evidence and explicitly compares like-for-like baselines',async t=>{
  const result=await reviewAssembly(await emit(t,d=>{d.plan.instances[2].basis='unknown'}));
  assert.equal(result.nativeMass.inspectionMarginKg,null);
  assert.deepEqual(result.nativeMass.unresolvedInstances,['lead']);
  const proxy=await reviewAssembly(await emit(t,d=>{
    d.plan.bodies[0].role='article-proxy';d.plan.instances[0].basis='allowance';d.actual.bodies[0].materialId='metal-default';
  }));
  assert.deepEqual(proxy.nativeMass.provisionalInstances,['pad']);
  assert.equal(proxy.nativeMass.inspectionRangeKg,null);
  assert.equal(proxy.mass.configurationMarginKg,null);
  const scoped=await reviewAssembly(await emit(t,d=>{
    d.plan.bodies[3].role='unresolved';delete d.actual.bodies[3].identity;
  }));
  assert.deepEqual(scoped.nativeMass.unresolvedBodies,[['stand','base']]);
  assert.equal(scoped.nativeMass.inspectionMarginKg,null);
  await assert.rejects(reviewAssembly(await emit(t,d=>{
    d.mapping.nativeMass.baselineScope='inspection';
    d.bench.oldKg=[2,3];d.mapping.mass.baseline={source:'bench',pointer:'/oldKg',basis:'estimated',rangeKg:[2,3]};
  })),/disagrees with the declared baseline/);
});
