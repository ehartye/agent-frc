import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {atPointer} from './study-evidence.mjs';
import {createScoreAssessment} from './score-assessment.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);};

export function scoringContext(profile,match){
  const {series,scoreEvidenceBase,...model}=profile.rehearsal;
  const {routeHypotheses,...input}=profile; // The kickoff builder regenerates this derived route cache.
  const {scoreObservations,scoreJournal,...scenario}=match;
  return hash(JSON.stringify({profile:{...input,rehearsal:model},scenario}));
}

/** Preserve the evidence root when a standalone project model is written in a new directory. */
export function scoreProfileForOutput(profile,source,destination){
  if(!profile.rehearsal?.scoreAssessment)return profile;
  const output=structuredClone(profile), model=output.rehearsal;
  const root=path.resolve(path.dirname(source),model.scoreEvidenceBase??'.');
  model.scoreEvidenceBase=path.relative(path.dirname(path.resolve(destination)),root)||'.';
  for(const match of model.series?.matches??[])delete match.scoreObservations;
  return output;
}

/** Resolve local source receipts once when building an offline lab or running a series. */
export async function loadScoreObservations(profile,filename) {
  const model=profile.rehearsal;
  if(!model?.scoreAssessment)return profile;
  const timing=createScoreAssessment(model),base=path.resolve(path.dirname(filename),model.scoreEvidenceBase??'.');
  const cache=new Map();
  async function evidence(ref,json=false) {
    check(typeof ref?.file==='string' && ref.file.length && /^[a-f0-9]{64}$/.test(ref.sha256),'Hash and locate the project evidence.');
    const full=path.resolve(base,ref.file);
    if(!cache.has(full))cache.set(full,readFile(full));
    const bytes=await cache.get(full);
    check(hash(bytes)===ref.sha256,'Changed score evidence: '+ref.file);
    return json?JSON.parse(bytes):null;
  }
  async function corroborate(row,fields) {
    check(Array.isArray(row.sources) && row.sources.length,'Retain the original project traces.');
    for(const source of row.sources)await evidence(source);
    for(const field of fields){
      const proof=row.witnesses?.[field],ref=row.sources.find(s=>s.sha256===proof?.sha256);
      check(ref && typeof proof.pointer==='string' && proof.pointer.startsWith('/'),'Missing source pointer for '+field);
      let value=atPointer(await evidence(ref,true),proof.pointer);
      if(field==='result' && typeof value==='boolean')value=value?'met':'failed';
      check(value===row[field],'Source observation disagrees with '+field);
    }
  }
  for(const r of timing.rules.values()){
    check(r.source?.sha256===r.ruleSha256,'Register the source edition for each score rule.');
    await evidence(r.source);
  }
  for(const m of model.series?.matches??[]){
    check(!Object.hasOwn(m,'scoreObservations'),'Read observations from the pinned project journal.');
    if(!m.scoreJournal)continue;
    const book=await evidence(m.scoreJournal,true);
    check(book.schema==='field-rehearsal/score-journal@1' && book.contextSha256===scoringContext(profile,m) &&
      book.scenario===m.id && book.clock===model.scoreAssessment.clock &&
      book.setup===m.setup && JSON.stringify(book.roster)===JSON.stringify(m.roster) && Array.isArray(book.attempts),
      'Score journal differs from its match, six robot plans, setup or clock.');
    const rows=[];
    for(const attempt of book.attempts) {
      const a=await evidence(attempt.release,true);
      check(a.schema==='field-rehearsal/piece-release@1' && Array.isArray(a.sources) && a.sources.length>0,
        'A release must identify its original project trace.');
      await corroborate(a,['piece','releasedS',...(a.reacquiredS!==undefined?['reacquiredS']:[])]);
      const row={...a,releaseTraceSha256:attempt.release.sha256,observation:null};
      if(attempt.observation){
        const o=await evidence(attempt.observation,true);
        check(o.schema==='field-rehearsal/criterion-observation@1' && o.releaseSha256===attempt.release.sha256 &&
          Array.isArray(o.sources) && o.sources.length>0,'Bind the observed criterion to its original release and source.');
        await corroborate(o,['piece','result','observedS',...(['entryS','passageS'].filter(k=>o[k]!=null))]);
        row.observation={...o,traceSha256:attempt.observation.sha256};
      }
      rows.push(row);
    }
    timing.register(rows,m.id);
    m.scoreObservations=rows;
  }
  return profile;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const file=process.argv[2];
    check(file && (process.argv.length===3 || (process.argv.length===4 && process.argv[3]==='--contexts')),
      'Usage: node scripts/score-observations.mjs PROFILE.json [--contexts]');
    const input=JSON.parse(await readFile(file));
    if(process.argv[3]==='--contexts'){
      console.log(JSON.stringify(Object.fromEntries(input.rehearsal.series.matches.map(m=>[m.id,scoringContext(input,m)])),null,2));
    }else{
      const profile=await loadScoreObservations(input,file);
      const timing=createScoreAssessment(profile.rehearsal);
      check(timing,'Register the project assessment clock and target rules.');
      const matches=profile.rehearsal.series.matches.map(m=>({id:m.id,assessments:timing.register(m.scoreObservations??[],m.id)
        .map(({row,result})=>{
          const target=profile.rehearsal.stations.find(s=>s.id===row.target);
          const points=result.status==='credited'?(typeof target.points==='number'?target.points:target.points[result.pointsPhase]):0;
          check(Number.isSafeInteger(points) && points>=0,'Missing points for the observed category and credited phase.');
          return {id:row.id,piece:row.piece,target:row.target,releasedS:row.releasedS,entryS:row.observation?.entryS??null,
            passageS:row.observation?.passageS??null,observedS:row.observation?.observedS??null,...result,points};
        })}));
      console.log(JSON.stringify({schema:'field-rehearsal/score-review@1',scope:'Supplied modeled releases and criterion observations',matches},null,2));
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
