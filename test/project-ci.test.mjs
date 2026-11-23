/**
 * @lane merge
 * @subject templates/project-ci/ci.yml
 * @subject templates/project-ci/scan.mjs
 * @subject templates/project-ci/site-check.mjs
 * @subject scripts/project-ci-audit.mjs
 * @subject scripts/published-content.mjs
 * @subject examples/sample-project
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {auditProjectCi, namesPlugin, reportLines} from '../scripts/project-ci-audit.mjs';
import {unlinkedAdvice, unlinkedContent} from '../scripts/published-content.mjs';
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
  // The last line says what the check covered, so a check pointed at the wrong folder shows as zeros.
  assert.equal(site.stdout.trim(), 'The published site is whole: checked 1 design index listing 1 design, 1 design record, 3 pages and 8 relative links.');
  // The controls: each check can fail on this project. The path is assembled here so this file holds none.
  writeFileSync(path.join(root, 'notes.md'), 'Built at ' + ['C:', 'Users', 'invented-student', 'robot'].join('\\') + '\n');
  const found = run(root, 'scan.mjs', '.');
  assert.equal(found.status, 1);
  assert.match(found.stderr, /^notes\.md:1: machine-path: /);
  rmSync(path.join(root, 'docs/preliminary-design/releases/1.0/summary.json'));
  const broken = run(root, 'site-check.mjs', 'docs');
  assert.equal(broken.status, 1);
  assert.equal(broken.stdout.trim(), '2 problems in the published site. Checked 1 design index listing 1 design, 1 design record, 3 pages and 8 relative links.');
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
  // Every action is pinned by commit, with its release beside it.
  for (const [, pin] of workflow.matchAll(/uses: [^@\s]+@(.*)$/gm)) assert.match(pin, /^[0-9a-f]{40} # v\d+\.\d+\.\d+$/, pin);
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

/** Write invented project files: {path: lines}. */
function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    writeFileSync(path.join(root, name), Array.isArray(text) ? text.join('\n') + '\n' : text);
  }
}
// Invented project code, one file for each way real projects were found to use the plugin.
const uses = {
  'tools/build.py': ['"""Build the invented carriage.', '', 'Usage: python tools/build.py, after node PLUGIN/scripts/design.mjs has run.', '"""', 'import os, subprocess, sys', 'from pathlib import Path',
    'TOOLS = Path(os.environ["AGENT_FRC"])', 'CLI = TOOLS / "scripts" / "design.mjs"', 'sys.path.insert(0, str(TOOLS / "scripts"))', 'import mechanical_motion', 'from showcase_contacts import load_solids',
    'subprocess.run(["node", TOOLS / "scripts" / "rehearsal-series.mjs", "plan.json"], check=True)', 'subprocess.run(["node", str(CLI), "new"], check=True)'],
  'tools/from_argument.py': ['import sys', 'from pathlib import Path', 'PLUGIN = Path(sys.argv[1])', 'def script(name):', '    return PLUGIN / "scripts" / name'],
  'tools/from_config.py': ['import json', 'CONFIG = json.load(open("config.json"))', "folder = CONFIG['plugin']"],
  'tools/argument_path.py': ['import sys', 'from pathlib import Path', 'sys.path.insert(0, str(Path(sys.argv[2]).resolve()))', 'import fusion_authority'],
  'tools/run.sh': ['#!/bin/sh', '# node $TOOLS/scripts/design.mjs is how it used to run', 'node "$FOLDER/scripts/design.mjs" new plan.json', 'node "$PLUGIN_DIR/scripts/anything.mjs"'],
  'tools/revise.mjs': ["import path from 'node:path';", "import {pathToFileURL} from 'node:url';", 'const [folder] = process.argv.slice(2);',
    "const {reviseDesign} = await import(pathToFileURL(path.resolve(folder, 'scripts', 'design-artifact.mjs')).href);"],
  'tools/spawn.mjs': ["import {spawnSync} from 'node:child_process';", "import path from 'node:path';", 'const plugin = process.argv[2];', "spawnSync('node', [path.join(plugin, 'scripts', 'anything.mjs')]);"],
  '.github/workflows/designs.yml': ['jobs:', '  designs:', '    uses: ehartye/agent-frc/.github/workflows/design-publication.yml@main'],
};
// Controls the audit must leave alone: the project's own module with a plugin module's name, the project's own
// scripts folder, a schema ID, prose and a comment.
const controls = {
  'tools/payload_compression.py': ['def squeeze(value):', '    return value'],
  'tools/own_module.py': ['import payload_compression', 'from payload_compression import squeeze', 'record = dict(schema="agent-frc/mechanical-motion@1")'],
  'tools/own_scripts.py': ['import subprocess', 'from pathlib import Path', 'ROOT = Path(__file__).resolve().parents[1]', 'subprocess.run(["node", ROOT / "scripts" / "ci" / "scan.mjs", "."], check=True)',
    'import importlib.util', 'spec = importlib.util.spec_from_file_location("own", ROOT / "tools" / "payload_compression.py")'],
  'tools/comment.py': ['# Checked by the agent with node PLUGIN/scripts/design.mjs before this ran.', 'print("ok")'],
  'notes/plan.md': ['The agent runs `node PLUGIN/scripts/design.mjs` on the plan. See agent-frc for the command.'],
  'notes/record.json': ['{"schema": "agent-frc/preliminary-layout@1", "plugin": "0.1.0"}'],
};
const form = (audit, file) => audit.uses.find(use => use.file === file)?.places.map(place => place.line + ': ' + place.form) ?? null;

