import {starterFrameProfile} from './frame-profile.mjs';
import {publicFusionHandoff} from './public-fusion-handoff.mjs';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const folders = ['kickoff','cad','controls','sim','experiments','tests','scripts','docs','artifacts'];
const files = new Set(['README.md','LICENSE','LICENSE.md','AGENTS.md','.gitattributes','.gitignore',
  'run.ps1','cad-showcase.json','highlights.json','project-layout.json','package.json','package-lock.json','pyproject.toml',
  'requirements.txt','pytest.ini','settings.gradle','build.gradle','gradlew','gradlew.bat']);
const toolFolders = new Set(['iterations','.github','.vscode','.wpilib','src','gradle','vendordeps']);

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
    if (!parsed.length && required) throw Error('Expected a project document link in '+indexPath);
    const items=parsed.map(([,label,href]) => {
      if (/^https:\/\//i.test(href)) {
        const url=new URL(href);
        if(url.username || url.password)throw Error('Expected public supporting URL');
        return {label,url:url.href};
      }
      if (/[\\:#?]/.test(href) || href.startsWith('/')) throw Error('Expected a local workflow document: '+href);
      const file = path.posix.normalize(path.posix.join('docs',href));
      if (file.startsWith('../') || file.startsWith('artifacts/') || !tracked.has(file))
        throw Error('Workflow document is unavailable in this checkout: '+file);
      if (!ref && path.relative(realpathSync(root),realpathSync(path.join(root,file))).startsWith('..'))
        throw Error('Workflow link leaves the project: '+file);
      return {label,file};
    });
    if(required && !items.some(item=>item.file)) throw Error('Expected a committed project output in '+indexPath);
    return items;
  };
  const rows = [];
  let columns, found=false;
  for(const raw of read(indexPath).split(/\r?\n/)) {
    const line=raw.trim();
    if (!line.startsWith('|')) {columns=undefined;continue;}
    const cells=line.slice(1,-1).split('|').map(c=>c.trim());
    if (!columns) {
      const positions=[/skill/i,/project.*(?:output|document|artifact)/i,/evidence|what to check/i].map(re=>cells.findIndex(c=>re.test(c)));
      if(positions.every(i=>i>=0)){columns=positions;found=true;}
      continue;
    }
    if (/^\|[ :|\-]+$/.test(line)) continue;
    if (columns.some(i=>i>=cells.length)) throw Error('Invalid project workflow row: '+line);
    const [skillCell,output,evidence]=columns.map(i=>cells[i]);
    const names=[...new Set(skillCell.match(/\bfrc-[a-z]+(?:-[a-z]+)*\b/g))];
    const description=/^Agent FRC (.+)$/i.exec(skillCell);
    if (!names.length && description) for(const part of description[1].toLowerCase().split(' and ')) names.push('frc-'+part.trim().replaceAll(' ','-'));
    if (!names.length) throw Error('Name the skill in the project workflow row: '+line);
    const supporting=links(evidence,false);
    rows.push({skill:names.join(', '),output:links(output,true),evidence:supporting,
      evidenceNote:supporting.length || ['—','-'].includes(evidence) ? '' : evidence});
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
  try {publicFusionHandoff(root);} catch (error) {problems.add(error.message);}
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
    // Existing design and kickoff evidence keeps its explicitly chosen or historical outline.
    const newRobot=['cad','kickoff'].every(folder=>readdirSync(path.join(root,folder)).every(n=>n==='.gitkeep'));
    if(newRobot)writeFileSync(path.join(root,'cad','frame-profile.json'),JSON.stringify(starterFrameProfile(),null,2)+'\n',{flag:'wx'});
    if (!existsSync(path.join(root,indexPath))) writeFileSync(path.join(root,indexPath),indexTemplate,{flag:'wx'});
  }
  const issues = inspect(root).filter(issue => mode !== 'init' || issue !== 'Track the project workflow index at '+indexPath);
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('Project layout passed.');
}
