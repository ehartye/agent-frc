import {readFileSync,writeFileSync} from 'node:fs';

const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function candidate(title,row,architecture) {
  const observation=row.status==='open'?'<p>'+escape(row.reason)+'</p>':
    '<p><strong>'+row.count+' pieces</strong> · '+row.rate.toFixed(3)+' pieces/s</p><p>'+escape(row.evidence)+' · '+escape(row.revision)+'</p>';
  return '<section><h3>'+title+'</h3><p>'+escape(architecture)+'</p>'+observation+'</section>';
}
export function buildRoleReport(result,destination) {
  const handoff=result.roleHandoff;
  if(!handoff)throw Error('Interactive role decisions need a roleHandoff in the design study.');
  const {demand,pairs}=handoff,d=demand.identity;
  const selectors=pairs.map((p,i)=>'<option value="'+i+'">'+escape(p.id)+'</option>').join('');
  const panels=pairs.map((p,i)=>{
    const verdict=p.status==='open'?p.reason:
      (p.deltaPieces>0?'+':'')+p.deltaPieces+(Math.abs(p.deltaPieces)===1?' piece':' pieces')+' in the same window. '+
      (p.afterMeetsRole?'The revised architecture meets this opportunity.':'The revised architecture falls short of this opportunity.');
    const field=p.fieldPolicies;
    const fieldResult=field?'<p><strong>Prescribed field policies</strong> · '+(field.status==='open'?escape(field.reason):
      escape(field.before.policy)+' '+field.before.count+' → '+escape(field.after.policy)+' '+field.after.count+
      ' witnessed outcomes. This compares field behavior only.')+'</p>':'';
    const graph=rows=>rows.map(r=>'<li>'+escape(r.from)+' → '+escape(r.to)+' · '+escape(r.exchange)+'</li>').join('');
    const witnesses=row=>(row.witnesses??[]).map(e=>'<li>'+escape(e.timeS)+' s · '+escape(e.piece)+' · '+escape(e.witness)+'</li>').join('');
    return '<article data-pair="'+i+'"'+(i?' hidden':'')+'><h2>'+escape(p.premise)+'</h2><p>'+escape(p.change)+'</p><div class="compare">'+
      candidate('Before',p.before,p.contrast.before)+candidate('After',p.after,p.contrast.after)+'</div><p class="result">'+escape(verdict)+'</p>'+fieldResult+(p.nextExperiment?'<p>Next experiment · '+escape(p.nextExperiment)+'</p>':'')+
      '<details><summary>Inspect interfaces and observations</summary><h3>Before</h3><ul>'+graph(p.contrast.beforeInterfaces)+witnesses(p.before)+'</ul>'+
      '<h3>After</h3><ul>'+graph(p.contrast.afterInterfaces)+witnesses(p.after)+'</ul>'+
      '<p>'+escape(p.contrast.differentExchanges?'The declared interface exchanges differ.':'The same interface map is declared for both candidates.')+'</p></details></article>';
  }).join('');
  const scope='<p>'+escape(d.role)+' · '+escape(d.context)+' · '+escape(d.focalRobot)+' · '+escape(d.phase)+' '+d.windowS.join('–')+' s · '+escape(d.station)+'</p>'+
    '<p>'+escape(d.criterion)+'</p><p><strong>'+demand.requiredPieces+' '+(d.outcome==='acquired'?'acquisitions':'credited placements')+'</strong> in '+(d.windowS[1]-d.windowS[0])+' s · '+demand.requiredPerSecond.toFixed(3)+' pieces/s</p>'+
    '<details><summary>Trace the field opportunity</summary><p>At window start: '+Object.values(demand.openingStock).flat().length+' pieces at supply stations and '+demand.preloadedPieces.length+' held by the focal robot.</p><ul>'+
    demand.witnesses.map(e=>'<li>'+e.timeS.toFixed(2)+' s · '+escape(e.pieces.join(', '))+'</li>').join('')+
    '</ul><p>Profile '+escape(demand.source.profile.path)+' · '+escape(d.profileSha256)+'</p><p>Study '+escape(demand.source.study.path)+' · '+escape(d.studySha256)+'</p></details>';
  const template=readFileSync(new URL('../templates/role-design.html',import.meta.url),'utf8');
  const page=template.replace(/<!-- (scope|options|panels) -->/g,(_,key)=>({scope,options:selectors,panels})[key]);
  writeFileSync(destination,page,{flag:'wx'});
}
