import fs from 'node:fs';
import path from 'node:path';

export function checkDesignReferences(root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root,'references/public-sources.json'),'utf8'));
  const ids = new Set();
  for (const source of catalog.sources) {
    if (!source.id || ids.has(source.id) || !source.designUse?.trim() || source.seasons?.length ||
        !source.reviewed || new URL(source.url).protocol !== 'https:') {
      throw Error('Public references require a unique ID, design question, review date and general-purpose source: ' + source.id);
    }
    ids.add(source.id);
  }
  function inspect(file) {
    const relative = path.relative(root,file).split(path.sep).join('/');
    if (/(?:^|\/)(?:season[-_])?20\d{2}(?:\/|[-_])|(?:^|\/)team[-_]?\d{2,}(?:\/|[-_])/i.test(relative)) {
      throw Error('Keep project-specific files in the owning project: ' + relative);
    }
    if (!file.endsWith('.md')) return;
    const markdown = fs.readFileSync(file,'utf8').replace(/^`{3}[^\n]*\n[\s\S]*?^`{3}[^\n]*|^~{3}[^\n]*\n[\s\S]*?^~{3}[^\n]*/gm,'');
    for (const [,href] of markdown.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      const target = path.resolve(path.dirname(file),decodeURIComponent(href.split('#')[0]));
      if (!fs.statSync(target,{throwIfNoEntry:false})?.isFile()) throw Error(relative + ' links to missing file ' + href);
    }
  }
  function walk(directory) {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const file = path.join(directory,entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) inspect(file);
    }
  }
  for (const folder of ['docs','examples','references','skills','templates','worksheets']) walk(path.join(root,folder));
  inspect(path.join(root,'README.md'));
  return ids.size;
}
