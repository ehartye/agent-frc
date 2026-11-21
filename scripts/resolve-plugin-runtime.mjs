import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

function manifest(root, hostDirectory = '.codex-plugin') {
  const file = path.join(root, hostDirectory, 'plugin.json');
  const description = JSON.parse(readFileSync(file, 'utf8'));
  if (description.name !== 'agent-frc' || typeof description.version !== 'string' || !description.version) {
    throw Error('The selected directory must contain the Agent FRC plugin manifest.');
  }
  return description;
}

function simpleName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(value);
}

export function activeRuntime(inventory, marketplace, cacheDirectory) {
  if (!simpleName(marketplace)) throw Error('Expected a marketplace name.');
  const id = 'agent-frc@' + marketplace;
  const matches = inventory.installed.filter(p => p.pluginId === id && p.installed && p.enabled);
  if (matches.length !== 1) throw Error('Expected one installed and enabled ' + id + ' in the current host inventory.');
  const row = matches[0];
  if (row.name !== 'agent-frc' || row.marketplaceName !== marketplace || !simpleName(row.version)) {
    throw Error('Plugin identity or version is missing from host inventory.');
  }
  const root = realpathSync(path.join(cacheDirectory, marketplace, row.name, row.version));
  if (manifest(root).version !== row.version) throw Error('Cache manifest disagrees with host inventory. Read the inventory again.');
  return {mode: 'active', pluginId: id, version: row.version, root};
}

export function pinnedRuntime(directory, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Supply the full reviewed Git commit.');
  const root = realpathSync(directory);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();
  if (realpathSync(git('rev-parse', '--show-toplevel')) !== root || git('rev-parse', 'HEAD') !== revision) {
    throw Error('Pinned checkout or reviewed commit unavailable.');
  }
  if (git('status', '--porcelain', '--untracked-files=normal', '--ignore-submodules=none')) {
    throw Error('Pinned checkout has pending changes.');
  }
  git('ls-files', '--error-unmatch', '.codex-plugin/plugin.json');
  return {mode: 'pinned', revision, version: manifest(root).version, root};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, selected, extra, ...rest] = process.argv.slice(2);
    let result;
    if (mode === 'active' && selected && !rest.length) {
      const cache = extra ?? path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugins', 'cache');
      result = activeRuntime(JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, '')), selected, cache);
    } else if (mode === 'claude' && selected === undefined) {
      const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
      const {name, version} = manifest(root, '.claude-plugin');
      result = {mode: 'claude', name, version, root};
    } else if (mode === 'pinned' && selected && extra && !rest.length) {
      result = pinnedRuntime(selected, extra);
    } else {
      throw Error('Usage: resolve-plugin-runtime.mjs active MARKETPLACE [CACHE_DIRECTORY] < inventory.json | claude | pinned CHECKOUT FULL_COMMIT');
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
