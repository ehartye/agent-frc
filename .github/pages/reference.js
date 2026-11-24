'use strict';

const filter=document.getElementById('skillFilter');
function filterSkills(){
  let count=0;
  document.querySelectorAll('.skill').forEach(skill=>{
    skill.hidden=filter.value!=='all' && !skill.dataset.stages.split(' ').includes(filter.value);
    if(!skill.hidden)count++;
  });
  document.getElementById('skillCount').textContent=count+' supporting skill'+(count===1?'':'s');
}
filter.addEventListener('change',filterSkills);filterSkills();
