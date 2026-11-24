/** A small, invented review scene: an arm turned by a motor on a fixed frame, a battery and one field fixture. */
const box = (lo, hi) => ({
  v: [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]],
  f: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
});
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const turn = k => { const a = Math.PI / 2 * k / 24, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const pin = name => ({file: name, sha256: (name.length.toString(16) + 'a'.repeat(64)).slice(0, 64)});
// The triangle speed profile of a 2.4 s stroke, at 25 even stroke fractions.
const clock = Array.from({length: 25}, (_, k) => { const s = k / 24; return 2.4 * (s <= 0.5 ? Math.sqrt(s / 2) : 1 - Math.sqrt((1 - s) / 2)); });

export function reviewScene(overrides = {}) {
  const body = (name, category, role, group, extra = {}) => ({
    name, category, role, color: {structure: '#5e7da3', mechanism: '#2f9e8f', battery: '#8e6bb8', reference: '#c9a227'}[role] ?? '#7a8794',
    subsystem: group, motionGroup: group, material: null, volumeMm3: 64000, closed: true, fixture: role === 'reference',
    description: 'Invented note on ' + name + '.', massKg: role === 'reference' ? null : 1.5, massRangeKg: role === 'reference' ? null : [1.4, 1.7],
    massFrom: role === 'reference' ? null : 'massKg', massExcluded: role === 'reference' ? 'Field fixture; not robot weight' : null, motorOf: [], ...extra});
  const scene = {
    schema: 'agent-frc/preliminary-review-scene@2', issue: 'synthetic-review-layout', design: 'Invented arm 1.0', title: 'Invented arm raise and return', context: 'Synthetic project',
    architecture: 'Invented pivoting arm on a fixed frame', datum: 'Invented frame datum, millimetres', units: 'Millimetres in the design source frame; kg, A, V',
    links: [{label: 'Season site', href: '../../../'}],
    sources: {design: pin('design.json'), narrative: pin('narrative.md'), page: pin('page.json')},
    records: {folder: 'records', jobs: [{id: 'clearance.motion.raise', file: 'measurements/clearance.motion.raise.json', sha256: pin('r').sha256},
      {id: 'electrical.raise', file: 'measurements/electrical.raise.json', sha256: pin('e').sha256}], trials: null},
    decision: {status: 'layout-checked', firstUnmet: null}, unmet: [], reopen: [], premises: [],
    palette: {structure: '#5e7da3', mechanism: '#2f9e8f', battery: '#8e6bb8', reference: '#c9a227'},
    meshes: [box([-300, -250, 0], [300, 250, 60]), box([0, -40, 60], [420, 40, 120]), box([-200, 60, 60], [-60, 200, 180]), box([900, -300, 0], [1100, 300, 900]), box([-280, -230, 60], [-240, -190, 100])],
    bodies: {frame: body('frame', 'structure', 'structure', 'frame'), arm: body('arm', 'mechanism', 'mechanism', 'arm'),
      'arm motor': body('arm motor', 'structure', 'structure', 'frame', {motorOf: ['shoulder'], massKg: 0.4, massRangeKg: [0.35, 0.45]}),
      battery: body('battery', 'battery', 'battery', 'battery'), target: body('target', 'reference', 'reference', 'field', {subsystem: 'field', motionGroup: 'field'})},
    cases: [
      {id: 'raise', label: 'raise (operating)', kind: 'nominal', purpose: 'operating', cause: 'drive', basis: 'Invented: turn the arm a quarter turn.', status: 'pass', allowanceMm: 5,
        bodies: {frame: {mesh: 0, matrices: [I]}, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(k))}, 'arm motor': {mesh: 4, matrices: [I]}, battery: {mesh: 2, matrices: [I]}, target: {mesh: 3, matrices: [I]}},
        removed: [], results: [{pair: ['arm', 'battery'], status: 'pass', lowerBoundMm: 12.5, method: 'adaptive search'}],
        time: clock.slice(), measure: Array.from({length: 25}, (_, k) => 'shoulder ' + (90 * k / 24).toFixed(1) + '° of 0–90°, up to 12.0 A · bus 11.10–12.40 V')},
      {id: 'package-displacement-control', label: 'Displaced control', kind: 'displaced control', purpose: 'operating', cause: 'drive',
        basis: 'Invented: move the battery into the arc.', status: 'fail', allowanceMm: 5,
        bodies: {frame: {mesh: 0, matrices: [I]}, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(k))}, 'arm motor': {mesh: 4, matrices: [I]}, battery: {mesh: 2, matrices: [[1, 0, 0, 180, 0, 1, 0, -150, 0, 0, 1, 0]]}, target: {mesh: 3, matrices: [I]}},
        removed: [], results: [{pair: ['arm', 'battery'], status: 'fail', witness: {t: 0.5, gapMm: 0, volumeMm3: 4100}}]}],
    openingCase: 'raise',
    animations: [{id: 'transfer', title: 'Transfer', mission: true, cases: ['raise']}],
    parked: {screenedPairs: 6, positive: [], unresolved: []},
    weight: {totalKg: 6.1, rangeKg: [5.6, 6.9], notRobotWeight: [], unweighed: [],
      groups: {frame: {massKg: 1.9, rangeKg: [1.75, 2.15], members: ['frame', 'arm motor'], extra: []}, arm: {massKg: 1.5, rangeKg: [1.4, 1.7], members: ['arm'], extra: []},
        battery: {massKg: 2.7, rangeKg: [2.45, 3.05], members: ['battery'], extra: ['wiring']}},
      extraMass: [{name: 'wiring', group: 'battery', rangeKg: [0.2, 0.4], note: 'Invented loom'}],
      limits: [{name: 'inspection', limitKg: 20, excludesGroups: ['battery'], basis: 'Invented rule', rangeKg: [3.15, 3.85], marginKg: 16.15, status: 'pass'}]},
    power: {minBusV: 9, conservative: 'conservative: each drive\'s peak current is added to the others as though the peaks came at once',
      motions: [{motion: 'raise', status: 'pass', busV: [11.1, 12.4], loadA: [4, 12], requiredV: 9, governs: 'minBusV', marginV: 2.1, clamped: [],
        openCircuitV: [12.2, 12.9], resistanceOhm: [0.015, 0.03],
        drives: [{drive: 'shoulder', motor: 'small motor', motorSolid: 'arm motor', count: 1, group: 'arm', kind: 'rotation', change: 90, unit: '°',
          currentA: [4, 12], neededA: [4, 12], limitA: 40, motorV: [3.1, 6.2], clamped: false, busA: [4, 12], members: ['arm motor']}],
        alsoRunning: []}]},
    required: [{role: 'structure', ids: ['frame', 'arm motor']}, {role: 'battery', ids: ['battery']}],
    narrativeReview: {source: pin('narrative.md'), objectives: [{objective: 'Raise the invented article', disposition: 'represented', basis: 'The raise motion.'}]},
    motionEvidence: [{case: 'raise', kind: 'nominal', purpose: 'operating', cause: 'drive', result: 'pass', playable: true, limitingPair: ['arm', 'battery'], limitingTime: null, limitingValue: {lowerBoundMm: 12.5},
      start: 'As drawn', groups: ['arm'], environment: 'Field fixtures: target', metric: 'Minimum surface gap; positive overlap volume', units: 'mm, mm³',
      allowanceMm: 5, allowanceBasis: 'Invented reserve', method: 'adaptive search', basis: 'Invented: turn the arm a quarter turn.'},
      {case: 'package-displacement-control', kind: 'displaced control', result: 'rejected as expected', expected: 'fail', playable: true, limitingPair: ['arm', 'battery'],
        limitingTime: 0.5, limitingValue: {gapMm: 0, volumeMm3: 4100}, start: 'battery displaced [180, -150, 0] mm', groups: ['arm'], environment: 'Field fixtures: target',
        metric: 'Minimum surface gap; positive overlap volume', units: 'mm, mm³', allowanceMm: 5, allowanceBasis: 'Invented reserve', method: 'adaptive search'}],
    returnCriteria: {preliminary: ['A motion fails clearance or leaves an open interval'], conceptual: ['An accepted conceptual-design premise leaves its criterion']},
    interactions: [], adjustments: [], focus: 'Invented focus: check the arm clears the battery.', notes: ['Invented note on the model basis.'],
    cutaway: {label: 'Target cutaway', hides: ['target'], outline: [[900, -100, 300], [900, 100, 300], [900, 100, 500], [900, -100, 500]]}
  };
  return Object.assign(scene, overrides);
}

