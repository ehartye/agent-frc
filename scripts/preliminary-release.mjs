/** Audit work-in-progress preliminary review releases: physically checked, mission-bearing and secondary to the detailed model. */
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const releaseSchema='agent-frc/preliminary-release@1';
export const releaseLabel='Work-in-progress preliminary design';
const receiptSchema='agent-frc/preliminary-layout-result@1';
const releaseId=/^[a-z0-9][a-z0-9-]{0,63}$/;
const trialName=/^[a-z0-9][a-z0-9._-]{0,127}\.json$/;
const hex=/^[0-9a-f]{64}$/;
const reserved=['index.html','receipt.json','motion.json','release.json','budgets.json','limits.json'];
const accomplishments=['acquired','delivered','scored','climb-held'];
const kinds=['operating-case','field-interaction-trial'];
const controlCase='package-displacement-control';
const player=new URL('./package-view.html',import.meta.url);
const stableViewer=new URL('../templates/preliminary-review-index.html',import.meta.url);

function check(ok,message){if(!ok)throw Error(message);}
const lf=bytes=>bytes.toString('utf8').replace(/\r\n/g,'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const named=v=>typeof v==='string'&&v.trim().length>0;
function parse(bytes,what){
  try{return JSON.parse(bytes.toString('utf8').replace(/^﻿/,''));}catch{throw Error('Unreadable '+what);}
}
function pinMatches(pin,file,bytes){return object(pin)&&pin.file===file&&hex.test(pin.sha256)&&pin.sha256===sha(bytes);}

/** The embedded data of a genuine player built by this plugin's checker, or null. */
function playerData(html){
  const [before,after]=lf(readFileSync(player)).split('PACKAGE_DATA');
  const text=html.toString('utf8');
  if(!text.startsWith(before)||!text.endsWith(after)||text.length<before.length+after.length)return null;
  const middle=text.slice(before.length,text.length-after.length);
  // The checker escapes every '<' so the embedded data can never close its script element.
  if(middle.includes('<'))return null;
  try{return JSON.parse(middle);}catch{return null;}
}
const canonical=v=>JSON.stringify(v,(k,x)=>object(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);
const same=(a,b)=>canonical(a)===canonical(b);
/** True when a value nests a glTF document, a data URI or a base64 glTF binary. */
function payload(value){
  if(typeof value==='string')return /^data:/i.test(value)||value.startsWith('Z2xURg');
  if(Array.isArray(value))return value.some(payload);
  if(!object(value))return false;
  if(Object.hasOwn(value,'asset')&&['buffers','meshes','accessors'].some(k=>Object.hasOwn(value,k)))return true;
  return Object.values(value).some(payload);
}
/** Parse a published JSON file and refuse a model or encoded payload hiding under an evidence name. */
function evidence(bytes,what,shape){
  const value=parse(bytes,what);
  check(object(value)&&!payload(value)&&(!shape||shape(value)),'Published '+what+' is not the expected evidence JSON');
  return value;
}

/**
 * The physics gate on a preliminary-check receipt: layout-checked, every nominal clearance case, the mass
 * budget and every loaded-voltage case pass, the displaced control is rejected and nothing is missing.
 */
export function checkPhysics(receipt,id){
  check(receipt?.schema===receiptSchema&&named(receipt.issue),'Release '+id+' needs an Agent FRC preliminary-check receipt');
  check(receipt.status==='layout-checked','Preliminary release '+id+' needs a layout-checked receipt; found '+receipt.status);
  check(receipt.partial!==true,'A partial --fail-fast receipt cannot be released: '+id);
  check(Array.isArray(receipt.missingInputs)&&receipt.missingInputs.length===0,'Receipt '+id+' lists missing inputs');
  check(Array.isArray(receipt.reopen)&&receipt.reopen.length===0,'Receipt '+id+' holds a reopened premise');
  const cases=Array.isArray(receipt.cases)?receipt.cases:[];
  check(cases.length&&cases.every(c=>object(c)&&named(c.case)&&c.status==='pass'),
    'Receipt '+id+' needs every nominal clearance case to pass');
  const control=receipt.control;
  check(object(control)&&object(control.witness)&&control.witness.status==='fail'&&Array.isArray(control.witness.pair),
    'Receipt '+id+' needs the displaced control to be rejected');
  const budgets=receipt.budgets;
  check(object(budgets)&&budgets.massStatus==='pass','Receipt '+id+' needs a passing inspection mass budget');
  check(Array.isArray(budgets.electricalCases)&&budgets.electricalCases.length&&budgets.electricalCases.every(r=>r?.status==='pass'),
    'Receipt '+id+' needs every loaded-voltage case to pass');
}

/**
 * A new source-side release input directory, as a map of directory-relative name to bytes. Its layout and
 * every input the receipt pins, including the STEP, must match their digests in a layout-checked receipt.
 */
export function checkSourceInputs(id,files){
  check(releaseId.test(id),'Invalid preliminary release ID: '+id);
  const need=name=>{check(files.has(name),'Preliminary input '+id+' is missing '+name);return files.get(name);};
  const receipt=parse(need('receipt.json'),'receipt: '+id);
  checkPhysics(receipt,id);
  const pins=[['layout.json',receipt.planSha256],...[receipt.step,receipt.motion,receipt.view,receipt.budgets.source,receipt.budgets.limits]
    .map(p=>[p?.file,p?.sha256])];
  for(const [name,digest] of pins){
    check(typeof name==='string'&&files.has(name)&&hex.test(digest??'')&&sha(files.get(name))===digest,
      'Preliminary input '+id+'/'+name+' differs from its receipt');
  }
  check(receipt.view.verified===true,'Preliminary input '+id+' needs a verified view');
  const plan=parse(files.get('layout.json'),'layout: '+id);
  check(same(plan.step,receipt.step)&&same(plan.motion,receipt.motion),'Preliminary input '+id+'/layout.json differs from its receipt');
  return {step:receipt.step.file};
}

/**
 * Check one release directory, given as a map of file name to bytes.
 * Physics: the receipt is layout-checked with nominal clearance, mass and voltage passing, the displaced
 * control rejected and no missing inputs. Mission: at least one passing, playable operating case or
 * receipt-bound field-interaction trial accomplishes a represented narrative objective.
 */
export function checkRelease(id,files){
  check(releaseId.test(id),'Invalid preliminary release ID: '+id);
  check(files.has('release.json'),'Preliminary release '+id+' has no release record (release.json)');
  const record=parse(files.get('release.json'),'release record: '+id);
  check(record?.schema===releaseSchema&&record.release===id,'Release record names a different schema or release: '+id);
  check(record.label===releaseLabel,'Label release '+id+' "'+releaseLabel+'"');
  const trials=new Set();
  const missions=record.missionCases;
  for(const m of Array.isArray(missions)?missions:[]){
    if(object(m)&&m.kind==='field-interaction-trial'&&object(m.trial))trials.add(m.trial.file);
    else check(!object(m)||m.trial===undefined,'Only a field-interaction-trial mission case can publish a trial: '+id);
  }
  for(const name of files.keys()){
    check(reserved.includes(name)||trials.has(name)&&trialName.test(name)&&!reserved.includes(name),
      'Unrecognized preliminary output: releases/'+id+'/'+name);
  }
  for(const name of ['index.html','receipt.json','motion.json','budgets.json','limits.json'])
    check(files.has(name),'Preliminary release '+id+' is missing '+name);
  const receiptBytes=files.get('receipt.json'),view=files.get('index.html'),scene=files.get('motion.json');
  evidence(scene,'scene: '+id,v=>Array.isArray(v.cases));
  evidence(files.get('budgets.json'),'budget ledger: '+id,v=>Array.isArray(v.masses)&&object(v.electricalCases));
  evidence(files.get('limits.json'),'limits: '+id,v=>typeof v.inspectionLimitKg==='number');
  check(pinMatches(record.receipt,'receipt.json',receiptBytes),'Release record does not pin the published receipt: '+id);
  const receipt=parse(receiptBytes,'receipt: '+id);
  check(receipt?.schema===receiptSchema&&named(receipt.issue)&&record.issue===receipt.issue,
    'Release '+id+' needs an Agent FRC preliminary-check receipt for its issue');

  // Physics gate.
  check(record.status==='layout-checked','Preliminary release '+id+' needs a layout-checked receipt; found '+record.status);
  checkPhysics(receipt,id);
  const cases=receipt.cases,budgets=receipt.budgets;
  check(object(budgets.source)&&budgets.source.sha256===sha(files.get('budgets.json'))&&
    object(budgets.limits)&&budgets.limits.sha256===sha(files.get('limits.json')),'Published budgets differ from the receipt: '+id);

  // Scene and view digests.
  check(object(record.scene)&&pinMatches(record.scene,'motion.json',scene)&&object(receipt.motion)&&receipt.motion.sha256===record.scene.sha256&&
    object(receipt.step)&&hex.test(receipt.step.sha256)&&record.scene.stepSha256===receipt.step.sha256,
    'Published scene differs from the receipt and release record: '+id);
  check(pinMatches(record.view,'index.html',view)&&object(receipt.view)&&receipt.view.verified===true&&receipt.view.sha256===record.view.sha256,
    'Published view differs from the receipt and release record: '+id);
  const data=playerData(view);
  check(data&&data.issue===receipt.issue&&JSON.stringify(data.step)===JSON.stringify(receipt.step)&&
    JSON.stringify(data.motion)===JSON.stringify(receipt.motion)&&object(data.evidence),
    'Published view is not this plugin\'s checked player for the receipt: '+id+'. Regenerate it with --write-view');
  // Everything the player displays as a result must be the receipt's result.
  // The player also shows the displaced control, which the receipt reports separately as rejected.
  const shown=Object.keys(data.evidence).filter(k=>k!==controlCase);
  check(same(shown.sort(),cases.map(c=>c.case).sort())&&cases.every(c=>data.evidence[c.case]?.status===c.status)&&
    (!Object.hasOwn(data.evidence,controlCase)||data.evidence[controlCase]?.status==='fail')&&
    same(data.narrativeReview?.objectives??[],receipt.narrativeReview?.objectives??[])&&
    Array.isArray(data.power)&&same(data.power.map(r=>[r?.case,r?.status]),budgets.electricalCases.map(r=>[r.case,r.status]))&&
    object(data.mass)&&same(data.mass.range,budgets.inspectionKg)&&same(data.mass.remaining,budgets.remainingKg),
    'Published view shows results that differ from the receipt: '+id);

  // Mission gate.
  check(Array.isArray(missions)&&missions.length,'Release '+id+' declares no mission-task case');
  const objectives=Array.isArray(receipt.narrativeReview?.objectives)?receipt.narrativeReview.objectives:[];
  const played=new Set((Array.isArray(data.cases)?data.cases:[]).map(c=>c?.id));
  for(const m of missions){
    check(object(m)&&named(m.case)&&kinds.includes(m.kind)&&accomplishments.includes(m.accomplishes)&&named(m.objective),
      'Each mission case needs a case, kind ('+kinds.join(', ')+'), accomplishment ('+accomplishments.join(', ')+') and objective: '+id);
    const where='mission case '+m.case+' in '+id;
    check(objectives.some(o=>o?.objective===m.objective&&o.disposition==='represented'),
      'The '+where+' must accomplish a represented narrative objective');
    check(receipt.stages?.[m.case]?.purpose==='operating'&&Array.isArray(receipt.cycle)&&receipt.cycle.includes(m.case),
      'The '+where+' must be an operating case in the checked cycle');
    check(cases.some(c=>c.case===m.case&&c.status==='pass')&&data.evidence[m.case]?.status==='pass'&&played.has(m.case),
      'The '+where+' needs passing evidence played in the checked view');
    if(m.kind==='field-interaction-trial'){
      const t=m.trial;
      check(object(t)&&trialName.test(t.file??'')&&files.has(t.file)&&pinMatches(t,t.file,files.get(t.file)),
        'Publish the pinned field-interaction trial for the '+where);
      const bound=Object.values(receipt.stages[m.case].transportedBy??{}).some(s=>s?.evidence?.sha256===t.sha256);
      check(bound&&evidence(files.get(t.file),'trial: '+id).transport?.case===m.case,
        'The field-interaction trial for the '+where+' is not the one the receipt pins');
    }
  }
  return {release:id,issue:receipt.issue,status:receipt.status,missionCases:missions.map(m=>m.case)};
}

function readTree(dir){
  const files=new Map();
  for(const d of readdirSync(dir,{withFileTypes:true})){
    check(d.isFile()&&!d.isSymbolicLink(),'Unrecognized preliminary output: '+d.name);
    files.set(d.name,readFileSync(path.join(dir,d.name)));
  }
  return files;
}
/** Author-side check of one staged release directory. */
export async function verifyRelease(dir){
  const real=realpathSync(dir);
  check(lstatSync(real).isDirectory(),'Expected a release directory');
  return checkRelease(path.basename(real),readTree(real));
}

/** Validate the trusted policy field. Paths are relative to the deployed site. */
export function preliminaryPolicy(spec,reserved){
  if(spec===undefined)return null;
  const safe=n=>typeof n==='string'&&n.length&&!n.startsWith('/')&&!n.includes('\\')&&!n.includes(':')&&
    n.split('/').every(x=>x&&x!=='.'&&x!=='..'&&x!=='.git');
  check(object(spec)&&safe(spec.root)&&Array.isArray(spec.primaryEntryPoints)&&spec.primaryEntryPoints.length&&
    spec.primaryEntryPoints.every(safe)&&new Set(spec.primaryEntryPoints).size===spec.primaryEntryPoints.length&&
    Object.keys(spec).every(k=>['root','primaryEntryPoints','secondaryLink'].includes(k)),
    'preliminaryReleases needs a root and the approved primary entry points');
  check(spec.secondaryLink===undefined||spec.primaryEntryPoints.includes(spec.secondaryLink)&&/\.html?$/.test(spec.secondaryLink),
    'preliminaryReleases.secondaryLink must name a primary entry page (HTML)');
  const inside=n=>n===spec.root||n.startsWith(spec.root+'/');
  check(![...spec.primaryEntryPoints,...reserved].some(inside),'Keep primary, model and field outputs outside the preliminary tree');
  return {root:spec.root,primary:new Set(spec.primaryEntryPoints),inside,secondaryLink:spec.secondaryLink};
}

/**
 * True when the candidate page equals the approved page plus exactly one plain anchor to the preliminary
 * tree: <a href="ROOT/">text</a>, relative, no other attributes and text only.
 */
export function addsOnlySecondaryLink(approved,candidate,root){
  const before=lf(approved),after=lf(candidate);
  const escaped=root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const anchor=new RegExp('<a href="'+escaped+'/">[A-Za-z0-9 .,()-]{1,80}</a>','g');
  const found=[...after.matchAll(anchor)];
  const delta=after.length-before.length;
  if(found.length!==1||delta<found[0][0].length||delta>found[0][0].length+32)return false;
  // The insertion may bring up to 16 whitespace characters of its own on either side.
  const start=found[0].index,end=start+found[0][0].length;
  for(let lead=start;lead>=Math.max(0,start-16);lead--){
    const trail=lead+delta;
    if(trail<end||!/^[ \t\n]*$/.test(after.slice(lead,start))||!/^[ \t\n]*$/.test(after.slice(end,trail)))continue;
    if(after.slice(0,lead)===before.slice(0,lead)&&after.slice(trail)===before.slice(lead))
      return elementContentAt(before.slice(0,lead));
  }
  return false;
}

/** True when the HTML prefix ends in ordinary element content: not in a tag, attribute, comment or raw-text element. */
function elementContentAt(html){
  const low=html.toLowerCase();
  let i=0,raw=null;
  while(i<html.length){
    if(raw){
      const close=low.indexOf('</'+raw,i);
      if(close<0)return false;
      i=close;raw=null;continue;
    }
    if(html.startsWith('<!--',i)){
      const close=html.indexOf('-->',i+4);
      if(close<0)return false;
      i=close+3;continue;
    }
    if(html[i]==='<'&&/[A-Za-z/!?]/.test(html[i+1]??'')){
      // As a browser does: <! and <? bogus markup ends at the first '>'; a quote delimits only a value after '='.
      let j=i+1,quote=null,afterEquals=false;
      const bogus=html[i+1]==='!'||html[i+1]==='?';
      for(;j<html.length;j++){
        const c=html[j];
        if(quote){if(c===quote)quote=null;continue;}
        if(c==='>')break;
        if(bogus)continue;
        if(afterEquals&&(c==='"'||c==="'")){quote=c;afterEquals=false;continue;}
        if(c==='=')afterEquals=true;
        else if(!/[ \t\n\f\r]/.test(c))afterEquals=false;
      }
      if(j>=html.length)return false;
      const name=/^<([A-Za-z][\w-]*)/.exec(html.slice(i,j))?.[1]?.toLowerCase();
      if(['script','style','textarea','title','xmp','iframe','noscript','noembed','noframes','template','plaintext'].includes(name))raw=name;
      i=j+1;continue;
    }
    i++;
  }
  return true;
}

/**
 * Compare the preliminary tree of an approved and candidate site.
 * read(folder,name) returns bytes; oldNames and newNames are the tree-relative inventories.
 */
export function auditTree(oldFiles,newFiles){
  const group=files=>{
    const top=new Map(),releases=new Map();
    for(const [name,bytes] of files){
      const parts=name.split('/');
      if(parts.length===1){
        check(['index.html','releases.json'].includes(name),'Unrecognized preliminary output: '+name);
        top.set(name,bytes);
      }else{
        check(parts.length===3&&parts[0]==='releases'&&releaseId.test(parts[1]),'Unrecognized preliminary output: '+name);
        if(!releases.has(parts[1]))releases.set(parts[1],new Map());
        releases.get(parts[1]).set(parts[2],bytes);
      }
    }
    return {top,releases};
  };
  const before=group(oldFiles),after=group(newFiles);
  if(!newFiles.size&&!oldFiles.size)return {releases:[],added:[],current:null};
  for(const [id,files] of before.releases){
    const now=after.releases.get(id);
    check(now&&now.size===files.size&&[...files].every(([n,b])=>now.has(n)&&Buffer.compare(now.get(n),b)===0),
      'An earlier preliminary release changed or was removed: '+id);
  }
  const viewer=after.top.get('index.html');
  check(viewer,'Publish the stable preliminary viewer (index.html)');
  const approvedViewer=before.top.has('index.html')&&Buffer.compare(before.top.get('index.html'),viewer)===0;
  check(approvedViewer||lf(readFileSync(stableViewer))===lf(viewer),
    'The stable preliminary viewer must equal the approved copy or this plugin\'s template');
  check(after.top.has('releases.json'),'Publish the preliminary release index (releases.json)');
  const index=parse(after.top.get('releases.json'),'preliminary release index');
  const ids=index?.releases;
  check(object(index)&&['current,releases','current,legacy,releases'].includes(Object.keys(index).sort().join())&&Array.isArray(ids)&&ids.length&&
    ids.every(i=>typeof i==='string'&&releaseId.test(i))&&new Set(ids).size===ids.length&&ids.includes(index.current),
    'The preliminary release index needs unique release IDs and a listed current release');
  // Releases deployed before release records existed may be named as legacy, but only if already approved.
  check(index.legacy===undefined||Array.isArray(index.legacy)&&index.legacy.every((i,n)=>ids[n]===i&&before.releases.has(i)),
    'Only releases already in the approved site can be listed as legacy');
  if(before.top.has('releases.json')){
    const prior=parse(before.top.get('releases.json'),'approved preliminary release index').releases;
    check(Array.isArray(prior)&&prior.every((p,i)=>ids[i]===p),'Preliminary releases may only append; keep every earlier entry in order');
  }
  check(ids.length===after.releases.size&&ids.every(i=>after.releases.has(i)),'The preliminary release index and release directories disagree');
  const added=ids.filter(i=>!before.releases.has(i));
  check(!added.length||lf(viewer).includes('id="wip"')&&lf(viewer).includes(releaseLabel),
    'Update the stable preliminary viewer to this plugin\'s template so new releases show the work-in-progress label');
  for(const id of added)checkRelease(id,after.releases.get(id));
  return {releases:ids,added,current:index.current};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [mode,dir,...rest]=process.argv.slice(2);
    if(mode==='verify'&&dir&&!rest.length)console.log(JSON.stringify(await verifyRelease(dir),null,2));
    else throw Error('Usage: preliminary-release.mjs verify RELEASE_DIRECTORY');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
