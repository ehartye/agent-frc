/**
 * @lane merge
 * @subject scripts/branch-scan.mjs
 * @subject templates/preliminary-review/review.html
 */
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {scanText, scanTree} from '../scripts/branch-scan.mjs';

const script = fileURLToPath(new URL('../scripts/branch-scan.mjs', import.meta.url));
// Assembled at run time so this file holds no literal the scan would report.
const home = (...parts) => ['C:', 'Users', ...parts].join('\\');
const kinds = text => scanText(text).map(f => f.kind);

test('reports a personal home directory in every common spelling', () => {
  const user = 'pat' + 'smith';
  for (const sample of [home(user, 'repos', 'robot'), ['C:', 'Users', user, 'x'].join('/'), ['C:', 'Users', user, 'x'].join('\\\\'),
    '/c/Users/' + user + '/x', '/mnt/c/Users/' + user + '/x', '/Users/' + user + '/Documents', '/home/' + user + '/robot',
    '"cwd": "' + ['C:', 'Users', user].join('\\\\') + '"', 'cd /home/' + user, ['c:', 'users', user, 'x'].join('/'), ['C:', 'USERS', user, 'x'].join('\\'),
    'C--Users-' + user + '-repos-robot', 'file:///c%3A/Users/' + user + '/x',
    ['C:', 'Users', 'Pat Smith', 'x'].join('/')]) {
    assert.deepEqual(kinds('trace written to ' + sample), ['machine-path'], sample);
  }
});

test('accepts placeholders, runner homes and paths that are not home directories', () => {
  for (const sample of ['C:/Users/name/notes.md', 'C:\\Users\\<you>\\robot', '/home/runner/work/project', '/Users/USERNAME/robot',
    'C:/Users/%USERNAME%/x', '/home/$USER/x', 'https://example.org/home/page/index.html', 'docs/Users/guide.md', '/home/user/project',
    '/home/lvuser/deploy/', '/home/ubuntu/x', 'C:/Users/your_name/x', '/Users/YOUR_USER/x', 'GET /Users/42/roles']) {
    assert.deepEqual(kinds(sample), [], sample);
  }
});

test('reports credentials without echoing them', () => {
  const samples = {
    'private-key': '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----',
    'github-token': 'gh' + 'p_' + 'a'.repeat(36),
    'aws-access-key': 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
    'api-key': 's' + 'k-ant-' + 'b'.repeat(40),
    'assigned-secret': 'pass' + 'word = "' + 'hunter2hunter2hunter2' + '"'
  };
  for (const name of ['DB_PASS' + 'WORD', 'MY_API' + '_KEY', 'aws_sec' + 'ret_access_key'])
    assert.deepEqual(kinds(name + '="' + 'q7'.repeat(10) + '"'), ['assigned-secret'], name);
  for (const [kind, sample] of Object.entries(samples)) {
    const [finding, ...rest] = scanText('line one\n  ' + sample + '\n');
    assert.equal(finding?.kind, kind);
    assert.equal(finding.line, 2);
    assert.equal(rest.length, 0);
    assert.ok(!finding.text.includes(sample.slice(-12)), 'the report must not repeat the credential');
  }
});

test('accepts secret references and short or templated values', () => {
  for (const sample of ['token: ${{ secrets.DEPLOY_TOKEN }}', 'password = "<your password>"', 'password: "your-password-here"', 'api_key = "short"', 'secret: "$SECRET_FROM_ENV_VALUE"',
    'Keep the public key in the repository', '-----BEGIN PUBLIC KEY-----']) {
    assert.deepEqual(kinds(sample), [], sample);
  }
});

function repository(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'branch-scan-'));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    writeFileSync(path.join(root, name), body);
  }
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {stdio: 'ignore'});
  git('init', '-q');
  git('add', '-A');
  return root;
}

test('scans tracked text files, skips binaries and honours the ignore list', t => {
  const leak = 'log: ' + home('pat' + 'smith', 'robot') + '\n';
  const root = repository({
    'notes/run.log': leak,
    'cad/part.bin': Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(leak)]),
    'fixtures/sample.txt': leak,
    'logs/shell.log': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(leak, 'utf16le')]),
    '.branch-scan.json': JSON.stringify({ignore: ['fixtures/']})
  });
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(path.join(root, 'later.txt'), leak); // not tracked
  const result = scanTree(root);
  assert.deepEqual(result.findings.map(f => [f.file, f.line, f.kind]), [['logs/shell.log', 1, 'machine-path'], ['notes/run.log', 1, 'machine-path']]);
  assert.equal(result.skippedBinary, 1);
  const run = spawnSync(process.execPath, [script, root], {encoding: 'utf8'});
  assert.equal(run.status, 1);
  assert.match(run.stderr, /notes\/run\.log:1: machine-path/);
});

test('passes a clean tree and scans a folder that is not a repository', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'branch-scan-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(path.join(root, 'README.md'), 'Run it from the project root.\n');
  const run = spawnSync(process.execPath, [script, root], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /"files": 1/);
});

test('rejects an ignore list that is not a list of paths', t => {
  const root = repository({'.branch-scan.json': JSON.stringify({ignore: 'all'}), 'a.txt': 'a\n'});
  t.after(() => rmSync(root, {recursive: true, force: true}));
  assert.throws(() => scanTree(root), /ignore/);
});
