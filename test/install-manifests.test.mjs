import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import {INSTALL_FILES, checkInstallManifests, checkPackagedReferences} from '../scripts/install-manifests.mjs';

const repository = fileURLToPath(new URL('..', import.meta.url));
const files = Object.values(INSTALL_FILES);

// An invented one-skill plugin that carries the repository's real install files.
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'frc-install-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    cpSync(path.join(repository, file), path.join(root, file));
  }
  mkdirSync(path.join(root, 'skills', 'sample', 'references'), {recursive: true});
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs', 'guide.md'), '# Guide\n');
  writeFileSync(path.join(root, 'skills', 'sample', 'SKILL.md'),
    '---\nname: sample\ndescription: "Sample."\n---\nRead the [guide](../../docs/guide.md#top) and the [docs folder](../../docs).\nSee `[inline](../../missing.md)` and <https://example.invalid/>.\n');
  const tracked = [...files, 'docs/guide.md', 'skills/sample/SKILL.md'];
  return {root, tracked};
}
const edit = (root, file, change) => {
  const document = JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  change(document);
  writeFileSync(path.join(root, file), JSON.stringify(document));
};
const codes = result => result.issues.map(issue => `${issue.path}: ${issue.code}`);

test('the committed install files describe one plugin for both hosts', t => {
  const {root, tracked} = fixture(t);
  const result = checkInstallManifests(root, {tracked});
  assert.deepEqual(result.issues, []);
  assert.equal(result.name, 'agent-frc');
  assert.equal(result.marketplace, JSON.parse(readFileSync(path.join(root, INSTALL_FILES.codexMarketplace), 'utf8')).name);
  assert.deepEqual(checkInstallManifests(root).issues, []);
});

test('each install file must be committed and parse as an object', t => {
  for (const file of files) {
    const {root, tracked} = fixture(t);
    assert.ok(codes(checkInstallManifests(root, {tracked: tracked.filter(item => item !== file)})).includes(`${file}: missing-file`), file);
    rmSync(path.join(root, file));
    assert.ok(codes(checkInstallManifests(root)).includes(`${file}: missing-file`), file);
    writeFileSync(path.join(root, file), '[');
    assert.ok(codes(checkInstallManifests(root, {tracked})).includes(`${file}: malformed-json`), file);
  }
});

test('a version or field that differs from plugin.json is reported in the file that drifted', t => {
  for (const key of ['package', 'claudeManifest', 'codexManifest']) {
    const {root, tracked} = fixture(t);
    edit(root, INSTALL_FILES[key], document => { document.version = '0.0.1'; });
    assert.deepEqual(codes(checkInstallManifests(root, {tracked})), [`${INSTALL_FILES[key]}: version-mismatch`]);
  }
  for (const key of ['claudeMarketplace', 'codexMarketplace']) {
    const {root, tracked} = fixture(t);
    edit(root, INSTALL_FILES[key], document => { document.plugins[0].version = '0.0.1'; });
    assert.deepEqual(codes(checkInstallManifests(root, {tracked})), [`${INSTALL_FILES[key]}: version-mismatch`]);
  }
  const {root, tracked} = fixture(t);
  edit(root, INSTALL_FILES.claudeManifest, document => { document.description = 'Another plugin.'; });
  edit(root, INSTALL_FILES.codexManifest, document => { document.interface.displayName = 'Another name'; });
  edit(root, INSTALL_FILES.claudeMarketplace, document => { document.plugins[0].description = 'Another plugin.'; });
  edit(root, INSTALL_FILES.codexMarketplace, document => { document.name = 'another-marketplace'; });
  assert.deepEqual(codes(checkInstallManifests(root, {tracked})), [
    `${INSTALL_FILES.claudeManifest}: manifest-drift`,
    `${INSTALL_FILES.codexManifest}: manifest-drift`,
    `${INSTALL_FILES.claudeMarketplace}: manifest-drift`,
    `${INSTALL_FILES.codexMarketplace}: invalid-marketplace`,
  ]);
});

test('Codex needs a skills path and a complete interface block', t => {
  const cases = [
    [document => { delete document.interface; }, 'missing-interface'],
    [document => { document.interface.shortDescription = 'x'.repeat(31); }, 'invalid-interface'],
    [document => { document.interface.defaultPrompt = ['a', 'b', 'c', 'd']; }, 'invalid-interface'],
    [document => { delete document.interface.longDescription; }, 'invalid-interface'],
    [document => { document.skills = '../skills/'; }, 'invalid-skills-path'],
    [document => { document.skills = './absent/'; }, 'missing-skills'],
  ];
  for (const [change, code] of cases) {
    const {root, tracked} = fixture(t);
    edit(root, INSTALL_FILES.codexManifest, change);
    assert.ok(codes(checkInstallManifests(root, {tracked})).includes(`${INSTALL_FILES.codexManifest}: ${code}`), code);
  }
});

