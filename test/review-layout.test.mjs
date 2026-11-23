/**
 * @lane merge
 * @subject templates/preliminary-review-index.html
 * @subject templates/preliminary-review/review.html
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, probePage } from './headless-browser.mjs';
import { reviewScene, replayScene, phasedScene } from './fixtures/review-scene.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const page = readFileSync(path.join(root, 'templates/preliminary-review/review.html'));
const sha = b => createHash('sha256').update(b).digest('hex');
const skip = !browser() && 'No Chrome or Edge found; set CHROME_PATH';

/** A release laid out as the site serves it: site/fonts, site/releases/ID/{index.html, review-scene.json.gz, receipt.json}. */
function release(site, id, scene, {receipt = true, folder = 'releases'} = {}) {
  const dir = path.join(site, folder, id);
  mkdirSync(dir, {recursive: true});
  const content = Buffer.from(JSON.stringify(scene)), served = gzipSync(content);
  writeFileSync(path.join(dir, 'index.html'), page);
  writeFileSync(path.join(dir, 'review-scene.json.gz'), served);
  if (receipt) writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify({issue: scene.issue, planSha256: 'f'.repeat(64), status: 'layout-checked',
    decision: {status: 'layout-checked', firstUnmet: null}, reopen: [],
    view: {file: 'index.html', sha256: sha(page), verified: true, scene: {file: 'review-scene.json.gz', sha256: sha(served), contentSha256: sha(content), bytes: content.length}}}));
  return folder + '/' + id + '/index.html';
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
  const dir = site(t), url = release(dir, '1.0', reviewScene());
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({current: '1.0', releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.0': 'effective'}}));
  const top = await probePage(dir, url, ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent,context:document.querySelector('#context').textContent,heading:document.querySelector('h1').textContent,
    basisOpen:document.querySelector('#review-basis').open,unmetShown:!document.querySelector('#unmetInline').hidden,canvasTop:document.querySelector('#stage').getBoundingClientRect().top,
    idle:{actions:document.querySelector('#inspActions').hidden,hint:document.querySelector('#inspId').textContent,search:!!document.querySelector('#componentSearch')},
    csp:!!document.querySelector('head>meta[http-equiv="Content-Security-Policy"]:first-child')}`, {width: 1680, height: 1000});
  assert.equal(top.chip, 'Effective · layout-checked', 'the chip shows the design status from the index and the receipt decision');
  assert.equal(top.context, 'Synthetic project　/　Tilting carriage 1.0　/　Preliminary design');
  assert.equal(top.heading, 'Invented arm raise and return', 'the heading is the release title');
  assert.equal(top.basisOpen, false, 'the review basis starts collapsed');
  assert.equal(top.unmetShown, false, 'no first unmet requirement, so none is shown in the title row');
  assert.ok(top.canvasTop < 1000, 'the model starts within the first screen at 1680 x 1000 (' + top.canvasTop + ')');
  assert.deepEqual(top.idle, {actions: true, hint: 'Click a solid or choose a part in the inventory.', search: true}, 'the idle inspector shows its hint and search only');
  assert.equal(top.csp, true, 'the stock page ships its policy as the first element in <head>, and still loads its scene and fonts');
  // Inside the stable index's frame, no link may load a page into the frame: the index's picker moves between releases.
  const {links} = await probePage(dir, url, ready + `return {links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),target:a.target}))}`);
  assert.ok(!links.some(l => /^(\.\.\/\.\.\/)(index\.html)?$/.test(l.href) || /releases\.json$/.test(l.href)), 'no link back to the release index: ' + JSON.stringify(links));
  for (const l of links.filter(l => !l.href.startsWith('#')))
    assert.ok(['_top', '_blank'].includes(l.target), 'a link that leaves the review opens at the top or in a new tab: ' + JSON.stringify(l));
  assert.ok(links.some(l => l.href.startsWith('http') && l.target === '_top'), 'season links from data leave the frame');
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
    assert.deepEqual(g.topWords, ['Assembly layout', 'Labels', 'Floor', 'Hide field parts', 'Target cutaway', 'Fit robot', 'Fit field interaction', 'Expand'], 'top bar: view toggles and view buttons only');
    assert.deepEqual(g.playWords, ['Play'], 'playback row: no visible labels besides Play');
    assert.equal(g.playLabels, 0);
    assert.deepEqual([g.slider, g.sliderLabels], ['Position on path', 0], 'the slider is named only for assistive technology');
    assert.deepEqual(g.speeds, ['1×', '¼×', '4×', '10×']);
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
  const dir = site(t), url = release(dir, '1.0', scene, {receipt: false});
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

test('the stable index shows the release picker and the review with no note between them', {skip}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-index-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  // Synthetic index: one in-progress release whose page is a stub.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({current: '1.0', releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}}));
  mkdirSync(path.join(dir, 'releases', '1.0'), {recursive: true});
  writeFileSync(path.join(dir, 'releases', '1.0', 'index.html'), '<!doctype html><title>Stub review</title>');
  const shown = `const f=document.querySelector('iframe');for(let i=0;i<60&&f.hidden;i++)await new Promise(r=>setTimeout(r,50));
   const header=document.querySelector('header').getBoundingClientRect(),frame=f.getBoundingClientRect();
   return {body:[...document.body.children].filter(e=>!e.hidden&&e.tagName!=='SCRIPT').map(e=>e.tagName),
     option:document.querySelector('select').selectedOptions[0].textContent,
     gap:Math.round(frame.top-header.bottom),fills:Math.round(innerHeight-frame.bottom)}`;
  assert.deepEqual(await probePage(dir, 'index.html', shown), {body: ['HEADER', 'IFRAME'], option: 'Tilting carriage 1.0 · in progress · current',
    gap: 0, fills: 0, viewportWidth: 1280}, 'the picker names the design status; the review fills the rest of the window');
});

test('the stable index explains a withdrawn release instead of loading its removed files', {skip}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-index-withdrawn-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  // Synthetic index: the withdrawn release has no folder on the site.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({current: '1.0', releases: ['1.0'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.0': 'withdrawn'},
    reason: {'1.0': 'Invented reason: the lane moved.'}, lastCommit: {'1.0': '0123456789abcdef0123456789abcdef01234567'}}));
  const shown = `const m=document.querySelector('#message');for(let i=0;i<60&&/Loading/.test(m.textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {message:m.textContent,frameHidden:getComputedStyle(document.querySelector('iframe')).display==='none',
     option:document.querySelector('select').selectedOptions[0].textContent}`;
  assert.deepEqual(await probePage(dir, 'index.html', shown), {
    message: 'Tilting carriage 1.0 was withdrawn: Invented reason: the lane moved. Its files are in the repository history at commit 0123456789ab.',
    frameHidden: true, option: 'Tilting carriage 1.0 · withdrawn · current', viewportWidth: 1280});
});

test('an in-progress release shows its draft; the picker lists live designs first and earlier ones after', {skip}, async t => {
  // Synthetic index: 1.0 was superseded before it was ever accepted, 2.0 was effective and then superseded.
  const dir = site(t), url = release(dir, '3.0', reviewScene());
  const index = {current: '3.0', releases: ['1.0', '2.0', '3.0'], designs: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}, 3: {name: 'Sliding gate'}},
    designStatus: {'1.0': 'superseded', '2.0': 'superseded', '3.0': 'in-progress'}, accepted: {'2.0': '2001-02-03'},
    revision: {'1.0': {number: 3, date: '2001-01-02'}, '3.0': {number: 4, date: '2001-03-04', commit: '0123456789abcdef0123456789abcdef01234567'}}};
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify(index));
  const chip = await probePage(dir, url, ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent}`);
  assert.equal(chip.chip, 'Draft 4 · in progress · layout-checked');
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  const picker = `const s=document.querySelector('select');for(let i=0;i<60&&s.disabled;i++)await new Promise(r=>setTimeout(r,50));
   return {options:[...s.options].map(o=>o.textContent),selected:s.value,revision:document.querySelector('#revision').textContent,
     groups:[...s.querySelectorAll('optgroup')].map(g=>g.label+': '+[...g.children].map(o=>o.value).join(', ')),title:document.title}`;
  assert.deepEqual(await probePage(dir, 'index.html', picker), {
    options: ['Sliding gate 3.0 · draft 4 · in progress · current', 'Swinging arm 2.0 · superseded'], selected: '3.0', groups: ['Earlier: 2.0'],
    revision: 'Draft 4, 2001-03-04, from commit 0123456', title: 'Sliding gate 3.0 · Preliminary design', viewportWidth: 1280});
  // The superseded draft keeps its record and is listed when it is the release being opened, as a link by ID does.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({...index, current: '1.0'}));
  const asked = await probePage(dir, 'index.html', picker);
  assert.deepEqual([asked.options, asked.selected, asked.revision], [['Sliding gate 3.0 · draft 4 · in progress', 'Tilting carriage 1.0 · superseded · current', 'Swinging arm 2.0 · superseded'], '1.0', '']);
});

