import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8'));
if(manifest.$schema!=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')throw Error('manifest schema');
if(manifest.extensions?.['com.openai']?.interface?.shortDescription?.length>30)throw Error('Subtitle exceeds 30 characters');
const names=new Set();
for(const d of fs.readdirSync(path.join(root,'skills'))){const body=fs.readFileSync(path.join(root,'skills',d,'SKILL.md'),'utf8');const m=body.match(/^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---/);if(!m||names.has(m[1])||m[1]!==d)throw Error('Invalid skill');JSON.parse(m[2]);names.add(m[1]);}
for(const p of ['.claude-plugin/plugin.json','.codex-plugin/plugin.json']){const m=JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));if(m.name!==manifest.name||m.version!==manifest.version)throw Error('Compatibility mismatch');}
console.log(JSON.stringify({manifest:'valid',skills:names.size,compatibilityManifests:2,hostInstallationTested:false}));
