/**
 * The gate record: the one verdict the plugin stores, gate.json, written beside a published design when it is marked
 * effective (stage-gate.mjs).
 *
 *   {schema, phase, design,
 *    verdict         the status the records were judged: layout-checked
 *    firstUnmet      null: nothing is unmet
 *    readiness       {met, of} for a preliminary design: every criterion
 *    files           {source, parts, judgement, records}: each file judged, by project path, with its SHA-256
 *    library         the design library that judged the records current: {library, version, commit}
 *    elapsedSeconds, date, commit}
 *
 * An effective design is held to this record: the publication check refuses it when a file it names has changed or is
 * gone. The review page, its page file and its scene are not among them, so a page may be rebuilt.
 */
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

import {writeFileAtomic} from './atomic-write.mjs';

export const gateFile = 'gate.json', gateSchema = 'agent-frc/stage-gate@2';
export const fileGroups = ['source', 'parts', 'judgement', 'records'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const lfsPointer = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n(?:.*\r?\n)*?oid sha256:([0-9a-f]{64})\r?\n/;

/** The SHA-256 of a file's content. A Git LFS pointer names the digest of the file it stands for. */
export function contentSha(bytes) {
  const pointer = bytes.length < 1024 ? lfsPointer.exec(bytes.toString('utf8')) : null;
  return pointer ? pointer[1] : createHash('sha256').update(bytes).digest('hex');
}

/** Every file a verdict or a gate record names, as [project path, sha256]. */
export const judgedFiles = files => fileGroups.flatMap(group => Object.entries(object(files?.[group]) ? files[group] : {}));

/** Why a verdict's list of judged files cannot be held to, or null: a source, a judgement file and a record at least, in the design's own folder. */
export function filesProblem(files, inputs) {
  const own = name => name.startsWith(inputs + '/');
  for (const group of ['source', 'judgement', 'records']) if (!Object.keys(object(files?.[group]) ? files[group] : {}).length) return 'it names no judged files (' + group + ')';
  if (!Object.hasOwn(files.judgement, inputs + '/judgement.json')) return 'it was not judged by ' + inputs + '/judgement.json';
  const outside = fileGroups.filter(group => group !== 'judgement').flatMap(group => Object.keys(files[group] ?? {})).find(name => !own(name));
  return outside ? 'keep ' + outside + ' in its folder, ' + inputs + ': a change to a file elsewhere would not touch the design' : null;
}

/** Whether a gate record is the passing gate of this design: its phase, its ID, its folder, nothing unmet and, for a preliminary design, every criterion met. */
export function isGateOf(gate, {phase, id, inputs}) {
  return object(gate) && gate.schema === gateSchema && gate.phase === phase && gate.design === id && gate.verdict === 'layout-checked' && gate.firstUnmet === null &&
    filesProblem(gate.files, inputs) === null &&
    (phase !== 'preliminary-design' || object(gate.readiness) && Number.isInteger(gate.readiness.of) && gate.readiness.of > 0 && gate.readiness.met === gate.readiness.of);
}

/** The files a gate record judged that are no longer those files, each in words. Empty while the record stands for the design. */
export function gateDifferences(root, gate) {
  return judgedFiles(gate.files).map(([name, recorded]) => {
    const full = path.resolve(root, name);
    if (!statSync(full, {throwIfNoEntry: false})?.isFile()) return name + ' is missing';
    return contentSha(readFileSync(full)) === recorded ? null : name + ' changed';
  }).filter(Boolean);
}

/** Whether two gates judged the same records: the same design under another ID. The inputs folders tell which part of a path is the ID. */
export function sameRecords(a, aInputs, b, bInputs) {
  const own = (gate, inputs) => Object.fromEntries(Object.entries(gate?.files?.records ?? {}).map(([name, digest]) => [path.posix.relative(inputs, name), digest]).sort());
  const mine = own(a, aInputs), other = own(b, bInputs);
  return Object.keys(mine).length > 0 && JSON.stringify(mine) === JSON.stringify(other);
}

/** The gate record in a published folder, or null when it holds none that can be read. */
export function readGate(published) {
  const file = path.join(published, gateFile);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
export function writeGate(published, gate) { writeFileAtomic(path.join(published, gateFile), JSON.stringify(gate, null, 2) + '\n'); }

/** A gate record for a reviewer, in one line. */
export function gateText(gate) {
  const library = gate.library ?? {};
  return 'Stage gate: ' + gate.verdict + (gate.readiness ? ', ' + gate.readiness.met + ' of ' + gate.readiness.of + ' readiness criteria met' : '') + ', judged ' + gate.date + ' on ' +
    Object.keys(gate.files.records).length + ' records with ' + [library.library, library.version, library.commit?.slice(0, 7)].filter(Boolean).join(' ') + '\n';
}
