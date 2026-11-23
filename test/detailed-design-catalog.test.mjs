/**
 * @lane merge
 * @subject templates/detailed-design-index.html
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// The stock catalog's own script, run against a small stand-in for the browser's document.
const html=readFileSync(new URL('../templates/detailed-design-index.html',import.meta.url),'utf8');
const source=html.split('<script>')[1].split('</script>')[0];

/** An element that behaves like the browser's where the catalog relies on it: append returns nothing. */
function node(tag){
  return {tag,className:'',textContent:'',children:[],hidden:false,href:undefined,
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=[...items];if(items.length)this.textContent='';}};
}
const text=n=>typeof n==='string'?n:[n.textContent,...n.children.map(text)].join(' ').trim();
const find=(n,test)=>typeof n==='string'?[]:[...(test(n)?[n]:[]),...n.children.flatMap(c=>find(c,test))];

async function render(index,releases,staged=[],extra={}){
  const ids={current:node('section'),archive:node('ul'),'archive-title':node('h2')};
  const document={createElement:node,getElementById:id=>ids[id]};
  const files={'designs.json':index,[index.preliminaryIndex]:releases,...Object.fromEntries(staged.map(id=>['designs/'+id+'/index.html',{}])),...extra};
  const fetch=async url=>files[url]?{ok:true,json:async()=>files[url]}:{ok:false,status:404};
  let done;
  const settled=new Promise(resolve=>{done=resolve;});
  // The page ends with one promise chain; wait for it by wrapping the script's last statement.
  const wrapped=source.replace(/\.catch\(\(\)=>\{document\.getElementById\('current'\)\.textContent='The design index could not be loaded\.';\}\);\s*$/,
    m=>m.replace(/;\s*$/,'')+'.then(done);');
  assert.notEqual(wrapped,source,'the catalog still ends with its load-failure handler');
  new Function('document','fetch','done',wrapped)(document,fetch,done);
  await settled;
  // The effective card asks whether its review page is staged; let that answer land.
  await new Promise(resolve=>setTimeout(resolve,0));
  return ids;
}
const base={schema:'agent-frc/detailed-design-index@1',preliminaryIndex:'../preliminary-design/releases.json'};

