/** Audit detailed design showcases by declared status: in-progress on automated prerequisites, effective on a signed review. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

import {designStatuses,statusOf} from './design-status.mjs';
import {checkRelease,releasePhase,releaseSchema} from './preliminary-release.mjs';

export const designSchema='agent-frc/detailed-design@1';
export const indexSchema='agent-frc/detailed-design-index@1';
// The design statuses and index shape are the same for every design phase; see design-status.mjs.
export const statuses=designStatuses;
export const labels={'in-progress':'In-progress detailed design',effective:'Effective detailed design',
  superseded:'Superseded detailed design',withdrawn:'Withdrawn detailed design'};
const designId=/^[a-z0-9][a-z0-9-]{0,63}$/;
const hex=/^[0-9a-f]{64}$/;
// The model formats the release gate treats as geometry, plain, gzipped or zipped, and any zip archive.
export const geometry=/\.(?:(?:f3[dz]|stp|iges|igs|brep|step|gltf|glb|stl|obj|3mf|usdz|ply|fbx|dae|x3d|wrl|3ds)(?:\.(?:gz|zip))?|zip)$/i;
const recordKeys=['schema','design','issue','label','preliminary','fusion','receipt','view','scene','missionCases','fieldPlayers'];
const catalog=new URL('../templates/detailed-design-index.html',import.meta.url);

function check(ok,message){if(!ok)throw Error(message);}
const lf=bytes=>bytes.toString('utf8').replace(/\r\n/g,'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const named=v=>typeof v==='string'&&v.trim().length>0;
const safe=n=>typeof n==='string'&&n.length>0&&!n.startsWith('/')&&!n.includes('\\')&&!n.includes(':')&&
  n.split('/').every(x=>x&&x!=='.'&&x!=='..'&&x!=='.git');
function parse(bytes,what){
  try{return JSON.parse(bytes.toString('utf8').replace(/^﻿/,''));}catch{throw Error('Unreadable '+what);}
}
const onlyKeys=(value,allowed)=>object(value)&&Object.keys(value).every(k=>allowed.includes(k));

/** One withdrawal declaration: the design, a plain reason and the site paths it frees. */
function declaration(row,paths){
  check(onlyKeys(row,['design','reason','files'])&&designId.test(row.design??'')&&named(row.reason)&&Array.isArray(row.files)&&
    row.files.every(safe)&&new Set(row.files).size===row.files.length,
    'Each withdrawal names a design, a reason and the published files it frees');
  check(row.files.every(f=>paths.has(f)),'A withdrawal can free only registered model files and primary entry points: '+row.design);
}

/**
 * Validate the trusted policy field. Paths are relative to the deployed site. The class needs the preliminary
 * class, because an in-progress detailed design links an effective preliminary release.
 */
export function detailedPolicy(spec,prelim,modelFiles,reserved){
  if(spec===undefined)return null;
  check(prelim,'detailedDesigns needs preliminaryReleases in the same approved policy');
  check(onlyKeys(spec,['root','legacy','withdrawn','secondaryLink','catalogSha256'])&&safe(spec.root)&&Object.hasOwn(spec,'legacy'),
    'detailedDesigns needs a root and a legacy declaration (null when no model was published before the status process)');
  const inside=n=>n===spec.root||n.startsWith(spec.root+'/');
  check(!inside(prelim.root)&&!prelim.inside(spec.root)&&![...prelim.primary,...modelFiles,...reserved].some(inside),
    'Keep primary, model, field and preliminary outputs outside the detailed design tree');
  // An entry point follows the primary view once no design is effective, so it can never be a model file itself.
  check(![...prelim.primary].some(f=>geometry.test(f)),'With detailedDesigns, register model geometry under modelFiles, not as a primary entry point');
  const paths=new Set([...modelFiles,...prelim.primary]);
  check(spec.legacy===null||onlyKeys(spec.legacy,['design'])&&designId.test(spec.legacy.design??''),
    'detailedDesigns.legacy names the design published before the status process, or is null');
  const withdrawn=spec.withdrawn??[];
  check(Array.isArray(withdrawn),'detailedDesigns.withdrawn is a list of declarations');
  withdrawn.forEach(row=>declaration(row,paths));
  check(new Set(withdrawn.map(w=>w.design)).size===withdrawn.length,'Declare each withdrawal once');
  check(spec.secondaryLink===undefined||prelim.primary.has(spec.secondaryLink)&&/\.html?$/.test(spec.secondaryLink),
    'detailedDesigns.secondaryLink must name a primary entry page (HTML)');
  check(spec.catalogSha256===undefined||hex.test(spec.catalogSha256),'Pin the project catalog page by SHA-256');
  return {root:spec.root,legacy:spec.legacy?.design??null,withdrawn:new Map(withdrawn.map(w=>[w.design,w])),
    secondaryLink:spec.secondaryLink,catalogSha256:spec.catalogSha256,inside,primary:prelim.primary,modelFiles:new Set(modelFiles),
    preliminaryIndex:path.posix.relative(spec.root,prelim.root+'/releases.json')};
}

