import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, probePage } from './headless-browser.mjs';
import { reviewScene, replayScene } from './fixtures/review-scene.mjs';

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

test('the stable index shows the release picker and the review with no note between them', {skip}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-index-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  // Synthetic index: one in-progress release whose page is a stub.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({current: 'layout-001', releases: ['layout-001']}));
  mkdirSync(path.join(dir, 'releases', 'layout-001'), {recursive: true});
  writeFileSync(path.join(dir, 'releases', 'layout-001', 'index.html'), '<!doctype html><title>Stub review</title>');
  const shown = `const f=document.querySelector('iframe');for(let i=0;i<60&&f.hidden;i++)await new Promise(r=>setTimeout(r,50));
   const header=document.querySelector('header').getBoundingClientRect(),frame=f.getBoundingClientRect();
   return {body:[...document.body.children].filter(e=>!e.hidden&&e.tagName!=='SCRIPT').map(e=>e.tagName),
     option:document.querySelector('select').selectedOptions[0].textContent,
     gap:Math.round(frame.top-header.bottom),fills:Math.round(innerHeight-frame.bottom)}`;
  assert.deepEqual(await probePage(dir, 'index.html', shown), {body: ['HEADER', 'IFRAME'], option: 'layout-001 · in progress · current',
    gap: 0, fills: 0, viewportWidth: 1280}, 'the picker names the design status; the review fills the rest of the window');
});

test('the stable index explains a withdrawn release instead of loading its removed files', {skip}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-index-withdrawn-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  // Synthetic index: the withdrawn release has no folder on the site.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({current: 'layout-001', releases: ['layout-001'], designStatus: {'layout-001': 'withdrawn'},
    reason: {'layout-001': 'Invented reason: the lane moved.'}, lastCommit: {'layout-001': '0123456789abcdef0123456789abcdef01234567'}}));
  const shown = `const m=document.querySelector('#message');for(let i=0;i<60&&/Loading/.test(m.textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {message:m.textContent,frameHidden:getComputedStyle(document.querySelector('iframe')).display==='none',
     option:document.querySelector('select').selectedOptions[0].textContent}`;
  assert.deepEqual(await probePage(dir, 'index.html', shown), {
    message: 'Release layout-001 was withdrawn: Invented reason: the lane moved. Its files are in the repository history at commit 0123456789ab.',
    frameHidden: true, option: 'layout-001 · withdrawn · current', viewportWidth: 1280});
});