test('the audit finds project code that runs or imports plugin code, in every form and in any folder', t => {
  const root = standalone(t);
  write(root, {...uses, ...controls});
  const audit = auditProjectCi(root);
  assert.deepEqual(audit.uses.map(use => use.file), Object.keys(uses).sort());
  assert.deepEqual(form(audit, 'tools/build.py'), ['7: reads a plugin location or pin from the environment or a configuration value', '8: builds a path into the plugin\'s scripts folder',
    '9: puts the plugin folder on the import path', '10: imports the plugin module mechanical_motion', '11: imports the plugin module showcase_contacts',
    '12: runs the plugin script rehearsal-series.mjs', '13: runs a command with the plugin folder']);
  assert.deepEqual(form(audit, 'tools/from_argument.py'), ['5: builds a path into the plugin\'s scripts folder']);
  assert.deepEqual(form(audit, 'tools/from_config.py'), ['3: reads a plugin location or pin from the environment or a configuration value']);
  assert.deepEqual(form(audit, 'tools/argument_path.py'), ['3: puts a folder from a command-line argument or the environment on the import path', '4: imports the plugin module fusion_authority']);
  assert.deepEqual(form(audit, 'tools/run.sh'), ['3: runs the plugin script design.mjs', '4: runs a script in the plugin folder']);
  assert.deepEqual(form(audit, 'tools/revise.mjs'), ['4: imports the plugin script design-artifact.mjs by its path']);
  assert.deepEqual(form(audit, 'tools/spawn.mjs'), ['4: runs a script in the plugin folder']);
  assert.deepEqual(form(audit, '.github/workflows/designs.yml'), ['3: checks out or calls the plugin\'s repository']);
  // The controls: none is a finding. Prose and a comment are mentions; a schema ID is not even that.
  for (const name of Object.keys(controls)) assert.equal(form(audit, name), null, name);
  assert.deepEqual(audit.unclear, []);
  assert.deepEqual(audit.mentions, ['notes/plan.md', 'tools/comment.py']);
  // The same module name is plugin code once the project no longer holds its own.
  rmSync(path.join(root, 'tools/payload_compression.py'));
  assert.deepEqual(form(auditProjectCi(root), 'tools/own_module.py'), ['1: imports the plugin module payload_compression', '2: imports the plugin module payload_compression']);
});