/** The primary view rule: the effective design, else the in-progress design; an in-progress design sits beside an effective one. */
export function primaryView(entries){
  const effective=entries.filter(e=>e.status==='effective').at(-1)?.design??null;
  const progress=entries.filter(e=>e.status==='in-progress').at(-1)?.design??null;
  return {current:effective??progress,beside:effective?progress:null};
}

const perDesign=['supersededBy','reason','preliminary'];
/**
 * The index mirrors the preliminary release index: an ordered ID list, a designStatus map and the current design,
 * plus per-design maps. Returns it with one entry object per design.
 */
function readIndex(bytes,what){
  const index=parse(bytes,what),ids=index?.designs;
  check(onlyKeys(index,['schema','preliminaryIndex','current','beside','designs','designStatus',...perDesign])&&index.schema===indexSchema&&
    Array.isArray(ids)&&ids.every(i=>designId.test(i??''))&&new Set(ids).size===ids.length&&object(index.designStatus)&&
    Object.keys(index.designStatus).length===ids.length&&ids.every(i=>statuses.includes(index.designStatus[i]))&&
    perDesign.every(k=>index[k]===undefined||object(index[k])&&Object.keys(index[k]).every(i=>ids.includes(i))),
    'The '+what+' needs unique design IDs, each with a designStatus ('+statuses.join(', ')+')');
  const entries=ids.map(design=>{
    const e={design,status:index.designStatus[design]};
    for(const k of perDesign)if(index[k]?.[design]!==undefined)e[k]=index[k][design];
    return e;
  });
  return {preliminaryIndex:index.preliminaryIndex,current:index.current??null,beside:index.beside??null,designs:entries};
}
/** Serialize entries back to the published index. */
export function writeIndex(entries,preliminaryIndex){
  const index={schema:indexSchema,preliminaryIndex,...primaryView(entries),designs:entries.map(e=>e.design),
    designStatus:Object.fromEntries(entries.map(e=>[e.design,e.status]))};
  for(const k of perDesign){
    const rows=entries.filter(e=>e[k]!==undefined).map(e=>[e.design,e[k]]);
    if(rows.length)index[k]=Object.fromEntries(rows);
  }
  return JSON.stringify(index,null,2)+'\n';
}

/** Read the preliminary tree a detailed design links into: release records and the status each one holds. */
function preliminaryState(files){
  const index=files.has('releases.json')?parse(files.get('releases.json'),'preliminary release index'):null;
  return {
    record:id=>files.get('releases/'+id+'/release.json')??null,
    receipt:id=>files.get('releases/'+id+'/receipt.json')??null,
    status:id=>index&&Array.isArray(index.releases)&&index.releases.includes(id)?statusOf(index,id):null};
}

/**
 * The automated in-progress gate on one new design directory, given as a map of file name to bytes.
 * (a) It links an effective preliminary release by ID and release-record digest. (b) Its layout-checked receipt is
 * the plugin's clearance, mass and voltage check on the STEP exported from the registered Fusion design, over the
 * linked release's cases, cycle and displaced control. (c) A mission case plays a represented objective on that geometry.
 */
