/** Advance complete configured matches on one simulated clock, carrying fractional time through each boundary. */
export function createMatchSeries(engine, matches) {
  if (!Array.isArray(matches) || !matches.length) throw Error('Supply at least one project-authored match');
  const ids=new Set();
  const configs=matches.map(match=>{
    if (typeof match.id!=='string' || !match.id.trim() || ids.has(match.id) || !match.basis?.trim() ||
        !Array.isArray(match.roster) || !match.roster.length)
      throw Error('Specify unique match IDs, behavior basis and roster');
    ids.add(match.id);
    const roster=match.roster.map(row=>{
      if (!row.plans || !engine.periods.every(p=>Object.hasOwn(engine.behaviors,row.plans[p.name])))
        throw Error('Each scheduled robot needs a named behavior in every period');
      return {...engine.defaults(row.side,row.slot),...row};
    });
    return {...match,roster:engine.completeRoster(roster)};
  });
  let index=0, sim, remainingS=0;
  const results=[];
  function begin() {
    const match=configs[index];
    sim=engine.create(match.roster,match.setup,match.tieWinner,match.endgameAtRestAfterS);
    sim.paused=false;
  }
  begin();
  function advance(seconds) {
    if (!Number.isFinite(seconds) || seconds<0) throw Error('Invalid series elapsed seconds');
    remainingS+=seconds;
    while (results.length<configs.length && remainingS>=engine.dt-1e-9) {
      const remaining=engine.phaseSeconds(sim.phase)-sim.ticks*engine.dt;
      const ticks=Math.min(Math.round(remaining/engine.dt),Math.floor((remainingS+1e-9)/engine.dt));
      engine.advance(sim,ticks*engine.dt);
      remainingS=Math.max(0,remainingS-ticks*engine.dt);
      if (!sim.ended) break;
      if (sim.phaseIndex<engine.periods.length-1) {
        engine.nextPhase(sim); sim.paused=false;
      } else {
        const match=configs[index];
        results.push({id:match.id,basis:match.basis,setup:sim.setup,roster:match.roster,periods:sim.phaseHistory,game:sim.game});
        if (index+1<configs.length) {index++;begin();}
      }
    }
  }
  return {get sim(){return sim;},get match(){return configs[index];},get done(){return results.length===configs.length;},results,advance};
}

/** Keep the student's editable starting configuration independent of match playback. */
export function createRehearsalSetup(engine, initialRoster, initialSetup, publishedMatches = []) {
  let roster = initialRoster ?? engine.startingRoster(), setup = initialSetup;
  function edit(nextRoster, nextSetup) {
    const sim = engine.create(nextRoster, nextSetup);
    roster = structuredClone(nextRoster);
    setup = nextSetup;
    return sim;
  }
  function reset() {
    return engine.create(structuredClone(roster), setup);
  }
  function series(source) {
    if (source === 'published') return createMatchSeries(engine, publishedMatches);
    if (source !== 'student') throw Error('Choose a match series');
    const trials = [1, 2, 3].map(i => ({
      id: 'Trial ' + i,
      basis: 'Repeat the student roster, period behaviors and obstacle setup',
      roster: structuredClone(roster),
      setup
    }));
    return createMatchSeries(engine, trials);
  }
  return {edit, reset, series, get roster(){return structuredClone(roster);}, get setup(){return setup;}};
}
