import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, readFile, readdir, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildHighlights} from '../scripts/robot-highlights.mjs';

test('bind the approved project stylesheet to the results page', async t => {
  const root = await mkdtemp(path.join(tmpdir(),'robot-style-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  await cp(new URL('../examples/highlights/',import.meta.url), root, {recursive:true});
  const manifest = path.join(root,'project.json'), out = path.join(root,'site');
  const config = JSON.parse(await readFile(manifest,'utf8'));
  const css = '.robot-showcase figure { border: 0; }';
  const sha256 = createHash('sha256').update(css).digest('hex');
  config.stylesheet = {file:'robot.css',shareable:true,sha256};
  await writeFile(manifest,JSON.stringify(config));
  await writeFile(path.join(root,'robot.css'),css);
  const generated = await readFile(await buildHighlights(manifest,out,{note(){}}),'utf8');
  const asset = 'evidence/'+sha256+'.css';
  assert.ok(generated.includes('href="'+asset+'"'));
  assert.equal(await readFile(path.join(out,asset),'utf8'),css);
  await writeFile(path.join(root,'robot.css'),css+' /* new revision */');
  await assert.rejects(buildHighlights(manifest,out), /stylesheet/);
});

test('the results page embeds no model: it shows the design still and links the one design review', async t => {
  // Synthetic project: the example fixture, with an invented detailed design "Tilting carriage" 1.0 staged in its site.
  const root = await mkdtemp(path.join(tmpdir(),'robot-review-link-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  await cp(new URL('../examples/highlights/',import.meta.url), root, {recursive:true});
  const manifest = path.join(root,'project.json'), out = path.join(root,'docs/robot');
  const spec = JSON.parse(await readFile(manifest,'utf8'));
  const notes = [], build = async () => { notes.length = 0; await writeFile(manifest,JSON.stringify(spec)); return readFile(await buildHighlights(manifest,out,{note:n=>notes.push(n)}),'utf8'); };
  const still = createHash('sha256').update(await readFile(path.join(root,'docs/robot/cad/assembly.png'))).digest('hex');
  // No review is published yet: the page shows the still, says so, and the builder notes it. Nothing fails.
  const alone = await build();
  assert.match(alone, new RegExp('<section id="design"><h2>Explore the design</h2><figure><img alt="Mounting plate" src="evidence/'+still+'\\.png">'));
  assert.match(alone, /The design review is not published yet\./);
  assert.deepEqual(notes, ['No design review to link from the results page. Stage the detailed design, or set cad.review to its folder, and rebuild.']);
  assert.doesNotMatch(alone, /<iframe|Open the model full screen|Download the animated model/);
  assert.deepEqual((await readdir(out)).filter(name => name.startsWith('cad-')), [], 'no orbit viewer directory is written');
  // The current detailed design's staged review is linked without being named.
  await mkdir(path.join(root,'docs/detailed-design/designs/1.0'),{recursive:true});
  await writeFile(path.join(root,'docs/detailed-design/designs/1.0/index.html'),'<html>Review</html>');
  await writeFile(path.join(root,'docs/detailed-design/designs.json'),JSON.stringify({schema:'agent-frc/detailed-design-index@1',current:'1.0',beside:null,designs:['1.0'],
    architectures:{1:{name:'Tilting carriage'}},designStatus:{'1.0':'in-progress'}}));
  const linked = await build();
  assert.match(linked, /<a href="\.\.\/detailed-design\/designs\/1\.0\/"><img alt="Mounting plate"/);
  assert.match(linked, /Mounting plate · Independent Fusion teaching fixture[^<]* · <a href="\.\.\/detailed-design\/designs\/1\.0\/">Open the design review<\/a>/);
  assert.deepEqual(notes, []);
  // A manifest names another review by project path or address; an entry of the retired animated model is noted and ignored.
  spec.cad.review = 'docs/preliminary-design/releases/1.1/index.html';
  assert.match(await build(), /href="\.\.\/preliminary-design\/releases\/1\.1\/index\.html">Open the design review/);
  spec.cad.review = 'https://example.invalid/review/';
  spec.cad.playableGlb = 'docs/robot/cad/carriage.glb';
  assert.match(await build(), /href="https:\/\/example\.invalid\/review\/">Open the design review/);
  assert.deepEqual(notes, ['cad.playableGlb is no longer published: the design review plays the motion. Remove the entry.']);
  spec.cad.review = '../outside/';
  await assert.rejects(build, /Name the design review as a project-relative folder or page, or an HTTPS address/);
  // A changed source, a stale export record or a changed palette does not fail the build of a design that is not being re-exported.
  delete spec.cad.review; delete spec.cad.playableGlb;
  await writeFile(path.join(root,'mounting-plate.step'),'re-exported source, other bytes');
  await mkdir(path.join(root,'cad'),{recursive:true});
  await writeFile(path.join(root,'cad/component-palette.json'),JSON.stringify({schema:'agent-frc/component-palette@1',colors:{structure:'#112233'}}));
  await writeFile(path.join(root,'docs/robot/cad/receipt.json'),JSON.stringify({schema:'agent-frc/cad-still@2',source:'earlier.step',sourceSha256:'0'.repeat(64),appearances:{paletteSha256:'0'.repeat(64)}}));
  assert.match(await build(), /Open the design review/);
  // The still can be named directly; a manifest without a receipt or still reads the default image.
  spec.cad = {title:'Mounting plate',scope:'Invented scope.',shareable:true,still:'docs/robot/cad/assembly.png'};
  assert.match(await build(), /Invented scope\. · <a href=/);
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
