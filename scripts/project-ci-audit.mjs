#!/usr/bin/env node
/**
 * Audit a robot project's own CI. Advice for the coding agent: it reports and never blocks.
 *
 *   node project-ci-audit.mjs PROJECT
 *
 * A project's CI is the project's own code. It checks out only the project and runs only the project's files, so
 * nothing in it changes or breaks when the plugin changes or is gone. This audit reports:
 *
 *   - a workflow or script in the project that names the plugin: its repository, a pin of it or a path into it;
 *   - a missing path and secret scan, a missing site check, or one that no workflow runs;
 *   - how the project's copies differ from the reference files in templates/project-ci/.
 *
 * A difference is information. A project may change its own files.
 */
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const reference = fileURLToPath(new URL('../templates/project-ci/', import.meta.url));
/** The plugin's repository, a pin of it, a checkout of it or a call of one of its scripts. A schema ID inside data, as in "agent-frc/NAME@1", is none of these. */
export const namesPlugin = /ehartye\/agent-frc|AGENT_FRC|\bPLUGIN\/|\bplugin\/scripts\/|stage_preliminary_review|design-publication\.mjs|project-checks\.mjs/;
const lines = text => text.replace(/\r\n/g, '\n').split('\n');

function filesUnder(root, folder) {
  const found = [], start = path.join(root, folder);
  if (!existsSync(start)) return found;
  (function walk(dir, prefix) {
    for (const item of readdirSync(dir, {withFileTypes: true})) {
      if (item.name === 'node_modules' || item.name === '.git' || item.name === '__pycache__') continue;
      if (item.isDirectory()) walk(path.join(dir, item.name), prefix + item.name + '/');
      else if (item.isFile()) found.push(prefix + item.name);
    }
  })(start, folder ? folder + '/' : '');
  return found;
}

/** How many lines of a project file differ from its reference, counted in both directions. */
function difference(mine, theirs) {
  const a = lines(mine), b = new Set(lines(theirs)), c = new Set(a);
  return a.filter(line => !b.has(line)).length + lines(theirs).filter(line => !c.has(line)).length;
}

/**
 * Audit a project. Returns {findings, notes}: findings are things to fix, notes are information. Each is one line.
 */
export function auditProjectCi(root) {
  const findings = [], notes = [], read = name => readFileSync(path.join(root, name), 'utf8');
  const workflows = filesUnder(root, '.github/workflows').filter(name => /\.ya?ml$/.test(name));
  // Code the project runs: its workflows, its scripts and the launchers a design folder may hold.
  const code = [...workflows, ...filesUnder(root, 'scripts'), ...filesUnder(root, 'tests'), ...filesUnder(root, 'cad').filter(name => /\.(py|mjs|js|sh|ps1)$/.test(name)),
    ...readdirSync(root, {withFileTypes: true}).filter(item => item.isFile() && /\.(py|mjs|js|sh|ps1)$/.test(item.name)).map(item => item.name)];
  for (const name of [...new Set(code)].sort()) {
    const text = read(name), at = lines(text).findIndex(line => namesPlugin.test(line));
    if (at >= 0) findings.push(name + ':' + (at + 1) + ' names the plugin. Project code never runs plugin code: replace it with the project\'s own file, or delete it.');
  }
  if (!workflows.length) findings.push('The project has no workflow. Write .github/workflows/ci.yml from the reference ' + rel('ci.yml') + '.');
  const run = workflows.map(read).join('\n');
  for (const [name, what] of [['scan.mjs', 'path and secret scan'], ['site-check.mjs', 'site check']]) {
    const copies = filesUnder(root, '').filter(file => path.posix.basename(file) === name && !file.startsWith('docs/'));
    if (!copies.length) { findings.push('The project has no ' + what + '. Copy the reference ' + rel(name) + ' to scripts/ci/' + name + ' and run it in the workflow.'); continue; }
    if (!copies.some(file => run.includes(file))) findings.push('No workflow runs the ' + what + ' (' + copies.join(', ') + ').');
    for (const file of copies) {
      const differs = difference(read(file), readFileSync(path.join(reference, name), 'utf8'));
      notes.push(differs ? file + ' differs from the reference ' + rel(name) + ' in ' + differs + ' line' + (differs === 1 ? '' : 's') + '. Compare them and take what the project wants.'
        : file + ' is the reference ' + what + '.');
    }
  }
  for (const name of workflows) {
    const text = read(name);
    if (/^\s*pull_request(_target)?:/m.test(text) && /self-hosted/.test(text)) findings.push(name + ' runs pull requests on a self-hosted runner: a stranger\'s code would run on the project\'s machine.');
    if (/upload-pages-artifact|deploy-pages/.test(text) && !/site-check/.test(run)) notes.push(name + ' publishes the site with no site check before it.');
  }
  const ci = workflows.find(name => name.endsWith('/ci.yml'));
  if (ci) {
    const differs = difference(read(ci), readFileSync(path.join(reference, 'ci.yml'), 'utf8'));
    notes.push(differs ? ci + ' differs from the reference ' + rel('ci.yml') + ' in ' + differs + ' line' + (differs === 1 ? '' : 's') + '. A project adds its own steps there.' : ci + ' is the reference workflow.');
  }
  return {findings, notes};
  function rel(name) { return 'templates/project-ci/' + name; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [project, ...rest] = process.argv.slice(2);
  if (!project || rest.length || !statSync(project, {throwIfNoEntry: false})?.isDirectory()) { console.error('Usage: project-ci-audit.mjs PROJECT'); process.exit(2); }
  const {findings, notes} = auditProjectCi(path.resolve(project));
  for (const finding of findings) console.log('Fix: ' + finding);
  for (const note of notes) console.log('Note: ' + note);
  console.log(findings.length ? findings.length + ' thing' + (findings.length === 1 ? '' : 's') + ' to fix in the project\'s CI. This audit is advice: it blocks nothing.'
    : 'The project\'s CI stands on its own: it names no plugin and runs its scan and its site check.');
}