test('the audit never calls a project clear while it has findings, and says what it could not classify or read', t => {
  const root = standalone(t), cli = here('scripts/project-ci-audit.mjs');
  const run = (...args) => { const done = spawnSync(process.execPath, [cli, root, ...args], {encoding: 'utf8'}); assert.equal(done.status, 0, 'advice only: the audit never fails a run'); return done.stdout.trim().split(/\r?\n/); };
  const clear = "In what the audit read, no project file runs or imports plugin code. The project's CI runs its scan and its site check.";
  assert.deepEqual(run(), ['Note: scripts/ci/scan.mjs is the reference path and secret scan.', 'Note: scripts/ci/site-check.mjs is the reference site check.', 'Note: .github/workflows/ci.yml is the reference workflow.',
    'Read 3 code files and 9 prose or data files, listed by a walk of the folder. Model, image and archive files are not read.', clear]);
  // Code whose target the audit cannot read is listed, and the project is not called clear.
  write(root, {'tools/loader.py': ['import importlib', 'def load(name):', '    return importlib.import_module(name)'], 'tools/big.py': '# filler\n'.repeat(300000)});
  const unsure = run();
  assert.deepEqual(unsure.slice(0, 3), ['Not classified (1 place in 1 file). The audit cannot tell what these load or run: read each one.', '  tools/loader.py', '    line 3: loads code from a computed location']);
  assert.equal(unsure.at(-2), 'Did not read 1 file: tools/big.py (over 2 MB).');
  assert.equal(unsure.at(-1), 'No file was found that runs or imports plugin code, and 1 place could not be classified. Read them before calling the project clear of the plugin. This audit is advice: it blocks nothing.');
  // One use is enough: the verdict counts it and the report names its file, line and form.
  write(root, {'tools/build.py': uses['tools/build.py'], 'evidence/old/run.py': uses['tools/from_argument.py']});
  const found = run('--skip', 'evidence');
  assert.equal(found[0], "Runs or imports plugin code (1 file). Project code never runs plugin code: replace each use with the project's own code, or delete the file.");
  assert.deepEqual(found.slice(1, 4), ['  tools/build.py', '    line 7: reads a plugin location or pin from the environment or a configuration value', "    line 8: builds a path into the plugin's scripts folder"]);
  assert.match(found.at(-3), /Skipped evidence\/ \(1 file\)\.$/);
  assert.equal(found.at(-1), 'Not clear of the plugin: 1 file runs or imports plugin code. 1 place not classified. This audit is advice: it blocks nothing.');
  assert.ok(run().includes('  evidence/old/run.py'), 'without --skip the folder is read');
  assert.ok(!found.includes(clear) && !unsure.includes(clear));
});

test('a declared exception is listed on every run with its reason, and hides nothing', t => {
  const root = standalone(t);
  write(root, {'tools/build.py': uses['tools/build.py'], 'tools/loader.py': ['import importlib', 'def load(name):', '    return importlib.import_module(name)'], 'evidence/old/run.py': uses['tools/from_argument.py'],
    '.project-ci-audit.json': JSON.stringify({skip: ['evidence/'], exceptions: [{path: 'tools/build.py', reason: 'The builder measures with the shared modules until the library replaces them.'},
      {path: 'tools/loader.py', reason: 'Loads the project\'s own modules by name.'}, {path: 'tools/gone/', reason: 'Removed last week.'}, {path: 'tools/run.sh'}]})});
  const audit = auditProjectCi(root), report = reportLines(audit);
  assert.deepEqual(audit.uses, []);
  assert.deepEqual(audit.coverage.skipped, ['evidence/']);
  assert.deepEqual(report.slice(0, 6), ['Declared exceptions in .project-ci-audit.json (2 files), listed on every run. 1 file of them still runs or imports plugin code.',
    ' tools/build.py: The builder measures with the shared modules until the library replaces them.', '  tools/build.py', '    line 7: reads a plugin location or pin from the environment or a configuration value',
    "    line 8: builds a path into the plugin's scripts folder", '    line 9: puts the plugin folder on the import path']);
  assert.ok(report.includes(" tools/loader.py: Loads the project's own modules by name."));
  assert.ok(report.includes('Fix: .project-ci-audit.json holds an exception without a path and a reason. It covers nothing until it has both.'));
  assert.ok(report.includes('Note: The exception for tools/gone/ in .project-ci-audit.json covers nothing the audit found. Remove it.'));
  assert.equal(report.at(-1), "Not clear of the plugin: 1 file runs or imports plugin code, 1 under a declared exception. 1 thing to fix in the project's CI. This audit is advice: it blocks nothing.");
  // An exception that explains only what the audit could not classify leaves the project clear, and still listed.
  rmSync(path.join(root, 'tools/build.py'));
  writeFileSync(path.join(root, '.project-ci-audit.json'), JSON.stringify({exceptions: [{path: 'tools/loader.py', reason: 'Loads the project\'s own modules by name.'}]}));
  rmSync(path.join(root, 'evidence'), {recursive: true});
  const explained = reportLines(auditProjectCi(root));
  assert.equal(explained[0], 'Declared exceptions in .project-ci-audit.json (1 file), listed on every run.');
  assert.equal(explained.at(-1), "In what the audit read, no project file runs or imports plugin code; 1 declared exception explain what it could not classify. The project's CI runs its scan and its site check.");
});

