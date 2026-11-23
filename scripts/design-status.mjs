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

/**
 * A preliminary design release takes a version as its ID: MAJOR.MINOR. The major number is the architecture, named
 * once in the index under `designs`; the minor number counts that architecture's effective baselines. A publish of an
 * in-progress version is a draft, counted in the index under `revision`, and takes no number.
 */
export const versionId = /^([1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;
export const releaseId = /^[1-9][0-9]{0,3}\.(?:0|[1-9][0-9]{0,3})$/;

/** {major, minor} of a version ID, else null. */
export function versionOf(id) {
  const match = versionId.exec(id ?? '');
  return match ? {major: Number(match[1]), minor: Number(match[2])} : null;
}

/** The name of the architecture a version belongs to, from the index. */
export function designName(index, id) {
  const version = versionOf(id), name = version && index?.designs?.[version.major]?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

/** How a release reads: NAME MAJOR.MINOR for a named version, else its ID. */
export const designTitle = (index, id) => designName(index, id) ? designName(index, id) + ' ' + id : id;

/**
 * A detailed design takes the same name and its own MAJOR.MINOR. Its index lists design IDs under `designs`, so it
 * names each architecture under `architectures`: {"1": {"name": "NAME"}}. The minor number counts the detailed
 * effective baselines of that architecture, and a publish of an in-progress version is a draft under `revision`.
 */
export function architectureName(index, id) {
  const version = versionOf(id), name = version && index?.architectures?.[version.major]?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

/** How a detailed design reads: NAME MAJOR.MINOR for a named version, else its ID. */
export const detailedTitle = (index, id) => architectureName(index, id) ? architectureName(index, id) + ' ' + id : id;

/** The draft count of a design: how many times it was staged with changed files. One staged before drafts were counted is at 1. */
export function draftOf(index, id) {
  const number = index?.revision?.[id]?.number;
  return Number.isInteger(number) && number > 0 ? number : 1;
}

/** What a reader sees after the name: the draft count while in progress, then the status. */
export const stateOf = (index, id, status = index?.designStatus?.[id] ?? 'in-progress') =>
  status === 'in-progress' ? 'draft ' + draftOf(index, id) + ' · in progress' : status;
