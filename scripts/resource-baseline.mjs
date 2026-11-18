// Explicit team facts only. Expectations and credits never become physical inventory.
const check=(ok,message)=>{if(!ok)throw Error(message);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
export function unknownResources(season){return {schema:'frc-resource-baseline/v1',season,teamNumber:null,teamStatus:'unknown',inventoryCoverage:'unknown',evidence:[],physicalInventory:[],kitExpectations:[],credits:[],budget:null,fabrication:[],schedule:null};}
export function validateResources(r){
 check(r?.schema==='frc-resource-baseline/v1'&&Number.isSafeInteger(r.season),'Resource schema/season required');
 check(r.teamNumber===null||(Number.isSafeInteger(r.teamNumber)&&r.teamNumber>0),'Invalid team number');
 check(['rookie','veteran','unknown'].includes(r.teamStatus),'Unknown team status');
 check(['unknown','partial','complete-declared'].includes(r.inventoryCoverage),'Inventory coverage required');
 for(const k of ['evidence','physicalInventory','kitExpectations','credits','fabrication'])check(Array.isArray(r[k]),`Resource ${k} required`);
 check(Object.hasOwn(r,'budget')&&Object.hasOwn(r,'schedule'),'Budget/schedule or explicit null required');
 const evidence=new Set();for(const e of r.evidence){check(id(e.id)&&!evidence.has(e.id)&&text(e.description)&&text(e.recordedAt),'Invalid resource evidence');evidence.add(e.id);}
 const refs=(rs,required=false)=>{check(Array.isArray(rs)&&(!required||rs.length>0),'Evidence references required');for(const ref of rs)check(evidence.has(ref),'Unknown resource evidence');};
 const ids=new Set();for(const item of r.physicalInventory){
  check(id(item.id)&&!ids.has(item.id),'Invalid/duplicate inventory ID');ids.add(item.id);
  check(item.kind==='hardware'&&text(item.partNumber),'Physical stock must identify hardware, not a voucher');
  check(item.revision===null||text(item.revision),'Part revision must be known or null');
  check(item.quantity===null||(Number.isSafeInteger(item.quantity)&&item.quantity>=0),'Invalid quantity');
  check(['owned','borrowed','unknown'].includes(item.ownership),'Ownership required');
  check(['serviceable','needs-review','unserviceable','unknown'].includes(item.condition),'Condition required');
  check(['available','unavailable','unknown'].includes(item.availability),'Availability required');
  refs(item.evidenceRefs,item.quantity!==null||item.ownership!=='unknown'||item.condition!=='unknown'||item.availability!=='unknown');
  if(item.dimensions!==null){const d=item.dimensions;check(d&&d.unit==='mm','Dimensions must use mm');for(const k of ['length','width','height'])check(d[k]===null||(Number.isFinite(d[k])&&d[k]>0),'Dimension must be positive or null');refs(d.evidenceRefs,true);check(d.scope==='bare-frame'||d.scope==='complete-robot','Dimension scope required');check(d.perimeterReference===undefined||['robot-perimeter-excluding-bumpers','component-envelope','complete-robot-including-bumpers','unknown'].includes(d.perimeterReference),'Unknown perimeter reference');}
 }
 for(const k of ['kitExpectations','credits'])for(const e of r[k]){check(id(e.id)&&e.season===r.season,'Expectation/credit season mismatch');check(text(e.status),'Expectation/credit status required');refs(e.evidenceRefs,true);}
 return true;
}
export function inventoryAssessment(r){validateResources(r);return r.physicalInventory.map(item=>({id:item.id,status:item.quantity===0?'not-available':item.quantity>0&&item.revision!==null&&item.ownership!=='unknown'&&item.condition==='serviceable'&&item.availability==='available'?'available':'unknown',evidenceRefs:item.evidenceRefs}));}
