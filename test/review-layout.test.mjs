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
const geometry = `const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};
 return {canvas:r('#stage'),inspector:r('#inspector'),metrics:r('#metrics'),width:innerWidth,scroll:document.documentElement.scrollWidth};`;

test('the inspector sits beside the model on desktop widths and below it when narrow', {skip: !browser() && 'No Chrome or Edge found; set CHROME_PATH'}, async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-layout-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(path.join(dir, 'index.html'), template.replace('PACKAGE_DATA', JSON.stringify(data).replace(/</g, '\\u003c')));
  for (const width of [1280, 1600, 1920]) {
    const g = await probePage(dir, 'index.html', geometry, {width, height: 1000});
    assert.ok(!g.probeError, g.probeError);
    assert.ok(g.inspector.left >= g.canvas.right, width + ' px: the inspector is right of the canvas');
    assert.ok(Math.abs(g.inspector.top - g.canvas.top) < 2, width + ' px: canvas and inspector share one row');
    assert.ok(g.inspector.right <= g.width, width + ' px: the inspector is fully visible without horizontal scrolling');
    assert.ok(g.canvas.right - g.canvas.left > 2 * (g.inspector.right - g.inspector.left), width + ' px: the canvas is the largest pane');
    assert.ok(Math.abs(g.inspector.right - g.inspector.left - 352) < 2, width + ' px: the inspector column is a fixed 22rem');
    assert.ok(g.metrics.top >= Math.max(g.canvas.bottom, g.inspector.bottom), width + ' px: resource figures start below the row');
  }
  const narrow = await probePage(dir, 'index.html', geometry, {width: 800, height: 1000});
  assert.ok(narrow.inspector.top >= narrow.canvas.bottom, 'narrow: the inspector stacks directly below the canvas');
  assert.ok(narrow.scroll <= narrow.width, 'narrow: no horizontal scrolling');
});