test('a version reads with its design name: a draft number while in progress, none once effective', {skip}, async t => {
  // Synthetic index: "Tilting carriage" has an earlier baseline 1.0, the effective 1.1 and draft 3 of 1.2; "Swinging arm" is a start-over at draft 1.
  const dir = site(t), url = release(dir, '1.2', reviewScene());
  release(dir, '1.1', reviewScene());
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const index = {current: '1.1', releases: ['1.0', '1.1', '1.2', '2.0'],
    designs: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}},
    designStatus: {'1.0': 'superseded', '1.1': 'effective', '1.2': 'in-progress', '2.0': 'in-progress'},
    accepted: {'1.0': '2001-01-02', '1.1': '2001-02-03'},
    revision: {'1.0': {number: 5, date: '2001-01-01'}, '1.1': {number: 2, date: '2001-02-02', commit}, '1.2': {number: 3, date: '2001-03-04', commit}, '2.0': {number: 1, date: '2001-03-05'}}};
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify(index));
  const shown = ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent,context:document.querySelector('#context').textContent,title:document.title}`;
  const draft = await probePage(dir, url, shown);
  assert.equal(draft.chip, 'Draft 3 · in progress · layout-checked');
  assert.match(draft.context, /Tilting carriage 1\.2　\/　Preliminary design$/);
  assert.match(draft.title, /^Tilting carriage 1\.2 · /);
  const effective = await probePage(dir, 'releases/1.1/index.html', shown);
  assert.equal(effective.chip, 'Effective · layout-checked', 'an effective version shows no draft number');
  assert.match(effective.context, /Tilting carriage 1\.1　\/　Preliminary design$/);
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  const picker = `const s=document.querySelector('select');for(let i=0;i<60&&s.disabled;i++)await new Promise(r=>setTimeout(r,50));
   return {options:[...s.options].map(o=>o.textContent),selected:s.value,revision:document.querySelector('#revision').textContent,
     groups:[...s.querySelectorAll('optgroup')].map(g=>g.label+': '+[...g.children].map(o=>o.value).join(', ')),title:document.title}`;
  assert.deepEqual(await probePage(dir, 'index.html', picker), {
    options: ['Tilting carriage 1.1 · effective · current', 'Tilting carriage 1.2 · draft 3 · in progress', 'Swinging arm 2.0 · draft 1 · in progress', 'Tilting carriage 1.0 · superseded'],
    selected: '1.1', groups: ['Earlier: 1.0'], revision: 'Accepted 2001-02-03, from commit 0123456', title: 'Tilting carriage 1.1 · Preliminary design', viewportWidth: 1280});
  // The draft, opened as a link by ID does.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({...index, current: '1.2'}));
  const asked = await probePage(dir, 'index.html', picker);
  assert.deepEqual([asked.selected, asked.revision, asked.title], ['1.2', 'Draft 3, 2001-03-04, from commit 0123456', 'Tilting carriage 1.2 · Preliminary design']);
});

test('the same page staged for a detailed design reads its name, draft and status from designs.json and names its preliminary design', {skip}, async t => {
  // Synthetic site: detailed "Tilting carriage" 1.0 is effective and 1.1 is at draft 2, built on preliminary 1.3; "Swinging arm" 2.0 was superseded.
  const dir = site(t), tree = path.join(dir, 'detailed-design');
  release(tree, '2.0', reviewScene(), {folder: 'designs'});
  release(tree, '1.1', reviewScene(), {folder: 'designs'});
  release(tree, '1.0', reviewScene(), {folder: 'designs'});
  mkdirSync(path.join(dir, 'preliminary-design'), {recursive: true});
  writeFileSync(path.join(dir, 'preliminary-design/releases.json'), JSON.stringify({current: '1.3', releases: ['1.3'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.3': 'effective'}}));
  writeFileSync(path.join(tree, 'designs.json'), JSON.stringify({schema: 'agent-frc/detailed-design-index@1', preliminaryIndex: '../preliminary-design/releases.json',
    current: '1.0', beside: '1.1', designs: ['1.0', '1.1', '2.0'], designStatus: {'1.0': 'effective', '1.1': 'in-progress', '2.0': 'superseded'},
    architectures: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}}, preliminary: {'1.0': '1.3', '1.1': '1.3', '2.0': '1.3'}, revision: {'1.0': {number: 4, date: '2001-01-01'}, '1.1': {number: 2, date: '2001-02-02'}}}));
  const shown = ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent,context:document.querySelector('#context').textContent,title:document.title,
    heading:document.querySelector('h1').textContent,basis:document.querySelector('#basisNote').textContent}`;
  const draft = await probePage(dir, 'detailed-design/designs/1.1/index.html', shown);
  // The page is the one viewer of the detailed design and says which phase it shows.
  assert.doesNotMatch(draft.heading + draft.title, /Preliminary design review/);
  assert.match(draft.title, /Detailed design review$/);
  assert.match(draft.basis, /^Detailed design: the model exported from the registered Fusion design/);
  assert.equal(draft.chip, 'Draft 2 · in progress · layout-checked');
  assert.match(draft.context, /Tilting carriage 1\.1　\/　Detailed design　\/　built on preliminary design Tilting carriage 1\.3$/);
  assert.match(draft.title, /^Tilting carriage 1\.1 · /);
  const effective = await probePage(dir, 'detailed-design/designs/1.0/index.html', shown);
  assert.equal(effective.chip, 'Effective · layout-checked', 'an effective version shows no draft number');
  assert.match(effective.context, /Tilting carriage 1\.0　\/　Detailed design　\/　built on preliminary design Tilting carriage 1\.3$/);
  const earlier = await probePage(dir, 'detailed-design/designs/2.0/index.html', shown);
  assert.equal(earlier.chip, 'Superseded · layout-checked', 'a superseded design says so');
});

