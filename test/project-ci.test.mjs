/**
 * @lane merge
 * @subject templates/project-ci/ci.yml
 * @subject templates/project-ci/scan.mjs
 * @subject templates/project-ci/site-check.mjs
 * @subject scripts/project-ci-audit.mjs
 * @subject examples/sample-project
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {auditProjectCi, namesPlugin} from '../scripts/project-ci-audit.mjs';
import {checkSite, relativeLinks} from '../templates/project-ci/site-check.mjs';

// The sample project is invented: a carriage, a sample and a bin, with no relation to any game or team.
const here = name => fileURLToPath(new URL('../' + name, import.meta.url));
const references = here('templates/project-ci'), sample = here('examples/sample-project');

/** A copy of the sample project in a folder that holds no plugin and no Git history. */
function standalone(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sample-project-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  cpSync(sample, root, {recursive: true});
  return root;
}
const run = (root, script, ...args) => spawnSync(process.execPath, [path.join(root, 'scripts/ci', script), ...args],
  {cwd: root, encoding: 'utf8', env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot}});
function filesUnder(root) {
  const found = [];
  (function walk(dir, prefix) {
    for (const item of readdirSync(dir, {withFileTypes: true})) item.isDirectory() ? walk(path.join(dir, item.name), prefix + item.name + '/') : found.push(prefix + item.name);
  })(root, '');
  return found.sort();
}

test('the sample project passes its own CI checks in a folder that holds no plugin', t => {
  const root = standalone(t);
  // The checks run from the copy, with nothing of the plugin beside it, on its path or in its environment.
  assert.ok(!root.startsWith(here('.')));
  const scan = run(root, 'scan.mjs', '.');
  assert.equal(scan.status, 0, scan.stderr);
  assert.equal(JSON.parse(scan.stdout).findings, 0);
  const site = run(root, 'site-check.mjs', 'docs');
  assert.equal(site.status, 0, site.stderr);
  assert.equal(site.stdout.trim(), 'The published site is whole.');
  // The controls: each check can fail on this project. The path is assembled here so this file holds none.
  writeFileSync(path.join(root, 'notes.md'), 'Built at ' + ['C:', 'Users', 'invented-student', 'robot'].join('\\') + '\n');
  const found = run(root, 'scan.mjs', '.');
  assert.equal(found.status, 1);
  assert.match(found.stderr, /^notes\.md:1: machine-path: /);
  rmSync(path.join(root, 'docs/preliminary-design/releases/1.0/summary.json'));
  const broken = run(root, 'site-check.mjs', 'docs');
  assert.equal(broken.status, 1);
  assert.deepEqual(broken.stderr.trim().split(/\r?\n/), ['preliminary-design/releases/1.0/index.html links to summary.json, which is missing',
    'preliminary-design/releases/1.0/release.json names summary.json, which is missing']);
});

test('the sample project uses the reference files as its CI, byte for byte', () => {
  for (const [copy, reference] of [['.github/workflows/ci.yml', 'ci.yml'], ['scripts/ci/scan.mjs', 'scan.mjs'], ['scripts/ci/site-check.mjs', 'site-check.mjs']])
    assert.ok(readFileSync(path.join(sample, copy)).equals(readFileSync(path.join(references, reference))), copy + ' is the reference ' + reference);
  const workflow = readFileSync(path.join(references, 'ci.yml'), 'utf8');
  // The workflow checks out the project alone and runs the project's own two files.
  assert.deepEqual([...workflow.matchAll(/uses: ([^@\s]+)@/g)].map(m => m[1]), ['actions/checkout', 'actions/setup-node', 'actions/upload-pages-artifact', 'actions/deploy-pages']);
  assert.doesNotMatch(workflow, /repository:|^\s*pull_request/m);
  assert.deepEqual([...workflow.matchAll(/^\s+run: (.+)$/gm)].map(m => m[1]), ['node scripts/ci/scan.mjs .', 'node scripts/ci/site-check.mjs docs']);
  // Each check imports Node's own modules and nothing else.
  for (const name of ['scan.mjs', 'site-check.mjs'])
    for (const [, from] of readFileSync(path.join(references, name), 'utf8').matchAll(/^import .* from '([^']+)';$/gm)) assert.match(from, /^node:/, name + ' imports ' + from);
});

