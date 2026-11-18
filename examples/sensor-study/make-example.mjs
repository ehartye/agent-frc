import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// A synthetic teaching study. The optical readings and comparison witness are assumed.
const layoutFile = fileURLToPath(new URL('./layout.json', import.meta.url));
const base = path.resolve(process.argv[2]);
await mkdir(base, {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function save(file, data) {
  const bytes = JSON.stringify(data, null, 2) + '\n';
  await writeFile(path.join(base, file), bytes, {flag: 'wx'});
  return {file, sha256: hash(bytes)};
}
const layout = JSON.parse(await readFile(layoutFile, 'utf8'));
const model = await save('layout.json', layout);
const run = {attempt: 'trial-A', piece: 'sample-A'};
const positions = [0.11, 0.06, 0.125, 0.20];
const samples = Object.entries(layout.expected).map(([phase, expected], i) => ({
  ...run, timeS: i, phase, translation: [positions[i], 0, 0],
  readings: Object.fromEntries(Object.entries(expected).map(([id, occupied]) => [id, {...run, timeS: i, occupied}]))
}));
const trace = await save('trace.json', {...run, frame: layout.frame, clock: layout.clock, modelSha256: model.sha256, samples});
const witness = await save('witness.json', {...run, frame: layout.frame, clock: layout.clock, units: 'm',
  method: 'independent-geometry', source: 'invented comparison fixture', gapM: 0.02, timeS: 3,
  modelSha256: model.sha256, traceSha256: trace.sha256});
await save('request.json', {model, trace, witness});