/** The same invented scene with one trial replay: the robot drives 400 mm, the arm turns, a hose sags and a banner of links follows it. */
export function replayScene(overrides = {}) {
  const scene = reviewScene();
  const frames = 5, move = k => [1, 0, 0, 100 * k, 0, 1, 0, 0, 0, 0, 1, 0];
  const armAt = k => { const m = turn(6 * k); m[3] = 100 * k; return m; };
  const line = k => [[-400, 300, 200], [-200, 300, 200 - 30 * k], [0, 300, 200]];
  scene.meshes.push(box([-400, 290, 190], [0, 310, 210]));
  scene.bodies.banner = {...scene.bodies.target, name: 'banner', description: 'Invented banner that follows the hose.'};
  scene.replays = [{
    id: 'lane-run', label: 'Lane run (recorded)', basis: 'Invented recorded run toward the target.', objective: 'Raise the invented article',
    evidence: [{...pin('lane-run.json'), role: 'recorded run'}], recorded: ['Robot position', 'Arm angle'], display: ['Hose shape'],
    time: Array.from({length: frames}, (_, k) => k * 0.5), measure: Array.from({length: frames}, (_, k) => 'Robot ' + 100 * k + ' mm along the lane'),
    events: [{frame: 2, label: 'Halfway'}, {frame: 4, label: 'At the target'}], follow: 'robot',
    bodies: {frame: {mesh: 0, group: 'robot'}, arm: {mesh: 1, group: 'arm'}, battery: {mesh: 2, group: 'robot'}, target: {mesh: 3, group: null}},
    groups: {robot: Array.from({length: frames}, (_, k) => move(k)), arm: Array.from({length: frames}, (_, k) => armAt(k))},
    tubes: [{name: 'Hose', radiusMm: 8, color: '#c9a227', points: Array.from({length: frames}, (_, k) => line(k))},
      {name: 'Banner', body: 'banner', mesh: 5, points: Array.from({length: frames}, (_, k) => line(k))}]}];
  return Object.assign(scene, overrides);
}

