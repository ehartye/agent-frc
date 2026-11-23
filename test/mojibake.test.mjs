/** @lane merge */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {scanMojibakeText, scanMojibakeTree} from '../scripts/mojibake.mjs';

// Each damaged sample is built from the sound character, so this file holds no damaged text.
const damage = sound => new TextDecoder('windows-1252').decode(new TextEncoder().encode(sound));

test('reports text that was read as Windows-1252 and saved again', () => {
  for (const sound of ['\u2019', '\u2013', '\u00b0', '\u00b3', '\u00d7', '\u00b7'])
    assert.equal(scanMojibakeText('a plugin' + damage(sound) + 's line').length, 1, 'U+' + sound.codePointAt(0).toString(16));
  assert.equal(scanMojibakeText('one\n90' + damage('\u00b0') + ' turn\nthree')[0].line, 2);
  assert.equal(scanMojibakeText(damage(damage('\u00d7'))).length, 1, 'damaged twice');
});

test('accepts sound punctuation, symbols and accented words', () => {
  assert.deepEqual(scanMojibakeText('the plugin\u2019s 90\u00b0 turn, 2\u20133 s, 4\u00d74, 52 mm\u00b3, caf\u00e9, \u00c2ge, \u00c3o'), []);
});

test('this repository holds no damaged text', () => {
  assert.deepEqual(scanMojibakeTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')), []);
});