test('an in-progress release shows its draft; the picker lists live designs first and earlier ones after', {skip}, async t => {
  // Synthetic index: `draft` was superseded before it was ever accepted, `first` was effective and then superseded.
  const dir = site(t), url = release(dir, 'second', reviewScene());
  const index = {current: 'second', releases: ['draft', 'first', 'second'],
    designStatus: {draft: 'superseded', first: 'superseded', second: 'in-progress'}, accepted: {first: '2001-02-03'},
    revision: {draft: {number: 3, date: '2001-01-02'}, second: {number: 4, date: '2001-03-04', commit: '0123456789abcdef0123456789abcdef01234567'}}};
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify(index));
  const chip = await probePage(dir, url, ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent}`);
  assert.equal(chip.chip, 'Draft 4 · in progress · layout-checked');
  writeFileSync(path.join(dir, 'index.html'), readFileSync(new URL('../templates/preliminary-review-index.html', import.meta.url), 'utf8'));
  const picker = `const s=document.querySelector('select');for(let i=0;i<60&&s.disabled;i++)await new Promise(r=>setTimeout(r,50));
   return {options:[...s.options].map(o=>o.textContent),selected:s.value,revision:document.querySelector('#revision').textContent,
     groups:[...s.querySelectorAll('optgroup')].map(g=>g.label+': '+[...g.children].map(o=>o.value).join(', ')),title:document.title}`;
  assert.deepEqual(await probePage(dir, 'index.html', picker), {
    options: ['second · draft 4 · in progress · current', 'first · superseded'], selected: 'second', groups: ['Earlier: first'],
    revision: 'Draft 4, 2001-03-04, from commit 0123456', title: 'second · Preliminary design', viewportWidth: 1280});
  // The superseded draft keeps its record and is listed when it is the release being opened, as a link by ID does.
  writeFileSync(path.join(dir, 'releases.json'), JSON.stringify({...index, current: 'draft'}));
  const asked = await probePage(dir, 'index.html', picker);
  assert.deepEqual([asked.options, asked.selected, asked.revision], [['second · draft 4 · in progress', 'draft · superseded · current', 'first · superseded'], 'draft', '']);
});

test('a version reads with its design name: a draft number while in progress, none once effective', {skip}, async t => {
  // Synthetic index: "Tilting carriage" has an earlier baseline 1.0, the effective 1.1 and draft 3 of 1.2; "Swinging arm" is a start-over at draft 1.
  const dir = site(t), url = release(dir, '1.2', reviewScene());
  release(dir, '1.1', reviewScene());
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const index = {current: '1.1', releases: ['layout-004', '1.0', '1.1', '1.2', '2.0'],
    designs: {1: {name: 'Tilting carriage'}, 2: {name: 'Swinging arm'}},
    designStatus: {'layout-004': 'superseded', '1.0': 'superseded', '1.1': 'effective', '1.2': 'in-progress', '2.0': 'in-progress'},
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
  // Synthetic site: detailed "Tilting carriage" 1.0 is effective and 1.1 is at draft 2, built on preliminary 1.3.
  const dir = site(t), tree = path.join(dir, 'detailed-design');
  release(tree, '1.1', reviewScene(), {folder: 'designs'});
  release(tree, '1.0', reviewScene(), {folder: 'designs'});
  release(tree, 'detail-001', reviewScene(), {folder: 'designs'});
  mkdirSync(path.join(dir, 'preliminary-design'), {recursive: true});
  writeFileSync(path.join(dir, 'preliminary-design/releases.json'), JSON.stringify({current: '1.3', releases: ['1.3'], designs: {1: {name: 'Tilting carriage'}}, designStatus: {'1.3': 'effective'}}));
  writeFileSync(path.join(tree, 'designs.json'), JSON.stringify({schema: 'agent-frc/detailed-design-index@1', preliminaryIndex: '../preliminary-design/releases.json',
    current: '1.0', beside: '1.1', designs: ['detail-001', '1.0', '1.1'], designStatus: {'detail-001': 'superseded', '1.0': 'effective', '1.1': 'in-progress'},
    architectures: {1: {name: 'Tilting carriage'}}, preliminary: {'1.0': '1.3', '1.1': '1.3', 'detail-001': 'layout-001'}, revision: {'1.0': {number: 4, date: '2001-01-01'}, '1.1': {number: 2, date: '2001-02-02'}}}));
  const shown = ready + `for(let i=0;i<40&&!/·/.test(document.querySelector('#state').textContent);i++)await new Promise(r=>setTimeout(r,50));
   return {chip:document.querySelector('#state').textContent,context:document.querySelector('#context').textContent,title:document.title}`;
  const draft = await probePage(dir, 'detailed-design/designs/1.1/index.html', shown);
  assert.equal(draft.chip, 'Draft 2 · in progress · layout-checked');
  assert.match(draft.context, /Tilting carriage 1\.1　\/　Detailed design　\/　built on preliminary design Tilting carriage 1\.3$/);
  assert.match(draft.title, /^Tilting carriage 1\.1 · /);
  const effective = await probePage(dir, 'detailed-design/designs/1.0/index.html', shown);
  assert.equal(effective.chip, 'Effective · layout-checked', 'an effective version shows no draft number');
  assert.match(effective.context, /Tilting carriage 1\.0　\/　Detailed design　\/　built on preliminary design Tilting carriage 1\.3$/);
  const earlier = await probePage(dir, 'detailed-design/designs/detail-001/index.html', shown);
  assert.equal(earlier.chip, 'Superseded · layout-checked');
  assert.match(earlier.context, /detail-001　\/　Detailed design　\/　built on preliminary release layout-001$/);
});
