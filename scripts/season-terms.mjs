/**
 * Keep the plugin season-neutral: scan its text for a season's game name, field terms, season year or a team number.
 * The term list is stored as SHA-256 digests in season-terms.json, so this repository's text does not spell a
 * season's terms. The digests are not a secret. The plain list is kept with the season research, outside this repository.
 */
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readText, trackedFiles} from './branch-scan.mjs';

const listFile = new URL('./season-terms.json', import.meta.url);
export const hashTerm = term => createHash('sha256').update(term, 'utf8').digest('hex');

/** The shipped digests: `anyCase` matches a word in any capitalization, `exact` only as written. */
export function loadTerms(file = listFile) {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  const digests = value => Array.isArray(value) && value.every(v => /^[0-9a-f]{64}$/.test(v));
  if (list.schema !== 'agent-frc/season-terms@1' || !digests(list.anyCase) || !digests(list.exact))
    throw Error('season-terms.json needs anyCase and exact lists of SHA-256 digests');
  return {anyCase: new Set(list.anyCase), exact: new Set(list.exact)};
}

const patterns = [
  ['season-year', /\b(?:FRC|season|game|kickoff)[ _-]?20[1-9]\d\b|\b20[1-9]\d[ _-]?(?:season|game|kickoff|FRC)\b/i],
  ['team-number', /\bteam[ _-]?#?\d{3,5}\b(?! ?(?:points|mm|kg|students|members))|\bFRC ?#\d{3,5}\b/i]
];

/** Findings in one text: {line, kind, text}. A game name is found in any case, also inside an identifier; a capitalized field term only as a whole word. */
export function scanSeasonText(text, terms = loadTerms()) {
  const findings = [];
  for (const [index, line] of text.split('\n').entries()) {
    for (const [kind, pattern] of patterns) {
      const match = pattern.exec(line);
      if (match) findings.push({line: index + 1, kind, text: match[0]});
    }
    // A capitalized field term counts only as a whole word, so STAGE_FILE and STAGED are ordinary identifiers.
    for (const [word] of line.matchAll(/[A-Za-z0-9_]+/g))
      if (terms.exact.has(hashTerm(word))) findings.push({line: index + 1, kind: 'season-term', text: word});
    for (const [word] of line.matchAll(/[A-Za-z]+/g)) {
      const pieces = [word, ...word.split(/(?<=[a-z])(?=[A-Z])/)];
      if (pieces.some(piece => terms.anyCase.has(hashTerm(piece.toLowerCase())))) findings.push({line: index + 1, kind: 'season-term', text: word});
    }
  }
  return findings;
}

export function scanSeasonTree(root, terms = loadTerms()) {
  const findings = [];
  let files = 0;
  for (const name of trackedFiles(root).sort()) {
    if (name === 'README.md') continue; // it links the proof-of-concept projects
    const full = path.join(root, name);
    if (!lstatSync(full, {throwIfNoEntry: false})?.isFile()) continue;
    // A file's own name is scanned as its line 0.
    for (const finding of scanSeasonText(name, terms)) findings.push({file: name, ...finding, line: 0});
    const text = readText(full);
    if (text === null) continue;
    files++;
    for (const finding of scanSeasonText(text, terms)) findings.push({file: name, ...finding});
  }
  return {files, findings};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === '--hash' && args.length > 1) {
    // Print the digest to add: lowercase a game name for anyCase, keep a capitalized field term as written for exact.
    for (const term of args.slice(1)) console.log(hashTerm(term) + '  ' + term.length + ' characters');
  } else if (args.length <= 1) {
    const result = scanSeasonTree(path.resolve(args[0] ?? fileURLToPath(new URL('..', import.meta.url))));
    for (const f of result.findings) console.error(f.file + ':' + f.line + ': ' + f.kind + ': ' + f.text);
    console.log(JSON.stringify({files: result.files, findings: result.findings.length}));
    if (result.findings.length) {
      console.error('Keep season-specific language in the owning season project.');
      process.exitCode = 1;
    }
  } else { console.error('Usage: season-terms.mjs [ROOT] | --hash TERM...'); process.exitCode = 2; }
}