export function checkInProgress(id,files,preliminary){
  check(designId.test(id)&&files.has('design.json'),'Detailed design '+id+' has no design record (design.json)');
  const record=parse(files.get('design.json'),'design record: '+id);
  check(record?.schema===designSchema&&record.design===id,'Design record names a different schema or design: '+id);
  // The record is a binding, not a container: known keys only and no room for an embedded model.
  check(onlyKeys(record,recordKeys)&&files.get('design.json').length<=32768,'Design record '+id+' holds more than its bindings');
  check(record.label===labels['in-progress'],'Label design '+id+' "'+labels['in-progress']+'"');
  // (b) and (c): the checked files are a layout-checked release on the detailed geometry.
  // The layout checker is the preliminary one, so its record names that phase; the design record names this one.
  const release={schema:releaseSchema,release:id,issue:record.issue,phase:releasePhase,status:'layout-checked',receipt:record.receipt,
    view:record.view,scene:record.scene,missionCases:record.missionCases};
  if(record.fieldPlayers!==undefined)release.fieldPlayers=record.fieldPlayers;
  const checked=new Map([...files].filter(([name])=>name!=='design.json'));
  check(!checked.has('release.json'),'A detailed design carries design.json, not a preliminary release record: '+id);
  checked.set('release.json',Buffer.from(JSON.stringify(release)));
  let result;
  try{result=checkRelease(id,checked,{},{added:true});}
  catch(error){throw Error('Detailed design '+id+' fails its layout check or mission evidence: '+error.message);}
  const receipt=parse(files.get('receipt.json'),'receipt: '+id);
  const fusion=record.fusion;
  check(onlyKeys(fusion,['authoritySha256','lineageSha256','archiveSha256','stepSha256','configuration','revision'])&&
    ['authoritySha256','lineageSha256','archiveSha256','stepSha256'].every(k=>hex.test(fusion[k]??''))&&named(fusion.configuration),
    'Design '+id+' must bind the registered Fusion authority, lineage, archive and exported STEP by digest');
  check(fusion.stepSha256===receipt.step.sha256,'The layout check of design '+id+' ran on a STEP other than the registered Fusion export');
  // (a) The link to an effective preliminary release.
  const link=record.preliminary;
  check(onlyKeys(link,['release','sha256','receiptSha256'])&&designId.test(link.release??'')&&hex.test(link.sha256??'')&&hex.test(link.receiptSha256??''),
    'Design '+id+' must link a preliminary release by ID and digest');
  const linked=preliminary.record(link.release),linkedReceipt=preliminary.receipt(link.release);
  check(linked&&linkedReceipt,'Design '+id+' links a preliminary release that is not published: '+link.release);
  check(sha(linked)===link.sha256&&sha(linkedReceipt)===link.receiptSha256,
    'Design '+id+' links preliminary release '+link.release+' with a different digest');
  const status=preliminary.status(link.release);
  check(status==='effective','Design '+id+' must link an effective preliminary release; '+link.release+' is '+status);
  // The detailed check must cover the linked release's motion cases, cycle and displaced control.
  const basis=parse(linkedReceipt,'linked preliminary receipt');
  const cases=new Set(receipt.cases.map(c=>c.case));
  check(Array.isArray(basis.cases)&&basis.cases.every(c=>cases.has(c.case))&&JSON.stringify(basis.cycle)===JSON.stringify(receipt.cycle)&&
    object(basis.control)&&basis.control.case===receipt.control.case&&basis.control.displaced===receipt.control.displaced,
    'The layout check of design '+id+' must run the motion cases, cycle and displaced control of preliminary release '+link.release);
  return {design:id,preliminary:link.release,missionCases:result.missionCases};
}

/** A live design whose preliminary release is no longer effective stays published; it only earns a warning. */
function relinkWarnings(entries,state){
  return entries.filter(e=>['in-progress','effective'].includes(e.status)&&e.preliminary!==undefined&&state.status(e.preliminary)!=='effective')
    .map(e=>'Detailed design '+e.design+' links preliminary release '+e.preliminary+', which is now '+state.status(e.preliminary)+
      '. Re-link it to the effective preliminary release.');
}

/**
 * Compare the detailed design tree of an approved and candidate site.
 * before/after: tree-relative name to bytes. approvedFile/candidateFile: site-relative name to bytes or null.
 * signed: site-relative paths a verified signed packet covers; packet: its body. preliminary: the candidate preliminary tree.
 */
