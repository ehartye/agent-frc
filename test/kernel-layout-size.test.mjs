/**
 * @lane edit
 * @subject scripts/layout_check.py
 * @subject scripts/kernel_layout/review.py
 * @subject examples/design-source/create.py
 */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {test} from 'node:test';

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

test('the library-based check holds no geometry or measuring code of its own', () => {
  // The design library builds, measures and tessellates. Nothing here is excused.
  const allowed = {};
  // Only the library's public calls are used: no module reaches into how it builds or wraps the CAD kernel.
  const internals = /frc_design_kernel\.(builder|kernel)\b/;
  const own = /^\s*(?:from|import)\s+(OCP|mechanical_motion|layout_attachment|showcase_contacts|payload_compression|package_mesh|component_shape|preliminary_design)\b/gm;
  assert.equal([...'import OCP.gp\nfrom mechanical_motion import evaluate\n'.matchAll(own)].length, 2, 'control: both imports are caught');
  for (const name of files.filter(name => name.endsWith('.py'))) {
    const found = [...text(name).matchAll(own)].map(match => match[1]).filter(module => !(allowed[name] ?? []).includes(module));
    assert.deepEqual(found, [], `${name} imports ${found.join(', ')}. Ask the design library for what is missing instead of building or measuring here`);
    assert.doesNotMatch(text(name), internals, `${name} imports the design library's internals. Use its public calls, or ask for one`);
  }
});
