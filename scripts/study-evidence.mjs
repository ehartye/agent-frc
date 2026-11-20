import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const label = value => typeof value === 'string' && Boolean(value.trim());
export function readStudy(file) {
  if (!file || !statSync(file).isFile() || statSync(file).size>32_000_000) throw Error('Expected a JSON study file up to 32 MB.');
  const bytes=readFileSync(file);
  return {value:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),sha256:digest(bytes)};
}

export function atPointer(value, pointer) {
  if (pointer==='') return value;
  if (typeof pointer!=='string' || !pointer.startsWith('/') || /~(?![01])/.test(pointer))
    throw Error('Invalid JSON pointer: '+pointer);
  for (const token of pointer.slice(1).split('/')) {
    const key=token.replaceAll('~1','/').replaceAll('~0','~');
    if (value==null || typeof value!=='object' || !Object.hasOwn(value,key))
      throw Error('Missing evidence at '+pointer);
    value=value[key];
  }
  return value;
}

export function evidenceReader(root) {
  const base=realpathSync(root),cache=new Map();
  return ref=>{
    if (!ref || !label(ref.path) || /^(?:[/\\]|[a-z]:)/i.test(ref.path) ||
        !/^[0-9a-f]{64}$/.test(ref.sha256)) throw Error('Evidence needs a relative path and lowercase SHA-256.');
    const file=realpathSync(path.resolve(base,ref.path)),rel=path.relative(base,file);
    if (!rel || rel==='..' || rel.startsWith('..'+path.sep) || path.isAbsolute(rel)) throw Error('Evidence escapes project root.');
    if (!cache.has(file)) cache.set(file,readStudy(file));
    const doc=cache.get(file);
    if(doc.sha256!==ref.sha256) throw Error('Evidence digest changed: '+ref.path);
    return doc.value;
  };
}
