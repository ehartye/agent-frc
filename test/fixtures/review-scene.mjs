/** A small, invented review scene: two boxes on a pivot, a frame, a battery and one field fixture. */
const box = (lo, hi) => ({
  v: [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]],
  f: [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
});
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const turn = k => { const a = Math.PI / 2 * k / 24, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const pin = name => ({file: name, sha256: (name.length.toString(16) + 'a'.repeat(64)).slice(0, 64)});

export function reviewScene(overrides = {}) {
  const body = (name, category, role, group, extra = {}) => ({
    name, category, role, color: {structure: '#5e7da3', mechanism: '#2f9e8f', electrical: '#8e6bb8', reference: '#c9a227'}[role] ?? '#7a8794',
    subsystem: group === 'field' ? null : 'Invented ' + group, motionGroup: group, material: role === 'reference' ? null : 'Invented material',
    volumeMm3: 64000, volumeType: 'material', closed: true, fixture: role === 'reference',
    purpose: 'Invented purpose of ' + name + '.', rationale: 'Invented reason for ' + name + '.', support: role === 'mechanism' ? 'Pivot shaft into the frame plate.' : null,
    massExcluded: role === 'reference' ? 'Field fixture; not robot mass' : null, missing: role === 'reference' ? ['subsystem', 'material'] : [], ...extra});
  const scene = {
    schema: 'agent-frc/preliminary-review-scene@1', issue: 'synthetic-review-layout', title: 'Invented arm raise and return', context: 'Synthetic project',
    architecture: 'Invented pivoting arm on a fixed frame', datum: 'Invented frame datum, millimetres', units: 'Millimetres in the registered STEP world; kg, A, V',
    links: [{label: 'Season site', href: '../../../'}],
    sources: {step: pin('package.step'), motion: pin('paths.json'), narrative: pin('narrative.md')},
    decision: {status: 'pending receipt', firstUnmet: null},
    palette: {structure: '#5e7da3', mechanism: '#2f9e8f', electrical: '#8e6bb8', reference: '#c9a227'},
    meshes: [box([-300, -250, 0], [300, 250, 60]), box([0, -40, 60], [420, 40, 120]), box([-200, 60, 60], [-60, 200, 180]), box([900, -300, 0], [1100, 300, 900])],
    bodies: {frame: body('frame', 'structure', 'structure', 'frame'), arm: body('arm', 'mechanism', 'mechanism', 'arm'),
      battery: body('battery', 'electrical', 'electrical', 'battery'), target: body('target', 'reference', 'reference', 'field')},
    cases: [
      {id: 'raise', label: 'raise (operating)', kind: 'nominal', stage: 'operating', basis: 'Invented: turn the arm a quarter turn.', status: 'pass', allowanceMm: 5,
        bodies: {frame: {mesh: 0, matrices: [I]}, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(k))}, battery: {mesh: 2, matrices: [I]}, target: {mesh: 3, matrices: [I]}},
        removed: [], results: [{pair: ['arm', 'battery'], status: 'pass', lowerBoundMm: 12.5}],
        time: Array.from({length: 25}, (_, k) => k * 0.1), measure: Array.from({length: 25}, (_, k) => 'Arm at ' + Math.round(k / 24 * 90) + '°')},
      {id: 'package-displacement-control', label: 'package-displacement-control (displaced control)', kind: 'displaced control', stage: 'operating',
        basis: 'Invented: move the battery into the arc.', status: 'fail', allowanceMm: 5,
        bodies: {frame: {mesh: 0, matrices: [I]}, arm: {mesh: 1, matrices: Array.from({length: 25}, (_, k) => turn(k))}, battery: {mesh: 2, matrices: [[1, 0, 0, 180, 0, 1, 0, -150, 0, 0, 1, 0]]}, target: {mesh: 3, matrices: [I]}},
        removed: [], results: [{pair: ['arm', 'battery'], status: 'fail', witness: {t: 0.5, gapMm: 0, volumeMm3: 4100}}]}],
    openingCase: 'raise',
    parked: {screenedPairs: 6, positive: [], unresolved: []},
    mass: {limitKg: 20, inspectionKg: [14.2, 16.8], remainingKg: 3.2, runningKg: [15.1, 18.4],
      lines: [{id: 'structure', kg: [6, 7], members: ['frame'], basis: 'Invented estimate'}, {id: 'mechanisms', kg: [3, 3.6], members: ['arm'], basis: 'Invented estimate'},
        {id: 'power', kg: [2.2, 2.6], members: ['battery'], basis: 'Invented estimate'}, {id: 'remaining robot', kg: [3, 3.6], members: [], basis: 'Invented allowance'}],
      runningAdditions: [{name: 'payload', kg: [0.9, 1.6], members: []}], runningBasis: 'Invented payload'},
    power: [{case: 'raise-weak', duty: 'Raise the arm while driving', stage: 'raise', batteryCondition: 'weak', openCircuitV: 11.6, resistanceOhm: 0.03, requiredMinV: 9,
      loadedBusV: [10.1, 11.1], batterySideA: [20, 50], marginV: 1.1, status: 'pass',
      lines: [{name: 'drive', amps: [15, 35], members: []}, {name: 'arm', amps: [5, 15], members: ['arm']}]}],
    required: [{role: 'Frame', ids: ['frame']}, {role: 'Supply', ids: ['battery']}],
    narrativeReview: {source: pin('narrative.md'), objectives: [{objective: 'Raise the invented article', disposition: 'represented', basis: 'The raise case.'}]},
    motionEvidence: [{case: 'raise', kind: 'nominal', result: 'pass', playable: true, limitingPair: ['arm', 'battery'], limitingTime: null, limitingValue: {lowerBoundMm: 12.5},
      start: 'Installed STEP pose', groups: ['arm'], environment: 'Field fixtures: target', metric: 'Minimum surface gap; positive overlap volume', units: 'mm, mm³',
      allowanceMm: 5, allowanceBasis: 'Invented reserve', method: 'Interval bisection lower bound', basis: 'Invented: turn the arm a quarter turn.'},
      {case: 'package-displacement-control', kind: 'displaced control', result: 'rejected as expected', expected: 'fail', playable: true, limitingPair: ['arm', 'battery'],
        limitingTime: 0.5, limitingValue: {gapMm: 0, volumeMm3: 4100}, start: 'Commissioned start: battery displaced', groups: ['arm'], environment: 'Field fixtures: target',
        metric: 'Minimum surface gap; positive overlap volume', units: 'mm, mm³', allowanceMm: 5, allowanceBasis: 'Invented reserve', method: 'Exact distance and common volume at the witness pose'}],
    returnCriteria: {preliminary: ['A nominal path fails clearance or leaves an open interval'], conceptual: ['An accepted conceptual-design premise leaves its criterion']},
    fieldInteractions: [], focus: 'Invented focus: check the arm clears the battery.', notes: ['Invented note on the model basis.'],
    cutaway: {label: 'Target cutaway', hides: ['target'], outline: [[900, -100, 300], [900, 100, 300], [900, 100, 500], [900, -100, 500]]}
  };
  return Object.assign(scene, overrides);
}
