import {checkDesignReferences} from './check-design-references.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { validateSkills } from './skill-validation.mjs';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8'));
if(manifest.$schema!=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')throw Error('manifest schema');
if(manifest.extensions?.['com.openai']?.interface?.shortDescription?.length>30)throw Error('Subtitle exceeds 30 characters');
const entries = fs.readdirSync(path.join(root, 'skills')).sort().map(folder => ({
  folder,
  path: `skills/${folder}/SKILL.md`,
  body: fs.readFileSync(path.join(root, 'skills', folder, 'SKILL.md'), 'utf8'),
}));
const checked = validateSkills(entries);
if (checked.issues.length) {
  for (const issue of checked.issues) console.error(`${issue.path}: ${issue.code}: ${issue.reason}`);
  process.exit(1);
}
for(const p of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']){const m=JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));if(m.name!==manifest.name||m.version!==manifest.version)throw Error('Compatibility mismatch');}
console.log(JSON.stringify({manifest:'valid',designReferences:checkDesignReferences(root),skills:checked.skills.length,compatibilityManifests:2,hostInstallationTested:false}));
