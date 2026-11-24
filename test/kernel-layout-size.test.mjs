/**
 * @lane edit
 * @subject scripts/layout_check.py
 * @subject scripts/kernel_layout/verdict.py
 * @subject scripts/stage_preliminary_review.py
 * @subject scripts/package_view.py
 * @subject examples/design-source/create.py
 */
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url), text = name => readFileSync(new URL(name, root), 'utf8');
// The check built on the design library, and the starter that writes its inputs. The earlier check is not held to these rules.
const files = [...readdirSync(new URL('scripts/kernel_layout/', root)).filter(name => name.endsWith('.py')).map(name => 'scripts/kernel_layout/' + name),
  'scripts/layout_check.py', 'examples/design-source/create.py'];
const MODULE_LINES = 600, FUNCTION_LINES = 120;

/** The longest function of a Python source, as {name, lines}: a def runs to the next line indented no deeper than it. */
function longestFunction(source) {
  const lines = source.split(/\r?\n/);
  let longest = {name: null, lines: 0};
  lines.forEach((line, start) => {
    const found = /^(\s*)def (\w+)/.exec(line);
    if (!found) return;
    let end = start + 1;
    while (end < lines.length && (!lines[end].trim() || lines[end].search(/\S/) > found[1].length)) end++;
    while (!lines[end - 1].trim()) end--;
    if (end - start > longest.lines) longest = {name: found[2], lines: end - start};
  });
  return longest;
}

test('no module of the library-based check passes 600 lines and no function passes 120', () => {
  // Control: a function one line too long is caught.
  assert.equal(longestFunction('def long():\n' + '    pass\n'.repeat(FUNCTION_LINES)).lines, FUNCTION_LINES + 1);
  for (const name of files) {
    const source = text(name), count = source.split(/\r?\n/).length;
    assert.ok(count <= MODULE_LINES, `${name} has ${count} lines; split it into two modules with one job each`);
    if (!name.endsWith('.py')) continue;
    const worst = longestFunction(source);
    assert.ok(worst.lines <= FUNCTION_LINES, `${name}: ${worst.name} has ${worst.lines} lines; split it`);
  }
});

// The plugin's own geometry and measuring modules, from the detailed-design path, and the CAD kernel itself, OCP.
const geometry = ['OCP', 'mechanical_readiness', 'mechanical_motion', 'layout_attachment', 'showcase_contacts', 'payload_compression', 'package_mesh',
  'component_shape', 'preliminary_design', 'placed_separation'];

/**
 * Every module a Python file loads, directly or through the plugin modules it loads, each with the chain that reaches it.
 * A module under `scripts` is followed into; any other is a leaf named by its top package. An import inside a function
 * counts: it loads when the function runs. Returns a Map of module name to chain, such as
 * ['kernel_layout/review.py', 'mechanical_readiness', 'showcase_contacts', 'OCP'].
 */
function imports(scripts, entry) {
  const found = new Map(), seen = new Set();
  const local = dotted => {
    const file = path.join(scripts, ...dotted.split('.'));
    return existsSync(file + '.py') ? file + '.py' : existsSync(path.join(file, '__init__.py')) ? path.join(file, '__init__.py') : null;
  };
  const visit = (file, chain) => {
    if (seen.has(file)) return;
    seen.add(file);
    // A parenthesised name list may span lines.
    const source = readFileSync(file, 'utf8').replace(/\(([^)]*)\)/g, (_, inner) => '(' + inner.replace(/\s+/g, ' ') + ')');
    const here = path.relative(scripts, path.dirname(file)).split(path.sep).filter(Boolean), loads = [];
    for (const [, names] of source.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)/gm)) for (const name of names.split(',')) loads.push(name.trim().split(/\s+/)[0]);
    for (const [, dots, from, names] of source.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+\(?([\w., \t*]+)/gm)) {
      const base = dots ? [...here.slice(0, here.length - (dots.length - 1)), ...(from ? from.split('.') : [])].join('.') : from;
      loads.push(base);
      // A name imported from a package may be one of its modules.
      for (const name of names.split(',').map(n => n.trim().split(/\s+/)[0]).filter(n => n && n !== '*')) if (local(base + '.' + name)) loads.push(base + '.' + name);
    }
    for (const dotted of loads.filter(Boolean)) {
      const parts = dotted.split('.');
      // Loading a.b loads the package a first.
      for (let i = 1; i <= parts.length; i++) {
        const name = parts.slice(0, i).join('.'), target = local(name), key = target ? name : parts[0];
        if (!found.has(key)) found.set(key, [...chain, key]);
        if (!target) break;
        visit(target, [...chain, name]);
      }
    }
  };
  visit(entry, [path.relative(scripts, entry).split(path.sep).join('/')]);
  return found;
}

test('the library-based check holds no geometry or measuring code of its own, directly or through what it imports', () => {
  // Control: an import two modules away, inside a function, is caught with its chain; without it nothing is.
  const temp = mkdtempSync(path.join(os.tmpdir(), 'imports-'));
  try {
    mkdirSync(path.join(temp, 'pkg'));
    writeFileSync(path.join(temp, 'pkg', '__init__.py'), '');
    writeFileSync(path.join(temp, 'pkg', 'entry.py'), 'from . import helper\n');
    writeFileSync(path.join(temp, 'pkg', 'helper.py'), 'def run():\n    from shapes import (\n        cut,\n    )\n');
    writeFileSync(path.join(temp, 'shapes.py'), 'import json\nfrom OCP.gp import gp_Pnt\n');
    assert.deepEqual(imports(temp, path.join(temp, 'pkg', 'entry.py')).get('OCP'), ['pkg/entry.py', 'pkg.helper', 'shapes', 'OCP']);
    writeFileSync(path.join(temp, 'pkg', 'helper.py'), 'def run():\n    import json\n');
    assert.equal(imports(temp, path.join(temp, 'pkg', 'entry.py')).has('OCP'), false);
  } finally { rmSync(temp, {recursive: true, force: true}); }
  const scripts = fileURLToPath(new URL('scripts/', root));
  // The preliminary path: the check, its package and the staging command. The starter runs them; it imports none.
  for (const name of [...files.filter(name => name.startsWith('scripts/')), 'scripts/stage_preliminary_review.py']) {
    const loaded = imports(scripts, fileURLToPath(new URL(name, root)));
    const reached = geometry.filter(module => loaded.has(module)).map(module => loaded.get(module).join(' -> '));
    assert.deepEqual(reached, [], `${name} loads geometry or measuring code. Ask the design library for what is missing instead of building or measuring here`);
  }
  // Only the library's public calls are used: no module reaches into how it builds or wraps the CAD kernel.
  const internals = /frc_design_kernel\.(builder|kernel)\b/;
  for (const name of files.filter(name => name.endsWith('.py')))
    assert.doesNotMatch(text(name), internals, `${name} imports the design library's internals. Use its public calls, or ask for one`);
});
