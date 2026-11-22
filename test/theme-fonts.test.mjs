import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab } from '../scripts/kickoff.mjs';
import { buildHighlights } from '../scripts/robot-highlights.mjs';
import { browser, probePage } from './headless-browser.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fonts = path.join(root, 'templates', 'preliminary-review-fonts');
const woff2 = readdirSync(fonts).filter(n => n.endsWith('.woff2'));
const profile = JSON.parse(readFileSync(path.join(root, 'examples/kickoff/training-field.json'), 'utf8'));

// Read the computed families and the faces the page actually loaded; document.fonts.check() alone proves nothing.
const fontProbe = selectors => `const out={loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/"/g,'')+' '+f.weight),families:{}};
 for(const s of ${JSON.stringify(selectors)}){const el=document.querySelector(s);out.families[s]=el?getComputedStyle(el).fontFamily:null}
 return out;`;
const renderedFonts = (folder, page, selectors) => probePage(folder, page, fontProbe(selectors));

function assertThemed(result, display, body) {
  const loaded = result.loaded.join(', ');
  if (display) {
    assert.match(result.families[display], /^"?Barlow Condensed/, display + ' uses Barlow Condensed');
    assert.ok(result.loaded.some(f => f.startsWith('Barlow Condensed')), 'a Barlow Condensed face loaded: ' + loaded);
  }
  assert.match(result.families[body], /^"?Source Sans 3/, body + ' uses Source Sans 3');
  assert.ok(result.loaded.some(f => f.startsWith('Source Sans 3')), 'a Source Sans 3 face loaded: ' + loaded);
}

/** Every embedded face decodes to a bundled file, byte for byte, and the OFL notices travel with the page. */
function assertEmbedded(html, families = ['Barlow Condensed', 'Source Sans 3']) {
  const faces = [...html.matchAll(/url\("data:font\/woff2;base64,([A-Za-z0-9+/=]+)"\)/g)].map(m => Buffer.from(m[1], 'base64'));
  const wanted = woff2.filter(n => families.some(f => n.startsWith(f.toLowerCase().replace(/ /g, '-'))));
  assert.equal(faces.length, wanted.length, 'each used bundled face is embedded once');
  for (const name of wanted) assert.ok(faces.some(f => f.equals(readFileSync(path.join(fonts, name)))), name + ' embedded unmodified');
  assert.match(html, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(html, /Copyright 2017 The Barlow Project Authors/);
  assert.match(html, /Copyright 2010-2020 Adobe/);
}

test('kickoff lab and robot highlights embed the bundled OFL theme fonts', async t => {
  const out = mkdtempSync(path.join(tmpdir(), 'theme-fonts-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  await buildLab(profile, path.join(out, 'lab.html'));
  assertEmbedded(readFileSync(path.join(out, 'lab.html'), 'utf8'));
  await buildHighlights(path.join(root, 'examples/highlights/project.json'), path.join(out, 'robot'));
  assertEmbedded(readFileSync(path.join(out, 'robot', 'index.html'), 'utf8'), ['Source Sans 3']);
  const guide = path.join(out, 'guide');
  const built = spawnSync(process.execPath, [path.join(root, '.github/pages/build.mjs'), guide], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  for (const name of woff2) assert.ok(readFileSync(path.join(guide, 'fonts', name)).equals(readFileSync(path.join(fonts, name))));
  for (const name of ['OFL-BarlowCondensed.txt', 'OFL-SourceSans3.txt', 'NOTICE.md', 'fonts.css']) assert.ok(existsSync(path.join(guide, 'fonts', name)), name);
  assert.match(readFileSync(path.join(guide, 'guide.css'), 'utf8'), /^@import url\("fonts\/fonts.css"\);/);
});

test('themed pages render Barlow Condensed and Source Sans 3 from loaded faces', {skip: !browser() && 'No Chrome or Edge found; set CHROME_PATH'}, async t => {
  const out = mkdtempSync(path.join(tmpdir(), 'theme-render-'));
  t.after(() => rmSync(out, { recursive: true, force: true, maxRetries: 3 }));
  await buildLab(profile, path.join(out, 'lab.html'));
  assertThemed(await renderedFonts(out, 'lab.html', ['h1', 'body']), 'h1', 'body');
  await buildHighlights(path.join(root, 'examples/highlights/project.json'), path.join(out, 'robot'));
  assertThemed(await renderedFonts(path.join(out, 'robot'), 'index.html', ['body']), null, 'body');
  const guide = path.join(out, 'guide');
  const built = spawnSync(process.execPath, [path.join(root, '.github/pages/build.mjs'), guide], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  assertThemed(await renderedFonts(guide, 'index.html', ['h1', 'body']), 'h1', 'body');
});
