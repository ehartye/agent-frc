import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { browser, probePage } from './headless-browser.mjs';

// A synthetic, season-neutral review: one invented part and no geometry file. Layout depends only on the page.
const data = {issue: 'synthetic-layout', step: {file: 'package.step', sha256: 'a'.repeat(64)}, motion: {file: 'paths.json', sha256: 'b'.repeat(64)},
  groups: {'an-invented-very-long-subsystem-group-name-for-layout': {role: 'mechanism', members: ['arm']}},
  power: [{case: 'an-invented-very-long-concurrent-duty-and-pack-name', duty: 'Invented duty', batteryCondition: 'weak', batterySideA: [1, 2],
    loadedBusV: [11, 12], requiredMinV: 9, marginV: 2, status: 'pass', loads: {}, resistance: [0.02, 0.03], openCircuit: [12, 12.5]}], palette: {mechanism: '#00897b', reference: '#8a8f94'},
  components: {arm: {purpose: 'Invented arm.', rationale: 'Invented reason.'}}, required: {}, evidence: {},
  cases: [{id: 'package-displacement-control-with-an-invented-long-name', stage: 'operating'}],
  inspector: {arm: {id: 'arm', name: 'arm', category: 'mechanism', role: 'mechanism', motionGroup: 'arm', mass: [], loads: [], movesIn: [], missing: []}},
  geometry: {file: 'missing.geometry.json.gz', contentSha256: 'c'.repeat(64), bytes: 0}, fit: {robot: null, field: null}, fixtures: [],
  narrativeReview: {}, header: {}, motionEvidence: [], returnCriteria: {preliminary: [], conceptual: []}, fieldInteractions: []};
const template = readFileSync(new URL('../scripts/package-view.html', import.meta.url), 'utf8');
const measure = `const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width}};
 return {canvas:r('#stage'),inspector:r('#inspector'),metrics:r('#metrics'),rem:parseFloat(getComputedStyle(document.documentElement).fontSize),
  scroll:document.documentElement.scrollWidth};`;

function sideBySide(g, width, desktop) {
  const at = width + ' px: ';
  assert.equal(g.viewportWidth, width, at + 'page width');
  assert.ok(g.inspector.left >= g.canvas.right, at + 'the inspector is right of the canvas');
  assert.ok(Math.abs(g.inspector.top - g.canvas.top) < 1, at + 'canvas and inspector share one row');
  assert.ok(g.inspector.right <= width && g.scroll <= width, at + 'the inspector is visible without horizontal scrolling');
  assert.ok(Math.abs(g.inspector.width - 22 * g.rem) < 1, at + 'the inspector column is a fixed 22rem');
  assert.ok(g.canvas.width > (desktop ? 2 : 1) * g.inspector.width, at + 'the canvas is the largest pane');
  assert.ok(g.metrics.top >= Math.max(g.canvas.bottom, g.inspector.bottom), at + 'resource figures start below the row');
}
function stacked(g, width) {
  const at = width + ' px: ';
  assert.equal(g.viewportWidth, width, at + 'page width');
  assert.ok(Math.abs(g.inspector.top - g.canvas.bottom - g.rem) < 1, at + 'the inspector sits directly below the canvas');
  assert.ok(Math.abs(g.inspector.left - g.canvas.left) < 1 && Math.abs(g.inspector.width - g.canvas.width) < 1, at + 'full width under the canvas');
  assert.ok(g.metrics.top >= g.inspector.bottom, at + 'resource figures follow the inspector');
  assert.ok(g.scroll <= width, at + 'no horizontal scrolling');
}

test('the inspector sits beside the model above 60rem and directly below it at 60rem and narrower', {skip: !browser() && 'No Chrome or Edge found; set CHROME_PATH'}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-layout-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(path.join(dir, 'index.html'), template.replace('PACKAGE_DATA', JSON.stringify(data).replace(/</g, '\\u003c')));
  const at = width => probePage(dir, 'index.html', measure, {width, height: 1000});
  for (const width of [1280, 1600, 1920]) sideBySide(await at(width), width, true);
  const breakpoint = (await at(960)).rem * 60;
  assert.equal(breakpoint, 960, 'the default 16 px text size puts the breakpoint at 960 px');
  sideBySide(await at(961), 961, false);
  stacked(await at(960), 960);
  stacked(await at(800), 800);
  // Headless windows have a minimum width, so a phone-width page is measured inside a 390 px frame.
  writeFileSync(path.join(dir, 'phone.html'), '<!doctype html><body style="margin:0"><iframe src="index.html" style="width:390px;height:900px;border:0"></iframe>');
  const phone = await probePage(dir, 'phone.html', `const w=document.querySelector('iframe').contentWindow;await new Promise(r=>setTimeout(r,300));
   const box=s=>w.document.querySelector(s).getBoundingClientRect();
   return {width:w.innerWidth,scroll:w.document.documentElement.scrollWidth,selects:['#cases','#scope','#duty'].map(s=>({right:box(s).right,width:box(s).width}))}`);
  assert.equal(phone.width, 390);
  assert.ok(phone.scroll <= 390, '390 px: nothing scrolls sideways (' + JSON.stringify(phone) + ')');
  for (const s of phone.selects) assert.ok(s.right <= 390 && s.width >= 120, '390 px: each selector fits and stays usable (' + JSON.stringify(s) + ')');
  const label = await probePage(dir, 'index.html', `const i=document.querySelector('#frame');return {text:i.closest('label').textContent.trim(),name:i.labels[0].textContent.trim()}`);
  assert.deepEqual(label, {text: 'Position on path', name: 'Position on path', viewportWidth: 1280}, 'the scrubber names what it moves');
});

test('the stable index links the season site only when one is published above it', {skip: !browser() && 'No Chrome or Edge found; set CHROME_PATH'}, async t => {
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
