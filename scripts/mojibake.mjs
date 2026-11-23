/**
 * Find text that was saved as UTF-8, read as Windows-1252 and saved again: an apostrophe, dash, degree sign or
 * multiplication sign turns into two or three wrong characters. The patterns are written as escapes so this file
 * and its test never contain the damage they look for.
 */
import {lstatSync} from 'node:fs';
import path from 'node:path';
import {readText, trackedFiles} from './branch-scan.mjs';

// U+00E2 before a euro sign, circumflex, per-mille sign or dagger: a damaged quote, dash or math sign. U+00C2 or U+00C3 before a Latin-1 symbol, a florin or a low quote: a damaged symbol.
const damaged = /\u00e2[\u20ac\u02c6\u2030\u2020\u2021]|\u00c2[\u00a0-\u00bf]|\u00c3[\u0192\u201a\u2014\u00a0-\u00bf]/;

/** Findings in one text: {line, text}, one for each damaged line. */
export function scanMojibakeText(text) {
  const findings = [];
  for (const [index, line] of text.split('\n').entries()) {
    const match = damaged.exec(line);
    if (match) findings.push({line: index + 1, text: line.slice(Math.max(0, match.index - 12), match.index + 8).trim()});
  }
  return findings;
}

export function scanMojibakeTree(root) {
  const findings = [];
  for (const name of trackedFiles(root).sort()) {
    const full = path.join(root, name);
    if (!lstatSync(full, {throwIfNoEntry: false})?.isFile()) continue;
    const text = readText(full);
    if (text === null) continue;
    for (const finding of scanMojibakeText(text)) findings.push({file: name, ...finding});
  }
  return findings;
}