/** The same invented scene with the raise as three chained motions of one phase, then a park return: two animations for four motions. */
export function phasedScene(overrides = {}) {
  const scene = reviewScene();
  const [raise, control] = scene.cases, [row, controlRow] = scene.motionEvidence;
  const {time, measure, ...untimed} = raise;
  const part = n => ({...untimed, id: 'raise-0' + (n + 1), label: 'raise-0' + (n + 1) + ' (operating)', basis: 'Invented: third ' + (n + 1) + ' of the raise.',
    bodies: {...raise.bodies, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(8 * n + k / 3))}},
    results: [{pair: ['arm', 'battery'], status: 'pass', witness: {t: 0.5, gapMm: 12.5 - 3 * n, volumeMm3: 0}}]});
  const lower = {...untimed, id: 'lower', label: 'lower (park)', purpose: 'park', cause: 'hand', basis: 'Invented: return the arm by hand.',
    bodies: {...raise.bodies, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(24 - k))}}, results: []};
  scene.cases = [part(0), part(1), part(2), lower, control];
  scene.animations = [{id: 'transfer', title: 'Raise the arm', mission: true, cases: ['raise-01', 'raise-02', 'raise-03']}, {id: 'park', title: 'Park', mission: false, cases: ['lower']}];
  scene.openingCase = 'raise-01';
  scene.power.motions[0].motion = 'raise-02';
  const evidence = (id, gap) => ({...row, case: id, limitingTime: 0.5, limitingValue: {gapMm: gap, volumeMm3: 0}, pathToleranceMm: 2});
  scene.motionEvidence = [evidence('raise-01', 12.5), evidence('raise-02', 9.5), evidence('raise-03', 6.5),
    {...row, case: 'lower', purpose: 'park', cause: 'hand', limitingPair: null, limitingValue: null}, controlRow,
    {case: 'objective: Stall the arm', kind: 'uncovered', result: 'out-of-scope', playable: false, note: 'Invented: the stall is handled by the drive team'}];
  return Object.assign(scene, overrides);
}

/** The verdict a scene built from these records repeats: the fields compareWithVerdict reads. */
export function verdictOf(shown) {
  const scene = JSON.parse(JSON.stringify(shown));
  const motions = Object.fromEntries(scene.cases.filter(c => c.kind !== 'displaced control').map(c => [c.id, {status: c.status}]));
  const control = scene.cases.find(c => c.kind === 'displaced control');
  return {schema: 'agent-frc/layout-verdict@1', issue: scene.issue, status: scene.decision.status, firstUnmet: scene.decision.firstUnmet, unmet: scene.unmet,
    motions, control: control ? {rejected: control.status === 'fail'} : null, reopen: scene.reopen, premises: scene.premises,
    weight: {totalKg: scene.weight.totalKg, rangeKg: scene.weight.rangeKg, notRobotWeight: scene.weight.notRobotWeight, limits: scene.weight.limits},
    electrical: {minBusV: scene.power.minBusV, conservative: scene.power.conservative,
      motions: Object.fromEntries(scene.power.motions.map(m => [m.motion, {status: m.status, busV: m.busV, requiredV: m.requiredV, marginV: m.marginV, governs: m.governs, clamped: m.clamped}]))},
    attachment: scene.attachment ?? null, interactions: scene.interactions, adjustments: scene.adjustments, narrative: {objectives: scene.narrativeReview.objectives},
    records: {folder: scene.records.folder, jobs: scene.records.jobs.map(({id, file}) => ({id, file, action: 'current'}))}};
}