export function auditDesigns({policy,before,after,approvedFile,candidateFile,candidateNames=[],signed=new Set(),packet=null,preliminary}){
  const none={designs:[],added:[],current:null,beside:null,effective:null,withdrawn:[],released:new Set(),retired:new Set(),warnings:[],effectiveTransitions:[]};
  const group=files=>{
    const top=new Map(),designs=new Map(),archive=new Map();
    for(const [name,bytes] of files){
      const parts=name.split('/');
      if(parts.length===1){
        check(['index.html','designs.json'].includes(name),'Unrecognized detailed design output: '+name);
        top.set(name,bytes);
      }else{
        check(parts.length>=3&&['designs','archive'].includes(parts[0])&&designId.test(parts[1]),'Unrecognized detailed design output: '+name);
        const set=parts[0]==='designs'?designs:archive;
        if(!set.has(parts[1]))set.set(parts[1],new Map());
        set.get(parts[1]).set(parts.slice(2).join('/'),bytes);
      }
    }
    return {top,designs,archive};
  };
  const old=group(before),now=group(after);
  // Every primary model file still published outside the entry points keeps the entry points under the full gate.
  const modelsPublished=()=>[...policy.modelFiles].some(f=>!policy.primary.has(f)&&candidateFile(f)!==null)||
    [...candidateNames].some(f=>geometry.test(f)&&!policy.inside(f));
  if(!before.size&&!after.size){
    // Before the index exists, a declared legacy design holds the primary view exactly as it did before the status process.
    return {...none,effective:policy.legacy,current:policy.legacy,entryPointsFree:policy.legacy===null&&!modelsPublished()};
  }
  // Issued design and archive files are immutable.
  for(const [kind,sets] of [['designs',old.designs],['archive',old.archive]])for(const [id,files] of sets){
    const next=now[kind].get(id);
    check(next&&next.size===files.size&&[...files].every(([n,b])=>next.has(n)&&Buffer.compare(next.get(n),b)===0),
      'An issued detailed design or its archive changed or was removed: '+kind+'/'+id);
  }
  const page=now.top.get('index.html');
  check(page,'Publish the detailed design catalog (index.html)');
  check(old.top.has('index.html')&&Buffer.compare(old.top.get('index.html'),page)===0||
    (policy.catalogSha256?sha(page)===policy.catalogSha256:lf(readFileSync(catalog))===lf(page)),
    'The detailed design catalog must equal the approved copy, this plugin\'s template or the pinned project page');
  check(now.top.has('designs.json'),'Publish the detailed design index (designs.json)');
  const index=readIndex(now.top.get('designs.json'),'detailed design index');
  const prior=old.top.has('designs.json')?readIndex(old.top.get('designs.json'),'approved detailed design index').designs:[];
  const entries=index.designs,ids=entries.map(e=>e.design);
  check(prior.every((p,i)=>ids[i]===p.design),'Detailed designs may only append; keep every earlier entry in order');
  if(policy.legacy!==null)check(ids[0]===policy.legacy,'List the legacy design '+policy.legacy+' first in the detailed design index');
  const was=new Map(prior.map(p=>[p.design,p]));
  check(entries.filter(e=>e.status==='effective').length<=1,'At most one detailed design can be effective');
  const effective=entries.find(e=>e.status==='effective')?.design??null;
  const records=new Map();
  for(const e of entries){
    const legacy=e.design===policy.legacy;
    check(legacy?!now.designs.has(e.design):now.designs.get(e.design)?.has('design.json'),
      legacy?'The legacy design has no design directory: '+e.design:'Each listed design needs designs/'+e.design+'/design.json');
    if(!legacy){
      const record=parse(now.designs.get(e.design).get('design.json'),'design record: '+e.design);
      check(record?.schema===designSchema&&record.design===e.design,'Design record names a different schema or design: '+e.design);
      records.set(e.design,record);
    }
    check((e.preliminary??null)===(records.get(e.design)?.preliminary?.release??null),'The index names a different preliminary link: '+e.design);
  }
  check(now.designs.size===records.size,'The detailed design index and design directories disagree');
  const state=preliminaryState(preliminary),result={...none,designs:entries.map(e=>({design:e.design,status:e.status})),effective};
  const sitePath=name=>policy.root+'/'+name;
  const signedRecord=id=>{
    const record=records.get(id);
    return packet&&signed.has(sitePath('designs/'+id+'/design.json'))&&object(record.fusion)&&
      record.fusion.stepSha256===packet.stepSha256&&record.fusion.archiveSha256===packet.archiveSha256;
  };
  const supersededBy=(e,accept)=>{
    const successor=entries[ids.indexOf(e.supersededBy)];
    check(successor&&ids.indexOf(e.supersededBy)>ids.indexOf(e.design)&&accept(successor),
      'A superseded design names the later design that replaced it: '+e.design);
  };
  for(const e of entries){
    const from=was.get(e.design)?.status??null,legacy=e.design===policy.legacy,id=e.design;
    check((e.status==='superseded')===(e.supersededBy!==undefined)&&(e.status==='withdrawn')===(e.reason!==undefined),
      'Only a superseded design names its successor and only a withdrawn design gives a reason: '+id);
    if(from===null)result.added.push(id);
    if(from===e.status){
      const fixed=row=>JSON.stringify(Object.entries(row).sort());
      check(fixed(was.get(id))===fixed(e),'An issued index entry changed: '+id);
      continue;
    }
    if(e.status==='in-progress'){
      check(from===null&&!legacy,'A design cannot return to in-progress: '+id);
      const files=now.designs.get(id);
      check(![...files.keys()].some(n=>signed.has(sitePath('designs/'+id+'/'+n))),
        'An in-progress design passes the automated gate; a signed packet belongs to an effective design: '+id);
      checkInProgress(id,files,state);
    }else if(e.status==='effective'){
      check(from===null||from==='in-progress','A '+from+' design cannot become effective: '+id);
      if(legacy){
        // The model already published and approved before the status process keeps today's protection.
        check(from===null&&!prior.length,'Register the legacy design when the index is first published: '+id);
      }else{
        check(signedRecord(id),'An effective detailed design needs the signed mechanical-readiness issue covering its design record: '+id);
        // A design issued directly as effective carries only files the signed packet lists.
        if(from===null)for(const n of now.designs.get(id).keys())
          check(signed.has(sitePath('designs/'+id+'/'+n)),'Unsigned file in an effective design: '+id+'/'+n);
        result.effectiveTransitions.push(id);
      }
    }else if(e.status==='superseded'){
      // Superseded means replaced by a newly effective design. An abandoned in-progress design is withdrawn instead.
      check(from==='effective','Only an effective design can be superseded: '+id);
      supersededBy(e,s=>s.design===effective&&was.get(effective)?.status!=='effective');
    }else{
      const declared=policy.withdrawn.get(id);
      check(declared&&(from!==null||legacy),'Withdrawing a design needs its declaration in the approved policy: '+id);
      check(e.reason===declared.reason,'The withdrawal reason differs from the approved declaration: '+id);
      const held=from==='effective'||legacy&&from===null;
      const owed=held?[...new Set([...policy.modelFiles,...policy.primary])].filter(f=>approvedFile(f)!==null):[];
      check(held?owed.every(f=>declared.files.includes(f)):declared.files.length===0,
        held?'Withdrawing the primary design must free every registered model file and primary entry point: '+id:
          'Only the design holding the primary view frees published files: '+id);
      if(held){
        check(effective===null,'Withdraw a design that has no replacement; a new effective design supersedes it instead: '+id);
        for(const f of declared.files)check(policy.primary.has(f)||candidateFile(f)===null,'A withdrawn model is still published: '+f);
      }
      const kept=now.archive.get(id)??new Map();
      check(kept.size===declared.files.length&&declared.files.every(f=>kept.has(f)&&approvedFile(f)&&Buffer.compare(kept.get(f),approvedFile(f))===0),
        'Archive every withdrawn file byte for byte under '+sitePath('archive/'+id+'/'));
      result.withdrawn.push(id);
    }
  }
  for(const id of now.archive.keys())check(old.archive.has(id)||result.withdrawn.includes(id),'Unrecognized detailed design archive: '+id);
  const view=primaryView(entries);
  check(index.current===view.current&&index.beside===view.beside,
    'The primary view must be the effective detailed design, else the in-progress design: expected current '+view.current+' and beside '+view.beside);
  check(index.preliminaryIndex===policy.preliminaryIndex,'Point the detailed design index at the preliminary release index: '+policy.preliminaryIndex);
  result.warnings=relinkWarnings(entries,state);
  for(const [id,row] of policy.withdrawn)
    if(entries.find(e=>e.design===id)?.status==='withdrawn')for(const f of row.files){
      // A withdrawn path stays retired; it is free without a signature only while no design is effective.
      result.retired.add(f);
      if(effective===null)result.released.add(f);
    }
  return {...result,...view,entryPointsFree:effective===null&&!modelsPublished()};
}

