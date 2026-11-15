import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadCatalog} from './context.mjs';
const publicFile=path.resolve(import.meta.dirname,'../references/public-sources.json');
export function selectSources(catalog,{topic='',season,asOf,includeHistorical=false}={}){
 if(!Number.isInteger(season)||season<1992||season>2100)throw Error('An explicit season year is required');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf||'')||Number.isNaN(Date.parse(asOf)))throw Error('An explicit valid as-of date is required');
 const query=topic.toLowerCase();
 return catalog.sources.filter(s=>{
  const seasons=s.seasons||[];
  if(seasons.length&&!seasons.includes(season)&&!(includeHistorical&&seasons.some(y=>y<season)))return false;
  return !query||[s.title,...(s.topics||[])].join(' ').toLowerCase().includes(query);
 }).slice(0,20).map(s=>{
  const url=new URL(s.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid source URL');
  const versionScope=s.version_scope||s.scope||'unspecified';
  return {id:s.id||null,title:s.title,url:s.url,versionScope,seasons:s.seasons||[],authorityState:s.authority_state||'technical',reviewed:s.reviewed||catalog.as_of,reviewDue:s.review_due||null,stale:s.review_due?s.review_due<asOf:null,license:s.license||'Link only; permission must be checked',handling:s.redistribution||s.handling||'link-only',limits:s.verification_limits||'Selected source link; re-open before use'};
 });
}
export function lookup(options,env=process.env){const configured=loadCatalog(env);const catalog=configured||JSON.parse(fs.readFileSync(publicFile,'utf8'));return {mode:configured?'explicit-local-vault':'public-reference-only',season:options.season,asOf:options.asOf,records:selectSources(catalog,options),limits:'Metadata selection only; no source bodies read, no automatic rule interpretation or network requests'};}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const args=process.argv.slice(2);const options={};for(let i=0;i<args.length;i++){const key=args[i];if(key==='--historical')options.includeHistorical=true;else if(['--topic','--season','--as-of'].includes(key)){if(!args[i+1])throw Error('Missing option');const value=args[++i];options[key==='--as-of'?'asOf':key.slice(2)]=key==='--season'?Number(value):value;}else throw Error('Unknown option');}console.log(JSON.stringify(lookup(options),null,2));}catch{console.error('Lookup failed: supply --season YEAR --as-of YYYY-MM-DD and optional --topic TEXT; check explicitly configured catalog.');process.exitCode=1;}}
