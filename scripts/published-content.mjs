/**
 * What a published folder holds that nothing leads to. Publishing a folder puts every file in it online, so a
 * withdrawn viewer or a model that was never published goes out with the rest. This lists such content as advice
 * for the coding agent: it blocks nothing, and a file that is reached only by a typed address is the project's call.
 *
 * A file is linked when it can be reached from the site's home page or from the project's README by following:
 *
 *   - the relative paths written in pages, scripts, style sheets and data files;
 *   - a design index beside a linked page, which leads to the whole folder of every design it lists that is not
 *     withdrawn.
 *
 * Licence and notice files and the files a host reads, such as CNAME, are never listed.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';

const indexes = {'releases.json': ['releases', 'releases'], 'designs.json': ['designs', 'designs']};
const readable = /\.(html?|m?js|css|json|svg|md|webmanifest|xml|txt)$/i;
const housekeeping = /^(?:\.nojekyll|CNAME|robots\.txt|sitemap\.xml|404\.html|favicon\.[a-z]+|\.gitkeep|\.gitattributes|\.gitignore)$|(?:^|[-_.])(?:licen[sc]e|notice|copying)(?:[-_.]|$)|^OFL/i;
const modelFile = /\.(glb|gltf|stl|step|stp|obj|usdz|3mf)(\.gz)?$|review-scene\.json\.gz$/i;
const sizeLimit = 8 * 1024 * 1024;

function namesUnder(root) {
  const found = [];
  (function walk(dir, prefix) {
    for (const item of readdirSync(dir, {withFileTypes: true})) {
      if (item.name === '.git') continue;
      if (item.isDirectory()) walk(path.join(dir, item.name), prefix + item.name + '/');
      else if (item.isFile()) found.push(prefix + item.name);
    }
  })(root, '');
  return found.sort();
}

/**
 * The published files that nothing leads to: {entry, files, groups}. `entry` is false when the site has no home
 * page to start from. A group is a folder in which no file is linked, or one file: {path, files, pages, models}.
 */
export function unlinkedContent(root, site = 'docs') {
  const base = path.join(root, site);
  if (!statSync(base, {throwIfNoEntry: false})?.isDirectory()) return {entry: false, files: [], groups: []};
  const files = namesUnder(base), known = new Set(files), folders = new Set();
  for (const name of files) for (let dir = path.posix.dirname(name); dir !== '.'; dir = path.posix.dirname(dir)) folders.add(dir);
  if (!known.has('index.html')) return {entry: false, files: [], groups: []};
  const reached = new Set(), queue = [];
  const reach = name => {
    if (!known.has(name) || reached.has(name)) return;
    reached.add(name); queue.push(name);
    // A page of designs reads the index beside it.
    if (path.posix.basename(name) === 'index.html') for (const index of Object.keys(indexes)) reach(path.posix.join(path.posix.dirname(name), index));
  };
  const reachFolder = dir => files.filter(name => name.startsWith(dir + '/')).forEach(reach);
  // Each path written in a text is tried from the folder of the file that holds it and from the top of the site.
  const follow = (text, from) => {
    for (const raw of text.match(/[A-Za-z0-9_@%~.\/-]+/g) ?? []) {
      if (!/[.\/]/.test(raw)) continue;
      let token = raw; try { token = decodeURIComponent(raw); } catch { /* keep it as written */ }
      for (const start of [from, '']) {
        const target = path.posix.normalize(path.posix.join(start, token)).replace(/^\/+|\/+$/g, '');
        if (!target || target.startsWith('..')) continue;
        if (known.has(target)) reach(target); else if (folders.has(target)) reach(target + '/index.html');
      }
    }
  };
  reach('index.html');
  // The project's README shows stills and links pages of the site.
  try { follow(readFileSync(path.join(root, 'README.md'), 'utf8').replaceAll(site + '/', ''), ''); } catch { /* no README */ }
  while (queue.length) {
    const name = queue.pop(), full = path.join(base, name);
    if (!readable.test(name) || statSync(full).size > sizeLimit) continue;
    const text = readFileSync(full, 'utf8'), dir = path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name);
    const index = indexes[path.posix.basename(name)];
    if (index) try {
      const data = JSON.parse(text.replace(/^﻿/, ''));
      for (const id of Array.isArray(data[index[0]]) ? data[index[0]] : []) if (typeof id === 'string' && data.designStatus?.[id] !== 'withdrawn') reachFolder(path.posix.join(dir, index[1], id));
    } catch { /* the publication check reports an unreadable index */ }
    follow(text, dir);
  }
  const unlinked = files.filter(name => !reached.has(name) && !housekeeping.test(path.posix.basename(name)));
  // Report the highest folder in which nothing is linked, and single files elsewhere.
  const linkedBelow = dir => files.some(name => name.startsWith(dir + '/') && reached.has(name));
  const groups = new Map();
  for (const name of unlinked) {
    let key = name;
    for (let dir = path.posix.dirname(name); dir !== '.' && !linkedBelow(dir); dir = path.posix.dirname(dir)) key = dir + '/';
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  return {entry: true, files: unlinked, groups: [...groups].map(([key, held]) => ({path: site + '/' + key, files: held.length,
    pages: held.filter(name => /\.html?$/i.test(name)).length, models: held.filter(name => modelFile.test(name)).length}))};
}

/** The advice lines for the publication check: empty when everything published is linked. */
export function unlinkedAdvice(root, site = 'docs', {limit = 25} = {}) {
  const {files, groups} = unlinkedContent(root, site);
  if (!files.length) return [];
  const count = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
  // Folders with pages or models first: those are the viewers and models a visitor could open.
  const ordered = [...groups].sort((a, b) => (b.pages + b.models > 0) - (a.pages + a.models > 0) || b.files - a.files || a.path.localeCompare(b.path));
  const lines = ordered.slice(0, limit).map(group => group.path + (group.path.endsWith('/') ? ' (' + count(group.files, 'file') + ([group.pages && count(group.pages, 'page'), group.models && count(group.models, 'model file')]
    .filter(Boolean).map(part => ', ' + part).join('')) + ')' : ''));
  return [count(files.length, 'published file') + ' that no page, index or listed design leads to. Publishing ' + site + '/ puts ' + (files.length === 1 ? 'it' : 'them') +
    ' online. Delete what was withdrawn or never meant to be published, and link what should be shown:', ...lines.map(line => '  ' + line),
    ...(ordered.length > limit ? ['  and ' + count(ordered.length - limit, 'more place') + '.'] : [])];
}
