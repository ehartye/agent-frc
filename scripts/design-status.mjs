/**
 * Design statuses shared by every design phase's release gate. A status lives in a phase's mutable release index,
 * never in an issued release, so changing it never rewrites published evidence.
 *
 * in-progress  passes the phase's automated checks and may be shown, labelled as in progress
 * effective    accepted by the project as the current design for the phase; at most one per phase
 * superseded   replaced by a newer effective design; viewable as history
 * withdrawn    pulled with no replacement; archived, never current
 */
export const designStatuses = ['in-progress', 'effective', 'superseded', 'withdrawn'];

/** The allowed changes against the approved index. `superseded` only accompanies a newly effective design. */
export const transitions = {
  'in-progress': ['effective', 'withdrawn'],
  effective: ['superseded', 'withdrawn'],
  superseded: ['withdrawn'],
  withdrawn: []
};

/**
 * True when a design may move from `from` to `to` in one index edit. `from` is null for a design the approved
 * index does not list: it enters in progress, or effective when the phase's effective conditions hold.
 */
export function transitionAllowed(from, to, {promoted = false} = {}) {
  if (from === null) return to === 'in-progress' || to === 'effective';
  if (from === to) return true;
  if (to === 'superseded') return from === 'effective' && promoted;
  return transitions[from]?.includes(to) ?? false;
}

/** The status of a listed design; one without an entry is in progress, or superseded when `historical` names it. */
export const statusOf = (index, id, historical = new Set()) => index?.designStatus?.[id] ?? (historical.has(id) ? 'superseded' : 'in-progress');

/** The design a stable URL opens: the effective one, else the newest in progress, else the newest not withdrawn. */
export function currentFor(index, historical = new Set(), ids = index.releases) {
  const st = i => statusOf(index, i, historical);
  return ids.find(i => st(i) === 'effective') ?? [...ids].reverse().find(i => st(i) === 'in-progress')
    ?? [...ids].reverse().find(i => st(i) !== 'withdrawn' && !historical.has(i)) ?? ids.at(-1);
}
