import {checkDesignReferences} from './check-design-references.mjs';
import {checkInstallManifests, checkPackagedReferences} from './install-manifests.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import { validateSkills } from './skill-validation.mjs';
const root=path.resolve(import.meta.dirname,'..');
// A missing or unreadable plugin.json is reported by the install check below.
let manifest=null;
try{manifest=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8'));}catch{}
const schemaIssues=[];
if(manifest&&manifest.$schema!=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')schemaIssues.push({path:'plugin.json',code:'invalid-schema',reason:'manifest schema'});
if(manifest?.extensions?.['com.openai']?.interface?.shortDescription?.length>30)schemaIssues.push({path:'plugin.json',code:'invalid-interface',reason:'Subtitle exceeds 30 characters'});
const entries = fs.readdirSync(path.join(root, 'skills')).sort().map(folder => ({
  folder,
  path: `skills/${folder}/SKILL.md`,
  body: fs.readFileSync(path.join(root, 'skills', folder, 'SKILL.md'), 'utf8'),
}));
const checked = validateSkills(entries);
// A clean clone holds the files Git tracks, staged additions included. An installed copy may have no repository, so it checks the files present.
function committed(...args) {
  try {
    const options = {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024};
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], options).trim();
    if (path.relative(fs.realpathSync.native(top), fs.realpathSync.native(root)) !== '') return null;
    return execFileSync('git', ['ls-files', '-z', ...args], options).split('\0').filter(Boolean);
  } catch { return null; }
}
const tracked = committed();
const ignoredTracked = tracked ? committed('-ci', '--exclude-standard') ?? [] : [];
const install = checkInstallManifests(root, {tracked});
const packaged = checkPackagedReferences(root, {tracked, ignoredTracked});
const issues = [...schemaIssues, ...checked.issues, ...install.issues, ...packaged.issues];
if (issues.length) {
  for (const issue of issues) console.error(`${issue.path}: ${issue.code}: ${issue.reason}`);
  process.exit(1);
}
console.log(JSON.stringify({manifest:'valid',designReferences:checkDesignReferences(root),skills:checked.skills.length,compatibilityManifests:2,marketplaces:2,marketplaceName:install.marketplace,packagedSkillLinks:packaged.links,cleanCloneChecked:tracked!==null,hostInstallationTested:false}));
