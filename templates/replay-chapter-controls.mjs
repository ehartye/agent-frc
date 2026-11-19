// Mount the generated event index beside a project's video or model-viewer.
export function attachChapterControls(container, register, player) {
  const doc=container.ownerDocument;
  const status=doc.createElement('p');
  status.setAttribute('role','status');
  const list=doc.createElement('ol');
  let pending=0;
  function button(label,chapter,time) {
    const el=doc.createElement('button');
    el.type='button';
    el.textContent=label;
    el.addEventListener('click',async()=>{
      const turn=++pending;
      try {
        if (chapter.animation) {
          if (!player.availableAnimations?.includes(chapter.animation)) throw Error('Selected animation is unavailable.');
          player.animationCrossfadeDuration=0;
          player.animationName=chapter.animation;
          await player.updateComplete;
        }
        if (turn!==pending) return;
        if (chapter.animation) player.play({repetitions:1});
        player.pause();
        if (!Number.isFinite(player.duration) || time>player.duration+1e-6) throw Error('Observation outside the loaded recording.');
        player.currentTime=Math.min(time,player.duration);
        status.textContent=chapter.label+' · '+label+' · '+time.toFixed(2)+' s';
      } catch(error) { if (turn===pending) status.textContent=error.message; }
    });
    return el;
  }
  for (const c of register.chapters) {
    const row=doc.createElement('li');
    row.append(button(c.label,c,c.startS),' · '+c.classification);
    const context=doc.createElement('p');
    context.textContent=[c.revision,c.attempt,c.piece,c.clock].join(' · ');
    row.append(context);
    for (const e of c.events) {
      const line=doc.createElement('p');
      line.append(button(e.target+' · '+e.outcome,c,e.clipS),' · '+e.type+' · '+c.clock+' '+e.timeS+' s · '+e.criterion+(e.rule?' · '+e.rule:''));
      row.append(line);
    }
    list.append(row);
  }
  container.replaceChildren(list,status);
}