test('nothing a project copies or the sample project holds names the plugin', () => {
  // The plugin's repository, a pin of it, a path into a checkout of it or a call of one of its scripts.
  const names = /agent-frc|AGENT_FRC|PLUGIN|plugin\/scripts/;
  // The one exception: a schema ID inside data, such as "agent-frc/preliminary-release@1", or the prefix a page
  // matches such IDs with. It labels a record's format. Nothing fetches, runs or resolves it.
  const schemaId = /agent-frc\/[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:@\d+|\/(?=["'`]))/g;
  const found = [];
  for (const folder of [here('templates'), sample]) for (const name of filesUnder(folder)) {
    if (/\.(woff2?|ttf|otf|png|jpg|gz)$/.test(name)) continue;
    readFileSync(path.join(folder, name), 'utf8').split('\n').forEach((line, index) => {
      if (names.test(line.replace(schemaId, ''))) found.push(path.basename(folder) + '/' + name + ':' + (index + 1) + ': ' + line.trim().slice(0, 120));
    });
  }
  assert.deepEqual(found, []);
  // The controls: the pattern finds a call, a pin and a path, and the exception covers a schema ID alone.
  for (const line of ['uses: ehartye/agent-frc/.github/workflows/check.yml@main', 'AGENT_FRC_REF: a-pin', 'node PLUGIN/scripts/check.mjs', 'run: node plugin/scripts/scan.mjs project'])
    assert.match(line.replace(schemaId, ''), names, line);
  assert.doesNotMatch('"schema": "agent-frc/preliminary-release@1"'.replace(schemaId, ''), names);
  assert.match('repository: ehartye/agent-frc'.replace(schemaId, ''), names, 'a repository name is not a schema ID');
});

test('the site check reports an index that disagrees with its folders, a missing named file and a dead link', t => {
  const root = standalone(t), site = path.join(root, 'docs'), tree = path.join(site, 'preliminary-design');
  assert.deepEqual(checkSite(site), []);
  const index = path.join(tree, 'releases.json'), listed = JSON.parse(readFileSync(index, 'utf8'));
  // A listed design with no folder, a folder that is not listed and an index that opens neither.
  writeFileSync(index, JSON.stringify({...listed, releases: ['1.0', '1.1'], current: '2.0'}));
  cpSync(path.join(tree, 'releases/1.0'), path.join(tree, 'releases/draft-copy'), {recursive: true});
  assert.deepEqual(checkSite(site), ['preliminary-design/releases.json lists 1.1, and preliminary-design/releases/1.1/ is missing',
    'preliminary-design/releases.json opens 2.0, which it does not list', 'preliminary-design/releases/draft-copy/ is not listed in preliminary-design/releases.json']);
  // A withdrawn design keeps its line and may have left the site.
  rmSync(path.join(tree, 'releases/draft-copy'), {recursive: true});
  writeFileSync(index, JSON.stringify({...listed, releases: ['0.9', '1.0'], designStatus: {'0.9': 'withdrawn', '1.0': 'in-progress'}}));
  assert.deepEqual(checkSite(site), []);
  // A dead link, beside links that need no file: another site, an anchor, a script's own text, a comment.
  writeFileSync(path.join(site, 'index.html'), '<a href="https://example.invalid/x">out</a><a href="#top">top</a><a href="preliminary-design/">in</a>' +
    '<img src="media/still.png"><script>const a = \'<a href="made-in-script.html">\';</script><!-- <a href="commented.html"> -->');
  assert.deepEqual(checkSite(site), ['index.html links to media/still.png, which is missing']);
  assert.deepEqual(relativeLinks('<a href="a.html?x=1#y">a</a><link rel=stylesheet href=\'b.css\'><a href="mailto:x@example.invalid">m</a><a href="${made}">t</a>'), ['a.html?x=1#y', 'b.css']);
  assert.deepEqual(checkSite(path.join(root, 'no-site')), ['No published folder at ' + path.join(root, 'no-site')]);
});

test('the audit reports a project that names the plugin, lacks a check or differs from the references, and blocks nothing', t => {
  const root = standalone(t), cli = here('scripts/project-ci-audit.mjs');
  const audit = () => spawnSync(process.execPath, [cli, root], {encoding: 'utf8'});
  const clean = audit();
  assert.equal(clean.status, 0);
  assert.deepEqual(clean.stdout.trim().split(/\r?\n/), ['Note: scripts/ci/scan.mjs is the reference path and secret scan.', 'Note: scripts/ci/site-check.mjs is the reference site check.',
    'Note: .github/workflows/ci.yml is the reference workflow.', "The project's CI stands on its own: it names no plugin and runs its scan and its site check."]);
  // A workflow that calls the plugin, a wrapper script, a changed scan and no site check.
  writeFileSync(path.join(root, '.github/workflows/designs.yml'), 'jobs:\n  designs:\n    uses: ehartye/agent-frc/.github/workflows/design-publication.yml@main\n');
  writeFileSync(path.join(root, 'cad/preliminary-design/stage.py'), 'import os\nplugin = os.environ["AGENT_FRC_PLUGIN"]\n');
  writeFileSync(path.join(root, 'scripts/ci/scan.mjs'), readFileSync(path.join(root, 'scripts/ci/scan.mjs'), 'utf8') + '// a project note\n');
  rmSync(path.join(root, 'scripts/ci/site-check.mjs'));
  const {findings, notes} = auditProjectCi(root);
  assert.deepEqual(findings, ['.github/workflows/designs.yml:3 names the plugin. Project code never runs plugin code: replace it with the project\'s own file, or delete it.',
    'cad/preliminary-design/stage.py:2 names the plugin. Project code never runs plugin code: replace it with the project\'s own file, or delete it.',
    'The project has no site check. Copy the reference templates/project-ci/site-check.mjs to scripts/ci/site-check.mjs and run it in the workflow.']);
  assert.ok(notes.includes('scripts/ci/scan.mjs differs from the reference templates/project-ci/scan.mjs in 1 line. Compare them and take what the project wants.'), notes.join('\n'));
  const advised = audit();
  assert.equal(advised.status, 0, 'advice only: the audit never fails a run');
  assert.match(advised.stdout, /3 things to fix in the project's CI\. This audit is advice: it blocks nothing\.\r?\n$/);
  // A project with no CI at all is told where to start.
  rmSync(path.join(root, '.github'), {recursive: true});
  assert.ok(auditProjectCi(root).findings.includes('The project has no workflow. Write .github/workflows/ci.yml from the reference templates/project-ci/ci.yml.'));
  assert.match('node PLUGIN/scripts/design.mjs', namesPlugin);
  assert.ok(existsSync(path.join(sample, 'ABOUT.md')));
});
