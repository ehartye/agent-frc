/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VALIDITY, applyProfileDefaults, compileConceptBot, validateConceptBot } from '../scripts/concept-bot.mjs';

const load=async name=>JSON.parse(await readFile(new URL('../examples/concept-bots/'+name+'.json',import.meta.url)));
const turret=await load('turret-shooter'), fixed=await load('fixed-shooter'), placer=await load('front-intake-placer');
const edit=(doc,change)=>{const copy=structuredClone(doc);change(copy);return copy;};
const rejects=(doc,pattern)=>{assert.throws(()=>validateConceptBot(doc),pattern);assert.throws(()=>compileConceptBot(doc),pattern);};
const reorder=x=>x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(reorder):
  Object.fromEntries(Object.keys(x).reverse().map(k=>[k,reorder(x[k])]));
const wrapped=x=>x!==null&&typeof x==='object'&&(Object.hasOwn(x,'basis')||Object.values(x).some(wrapped));

test('the three invented examples validate and compile to the shared rehearsal record',()=>{
  for(const doc of [turret,fixed,placer])assert.equal(validateConceptBot(doc),doc);
  const record=compileConceptBot(turret);
  assert.match(record.concept.digest,/^[0-9a-f]{64}$/);
  assert.deepEqual({...record,concept:{...record.concept,digest:'x'}},{
    length:28,width:28,height:24,bumper:3,speed:180,frameProfile:{kind:'rear-chamfer',shortSideFractions:[0.1,0.1]},
    concept:{id:'turret-shooter',digest:'x',defaultsApplied:[],
      drive:{type:'swerve',topSpeedInS:180,accelInS2:250,rotationDegS:360},
      body:{maxHeightIn:30,maxReachIn:6},
      massLb:null,
      inputs:[{id:'front-intake',face:'front',widthIn:20,extensionIn:6,pieces:['tile'],headingToleranceDeg:15,
        acquireHeightIn:{min:0,max:4},secondsPerPiece:0.5,requiresStop:false}],
      storage:{capacity:{tile:3},transferS:0.75},
      outputs:[{id:'shooter',face:'front',kind:'ranged',pieces:['tile'],secondsPerPiece:0.4,requiresStop:false,successFraction:0.8,
        ranged:{releaseHeightIn:22,launchSpeedInS:{min:200,max:400},elevationDeg:{min:20,max:60,slewDegS:90},
          turret:{minDeg:-90,maxDeg:90,slewDegS:360},aimToleranceDeg:3,
          firesWhileMoving:{maxRobotSpeedInS:60,successFraction:0.6}}}],
      concurrency:{intakeWhileScoring:true}}});
  const still=compileConceptBot(fixed).concept.outputs[0].ranged;
  assert.deepEqual([still.elevationDeg,still.turret],[{min:40,max:40,slewDegS:null},null]);
  const place=compileConceptBot(placer);
  assert.deepEqual(place.concept.outputs[0].place,{standOffIn:{min:2,max:8},headingToleranceDeg:10,releaseHeightIn:{min:10,max:40}});
  assert.equal(place.concept.outputs[0].ranged,undefined);
  assert.deepEqual(place.concept.massLb,{min:90,max:110,label:'assumed',default:false});
  for(const doc of [turret,fixed,placer])assert.equal(wrapped(compileConceptBot(doc)),false);
  assert.equal(compileConceptBot(edit(turret,d=>delete d.body.frameProfile)).frameProfile,undefined);
});

