/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createDesign,deriveGeometry,exportCad,spatialChecks,frameReviewBasis,reviseDesign} from '../scripts/design-artifact.mjs';
import {framePlan,starterFrameProfile} from '../scripts/frame-profile.mjs';
import {frameDxf} from '../scripts/frame-dxf.mjs';
import {fieldGeometry} from '../scripts/field-rehearsal-geometry.mjs';
import {createFieldRehearsal} from '../scripts/field-rehearsal.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
const area=points=>points.reduce((sum,[x,y],i)=>{const q=points[(i+1)%points.length];return sum+(x*q[1]-q[0]*y)/2;},0);
test('two rear cuts preserve the front and miter every bumper layer at its true normal offset',()=>{
  const d=createDesign(),g=deriveGeometry(d),plan=g.framePlan;
  assert.equal(plan.points.length,6);near(plan.points[0][0],-.35+.064);
  near(plan.perimeter,2*(.7+.64)-2*(.128-Math.hypot(.064,.064)));
  near(area(plan.points),.7*.64-.064**2);
  near(plan.outer[0][0]+.35+.06,.064+(2-Math.SQRT2)*.06);
  near(Math.max(...plan.outer.map(([x,y])=>Math.hypot(x,y))),Math.hypot(.35+.06,.32+.06));
  const bands=g.volumes.filter(v=>v.layers);
  assert.deepEqual(bands.map(v=>v.id),['right-bumper','front-bumper','left-bumper','rear-left-bumper','rear-bumper','rear-right-bumper']);
  for(const segment of bands){
    assert.equal(segment.size[2],d.design.parameters.bumperHeightM);
    assert.deepEqual(segment.layers.map(l=>l.role),['backing','padding','cover']);
    near(segment.layers.reduce((v,l)=>v+area(l.polygon),0),area(segment.polygon));
  }
  near(bands.reduce((v,b)=>v+area(b.polygon),0),area(plan.outer)-area(plan.points));
  assert.equal((frameDxf(plan).match(/LWPOLYLINE/g)||[]).length,4);
  assert.match(exportCad(d),/linear_extrude/);
  assert.equal(spatialChecks(d).find(r=>r.id==='frame-rules-corner-coverage').status,'unknown');
});

test('existing unshaped artifacts retain square geometry and a sourced override retains its own outline',()=>{
  const legacy=createDesign();delete legacy.design.frameProfile;
  assert.equal(deriveGeometry(legacy).volumes[0].kind,'box');
  assert.equal(deriveGeometry(legacy).framePlan,undefined);
  const custom={kind:'rear-chamfer',cutbacksMm:[30,60]};
  const plan=framePlan(700,640,custom,20);
  near(plan.points[0][0],-320);near(plan.points[4][1],260);
  const rect=framePlan(3,2,{kind:'convex-outline',vertices:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]});
  near(rect.perimeter,10);
  assert.throws(()=>framePlan(700,640,{kind:'rear-chamfer',cutbacksMm:[64,320]}));
  assert.throws(()=>framePlan(3,2,{kind:'convex-outline',vertices:[[-.5,-.5],[.5,.5],[.5,-.5],[-.5,.5]]}));
});

test('walls, obstacles and peer collisions distinguish a cut rear corner at yaw and use separate cache keys',()=>{
  const profile=JSON.parse(fs.readFileSync(new URL('../examples/kickoff/training-field.json',import.meta.url)));
  profile.landmarks=[];profile.rehearsal.obstacles=[{name:'post',kind:'solid',lower:0,poly:[[52,136],[54,136],[54,138],[52,138]]}];
  profile.frameProfile={kind:'rear-chamfer',shortSideFractions:[.25,.25]};
  const geometry=fieldGeometry(profile),center=[100,100],corner=[53,137];
  const frame={length:100,width:80,height:20,bumper:0,heading:0};
  const square={...frame,frameProfile:{kind:'square'}},peer={length:2,width:2,height:3,bumper:0,heading:0,frameProfile:{kind:'square'}};
  assert.equal(geometry.hit(center,center,square)?.name,'post');assert.equal(geometry.hit(center,center,frame),null);
  assert.equal(geometry.hit(center,center,{...frame,heading:180})?.name,'post');
  assert.equal(geometry.robotContact(center,center,frame,corner,corner,peer),null);
  assert.notEqual(geometry.robotContact(center,center,square,corner,corner,peer),null);
  const sim=createFieldRehearsal(profile),red=sim.defaults('red',1),blue=sim.defaults('blue',1);
  assert.equal(geometry.footprint([0,0],red).length,6);near(Math.abs(red.heading-blue.heading),180);
});

test('project initialization and design CLI adopt an explicit override without overwriting it',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'frc-frame-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  execFileSync('git',['init','-q',root]);const run=(...args)=>execFileSync(process.execPath,args,{stdio:'pipe'});
  run('scripts/project-layout.mjs','init',root);
  const setting=path.join(root,'cad','frame-profile.json'),artifact=path.join(root,'cad','next.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(setting)),starterFrameProfile());
  fs.writeFileSync(setting,JSON.stringify({kind:'square'}));
  run('scripts/project-layout.mjs','init',root);run('scripts/design.mjs','new',artifact);
  assert.deepEqual(JSON.parse(fs.readFileSync(artifact)).design.frameProfile,{kind:'square'});
});

test('direct edits, revised designs and CLI imports cannot inherit a stale attachment finding',t=>{
  const source=id=>({id,url:'https://example.org/'+id,locator:'catalog section',sha256:'a'.repeat(64),scope:'Synthetic review evidence'});
  const base=createDesign({frameProfile:{kind:'square'},sources:[source('manual'),source('assembly')],frameRuleReview:{
    edition:'Teaching edition',cutoff:'2030-01-01',sourceId:'manual',assemblySourceIds:['assembly'],
    checks:[{topic:'attachment',finding:'supported',locator:'§ A',basis:'Square attachment backing review.'}]}});
  const status=a=>spatialChecks(a).find(r=>r.id==='frame-rules-attachment').status;
  assert.equal(status(base),'unknown');
  base.design.frameRuleReview.reviewedBasis=frameReviewBasis(base);assert.equal(status(base),'pass');
  const changed=reviseDesign(base,a=>{a.design.frameProfile={kind:'rear-chamfer',cutbacksMm:[250,240]};});
  assert.equal(status(changed),'unknown');
  base.design.bumperConstruction.backing.material='Replacement stock';assert.equal(status(base),'unknown');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'frc-reviewed-frame-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'changed.json');fs.writeFileSync(file,JSON.stringify(changed));
  const report=JSON.parse(execFileSync(process.execPath,['scripts/design.mjs','validate',file]));
  assert.equal(report.checks.find(c=>c.id==='frame-rules-attachment').status,'unknown');
});