test('the animation list holds one entry per mission phase; the checked cases sit in the check results and jump the viewer to their pose', {skip}, async t => {
  const dir = site(t), url = release(dir, '1.0', phasedScene());
  const probe = w => `const d=${w}.document,q=s=>d.querySelector(s),all=s=>[...d.querySelectorAll(s)],wait=ms=>new Promise(r=>setTimeout(r,ms)),motion=q('#motion'),time=q('#time');
   for(let i=0;i<200&&/Loading|Verifying/.test(q('#sceneStatus').textContent);i++)await wait(50);await wait(100);
   const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);`;
  const seen = await probePage(dir, url, probe('window') + `
   const out={groups:all('#motion optgroup').map(g=>g.label+': '+[...g.children].map(o=>o.textContent).join(', ')),label:motion.getAttribute('aria-label'),
    opening:[motion.value,time.value,time.max,q('#basis').textContent]};
   q('#speed').value='10';q('#play').click();const segments=new Set();
   for(let i=0;i<150&&q('#play').textContent==='Pause';i++){segments.add(String(1+Math.min(2,Math.floor(time.value/24))));await wait(16)}await wait(100);
   out.played=[[...segments].sort(),time.value,q('#play').textContent,q('#fraction').textContent];
   const rows=all('#evidenceTable>tbody>tr.phase');
   out.phases=rows.map(r=>[...r.cells].slice(0,6).map(c=>c.textContent));out.hidden=all('tr.phase-cases').map(r=>r.hidden);
   out.buttons=rows.map(r=>[...r.querySelectorAll('button')].map(b=>b.textContent));
   button(rows[0],'Jump to tightest pose').click();await wait(100);
   out.jump=[motion.value,time.value,q('#basis').textContent,q('#inspName').textContent];
   const toggle=button(rows[0],'Show cases');toggle.click();
   out.open=[toggle.getAttribute('aria-expanded'),toggle.getAttribute('aria-controls'),toggle.textContent,q('#checkCases0').hidden,all('#checkCases0 .case-table tbody tr').map(r=>r.cells[0].textContent.split(' — ')[0])];
   all('#checkCases0 button').filter(b=>b.textContent==='Jump to limiting pose')[1].click();await wait(100);out.caseJump=[motion.value,time.value];
   button(rows[2],'Jump to tightest pose').click();await wait(100);out.control=[motion.value,time.value,time.max];
   button(rows[1],'Play').click();await wait(50);out.other=[motion.value,q('#play').textContent,new URLSearchParams(location.search).get('case')];
   q('#set').selectedIndex=0;motion.value='raise';motion.dispatchEvent(new Event('change'));q('#filter').value='all';q('#filter').dispatchEvent(new Event('change'));
   out.pairs=[q('#count').textContent,all('#findings thead th').map(c=>c.textContent),all('#findings tbody tr').map(r=>r.cells[1].textContent)];
   all('#findings tbody tr')[1].click();await wait(100);out.pairJump=[motion.value,time.value];
   return out`);
  assert.deepEqual(seen.groups, ['Mission animations: Raise the arm', 'Other checked motions: Lower', 'Check control: Displaced control'],
    'four checked cases and a control give three list entries, not five');
  assert.equal(seen.label, 'Mission animation');
  assert.deepEqual(seen.opening, ['raise', '0', '72', 'Checked segment 1 of 3 (raise-01). Invented: third 1 of the raise.']);
  assert.deepEqual(seen.played, [['1', '2', '3'], '72', 'Play', '100%'], 'one press of Play runs the whole phase through every segment');
  assert.deepEqual(seen.phases, [['Raise the arm', '3', '3 pass', 'arm / battery · gap 6.500 mm · t = 0.500 · in raise-03', '5.00 mm', '2.00 mm'],
    ['Lower', '1', '1 pass', '—', '5.00 mm', 'Not declared'],
    ['Displaced control and uncovered conditions', '2', '1 rejected as expected · 1 not evaluated', 'arm / battery · gap 0.000 mm, overlap 4100.0 mm³ · t = 0.500 · in package-displacement-control', '5.00 mm', '—']]);
  assert.deepEqual(seen.hidden, [true, true, true], 'a passing check list stays compact');
  assert.deepEqual(seen.buttons, [['Play', 'Jump to tightest pose', 'Show cases'], ['Play', 'Show cases'], ['Jump to tightest pose', 'Show cases']]);
  assert.deepEqual(seen.jump, ['raise', '60', 'Checked segment 3 of 3 (raise-03). Invented: third 3 of the raise.', 'arm'], 'the tightest case opens at its limiting pose inside the phase animation');
  assert.deepEqual(seen.open, ['true', 'checkCases0', 'Hide cases', false, ['raise-01', 'raise-02', 'raise-03']]);
  assert.deepEqual(seen.caseJump, ['raise', '36']);
  assert.deepEqual(seen.control, ['package-displacement-control', '12', '24']);
  assert.deepEqual(seen.other, ['lower', 'Pause', 'lower'], 'the address names the animation');
  assert.deepEqual(seen.pairs, ['Raise the arm · 3 checked cases · 3 pass', ['Pair', 'Case', 'Result', 'Witness'], ['raise-01', 'raise-02', 'raise-03']]);
  assert.deepEqual(seen.pairJump, ['raise', '36'], 'a recorded pair opens its own segment at the witness pose');
  // A failing case opens its phase at once.
  const failing = phasedScene();
  Object.assign(failing.motionEvidence[1], {result: 'fail', limitingValue: {gapMm: 0, volumeMm3: 30}});
  const failed = await probePage(dir, release(dir, '1.1', failing, {receipt: false}), probe('window') + `
   const rows=all('#evidenceTable>tbody>tr.phase');
   return {groups:all('#motion optgroup').map(g=>g.label+': '+[...g.children].map(o=>o.textContent).join(', ')),hidden:all('tr.phase-cases').map(r=>r.hidden),
    attention:rows.map(r=>r.classList.contains('attention')),result:rows[0].cells[2].textContent,jump:[...rows[0].querySelectorAll('button')].map(b=>b.textContent)}`);
  assert.deepEqual(failed.groups, ['Mission animations: Raise the arm', 'Other checked motions: Lower', 'Check control: Displaced control']);
  assert.deepEqual([failed.hidden, failed.attention, failed.result, failed.jump], [[false, true, true], [true, false, false], '2 pass · 1 fail', ['Play', 'Jump to failing case', 'Hide cases']]);
  // Headless windows have a minimum width, so phone width is measured inside a 390 px frame. The frame also carries a link to one case.
  writeFileSync(path.join(dir, 'phone.html'), '<!doctype html><body style="margin:0"><iframe src="' + url + '?case=raise-02" style="width:390px;height:900px;border:0"></iframe>');
  const phone = await probePage(dir, 'phone.html', probe(`document.querySelector('iframe').contentWindow`) + `
   const deep=[motion.value,time.value,q('#basis').textContent];button(q('tr.phase'),'Show cases').click();const w=d.defaultView;
   return {deep,width:w.innerWidth,scroll:d.documentElement.scrollWidth,motion:motion.getBoundingClientRect().right,table:q('#motion-evidence .scroll').getBoundingClientRect().right}`);
  assert.deepEqual(phone.deep, ['raise', '24', 'Checked segment 2 of 3 (raise-02). Invented: third 2 of the raise.'], 'a link to a case opens its animation at that case');
  assert.ok(phone.width === 390 && phone.scroll <= 390 && phone.motion <= 390 && phone.table <= 390, '390 px: the list and the check results fit without sideways scrolling (' + JSON.stringify(phone) + ')');
});
