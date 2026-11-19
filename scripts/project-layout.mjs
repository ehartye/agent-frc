import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const folders = ['kickoff','cad','controls','sim','experiments','tests','scripts','docs','artifacts'];
const files = new Set(['README.md','LICENSE','LICENSE.md','AGENTS.md','.gitattributes','.gitignore',
  'run.ps1','cad-showcase.json','highlights.json','project-layout.json','package.json','package-lock.json','pyproject.toml',
  'requirements.txt','pytest.ini','settings.gradle','build.gradle','gradlew','gradlew.bat']);
const toolFolders = new Set(['.github','.vscode','.wpilib','src','gradle','vendordeps']);

const indexPath = 'docs/workflow.md';
const indexTemplate = '# Project workflow\n\n| Agent FRC skill | Project output | Supporting evidence |\n| --- | --- | --- |\n';
export function workflowRows(root, ref) {
  const listing = ref ? ['ls-tree','-r','--name-only','-z',ref] : ['ls-files','-z'];
  const tracked = new Set(execFileSync('git',['-C',root,...listing],{encoding:'utf8',maxBuffer:64*1024*1024}).split('\0'));
  const read = relative => ref ? execFileSync('git',['-C',root,'show',ref+':'+relative],{encoding:'utf8'}) :
    readFileSync(path.join(root,relative),'utf8');
  if (!tracked.has(indexPath)) throw Error('Track the project workflow index at '+indexPath);
  const links = (cell,required) => {
    if (!required && ['—','-',''].includes(cell)) return [];
    const parsed = [...cell.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    if (!parsed.length) throw Error('Expected a project document link in '+indexPath);
    return parsed.map(([,label,href]) => {
      if (/[\\:#?]/.test(href) || href.startsWith('/')) throw Error('Expected a local workflow document: '+href);
      const file = path.posix.normalize(path.posix.join('docs',href));
      if (file.startsWith('../') || file.startsWith('artifacts/') || !tracked.has(file))
        throw Error('Workflow document is unavailable in this checkout: '+file);
      if (!ref && path.relative(realpathSync(root),realpathSync(path.join(root,file))).startsWith('..'))
        throw Error('Workflow link leaves the project: '+file);
      return {label,file};
    });
  };
  const rows = [];
  let table = false, found = false;
  for (const raw of read(indexPath).split(/\r?\n/)) {
    const line=raw.trim();
    if (/^\|\s*Agent FRC skill\s*\|\s*Project output\s*\|\s*Supporting evidence\s*\|$/i.test(line)) {
      found=true; table=true; continue;
    }
    if (!line.startsWith('|')) {table=false; continue;}
    if (!table || /^\|[ :|\-]+$/.test(line)) continue;
    const cells=line.slice(1,-1).split('|').map(c=>c.trim());
    const skill=cells[0].replaceAll('`','').replace(/^agent-frc:/,'');
    if(cells.length!==3 || !/^frc-[a-z][a-z-]+$/.test(skill)) throw Error('Invalid project workflow row: '+line);
    rows.push({skill,output:links(cells[1],true),evidence:links(cells[2],false)});
  }
  if(!found) throw Error('Missing project workflow table in '+indexPath);
  return rows;
}

export function inspect(root) {
  const configFile = path.join(root,'project-layout.json');
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile,'utf8')) : {};
  // Permit individual toolchain paths. New top-level experiment folders require migration.
  const exceptions = new Set(config.toolchainFiles ?? []);
  const paths = execFileSync('git',['-C',root,'ls-files','-co','--exclude-standard','-z'],
    {encoding:'utf8', maxBuffer:64*1024*1024}).split('\0').filter(Boolean);
  const problems = new Set();
  for (const file of paths) {
    const [first] = file.split('/');
    if (first === 'artifacts') problems.add('Generated artifact in project inventory: ' + file);
    else if (file.includes('/') ? !folders.includes(first) && !toolFolders.has(first) && !exceptions.has(file)
      : !files.has(file) && !exceptions.has(file)) problems.add('Unexpected root entry: ' + first);
  }
  if (existsSync(path.join(root,indexPath))) {
    try {workflowRows(root);} catch (error) {problems.add(error.message);}
  }
  return [...problems].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, directory] = process.argv.slice(2);
  if (!['init','check'].includes(mode) || !directory) throw Error('Usage: project-layout.mjs init|check PROJECT');
  const root = path.resolve(directory);
  const checkout = execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
  if (path.relative(root,checkout) || !statSync(root).isDirectory()) throw Error('Select the project checkout root');
  if (mode === 'init') {
    for (const name of folders) mkdirSync(path.join(root,name),{recursive:true});
    if (!existsSync(path.join(root,indexPath))) writeFileSync(path.join(root,indexPath),indexTemplate,{flag:'wx'});
  }
  const issues = inspect(root).filter(issue => mode !== 'init' || issue !== 'Track the project workflow index at '+indexPath);
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('Project layout passed.');
}
