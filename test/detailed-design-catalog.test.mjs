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

async function render(index,releases){
  const ids={current:node('section'),archive:node('ul'),'archive-title':node('h2')};
  const document={createElement:node,getElementById:id=>ids[id]};
  const files={'designs.json':index,[index.preliminaryIndex]:releases};
  const fetch=async url=>files[url]?{ok:true,json:async()=>files[url]}:{ok:false,status:404};
  let done;
  const settled=new Promise(resolve=>{done=resolve;});
  // The page ends with one promise chain; wait for it by wrapping the script's last statement.
  const wrapped=source.replace(/\.catch\(\(\)=>\{document\.getElementById\('current'\)\.textContent='The design index could not be loaded\.';\}\);\s*$/,
    m=>m.replace(/;\s*$/,'')+'.then(done);');
  assert.notEqual(wrapped,source,'the catalog still ends with its load-failure handler');
  new Function('document','fetch','done',wrapped)(document,fetch,done);
  await settled;
  return ids;
}
const base={schema:'agent-frc/detailed-design-index@1',preliminaryIndex:'../preliminary-design/releases.json'};

test('the catalog loads when no detailed design is current and links the preliminary design',async()=>{
  const ids=await render({...base,designs:['draft-001'],designStatus:{'draft-001':'withdrawn'},current:null,beside:null,
    reason:{'draft-001':'Invented reason.'}},{designStatus:{'layout-001':'effective'}});
  assert.doesNotMatch(text(ids.current),/could not be loaded/);
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
  const beside=await render({...base,designs:['detail-001','detail-002','detail-003'],
    designStatus:{'detail-001':'in-progress','detail-002':'effective','detail-003':'in-progress'},current:'detail-002',beside:'detail-003'},
    {designStatus:{}});
  assert.doesNotMatch(text(beside.current),/could not be loaded/);
  assert.equal(find(beside.current,link('detail-003')).length,1);
  assert.equal(find(beside.archive,link('detail-001')).length,1,'an older in-progress design is listed with its link');
});

test('a missing index still reports the load failure',async()=>{
  const ids=await render({...base,designs:undefined},null);
  assert.match(ids.current.textContent,/could not be loaded/);
});
