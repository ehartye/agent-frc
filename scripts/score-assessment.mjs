/** Project timing rules and named physical observations, on the same continuous match clock. */
export function createScoreAssessment(model) {
  const spec=model.scoreAssessment;
  if(spec===undefined){
    if(model.periods.some(p=>p.passiveAfterS!==undefined))throw Error('Register the assessment rule and clock for passive time.');
    return null;
  }
  const check=(v,m)=>{if(!v)throw Error(m);};
  const named=v=>typeof v==='string' && v.trim().length>0;
  const time=v=>Number.isFinite(v) && v>=0;
  const sha=v=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
  const periods=new Map();
  let elapsed=0;
  for(const p of model.periods){
    const gap=p.passiveAfterS??0;
    check(time(gap) && Number.isSafeInteger(gap*20),'Use a nonnegative passive clock in 0.05 s increments.');
    periods.set(p.name,{start:elapsed,stop:elapsed+p.seconds});
    elapsed+=p.seconds+gap;
  }
  const rules=new Map();
  check(spec.schema==='field-rehearsal/score-assessment@1' && named(spec.clock) &&
    Array.isArray(spec.rules) && spec.rules.length,'Supply the scoring evidence clock and timing rules.');
  for(const r of spec.rules){
    const target=model.stations.find(s=>s.kind==='scoring' && s.id===r.target),period=periods.get(r.phase);
    check(target && period && named(r.id) && !rules.has(r.id) && named(r.category) && sha(r.ruleSha256) &&
      ['release','passage'].includes(r.attributeTo) && time(r.fromS) && r.fromS<r.actionUntilS &&
      r.fromS>=period.start && r.actionUntilS<=period.stop && r.actionUntilS<=r.passageUntilS &&
      r.passageUntilS<=r.observationUntilS && r.observationUntilS<=elapsed &&
      [r.actionUntilS,r.passageUntilS,r.observationUntilS].every(time),'Invalid action, passage or observation window.');
    if(r.entryUntilS!==undefined)
      check(time(r.entryUntilS) && r.fromS<r.entryUntilS && r.entryUntilS<=r.passageUntilS,'Invalid target entry cutoff.');
    if(target.activeWindows)check(['release','entry','passage'].includes(r.checkActivityAt),
      'Choose the physical event that must occur at an active target.');
    check(![...rules.values()].some(o=>o.target===r.target && o.phase===r.phase &&
      Math.max(o.fromS,r.fromS)<Math.min(o.actionUntilS,r.actionUntilS)),'Ambiguous windows for the same release.');
    rules.set(r.id,r);
  }
  function judge(row) {
    const rule=rules.get(row.rule);
    check(rule && named(row.piece) && (/^[BR][123]$/.test(row.robot) || model.stations.some(s=>s.service && row.robot==='human/'+s.service.operator)) && named(row.id) && named(row.scenario) &&
      row.clock===spec.clock && row.target===rule.target && row.category===rule.category && sha(row.releaseTraceSha256) &&
      time(row.releasedS),'Invalid registered piece release.');
    const result={status:'unresolved',pointsPhase:null,reportAtS:rule.observationUntilS};
    if(row.releasedS<rule.fromS || row.releasedS>=rule.actionUntilS)return {...result,status:'outside-action-window'};
    if(row.observation==null)return result;
    const o=row.observation;
    check(o.releaseId===row.id && o.robot===row.robot && o.piece===row.piece && o.target===row.target &&
      o.category===rule.category && o.scenario===row.scenario && o.clock===spec.clock && sha(o.traceSha256) &&
      ['met','failed','unknown'].includes(o.result) && time(o.observedS) && o.observedS>=row.releasedS,
      'Observation differs from its released article, target, criterion, scenario or clock.');
    if(o.result==='met')check(time(o.passageS) && o.passageS>=row.releasedS && o.passageS<=o.observedS,
      'A successful assessment needs a chronological criterion passage.');
    if(o.result==='met' && (rule.entryUntilS!==undefined || rule.checkActivityAt==='entry')){
      if(o.entryS==null)return result;
      check(time(o.entryS) && row.releasedS<=o.entryS && o.entryS<=o.passageS,'Invalid entry before the assessed passage.');
      if(o.entryS>=rule.entryUntilS)return {...result,status:'outside-entry-window'};
    }
    if(o.observedS>rule.observationUntilS || (o.result==='met' && o.passageS>rule.passageUntilS))return {...result,status:'outside-assessment-window'};
    if(o.result!=='met')return {...result,status:o.result==='failed'?'missed':'unresolved',reportAtS:o.observedS};
    const target=model.stations.find(s=>s.id===rule.target);
    if(target.activeWindows){
      const trigger={release:row.releasedS,entry:o.entryS,passage:o.passageS}[rule.checkActivityAt];
      if(!time(trigger))return result;
      const windows=target.activeWindows.filter(w=>{
        const start=periods.get(w.phase).start;
        return trigger>=start+w.fromS && trigger<start+w.toS;
      });
      if(!windows.length)return {...result,status:'inactive',reportAtS:o.observedS};
      // The compiled physical journal cannot infer a first-period leader from a partial match.
      if(windows.every(w=>w.firstPeriodLeader))return result;
    }
    const pointsPhase=rule.attributeTo==='release'?rule.phase:[...periods].find(([,p])=>p.start<=o.passageS && o.passageS<p.stop)?.[0];
    return {status:pointsPhase?'credited':'unresolved',pointsPhase:pointsPhase??null,reportAtS:o.observedS};
  }
  function register(rows,scenario) {
    check(Array.isArray(rows),'Supply an array of released-article observations.');
    const ids=new Set(),articleTimes=new Set(),previous=new Map();
    return rows.map(row=>{
      const key=JSON.stringify([row.piece,row.releasedS]);
      check(row.scenario===scenario && !ids.has(row.id) && !articleTimes.has(key),'Duplicate release or unrelated scenario.');
      ids.add(row.id);articleTimes.add(key);
      const result=judge(row),prior=previous.get(row.piece);
      if(prior){
        check(row.previousReleaseId===prior.row.id && time(row.reacquiredS) && prior.row.observation &&
          row.reacquiredS>=prior.row.observation.observedS && row.reacquiredS<row.releasedS,
          'A repeated piece requires intervening observed reacquisition after the preceding assessment.');
      }
      previous.set(row.piece,{row,result});
      return {row,result};
    });
  }
  function phaseStart(phase){return periods.get(phase).start;}
  return {rules,judge,register,phaseStart,elapsed};
}
