import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { nativeBodyKey } from './native-identity.mjs';

const id = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function prepareNativeStudy(approval, reference, receiptBytes) {
  if (!object(approval) || Object.keys(approval).sort().join(',') !== 'destination,sourceReceiptSha256') {
    throw Error('Approval must contain a separately verified destination and sourceReceiptSha256');
  }
  const { destination, sourceReceiptSha256 } = approval;
  if (!object(destination) || Object.keys(destination).sort().join(',') !== 'fileId,folderId,projectId,versionId,versionNumber' ||
      !['fileId', 'folderId', 'projectId', 'versionId'].every(key => id(destination[key])) ||
      !Number.isSafeInteger(destination.versionNumber) || destination.versionNumber < 1) {
    throw Error('Approval requires the project, folder, file and exact saved version');
  }
  if (createHash('sha256').update(receiptBytes).digest('hex') !== sourceReceiptSha256) {
    throw Error('Source receipt bytes differ from the independently approved SHA-256');
  }
  if (reference?.schema !== 'agent-frc/native-study-reference@1' || !object(reference.occurrences)
      || !object(reference.joints) || !object(reference.bodies) || !Object.keys(reference.bodies).length) {
    throw Error('Expected a native study reference with an occurrence and solid body inventory');
  }
  for (const [key, body] of Object.entries(reference.bodies)) {
    if (!object(body) || key !== nativeBodyKey(body.occurrenceId, body.localBodyId)
        || !Object.hasOwn(reference.occurrences, body.occurrenceId) || !id(body.revisionId)) {
      throw Error('Reference contains an invalid occurrence-qualified body identity');
    }
  }
  return { schema: 'agent-frc/native-study-binding@1', destination, sourceReceiptSha256, reference };
}

function receiptDigest(bytes, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || /~(?![01])/.test(pointer)) {
    throw Error('archiveDigestPointer must be a non-root JSON Pointer with valid escapes');
  }
  let value = JSON.parse(bytes);
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)
        || (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key))) throw Error('Archive digest pointer is unresolved');
    value = value[key];
  }
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Receipt field must be a SHA-256 digest');
  return value;
}

function solidCapture(bytes, expectedHash) {
  if (sha(bytes) !== expectedHash) throw Error('Reference capture bytes differ from approval');
  const capture = JSON.parse(bytes);
  if (capture.schema !== 'agent-frc/native-study-transition-reference@1' || !object(capture.solids)
      || !object(capture.reference?.bodies) || !Object.keys(capture.solids).length
      || !isDeepStrictEqual(Object.keys(capture.solids).sort(), Object.keys(capture.reference.bodies).sort())) {
    throw Error('Every registered solid requires an independent physical witness in each capture');
  }
  for (const [key, row] of Object.entries(capture.solids)) {
    if (!object(row) || !Number.isFinite(row.volumeCm3) || row.volumeCm3 <= 0
        || !Number.isFinite(row.areaCm2) || row.areaCm2 <= 0
        || !Array.isArray(row.boundsCm) || row.boundsCm.length !== 2
        || !row.boundsCm.every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
        || row.boundsCm[0].some((x, axis) => x > row.boundsCm[1][axis])
        || !Array.isArray(row.topology) || row.topology.length !== 4
        || !row.topology.every(n => Number.isSafeInteger(n) && n >= 0)
        || row.topology[0] === 0 || row.topology[1] === 0) throw Error('Invalid solid witness for ' + key);
  }
  return capture;
}

// This is the sole equivalence transition. The regular resolver compares every
// observed revision exactly against the resulting saved-version reference.
export async function prepareNativeStudyTransition(approval, originalBytes, savedBytes, receiptBytes, archivePath) {
  if (!object(approval)) throw Error('Transition approval required');
  const { destination, sourceReceiptSha256, archiveSha256, originalReferenceSha256, savedReferenceSha256, archiveDigestPointer } = approval;
  const streamHash = createHash('sha256');
  for await (const block of fs.createReadStream(archivePath)) streamHash.update(block);
  if (streamHash.digest('hex') !== archiveSha256 || receiptDigest(receiptBytes, archiveDigestPointer) !== archiveSha256) {
    throw Error('Original archive must match both the approval and the archive digest in the historical receipt');
  }
  const original = solidCapture(originalBytes, originalReferenceSha256);
  const saved = solidCapture(savedBytes, savedReferenceSha256);
  if (!isDeepStrictEqual(saved.destination, destination) || saved.savedUnmodified !== true) {
    throw Error('Saved observation must identify the approved unmodified destination');
  }
  const pin = { destination, sourceReceiptSha256 };
  prepareNativeStudy(pin, original.reference, receiptBytes);
  const binding = prepareNativeStudy(pin, saved.reference, receiptBytes);
  const expected = structuredClone(original.reference);
  const componentRevisions = [];
  for (const [occurrenceId, before] of Object.entries(expected.occurrences)) {
    const after = saved.reference.occurrences[occurrenceId];
    if (!object(before) || !object(after) || !id(before.revisionId) || !id(after.revisionId)
        || !id(before.componentId) || before.componentId !== after.componentId) {
      throw Error('Occurrence or component identity differs at ' + occurrenceId);
    }
    componentRevisions.push({ occurrenceId, componentId: before.componentId,
      originalRevisionId: before.revisionId, savedRevisionId: after.revisionId });
    before.revisionId = after.revisionId;
  }
  for (const key of new Set([...Object.keys(expected), ...Object.keys(saved.reference)])) {
    if (!isDeepStrictEqual(expected[key], saved.reference[key])) throw Error('Changed study reference at ' + key);
  }
  if (!isDeepStrictEqual(original.solids, saved.solids)) throw Error('Changed independent solid measurements');
  return { ...binding, transition: { schema: 'agent-frc/native-study-revision-transition@1', archiveSha256,
    archiveDigestPointer, originalReferenceSha256, savedReferenceSha256, componentRevisions } };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
    let binding, output;
    if (args[0] === '--transition' && args.length === 7) {
      const [, approval, original, saved, receipt, archive, out] = args;
      binding = await prepareNativeStudyTransition(json(approval), fs.readFileSync(original), fs.readFileSync(saved), fs.readFileSync(receipt), archive);
      output = out;
    } else if (args.length === 4 && args[0] !== '--transition') {
      const [approval, reference, receipt, out] = args;
      binding = prepareNativeStudy(json(approval), json(reference), fs.readFileSync(receipt));
      output = out;
    } else {
      throw Error('Usage: prepare-native-study.mjs approval.json reference.json receipt binding.json OR --transition approval.json original.json saved.json receipt archive binding.json');
    }
    fs.writeFileSync(output, JSON.stringify(binding, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
