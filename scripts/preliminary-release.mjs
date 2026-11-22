/** Audit preliminary design releases: physically checked, mission-bearing and secondary to the detailed model. */
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {statusOf,currentFor,transitionAllowed,designStatuses} from './design-status.mjs';
import {compareWithLedger,compareWithReceipt,maxSceneBytes,readScene,sceneSchemaId,validateScene} from './review-scene.mjs';

export const releaseSchema='agent-frc/preliminary-release@1';
export const releasePhase='preliminary-design';
/** Text the stock page and viewer display; shown to readers and reported for information, never checked by the gate. */
export const phaseText='Preliminary design';
// The design-status vocabulary and transition table, shared with every design phase's gate.
export {designStatuses,statusOf,currentFor,transitions,transitionAllowed} from './design-status.mjs';
const receiptSchema='agent-frc/preliminary-layout-result@1';
const releaseId=/^[a-z0-9][a-z0-9-]{0,63}$/;
const trialName=/^[a-z0-9][a-z0-9._-]{0,127}\.json$/;
const fieldName=/^field\/[a-z0-9][a-z0-9._-]{0,110}\.html$/;
const sceneFile='review-scene.json.gz';
const hex=/^[0-9a-f]{64}$/;
const reserved=['index.html','receipt.json','motion.json','release.json','budgets.json','limits.json'];
const accomplishments=['acquired','delivered','scored','climb-held'];
const kinds=['operating-case','field-interaction-trial'];
const controlCase='package-displacement-control';
const page=new URL('../templates/preliminary-review/review.html',import.meta.url);
const stableViewer=new URL('../templates/preliminary-review-index.html',import.meta.url);
const fontDirectory=new URL('../templates/preliminary-review-fonts/',import.meta.url);
/** The bundled theme fonts and their licenses, as distributed with this plugin. */
const bundledFonts=()=>new Map(readdirSync(fontDirectory).map(n=>[n,readFileSync(new URL(n,fontDirectory))]));

