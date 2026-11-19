import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { comparePlacement } from '../../scripts/placement-witness.mjs';

const tolerance = 1e-6; // cm for coordinates and cm³ for volume in this example
const local = [0, 0, 0, 6, 4, 1];
const placed = [6, 8, 5, 10, 14, 6];
const cutVolume = 24 - Math.PI * 0.5 ** 2;

function close(actual, expected, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw Error(`${label}: expected ${expected}, observed ${actual}`);
  }
}

function coordinates(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) throw Error(`${label}: invalid dimensions`);
  expected.forEach((value, index) => close(actual[index], value, `${label}[${index}]`));
}

function placement(bounds, volume) {
  const minimum = bounds.slice(0, 3);
  const maximum = bounds.slice(3);
  return { units: 'cm', minimum, maximum, center: minimum.map((x, i) => (x + maximum[i]) / 2), volume };
}

function measure(row, bounds, volume, label, temporary, zeroReadings) {
  if (!row || row.solid !== true) throw Error(`${label}: positive solid required`);
  coordinates(row.boundsCm, bounds, label);
  const observed = placement(row.boundsCm, row.directCm3);
  const comparison = comparePlacement(placement(bounds, volume), observed,
    { lengthTolerance: tolerance, volumeTolerance: tolerance });
  if (comparison.differences.length) throw Error(`${label}: direct volume or placement mismatch`);
  if (temporary && row.veryHighCm3 === 0) {
    zeroReadings.push(label);
  } else {
    close(row.veryHighCm3, volume, `${label}.veryHighCm3`);
  }
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function checkStudy(receipt, sourceSha256) {
  if (!receipt || receipt.schema !== 'fusion-volume-example@1' || receipt.lengthUnits !== 'cm'
      || receipt.volumeUnits !== 'cm3' || typeof receipt.fusionVersion !== 'string'
      || !receipt.fusionVersion.trim() || !isDigest(receipt.sourceSha256)
      || receipt.sourceSha256 !== sourceSha256) throw Error('Source, native build or units mismatch');
  const zeroReadings = [];
  for (const id of ['allParticipants', 'targetOnly']) {
    const sample = receipt[id];
    if (!isDigest(sample?.archiveSha256)) throw Error(`Missing ${id} archive reference`);
    for (const state of ['before', 'afterCut', 'reopened']) {
      const bodies = sample[state];
      if (!bodies || Object.keys(bodies).sort().join() !== 'neighbor,target') throw Error(`${id}.${state}: inventory`);
      const cut = state !== 'before';
      measure(bodies.target, local, cut ? cutVolume : 24, `${id}.${state}.target`, false, zeroReadings);
      measure(bodies.neighbor, [0, 0, 2, 6, 4, 3], cut && id === 'allParticipants' ? cutVolume : 24,
        `${id}.${state}.neighbor`, false, zeroReadings);
    }
  }
  const p = receipt.targetOnly.primitive;
  coordinates(p.matrixCm, [0,-1,0,10, 1,0,0,8, 0,0,1,5, 0,0,0,1], 'requested rigid matrix');
  measure(p.native, local, 24, 'native', false, zeroReadings);
  measure(p.untransformedCopy, local, 24, 'untransformedCopy', true, zeroReadings);
  measure(p.transformedCopy, placed, 24, 'transformedCopy', true, zeroReadings);
  coordinates(p.overlap.toolBoundsCm, [9,10,5,11,12,6], 'overlap tool');
  if (p.overlap.returned !== true || !Number.isInteger(p.overlap.faceCount) || p.overlap.faceCount < 1) {
    throw Error('Known material overlap did not produce faces');
  }
  measure(p.overlap.measurement, [9,10,5,10,12,6], 2, 'positiveIntersection', true, zeroReadings);
  coordinates(p.separate.toolBoundsCm, [12,10,5,14,12,6], 'separate tool');
  if ('measurement' in p.separate || ('faceCount' in p.separate && p.separate.faceCount !== 0)) {
    throw Error('Disjoint control unexpectedly reported material or invalid topology');
  }
  let disjointBoolean;
  if (p.separate.returned === true && p.separate.faceCount === 0) disjointBoolean = 'empty-face-set';
  else if (p.separate.returned === false || (p.separate.returned === null && typeof p.separate.error === 'string' && p.separate.error.length)) {
    disjointBoolean = 'no-successful-intersection';
  } else throw Error('Missing disjoint Boolean outcome');
  const status = disjointBoolean === 'empty-face-set' ? 'EXAMPLE_CONTROLS_REPRODUCED' : 'DISJOINT_BOOLEAN_UNRESOLVED';
  return { status, unusableVeryHighVolumeReadings: zeroReadings,
    disjointBoolean, independentDisjointGapCm: 2, neighborLostCm3WithUnrestrictedCut: 24 - cutVolume };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const { createHash } = await import('node:crypto');
    const sourceHash = createHash('sha256').update(readFileSync(new URL('./study.py', import.meta.url))).digest('hex');
    const result = checkStudy(JSON.parse(readFileSync(process.argv[2], 'utf8')), sourceHash);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'EXAMPLE_CONTROLS_REPRODUCED') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