/**
 * Source-side twin of a withdrawal, from the approved source policy:
 * detailedDesigns: {index, withdrawn: [{design, reason, files: {ORIGINAL: ARCHIVE}}]}, paths relative to the repository.
 * Returns the original-to-archive map of every declared design the committed index shows withdrawn while no design
 * is effective. An effective design restores the full gate on every path.
 */
export function sourceWithdrawals(spec,read,readApproved=()=>null){
  if(spec===undefined)return new Map();
  check(onlyKeys(spec,['index','withdrawn'])&&safe(spec.index)&&Array.isArray(spec.withdrawn),
    'Source detailedDesigns needs the index path and the withdrawal declarations');
  const freed=new Map(),targets=new Set();
  for(const row of spec.withdrawn){
    check(onlyKeys(row,['design','reason','files'])&&designId.test(row.design??'')&&named(row.reason)&&object(row.files)&&
      Object.entries(row.files).every(([from,to])=>safe(from)&&safe(to)&&from!==to),
      'Each source withdrawal names a design, a reason and an archive path for each file it frees');
  }
  const bytes=read(spec.index);
  if(!bytes)return freed;
  const entries=readIndex(bytes,'detailed design index').designs;
  if(entries.some(e=>e.status==='effective'))return freed;
  // The candidate index cannot retire the approved effective design by itself: that design must be declared and withdrawn.
  const approved=readApproved(spec.index);
  const held=approved?readIndex(approved,'approved detailed design index').designs.filter(e=>e.status==='effective'):[];
  if(held.some(h=>entries.find(e=>e.design===h.design)?.status!=='withdrawn'||!spec.withdrawn.some(w=>w.design===h.design)))return freed;
  for(const row of spec.withdrawn){
    const entry=entries.find(e=>e.design===row.design);
    if(entry?.status!=='withdrawn')continue;
    check(entry.reason===row.reason,'The withdrawal reason differs from the approved declaration: '+row.design);
    for(const [from,to] of Object.entries(row.files)){
      check(!freed.has(from)&&!targets.has(to)&&!Object.hasOwn(row.files,to),'Give each withdrawn file its own archive path: '+from);
      freed.set(from,to);targets.add(to);
    }
  }
  return freed;
}

