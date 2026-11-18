import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const text = v => typeof v === 'string' && v.trim().length > 0;

export function screenHeight(sample,target) {
  if (sample?.units !== 'm,m/s,m/s²' || target?.units !== 'm' ||
      !vector(sample.position) || !vector(sample.velocity) || !vector(sample.gravity) ||
      sample.gravity[0] !== 0 || sample.gravity[1] !== 0 || sample.gravity[2] >= 0 ||
      !Number.isFinite(sample.boundingRadius) || sample.boundingRadius < 0 ||
      !Number.isFinite(target.lowerEdge) || !text(target.locator) ||
      !(target.uncertainty === null || Number.isFinite(target.uncertainty) && target.uncertainty >= 0)) {
    throw Error('Supply a metric Z-up sample, downward gravity, a bounding radius and sourced target edge with uncertainty.');
  }
  for (const key of ['frame','datum']) {
    if (!text(sample[key]) || !text(target[key])) throw Error('Identify the coordinate frame and vertical datum.');
  }
  const result = { target, maximumCenterM:null, maximumTopM:null, marginM:null, score:'unverified' };
  if (sample.frame !== target.frame || sample.datum !== target.datum ||
      !['registered','assumed'].includes(target.registration)) return {...result,status:'unresolved-registration'};
  if (sample.contactFree !== true || sample.gravityOnly !== true) return {...result,status:'unresolved-forces'};
  const center = sample.position[2] + Math.max(0,sample.velocity[2]) ** 2 / (-2 * sample.gravity[2]);
  const top = center + sample.boundingRadius;
  const margin = target.uncertainty === null ? null : top - (target.lowerEdge - target.uncertainty);
  if (!Number.isFinite(top) || (margin !== null && !Number.isFinite(margin))) throw Error('Height calculation overflowed.');
  return {...result,maximumCenterM:center,maximumTopM:top,marginM:margin,
    status:margin === null ? 'unknown-target-uncertainty' : margin < 0 ? 'below-lower-edge' : 'requires-passage-test',
    conditionalOnDatum:target.registration === 'assumed'};
}

async function readPinned(base,ref) {
  if (!text(ref?.file) || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw Error('Expected a file and SHA-256 pin.');
  const bytes = await readFile(path.resolve(base,ref.file));
  if (createHash('sha256').update(bytes).digest('hex') !== ref.sha256) throw Error('Source digest mismatch for ' + ref.file);
  return bytes;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw Error('Usage: release-height request.json');
    const file = path.resolve(process.argv[2]);
    const request = JSON.parse(await readFile(file,'utf8'));
    const base = path.dirname(file);
    await readPinned(base,request.model);
    const trace = JSON.parse(await readPinned(base,request.trace));
    if (!Array.isArray(trace.samples) || !Number.isSafeInteger(request.sampleIndex) || !trace.samples[request.sampleIndex]) {
      throw Error('Select an actual sample in the pinned trace.');
    }
    console.log(JSON.stringify({modelSha256:request.model.sha256,traceSha256:request.trace.sha256,
      sampleIndex:request.sampleIndex,...screenHeight(trace.samples[request.sampleIndex],request.target)},null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
