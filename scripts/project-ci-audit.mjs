#!/usr/bin/env node
/**
 * Audit a robot project for use of the plugin, and audit its own CI. Advice for the coding agent: it reports and
 * never blocks.
 *
 *   node project-ci-audit.mjs PROJECT [--skip FOLDER]... [--mentions]
 *
 * Project code never runs plugin code: nothing in a project changes or breaks when the plugin changes or is gone.
 * The audit reads every text file of the project and reports, by file and line:
 *
 *   - code that runs or imports plugin code: a plugin folder taken from the environment, a command-line argument or a
 *     configuration value and joined with scripts/; that folder put on the import path; an import of one of the
 *     plugin's own modules that the project does not hold; a command that runs one of the plugin's scripts; a
 *     dynamic import of one; a workflow that names the plugin's repository or a pin of it;
 *   - places it could not classify, such as code loaded from a computed location, so that a person looks at them;
 *   - files that only mention the plugin in prose or data, as a count. A schema ID such as "agent-frc/NAME@1" labels
 *     a record's format and is not a mention.
 *
 * It then reports a missing path and secret scan or site check, one that no workflow runs, and how the project's
 * copies differ from the reference files in templates/project-ci/.
 *
 * A project declares known exceptions and folders to skip in .project-ci-audit.json at its root:
 *
 *   {"skip": ["evidence/"], "exceptions": [{"path": "cad/builder/", "reason": "Why this stays for now."}]}
 *
 * Every run lists each exception with its reason and what it covers. An exception hides nothing.
 */