// Author-side commands -------------------------------------------------------------------------------------------

const readJson=file=>parse(readFileSync(file),file);
function loadIndex(tree,policy){
  const file=path.join(tree,'designs.json');
  return existsSync(file)?readIndex(readFileSync(file),'detailed design index'):{designs:[]};
}
function treeFiles(dir){
  const files=new Map();
  if(!existsSync(dir))return files;
  (function walk(folder,prefix){
    for(const item of readdirSync(folder,{withFileTypes:true})){
      check(!item.isSymbolicLink(),'Redirected file: '+prefix+item.name);
      if(item.isDirectory())walk(path.join(folder,item.name),prefix+item.name+'/');
      else files.set(prefix+item.name,readFileSync(path.join(folder,item.name)));
    }
  })(dir,'');
  return files;
}
/** Recompute the primary view, then write the index and the stock catalog page. */
function saveIndex(site,policy,index,prelimRoot){
  const tree=path.join(site,policy.root),state=preliminaryState(treeFiles(path.join(site,prelimRoot)));
  mkdirSync(tree,{recursive:true});
  writeFileSync(path.join(tree,'designs.json'),writeIndex(index.designs,policy.preliminaryIndex));
  if(!existsSync(path.join(tree,'index.html')))writeFileSync(path.join(tree,'index.html'),readFileSync(catalog));
  return {...index,...primaryView(index.designs),warnings:relinkWarnings(index.designs,state)};
}
function sitePolicy(file){
  const policy=readJson(file),prelim=policy.preliminaryReleases;
  check(object(prelim)&&safe(prelim.root)&&Array.isArray(prelim.primaryEntryPoints),'The site policy needs preliminaryReleases');
  const inside=n=>n===prelim.root||n.startsWith(prelim.root+'/');
  return {prelimRoot:prelim.root,policy:detailedPolicy(policy.detailedDesigns,{root:prelim.root,inside,primary:new Set(prelim.primaryEntryPoints)},
    policy.modelFiles??[],[])};
}

