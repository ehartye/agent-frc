import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, 'artifacts');
const target = path.join(artifacts, 'local-plugin');
const marker = '.agent-frc-stage.json';
const schema = 'agent-frc/local-stage@1';
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const assert = (condition, message) => { if (!condition) throw Error(message); };

function contained(base, candidate) {
  const relative = path.relative(base, candidate);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Path escapes staging directory');
}

function ordinaryDirectory(directory) {
  if (!fs.existsSync(directory)) return;
  const stat = fs.lstatSync(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Staging directories must not be links');
}

function cleanSource() {
  assert(git('status', '--porcelain', '--untracked-files=no') === '', 'Commit tracked changes before staging the plugin');
}

cleanSource();
const head = git('rev-parse', 'HEAD');
ordinaryDirectory(artifacts);
ordinaryDirectory(target);
if (fs.existsSync(target)) {
  const receipt = JSON.parse(fs.readFileSync(path.join(target, marker), 'utf8'));
  assert(receipt.schema === schema, 'Refusing to replace an unmanaged staging directory');
}
fs.mkdirSync(artifacts, {recursive: true});
const pending = fs.mkdtempSync(path.join(artifacts, '.local-plugin-'));
const previous = path.join(artifacts, `.local-plugin-previous-${randomUUID()}`);
contained(artifacts, pending);
contained(artifacts, previous);
contained(artifacts, target);
let promoted = false;
let movedPrevious = false;
try {
  const files = git('ls-files', '-z').split('\0').filter(Boolean)
    .filter(file => !file.startsWith('.agents/') && !file.startsWith('.codex/') && !file.startsWith('.github/'));
  const inventory = [];
  for (const file of files) {
    const source = path.resolve(root, file);
    const destination = path.resolve(pending, file);
    contained(root, source);
    contained(pending, destination);
    assert(!file.startsWith('artifacts/'), 'Generated artifacts must not be tracked');
    let ancestor = source;
    while (ancestor !== root) {
      assert(!fs.lstatSync(ancestor).isSymbolicLink(), 'Linked source paths are not supported');
      ancestor = path.dirname(ancestor);
    }
    assert(fs.lstatSync(source).isFile(), 'Only regular tracked files can be packaged');
    const bytes = fs.readFileSync(source);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, bytes);
    inventory.push({path: file, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  cleanSource();
  assert(git('rev-parse', 'HEAD') === head, 'Source revision changed during staging');
  fs.writeFileSync(path.join(pending, marker), JSON.stringify({schema, sourceHead: head, files: inventory}, null, 2) + '\n');
  if (fs.existsSync(target)) {
    fs.renameSync(target, previous);
    movedPrevious = true;
  }
  fs.renameSync(pending, target);
  promoted = true;
  if (movedPrevious) fs.rmSync(previous, {recursive: true});
  console.log(JSON.stringify({sourceHead: head, path: 'artifacts/local-plugin', files: inventory.length}));
} catch (error) {
  if (!promoted && movedPrevious && !fs.existsSync(target)) fs.renameSync(previous, target);
  throw error;
} finally {
  if (!promoted && fs.existsSync(pending)) fs.rmSync(pending, {recursive: true});
}
