// Checks that the repository can be installed as a plugin marketplace by each supported host.
// The root plugin.json is the reference; host manifests and marketplace entries must agree with it.
import fs from 'node:fs';
import path from 'node:path';

export const INSTALL_FILES = Object.freeze({
  reference: 'plugin.json',
  package: 'package.json',
  claudeManifest: '.claude-plugin/plugin.json',
  codexManifest: '.codex-plugin/plugin.json',
  claudeMarketplace: '.claude-plugin/marketplace.json',
  codexMarketplace: '.agents/plugins/marketplace.json',
});
const SHARED = ['name', 'version', 'description', 'author', 'repository', 'license', 'keywords'];
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const INSTALLATION = ['AVAILABLE', 'INSTALLED_BY_DEFAULT', 'NOT_AVAILABLE'];
const AUTHENTICATION = ['ON_INSTALL', 'ON_USE'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = value => typeof value === 'string' && value.trim() !== '';
const posix = file => file.split(path.sep).join('/');
const outside = offset => offset === '..' || offset.startsWith('..' + path.sep) || path.isAbsolute(offset);

function inside(root, relative) {
  if (typeof relative !== 'string' || !relative.startsWith('./') || relative.includes('\\')) return null;
  const resolved = path.resolve(root, relative);
  const offset = path.relative(root, resolved);
  if (outside(offset)) return null;
  return posix(offset);
}

// `tracked` lists the repository-relative files Git would put in a clean clone. Without it, the files present are used.
export function checkInstallManifests(root, {tracked = null} = {}) {
  const issues = [];
  const issue = (file, code, reason) => issues.push({path: file, code, reason});
  const trackedSet = tracked && new Set(tracked);
  const shipped = file => (!trackedSet || trackedSet.has(file)) && fs.existsSync(path.join(root, file));
  const shippedUnder = directory => {
    if (trackedSet) return tracked.some(file => file.startsWith(directory + '/'));
    const full = path.join(root, directory);
    return fs.existsSync(full) && fs.statSync(full).isDirectory();
  };
  const documents = {};
  for (const [key, file] of Object.entries(INSTALL_FILES)) {
    if (!shipped(file)) { issue(file, 'missing-file', 'Commit this file so a clean clone can be installed.'); continue; }
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('not an object');
      documents[key] = parsed;
    } catch { issue(file, 'malformed-json', 'Expected a JSON object.'); }
  }
  const {reference, claudeManifest, codexManifest, claudeMarketplace, codexMarketplace} = documents;
  const result = () => ({issues, name: reference?.name, version: reference?.version, marketplace: claudeMarketplace?.name});
  if (!reference) return result();

  if (!NAME.test(reference.name ?? '')) issue(INSTALL_FILES.reference, 'invalid-name', 'Use a lowercase hyphenated plugin name.');
  if (!VERSION.test(reference.version ?? '')) issue(INSTALL_FILES.reference, 'invalid-version', 'Use a MAJOR.MINOR.PATCH version.');
  if (!text(reference.description)) issue(INSTALL_FILES.reference, 'missing-description', 'Describe the plugin.');
  const openai = reference.extensions?.['com.openai']?.interface;
  if (documents.package && (documents.package.name !== reference.name || documents.package.version !== reference.version)) {
    issue(INSTALL_FILES.package, 'version-mismatch', 'Package name and version must equal plugin.json.');
  }
  for (const [key, manifest] of [['claudeManifest', claudeManifest], ['codexManifest', codexManifest]]) {
    if (!manifest) continue;
    for (const field of SHARED) {
      if (same(manifest[field], reference[field])) continue;
      issue(INSTALL_FILES[key], field === 'version' ? 'version-mismatch' : 'manifest-drift', `Field ${field} must equal plugin.json.`);
    }
  }
  if (codexManifest) {
    const file = INSTALL_FILES.codexManifest;
    const skills = inside(root, codexManifest.skills);
    if (!skills) issue(file, 'invalid-skills-path', 'Point skills at a ./ directory inside the plugin.');
    else if (!shippedUnder(skills)) issue(file, 'missing-skills', `Skills directory ${skills} is not in a clean clone.`);
    const shown = codexManifest.interface;
    if (!shown || typeof shown !== 'object' || Array.isArray(shown)) issue(file, 'missing-interface', 'Codex lists a plugin from its interface block.');
    else {
      if (!same(shown, openai)) issue(file, 'manifest-drift', 'The interface block must equal extensions["com.openai"].interface in plugin.json.');
      for (const field of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
        if (!text(shown[field])) issue(file, 'invalid-interface', `Interface field ${field} is required.`);
      }
      if (text(shown.shortDescription) && shown.shortDescription.length > 30) issue(file, 'invalid-interface', 'shortDescription exceeds 30 characters.');
      if (!Array.isArray(shown.capabilities) || !shown.capabilities.every(text)) issue(file, 'invalid-interface', 'capabilities must be a list of names.');
      const prompts = shown.defaultPrompt;
      if (!Array.isArray(prompts) || !prompts.length || prompts.length > 3 || !prompts.every(prompt => text(prompt) && prompt.length <= 128)) {
        issue(file, 'invalid-interface', 'defaultPrompt needs one to three prompts of at most 128 characters.');
      }
    }
  }

  const single = (file, marketplace) => {
    if (marketplace.name !== reference.name + '-marketplace') issue(file, 'invalid-marketplace', `Name the marketplace ${reference.name}-marketplace.`);
    const plugins = marketplace.plugins;
    if (!Array.isArray(plugins) || plugins.length !== 1 || plugins[0]?.name !== reference.name) {
      issue(file, 'invalid-marketplace', `List exactly one plugin named ${reference.name}.`);
      return null;
    }
    if ('version' in plugins[0] && plugins[0].version !== reference.version) {
      issue(file, 'version-mismatch', 'An entry version must equal plugin.json. Omit it to use the manifest.');
    }
    return plugins[0];
  };
  const source = (file, relative, manifest) => {
    const directory = inside(root, relative);
    if (directory === null) { issue(file, 'invalid-source', 'Use a ./ path inside the repository.'); return; }
    const required = (directory ? directory + '/' : '') + manifest;
    if (!shipped(required)) issue(file, 'missing-source', `${required} is not in a clean clone, so this entry cannot be installed from Git.`);
  };
  if (claudeMarketplace) {
    const file = INSTALL_FILES.claudeMarketplace;
    if (!text(claudeMarketplace.owner?.name)) issue(file, 'invalid-marketplace', 'owner.name is required.');
    const entry = single(file, claudeMarketplace);
    if (entry) {
      source(file, entry.source, INSTALL_FILES.claudeManifest);
      for (const field of ['description', 'author', 'repository', 'license', 'keywords']) {
        if (field in entry && !same(entry[field], reference[field])) issue(file, 'manifest-drift', `Entry field ${field} must equal plugin.json.`);
      }
    }
  }
  if (codexMarketplace) {
    const file = INSTALL_FILES.codexMarketplace;
    if (!text(codexMarketplace.interface?.displayName)) issue(file, 'invalid-marketplace', 'interface.displayName is required.');
    const entry = single(file, codexMarketplace);
    if (entry) {
      if (entry.source?.source !== 'local') issue(file, 'invalid-source', 'Use a local source with a ./ path.');
      else source(file, entry.source.path, INSTALL_FILES.codexManifest);
      if (!INSTALLATION.includes(entry.policy?.installation) || !AUTHENTICATION.includes(entry.policy?.authentication)) {
        issue(file, 'invalid-marketplace', 'policy.installation and policy.authentication are required.');
      }
      if (openai && entry.category !== openai.category) issue(file, 'manifest-drift', 'Entry category must equal the interface category.');
    }
  }
  return result();
}