test('the catalog loads when no detailed design is current and links the preliminary design',async()=>{
  const ids=await render({...base,designs:['draft-001'],designStatus:{'draft-001':'withdrawn'},current:null,beside:null,
    reason:{'draft-001':'Invented reason.'},lastCommit:{'draft-001':'0123456789abcdef0123456789abcdef01234567'}},{designStatus:{'layout-001':'effective'}});
  assert.doesNotMatch(text(ids.current),/could not be loaded/);
  assert.match(text(ids.archive),/Withdrawn: Invented reason\. Its files are in the repository history at commit 0123456789ab\./);
  assert.doesNotMatch(text(ids.archive),/archive\//,'a withdrawn design has no on-site archive');
  assert.match(text(ids.current),/No detailed design is published/);
  const links=find(ids.current,n=>n.tag==='a');
  assert.equal(links.length,1);
  assert.equal(links[0].href,'../preliminary-design/');
  assert.equal(links[0].textContent,'Open the current preliminary design');
  assert.equal(ids['archive-title'].hidden,false);
  assert.match(text(ids.archive),/Withdrawn: Invented reason\./);
});

test('the catalog loads with an in-progress design as the primary card, beside an effective one and in the archive',async()=>{
  const link=id=>n=>n.tag==='a'&&n.href==='designs/'+id+'/';
  const alone=await render({...base,designs:['detail-001'],designStatus:{'detail-001':'in-progress'},current:'detail-001',beside:null,
    preliminary:{'detail-001':'layout-001'}},{designStatus:{'layout-001':'effective'}});
  assert.doesNotMatch(text(alone.current),/could not be loaded/);
  assert.equal(find(alone.current,link('detail-001')).length,1);
  assert.match(text(alone.current),/Built on preliminary release layout-001/);
  // A version reads with the name of its architecture, from the preliminary index.
  const versioned=await render({...base,designs:['detail-001'],designStatus:{'detail-001':'in-progress'},current:'detail-001',beside:null,
    preliminary:{'detail-001':'1.0'}},{designStatus:{'1.0':'effective'},designs:{1:{name:'Tilting carriage'}}});
  assert.match(text(versioned.current),/Built on preliminary design Tilting carriage 1\.0\./);
  const beside=await render({...base,designs:['detail-001','detail-002','detail-003'],
    designStatus:{'detail-001':'in-progress','detail-002':'effective','detail-003':'in-progress'},current:'detail-002',beside:'detail-003'},
    {designStatus:{}});
  assert.doesNotMatch(text(beside.current),/could not be loaded/);
  assert.equal(find(beside.current,link('detail-003')).length,1);
  assert.equal(find(beside.archive,link('detail-001')).length,1,'an older in-progress design is listed with its link');
});

test('a version reads with its name, its draft while in progress and its status, built on its preliminary design',async()=>{
  // Synthetic index: "Tilting carriage" 1.0 was accepted and superseded by 1.1; draft 3 of 1.2 is built on preliminary 1.4.
  const ids=await render({...base,designs:['detail-001','1.0','1.1','1.2'],architectures:{1:{name:'Tilting carriage'}},
    designStatus:{'detail-001':'superseded','1.0':'superseded','1.1':'effective','1.2':'in-progress'},current:'1.1',beside:'1.2',
    supersededBy:{'detail-001':'1.0','1.0':'1.1'},accepted:{'1.0':'2001-01-02','1.1':'2001-02-03'},preliminary:{'1.1':'1.3','1.2':'1.4'},
    revision:{'1.0':{number:5,date:'2001-01-01'},'1.1':{number:2,date:'2001-02-02'},'1.2':{number:3,date:'2001-03-04'}}},
    {designStatus:{'1.3':'superseded','1.4':'effective'},designs:{1:{name:'Tilting carriage'}}});
  const titles=n=>find(n,x=>x.tag==='h3').map(x=>x.textContent);
  assert.deepEqual(titles(ids.current),['Tilting carriage 1.1 · effective','Tilting carriage 1.2 · draft 3 · in progress']);
  assert.match(text(ids.current.children[0]),/Built on preliminary design Tilting carriage 1\.3\./);
  assert.match(text(ids.current.children[0]),/Accepted 2001-02-03\./);
  assert.match(text(ids.current.children[0]),/Tilting carriage 1\.3 is now superseded\. Work on the effective preliminary design is the next version of this design\./);
  assert.match(text(ids.current.children[1]),/Built on preliminary design Tilting carriage 1\.4\./);
  assert.doesNotMatch(text(ids.current.children[1]),/re-linking/);
  // Earlier baselines read with their name; an earlier ID reads as the ID.
  assert.deepEqual(titles(ids.archive),['Tilting carriage 1.0 · superseded','detail-001 · superseded']);
  assert.match(text(ids.archive),/Superseded by Tilting carriage 1\.1\./);
});

test('one viewer for one design: the effective and the in-progress card both link the staged design review',async()=>{
  const index={...base,designs:['1.0','1.1'],architectures:{1:{name:'Tilting carriage'}},designStatus:{'1.0':'effective','1.1':'in-progress'},current:'1.0',beside:'1.1'};
  const link=id=>n=>n.tag==='a'&&n.href==='designs/'+id+'/'&&/Open the design review/.test(n.textContent);
  const shown=(ids,id)=>find(ids.current,n=>n.tag==='p'&&!n.hidden&&n.children.some(link(id))).length;
  const both=await render(index,{designStatus:{}},['1.0','1.1']);
  assert.deepEqual([shown(both,'1.0'),shown(both,'1.1')],[1,1]);
  assert.doesNotMatch(text(both.current),/model selector/);
  assert.equal(find(both.current,n=>!n.hidden&&n.textContent==='No design review is staged for this design yet.').length,0);
  // An effective design recorded from its review alone has no page: the card says so and offers no dead link.
  const unstaged=await render(index,{designStatus:{}},['1.1']);
  assert.deepEqual([shown(unstaged,'1.0'),shown(unstaged,'1.1')],[0,1]);
  assert.equal(find(unstaged.current,n=>!n.hidden&&n.textContent==='No design review is staged for this design yet.').length,1);
});

test('a card states the bench tests of its design from the record published beside the review',async()=>{
  // Synthetic record: one before-build test passed, one sits between its limits, one on-robot test is planned.
  const record={schema:'agent-frc/bench-tests@1',tests:[
    {id:'B1',measure:'Pull-out force',pass:40,fail:25,tag:'before-build',result:{value:46}},
    {id:'B2',measure:'Drag at full tilt',pass:3,fail:6,tag:'before-build',result:{value:4.5,passed:true}},
    {id:'B3',measure:'Samples retained',pass:9,fail:6,tag:'on-robot',owner:'Drive team',plan:'Ten releases'},
    {id:'B4',measure:'Marking',pass:'none',fail:'any',tag:'on-robot',owner:'',plan:''}]};
  const index={...base,designs:['1.0','1.1'],architectures:{1:{name:'Tilting carriage'}},designStatus:{'1.0':'effective','1.1':'in-progress'},current:'1.0',beside:'1.1'};
  const ids=await render(index,{designStatus:{}},['1.0','1.1'],{'designs/1.1/bench-tests.json':record});
  assert.match(text(ids.current.children[1]),/Bench tests: 1 of 2 before-build passed, 1 of 2 on-robot with an owner and a plan\./);
  assert.doesNotMatch(text(ids.current.children[0]),/Bench tests/,'a design with no record says nothing');
});

test('a malformed index still reports the load failure',async()=>{
  const ids=await render({...base,designs:undefined},null);
  assert.match(ids.current.textContent,/could not be loaded/);
});
