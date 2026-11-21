/** Offline verification of the exact source and completed student site before promotion. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream, lstatSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {audit, auditStaged, verifyCommittedFile, verifyPair} from './public-model-release.mjs';

function requireValue(value, message) { if (!value) throw Error(message); }
function git(repo, ...args) {
  return execFileSync('git', ['-C',repo,...args], {encoding:'utf8', maxBuffer:64*1024*1024});
}
function contained(root, file) {
  const rel=path.relative(root,file);
  return rel!== '..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel);
}
function publicPath(name) {
  requireValue(typeof name==='string' && name && !name.includes('\\') && !name.includes(':') &&
    name.split('/').every(p=>p && p!=='.' && p!=='..' && p!=='.git'), 'Expected a project-relative path');
  return name;
}
function exactPath(filename) {
  const real=realpathSync(filename);
  requireValue(real===path.resolve(filename),'Redirected release input: '+filename);
  return real;
}
async function siteFiles(root) {
  const rows=[];
  async function visit(dir) {
    for (const item of readdirSync(dir,{withFileTypes:true})) {
      const full=path.join(dir,item.name);
      if (item.isDirectory()) await visit(full);
      else {
        requireValue(item.isFile(),'Unsupported or redirected site entry: '+full);
        const digest=createHash('sha256');
        for await (const chunk of createReadStream(full)) digest.update(chunk);
        rows.push([path.relative(root,full).split(path.sep).join('/'),digest.digest('hex')]);
      }
    }
  }
  await visit(root);
  requireValue(rows.length,'Empty publication directory');
  return rows.sort(([a],[b])=>a<b?-1:a>b?1:0);
}
function fingerprint(rows) {return createHash('sha256').update(JSON.stringify(rows)).digest('hex');}

function checkServedCommit(repo, directory, rows) {
  const entries=git(repo,'ls-tree','-rz','HEAD','--',directory).split('\0').filter(Boolean);
  const names=new Set(rows.map(([name])=>directory+'/'+name));
  requireValue(names.size===entries.length,'Branch publication inventory differs from committed site');
  for (const entry of entries) {
    const tab=entry.indexOf('\t'), name=entry.slice(tab+1);
    const [mode,kind,oid]=entry.slice(0,tab).split(' ');
    requireValue(['100644','100755'].includes(mode) && kind==='blob' && names.has(name),
      'Branch publication has an uncommitted or unsupported entry: '+name);
    requireValue(git(repo,'hash-object','--no-filters','--',name).trim()===oid,'Branch publication differs from committed bytes: '+name);
  }
}

export async function checkLocal(configName,project,output) {
  const repo=exactPath(project), configFile=exactPath(configName);
  const config=JSON.parse(readFileSync(configFile,'utf8'));
  requireValue(config.schema==='agent-frc/local-showcase-release@1' && /^[a-f0-9]{40}$/.test(config.approvedCommit) &&
    ['branch','built'].includes(config.layout), 'Expected a frozen local release configuration');
  const branch=config.layout==='branch';
  requireValue(branch?!output:!!output,branch?'Use the registered branch directory':'Supply the final built site directory');
  const stage=exactPath(branch?path.join(repo,publicPath(config.servedDirectory)):output);
  requireValue(!contained(repo,configFile) && !contained(stage,configFile),'Keep trusted configuration outside candidate inputs');
  const station=path.dirname(configFile);
  const trustedPath=name=>{
    requireValue(typeof name==='string' && name.length,'Missing trusted input path');
    const real=exactPath(path.resolve(station,name));
    requireValue(!contained(repo,real) && !contained(stage,real),'Use a separately held trusted input');
    return real;
  };
  const approved=trustedPath(config.approvedSite);
  requireValue(!contained(approved,stage) && !contained(approved,repo),'Candidate overlaps the approved output');
  const approvedDigest=fingerprint(await siteFiles(approved));
  requireValue(approvedDigest===config.approvedSiteSha256,'Approved site differs from the frozen release');
  git(repo,'merge-base','--is-ancestor',config.approvedCommit,'HEAD');
  const policy=name=>JSON.parse(git(repo,'show',config.approvedCommit+':'+publicPath(name)));
  const sourcePolicy=policy(config.sourcePolicy), stagePolicy=policy(config.stagePolicy);
  requireValue(sourcePolicy.project && sourcePolicy.project===stagePolicy.project,'Source and stage policies name different projects');
  if(branch) requireValue(sourcePolicy.publicRoots.includes(config.servedDirectory),'Branch directory is outside the commissioned public roots');
  const sourceHead=git(repo,'rev-parse','HEAD').trim();
  const packetNames=[config.sourcePacket,config.stagePacket].map(name=>path.join(repo,publicPath(name)));
  requireValue(packetNames[0]!==packetNames[1],'Register distinct source and stage packet paths');
  const present=packetNames.map(name=>lstatSync(name,{throwIfNoEntry:false})!==undefined);
  requireValue(present[0]===present[1],'Supply both source and staged release packets');
  let key;
  if (present[0]) {
    packetNames.forEach(exactPath);
    key=trustedPath(config.reviewerPublicKey);
    await verifyPair(repo,JSON.parse(readFileSync(packetNames[0])),stage,JSON.parse(readFileSync(packetNames[1])),
      readFileSync(key),sourcePolicy.project);
  }
  const fieldRoot=config.independentFieldRoot?trustedPath(config.independentFieldRoot):null;
  const rows=await siteFiles(stage);
  const source=await audit(repo,config.approvedCommit,config.sourcePolicy,present[0]?packetNames[0]:undefined,key,sourceHead);
  if(present[1]) verifyCommittedFile(repo,sourceHead,config.stagePacket);
  const final=await auditStaged(approved,stage,stagePolicy,present[1]?packetNames[1]:undefined,key,fieldRoot);
  requireValue(fingerprint(rows)===fingerprint(await siteFiles(stage)),'Publication directory changed during verification');
  requireValue(git(repo,'rev-parse','HEAD').trim()===sourceHead,'Source revision changed during verification');
  if (branch) checkServedCommit(repo,config.servedDirectory,rows);
  return {schema:'agent-frc/local-showcase-verification@1',project:sourcePolicy.project,layout:config.layout,
    sourceHead,approvedSiteSha256:approvedDigest,stageSha256:fingerprint(rows),
    files:rows.length,source,final};
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode,...args]=process.argv.slice(2);
    if(mode==='digest' && args.length===1) console.log(fingerprint(await siteFiles(exactPath(args[0]))));
    else if(mode==='check' && [2,3].includes(args.length)) console.log(JSON.stringify(await checkLocal(...args),null,2));
    else throw Error('Usage: local-showcase-release.mjs digest APPROVED_SITE | check TRUSTED_CONFIG PROJECT [FINAL_BUILT_SITE]');
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
