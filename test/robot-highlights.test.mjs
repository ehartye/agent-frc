import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildHighlights} from '../scripts/robot-highlights.mjs';

test('generate, refresh and protect an evidence page', async t => {
  const root = await mkdtemp(path.join(tmpdir(),'robot-page-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const manifest = path.join(root,'page.json'), out = path.join(root,'site');
  const example = new URL('../examples/highlights/',import.meta.url);
  const run = await readFile(new URL('observations.json',example));
  const spec = JSON.parse(await readFile(new URL('project.json',example)));
  delete spec.cad;
  const save = () => writeFile(manifest,JSON.stringify(spec));
  await writeFile(path.join(root,'observations.json'),run);
  await save();
  const page = await buildHighlights(manifest,out);
  assert.deepEqual(await readFile(path.join(out,'evidence',spec.sources[0].sha256+'.json')),run);
  const baseline = await readFile(page,'utf8');
  assert.match(baseline,/1 passed, 1 failed, 1 unresolved/);
  assert.doesNotMatch(baseline,/Evidence gallery/);
  spec.title = '<New fixture>';
  await save();
  await buildHighlights(manifest,out);
  const updated = await readFile(page,'utf8');
  assert.match(updated,/&lt;New fixture&gt;/);
  for (const [mutate, reason] of [
    [s=>s.sources[0].shareable=false,/redistribution/],
    [s=>s.sources[0].sha256='0'.repeat(64),/Changed evidence/],
    [s=>s.campaign.unresolved=0,/campaign counts/],
    [s=>s.results[0].source='unlisted',/Unknown evidence/],
    [s=>s.sources.push({id:'remote',label:'Published',revision:'r',url:'file:///no'}),/HTTPS/],
    [s=>s.media=[{asset:'record',source:'record',caption:'A',description:'B'}],/image or film/],
  ]) {
    const bad = structuredClone(spec);
    mutate(bad);
    await writeFile(manifest,JSON.stringify(bad));
    await assert.rejects(buildHighlights(manifest,out),reason);
    assert.equal(await readFile(page,'utf8'),updated);
  }
  await save();
  const custom = path.join(root,'custom');
  await mkdir(custom);
  await writeFile(path.join(custom,'index.html'),'Handwritten');
  await assert.rejects(buildHighlights(manifest,custom),/independently authored/);
  assert.equal(await readFile(path.join(custom,'index.html'),'utf8'),'Handwritten');
});
