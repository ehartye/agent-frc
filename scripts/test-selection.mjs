// Decides which test files a change needs: lanes and hand-written globs from test/test-map.json,
// plus the files each test reaches through imports and file names in its own code.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root=fileURLToPath(new URL('../',import.meta.url));
export const mapFile='test/test-map.json';
export const readJson=name=>JSON.parse(readFileSync(path.join(root,name),'utf8'));
export const allTests=()=>readdirSync(path.join(root,'test')).filter(name=>name.endsWith('.test.mjs')).sort();
export const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:1<<26,stdio:['ignore','pipe','pipe']}).split('\n').filter(Boolean);
export const repoFiles=()=>git('ls-files','-co','--exclude-standard').filter(file=>existsSync(path.join(root,file)));

// `**` crosses folders, `*` stays inside one.
export const glob=pattern=>new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*\*\/|\*\*|\*/g,star=>star==='**/'?'(?:.*/)?':star==='**'?'.*':'[^/]*')+'$');

const code=/\.(mjs|js|py)$/;

// The files one file refers to. A reference is an import, a path that resolves to a file
// or to a folder below the top level, or a file name that only one file below the top level carries.
// Top-level files such as README.md share their names with files in a robot project, so the map lists them by hand.
export function referenceReader(files=repoFiles()){
  const known=new Set(files),named=new Map(),direct=new Map();
  for(const file of files){const base=path.posix.basename(file);named.set(base,[...(named.get(base)??[]),file]);}
  const below=folder=>folder.includes('/')?files.filter(file=>file.startsWith(folder+'/')):[];
  // A Python module name carried both by a test file and by a script means the script: the tests put scripts/ first on the import path.
  const modules=name=>{const hits=named.get(name+'.py')??[],shipped=hits.filter(hit=>!hit.startsWith('test/'));return shipped.length?shipped:hits;};
  const references=file=>{
    if(direct.has(file)) return direct.get(file);
    const text=readFileSync(path.join(root,file),'utf8'),found=new Set(),folder=path.posix.dirname(file);
    if(file.endsWith('.py')) for(const [,module] of text.matchAll(/^\s*(?:from|import)\s+(\w+)/gm)) modules(module).forEach(hit=>found.add(hit));
    for(const [token] of text.matchAll(/[\w.\/-]+/g)){
      if(!/[.\/]/.test(token)||!/\w/.test(token)) continue;
      const base=token.split('/').filter(Boolean).at(-1)??'',unique=named.get(base)?.length===1&&named.get(base)[0].includes('/')&&named.get(base)[0];
      if(!token.includes('/')){if(unique) found.add(unique);continue;}
      // `./x` and `../x` are read from the file's own folder; any other path is also tried from the repository root.
      const tidy=candidate=>path.posix.normalize(candidate).replace(/^\/+|\/+$/g,'');
      const candidates=[tidy(path.posix.join(folder,token)),...(token.startsWith('.')?[]:[tidy(token)])].filter(candidate=>candidate!=='.'&&!candidate.startsWith('..'));
      const hits=candidates.flatMap(candidate=>known.has(candidate)?[candidate]:below(candidate));
      if(hits.length) hits.forEach(hit=>found.add(hit)); else if(unique) found.add(unique);
    }
    found.delete(file);direct.set(file,found);return found;
  };
  return references;
}

// Every repository file each test can reach, followed through the code files it references.
export function reach(tests=allTests(),files=repoFiles()){
  const references=referenceReader(files);
  return new Map(tests.map(test=>{
    const start='test/'+test,seen=new Set([start]),queue=[start];
    while(queue.length){const file=queue.pop();if(code.test(file)) for(const next of references(file)) if(!seen.has(next)){seen.add(next);queue.push(next);}}
    return [test,seen];
  }));
}

// The tests a set of changed files needs, or every test when a change cannot be attributed.
export function selectForChange(changed,{tests=allTests(),map=readJson(mapFile),versionOnly=[],reached=reach(tests)}={}){
  const covers=Object.entries(map.covers).map(([key,patterns])=>[map.lanes[key]??[key],patterns.map(glob)]); // a key is a test file or a lane
  const picked=new Set();
  for(const file of changed){
    if(versionOnly.includes(file)){map.versionTests.forEach(test=>picked.add(test));continue;}
    if(map.everything.some(pattern=>glob(pattern).test(file))) return {all:true,tests,reason:`${file} affects every test`};
    const hits=new Set(tests.filter(test=>reached.get(test).has(file)));
    for(const [covered,patterns] of covers) if(patterns.some(pattern=>pattern.test(file))) covered.forEach(test=>hits.add(test));
    if(!hits.size) return {all:true,tests,reason:`no test is mapped to ${file}`};
    // A document, page or style sheet never starts a CAD kernel test.
    if(map.pages.some(pattern=>glob(pattern).test(file))) map.lanes.kernel.forEach(test=>hits.delete(test));
    hits.forEach(test=>picked.add(test));
  }
  return {all:false,tests:tests.filter(test=>picked.has(test)),reason:`${changed.length} changed file${changed.length===1?'':'s'}`};
}

// Files that differ from the merge base with `base`, including uncommitted and untracked work.
export function changedFiles(base='origin/main'){
  const from=git('merge-base',base,'HEAD')[0];
  const changed=[...new Set([...git('diff','--name-only',from),...git('ls-files','-o','--exclude-standard')])].sort();
  const withoutVersion=text=>{const data=JSON.parse(text);delete data.version;return JSON.stringify(data);};
  const versionOnly=changed.filter(file=>readJson(mapFile).versionFiles.includes(file)&&existsSync(path.join(root,file))).filter(file=>{
    try{return withoutVersion(execFileSync('git',['show',`${from}:${file}`],{cwd:root,encoding:'utf8'}))===withoutVersion(readFileSync(path.join(root,file),'utf8'));}catch{return false;}
  });
  return {from,changed,versionOnly};
}
