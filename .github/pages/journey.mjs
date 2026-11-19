// Skill edges come from the same stage records as the field guide and directory.
export function journeyMap(stages, narrow, escape) {
  const columns = narrow ? 1 : 3;
  const width = 330, gap = 36, pad = 12, rowGap = 34;
  const id = narrow ? 'journey-stack' : 'journey-board';
  let y = pad;
  const nodes = [];
  for (let start=0; start<stages.length; start+=columns) {
    const row = stages.slice(start,start+columns);
    const height = 96 + Math.max(...row.map(s=>s.skills.length))*26;
    const reverse = !narrow && Math.floor(start/columns)%2===1;
    row.forEach((stage,i)=>nodes.push({stage,x:pad+(reverse?columns-1-i:i)*(width+gap),y,height}));
    y += height+rowGap;
  }
  const routes = nodes.slice(1).map((next,i)=>{
    const prev=nodes[i];
    if(next.y!==prev.y) {
      const x=prev.x+width/2;
      return '<path d="M'+x+' '+(prev.y+prev.height)+' V'+(next.y-4)+'"/>';
    }
    const right=next.x>prev.x;
    return '<path d="M'+(prev.x+(right?width:0))+' '+(prev.y+34)+' H'+(next.x+(right?-4:width+4))+'"/>';
  }).join('');
  const panels = nodes.map(({stage:s,x,y,height},i)=>{
    const lines = s.skills.map((skill,j)=>'<a href="https://github.com/ehartye/agent-frc/blob/main/skills/'+skill+'/SKILL.md"><title>Open '+skill+'</title><rect class="hit" x="14" y="'+(80+j*26)+'" width="302" height="25"/><text class="skill-text" x="22" y="'+(98+j*26)+'">'+escape(skill)+'</text></a>').join('');
    return '<g transform="translate('+x+','+y+')"><rect class="panel" width="'+width+'" height="'+height+'" rx="5"/>'+
      '<a href="#'+s.id+'" data-chapter="'+s.id+'"><title>Explore '+escape(s.name)+'</title><rect class="hit" x="3" y="3" width="324" height="68"/>'+
      '<text class="number" x="15" y="33">'+String(i+1).padStart(2,'0')+'</text><text class="milestone" x="55" y="33">'+escape(s.name)+'</text>'+
      '<text class="outcome" x="20" y="61">'+escape(s.milestone)+'</text></a><path class="rule" d="M18 72 H312"/>'+lines+'</g>';
  }).join('');
  return '<svg class="journey-map '+(narrow?'stack':'board-map')+'" viewBox="0 0 '+(pad*2+width*columns+gap*(columns-1))+' '+(y-rowGap+pad)+'" aria-labelledby="'+id+'-title" role="group" xmlns="http://www.w3.org/2000/svg"><title id="'+id+'-title">Team journey milestones and supporting plugin skills</title><defs><marker id="'+id+'-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#28627a"/></marker></defs><g fill="none" stroke="#28627a" stroke-width="2" marker-end="url(#'+id+'-arrow)">'+routes+'</g>'+panels+'</svg>';
}
