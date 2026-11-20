import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {studyRows} from './strategy-lab.mjs';
import {readStudy,evidenceReader,atPointer,label} from './study-evidence.mjs';

function compareResourceUse(budgets,claims) {
  if(!budgets.length)return [];
  if(claims===undefined)return budgets.map(b=>({id:b.id,status:'open'}));
  if(!Array.isArray(claims)||claims.some(c=>!budgets.some(b=>b.id===c.resource)||!label(c.activity)||
      !Number.isFinite(c.startS)||!Number.isFinite(c.endS)||c.endS<=c.startS||!Number.isFinite(c.amount)||c.amount<=0))
    throw Error('Resource uses need a known resource, activity, positive quantity and interval.');
  return budgets.map(b=>{
    const uses=claims.filter(c=>c.resource===b.id);
    if(!uses.length)return {id:b.id,status:'open'};
    let peak=0, peakTimeS, activities;
    for(const time of new Set(uses.map(c=>c.startS))) {
      const concurrent=uses.filter(c=>c.startS<=time&&time<c.endS);
      const quantity=concurrent.reduce((total,c)=>total+c.amount,0);
      if(quantity>peak){peak=quantity;peakTimeS=time;activities=concurrent.map(c=>c.activity);}
    }
    return {id:b.id,unit:b.unit,capacity:b.capacity,peak,peakTimeS,activities,margin:b.capacity-peak,status:peak<=b.capacity?'pass':'fail'};
  });
}

export function reviewConcepts(study,read) {
  if(study?.schema!=='agent-frc/design-review@1') throw Error('Expected design-review@1.');
  const goals=studyRows(study.objectives,'objective'), cases=studyRows(study.cases,'case',2);
  const designs=studyRows(study.concepts,'concept',2);
  for(const g of goals) if (!label(g.unit) || ['min','max'].filter(k=>Object.hasOwn(g,k)).length!==1 ||
      !Number.isFinite(g.min ?? g.max)) throw Error('Give each objective one finite minimum or maximum and a unit.');
  if(cases.some(c=>!label(c.condition))) throw Error('Describe each test condition.');
  const budgets=studyRows(study.resources??[],'resource',0);
  if(budgets.some(b=>!label(b.unit)||!label(b.basis)||!Number.isFinite(b.capacity)||b.capacity<=0))throw Error('Resource budgets need a basis, unit and capacity.');
  const executionIds=new Set();
  const concepts=designs.map(d=>{
    if(!label(d.architecture) || !Array.isArray(d.interfaces) || !d.interfaces.length ||
        !d.interfaces.every(row=>label(row.from)&&label(row.to)&&row.from!==row.to&&label(row.exchange)))
      throw Error('Describe the system architecture and its exchanges between different components.');
    if(!Array.isArray(d.runs) || new Set(d.runs.map(r=>r.case)).size!==d.runs.length ||
        d.runs.some(r=>!cases.some(c=>c.id===r.case))) throw Error('Unexpected or repeated concept case.');
    const results=cases.map(c=>{
      const run=d.runs.find(r=>r.case===c.id);
      if(!run) return {id:c.id,status:'open',reason:'No execution supplied.'};
      const source=read(run.source), values=run.values;
      if(typeof run.execution!=='string')return {id:c.id,status:'open',reason:'Missing executed concept and condition identity.'};
      const execution=atPointer(source,run.execution);
      if(!execution||execution.concept!==d.id||execution.case!==c.id||!label(execution.runId)||
          executionIds.has(execution.runId)) throw Error('Execution identity does not match this unique concept and case.');
      executionIds.add(execution.runId);
      if(!values || typeof values!=='object' || Array.isArray(values) ||
          Object.keys(values).some(k=>!goals.some(g=>g.id===k))) throw Error('Unexpected objective mapping.');
      const checks=goals.map(g=>{
        if(!Object.hasOwn(values,g.id)) return {id:g.id,status:'open'};
        const pointer=values[g.id];
        if(typeof pointer!=='string'||!pointer.startsWith(run.execution+'/'))throw Error('Metric must belong to the identified execution.');
        const value=atPointer(source,pointer);
        if(!Number.isFinite(value)) throw Error('Expected finite '+g.unit+' at '+pointer);
        const margin=Object.hasOwn(g,'min') ? value-g.min : g.max-value;
        return {id:g.id,value,unit:g.unit,pointer,margin,status:margin>=0?'pass':'fail'};
      });
      const resources=compareResourceUse(budgets,execution.resourceUses);
      return {id:c.id,source:run.source,execution:run.execution,runId:execution.runId,checks,resources,status:verdict([...checks,...resources])};
    });
    return {id:d.id,architecture:d.architecture,interfaces:d.interfaces,cases:results,status:verdict(results)};
  });
  return {schema:'agent-frc/design-comparison@1',objectives:goals,resources:budgets,cases,concepts,
    qualifiedForTheseCases:concepts.filter(c=>c.status==='pass').map(c=>c.id),
    scope:'Recorded values compared in declared units. Check native metric definitions, execution identity and failure coverage before promoting a concept.'};
}
function verdict(rows) {
  if(rows.some(c=>c.status==='fail'))return 'fail';
  return rows.some(c=>c.status==='open')?'open':'pass';
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [file,root,...extra]=process.argv.slice(2);
    if(!file||extra.length) throw Error('Usage: design-review.mjs REVIEW.json [PROJECT_ROOT]');
    const input=readStudy(file);
    console.log(JSON.stringify({...reviewConcepts(input.value,evidenceReader(root??path.dirname(file))),studySha256:input.sha256},null,2));
  } catch(e){console.error(e.message);process.exitCode=1;}
}
