import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const plugin = new URL('../', import.meta.url);
const positive = n => Number.isFinite(n) && n > 0;
const label = s => typeof s === 'string' && s.trim().length > 0;

export function validateProfile(p) {
  if (!p || !Number.isInteger(p.season) || !label(p.game) || !label(p.edition) ||
      !label(p.manual) || !/^https?:\/\//.test(p.manual) || p.units !== 'in') {
    throw Error('Specify a season, game, release edition, manual URL and inch units.');
  }
  if (![p.field?.length, p.field?.width].every(positive) || !label(p.field.source)) {
    throw Error('Field extents need positive dimensions and a source section.');
  }
  if (!p.limits || ![p.limits.height, p.limits.perimeter].every(n => n === null || positive(n)) ||
      !label(p.limits.source)) throw Error('Provide sourced limits or use null for an unknown.');
  if (!label(p.geometrySource) || !label(p.omissions) || !Array.isArray(p.landmarks) || !Array.isArray(p.levels)) {
    throw Error('Describe the geometry, source sections and omissions.');
  }
  for (const m of p.landmarks) {
    if (!label(m.name) || !Number.isFinite(m.x) || m.x < 0 || m.x > p.field.length ||
        !Number.isFinite(m.y) || m.y < 0 || m.y > p.field.width || !positive(m.acrossFlats) ||
        !positive(m.height) || ![4, 6, 8].includes(m.sides)) throw Error('Invalid landmark.');
  }
  if (!p.levels.every(v => label(v.name) && positive(v.height))) throw Error('Invalid height reference.');
  return p;
}

export async function buildLab(profile, destination) {
  validateProfile(profile);
  const asset = name => readFile(new URL('templates/kickoff/' + name, plugin), 'utf8');
  const [page, renderer, controls] = await Promise.all(['index.html', 'scene.js', 'lab.js'].map(asset));
  const json = JSON.stringify(profile).replaceAll('<', '\\u003c');
  const output = page.replace('/* PROFILE */', () => json)
    .replace('/* SCENE */', () => renderer).replace('/* LAB */', () => controls);
  await writeFile(destination, output, {flag: 'wx'});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [option, input, out, destination, ...extra] = process.argv.slice(2);
    if (!input || out !== '--output' || !destination || extra.length || !['--season', '--profile'].includes(option)) {
      throw Error('Usage: node scripts/kickoff.mjs (--season 2025 | --profile profile.json) --output field.html');
    }
    if (option === '--season' && input !== '2025') {
      throw Error('Only 2025 has a bundled kickoff profile. Supply --profile with release-day sources for this season.');
    }
    const source = option === '--season' ? new URL('case-studies/2025/kickoff-field.json', plugin) : input;
    await buildLab(JSON.parse(await readFile(source, 'utf8')), destination);
    console.log(path.resolve(destination));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
