import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

// Synthetic teaching fixture: an invented project with two README files and a placeholder image.
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
  put('tools/README.md', '# Invented tools\r\n\r\nHelpers.\r\n');
  spawnSync('git', ['init', '-q', root]);
  const run = (...args) => spawnSync(python, ['-B', script, root, ...args], {encoding: 'utf8'});
  return {root, put, run, read: name => readFileSync(path.join(root, name), 'utf8')};
}

test('the README check asks for the still block, an image that exists and a caption naming the design and its status', t => {
  const p = project(t);
  const missing = p.run();
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /No CAD still block directly below the title of README\.md\. Run cad-readmes\.py --update/);
  const update = p.run('--update');
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /Rewrote the still of 2 README files\. The still links to the design review\./);
  const readme = p.read('README.md');
  assert.match(readme, /^# Invented project\n\n<!-- cad-still -->\n\[!\[Invented carrier robot\]\(docs\/stills\/layout-002\.png\)\]\(https:\/\/example\.invalid\/review\/\)\n\n\*\*Project CAD · Invented carrier robot · layout-002 · in-progress\.\*\* Synthetic blockout in its parked pose\. \[Open the design review\]\(https:\/\/example\.invalid\/review\/\)\n<!-- \/cad-still -->/);
  assert.doesNotMatch(readme, /[0-9a-f]{10}/, 'the caption carries no digest');
  assert.match(p.read('tools/README.md'), /^# Invented tools\r\n\r\n<!-- cad-still -->\r\n\[!\[Invented carrier robot\]\(\.\.\/docs\/stills\/layout-002\.png\)\]/);
  const checked = p.run();
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /Checked the still of 2 README files.*No bytes compared/);
});

test('a re-rendered image, a changed source or a changed palette does not fail the README check', t => {
  const p = project(t, {source: 'robot.step'});
  p.put('robot.step', 'first export');
  assert.equal(p.run('--update').status, 0);
  assert.match(p.read('README.md'), /\[Source STEP\]\(robot\.step\) · \[Open the design review\]/);
  p.put('docs/stills/layout-002.png', 'second render, other bytes');
  p.put('robot.step', 'second export');
  p.put('cad/component-palette.json', JSON.stringify({schema: 'agent-frc/component-palette@1', colors: {structure: '#112233'}}));
  // An export record from an earlier render stays in the project; the check never reads it.
  p.put('docs/robot/cad/receipt.json', JSON.stringify({source: 'earlier.step', sourceSha256: '0'.repeat(64), imageSha256: '0'.repeat(64)}));
  const checked = p.run();
  assert.equal(checked.status, 0, checked.stderr);
});

test('the README check fails on a missing image, a moved block and a caption for another design or status', t => {
  const cases = [
    [p => rmSync(path.join(p.root, 'docs/stills/layout-002.png')), /The CAD still of README\.md shows no image file that exists: docs\/stills\/layout-002\.png/],
    [p => p.put('README.md', p.read('README.md').replace('# Invented project\n\n', '# Invented project\n\nA line above the still.\n\n')), /No CAD still block directly below the title of README\.md/],
    [p => p.put('tools/README.md', '# Invented tools\n\nHelpers.\n'), /No CAD still block directly below the title of tools\/README\.md/],
    [p => p.put('cad-showcase.json', p.read('cad-showcase.json').replace('layout-002"', 'layout-003"')), /does not name the current design \(layout-003\) and its status \(in-progress\)/],
    [p => p.put('cad-showcase.json', p.read('cad-showcase.json').replace('in-progress', 'effective')), /does not name the current design \(layout-002\) and its status \(effective\)/],
    [p => p.put('cad-showcase.json', p.read('cad-showcase.json').replace('in-progress', 'approved')), /Set status in cad-showcase\.json to the shown design's status: in-progress, effective, superseded, withdrawn/],
    [p => p.put('README.md', 'No title here.\n'), /README needs a title: README\.md/],
  ];
  for (const [change, reason] of cases) {
    const p = project(t);
    assert.equal(p.run('--update').status, 0);
    change(p);
    const result = p.run();
    assert.notEqual(result.status, 0, String(reason));
    assert.match(result.stderr, reason);
    // --update rewrites the block for the selected design, where one can be written.
    if (/caption|below the title of tools/.test(reason.source)) {
      assert.equal(p.run('--update').status, 0);
      assert.equal(p.run().status, 0);
    }
  }
});

test('--update needs the image it will show', t => {
  const p = project(t, {still: 'docs/stills/absent.png'});
  const result = p.run('--update');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No CAD still image at docs\/stills\/absent\.png/);
  assert.doesNotMatch(p.read('README.md'), /cad-still/);
});