// Inline links, with an optional title or angle brackets, and reference definitions.
const LINKS = [
  /\]\(\s*<([^>\n]+)>(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g,
  /\]\(\s*([^)\s<]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g,
  /^ {0,3}\[[^\]\n]+\]:\s*<?([^\s>]+)>?/gm,
];
const UNREAD = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$|<!--[\s\S]*?-->|`[^`\n]*`/gm;

// Every relative link in a skill must reach a file that ships with the plugin.
export function checkPackagedReferences(root, {tracked = null, ignoredTracked = []} = {}) {
  const issues = [];
  const trackedSet = tracked && new Set(tracked);
  for (const file of ignoredTracked) {
    issues.push({path: file, code: 'ignored-file-packaged', reason: 'A committed file matches .gitignore and would ship with the plugin.'});
  }
  const skillFiles = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes: true})) {
      const relative = directory + '/' + entry.name;
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith('.md') && (!trackedSet || trackedSet.has(relative))) skillFiles.push(relative);
    }
  };
  if (fs.existsSync(path.join(root, 'skills'))) walk('skills');
  let links = 0;
  for (const file of skillFiles.sort()) {
    const body = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n').replace(UNREAD, '');
    const targets = LINKS.flatMap(pattern => [...body.matchAll(pattern)].map(match => [match.index, match[1]]))
      .sort((a, b) => a[0] - b[0]).map(([, target]) => target);
    for (const link of targets) {
      const target = link.split(/[?#]/)[0];
      // A scheme has at least two letters, so a drive letter is treated as a path and rejected below.
      if (!target || /^[a-z][a-z0-9+.-]+:/i.test(target) || target.startsWith('//')) continue;
      links++;
      let decoded = target;
      try { decoded = decodeURIComponent(target); } catch { /* keep the literal target */ }
      const resolved = path.resolve(root, path.dirname(file), decoded);
      const offset = path.relative(root, resolved);
      const packaged = posix(offset);
      if (!offset || outside(offset) || /^[a-z]:/i.test(decoded) || decoded.startsWith('/') || decoded.startsWith('\\')) {
        issues.push({path: file, code: 'reference-outside-plugin', reason: `${link} leaves the plugin directory.`});
      } else if (!fs.existsSync(resolved) || trackedSet && !(trackedSet.has(packaged) || tracked.some(item => item.startsWith(packaged + '/')))) {
        issues.push({path: file, code: 'reference-not-packaged', reason: `${link} is not in a clean clone.`});
      }
    }
  }
  return {issues, files: skillFiles.length, links};
}