test('invalid concepts name the offending field',()=>{
  rejects(edit(turret,d=>delete d.drive.topSpeedInS),/drive\.topSpeedInS/);
  rejects(edit(turret,d=>{d.drive.type='tank';}),/drive\.type.*only swerve/);
  rejects(edit(turret,d=>{d.drive.accelInS2.label='guess';}),/drive\.accelInS2\.label/);
  rejects(edit(turret,d=>{d.drive.accelInS2.basis=' ';}),/drive\.accelInS2\.basis/);
  rejects(edit(turret,d=>{d.drive.rotationDegS=360;}),/drive\.rotationDegS/);
  rejects(edit(turret,d=>{Object.assign(d.outputs[0].ranged.launchSpeedInS,{min:400,max:200});}),/outputs\[0\]\.ranged\.launchSpeedInS.*min/);
  rejects(edit(turret,d=>{d.outputs[0].successFraction.value=1.5;}),/outputs\[0\]\.successFraction/);
  rejects(edit(turret,d=>{d.drive.topSpeedInS.value=VALIDITY['drive.topSpeedInS'][1]+1;}),/drive\.topSpeedInS/);
  rejects(edit(turret,d=>{d.storage.capacity.tile.value=2.5;}),/storage\.capacity\.tile/);
  rejects(edit(turret,d=>delete d.storage.capacity.tile),/storage\.capacity\.tile/);
  rejects(edit(turret,d=>{d.outputs[0].pieces.push('disc');}),/storage\.capacity\.disc.*outputs\[0\]/);
  rejects(edit(turret,d=>{d.inputs[0].face='top';}),/inputs\[0\]\.face/);
  rejects(edit(turret,d=>{d.outputs[0].id='front-intake';}),/outputs\[0\]\.id/);
  rejects(edit(turret,d=>{d.outputs[0].ranged.elevationDeg.slewDegS=null;}),/outputs\[0\]\.ranged\.elevationDeg\.slewDegS/);
  rejects(edit(turret,d=>delete d.outputs[0].ranged.turret.slewDegS),/outputs\[0\]\.ranged\.turret\.slewDegS/);
  rejects(edit(turret,d=>{d.schema='agent-frc/concept-bot@2';}),/schema/);
  rejects(edit(turret,d=>{d.defaultsApplied=['massLb'];}),/defaultsApplied/);
  rejects(edit(placer,d=>{d.defaultsApplied=['massLb'];}),/defaultsApplied/);
  rejects(edit(turret,d=>{d.defaultsApplied=['drive'];}),/defaultsApplied/);
  assert.ok(Object.isFrozen(VALIDITY));
  assert.ok(Object.values(VALIDITY).every(([lo,hi])=>Number.isFinite(lo)&&Number.isFinite(hi)&&lo<=hi));
});

test('a missing mass defaults to 75–95% of the profile inspection limit without mutating inputs',()=>{
  const profile={rehearsal:{robotLimits:{massLb:{value:100,factId:'R-mass'}}}}, before=JSON.stringify([turret,profile]);
  const filled=applyProfileDefaults(turret,profile);
  assert.equal(JSON.stringify([turret,profile]),before);
  assert.notEqual(filled,turret);
  assert.deepEqual({...filled.massLb,basis:undefined},{min:75,max:95,label:'assumed',basis:undefined,default:true});
  assert.match(filled.massLb.basis,/R-mass/);
  assert.deepEqual(filled.defaultsApplied,['massLb']);
  assert.deepEqual(compileConceptBot(filled).concept.massLb,{min:75,max:95,label:'assumed',default:true});
  assert.deepEqual(compileConceptBot(filled).concept.defaultsApplied,['massLb']);
  assert.deepEqual(applyProfileDefaults(filled,profile),filled);
  assert.equal(Object.hasOwn(applyProfileDefaults(placer,profile),'defaultsApplied'),false);
  assert.match(applyProfileDefaults(turret,{rehearsal:{robotLimits:{massLb:100}}}).massLb.basis,/robotLimits\.massLb/);
  assert.deepEqual(applyProfileDefaults(placer,profile).massLb,placer.massLb);
  for(const p of [{},{rehearsal:{robotLimits:{massLb:null}}},undefined])
    assert.equal(Object.hasOwn(applyProfileDefaults(turret,p),'massLb'),false);
});

test('the concept digest covers the source file: stable across key order and profile defaults, changed by content',()=>{
  const digest=doc=>compileConceptBot(doc).concept.digest;
  assert.equal(digest(reorder(turret)),digest(turret));
  for(const limit of [100,{value:120,factId:'R-mass'}]){
    const profile={rehearsal:{robotLimits:{massLb:limit}}};
    assert.equal(digest(applyProfileDefaults(fixed,profile)),digest(fixed));
    assert.equal(digest(applyProfileDefaults(placer,profile)),digest(placer));
  }
  assert.notEqual(digest(edit(fixed,d=>{d.massLb={min:75,max:95,label:'assumed',basis:'Student estimate.'};})),digest(fixed));
  assert.notEqual(digest(fixed),digest(turret));
  assert.notEqual(digest(edit(turret,d=>{d.drive.topSpeedInS.basis+=' Revised.';})),digest(turret));
});
