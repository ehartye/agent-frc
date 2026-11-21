/** Check committed workflow sources without running jobs or materializing project products. */
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function checkWorkflows(project, commit, executable) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !path.isAbsolute(executable))
    throw Error('Supply the full Git commit and absolute path to your trusted actionlint executable');
  const git = (...args) => execFileSync('git', ['-C', project, ...args], {maxBuffer:64*1024*1024});
  if (git('cat-file', '-t', commit).toString().trim() !== 'commit') throw Error('Select a Git commit');
  const entries = git('ls-tree', '-r', '-z', commit).toString('utf8').split('\0').filter(Boolean);
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'frc-workflow-check-'));
  const workflows = [];
  try {
    // actionlint resolves local calls and action metadata relative to a Git project.
    mkdirSync(path.join(scratch, '.git'));
    for (const entry of entries) {
      const tab = entry.indexOf('\t');
      const name = entry.slice(tab + 1);
      const workflow = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(name);
      if (!workflow && !/(^|\/)action\.ya?ml$/.test(name)) continue;
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      if (type !== 'blob' || !['100644','100755'].includes(mode) ||
          name.includes('\\') || name.includes(':') ||
          name.split('/').some(part => !part || ['.','..','.git'].includes(part.toLowerCase())))
        throw Error('Expected a regular, project-relative workflow or action file: '+name);
      const file = path.join(scratch,name);
      mkdirSync(path.dirname(file), {recursive:true});
      writeFileSync(file, git('cat-file','blob',oid), {flag:'wx'});
      if (workflow) workflows.push(name);
    }
    if (!workflows.length) throw Error('No committed .github/workflows/*.yml or *.yaml files');
    const digest = createHash('sha256').update(readFileSync(executable)).digest('hex');
    const result = spawnSync(executable, ['-no-color','-shellcheck=','-pyflakes=',...workflows],
      {cwd:scratch, shell:false, stdio:'inherit', timeout:120000, windowsHide:true});
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error('Workflow validation failed for '+commit);
    return {commit, workflows, actionlintSha256:digest, scope:'Committed workflow syntax and local reusable workflow contracts. External workflow bodies and job execution are outside this check.'};
  } finally {
    rmSync(scratch,{recursive:true,force:true});
  }
}

