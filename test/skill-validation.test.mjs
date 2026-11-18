import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateSkills } from '../scripts/skill-validation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const valid = '---\nname: example\ndescription: "A useful skill."\n---\n# Example\n';
const entry = (body = valid, folder = 'example') => ({ path: `skills/${folder}/SKILL.md`, folder, body });
const codes = (body) => validateSkills([entry(body)]).issues.map(issue => issue.code);

test('LF and CRLF metadata produce identical results without changing input', () => {
  const lf = entry();
  const crlf = entry(valid.replaceAll('\n', '\r\n'));
  const original = structuredClone([lf, crlf]);
  assert.deepEqual(validateSkills([lf]), validateSkills([crlf]));
  assert.deepEqual(validateSkills([lf]).issues, []);
  assert.equal(validateSkills([lf]).skills[0].name, 'example');
  assert.deepEqual([lf, crlf], original);
});

test('missing and malformed frontmatter have specific diagnostics', () => {
  assert.deepEqual(codes('# No metadata'), ['missing-frontmatter']);
  assert.deepEqual(codes(valid.replace('\n---\n#', '\n#')), ['invalid-frontmatter']);
  assert.deepEqual(codes(valid.replace('name: example\ndescription: "A useful skill."', 'description: "A useful skill."\nname: example')), ['invalid-frontmatter']);
  assert.deepEqual(codes(valid.replace('\n---\n#', '\nextra: true\n---\n#')), ['invalid-frontmatter']);
  assert.deepEqual(codes(valid.replaceAll('\n', '\r')), ['invalid-frontmatter']);
});

test('metadata validation does not interpret the Markdown body', () => {
  assert.deepEqual(codes(valid + 'arbitrary\rbody\nname: ignored\n---'), []);
});

test('missing, invalid and folder-mismatched names are distinguishable', () => {
  assert.deepEqual(codes(valid.replace('name: example\n', '')), ['missing-name']);
  assert.deepEqual(codes(valid.replace('name: example', 'name: ')), ['missing-name']);
  assert.deepEqual(codes(valid.replace('name: example', 'name: Example!')), ['invalid-name']);
  assert.deepEqual(codes(valid.replace('name: example', 'name: another')), ['name-folder-mismatch']);
});

test('description diagnostics distinguish missing data from invalid JSON', () => {
  assert.deepEqual(codes(valid.replace('description: "A useful skill."\n', '')), ['missing-description']);
  assert.deepEqual(codes(valid.replace('description: "A useful skill."', 'description: ')), ['missing-description']);
  assert.deepEqual(codes(valid.replace('"A useful skill."', 'not-json')), ['invalid-description']);
});

test('duplicate names identify both relative paths and are deterministic', () => {
  const a = entry();
  const b = entry(valid, 'other');
  const result = validateSkills([b, a]);
  assert.deepEqual(result, validateSkills([a, b]));
  const duplicate = result.issues.find(issue => issue.code === 'duplicate-name');
  assert.equal(duplicate.path, 'skills/other/SKILL.md');
  assert.match(duplicate.reason, /skills\/example\/SKILL\.md/);
  for (const issue of result.issues) {
    assert.ok(issue.path.startsWith('skills/'));
    assert.ok(issue.reason.length > 0);
  }
});

function fixture(t) {
  const base = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(base, 'agent-frc-skills-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), base);
    assert.ok(path.basename(dir).startsWith('agent-frc-skills-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  for (const file of ['scripts/validate.mjs', 'scripts/skill-validation.mjs', 'plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, 'skills/example'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills/example/SKILL.md'), valid.replaceAll('\n', '\r\n'));
  return { dir, run: () => spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: dir, encoding: 'utf8' }) };
}

test('CLI accepts CRLF and rejects malformed metadata without rewriting files', t => {
  const { dir, run } = fixture(t);
  const file = path.join(dir, 'skills/example/SKILL.md');
  const before = fs.readFileSync(file);
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).skills, 1);
  assert.deepEqual(fs.readFileSync(file), before);
  fs.writeFileSync(file, valid.replace('"A useful skill."', 'bad-json'));
  const badBefore = fs.readFileSync(file);
  const bad = run();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /skills\/example\/SKILL\.md: invalid-description:/);
  assert.doesNotMatch(bad.stderr, /Invalid skill|SyntaxError/);
  assert.deepEqual(fs.readFileSync(file), badBefore);
});

test('CLI retains manifest schema, subtitle and compatibility checks', t => {
  const { dir, run } = fixture(t);
  const file = path.join(dir, 'plugin.json');
  const original = fs.readFileSync(file, 'utf8');
  const manifest = JSON.parse(original);
  fs.writeFileSync(file, JSON.stringify({ ...manifest, $schema: 'invalid' }));
  assert.match(run().stderr, /manifest schema/);
  fs.writeFileSync(file, JSON.stringify({ ...manifest, extensions: { 'com.openai': { interface: { shortDescription: 'x'.repeat(31) } } } }));
  assert.match(run().stderr, /Subtitle exceeds 30 characters/);
  fs.writeFileSync(file, original);
  const compat = path.join(dir, '.codex-plugin/plugin.json');
  const originalCompat = JSON.parse(fs.readFileSync(compat, 'utf8'));
  fs.writeFileSync(compat, JSON.stringify({ ...originalCompat, version: '99.0.0' }));
  assert.match(run().stderr, /Compatibility mismatch/);
});