test('a marketplace source must be a committed plugin directory inside the repository', t => {
  const claude = INSTALL_FILES.claudeMarketplace;
  const codex = INSTALL_FILES.codexMarketplace;
  const cases = [
    [claude, document => { document.plugins[0].source = './artifacts/local-plugin'; }, 'missing-source'],
    [codex, document => { document.plugins[0].source.path = './artifacts/local-plugin'; }, 'missing-source'],
    [claude, document => { document.plugins[0].source = '../elsewhere'; }, 'invalid-source'],
    [codex, document => { document.plugins[0].source.path = 'C:/elsewhere'; }, 'invalid-source'],
    [codex, document => { document.plugins[0].source = {source: 'url', url: 'https://example.invalid/plugin.git'}; }, 'invalid-source'],
    [claude, document => { document.plugins.push({name: 'second', source: './'}); }, 'invalid-marketplace'],
    [claude, document => { delete document.owner; }, 'invalid-marketplace'],
    [codex, document => { delete document.plugins[0].policy; }, 'invalid-marketplace'],
    [codex, document => { document.plugins[0].name = 'renamed'; }, 'invalid-marketplace'],
    [claude, document => { document.name = 'agent-frc-other'; }, 'invalid-marketplace'],
  ];
  for (const [file, change, code] of cases) {
    const {root, tracked} = fixture(t);
    edit(root, file, change);
    assert.deepEqual(codes(checkInstallManifests(root, {tracked})), [`${file}: ${code}`]);
  }
  // A staged export that exists on disk but is not committed cannot serve a clone.
  const {root, tracked} = fixture(t);
  for (const file of [INSTALL_FILES.claudeManifest, INSTALL_FILES.codexManifest]) {
    mkdirSync(path.dirname(path.join(root, 'artifacts/local-plugin', file)), {recursive: true});
    cpSync(path.join(root, file), path.join(root, 'artifacts/local-plugin', file));
  }
  edit(root, codex, document => { document.plugins[0].source.path = './artifacts/local-plugin'; });
  assert.deepEqual(codes(checkInstallManifests(root, {tracked})), [`${codex}: missing-source`]);
  assert.deepEqual(codes(checkInstallManifests(root)), []);
});

test('skill links must reach committed files inside the plugin', t => {
  const {root, tracked} = fixture(t);
  const skill = 'skills/sample/SKILL.md';
  assert.deepEqual(checkPackagedReferences(root, {tracked}), {issues: [], files: 1, links: 2});
  assert.deepEqual(codes(checkPackagedReferences(root, {tracked: tracked.filter(file => file !== 'docs/guide.md')})),
    [`${skill}: reference-not-packaged`, `${skill}: reference-not-packaged`]);
  writeFileSync(path.join(root, skill), '[outside](../../../private/notes.md) [absent](references/absent.md)\n');
  assert.deepEqual(codes(checkPackagedReferences(root, {tracked})), [`${skill}: reference-outside-plugin`, `${skill}: reference-not-packaged`]);
  assert.deepEqual(codes(checkPackagedReferences(root)), [`${skill}: reference-outside-plugin`, `${skill}: reference-not-packaged`]);
  writeFileSync(path.join(root, skill), [
    "[titled](references/absent.md 'Title') [spaced](<references/absent file.md>) [query](../../docs/guide.md?plain=1)",
    '[drive](C:/Users/name/notes.md) [rooted](/etc/notes.md)', '[later]: references/absent.md', '~~~', '[fenced](references/absent.md)', '~~~',
    '<!-- [hidden](references/absent.md) -->', ''].join('\n'));
  assert.deepEqual(checkPackagedReferences(root, {tracked}).issues.map(issue => issue.code), ['reference-not-packaged', 'reference-not-packaged',
    'reference-outside-plugin', 'reference-outside-plugin', 'reference-not-packaged']);
  rmSync(path.join(root, 'docs', 'guide.md'));
  writeFileSync(path.join(root, skill), '[deleted](../../docs/guide.md)\n');
  assert.deepEqual(codes(checkPackagedReferences(root, {tracked})), [`${skill}: reference-not-packaged`]);
  assert.deepEqual(codes(checkPackagedReferences(root, {tracked: [skill], ignoredTracked: ['artifacts/private.json']})).slice(0, 1),
    ['artifacts/private.json: ignored-file-packaged']);
});

test('validation fails for a clone whose marketplace points at an uncommitted export', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'frc-install-clone-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')));
  const git = (...args) => execFileSync('git', args, {cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  for (const file of [...files, '.gitignore', 'references/public-sources.json', 'scripts/validate.mjs', 'scripts/install-manifests.mjs',
    'scripts/skill-validation.mjs', 'scripts/check-design-references.mjs', 'scripts/season-terms.mjs', 'scripts/season-terms.json', 'scripts/branch-scan.mjs', 'scripts/mojibake.mjs']) {
    mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    cpSync(path.join(repository, file), path.join(root, file));
  }
  for (const folder of ['docs', 'examples', 'templates', 'worksheets', 'skills/frc-setup']) mkdirSync(path.join(root, folder), {recursive: true});
  writeFileSync(path.join(root, 'README.md'), '# Sample\n');
  writeFileSync(path.join(root, 'skills', 'frc-setup', 'SKILL.md'),
    '---\nname: frc-setup\ndescription: "Sample."\n---\nRead the [overview](../../README.md).\n');
  git('init', '-q');
  git('add', '-A');
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts', 'validate.mjs')], {env, encoding: 'utf8'});
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).cleanCloneChecked, true);
  edit(root, INSTALL_FILES.codexMarketplace, document => { document.plugins[0].source.path = './artifacts/local-plugin'; });
  for (const file of [INSTALL_FILES.codexManifest]) {
    mkdirSync(path.dirname(path.join(root, 'artifacts/local-plugin', file)), {recursive: true});
    cpSync(path.join(root, file), path.join(root, 'artifacts/local-plugin', file));
  }
  const second = run();
  assert.equal(second.status, 1);
  assert.match(second.stderr, /\.agents\/plugins\/marketplace\.json: missing-source/);
});