test('the audit reports a project that lacks a check or differs from the references', t => {
  const root = standalone(t);
  writeFileSync(path.join(root, 'scripts/ci/scan.mjs'), readFileSync(path.join(root, 'scripts/ci/scan.mjs'), 'utf8') + '// a project note\n');
  rmSync(path.join(root, 'scripts/ci/site-check.mjs'));
  const {findings, notes} = auditProjectCi(root);
  assert.deepEqual(findings, ['The project has no site check. Copy the reference templates/project-ci/site-check.mjs to scripts/ci/site-check.mjs and run it in the workflow.']);
  assert.ok(notes.includes('scripts/ci/scan.mjs differs from the reference templates/project-ci/scan.mjs in 1 line. Compare them and take what the project wants.'), notes.join('\n'));
  // A project with no CI at all is told where to start.
  rmSync(path.join(root, '.github'), {recursive: true});
  assert.ok(auditProjectCi(root).findings.includes('The project has no workflow. Write .github/workflows/ci.yml from the reference templates/project-ci/ci.yml.'));
  assert.match('node PLUGIN/scripts/design.mjs', namesPlugin);
  assert.ok(existsSync(path.join(sample, 'ABOUT.md')));
});

test('the publication check lists published files that no page, index or listed design leads to', t => {
  const root = standalone(t);
  // The sample site as it stands: everything is linked, the design folder through the index that lists it.
  assert.deepEqual(unlinkedAdvice(root), []);
  // A withdrawn viewer left in the folder, a model nothing shows, and a design the index marks withdrawn.
  write(root, {'docs/models/earlier-viewer/index.html': '<script src="viewer.js"></script><a href="carriage.glb">model</a>', 'docs/models/earlier-viewer/viewer.js': 'load("carriage.glb")',
    'docs/models/earlier-viewer/carriage.glb': 'glb', 'docs/media/first-still.png': 'png', 'docs/media/shown.png': 'png', 'docs/fonts/OFL-Invented.txt': 'licence', 'docs/CNAME': 'example.invalid',
    'docs/preliminary-design/releases/0.9/index.html': '<p>withdrawn</p>', 'README.md': '# Sample\n\n![still](docs/media/shown.png)\n'});
  const index = path.join(root, 'docs/preliminary-design/releases.json'), listed = JSON.parse(readFileSync(index, 'utf8'));
  writeFileSync(index, JSON.stringify({...listed, releases: ['0.9', ...listed.releases], designStatus: {...listed.designStatus, '0.9': 'withdrawn'}}));
  assert.deepEqual(unlinkedContent(root).groups, [{path: 'docs/media/first-still.png', files: 1, pages: 0, models: 0}, {path: 'docs/models/', files: 3, pages: 1, models: 1},
    {path: 'docs/preliminary-design/releases/0.9/', files: 1, pages: 1, models: 0}]);
  assert.deepEqual(unlinkedAdvice(root), ['5 published files that no page, index or listed design leads to. Publishing docs/ puts them online. Delete what was withdrawn or never meant to be published, and link what should be shown:',
    '  docs/models/ (3 files, 1 page, 1 model file)', '  docs/preliminary-design/releases/0.9/ (1 file, 1 page)', '  docs/media/first-still.png']);
  // The site check passes this site: every linked page still works. Only the advice sees what is left over.
  assert.deepEqual(checkSite(path.join(root, 'docs')), []);
  // Linking the viewer from a page clears it and what it loads.
  writeFileSync(path.join(root, 'docs/index.html'), readFileSync(path.join(root, 'docs/index.html'), 'utf8').replace('</main>', '<a href="models/earlier-viewer/">Earlier viewer</a></main>'));
  assert.deepEqual(unlinkedContent(root).groups.map(group => group.path), ['docs/media/first-still.png', 'docs/preliminary-design/releases/0.9/']);
  // A folder that is no site gives no advice.
  assert.deepEqual(unlinkedAdvice(root, 'no-site'), []);
});
