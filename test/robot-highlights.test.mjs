import {authorizeRender} from './authorize-render-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildHighlights} from '../scripts/robot-highlights.mjs';

test('bind the same approved project stylesheet to the showcase and its full-screen CAD', async t => {
  const root = await mkdtemp(path.join(tmpdir(),'robot-style-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  await cp(new URL('../examples/highlights/',import.meta.url), root, {recursive:true});
  const manifest = path.join(root,'project.json'), out = path.join(root,'site');
  const config = JSON.parse(await readFile(manifest,'utf8'));
  const css = '.cad-viewer figure { border: 0; }';
  const sha256 = createHash('sha256').update(css).digest('hex');
  config.stylesheet = {file:'robot.css',shareable:true,sha256};
  await writeFile(manifest,JSON.stringify(config));
  await writeFile(path.join(root,'robot.css'),css);
  authorizeRender(root);
  const generated = await readFile(await buildHighlights(manifest,out),'utf8');
  const asset = 'evidence/'+sha256+'.css';
  assert.ok(generated.includes('href="'+asset+'"'));
  const model = generated.match(/<iframe[^>]+src="([^"]+)"/)[1];
  assert.ok((await readFile(path.join(out,model),'utf8')).includes('href="../'+asset+'"'));
  assert.equal(await readFile(path.join(out,asset),'utf8'),css);
  await writeFile(path.join(root,'robot.css'),css+' /* new revision */');
  await assert.rejects(buildHighlights(manifest,out), /stylesheet/);
});

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