import {execFileSync} from 'node:child_process';
import {closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const reference = fileURLToPath(new URL('../templates/project-ci/', import.meta.url));
const pluginScripts = fileURLToPath(new URL('./', import.meta.url));
export const exceptionsFile = '.project-ci-audit.json';
/** The plugin's repository, a pin of it, a checkout of it or a call of one of its scripts. A schema ID inside data, as in "agent-frc/NAME@1", is none of these. */
export const namesPlugin = /ehartye\/agent-frc|AGENT_FRC|\bPLUGIN\/|\bplugin\/scripts\/|stage_preliminary_review|design-publication\.mjs|project-checks\.mjs/;
/** A schema ID inside data, or the prefix a page matches such IDs with. */
const schemaId = /[a-z0-9-]*agent-frc\/[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:@\d+|\/(?=["'`]))/g;
const lines = text => text.replace(/\r\n/g, '\n').split('\n');
const sizeLimit = 2 * 1024 * 1024;

/** Files that hold prose or data: the plugin's name in one is a mention. Everything else that reads as text is code. */
const prose = /\.(md|markdown|txt|rst|json|jsonl|html?|css|csv|tsv|svg|xml|toml|ini|cfg|lock|ya?ml|log|gitignore|gitattributes)$/i;
/** Model and image formats: never code, and too large to be worth reading. */
const model = /\.(step|stp|stl|obj|gltf|glb|iges|igs|dxf|f3d|f3z|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp4|webm|wasm)$/i;
const isWorkflow = name => /^\.github\/(?:workflows|actions)\/.*\.ya?ml$/.test(name);
const isCode = name => isWorkflow(name) || /(?:^|\/)(?:package\.json|Makefile)$/.test(name) || !prose.test(name);

const pluginWord = '(?:plugin|agent[_-]?frc)';
/** A name that says plugin, as an identifier or a variable of a shell. */
const pluginName = new RegExp('[\\w$.%{]*' + pluginWord + '[\\w$%}]*', 'i');
/** A plugin location read from the environment, a workflow variable or a configuration value. */
const fromOutside = new RegExp('(?:environ|getenv|process\\.env|\\$env:)[^\\n]{0,12}?' + pluginWord + '|\\$\\{\\{[^}\\n]*' + pluginWord + '|(?:\\$\\{?|%)\\w*' + pluginWord +
  '|\\[\\s*["\']' + pluginWord + '(?:[_-]?(?:dir|root|path|folder|home|scripts|checkout))?["\']\\s*\\]', 'i');
const outsideValue = /sys\.argv|process\.argv|os\.environ|getenv|process\.env|\$env:|\$args|\$\d\b|\$\{\d/;
const importPath = /sys\.path\.(?:insert|append|extend)|site\.addsitedir|\bPYTHONPATH\b|\bNODE_PATH\b/;
const runs = /\b(?:subprocess|Popen|check_call|check_output|spawn\w*|exec\w*|run|system|Start-Process|Invoke-Expression)\b\s*[.(]|^\s*-?\s*run:|\b(?:node|python3?|py|pwsh|powershell|npx|bash|sh)(?:\.exe)?["']?[\s,]+\S|^\s*&\s/;
const loadsCode = /(?<![\w.])import\s*\((?!\s*$)|(?<!\b(?:def|function)\s+)\brequire\s*\(|\bimport_module\s*\(|__import__\s*\(|spec_from_file_location\s*\(|\brun_path\s*\(|\brun_module\s*\(/;
const pythonLoads = /\b(?:import_module|__import__|spec_from_file_location|run_path|run_module)\s*\(/;
const literalTarget =/(?:import|require|import_module|__import__|run_module)\s*\(\s*(["'`])[^"'`$]*\1\s*[,)]/;
const comment = /^\s*(?:#(?!!)|\/\/|\/\*|\*|REM\s|::|<!--)/i;
const strings = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const withoutStrings = line => line.replace(strings, '""');
const pluginString = new RegExp('^\\w*' + pluginWord + '\\w*$', 'i');
/** A line with its plain strings emptied. A string stays when it is a scripts path, is filled in from a variable or names a plugin variable. */
const pathsOnly = line => line.replace(strings, (all, quote, inner) => /^[\/\\]?scripts\b|[$%{]/.test(inner) || pluginString.test(inner) ? all : quote + quote);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plural = (count, one, many = one + 's') => count + ' ' + (count === 1 ? one : many);

/** Every file of the project, by its path from the root: the tracked and untracked files Git would commit, or a walk. */
export function projectFiles(root) {
  if (existsSync(path.join(root, '.git'))) try {
    return {by: 'Git', files: execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], {encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore']})
      .split('\0').filter(name => name && statSync(path.join(root, name), {throwIfNoEntry: false})?.isFile())};
  } catch { /* walk the folder instead */ }
  const files = [];
  (function walk(dir, prefix) {
    for (const item of readdirSync(dir, {withFileTypes: true})) {
      if (['node_modules', '.git', '__pycache__', '.venv', 'venv'].includes(item.name)) continue;
      if (item.isDirectory()) walk(path.join(dir, item.name), prefix + item.name + '/');
      else if (item.isFile()) files.push(prefix + item.name);
    }
  })(root, '');
  return {by: 'a walk of the folder', files};
}

/** The text of a file, or why it was not read. */
export function textOf(full) {
  const size = statSync(full).size;
  if (size > sizeLimit) return {skipped: 'large'};
  const head = Buffer.alloc(Math.min(size, 8000)), file = openSync(full, 'r');
  try { readSync(file, head, 0, head.length, 0); } finally { closeSync(file); }
  return head.includes(0) ? {skipped: 'binary'} : {text: readFileSync(full, 'utf8')};
}

/** The plugin's own scripts and Python modules that the project does not itself hold. */
export function foreignNames(files) {
  const held = new Set(), folders = new Set();
  for (const name of files) { const parts = name.split('/'); held.add(parts.pop()); parts.forEach(part => folders.add(part)); }
  const own = readdirSync(pluginScripts).filter(name => /\.(mjs|js|py)$/.test(name));
  return {held, scripts: own.filter(name => !held.has(name)),
    modules: new Set(own.filter(name => name.endsWith('.py')).map(name => name.slice(0, -3)).filter(name => /^[A-Za-z_]\w*$/.test(name) && !held.has(name + '.py') && !folders.has(name)))};
}

/**
 * The places where one code file runs or imports plugin code, as {line, form}; the places the audit cannot
 * classify; and whether the file mentions the plugin anywhere else.
 */
export function usesIn(name, text, foreign) {
  const uses = [], unclear = [], rows = lines(text), python = /\.pyw?$/i.test(name), javascript = /\.(?:[cm]?[jt]sx?)$/i.test(name), workflow = isWorkflow(name);
  // Which lines are code: not a comment line, and not inside a Python docstring.
  const code = [];
  let docstring = null;
  rows.forEach((row, index) => {
    if (python) {
      const quotes = row.match(/"""|'''/g) ?? [];
      if (docstring) { if (quotes.includes(docstring)) docstring = null; return; }
      const opens = row.match(/^\s*[rRuUbB]?("""|''')/);
      if (opens) { if (quotes.filter(quote => quote === opens[1]).length % 2) docstring = opens[1]; return; }
    }
    if (!comment.test(row)) code.push(index);
  });
  const clean = index => rows[index].replace(schemaId, '');
  // Names that hold a plugin location: assigned from a plugin name, from the environment or from another such name.
  const held = new Set();
  const refers = bare => pluginName.test(bare) || [...held].some(known => new RegExp('(?<![\\w$])' + escape(known) + '(?![\\w$])').test(bare));
  for (let pass = 0; pass < 3; pass++) for (const index of code) {
    const row = clean(index), assigned = row.match(/^\s*(?:(?:export|const|let|var|local|readonly|set)\s+)*([A-Za-z_$][\w$]*)\s*(?::\s*[\w.[\]]+\s*)?=(?!=)\s*(.+)$/);
    if (!assigned || /\b(?:subprocess|Popen|check_output|spawn\w*|exec\w*|run|loads?|read_text|readFileSync|open)\s*\(/.test(assigned[2])) continue;
    if (refers(withoutStrings(assigned[2])) || fromOutside.test(assigned[2])) held.add(assigned[1]);
  }
  const names = [...held].filter(known => !pluginName.test(known)).map(escape);
  const base = '(?:' + [pluginName.source, ...names.map(known => '(?<![\\w$])' + known + '(?![\\w$])')].join('|') + ')';
  // The plugin folder joined with scripts: PLUGIN / "scripts", join(plugin, 'scripts', …), $PLUGIN/scripts, `${plugin}/scripts`.
  const joined = new RegExp(base + '[^;=\\n]{0,40}?(?:[\\/\\\\+,]|\\$\\{[^}]*\\})\\s*f?["\'`]?[\\/\\\\]?scripts\\b', 'i');
  // A path to one of the plugin's scripts: scripts/NAME or 'scripts', 'NAME'.
  const scriptPath = foreign.scripts.length ? new RegExp('\\bscripts(?:[\\/\\\\]+|["\'`]\\s*[,+\\/]\\s*["\'`])(' + foreign.scripts.map(escape).join('|') + ')(?![\\w.-])') : null;
  const outside = [];
  for (const index of code) {
    const row = clean(index), bare = withoutStrings(row), paths = pathsOnly(row), at = index + 1, add = form => uses.push({line: at, form});
    const plugin = refers(bare) || fromOutside.test(row), script = scriptPath?.exec(row)?.[1];
    if (importPath.test(row) && (plugin || joined.test(paths) || /["'`][^"'`]*\bPLUGIN\b[^"'`]*scripts/.test(row))) { add('puts the plugin folder on the import path'); continue; }
    if (importPath.test(row) && outsideValue.test(row)) outside.push(at);
    if (python) {
      const imported = row.match(/^\s*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.,\s]+?)(?:\s*#.*)?$)/);
      const modules = imported ? (imported[1] ?? imported[2]).split(',').map(part => part.trim().split(/\s+as\s+/)[0].split('.')[0]).filter(module => foreign.modules.has(module)) : [];
      if (modules.length) { add('imports the plugin module ' + modules.join(', ')); continue; }
    }
    const loaded = row.match(/(?:import_module|__import__|run_module)\s*\(\s*["'](\w+)/);
    if (loaded && foreign.modules.has(loaded[1])) { add('imports the plugin module ' + loaded[1]); continue; }
    if (joined.test(paths) || script) {
      const what = script ? 'the plugin script ' + script : 'a script in the plugin folder';
      if (loadsCode.test(row)) add('imports ' + what + ' by its path');
      else if (runs.test(row)) add('runs ' + what);
      else if (joined.test(paths)) add('builds a path into the plugin\'s scripts folder');
      else unclear.push({line: at, form: 'names the path of the plugin script ' + script + ' without running it on this line'});
      continue;
    }
    if (workflow && (namesPlugin.test(row) || /^\s*(?:-\s*)?(?:uses|repository):.*agent-frc/.test(row))) { add(/\b(?:uses|repository):/.test(row) ? 'checks out or calls the plugin\'s repository' : 'names the plugin in a workflow'); continue; }
    if (fromOutside.test(row) && !/^\s*(?:def|function|class)\b/.test(row)) { add('reads a plugin location or pin from the environment or a configuration value'); continue; }
    if (plugin && runs.test(row) && [...held].some(known => new RegExp('(?<![\\w$])' + escape(known) + '(?![\\w$])').test(bare))) { add('runs a command with the plugin folder'); continue; }
    if (namesPlugin.test(row) && runs.test(row)) { add('runs a command that names the plugin'); continue; }
    // Code loaded from a computed location is the project's own when the line names one of the project's files.
    // A call that continues on the next lines is read with them.
    const call = /[(,]\s*$/.test(row) ? rows.slice(index, index + 4).join(' ') : row;
    const own = [...call.matchAll(/[\w.-]+\.(?:py|mjs|cjs|js)\b/g)].some(([file]) => foreign.held.has(file));
    if ((javascript ? loadsCode : pythonLoads).test(row) && !literalTarget.test(call) && !own) unclear.push({line: at, form: 'loads code from a computed location'});
  }
  // A folder from a command-line argument or the environment on the import path: plugin use when a plugin module follows.
  for (const at of outside) (uses.some(use => use.form.startsWith('imports the plugin module')) ? uses : unclear).push({line: at,
    form: 'puts a folder from a command-line argument or the environment on the import path'});
  const found = new Set(uses.map(use => use.line));
  const mentions = rows.some((row, index) => !found.has(index + 1) && mention.test(row.replace(schemaId, '')));
  const byLine = (a, b) => a.line - b.line;
  return {uses: uses.sort(byLine), unclear: unclear.filter(place => !found.has(place.line)).sort(byLine), mentions};
}
/** The plugin named in prose or data. */
const mention = /[Aa]gent[-_ ]?(?:frc|FRC)|AGENT_FRC|\bPLUGIN\b|\bplugin\/scripts\b/;

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

const folder = name => name.replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '') + '/';

/**
 * Audit a project. Returns:
 *
 *   uses         files that run or import plugin code: {file, places: [{line, form}]}
 *   exceptions   the same, for files a declared exception covers, each with its reason
 *   unclear      places the audit could not classify: {file, places}
 *   mentions     files that only mention the plugin in prose or data
 *   findings     things to fix in the project's CI, one line each
 *   notes        information, one line each
 *   coverage     what was read and what was not
 */
export function auditProjectCi(root, {skip = []} = {}) {
  const findings = [], notes = [], read = name => readFileSync(path.join(root, name), 'utf8');
  // The project's own list of folders to skip and exceptions.
  let declared = {};
  if (existsSync(path.join(root, exceptionsFile))) try { declared = JSON.parse(read(exceptionsFile)); } catch { findings.push(exceptionsFile + ' is not readable JSON, so no exception or skipped folder in it applies.'); }
  const skipped = [...new Set([...skip, ...(Array.isArray(declared.skip) ? declared.skip : [])].filter(name => typeof name === 'string' && name.trim()).map(folder))].sort();
  const listed = Array.isArray(declared.exceptions) ? declared.exceptions : [], excepted = [];
  for (const entry of listed) {
    if (typeof entry?.path === 'string' && typeof entry.reason === 'string' && entry.reason.trim()) excepted.push({path: entry.path.replace(/\\/g, '/').replace(/^\.\//, ''), reason: entry.reason.trim(), files: []});
    else findings.push(exceptionsFile + ' holds an exception without a path and a reason. It covers nothing until it has both.');
  }
  const all = projectFiles(root), files = all.files.filter(name => !skipped.some(skip => name.startsWith(skip))).sort();
  const foreign = foreignNames(files);
  const uses = [], unclear = [], mentions = [], unread = [], coverage = {listedBy: all.by, code: 0, other: 0, skipped, unread, skippedFiles: all.files.length - files.length};
  for (const name of files) {
    if (model.test(name)) continue;
    const {text, skipped: why} = textOf(path.join(root, name));
    if (text === undefined) { if (why === 'large' || isCode(name) && !/\.(?:pyc|class|jar|exe|dll|so|bin|db|sqlite)$/i.test(name) && path.posix.basename(name).includes('.')) unread.push(name + (why === 'large' ? ' (over 2 MB)' : ' (not text)')); continue; }
    if (!isCode(name)) { coverage.other++; if (name !== exceptionsFile && lines(text).some(line => mention.test(line.replace(schemaId, '')))) mentions.push(name); continue; }
    coverage.code++;
    const found = usesIn(name, text, foreign), cover = excepted.find(entry => entry.path.endsWith('/') ? name.startsWith(entry.path) : name === entry.path);
    if (cover && (found.uses.length || found.unclear.length)) { cover.files.push({file: name, uses: found.uses.length, places: [...found.uses, ...found.unclear].sort((a, b) => a.line - b.line)}); continue; }
    if (found.uses.length) uses.push({file: name, places: found.uses});
    if (found.unclear.length) unclear.push({file: name, places: found.unclear});
    if (!found.uses.length && found.mentions) mentions.push(name);
  }
  for (const entry of excepted) if (!entry.files.length) notes.push('The exception for ' + entry.path + ' in ' + exceptionsFile + ' covers nothing the audit found. Remove it.');

  const workflows = filesUnder(root, '.github/workflows').filter(name => /\.ya?ml$/.test(name));
  if (!workflows.length) findings.push('The project has no workflow. Write .github/workflows/ci.yml from the reference ' + rel('ci.yml') + '.');
  const run = workflows.map(read).join('\n');
  for (const [name, what] of [['scan.mjs', 'path and secret scan'], ['site-check.mjs', 'site check']]) {
    const copies = files.filter(file => path.posix.basename(file) === name && !file.startsWith('docs/'));
    if (!copies.length) { findings.push('The project has no ' + what + '. Copy the reference ' + rel(name) + ' to scripts/ci/' + name + ' and run it in the workflow.'); continue; }
    if (!copies.some(file => run.includes(file))) findings.push('No workflow runs the ' + what + ' (' + copies.join(', ') + ').');
    for (const file of copies) {
      const differs = difference(read(file), readFileSync(path.join(reference, name), 'utf8'));
      notes.push(differs ? file + ' differs from the reference ' + rel(name) + ' in ' + plural(differs, 'line') + '. Compare them and take what the project wants.'
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
    notes.push(differs ? ci + ' differs from the reference ' + rel('ci.yml') + ' in ' + plural(differs, 'line') + '. A project adds its own steps there.' : ci + ' is the reference workflow.');
  }
  return {uses, exceptions: excepted.filter(entry => entry.files.length), unclear, mentions, findings, notes, coverage};
  function rel(name) { return 'templates/project-ci/' + name; }
}

/** The report of an audit, as the lines the command prints. The last line is the verdict. */
export function reportLines(audit, {mentions = false} = {}) {
  const out = [], {uses, exceptions, unclear, findings, notes, coverage} = audit;
  // One line per form in a file, with every line number that shows it.
  const places = (file, list) => {
    const forms = new Map();
    for (const place of list) forms.set(place.form, [...(forms.get(place.form) ?? []), place.line]);
    out.push('  ' + file);
    for (const [form, at] of forms) out.push('    ' + (at.length === 1 ? 'line ' : 'lines ') + at.join(', ') + ': ' + form);
  };
  if (uses.length) {
    out.push('Runs or imports plugin code (' + plural(uses.length, 'file') + '). Project code never runs plugin code: replace each use with the project\'s own code, or delete the file.');
    for (const use of uses) places(use.file, use.places);
  }
  const exceptedFiles = exceptions.flatMap(entry => entry.files), exceptedUses = exceptedFiles.filter(file => file.uses).length;
  if (exceptions.length) {
    out.push('Declared exceptions in ' + exceptionsFile + ' (' + plural(exceptedFiles.length, 'file') + '), listed on every run' + (exceptedUses ? '. ' + plural(exceptedUses, 'file') + ' of them still ' + (exceptedUses === 1 ? 'runs or imports' : 'run or import') + ' plugin code.' : '.'));
    for (const entry of exceptions) { out.push(' ' + entry.path + ': ' + entry.reason); for (const file of entry.files) places(file.file, file.places); }
  }
  const unclearPlaces = unclear.reduce((count, file) => count + file.places.length, 0);
  if (unclear.length) {
    out.push('Not classified (' + plural(unclearPlaces, 'place') + ' in ' + plural(unclear.length, 'file') + '). The audit cannot tell what these load or run: read each one.');
    for (const file of unclear) places(file.file, file.places);
  }
  if (audit.mentions.length) {
    out.push('Mentions the plugin in prose or data (' + plural(audit.mentions.length, 'file') + '). Not a finding' + (mentions ? ':' : '; list them with --mentions.'));
    if (mentions) for (const file of audit.mentions) out.push('  ' + file);
  }
  for (const finding of findings) out.push('Fix: ' + finding);
  for (const note of notes) out.push('Note: ' + note);
  out.push('Read ' + plural(coverage.code, 'code file') + ' and ' + plural(coverage.other, 'prose or data file') + ', listed by ' + coverage.listedBy + '. Model, image and archive files are not read.' +
    (coverage.skipped.length ? ' Skipped ' + coverage.skipped.join(', ') + ' (' + plural(coverage.skippedFiles, 'file') + ').' : ''));
  if (coverage.unread.length) out.push('Did not read ' + plural(coverage.unread.length, 'file') + ': ' + coverage.unread.slice(0, 20).join(', ') + (coverage.unread.length > 20 ? ' and ' + (coverage.unread.length - 20) + ' more' : '') + '.');
  // The verdict. It never calls a project clear while a file runs or imports plugin code, declared or not.
  const using = uses.length + exceptedUses, things = findings.length ? ' ' + plural(findings.length, 'thing') + " to fix in the project's CI." : '';
  if (using) out.push('Not clear of the plugin: ' + plural(using, 'file') + ' ' + (using === 1 ? 'runs or imports' : 'run or import') + ' plugin code' + (exceptedUses ? ', ' + exceptedUses + ' under a declared exception' : '') + '.' +
    (unclearPlaces ? ' ' + plural(unclearPlaces, 'place') + ' not classified.' : '') + things + ' This audit is advice: it blocks nothing.');
  else if (unclearPlaces) out.push('No file was found that runs or imports plugin code, and ' + plural(unclearPlaces, 'place') + ' could not be classified. Read them before calling the project clear of the plugin.' + things + ' This audit is advice: it blocks nothing.');
  else out.push('In what the audit read, no project file runs or imports plugin code' + (exceptedFiles.length ? '; ' + plural(exceptedFiles.length, 'declared exception') + ' explain what it could not classify' : '') + '.' +
    (things ? things + ' This audit is advice: it blocks nothing.' : " The project's CI runs its scan and its site check."));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), skip = [];
  let project, mentions = false, bad = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skip' && args[i + 1]) skip.push(args[++i]);
    else if (args[i] === '--mentions') mentions = true;
    else if (!args[i].startsWith('--') && !project) project = args[i];
    else bad = true;
  }
  if (bad || !project || !statSync(project, {throwIfNoEntry: false})?.isDirectory()) { console.error('Usage: project-ci-audit.mjs PROJECT [--skip FOLDER]... [--mentions]'); process.exit(2); }
  for (const line of reportLines(auditProjectCi(path.resolve(project), {skip}), {mentions})) console.log(line);
}
