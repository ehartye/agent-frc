// A policy comparator over supplied observations; this does not emulate an engine or hook input.
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const scalar=x=>typeof x==='boolean'||typeof x==='string'||(typeof x==='number'&&Number.isFinite(x));
const bases=['synthetic','interactive-observed','human-reported'];
const modifiers=['Alt','Control','Meta','Shift'];
const code=x=>typeof x==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-9]|2[0-4])|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma)|Space|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Meta(Left|Right)|CapsLock|NumLock|ScrollLock|Pause|PrintScreen|ContextMenu|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen)$/.test(x);
const lex=(a,b)=>a<b?-1:a>b?1:0;
const ptr=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const canonical=x=>Array.isArray(x)?x.map(canonical):record(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const chord=x=>JSON.stringify([x.code,[...x.modifiers].sort()]);
const sortedHeld=x=>[...x].sort((a,b)=>lex(a.code,b.code));

export function compareViewerControls(expected,observed){
 const result={schema:'agent-frc/viewer-controls-result@1',status:'matched',issues:[],scope:{evidenceBasis:text(observed?.evidenceBasis)?observed.evidenceBasis:null,limit:'Agreement of supplied control-policy transitions only. Engine side effects are observations, not predictions. No authentication, real input integration, native execution or physical qualification.'}};
 const add=(status,code,path,reason)=>{if(status==='invalid'||result.status==='matched')result.status=status;result.issues.push({code,path,reason});};
 const invalid=(c,p,r)=>add('invalid',c,p,r),mismatch=(c,p,r)=>add('mismatch',c,p,r);
 const finish=()=>{result.issues.sort((a,b)=>lex(a.path,b.path)||lex(a.code,b.code)||lex(a.reason,b.reason));return result;};
 function uniqueStrings(a,p,nonempty=false){
  if(!Array.isArray(a)||(nonempty&&!a.length)||a.some(x=>!text(x))||new Set(a).size!==a.length){invalid('inventory-invalid',p,'An explicit unique string array is required');return false;}return true;
 }
 function validChord(x,p){
  if(!code(x.code))invalid('key-code-invalid',p+'/code','A supported exact DOM code is required');
  if(!Array.isArray(x.modifiers)||x.modifiers.some(m=>!modifiers.includes(m))||new Set(x.modifiers).size!==x.modifiers.length)invalid('modifiers-invalid',p+'/modifiers','Declare unique Alt/Control/Meta/Shift modifiers, including an empty array');
 }
 function validEvent(e,p){
  if(!record(e)){invalid('event-invalid',p,'An event object is required');return;}
  if(!['keydown','keyup','focus-loss'].includes(e.type))invalid('event-type-invalid',p+'/type','Expected keydown, keyup or focus-loss');
  else if(e.type!=='focus-loss')validChord(e,p);
  else if(Object.hasOwn(e,'code')||Object.hasOwn(e,'modifiers'))invalid('focus-event-invalid',p,'Focus loss has no key or modifiers');
 }
 function state(s,p){
  if(!record(s)||Object.entries(s).some(([k,v])=>!text(k)||!scalar(v))){invalid('display-state-invalid',p,'An explicit map of finite scalar display values is required');return;}
  if(record(expected?.restoreValues))for(const k of Object.keys(expected.restoreValues))if(!Object.hasOwn(s,k))invalid('display-state-incomplete',p+'/'+ptr(k),'The observation must include every policy-owned display option');
 }
 let apps=[],engines=[];
 function held(h,p){
  if(!Array.isArray(h)){invalid('held-invalid',p,'Explicit held bindings are required');return;}
  const seen=new Set();
  h.forEach((b,i)=>{
   const q=p+'/'+i;
   if(!record(b)||!code(b.code)||!text(b.action)){invalid('held-invalid',q,'Each held binding requires a code and action');return;}
   if(seen.has(b.code))invalid('held-duplicate',q,'A physical key may hold only one action');seen.add(b.code);
   if(!apps.some(a=>a.code===b.code&&a.action===b.action))invalid('held-unknown',q,'Held code/action must be declared by an application binding');
  });
 }
 function header(d,side){
  const p='/'+side;
  if(!record(d)){invalid('document-invalid',p,'JSON object required');return;}
  if(d.schema!==`agent-frc/viewer-controls-${side==='manifest'?'manifest':'receipt'}@1`)invalid('schema-invalid',p+'/schema','Unsupported controls schema');
  if(!record(d.sourcePins))invalid('source-pin-invalid',p+'/sourcePins','Explicit source pins required');
  else for(const k of new Set(['archiveSha256','producerSha256',...Object.keys(d.sourcePins)]))if(!hash(d.sourcePins[k]))invalid('source-pin-invalid',p+'/sourcePins/'+ptr(k),'A lowercase SHA-256 identity is required');
  if(side==='manifest'){
   if(!Array.isArray(d.allowedEvidenceBases)||!d.allowedEvidenceBases.length||d.allowedEvidenceBases.some(b=>!bases.includes(b))||new Set(d.allowedEvidenceBases).size!==d.allowedEvidenceBases.length)invalid('allowed-bases-invalid',p+'/allowedEvidenceBases','Declare unique permitted controls evidence bases');
  }else if(!bases.includes(d.evidenceBasis))invalid('evidence-basis-invalid',p+'/evidenceBasis','Declare synthetic, interactive-observed or human-reported evidence');
 }
 header(expected,'manifest');header(observed,'receipt');
 if(!record(expected)||!record(observed))return finish();
 function bindings(list,p,app){
  if(!Array.isArray(list)||(app&&!list.length)){invalid('bindings-invalid',p,'Explicit binding array required; application bindings cannot be empty');return [];}
  const keys=new Set();
  list.forEach((b,i)=>{
   const q=p+'/'+i;if(!record(b)){invalid('binding-invalid',q,'Binding object required');return;}
   validChord(b,q);
   if(code(b.code)&&Array.isArray(b.modifiers)){const k=chord(b);if(keys.has(k))invalid('binding-duplicate',q,'Binding chord is ambiguous');keys.add(k);}
   if(app){if(!text(b.action))invalid('action-invalid',q+'/action','Action ID is required');}
   else uniqueStrings(b.optionIds,q+'/optionIds',true);
  });return list.filter(record);
 }
 apps=bindings(expected.applicationBindings,'/manifest/applicationBindings',true);
 engines=bindings(expected.engineBindings,'/manifest/engineBindings',false);
 if(!record(expected.restoreValues)||Object.entries(expected.restoreValues).some(([k,v])=>!text(k)||!scalar(v)))invalid('restore-values-invalid','/manifest/restoreValues','Explicit finite scalar restore values required, even when empty');
 if(uniqueStrings(expected.releaseOnFocusLoss,'/manifest/releaseOnFocusLoss')){
  const actions=new Set(apps.map(a=>a.action));
  if(expected.releaseOnFocusLoss.length!==actions.size||expected.releaseOnFocusLoss.some(a=>!actions.has(a)))invalid('focus-release-incomplete','/manifest/releaseOnFocusLoss','Declare every application action exactly once for focus-loss release');
 }
 const ecases=new Map(),ocases=new Map();
 function cases(d,p,out,isExpected){
  if(!Array.isArray(d.cases)||!d.cases.length){invalid('cases-invalid',p+'/cases','Nonempty explicit event cases required');return;}
  d.cases.forEach((c,i)=>{
   const q=p+'/cases/'+i;if(!record(c)){invalid('case-invalid',q,'Case object required');return;}
   if(!text(c.id)||out.has(c.id))invalid('case-id-invalid',q+'/id','Unique case ID required');else out.set(c.id,{value:c,index:i});
   if(isExpected)held(c.initialHeld,q+'/initialHeld');
   if(!Array.isArray(c.events)||!c.events.length){invalid('events-invalid',q+'/events','Nonempty ordered events required');return;}
   const eventIds=new Set();c.events.forEach((t,j)=>{
    const ep=q+'/events/'+j;if(!record(t)){invalid('transition-invalid',ep,'Transition object required');return;}
    if(!text(t.id)||eventIds.has(t.id))invalid('event-id-invalid',ep+'/id','Unique event ID required');eventIds.add(t.id);
    validEvent(isExpected?t:t.event,isExpected?ep:ep+'/event');
    if(!isExpected){held(t.priorHeld,ep+'/priorHeld');held(t.finalHeld,ep+'/finalHeld');state(t.postEngine,ep+'/postEngine');state(t.finalDisplay,ep+'/finalDisplay');}
   });
  });
 }
 cases(expected,'/manifest',ecases,true);cases(observed,'/receipt',ocases,false);
 if(result.status==='invalid')return finish();
 const collisions=new Map();
 for(const engine of engines)if(apps.some(app=>chord(app)===chord(engine)))collisions.set(chord(engine),engine.optionIds);
 const restored=new Set([...collisions.values()].flat());
 if(Object.keys(expected.restoreValues).length!==restored.size||Object.keys(expected.restoreValues).some(k=>!restored.has(k)))invalid('restore-policy-invalid','/manifest/restoreValues','Restore values must cover exactly the options on colliding application/engine chords');
 if(result.status==='invalid')return finish();
 for(const key of Object.keys(expected.sourcePins)){
  if(!Object.hasOwn(observed.sourcePins,key))invalid('source-pin-missing','/receipt/sourcePins/'+ptr(key),'Expected pin missing');
  else if(expected.sourcePins[key]!==observed.sourcePins[key])mismatch('source-mismatch','/receipt/sourcePins/'+ptr(key),'Source identity differs');
 }
 for(const key of Object.keys(observed.sourcePins))if(!Object.hasOwn(expected.sourcePins,key))mismatch('source-pin-extra','/receipt/sourcePins/'+ptr(key),'Unexpected source pin');
 if(!expected.allowedEvidenceBases.includes(observed.evidenceBasis))mismatch('evidence-basis-disallowed','/receipt/evidenceBasis','Evidence basis is outside manifest policy');
 for(const id of ocases.keys())if(!ecases.has(id))mismatch('case-extra','/receipt/cases','Unexpected case '+id);
 for(const [id,{value:c}] of ecases){
  const found=ocases.get(id);if(!found){invalid('case-missing','/receipt/cases','Missing case '+id);continue;}
  const receipt=found.value,p='/receipt/cases/'+found.index;
  const byId=new Map(receipt.events.map((e,i)=>[e.id,{value:e,index:i}]));
  for(const t of receipt.events)if(!c.events.some(e=>e.id===t.id))mismatch('event-extra',p+'/events','Unexpected event '+t.id);
  let active=sortedHeld(c.initialHeld);
  for(let i=0;i<c.events.length;i++){
   const required=c.events[i],foundEvent=byId.get(required.id);
   if(!foundEvent){invalid('event-missing',p+'/events','Missing event '+required.id);continue;}
   const t=foundEvent.value,q=p+'/events/'+foundEvent.index;
   if(foundEvent.index!==i)mismatch('event-order-mismatch',q+'/id','Event order differs from independent scenario');
   const want={...required};delete want.id;
   if(!equal(want,t.event))mismatch('event-mismatch',q+'/event','Observed event differs from independent scenario');
   if(!equal(sortedHeld(t.priorHeld),active))mismatch('prior-held-mismatch',q+'/priorHeld','Prior held state breaks the scenario continuity');
   // Compute from required inputs and supplied engine observations, never from claimed final state.
   const wasHeld=active.some(a=>a.code===required.code);
   if(required.type==='focus-loss')active=[];
   else if(required.type==='keyup')active=active.filter(a=>a.code!==required.code);
   else if(!active.some(a=>a.code===required.code)){
    const binding=apps.find(a=>chord(a)===chord(required));if(binding)active=sortedHeld([...active,{code:binding.code,action:binding.action}]);
   }
   const display={...t.postEngine};
   if(required.type==='keydown'||(required.type==='keyup'&&wasHeld))for(const option of collisions.get(chord(required))??[])display[option]=expected.restoreValues[option];
   if(!equal(sortedHeld(t.finalHeld),active))mismatch('held-mismatch',q+'/finalHeld','Final application actions differ from the routing policy');
   if(!equal(t.finalDisplay,display))mismatch('display-mismatch',q+'/finalDisplay','Only colliding display options may be restored; other observed values must remain unchanged');
  }
 }
 return finish();
}