/**
 * Stage a new in-progress design from checked inputs. The receipt's STEP must be the export the registered Fusion
 * design replays to, and the linked preliminary release must be effective.
 */
export function stageInProgress({site,policyFile,design,inputs,release,project,authority,lineage,python}){
  const {policy,prelimRoot}=sitePolicy(policyFile);
  check(policy,'Add detailedDesigns to the site policy');
  const replay=JSON.parse(execFileSync(python??process.env.PYTHON??(process.platform==='win32'?'python':'python3'),
    [fileURLToPath(new URL('./fusion_authority.py',import.meta.url)),project,authority,lineage],{encoding:'utf8'}));
  const files=treeFiles(inputs),need=name=>{check(files.has(name),'Detailed design input is missing '+name);return files.get(name);};
  const receipt=parse(need('receipt.json'),'receipt'),missions=parse(need('missions.json'),'mission cases');
  check(receipt.step?.sha256===replay.stepSha256,'The layout check ran on a STEP other than the registered Fusion export');
  const viewName=receipt.view.file,prelimTree=treeFiles(path.join(site,prelimRoot));
  const linked=prelimTree.get('releases/'+release+'/release.json'),linkedReceipt=prelimTree.get('releases/'+release+'/receipt.json');
  check(linked&&linkedReceipt,'Preliminary release '+release+' is not published in '+prelimRoot);
  const out=new Map([['index.html',need(viewName)],['receipt.json',files.get('receipt.json')],['motion.json',need(receipt.motion.file)],
    ['budgets.json',need(receipt.budgets.source.file)],['limits.json',need(receipt.budgets.limits.file)]]);
  for(const pin of [receipt.view.geometry,receipt.view.scene])if(pin?.file)out.set(pin.file,need(pin.file));
  const digest=name=>createHash('sha256').update(readFileSync(path.join(project,name))).digest('hex');
  const record={schema:designSchema,design,issue:receipt.issue,label:labels['in-progress'],
    preliminary:{release,sha256:sha(linked),receiptSha256:sha(linkedReceipt)},
    fusion:{authoritySha256:digest(authority),lineageSha256:digest(lineage),archiveSha256:replay.archiveSha256,stepSha256:replay.stepSha256,
      configuration:replay.configuration,...(replay.revision?{revision:replay.revision}:{})},
    receipt:{file:'receipt.json',sha256:sha(out.get('receipt.json'))},view:{file:'index.html',sha256:sha(out.get('index.html'))},
    scene:{file:'motion.json',sha256:sha(out.get('motion.json')),stepSha256:receipt.step.sha256},missionCases:missions.missionCases};
  for(const m of missions.missionCases??[])if(m?.trial?.file)out.set(m.trial.file,need(m.trial.file));
  if(Array.isArray(missions.fieldPlayers)){
    record.fieldPlayers=missions.fieldPlayers;
    for(const p of missions.fieldPlayers){out.set(p.file,need(p.file));out.set(p.trial.file,need(p.trial.file));}
  }
  out.set('design.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));
  checkInProgress(design,out,preliminaryState(prelimTree));
  const tree=path.join(site,policy.root),dir=path.join(tree,'designs',design),index=loadIndex(tree,policy);
  check(!existsSync(dir)&&!index.designs.some(e=>e.design===design),'Design '+design+' is already issued; choose a new ID');
  for(const [name,bytes] of out){mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});writeFileSync(path.join(dir,name),bytes);}
  index.designs.push({design,status:'in-progress',preliminary:release});
  return saveIndex(site,policy,index,prelimRoot);
}

