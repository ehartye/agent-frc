import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function loadCatalog(env=process.env){
 if(!env.FRC_VAULT_PATH)return null;
 const root=fs.realpathSync(env.FRC_VAULT_PATH);
 const catalogDir=path.join(root,'catalog');
 if(fs.lstatSync(catalogDir).isSymbolicLink())throw Error('Catalog links are not allowed');
 const file=path.join(catalogDir,'sources.json');
 if(fs.lstatSync(file).isSymbolicLink())throw Error('Catalog links are not allowed');
 const real=fs.realpathSync(file); const rel=path.relative(root,real);
 if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Catalog escapes configured root');
 const stat=fs.statSync(real); if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Invalid catalog size/type');
 const data=JSON.parse(fs.readFileSync(real,'utf8'));
 if(data.schema!=='frc-source-catalog/v1'||!Array.isArray(data.sources)||!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of))throw Error('Unsupported catalog');
 return data;
}
export function context(env=process.env){const data=loadCatalog(env);return data?{mode:'explicit-local-vault',vaultConfigured:true,asOf:data.as_of,sourceCount:data.sources.length}:{mode:'public-reference-only',vaultConfigured:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{console.log(JSON.stringify(context(),null,2));}catch{console.error('Unable to read the explicitly configured vault catalog; check path, schema and permissions.');process.exitCode=1;}}
