// concept:check — validate one concept-bot document and compare it with a rules model's robot limits and targets.
// Usage: npm run concept:check -- concept.json [--profile rules-model.json]
// Prints a JSON report. Exits 0 when the concept is valid (even when a limit is exceeded) and 2 on invalid input.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABELS, applyProfileDefaults, compileConceptBot, validateConceptBot } from './concept-bot.mjs';
import { pieceRadiusFor, standOffBand } from './concept-arc.mjs';
import { framePlan } from './frame-profile.mjs';
import { validateProfile } from './kickoff.mjs';
import { loadScoreObservations } from './score-observations.mjs';

const usage = 'Usage: npm run concept:check -- concept.json [--profile rules-model.json]';

function countLabels(value, counts) {
  if (Array.isArray(value)) value.forEach(v => countLabels(v, counts));
  else if (value && typeof value === 'object') {
    if (LABELS.includes(value.label)) counts[value.label]++;
    Object.values(value).forEach(v => countLabels(v, counts));
  }
  return counts;
}

const status = (value, limit) => value === null || !limit ? 'unresolved' : value <= limit.value + 1e-9 ? 'within' : 'exceeds';

/** The concept:check report for a concept document, against an optional rules-model profile. Throws on invalid input. */
export function conceptCheck(document, profile) {
  validateConceptBot(document);
  if (profile !== undefined) validateProfile(profile);
  const doc = applyProfileDefaults(document, profile), record = compileConceptBot(doc), body = doc.body;
  const limits = profile?.rehearsal?.robotLimits ?? {};
  // Perimeter convention, shared with robotLimits.perimeterIn and the profile's limits.perimeter: the length of the
  // frame outline in plan, in inches, without bumpers. The outline is the concept's frameProfile, else the project's,
  // else a rectangle, as the rehearsal defaults resolve it.
  const perimeterIn = framePlan(body.frameLengthIn.value, body.frameWidthIn.value, body.frameProfile ?? profile?.frameProfile, 0, 25.4).perimeter;
  const mass = doc.massLb ?? null;
  const measured = {
    perimeter:[perimeterIn, limits.perimeterIn], startingHeight:[body.stowedHeightIn.value, limits.startingHeightIn],
    maxHeight:[body.maxHeightIn.value, limits.maxHeightIn], extension:[body.maxReachIn.value, limits.maxExtensionIn],
    mass:[mass ? mass.max : null, limits.massLb]
  };
  const ports = [];
  for (const output of record.concept.outputs.filter(o => o.kind === 'ranged')) {
    const r = output.ranged;
    for (const station of (profile?.rehearsal?.stations ?? []).filter(s => s.kind === 'scoring' && output.pieces.includes(s.piece))) {
      if (!station.entry) { ports.push({output:output.id, station:station.id, status:'unresolved', reason:'no entry region'}); continue; }
      // The rehearsal's own piece-radius rule (concept-arc pieceRadiusFor): a point when the profile gives no radius.
      const pieceRadiusIn = pieceRadiusFor(profile.rehearsal.stations, station.piece);
      // Band distances run from the release point, which the rehearsal places on the output face at releaseHeightIn.
      ports.push({output:output.id, station:station.id, pieceRadiusIn, releaseHeightIn:r.releaseHeightIn, measuredFrom:'output face',
        standOffBand:standOffBand(station.entry, pieceRadiusIn, {launchSpeedInS:r.launchSpeedInS, elevationDeg:r.elevationDeg}, r.releaseHeightIn)});
    }
  }
  return {
    valid:true, concept:doc.id, digest:record.concept.digest,
    labels:countLabels(doc, Object.fromEntries(LABELS.map(l => [l, 0]))),
    limits:Object.fromEntries(Object.entries(measured).map(([k, [value, limit]]) => [k, status(value, limit)])),
    limitValues:Object.fromEntries(Object.entries(measured).map(([k, [value, limit]]) =>
      [k, {[k === 'mass' ? 'conceptLb' : 'conceptIn']:value, limit:limit ?? null}])),
    mass:{min:mass?.min ?? null, max:mass?.max ?? null, label:mass?.label ?? null, basis:mass?.basis ?? null,
      default:mass?.default === true, shareOfLimit:mass && limits.massLb ? mass.max / limits.massLb.value : null},
    ports
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (!(args.length === 1 || args.length === 3 && args[1] === '--profile') || args[0].startsWith('--')) throw Error(usage);
    const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
    const profile = args[2] === undefined ? undefined : await loadScoreObservations(await json(args[2]), args[2]);
    console.log(JSON.stringify(conceptCheck(await json(args[0]), profile), null, 2));
  } catch (error) {
    console.log(JSON.stringify({valid:false, error:error.message}, null, 2));
    console.error(error.message);
    process.exitCode = 2;
  }
}
