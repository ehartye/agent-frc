import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, probePage } from './headless-browser.mjs';
import { reviewScene } from './fixtures/review-scene.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = readFileSync(path.join(root, 'templates/preliminary-review/review.html'));
const sha = b => createHash('sha256').update(b).digest('hex');
const skip = !browser() && 'No Chrome or Edge found; set CHROME_PATH';

/** A release laid out as the site serves it: site/fonts, site/releases/ID/{index.html, review-scene.json.gz, receipt.json}. */
function release(site, id, scene, {receipt = true} = {}) {
  const dir = path.join(site, 'releases', id);
  mkdirSync(dir, {recursive: true});
  const content = Buffer.from(JSON.stringify(scene)), served = gzipSync(content);
  writeFileSync(path.join(dir, 'index.html'), page);
  writeFileSync(path.join(dir, 'review-scene.json.gz'), served);
  if (receipt) writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify({issue: scene.issue, planSha256: 'f'.repeat(64), status: 'layout-checked',
    decision: {status: 'layout-checked', firstUnmet: null}, reopen: [],
    view: {file: 'index.html', sha256: sha(page), verified: true, scene: {file: 'review-scene.json.gz', sha256: sha(served), contentSha256: sha(content), bytes: content.length}}}));
  return 'releases/' + id + '/index.html';
}
function site(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-structure-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  cpSync(path.join(root, 'templates/preliminary-review-fonts'), path.join(dir, 'fonts'), {recursive: true});
  return dir;
}
const ready = `for(let i=0;i<200&&/Loading|Verifying/.test(document.querySelector('#sceneStatus').textContent);i++)await new Promise(r=>setTimeout(r,50));
 for(let i=0;i<40&&!document.querySelector('#decisionSource').textContent.startsWith('(from');i++)await new Promise(r=>setTimeout(r,50));`;
const box = `const box=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top+scrollY,bottom:b.bottom+scrollY,width:b.width}};`;
const structure = ready + box + `
 const visible=e=>e&&e.offsetParent!==null&&getComputedStyle(e).visibility!=='hidden';
 const top=document.querySelector('.viewer .bar'),play=document.querySelector('.playback');
 const words=row=>[...row.querySelectorAll('b,label,button,a')].filter(visible).map(e=>e.textContent.trim()).filter(Boolean);
 return {
  regions:['#review-basis','.grid','#resources','.power-ledger','.checks','.lower:not(.power-ledger)','#motion-evidence','.notes'].map(s=>box(s).top),
  column:['.viewer .bar','#stage','.viewer>small','.playback','.mission-readout','#legend'].map(box),
  canvas:box('#stage'),inspector:box('aside'),metrics:box('#resources'),motion:box('#motion'),
  topWords:words(top),playWords:words(play),playLabels:play.querySelectorAll('label').length,
  slider:document.querySelector('#time').getAttribute('aria-label'),sliderLabels:document.querySelector('#time').labels.length,
  speeds:[...document.querySelector('#speed').options].map(o=>o.textContent),
  fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/"/g,'')+' '+f.weight),
  h1:getComputedStyle(document.querySelector('h1')).fontFamily,body:getComputedStyle(document.body).fontFamily,
  state:document.querySelector('#state').textContent,source:document.querySelector('#decisionSource').textContent,
  scroll:document.documentElement.scrollWidth};`;