function check(ok,message){if(!ok)throw Error(message);}
const lf=bytes=>bytes.toString('utf8').replace(/\r\n/g,'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const named=v=>typeof v==='string'&&v.trim().length>0;
function parse(bytes,what){
  try{return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Error('Unreadable '+what);}
}
function pinMatches(pin,file,bytes){return object(pin)&&pin.file===file&&hex.test(pin.sha256)&&pin.sha256===sha(bytes);}

/**
 * Information only: how a release page compares with this plugin's stock review page. Seasons may change their
 * copy; the gate never compares page markup or script, which the season's own pull request review covers.
 */
export function compareTemplate(html){
  const own=lf(html),stock=lf(readFileSync(page));
  const csp=/<meta http-equiv="Content-Security-Policy"/i.test(own);
  if(own===stock)return {stock:true,csp,differences:[]};
  const a=own.split('\n'),b=stock.split('\n'),differences=[];
  for(let i=0;i<Math.max(a.length,b.length)&&differences.length<20;i++)if(a[i]!==b[i])differences.push({line:i+1,page:a[i]??null,stock:b[i]??null});
  return {stock:false,csp,differences};
}
/** A record issued before releases named their phase carried this label; it still identifies the phase. */
export const issuedLabel='Work-in-progress preliminary design';

/**
 * The release index's design statuses and each change against the approved index. Allowed: in-progress to effective,
 * the previous effective to superseded (required when another becomes effective), any to withdrawn. Nothing returns
 * from superseded or withdrawn. A release made effective after an earlier effective one must have been checked
 * against it: its receipt's previousCheckpointSha256 is the earlier release's receipt digest.
 */
export function checkStatusChange(before,after,receipts,{historical=new Set(),legacy=[]}={}){
  const ids=after.releases,map=after.designStatus,st=(index,i)=>statusOf(index,i,historical);
  check(map===undefined||object(map)&&Object.entries(map).every(([id,v])=>ids.includes(id)&&designStatuses.includes(v)),
    'designStatus maps listed release IDs to '+designStatuses.join(', '));
  // Every release ever made effective, in order. It only grows, so withdrawing an effective release first cannot
  // skip the predecessor check for the next one.
  const history=after.effectiveHistory??[],priorHistory=before?.effectiveHistory??[];
  check(Array.isArray(history)&&history.every(i=>ids.includes(i))&&new Set(history).size===history.length&&
    priorHistory.every((i,n)=>history[n]===i),'effectiveHistory lists each release made effective once, in order, and only grows');
  const effective=ids.filter(i=>st(after,i)==='effective');
  check(effective.length<=1,'At most one preliminary design release is effective');
  check(effective.every(i=>history.at(-1)===i),'The effective release must be the last entry in effectiveHistory');
  check(after.current===currentFor(after,historical),'current must open the effective release, else the newest in-progress one: expected '+currentFor(after,historical));
  const was=id=>before?.releases?.includes(id)?st(before,id):null;
  const promoted=ids.filter(i=>st(after,i)==='effective'&&was(i)!=='effective');
  for(const id of ids){
    const from=was(id),to=st(after,id);
    check(transitionAllowed(from,to,{promoted:promoted.length>0})||from===null&&historical.has(id)&&to==='superseded',
      from===null?'A new preliminary release enters in progress or effective: '+id:'Preliminary release '+id+' cannot move from '+from+' to '+to);
    if(to==='effective'&&from!=='effective'){
      check(!legacy.includes(id)&&!historical.has(id),'A legacy or historical release cannot become effective: '+id);
      const r=receipts.get(id);
      check(r&&parse(r,'receipt: '+id).status==='layout-checked','An effective preliminary release needs a layout-checked receipt: '+id);
      check(!priorHistory.includes(id),'A release cannot become effective again: '+id);
      const predecessor=priorHistory.at(-1);
      if(predecessor){
        check(st(after,predecessor)!=='effective','Mark the previous effective release '+predecessor+' superseded when '+id+' becomes effective');
        const prior=receipts.get(predecessor),mine=parse(r,'receipt: '+id);
        check(prior&&mine.previousCheckpointSha256===sha(prior)&&Array.isArray(mine.priorDecisions)&&mine.priorDecisions.every(d=>d?.repeatVerified===true),
          'An effective release must be checked against the previous effective one, '+predecessor+' (--previous its receipt, every held decision repeat-verified): '+id);
      }
      check(history.at(-1)===id&&history.length===priorHistory.length+1,'Append '+id+' to effectiveHistory when it becomes effective');
    }
  }
  check(promoted.length||history.length===priorHistory.length,'effectiveHistory grows only when a release becomes effective');
  return {effective:effective[0]??null,current:after.current};
}
/**
 * The review scene the page reads, when the receipt pins its exact served bytes and content and it is a valid
 * scene that repeats the receipt's results; otherwise the reason it is refused.
 */
function pinnedScene(bytes,receipt){
  const pin=receipt?.view?.scene;
  if(!object(pin)||pin.file!==sceneFile||!hex.test(pin.sha256??'')||!hex.test(pin.contentSha256??'')||!Number.isSafeInteger(pin.bytes)||pin.bytes<1||pin.bytes>maxSceneBytes)
    return {error:'The receipt does not pin '+sceneFile};
  if(!bytes||sha(bytes)!==pin.sha256)return {error:'Published review scene differs from its receipt pin'};
  let read;
  try{read=readScene(bytes,pin.bytes+1);}catch{return {error:'Published review scene does not decompress within its pinned size'};}
  if(read.bytes!==pin.bytes||read.contentSha256!==pin.contentSha256)return {error:'Published review scene content differs from its receipt pin'};
  const {errors}=validateScene(read.scene);
  if(errors.length)return {error:'Published review scene is not a valid '+sceneSchemaId+': '+errors.slice(0,3).join('; ')};
  const differ=compareWithReceipt(read,receipt);
  if(differ.length)return {error:'Published review scene shows results that differ from the receipt: '+differ.join('; ')};
  return {scene:read.scene};
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

const solidBodies=new Set(['MANIFOLD_SOLID_BREP','BREP_WITH_VOIDS','FACETED_BREP']);
// Shape carriers a body count would miss: surface, wireframe and tessellated models, and instanced assemblies.
const refusedShapes=/^(?:SHELL_BASED_SURFACE_MODEL|FACE_BASED_SURFACE_MODEL|GEOMETRIC_CURVE_SET|GEOMETRIC_SET|TESSELLATED_\w+|TRIANGULATED_\w+|COMPLEX_TRIANGULATED_\w+|MANIFOLD_SURFACE_SHAPE_REPRESENTATION|GEOMETRICALLY_BOUNDED_\w+|MAPPED_ITEM|REPRESENTATION_MAP|NEXT_ASSEMBLY_USAGE_OCCURRENCE|CONTEXT_DEPENDENT_SHAPE_REPRESENTATION|\w*WIREFRAME\w*|SHAPE_REPRESENTATION_RELATIONSHIP|REPRESENTATION_RELATIONSHIP\w*)$/;
/**
 * Products and solid bodies in a STEP file, read per instance with comments removed and strings respected.
 * A product name with a STEP escape, a product inside a complex instance or a refused shape carrier is reported.
 */
export function stepProducts(bytes){
  const text=bytes.toString('latin1'),instances=[];
  let current='';
  for(let i=0;i<text.length;){
    if(text[i]==="'"){
      let j=i+1;
      while(j<text.length&&!(text[j]==="'"&&text[j+1]!=="'"))j+=text[j]==="'"?2:1;
      current+=text.slice(i,j+1);i=j+1;continue;
    }
    if(text.startsWith('/*',i)){const e=text.indexOf('*/',i+2);i=e<0?text.length:e+2;current+=' ';continue;}
    if(text[i]===';'){instances.push(current);current='';i++;continue;}
    current+=text[i++];
  }
  const products=[];let bodies=0,refused=null;
  // Every shape representation must be reached from a product through PRODUCT_DEFINITION_FORMATION,
  // PRODUCT_DEFINITION, PRODUCT_DEFINITION_SHAPE and SHAPE_DEFINITION_REPRESENTATION; the loader transfers
  // any other representation as an unnamed free shape.
  const representations=new Set(),entities=new Map(),productRefs=[];
  for(const instance of instances){
    const blank=instance.replace(/'(?:[^']|'')*'/g,"''");
    const keywords=[...blank.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(m=>m[1].toUpperCase());
    const ref=/^\s*(#\d+)\s*=/.exec(blank)?.[1]??'unnumbered';
    const args=blank.slice(blank.indexOf('=')+1);
    entities.set(ref,{type:keywords[0],refs:[...args.matchAll(/#\d+/g)].map(m=>m[0])});
    if(keywords.some(k=>k!=='SHAPE_DEFINITION_REPRESENTATION'&&/SHAPE_REPRESENTATION$/.test(k)))representations.add(ref);
    if(keywords[0]==='PRODUCT')productRefs.push(ref);
    for(const k of keywords){
      if(solidBodies.has(k))bodies++;
      if(refusedShapes.test(k))refused??=k;
    }
    if(!keywords.includes('PRODUCT'))continue;
    const simple=/^\s*#\d+\s*=\s*PRODUCT\s*\(\s*'((?:[^']|'')*)'/i.exec(instance);
    if(!simple||keywords.filter(k=>k==='PRODUCT').length!==1){refused??='complex PRODUCT';continue;}
    const name=simple[1].replace(/''/g,"'");
    if(name.includes('\\'))refused??='escaped product name';
    products.push(name);
  }
  const referrers=(targets,test)=>new Set([...entities].filter(([,e])=>test(e.type)&&e.refs.some(r=>targets.has(r))).map(([id])=>id));
  const reached=new Set();
  for(const product of productRefs){
    const formations=referrers(new Set([product]),t=>/^PRODUCT_DEFINITION_FORMATION/.test(t??''));
    const definitions=referrers(formations,t=>/^PRODUCT_DEFINITION(?:_WITH_ASSOCIATED_DOCUMENTS)?$/.test(t??''));
    const shapes=referrers(definitions,t=>t==='PRODUCT_DEFINITION_SHAPE');
    let own=0;
    for(const [,e] of entities)if(e.type==='SHAPE_DEFINITION_REPRESENTATION'&&shapes.has(e.refs[0])&&representations.has(e.refs[1])){reached.add(e.refs[1]);own++;}
    if(own!==1)refused??='a fixture product without exactly one shape representation';
  }
  if([...representations].some(r=>!reached.has(r)))refused??='a shape representation no fixture product reaches';
  return {products,bodies,refused};
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
  // Field fixture STEPs: named by the motion study the receipt pins, holding only registered fixture solids,
  // never a robot member and never robot mass.
  const motion=parse(files.get(receipt.motion.file),'motion study: '+id),sources=new Map();
  for(const c of Array.isArray(motion?.cases)?motion.cases:[])for(const f of Array.isArray(c?.fixtures)?c.fixtures:[]){
    check(object(f)&&named(f.id)&&named(f.solid)&&object(f.file)&&named(f.file.file),'Each fixture names an id, a solid and a pinned source: '+id);
    const name=f.file.file,entry=sources.get(name)??{sha256:f.file.sha256,ids:new Set(),solids:new Set()};
    check(entry.sha256===f.file.sha256,'Field fixture source '+id+'/'+name+' is pinned with two digests');
    entry.ids.add(f.id);entry.solids.add(f.solid);sources.set(name,entry);
  }
  const fixtures=[];
  if(!sources.size)return {step:receipt.step.file,fixtures};
  const fixtureIds=new Set([...sources.values()].flatMap(e=>[...e.ids]));
  const fixtureSolids=new Set([...sources.values()].flatMap(e=>[...e.solids]));
  check(object(receipt.groups),'Register the field fixtures in the receipt groups: '+id);
  const grouped=new Set(),robotMembers=new Set();
  for(const g of Object.values(receipt.groups)){
    const members=Array.isArray(g?.members)?g.members:[];
    if(!members.some(m=>fixtureIds.has(m))){members.forEach(m=>robotMembers.add(m));continue;}
    check(g.role==='other'&&members.every(m=>fixtureIds.has(m)),'A field fixture is registered as a robot member: '+id);
    members.forEach(m=>grouped.add(m));
  }
  check([...fixtureIds].every(m=>grouped.has(m)),'Register every field fixture in an other-role fixture group: '+id);
  const packageProducts=new Set(stepProducts(files.get(receipt.step.file)).products);
  check(![...fixtureIds,...fixtureSolids].some(n=>robotMembers.has(n)||packageProducts.has(n)),
    'A field fixture names a robot member or package solid: '+id);
  const ledger=parse(files.get(receipt.budgets.source.file),'budgets: '+id);
  for(const line of Array.isArray(ledger?.masses)?ledger.masses:[]){
    const members=Array.isArray(line?.members)?line.members:[];
    if(members.some(m=>fixtureIds.has(m)))check(members.every(m=>fixtureIds.has(m))&&same(line.kg,[0,0]),
      'A field fixture carries robot mass: '+id);
  }
  for(const [name,{sha256:digest,solids}] of sources){
    check(name!==receipt.step.file&&!name.includes('/')&&/\.(?:step|stp)$/i.test(name)&&files.has(name)&&hex.test(digest??'')&&
      sha(files.get(name))===digest,'Field fixture source '+id+'/'+name+' differs from the motion study the receipt pins');
    // The checker's loader names each solid by its STEP product; every product and body must be a registered fixture.
    const {products,bodies,refused}=stepProducts(files.get(name));
    check(!refused&&products.length&&new Set(products).size===products.length&&products.every(n=>solids.has(n))&&bodies===products.length,
      'Every solid in '+id+'/'+name+' must be a registered fixture'+(refused?' ('+refused+')':''));
    fixtures.push(name);
  }
  return {step:receipt.step.file,fixtures};
}

/** The one Content-Security-Policy a season field player declares, compared byte for byte. */
export const fieldPlayerPolicy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'";
const rawText=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript','plaintext']);
const bannedTags=new Set(['iframe','frame','frameset','object','embed','portal','base','link','applet','form','area','math','foreignobject']);
const resourceAttrs=new Set(['src','srcset','poster','background','data','action','formaction','ping','xlink:href']);

// Start tags that leave SVG foreign content and return the parser to HTML (the HTML standard's breakout list).
const breakout=new Set(['b','big','blockquote','body','br','center','code','dd','div','dl','dt','em','embed','h1','h2','h3','h4','h5','h6',
  'head','hr','i','img','li','listing','menu','meta','nobr','ol','p','pre','ruby','s','small','span','strong','strike','sub','sup','table',
  'tt','u','ul','var']);
const asciiLower=s=>s.replace(/[A-Z]/g,c=>c.toLowerCase());

/**
 * Start tags as a browser tokenizes them. Comments end at -->, --!> or immediately for <!--> and <!--->.
 * Raw-text bodies are skipped only in HTML content; inside <svg> they are markup, and CDATA ends at ]]>.
 * Closing tags are matched case-insensitively on the original text.
 */
export function startTags(html){
  const tags=[],space=c=>c===' '||c==='\t'||c==='\n'||c==='\f'||c==='\r',letter=c=>/^[A-Za-z]$/.test(c??'');
  let i=0,svg=0;
  const close=(name,from)=>{
    for(let p=html.indexOf('</',from);p>=0;p=html.indexOf('</',p+2))
      if(asciiLower(html.slice(p+2,p+2+name.length))===name)return p;
    return html.length;
  };
  while(i<html.length){
    if(html[i]!=='<'){i++;continue;}
    if(html.startsWith('<!--',i)){
      if(html.startsWith('<!-->',i)){i+=5;continue;}
      if(html.startsWith('<!--->',i)){i+=6;continue;}
      const a=html.indexOf('-->',i+4),b=html.indexOf('--!>',i+4);
      const end=[a<0?Infinity:a+3,b<0?Infinity:b+4].reduce((x,y)=>Math.min(x,y));
      i=end===Infinity?html.length:end;continue;
    }
    if(svg&&html.startsWith('<![CDATA[',i)){const e=html.indexOf(']]>',i+9);i=e<0?html.length:e+3;continue;}
    const next=html[i+1]??'';
    if(next==='/'&&letter(html[i+2])){
      let j=i+2;
      while(j<html.length&&!space(html[j])&&html[j]!=='/'&&html[j]!=='>')j++;
      const name=asciiLower(html.slice(i+2,j));
      if(svg&&name==='svg')svg--;
      else if(svg&&(name==='p'||name==='br'))svg=0;
      const e=html.indexOf('>',j);i=e<0?html.length:e+1;continue;
    }
    if(next==='!'||next==='?'||next==='/'){const e=html.indexOf('>',i+1);i=e<0?html.length:e+1;continue;}
    if(!letter(next)){i++;continue;}
    let j=i+1,selfClosing=false;
    while(j<html.length&&!space(html[j])&&html[j]!=='/'&&html[j]!=='>')j++;
    const name=asciiLower(html.slice(i+1,j)),attrs=[];
    while(j<html.length&&html[j]!=='>'){
      if(space(html[j])){j++;continue;}
      if(html[j]==='/'){selfClosing=html[j+1]==='>';j++;continue;}
      let k=j+1;
      while(k<html.length&&!space(html[k])&&html[k]!=='/'&&html[k]!=='>'&&html[k]!=='=')k++;
      const attr=asciiLower(html.slice(j,k));
      while(k<html.length&&space(html[k]))k++;
      let value='';
      if(html[k]==='='){
        k++;
        while(k<html.length&&space(html[k]))k++;
        if(html[k]==='"'||html[k]==="'"){
          const q=html[k],e=html.indexOf(q,k+1);
          value=html.slice(k+1,e<0?html.length:e);k=e<0?html.length:e+1;
        }else{
          let e=k;
          while(e<html.length&&!space(html[e])&&html[e]!=='>')e++;
          value=html.slice(k,e);k=e;
        }
      }
      attrs.push([attr,value]);j=k;
    }
    tags.push({name,attrs});
    i=j+1;
    if(svg&&(breakout.has(name)||name==='font'&&attrs.some(([a])=>['color','face','size'].includes(a))))svg=0;
    if(name==='svg'&&!selfClosing){svg++;continue;}
    if(!svg&&rawText.has(name))i=close(name,i);
  }
  return tags;
}

/**
 * A season field-interaction player must run on its own. Its first element in <head> is the plugin's exact
 * policy, which makes the browser refuse every network, frame and form request. Static checks also refuse
 * external scripts, embedded resources, links away from the page and the obvious network APIs. Script-driven
 * top-level navigation is outside this check; the season reviews its own player in the pull request.
 */
export function checkSelfContained(bytes,where){
  let html=lf(bytes);
  if(html.startsWith('﻿'))html=html.slice(1);
  const fail=why=>{throw Error('Field player '+where+' is not self-contained: '+why);};
  const meta='<meta http-equiv="Content-Security-Policy" content="'+fieldPlayerPolicy+'">';
  const head=/^(?:<!doctype html>[ \t\n\r\f]*)?(?:<html(?: lang="[A-Za-z-]{1,16}")?>[ \t\n\r\f]*)?<head>[ \t\n\r\f]*/i.exec(html);
  if(!head||!html.startsWith(meta,head[0].length))
    fail('make <meta http-equiv="Content-Security-Policy" content="'+fieldPlayerPolicy+'"> the first element in <head>');
  let policies=0;
  for(const {name,attrs} of startTags(html)){
    if(bannedTags.has(name))fail('an embedded, linked or submitted resource (<'+name+'>)');
    for(const [attr,value] of attrs){
      // A browser strips C0 controls and spaces around a URL.
      const v=value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g,'').toLowerCase();
      if(attr==='http-equiv')policies++;
      if(name==='script'&&attr==='src')fail('an external script');
      if(attr==='href'&&!v.startsWith('#'))fail('a link away from the page');
      if(resourceAttrs.has(attr)&&!/^(?:data:|blob:|#)/.test(v))fail('a resource URL ('+attr+')');
    }
  }
  if(policies!==1)fail('declare exactly one http-equiv element, the policy');
  if(/\b(?:fetch|importScripts|sendBeacon)\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection)\b/.test(html))
    fail('a network API');
}

/**
 * Check one release directory, given as a map of file name to bytes.
 * Physics: the receipt is layout-checked with nominal clearance, mass and voltage passing, the displaced
 * control rejected and no missing inputs. Mission: at least one passing, playable operating case or
 * receipt-bound field-interaction trial accomplishes a represented narrative objective.
 */
export function checkRelease(id,files,policy={},{added=false}={}){
  check(releaseId.test(id),'Invalid preliminary release ID: '+id);
  check(files.has('release.json'),'Preliminary release '+id+' has no release record (release.json)');
  const record=parse(files.get('release.json'),'release record: '+id);
  check(record?.schema===releaseSchema&&record.release===id,'Release record names a different schema or release: '+id);
  const approved=policy.presentations?.[id];
  if(approved){
    check(object(approved.files)&&Object.keys(approved.files).length&&
      Object.entries(approved.files).every(([name,digest])=>
        /^[a-z0-9][a-z0-9._-]*\.(?:html|css|js|md|json\.gz)$/.test(name)&&
        (name==='index.html'||!reserved.includes(name))&&name!=='package-motion.html'&&
        files.has(name)&&hex.test(digest)&&sha(files.get(name))===digest),
      'Project presentation differs from its approved assets: '+id);
    check(Object.hasOwn(approved.files,'index.html'),'Project presentation needs an approved entry point: '+id);
    if(record.status==='historical-review'){
      check(approved.historicalRecord===sha(files.get('release.json'))&&record.label==='Historical preliminary review'&&
        releaseId.test(record.supersededBy??'')&&record.supersededBy!==id&&named(record.knownIssue)&&
        files.size===Object.keys(approved.files).length+1,'Invalid historical review or unapproved record: '+id);
      const page=lf(files.get('index.html'));
      const escaped=record.knownIssue.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
      check(page.includes('<aside role="note"><strong>Historical preliminary review</strong> '+escaped+'</aside>'),
        'Display the historical review and its known limitation in the project view: '+id);
      return {release:id,status:record.status,supersededBy:record.supersededBy};
    }
    check(!approved.historicalRecord,'An approved historical review cannot become current: '+id);
    // Preserve the project entry point. Verify the underlying checked player with the ordinary rules.
    check(record.view?.file==='package-motion.html'&&files.has('package-motion.html'),'Missing checked player: '+id);
  }
  const checkedView=approved?'package-motion.html':'index.html';
  // A newly added release names its phase; a release issued earlier may carry the label it was issued with.
  check(record.phase===releasePhase||!added&&record.label===issuedLabel,'Release '+id+' must identify its phase: "phase": "'+releasePhase+'"');
  const trials=new Set();
  const missions=record.missionCases;
  // Season field-interaction players, listed and pinned by the release record.
  const players=record.fieldPlayers??[];
  check(Array.isArray(players),'List field players in fieldPlayers: '+id);
  const playerFiles=new Set();
  for(const p of players){
    check(object(p)&&fieldName.test(p.file??'')&&!playerFiles.has(p.file),'Each field player needs a unique field/NAME.html file: '+id);
    playerFiles.add(p.file);
    if(object(p.trial)&&trialName.test(p.trial.file??'')&&!reserved.includes(p.trial.file))trials.add(p.trial.file);
  }
  for(const m of Array.isArray(missions)?missions:[]){
    if(object(m)&&m.kind==='field-interaction-trial'&&object(m.trial))trials.add(m.trial.file);
    else check(!object(m)||m.trial===undefined,'Only a field-interaction-trial mission case can publish a trial: '+id);
  }
  // The stock page fetches its review scene; the receipt names and pins it.
  for(const name of files.keys()){
    check(reserved.includes(name)||name===checkedView||approved&&Object.hasOwn(approved.files,name)||name===sceneFile||playerFiles.has(name)||trials.has(name)&&trialName.test(name)&&!reserved.includes(name),
      'Unrecognized preliminary output: releases/'+id+'/'+name);
  }
  for(const name of ['index.html','receipt.json','motion.json','budgets.json','limits.json'])
    check(files.has(name),'Preliminary release '+id+' is missing '+name);
  const receiptBytes=files.get('receipt.json'),view=files.get(checkedView),scene=files.get('motion.json');
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
  check(pinMatches(record.view,checkedView,view)&&object(receipt.view)&&receipt.view.verified===true&&receipt.view.sha256===record.view.sha256,
    'Published view differs from the receipt and release record: '+id);
  // The page is the season's own copy of the stock page; the gate checks its data, not its markup or script.
  // Everything the page displays as a result comes from the pinned scene, which must repeat the receipt's result,
  // including the displaced control the receipt reports separately as rejected.
  const pinned=pinnedScene(files.get(sceneFile),receipt);
  check(!pinned.error,(pinned.error||'')+': '+id+'. Regenerate it with --write-view');
  const data=pinned.scene;
  const ledgerDiffers=compareWithLedger(data,parse(files.get('budgets.json'),'budget ledger: '+id),parse(files.get('limits.json'),'limits: '+id));
  check(!ledgerDiffers.length,'Published review scene shows figures that differ from the published budgets: '+ledgerDiffers.join('; ')+': '+id);
  const shownStatus=new Map(data.cases.map(c=>[c.id,c.status]));

  const objectives=Array.isArray(receipt.narrativeReview?.objectives)?receipt.narrativeReview.objectives:[];
  const represented=objective=>objectives.some(o=>o?.objective===objective&&o.disposition==='represented');

  // Field players: every view link resolves to a listed page, and every listed page is linked, pinned and self-contained.
  const rows=Array.isArray(data.fieldInteractions)?data.fieldInteractions:[];
  // A view link names the page exactly as it is served: field/NAME.html, optionally after ./.
  const target=href=>{
    const name=href.startsWith('./')?href.slice(2):href;
    return fieldName.test(name)?name:null;
  };
  const linked=new Map();
  for(const r of rows){
    const name=typeof r?.href==='string'?target(r.href):null;
    check(name&&playerFiles.has(name),'A field interaction must link a listed field player: '+id+' '+String(r?.href));
    if(!linked.has(name))linked.set(name,[]);
    linked.get(name).push(r);
  }
  const stagePins=new Set(Object.values(receipt.stages??{}).flatMap(s=>Object.values(s?.transportedBy??{}).map(x=>x?.evidence?.sha256)).filter(Boolean));
  for(const p of players){
    const page=files.get(p.file),t=p.trial;
    check(page&&hex.test(p.sha256??'')&&sha(page)===p.sha256,'Published field player differs from its pin: '+id+'/'+p.file);
    check(object(t)&&trials.has(t.file)&&files.has(t.file)&&pinMatches(t,t.file,files.get(t.file)),
      'Publish the pinned trial for field player '+id+'/'+p.file);
    evidence(files.get(t.file),'trial: '+id);
    check(named(p.objective)&&represented(p.objective),'Field player '+p.file+' must show a represented narrative objective: '+id);
    const links=linked.get(p.file);
    check(links,'Each listed field player must be linked from the checked view: '+id+'/'+p.file);
    check(links.every(r=>r.objective===p.objective),'Field player '+p.file+' objective differs from the checked view: '+id);
    check(links.some(r=>object(r.evidence)&&r.evidence.sha256===t.sha256)||stagePins.has(t.sha256),
      'The trial for field player '+p.file+' is not one the receipt pins: '+id);
    checkSelfContained(page,id+'/'+p.file);
  }

  // Mission gate.
  check(Array.isArray(missions)&&missions.length,'Release '+id+' declares no mission-task case');
  const played=new Set(data.cases.map(c=>c.id));
  for(const m of missions){
    check(object(m)&&named(m.case)&&kinds.includes(m.kind)&&accomplishments.includes(m.accomplishes)&&named(m.objective),
      'Each mission case needs a case, kind ('+kinds.join(', ')+'), accomplishment ('+accomplishments.join(', ')+') and objective: '+id);
    const where='mission case '+m.case+' in '+id;
    check(represented(m.objective),'The '+where+' must accomplish a represented narrative objective');
    check(receipt.stages?.[m.case]?.purpose==='operating'&&Array.isArray(receipt.cycle)&&receipt.cycle.includes(m.case),
      'The '+where+' must be an operating case in the checked cycle');
    check(cases.some(c=>c.case===m.case&&c.status==='pass')&&shownStatus.get(m.case)==='pass'&&played.has(m.case),
      'The '+where+' needs passing evidence played in the checked view');
    if(m.kind==='field-interaction-trial'&&m.player!==undefined){
      const p=players.find(x=>x.file===m.player);
      check(m.trial===undefined&&p&&p.objective===m.objective,'The field-interaction player for the '+where+' must be a listed field player for its objective');
      // The player's trial must be the trial of this mission case.
      const trialCase=evidence(files.get(p.trial.file),'trial: '+id);
      check((trialCase.case??trialCase.transport?.case)===m.case,'The field player trial for the '+where+' records a different case');
    }else if(m.kind==='field-interaction-trial'){
      const t=m.trial;
      check(object(t)&&trialName.test(t.file??'')&&files.has(t.file)&&pinMatches(t,t.file,files.get(t.file)),
        'Publish the pinned field-interaction trial for the '+where);
      const bound=Object.values(receipt.stages[m.case].transportedBy??{}).some(s=>s?.evidence?.sha256===t.sha256);
      check(bound&&evidence(files.get(t.file),'trial: '+id).transport?.case===m.case,
        'The field-interaction trial for the '+where+' is not the one the receipt pins');
    }
  }
  return {release:id,issue:receipt.issue,status:receipt.status,missionCases:missions.map(m=>m.case),fieldPlayers:[...playerFiles]};
}

function readTree(dir){
  const files=new Map();
  for(const d of readdirSync(dir,{withFileTypes:true})){
    if(d.isDirectory()&&!d.isSymbolicLink()&&d.name==='field'){
      for(const e of readdirSync(path.join(dir,'field'),{withFileTypes:true})){
        check(e.isFile()&&!e.isSymbolicLink(),'Unrecognized preliminary output: field/'+e.name);
        files.set('field/'+e.name,readFileSync(path.join(dir,'field',e.name)));
      }
      continue;
    }
    check(d.isFile()&&!d.isSymbolicLink(),'Unrecognized preliminary output: '+d.name);
    files.set(d.name,readFileSync(path.join(dir,d.name)));
  }
  return files;
}
/** Author-side check of one staged release directory. */
export async function verifyRelease(dir,policy={}){
  const real=realpathSync(dir);
  check(lstatSync(real).isDirectory(),'Expected a release directory');
  return checkRelease(path.basename(real),readTree(real),policy);
}

/** Check a new catalog with the same directory and eligibility rules as a first deployment. */
export function verifyCatalog(dir,policy){
  const files=new Map();
  function visit(folder,prefix){
    for(const item of readdirSync(folder,{withFileTypes:true})){
      const key=prefix+item.name, target=path.join(folder,item.name);
      if(item.isDirectory())visit(target,key+'/');
      else{
        check(item.isFile()&&!item.isSymbolicLink(),'Redirected or unsupported catalog file: '+key);
        files.set(key,readFileSync(target));
      }
    }
  }
  check(!lstatSync(dir).isSymbolicLink(),'Redirected preliminary catalog');
  visit(dir,'');
  return auditTree(new Map(),files,policy,{issued:true});
}

/** Validate the trusted policy field. Paths are relative to the deployed site. */
export function preliminaryPolicy(spec,reserved){
  if(spec===undefined)return null;
  const safe=n=>typeof n==='string'&&n.length&&!n.startsWith('/')&&!n.includes('\\')&&!n.includes(':')&&
    n.split('/').every(x=>x&&x!=='.'&&x!=='..'&&x!=='.git');
  check(object(spec)&&safe(spec.root)&&Array.isArray(spec.primaryEntryPoints)&&spec.primaryEntryPoints.length&&
    spec.primaryEntryPoints.every(safe)&&new Set(spec.primaryEntryPoints).size===spec.primaryEntryPoints.length&&
    Object.keys(spec).every(k=>['root','primaryEntryPoints','secondaryLink','presentations','catalogFiles'].includes(k)),
    'preliminaryReleases needs a root and the approved primary entry points');
  check(spec.secondaryLink===undefined||spec.primaryEntryPoints.includes(spec.secondaryLink)&&/\.html?$/.test(spec.secondaryLink),
    'preliminaryReleases.secondaryLink must name a primary entry page (HTML)');
  const inside=n=>n===spec.root||n.startsWith(spec.root+'/');
  check(![...spec.primaryEntryPoints,...reserved].some(inside),'Keep primary, model and field outputs outside the preliminary tree');
  check(spec.presentations===undefined||object(spec.presentations)&&Object.entries(spec.presentations).every(
    ([id,p])=>releaseId.test(id)&&object(p)&&object(p.files)),'Invalid approved release presentations');
  check(spec.catalogFiles===undefined||object(spec.catalogFiles)&&Object.keys(spec.catalogFiles).sort().join(',')==='index.html,releases.js'&&
    Object.values(spec.catalogFiles).every(v=>hex.test(v)),'Pin both project catalog assets');
  return {...spec,primary:new Set(spec.primaryEntryPoints),inside};
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
export function auditTree(oldFiles,newFiles,policy={},{issued=false}={}){
  const group=files=>{
    const top=new Map(),releases=new Map();
    for(const [name,bytes] of files){
      const parts=name.split('/');
      if(parts.length===1){
        check(['index.html','releases.json'].includes(name)||name==='releases.js'&&policy.catalogFiles,'Unrecognized preliminary output: '+name);
        top.set(name,bytes);
      }else if(parts.length===2&&parts[0]==='fonts'){
        // Only the plugin's bundled theme fonts and their OFL licenses. Text may differ only in line endings.
        const want=bundledFonts().get(parts[1]);
        check(want&&(Buffer.compare(want,bytes)===0||!parts[1].endsWith('.woff2')&&lf(want)===lf(bytes)),
          'Unrecognized preliminary output: '+name);
      }else{
        // A release holds its own files plus season field players directly under field/.
        check(parts[0]==='releases'&&releaseId.test(parts[1])&&(parts.length===3||parts.length===4&&parts[2]==='field'),
          'Unrecognized preliminary output: '+name);
        if(!releases.has(parts[1]))releases.set(parts[1],new Map());
        releases.get(parts[1]).set(parts.slice(2).join('/'),bytes);
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
  if(policy.catalogFiles)for(const [name,digest] of Object.entries(policy.catalogFiles))
    check(after.top.has(name)&&sha(after.top.get(name))===digest,'Changed approved project catalog: '+name);
  check(approvedViewer||policy.catalogFiles||lf(readFileSync(stableViewer))===lf(viewer),
    'The stable preliminary viewer must equal the approved copy or this plugin\'s template');
  check(after.top.has('releases.json'),'Publish the preliminary release index (releases.json)');
  const index=parse(after.top.get('releases.json'),'preliminary release index');
  const ids=index?.releases;
  check(object(index)&&Object.keys(index).every(k=>['current','releases','legacy','designStatus','effectiveHistory'].includes(k))&&Array.isArray(ids)&&ids.length&&
    ids.every(i=>typeof i==='string'&&releaseId.test(i))&&new Set(ids).size===ids.length&&ids.includes(index.current),
    'The preliminary release index needs unique release IDs and a listed current release');
  // Releases deployed before release records existed may be named as legacy, but only if already approved.
  check(index.legacy===undefined||Array.isArray(index.legacy)&&index.legacy.every((i,n)=>ids[n]===i&&before.releases.has(i)),
    'Only releases already in the approved site can be listed as legacy');
  const priorIndex=before.top.has('releases.json')?parse(before.top.get('releases.json'),'approved preliminary release index'):null;
  if(priorIndex){
    const prior=priorIndex.releases;
    check(Array.isArray(prior)&&prior.every((p,i)=>ids[i]===p),'Preliminary releases may only append; keep every earlier entry in order');
  }
  check(ids.length===after.releases.size&&ids.every(i=>after.releases.has(i)),'The preliminary release index and release directories disagree');
  const added=ids.filter(i=>!before.releases.has(i));
  const receipts=new Map(ids.map(i=>[i,after.releases.get(i)?.get('receipt.json')]).filter(([,r])=>r));
  const historical=new Set(ids.filter(i=>{const r=after.releases.get(i)?.get('release.json');return r&&parse(r,'release record: '+i).status==='historical-review';}));
  const status=checkStatusChange(priorIndex,index,receipts,{historical,legacy:index.legacy??[]});
  for(const id of ids){
    const files=after.releases.get(id);
    if(files.has('release.json')){
      const record=parse(files.get('release.json'),'release record: '+id);
      if(record.status==='historical-review')check(id!==index.current&&ids.indexOf(record.supersededBy)>ids.indexOf(id),
        'A historical review needs a later indexed successor and cannot be current: '+id);
    }
  }
  // A catalog check reads releases already issued, which may carry the label they were issued with.
  for(const id of added)checkRelease(id,after.releases.get(id),policy,{added:!issued});
  return {releases:ids,added,current:index.current,effective:status.effective};
}

/** A one-line, information-only summary of a release page against the stock page. */
export function templateReport(dir){
  const file=lstatSync(dir).isDirectory()?path.join(dir,'index.html'):dir;
  const report=compareTemplate(readFileSync(file));
  return {page:file,stockPage:report.stock,contentSecurityPolicy:report.csp,
    note:(report.stock?'Page is the plugin stock review page':'Page differs from the plugin stock review page in '+report.differences.length+(report.differences.length===20?'+':'')+' line(s)')+
      (report.csp?'':'; it has no Content-Security-Policy')+'. Information only: the gate does not compare page markup.',
    differences:report.differences};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),compare=args.includes('--compare-template'),[mode,dir,...rest]=args.filter(a=>a!=='--compare-template');
  try{
    if(mode==='compare-template'&&dir&&!rest.length){console.log(JSON.stringify(templateReport(dir),null,2));}
    else if(['verify','verify-catalog'].includes(mode)&&dir&&(!rest.length||rest.length===2&&rest[0]==='--policy')&&!(compare&&mode==='verify-catalog')){
      const policy=rest.length?preliminaryPolicy(parse(readFileSync(rest[1]),'site policy').preliminaryReleases,[]):{};
      const result=mode==='verify'?await verifyRelease(dir,policy??{}):verifyCatalog(dir,policy??{});
      console.log(JSON.stringify(result,null,2));
    }
    else throw Error('Usage: preliminary-release.mjs verify RELEASE_DIRECTORY [--compare-template] | verify-catalog SITE_DIRECTORY [--policy SERVED_POLICY] | compare-template RELEASE_DIRECTORY_OR_PAGE');
  }catch(error){console.error(error.message);process.exitCode=1;}
  // Information only; it never changes the exit status.
  if(compare&&mode==='verify'&&dir){try{console.log(JSON.stringify({template:templateReport(dir)},null,2));}catch(error){console.log(JSON.stringify({template:{note:'Template comparison unavailable: '+error.message}}));}}
}