test('the still links to the one viewer: the named review, else the current detailed design, else the current preliminary design', t => {
  // Synthetic site: an invented preliminary design 1.1 is current, then detailed design 1.0 is staged.
  const p = project(t, {viewerUrl: undefined, design: 'Tilting carriage 1.0'});
  const link = () => /\[!\[Invented carrier robot\]\(docs\/stills\/layout-002\.png\)\]\(([^)]+)\)/.exec(p.read('README.md'))?.[1];
  // No review is published: the still stands alone, and the check still passes.
  const alone = p.run('--update');
  assert.equal(alone.status, 0, alone.stderr);
  assert.match(alone.stdout, /No design review is published yet, so the still links nowhere/);
  assert.match(p.read('README.md'), /<!-- cad-still -->\n!\[Invented carrier robot\]\(docs\/stills\/layout-002\.png\)\n\n\*\*Project CAD · Invented carrier robot · Tilting carriage 1\.0 · in-progress\.\*\* Synthetic blockout in its parked pose\.\n<!-- \/cad-still -->/);
  assert.equal(p.run().status, 0);
  p.put('docs/preliminary-design/releases.json', JSON.stringify({current: '1.1', releases: ['1.0', '1.1']}));
  p.put('docs/preliminary-design/releases/1.1/index.html', '<html>Preliminary review</html>');
  assert.equal(p.run('--update').status, 0);
  assert.equal(link(), 'docs/preliminary-design/releases/1.1/index.html');
  p.put('docs/detailed-design/designs.json', JSON.stringify({current: '1.0', designs: ['1.0']}));
  p.put('docs/detailed-design/designs/1.0/index.html', '<html>Detailed review</html>');
  assert.equal(p.run('--update').status, 0);
  assert.equal(link(), 'docs/detailed-design/designs/1.0/index.html');
  assert.match(p.read('tools/README.md'), /\]\(\.\.\/docs\/detailed-design\/designs\/1\.0\/index\.html\)/);
  assert.match(p.read('README.md'), /\[Open the design review\]\(docs\/detailed-design\/designs\/1\.0\/index\.html\)/);
  // A named review wins, as a folder or a page.
  p.put('cad-showcase.json', JSON.stringify({...JSON.parse(p.read('cad-showcase.json')), review: 'docs/preliminary-design/releases/1.1'}));
  assert.equal(p.run('--update').status, 0);
  assert.equal(link(), 'docs/preliminary-design/releases/1.1/index.html');
  p.put('cad-showcase.json', JSON.stringify({...JSON.parse(p.read('cad-showcase.json')), review: '../outside'}));
  assert.match(p.run('--update').stderr, /Name the design review in cad-showcase\.json as a project-relative folder or page/);
});

test('a project that already published the retired orbit view keeps its link, and the retired options are accepted', t => {
  const p = project(t, {viewerUrl: undefined});
  p.put('docs/robot/cad/index.html', '<html>Earlier orbit view</html>');
  assert.equal(p.run('--update').status, 0);
  assert.match(p.read('README.md'), /\[Rotate the model\]\(docs\/robot\/cad\/index\.html\)/);
  assert.equal(p.read('docs/robot/cad/index.html'), '<html>Earlier orbit view</html>', 'the published page is left as it is');
  const verify = p.run('--verify-export');
  assert.equal(verify.status, 0, verify.stderr);
  assert.match(verify.stdout, /--verify-export does nothing now\. The orbit view it compared is retired; the design review page is the one viewer/);
  // A README written by an earlier --update, with its "Rotate the model" link, still passes the check.
  assert.equal(p.run().status, 0);
});
