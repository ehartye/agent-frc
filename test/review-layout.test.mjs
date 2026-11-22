import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { browser, probePage } from './headless-browser.mjs';

// A synthetic, season-neutral review: one invented part and no geometry file. Layout depends only on the page.
const data = {issue: 'synthetic-layout', step: {file: 'package.step', sha256: 'a'.repeat(64)}, motion: {file: 'paths.json', sha256: 'b'.repeat(64)},
  groups: {arm: {role: 'mechanism', members: ['arm']}}, palette: {mechanism: '#00897b', reference: '#8a8f94'},
  components: {arm: {purpose: 'Invented arm.', rationale: 'Invented reason.'}}, required: {}, evidence: {}, cases: [],
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
});