test('the stock page keeps the reference region order, control placement, labels and fonts', {skip}, async t => {
  const dir = site(t), url = release(dir, 'a', reviewScene());
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({current: 'a', releases: ['a'], designStatus: {a: 'effective'}}));
  const top = await probePage(dir, url, ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent,context:document.querySelector('#context').textContent,heading:document.querySelector('h1').textContent,
    basisOpen:document.querySelector('#review-basis').open,unmetShown:!document.querySelector('#unmetInline').hidden,canvasTop:document.querySelector('#stage').getBoundingClientRect().top,
    idle:{actions:document.querySelector('#inspActions').hidden,hint:document.querySelector('#inspId').textContent,search:!!document.querySelector('#componentSearch')},
    csp:!!document.querySelector('head>meta[http-equiv="Content-Security-Policy"]:first-child')}`, {width: 1680, height: 1000});
  assert.equal(top.chip, 'Effective · layout-checked', 'the chip shows the design status from the index and the receipt decision');
  assert.equal(top.context, 'Synthetic project　/　a　/　Preliminary design');
  assert.equal(top.heading, 'Invented arm raise and return', 'the heading is the release title');
  assert.equal(top.basisOpen, false, 'the review basis starts collapsed');
  assert.equal(top.unmetShown, false, 'no first unmet requirement, so none is shown in the title row');
  assert.ok(top.canvasTop < 1000, 'the model starts within the first screen at 1680 x 1000 (' + top.canvasTop + ')');
  assert.deepEqual(top.idle, {actions: true, hint: 'Click a solid or choose a part in the inventory.', search: true}, 'the idle inspector shows its hint and search only');
  assert.equal(top.csp, true, 'the stock page ships its policy as the first element in <head>, and still loads its scene and fonts');
  // The opening view fits the robot, not the field: every robot body inside the canvas at a sensible share of its width.
  const fitted = await probePage(dir, url, ready + `await new Promise(r=>setTimeout(r,300));const cs=current(),box=[1/0,-1/0,1/0,-1/0],field=[1/0,-1/0];
   for(const id of presentIds(cs)){const m=poseAt(cs,id,0);for(const v of scene.meshes[cs.bodies[id].mesh].v){const p=lastProjection(flat(m,v));
    if(scene.bodies[id].fixture){field[0]=Math.min(field[0],p[0]);field[1]=Math.max(field[1],p[0]);continue}
    box[0]=Math.min(box[0],p[0]);box[1]=Math.max(box[1],p[0]);box[2]=Math.min(box[2],p[1]);box[3]=Math.max(box[3],p[1])}}
   return {share:(box[1]-box[0])/2,inside:box.every(x=>x>=-1&&x<=1),fieldOutside:field[1]>1}`, {width: 1680, height: 1000});
  assert.ok(fitted.inside && fitted.share >= 0.35 && fitted.share <= 0.85, 'robot framed on load: ' + JSON.stringify(fitted));
  assert.equal(fitted.fieldOutside, true, 'the fit excludes the field fixture, which lies beyond the robot');
  for (const width of [1280, 1600, 1920, 961]) {
    const g = await probePage(dir, url, structure, {width, height: 1000});
    assert.ok(!g.probeError, g.probeError);
    const at = width + ' px: ';
    assert.deepEqual([...g.regions].sort((a, b) => a - b), g.regions, at + 'regions in reference order: header, viewer row, resources, ledgers, checks, evidence, decision, notes');
    for (let i = 1; i < g.column.length; i++) assert.ok(g.column[i].top >= g.column[i - 1].bottom - 1, at + 'viewer column order item ' + i);
    assert.ok(g.motion.top >= g.canvas.bottom, at + 'the playback row, with the case selector, sits below the canvas');
    assert.ok(g.inspector.left >= g.canvas.right && Math.abs(g.inspector.top - g.column[0].top) < 2, at + 'inspector docked right of the viewer, in the same row');
    assert.ok(g.metrics.top >= Math.max(g.canvas.bottom, g.inspector.bottom), at + 'resource figures start below the viewer row');
    assert.ok(g.scroll <= width, at + 'no sideways scrolling');
    if (width !== 1600) continue;
    assert.deepEqual(g.topWords, ['Assembly layout', 'Labels', 'Floor', 'Target cutaway', 'Fit robot', 'Fit field interaction', 'Expand'], 'top bar: view toggles and view buttons only');
    assert.deepEqual(g.playWords, ['Play'], 'playback row: no visible labels besides Play');
    assert.equal(g.playLabels, 0);
    assert.deepEqual([g.slider, g.sliderLabels], ['Position on path', 0], 'the slider is named only for assistive technology');
    assert.deepEqual(g.speeds, ['1×', '¼×']);
    for (const face of ['Barlow Condensed', 'Source Sans 3']) assert.ok(g.fonts.some(f => f.startsWith(face)), face + ' loaded: ' + g.fonts);
    assert.match(g.h1, /^"?Barlow Condensed/);
    assert.match(g.body, /^"?Source Sans 3/);
    assert.equal(g.state, 'Effective · layout-checked');
    assert.match(g.source, /^\(from the review receipt that pins this scene/);
  }
  for (const width of [960, 800]) {
    const g = await probePage(dir, url, structure, {width, height: 1000});
    assert.ok(g.inspector.top >= g.column.at(-1).bottom - 1, width + ' px: the inspector stacks below the viewer column');
    assert.ok(g.metrics.top >= g.inspector.bottom && g.scroll <= width, width + ' px: figures follow; no sideways scrolling');
  }
  // Headless windows have a minimum width, so phone width is measured inside a 390 px frame.
  writeFileSync(path.join(dir, 'phone.html'), '<!doctype html><body style="margin:0"><iframe src="' + url + '" style="width:390px;height:900px;border:0"></iframe>');
  const phone = await probePage(dir, 'phone.html', `const w=document.querySelector('iframe').contentWindow;
   for(let i=0;i<200&&/Loading|Verifying/.test(w.document.querySelector('#sceneStatus').textContent);i++)await new Promise(r=>setTimeout(r,50));
   const sel=['#motion','#speed','#group','#duty'].map(s=>w.document.querySelector(s).getBoundingClientRect());
   return {width:w.innerWidth,scroll:w.document.documentElement.scrollWidth,selects:sel.map(b=>({right:b.right,width:b.width}))}`);
  assert.equal(phone.width, 390);
  assert.ok(phone.scroll <= 390, '390 px: nothing scrolls sideways (' + JSON.stringify(phone) + ')');
  for (const s of phone.selects) assert.ok(s.right <= 390, '390 px: each selector fits (' + JSON.stringify(s) + ')');
});

test('gaps and failures stay visible: missing roles, overweight, low voltage and unsupplied project fields', {skip}, async t => {
  const scene = reviewScene({architecture: null, focus: null, notes: null, cutaway: null});
  scene.required.push({role: 'Drive wheels', ids: ['wheel-1', 'wheel-2']});
  scene.mass.remainingKg = -1.25;
  scene.mass.inspectionKg = [19.5, 21.25];
  scene.mass.runningAdditions = null;
  Object.assign(scene.power[0], {marginV: -0.4, status: 'fail', loadedBusV: [8.6, 10.2]});
  scene.bodies.frame.purpose = null;
  scene.bodies.frame.missing = ['purpose'];
  const dir = site(t), url = release(dir, 'gaps', scene, {receipt: false});
  const g = await probePage(dir, url, ready + `
   inspect('frame');
   const t=s=>document.querySelector(s).textContent;
   return {architecture:t('#architecture'),notes:t('#notes'),warning:t('#warningText'),roles:[...document.querySelectorAll('.role-row.warn')].map(r=>r.textContent),
    over:[...document.querySelectorAll('.budget-meter.over span')].map(s=>s.textContent),running:t('#weightBody'),
    cutawayHidden:document.querySelector('#cutawayToggle').hidden,purpose:[...document.querySelectorAll('#inspFields dd.missing')].map(d=>d.previousElementSibling.textContent),
    source:t('#decisionSource')}`, {width: 1600, height: 1000});
  assert.ok(!g.probeError, g.probeError);
  const NOT = 'Not supplied in this review';
  assert.ok(g.architecture.startsWith(NOT) && g.notes.startsWith(NOT) && g.running.includes(NOT + ' (presentation.runningAdditions)'), JSON.stringify(g));
  assert.match(g.warning, /2 missing required representations\. High estimate exceeds inspection weight\. Selected duty falls below voltage requirement\. Focus: Not supplied/);
  assert.deepEqual(g.roles, ['MissingDrive wheels　 0/2wheel-1, wheel-2']);
  assert.deepEqual(g.over, ['Inspection weight', 'Battery voltage under load']);
  assert.equal(g.cutawayHidden, true, 'an absent optional cutaway hides its toggle');
  assert.ok(g.purpose.includes('Purpose'), 'a missing purpose is shown as missing');
  assert.match(g.source, /awaiting the review receipt/, 'without a receipt the scene-generation findings are labelled as such');
});

test('the stable index links the season site only when one is published above it', {skip}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-index-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const index = readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8');
  const site = path.join(dir, 'preliminary-design');
  mkdirSync(site);
  for (const folder of [dir, site]) {
    writeFileSync(path.join(folder, 'index.html'), index);
    writeFileSync(path.join(folder, 'releases.json'), JSON.stringify({current: 'missing', releases: ['missing']}));
  }
  const season = `const s=document.querySelector('#season');for(let i=0;i<60&&!s.dataset.probed;i++)await new Promise(r=>setTimeout(r,50));
   return {settled:s.dataset.probed==='true',shown:!s.hidden&&getComputedStyle(s).display!=='none'}`;
  assert.deepEqual(await probePage(dir, 'index.html', season), {settled: true, shown: false, viewportWidth: 1280}, 'served at the root (serve.py): no parent season link');
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Season</title><h1>Season site</h1>');
  assert.deepEqual(await probePage(dir, 'preliminary-design/index.html', season), {settled: true, shown: true, viewportWidth: 1280}, 'under a published season site: linked');
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Directory listing for /</title><ul><li>preliminary-design/</li></ul>');
  assert.deepEqual(await probePage(dir, 'preliminary-design/index.html', season), {settled: true, shown: false, viewportWidth: 1280}, 'a directory listing is not a season site');
  rmSync(path.join(dir, 'index.html'));
  assert.deepEqual(await probePage(dir, 'preliminary-design/index.html', season), {settled: true, shown: false, viewportWidth: 1280}, 'no parent page: no link');
});
