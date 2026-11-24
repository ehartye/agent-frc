/** @lane merge */
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {hashTerm, loadTerms, scanSeasonText, scanSeasonTree} from '../scripts/season-terms.mjs';

// Invented terms: the real list is stored only as digests, and no test names a season.
const terms = {anyCase: new Set([hashTerm('zorbball')]), exact: new Set([hashTerm('QUOIT')])};
const kinds = text => scanSeasonText(text, terms).map(f => f.kind);

test('reports a listed game name in any case and a listed field term only in capitals', () => {
  assert.deepEqual(kinds('The Zorbball field'), ['season-term']);
  assert.deepEqual(kinds('ZORBBALL'), ['season-term']);
  assert.deepEqual(kinds('Score a QUOIT on the post'), ['season-term']);
  assert.deepEqual(kinds('a quoit is a ring; QUOITS and Quoit are not the field term'), []);
  assert.deepEqual(kinds('const zorbballField = QUOIT_LIMIT; zorbball_field'), ['season-term', 'season-term']);
});

test('reports a season year and a team number by pattern', () => {
  const year = '20' + '31';
  assert.deepEqual(kinds('the ' + year + ' season'), ['season-year']);
  assert.deepEqual(kinds('season ' + year + ' field'), ['season-year']);
  assert.deepEqual(kinds('see frc-' + year + '-robot'), ['season-year']);
  assert.deepEqual(kinds('F' + 'RC' + year + ' rules'), ['season-year']);
  for (const sample of ['Te' + 'am 4321 built it', 'te' + 'am4321', 'Te' + 'am #4321']) assert.deepEqual(kinds(sample), ['team-number'], sample);
  assert.deepEqual(kinds('reviewed ' + year + '-03-04; a team of 12 students; step 2031 of the trace; team 100 points'), []);
});

test('the shipped list is well formed and this repository passes it', () => {
  const shipped = loadTerms();
  assert.ok(shipped.anyCase.size > 0 && shipped.exact.size > 0);
  const result = scanSeasonTree(fileURLToPath(new URL('..', import.meta.url)));
  assert.deepEqual(result.findings, []);
  assert.ok(result.files > 100);
});

test('scans a tree except its README and names the file and line', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'season-terms-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(path.join(root, 'guide.md'), 'Neutral line\nPlay zorbball here\n');
  writeFileSync(path.join(root, 'zorbball-notes.md'), 'Neutral\n');
  writeFileSync(path.join(root, 'README.md'), 'Play zorbball here\n');
  const result = scanSeasonTree(root, terms);
  assert.deepEqual(result.findings.map(f => [f.file, f.line, f.kind]), [['guide.md', 2, 'season-term'], ['zorbball-notes.md', 0, 'season-term']]);
});
