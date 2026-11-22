/**
 * Design statuses shared by every design phase. A status lives in a phase's index, never in a design's own
 * record, so changing it never rewrites published evidence. A status change is an index edit in a reviewed pull
 * request; Git history is the record of what the status was.
 *
 * in-progress  passes the phase's automated checks and may be shown, labelled as in progress
 * effective    accepted by the project as the current design for the phase; at most one per phase
 * superseded   replaced by a newer effective design; viewable as history
 * withdrawn    pulled with no replacement; the index keeps the reason and the last commit that held its files
 */
export const designStatuses = ['in-progress', 'effective', 'superseded', 'withdrawn'];

/** The status of a listed design; one without an entry is in progress, or superseded when `historical` names it. */
export const statusOf = (index, id, historical = new Set()) => index?.designStatus?.[id] ?? (historical.has(id) ? 'superseded' : 'in-progress');

/** The design a stable URL opens: the effective one, else the newest in progress, else the newest not withdrawn. */
export function currentFor(index, historical = new Set(), ids = index.releases) {
  const st = i => statusOf(index, i, historical);
  return ids.find(i => st(i) === 'effective') ?? [...ids].reverse().find(i => st(i) === 'in-progress')
    ?? [...ids].reverse().find(i => st(i) !== 'withdrawn' && !historical.has(i)) ?? ids.at(-1);
}
