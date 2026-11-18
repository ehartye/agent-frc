import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readViewerBytes } from '../../scripts/native-viewer-cli.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function argumentsFor(args) {
  const files = { overrides: [] };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], file = args[i + 1];
    if (!file || file.startsWith('--')) throw Error('Missing file for ' + flag);
    if (flag === '--override') {
      if (files.overrides.length === 32) throw Error('Maximum 32 overrides');
      files.overrides.push(file);
      continue;
    }
    if (!['--base', '--source', '--trajectory'].includes(flag)) throw Error('Unknown option ' + flag);
    const role = flag.slice(2);
    if (files[role]) throw Error('Repeated ' + role + ' role');
    files[role] = file;
  }
  for (const role of ['base', 'source', 'trajectory']) {
    if (!files[role]) throw Error('Missing required ' + role + ' role');
  }
  return files;
}

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function configDocument(file) {
  const bytes = readViewerBytes(file);
  return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), sha256: sha256(bytes) };
}

function checkSettings(values, isBase) {
  if (!isRecord(values) || !Object.keys(values).length) throw Error('Expected nonempty base or override changes');
  for (const [key, value] of Object.entries(values)) {
    const valid = (key === 'brakeEnabled' && typeof value === 'boolean') ||
      (key === 'speedLimitMps' && Number.isFinite(value) && value >= 0);
    if (!valid) throw Error('Unsupported base or override setting: ' + key);
  }
  if (isBase && Object.keys(values).length !== 2) throw Error('Incomplete base configuration');
}

try {
  const files = argumentsFor(process.argv.slice(2));
  const base = configDocument(files.base);
  checkSettings(base.value, true);
  const settings = { ...base.value };
  const overrides = [];
  const ids = new Set();
  for (const file of files.overrides) {
    const { value, sha256: digest } = configDocument(file);
    if (!isRecord(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'changes') ||
        typeof value.id !== 'string' || !value.id.trim() || value.id.length > 256 || ids.has(value.id)) {
      throw Error('Override requires a unique id and changes');
    }
    checkSettings(value.changes, false);
    Object.assign(settings, value.changes);
    ids.add(value.id);
    overrides.push({ id: value.id, sha256: digest });
  }
  const effective = Object.fromEntries(Object.keys(settings).sort().map(key => [key, settings[key]]));
  const inputs = {
    sourceReceipt: { sha256: await hashFile(files.source) },
    trajectoryReceipt: { sha256: await hashFile(files.trajectory) }
  };
  console.log(JSON.stringify({ schema: 'agent-frc/example-input-roles@1', inputs,
    baseSha256: base.sha256, overrides, effective, effectiveSha256: sha256(JSON.stringify(effective)) }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