/** Record a signed design as effective; the design that was effective becomes superseded. The gate requires the signed packet. */
export function markEffective({site,policyFile,design,packetFile}){
  const {policy,prelimRoot}=sitePolicy(policyFile),tree=path.join(site,policy.root),index=loadIndex(tree,policy);
  let entry=index.designs.find(e=>e.design===design);
  if(!entry){
    const body=readJson(packetFile).body;
    const record={schema:designSchema,design,label:labels.effective,
      fusion:{stepSha256:body.stepSha256,archiveSha256:body.archiveSha256,configuration:body.configuration}};
    mkdirSync(path.join(tree,'designs',design),{recursive:true});
    writeFileSync(path.join(tree,'designs',design,'design.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    entry={design,status:'in-progress'};index.designs.push(entry);
  }
  check(entry.status==='in-progress','Only a new or in-progress design can become effective: '+design);
  for(const e of index.designs)if(e.status==='effective'){e.status='superseded';e.supersededBy=design;}
  entry.status='effective';
  return saveIndex(site,policy,index,prelimRoot);
}

/** Apply a withdrawal the policy declares: archive each freed file, remove freed model files and mark the design withdrawn. */
export function applyWithdrawal({site,policyFile,design}){
  const {policy,prelimRoot}=sitePolicy(policyFile),tree=path.join(site,policy.root),index=loadIndex(tree,policy);
  const declared=policy.withdrawn.get(design);
  check(declared,'Declare the withdrawal of '+design+' in the approved site policy first');
  let entry=index.designs.find(e=>e.design===design);
  if(!entry){
    check(design===policy.legacy&&!index.designs.length,'Design '+design+' is not in the index');
    entry={design,status:'effective'};index.designs.push(entry);
  }
  check(entry.status!=='withdrawn','Design '+design+' is already withdrawn');
  for(const f of declared.files){
    const target=path.join(tree,'archive',design,f);
    mkdirSync(path.dirname(target),{recursive:true});
    cpSync(path.join(site,f),target,{errorOnExist:true,force:false});
    if(!policy.primary.has(f))rmSync(path.join(site,f));
  }
  delete entry.supersededBy;
  Object.assign(entry,{status:'withdrawn',reason:declared.reason});
  return saveIndex(site,policy,index,prelimRoot);
}

/** Register the legacy design and recompute the primary view. */
export function refresh({site,policyFile}){
  const {policy,prelimRoot}=sitePolicy(policyFile),index=loadIndex(path.join(site,policy.root),policy);
  if(policy.legacy!==null&&!index.designs.length)index.designs.push({design:policy.legacy,status:'effective'});
  return saveIndex(site,policy,index,prelimRoot);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [mode,site,...rest]=process.argv.slice(2),options={};
    for(let i=0;i<rest.length;i+=2){
      check(rest[i]?.startsWith('--')&&rest[i+1]!==undefined,'Expected --option value pairs');
      options[rest[i].slice(2)]=rest[i+1];
    }
    const common={site,policyFile:options.policy,design:options.design};
    check(site&&options.policy,'Supply the site directory and --policy');
    let index;
    if(mode==='stage')index=stageInProgress({...common,inputs:options.inputs,release:options.preliminary,project:options.project,
      authority:options.authority,lineage:options.lineage});
    else if(mode==='effective')index=markEffective({...common,packetFile:options.packet});
    else if(mode==='withdraw')index=applyWithdrawal(common);
    else if(mode==='refresh')index=refresh(common);
    else throw Error('Unknown command');
    const {warnings,...shown}=index;
    for(const warning of warnings)console.error('Warning: '+warning);
    console.log(JSON.stringify(shown,null,2));
  }catch(error){
    console.error(error.message+'\nUsage: detailed-design-release.mjs stage SITE --policy POLICY --design ID --inputs DIR --preliminary RELEASE --project ROOT --authority REGISTER --lineage LINEAGE | effective SITE --policy POLICY --design ID [--packet STAGED_PACKET] | withdraw SITE --policy POLICY --design ID | refresh SITE --policy POLICY');
    process.exitCode=1;
  }
}
