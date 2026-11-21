/** Project-defined decisions at the final powered cutoff. Serialized into the standalone lab. */
export function createTerminalRehearsal(profile) {
  const model = profile.rehearsal;
  const spec = model?.endgame;
  if (spec === undefined) return null;
  function check(value, message) { if (!value) throw Error('Endgame: ' + message); }
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const seconds = value => Number.isFinite(value) && value >= 0;
  const tickTime = value => seconds(value) && Number.isSafeInteger(value * 20);
  const list = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
  const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
    value[0] >= 0 && value[0] <= profile.field.length && value[1] >= 0 && value[1] <= profile.field.width;
  const states = ['met', 'failed', 'unknown'];
  const flags = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.entries(obj).every(([key, value]) => text(key) && states.includes(value));
  function catalog(rows, label) {
    check(Array.isArray(rows) && rows.every(r => text(r?.id) && text(r.label)), 'supply named ' + label);
    const map = new Map(rows.map(r => [r.id, r]));
    check(map.size === rows.length, 'duplicate ' + label);
    return map;
  }
  check(spec && spec.period === model.periods.at(-1)?.name, 'choose the final powered period');
  check((spec.basis === undefined || text(spec.basis)) && (spec.sources === undefined || list(spec.sources)), 'invalid basis or sources');
  const periodS = model.periods.at(-1).seconds;
  const activeS = model.periods.reduce((sum,p,i) => sum+p.seconds+(i<model.periods.length-1?(p.passiveAfterS??0):0),0);
  const assessment = spec.assessment ?? {maxDelayS: 0};
  check(seconds(assessment.maxDelayS) && (assessment.atRestAfterS === undefined || seconds(assessment.atRestAfterS)),
    'provide a nonnegative passive assessment delay');
  const actions = catalog(spec.actions, 'actions'), targets = catalog(spec.targets, 'targets');
  const bonuses = catalog(spec.bonuses ?? [], 'bonuses');
  check(actions.size && targets.size, 'provide at least one action and approach target');
  for (const a of actions.values()) {
    check(count(a.points) && tickTime(a.serviceS) && list(a.requires) && a.requires.length,
      'each action needs points, 0.05 s service increments and at least one terminal criterion');
    check(a.eligibleRobots === undefined || list(a.eligibleRobots) && a.eligibleRobots.every(id => /^[BR][123]$/.test(id)),
      'invalid eligible robot slots');
  }
  const resources = new Map();
  const key = t => JSON.stringify([t.side,t.resource]);
  for (const t of targets.values()) {
    check(['blue','red'].includes(t.side) && point(t.at) && (t.displayAt === undefined || point(t.displayAt)) &&
      Number.isFinite(t.radiusIn) && t.radiusIn > 0 && text(t.resource) && count(t.capacity) && t.capacity > 0,
      'each target needs an alliance, in-field approach, radius and positive shared capacity');
    check(t.actions === undefined || list(t.actions) && t.actions.every(id => actions.has(id)), 'unknown target action');
    check(t.setups === undefined || list(t.setups) && t.setups.length && t.setups.every(s => model.setups.includes(s)), 'unknown target obstacle setup');
    check(flags(t.witnesses ?? {}), 'invalid shared target observation');
    for (const setup of t.setups ?? model.setups) {
      const group = JSON.stringify([t.side,t.resource,setup]), other = resources.get(group);
      check(!other || other.capacity === t.capacity, 'targets sharing one alliance resource must agree on capacity');
      resources.set(group,t);
    }
  }
  for (const b of bonuses.values()) {
    check(list(b.actions) && b.actions.length && b.actions.every(id => actions.has(id)) && count(b.points) &&
      count(b.minRobots) && b.minRobots > 0 && b.minRobots <= 3 &&
      ['resource','alliance'].includes(b.scope) && ['robot','alliance','group','additionalRobot'].includes(b.per) &&
      list(b.requires ?? []) && list(b.targetRequires ?? []), 'invalid conditional bonus');
    if (b.scope === 'resource') for (const t of targets.values()) for (const setup of t.setups ?? model.setups) {
      const other = resources.get(JSON.stringify([t.side,t.resource,setup]));
      for (const criterion of b.targetRequires ?? []) check((t.witnesses?.[criterion] ?? 'unknown') ===
        (other.witnesses?.[criterion] ?? 'unknown'),'shared resource observations disagree for ' + criterion);
    }
  }
  function eligible(robot, action, target, setup) {
    return robot.side === target.side && (!action.eligibleRobots || action.eligibleRobots.includes(robot.id)) &&
      (!target.actions || target.actions.includes(action.id)) && (!target.setups || target.setups.includes(setup));
  }
  function criteria(action) {
    const relevant = [...bonuses.values()].filter(b => b.actions.includes(action.id));
    return [...new Set([...action.requires,...relevant.flatMap(b => b.requires ?? [])])];
  }
  function start(robots, restAfterS, setup) {
    check(restAfterS === undefined || seconds(restAfterS), 'invalid match rest observation');
    const rest = restAfterS ?? assessment.atRestAfterS;
    const delayS = Math.min(rest ?? assessment.maxDelayS, assessment.maxDelayS);
    const attempts = [];
    for (const r of robots) {
      if (r.endgame === undefined) continue;
      const p = r.endgame;
      const a = actions.get(p?.action), t = targets.get(p?.target);
      check(a && t && eligible(r,a,t,setup), 'ineligible action or target for ' + r.id + ' in setup ' + setup);
      check(tickTime(p.startS) && p.startS <= periodS && flags(p.witnesses ?? {}), 'invalid start or witnesses for ' + r.id);
      const choices = p.fallbacks ?? [];
      check(Array.isArray(choices) && choices.length <= actions.size, 'invalid fallback list');
      const seen = new Set([a.id]);
      const allowed = new Set(criteria(a));
      const fallbacks = choices.map(choice => {
        const fa = actions.get(choice?.action), ft = targets.get(choice?.target);
        check(fa && ft && !seen.has(fa.id) && eligible(r,fa,ft,setup), 'ineligible or repeated fallback for ' + r.id + ' in setup ' + setup);
        seen.add(fa.id);for (const c of criteria(fa)) allowed.add(c);
        return {action:fa.id,target:ft.id,requires:[...fa.requires],serviceS:fa.serviceS,heldFromS:null,outcome:'pending'};
      });
      check(Object.keys(p.witnesses ?? {}).every(v => allowed.has(v)), 'undeclared robot witness for ' + r.id);
      attempts.push({robot:r.id,side:r.side,action:a.id,target:t.id,resource:t.resource,startS:p.startS,
        serviceS:a.serviceS,requires:[...a.requires],witnesses:{...p.witnesses},targetWitnesses:{...t.witnesses},
        interruptedAtS:null,arrivedAtS:null,serviceStartS:null,completedAtS:null,fallbacks,
        awardedAction:null,awardedTarget:null,outcome:'pending',points:0});
    }
    return {period:spec.period,basis:spec.basis ?? model.basis,sources:[...(spec.sources ?? model.sources)],activeCutoffS:activeS,
      periodCutoffS:periodS,maxDelayS:assessment.maxDelayS,atRestAfterS:rest ?? null,assessmentTimeS:activeS+delayS,
      assessed:false,attempts,bonusAwards:[],ordinaryScore:null,terminalScore:{blue:0,red:0}};
  }
  function outcome(required, observations) {
    if (required.some(k => observations[k] === 'failed')) return 'failed';
    return required.every(k => Object.hasOwn(observations,k) && observations[k] === 'met') ? 'qualified' : 'unresolved';
  }
  function enter(sim, r, now) {
    if (sim.phase !== spec.period || !r.endgame || now < r.endgame.startS - 1e-8) return null;
    const row = sim.game.endgame.attempts.find(v => v.robot === r.id);
    if (row.interruptedAtS === null) {
      row.interruptedAtS = now;
      row.interruptedBehavior = r.plans[sim.phase];
      for (const entry of Object.values(sim.resources)) {
        if (entry.owner === r.id) entry.owner = null;
        entry.queue = entry.queue.filter(id => id !== r.id);
      }
      Object.assign(r,{leg:0,target:0,waypoints:null,dwell:0});
    }
    return targets.get(row.target);
  }
  function inside(r,t) { return Math.hypot(r.p[0]-t.at[0],r.p[1]-t.at[1]) <= t.radiusIn+1e-8; }
  // Service consumes only actual powered time spent in the approach region.
  function observe(sim, starts, before, after) {
    if (sim.phase !== spec.period) return;
    const rows = sim.game.endgame.attempts;
    for (const [i,r] of sim.robots.entries()) {
      const row = rows.find(v => v.robot === r.id);
      if (!row || row.interruptedAtS === null) continue;
      for (const f of row.fallbacks) {
        const stationary = r.p.every((v,k) => Math.abs(v-starts[i][k]) < 1e-8);
        if (!inside(r,targets.get(f.target))) f.heldFromS = null;
        else if (!stationary) f.heldFromS = after;
        else f.heldFromS ??= before;
      }
      if (row.completedAtS !== null) continue;
      const t = targets.get(row.target);
      if (!inside(r,t)) continue;
      row.arrivedAtS ??= inside({p:starts[i]},t) ? before : after;
    }
    // Reserve an occupied resource once. Earlier arrival takes priority; robot ID breaks simultaneous ties.
    const queue = rows.filter(row => row.arrivedAtS !== null).sort((a,b) => a.arrivedAtS-b.arrivedAtS || a.robot.localeCompare(b.robot));
    for (const row of queue) {
      if (row.serviceStartS === null) {
        const used = rows.filter(other => other.side === row.side && other.resource === row.resource && other.serviceStartS !== null).length;
        if (used >= targets.get(row.target).capacity) continue;
        row.serviceStartS = row.arrivedAtS;
      }
      if (row.completedAtS === null && after+1e-8 >= row.serviceStartS+row.serviceS)
        row.completedAtS = row.serviceStartS+row.serviceS;
    }
  }
  function assess(sim) {
    const g = sim.game.endgame;
    if (sim.phase !== spec.period || g.assessed) return;
    g.ordinaryScore = {...sim.game.score};
    g.assessed = true;
    for (const row of g.attempts) {
      if (row.interruptedAtS === null) row.outcome = 'did-not-start';
      else if (row.arrivedAtS === null) row.outcome = 'did-not-arrive';
      else if (row.serviceStartS === null) row.outcome = 'resource-full';
      else if (row.completedAtS === null) row.outcome = 'service-incomplete';
      else row.outcome = outcome(row.requires,row.witnesses);
      row.position = [...sim.robots.find(r => r.id === row.robot).p];
      if (row.outcome === 'qualified') { row.awardedAction=row.action; row.awardedTarget=row.target; }
    }
    // Physical reservations last through assessment, including a failed attempt occupying its fixture.
    const holders = new Map();
    for (const row of g.attempts.filter(row => row.serviceStartS !== null)) {
      const group = key(targets.get(row.target));
      if (!holders.has(group)) holders.set(group,new Set());
      holders.get(group).add(row.robot);
    }
    for (const row of g.attempts) {
      for (const f of row.fallbacks) {
        const t = targets.get(f.target), group = key(t);
        if (!holders.has(group)) holders.set(group,new Set());
        const occupants = holders.get(group);
        if (row.awardedAction !== null) f.outcome = 'exclusive-base-already-awarded';
        else if (f.heldFromS === null) f.outcome = 'outside-final-region';
        else if (periodS - f.heldFromS + 1e-8 < f.serviceS) f.outcome = 'service-incomplete';
        else if (!occupants.has(row.robot) && occupants.size >= t.capacity) f.outcome = 'resource-full';
        else f.outcome = outcome(f.requires,row.witnesses);
        if (f.outcome === 'qualified') {
          row.awardedAction = f.action; row.awardedTarget = f.target; occupants.add(row.robot);
        }
      }
      if (row.awardedAction !== null) row.points = actions.get(row.awardedAction).points;
      g.terminalScore[row.side] += row.points;
    }
    for (const b of bonuses.values()) for (const side of ['blue','red']) {
      const groups = new Map();
      for (const row of g.attempts.filter(r => r.side === side && b.actions.includes(r.awardedAction))) {
        const group = b.scope === 'resource' ? targets.get(row.awardedTarget).resource : side;
        if (!groups.has(group)) groups.set(group,[]);
        groups.get(group).push(row);
      }
      let alliancePaid = false;
      for (const [group,rows] of groups) {
        const participants = rows.filter(row => outcome(b.requires ?? [],row.witnesses) === 'qualified' &&
          outcome(b.targetRequires ?? [],targets.get(row.awardedTarget).witnesses ?? {}) === 'qualified').map(row => row.robot);
        const n = participants.length;
        const units = n < b.minRobots ? 0 : b.per === 'robot' ? n : b.per === 'additionalRobot' ? n-1 :
          b.per === 'alliance' && alliancePaid ? 0 : 1;
        const points = units*b.points;
        if (units) alliancePaid = true;
        g.bonusAwards.push({id:b.id,side,group,robots:participants,requiredRobots:b.minRobots,units,points});
        g.terminalScore[side] += points;
      }
    }
    for (const side of ['blue','red']) sim.game.score[side] += g.terminalScore[side];
  }
  return {start,enter,inside,observe,assess,eligible,criteria};
}
