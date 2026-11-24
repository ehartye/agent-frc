/**
 * @lane merge
 * @subject scripts/cad-readmes.py
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

// Synthetic teaching fixture: an invented project with a README and a placeholder image.
const script = fileURLToPath(new URL('../scripts/cad-readmes.py', import.meta.url));
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

function project(t, config = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'readme-still-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const put = (name, data) => { mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); writeFileSync(path.join(root, name), data); };
  put('cad-showcase.json', JSON.stringify({title: 'Invented carrier robot', design: 'layout-002', status: 'in-progress',
    scope: 'Synthetic blockout in its parked pose.', still: 'docs/stills/layout-002.png', viewerUrl: 'https://example.invalid/review/', ...config}));
  put('docs/stills/layout-002.png', 'first render');
  put('README.md', '# Invented project\n\nAn invented teaching project.\n');
  const run = (...args) => spawnSync(python, ['-B', script, root, ...args], {encoding: 'utf8'});
  return {root, put, run, read: name => readFileSync(path.join(root, name), 'utf8')};
}

test('writes the still below the title, again in place of the last one, and keeps line endings', t => {
  const p = project(t);
  const first = p.run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Wrote the still in README\.md\. It links to the design review\./);
  assert.match(p.read('README.md'), /^# Invented project\n\n<!-- cad-still -->\n\[!\[Invented carrier robot\]\(docs\/stills\/layout-002\.png\)\]\(https:\/\/example\.invalid\/review\/\)\n\n\*\*Project CAD · Invented carrier robot · layout-002 · in-progress\.\*\* Synthetic blockout in its parked pose\. \[Open the design review\]\(https:\/\/example\.invalid\/review\/\)\n<!-- \/cad-still -->\n\nAn invented teaching project\.\n/);
  p.put('cad-showcase.json', p.read('cad-showcase.json').replace('in-progress', 'effective'));
  p.put('README.md', p.read('README.md').replaceAll('\n', '\r\n'));
  assert.equal(p.run().status, 0);
  assert.match(p.read('README.md'), /layout-002 · effective\.\*\*/);
  assert.equal(p.read('README.md').match(/<!-- cad-still -->/g).length, 1);
  assert.doesNotMatch(p.read('README.md'), /[^\r]\n/);
  p.put('cad-showcase.json', p.read('cad-showcase.json').replace('effective', 'approved'));
  assert.match(p.run().stderr, /Set status in cad-showcase\.json to the shown design's status/);
});

test('needs the image it will show', t => {
  const p = project(t, {still: 'docs/stills/absent.png'});
  const result = p.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No CAD still image at docs\/stills\/absent\.png/);
  assert.doesNotMatch(p.read('README.md'), /cad-still/);
});

test('the still links to the one viewer: the named review, else the current detailed design, else the current preliminary design', t => {
  // Synthetic site: an invented preliminary design 1.1 is current, then detailed design 1.0 is staged.
  const p = project(t, {viewerUrl: undefined, design: 'Tilting carriage 1.0'});
  const link = () => /\[!\[Invented carrier robot\]\(docs\/stills\/layout-002\.png\)\]\(([^)]+)\)/.exec(p.read('README.md'))?.[1];
  // No review is published: the still stands alone.
  const alone = p.run();
  assert.equal(alone.status, 0, alone.stderr);
  assert.match(alone.stdout, /No design review is published yet, so it links nowhere/);
  assert.match(p.read('README.md'), /<!-- cad-still -->\n!\[Invented carrier robot\]\(docs\/stills\/layout-002\.png\)\n\n\*\*Project CAD · Invented carrier robot · Tilting carriage 1\.0 · in-progress\.\*\* Synthetic blockout in its parked pose\.\n<!-- \/cad-still -->/);
  p.put('docs/preliminary-design/releases.json', JSON.stringify({current: '1.1', releases: ['1.0', '1.1']}));
  p.put('docs/preliminary-design/releases/1.1/index.html', '<html>Preliminary review</html>');
  assert.equal(p.run().status, 0);
  assert.equal(link(), 'docs/preliminary-design/releases/1.1/index.html');
  p.put('docs/detailed-design/designs.json', JSON.stringify({current: '1.0', designs: ['1.0']}));
  p.put('docs/detailed-design/designs/1.0/index.html', '<html>Detailed review</html>');
  assert.equal(p.run().status, 0);
  assert.equal(link(), 'docs/detailed-design/designs/1.0/index.html');
  assert.match(p.read('README.md'), /\[Open the design review\]\(docs\/detailed-design\/designs\/1\.0\/index\.html\)/);
  // A named review wins, as a folder or a page.
  p.put('cad-showcase.json', JSON.stringify({...JSON.parse(p.read('cad-showcase.json')), review: 'docs/preliminary-design/releases/1.1'}));
  assert.equal(p.run().status, 0);
  assert.equal(link(), 'docs/preliminary-design/releases/1.1/index.html');
  p.put('cad-showcase.json', JSON.stringify({...JSON.parse(p.read('cad-showcase.json')), review: '../outside'}));
  assert.match(p.run().stderr, /Name the design review in cad-showcase\.json as a project-relative folder or page/);
});

test('a project that already published the retired orbit view keeps its link', t => {
  const p = project(t, {viewerUrl: undefined});
  p.put('docs/robot/cad/index.html', '<html>Earlier orbit view</html>');
  assert.equal(p.run().status, 0);
  assert.match(p.read('README.md'), /\[Rotate the model\]\(docs\/robot\/cad\/index\.html\)/);
  assert.equal(p.read('docs/robot/cad/index.html'), '<html>Earlier orbit view</html>', 'the published page is left as it is');
});
