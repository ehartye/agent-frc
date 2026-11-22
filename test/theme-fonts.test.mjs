import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLab } from '../scripts/kickoff.mjs';
import { buildHighlights } from '../scripts/robot-highlights.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fonts = path.join(root, 'templates', 'preliminary-review-fonts');
const woff2 = readdirSync(fonts).filter(n => n.endsWith('.woff2'));
const profile = JSON.parse(readFileSync(path.join(root, 'examples/kickoff/training-field.json'), 'utf8'));

function browser() {
  const candidates = [process.env.CHROME_PATH,
    ...(process.platform === 'win32'
      ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
      : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'])];
  return candidates.find(p => p && existsSync(p));
}

// Serve a folder over HTTP, adding a probe that records computed families and the faces the page actually loaded.
const probe = selectors => `<script>
addEventListener('load',async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));
 const out={loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/"/g,'')+' '+f.weight),families:{}};
 for(const s of ${JSON.stringify(selectors)}){const el=document.querySelector(s);out.families[s]=el?getComputedStyle(el).fontFamily:null}
 const pre=document.createElement('pre');pre.id='font-probe';pre.textContent=JSON.stringify(out);document.body.append(pre);});
</script>`;
async function renderedFonts(folder, page, selectors) {
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const file = path.join(folder, name);
    if (!file.startsWith(folder) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    let body = readFileSync(file);
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    if (name === page) body = Buffer.from(body.toString('utf8').replace(/<\/body>|$/i, m => probe(selectors) + m));
    res.writeHead(200, { 'content-type': type }); res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/' + page;
    const profileDir = mkdtempSync(path.join(tmpdir(), 'font-browser-'));
    const child = spawn(browser(), [...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profileDir, '--virtual-time-budget=15000', '--dump-dom', url]);
    let dom = '';
    child.stdout.on('data', d => { dom += d; });
    await new Promise(r => child.on('close', r));
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
    const match = /<pre id="font-probe">([^<]*)<\/pre>/.exec(dom);
    assert.ok(match, 'the page reported its fonts');
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  } finally { server.close(); }
}

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
function assertEmbedded(html) {
  const faces = [...html.matchAll(/url\("data:font\/woff2;base64,([A-Za-z0-9+/=]+)"\)/g)].map(m => Buffer.from(m[1], 'base64'));
  assert.equal(faces.length, woff2.length, 'each bundled face is embedded once');
  for (const name of woff2) assert.ok(faces.some(f => f.equals(readFileSync(path.join(fonts, name)))), name + ' embedded unmodified');
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
  assertEmbedded(readFileSync(path.join(out, 'robot', 'index.html'), 'utf8'));
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
  for (const name of woff2) assert.ok(readFileSync(path.join(guide, 'fonts', name)).equals(readFileSync(path.join(fonts, name))));
  assert.ok(existsSync(path.join(guide, 'fonts', 'OFL-BarlowCondensed.txt')) && existsSync(path.join(guide, 'fonts', 'OFL-SourceSans3.txt')));
  assertThemed(await renderedFonts(guide, 'index.html', ['h1', 'body']), 'h1', 'body');
});
