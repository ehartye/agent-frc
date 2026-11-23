/** @lane merge */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldPieceMotion} from '../scripts/field-piece-motion.mjs';

const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const geometry={
  boundary:rect(0,0,120,90),
  obstacles:setup=>setup==='rail'?[{poly:rect(58,20,.25,50).reverse(),low:2}]:[],
  footprint:([x,y],r)=>rect(x-r.length/2,y-r.width/2,r.length,r.width)
};
const model=createFieldPieceMotion({rehearsal:{setups:['open']}},geometry);
const piece=(id,x,y,options={})=>({id,type:'disc',p:[x,y],radiusIn:2,...options});
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`expected ${a} near ${b}`);

test('custody transfers preserve each physical identity, serialize, and never mint duplicates',()=>{
  const row=piece('one',24,32),s=model.start([row]);
  row.p[0]=10;
  assert.equal(s.pieces[0].p[0],24);
  assert.throws(()=>model.put(s,row),/already present/);
  assert.throws(()=>model.start([row,row]),/Duplicate/);
  const held=model.take(s,'one');
  assert.equal(held.id,'one');
  assert.equal(model.take(s,'one'),null);
  assert.deepEqual(s.pieces,[]);
  model.put(s,{...held,p:[83,30],v:[2,0]});
  const copy=JSON.parse(JSON.stringify(s));
  model.advance(s,.05);
  model.advance(copy,.05);
  assert.deepEqual(s,copy);
  assert.throws(()=>model.start([piece('bad',1,1,{dragInS2:-1})]));
});

test('rolling resistance brings a freely moving item to rest at the analytical distance',()=>{
  const s=model.start([piece('one',20,33,{v:[10,0],dragInS2:10})]);
  for(let i=0;i<40;i++)model.advance(s,.05);
  near(s.pieces[0].p[0],25);
  assert.deepEqual(s.pieces[0].v,[0,0]);
});

test('a fast piece reflects at a thin obstacle, while a short piece fits beneath it',()=>{
  const options={dragInS2:0,restitution:1,v:[350,0]};
  const tall=model.start([piece('tall',44,48,options)]);
  const short=model.start([piece('short',44,48,{...options,heightIn:1.5})]);
  model.advance(tall,.1,[],'rail');
  model.advance(short,.1,[],'rail');
  assert.ok(tall.pieces[0].p[0]<=56);
  near(tall.pieces[0].v[0],-350);
  near(short.pieces[0].p[0],79);
  near(short.pieces[0].v[0],350);
});

test('a moving bumper transfers velocity to a loose piece and a guardrail contains it',()=>{
  const s=model.start([piece('one',53,45,{dragInS2:0,restitution:0})]);
  const r={id:'A',p:[50,45],previousP:[40,45],width:10,length:10};
  model.advance(s,.1,[r]);
  assert.ok(s.pieces[0].p[0]>=57-1e-6);
  near(s.pieces[0].v[0],100);
  model.advance(s,1);
  near(s.pieces[0].p[0],118);
  near(s.pieces[0].v[0],0);
});

test('two differently weighted pieces exchange momentum and retain their separate IDs',()=>{
  const s=model.start([piece('b',54,38,{dragInS2:0,restitution:1,massKg:3}),
    piece('a',46,38,{v:[10,0],dragInS2:0,restitution:1,massKg:1})]);
  model.advance(s,.8);
  const [a,b]=s.pieces;
  assert.equal(a.id,'a');
  near(a.v[0],-5);near(b.v[0],5);
  near(a.massKg*a.v[0]+b.massKg*b.v[0],10);
  assert.ok(b.p[0]-a.p[0]>=4);
});
