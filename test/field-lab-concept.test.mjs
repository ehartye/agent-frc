/** @lane scheduled */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildLab, embedConcepts } from '../scripts/kickoff.mjs';
import { browser, probePage } from './headless-browser.mjs';

const read = name => JSON.parse(readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8'));
const profile = embedConcepts(read('kickoff/training-field.json'),
  ['turret-shooter', 'fixed-shooter'].map(id => read('concept-bots/' + id + '.json')));
// The Field Lab's concept marks: gold input mouths (shared with the legacy intake), output faces, turret arcs, heading arrows.
const MOUTH = '#ffdf85', OUTPUT = '#7ff0c8', TURRET = '#b8f5ff', ARROW = '#ffffff';

const probe = `
const strokes=[],proto=CanvasRenderingContext2D.prototype,stroke=proto.stroke;
proto.stroke=function(){strokes.push(String(this.strokeStyle));return stroke.call(this);};
const take=()=>[...new Set(strokes.splice(0))];
const pick=(id,value)=>{const s=document.querySelector('[aria-label="'+id+' concept bot"]');s.value=value;s.dispatchEvent(new Event('change'));};
const heading=id=>Number(/heading (-?[\\d.]+)°/.exec(document.querySelector('#replay-state-'+id).textContent)[1]);
const options=[...document.querySelector('[aria-label="B1 concept bot"]').options].map(o=>o.value);
document.querySelector('#replayReset').click();
const legacy=take();
pick('B1','fixed-shooter');pick('B2','turret-shooter');
const marks=take();
const speed=['B1','R1'].map(id=>Boolean(document.querySelector('[aria-label="'+id+' Speed (in/s)"]')));
const headings=new Set([heading('B1')]);
for(let i=0;i<10;i++){document.querySelector('#replayStep').click();headings.add(heading('B1'));}
let blob=null;URL.createObjectURL=b=>{blob=b;return 'blob:probe';};HTMLAnchorElement.prototype.click=()=>{};
document.querySelector('#replaySave').click();document.querySelector('#download').click();
return {options,legacy,marks,speed,headings:headings.size,narrative:blob?await blob.text():null};`;

test('a Field Lab robot card selects a concept bot, draws its ports and exports its identity', {skip: !browser() && 'No Chrome or Edge found; set CHROME_PATH'}, async t => {
  const out = mkdtempSync(path.join(tmpdir(), 'field-lab-concept-'));
  t.after(() => rmSync(out, {recursive: true, force: true, maxRetries: 3}));
  await buildLab(profile, path.join(out, 'lab.html'));
  const r = await probePage(out, 'lab.html', probe);
  assert.equal(r.probeError, undefined, r.probeError);
  assert.deepEqual(r.options, ['', 'turret-shooter', 'fixed-shooter']);
  for (const color of [OUTPUT, TURRET, ARROW]) {
    assert.ok(!r.legacy.includes(color), 'a legacy roster draws no concept mark ' + color);
    assert.ok(r.marks.includes(color), 'a concept roster draws ' + color);
  }
  assert.ok(r.marks.includes(MOUTH), 'a concept input port draws its gold mouth');
  assert.deepEqual(r.speed, [false, true], 'a concept robot takes its speed from the concept, a legacy robot keeps the speed field');
  assert.ok(r.headings > 1, 'the fixed shooter turns during the opening period');
  assert.match(r.narrative, /B1 concept fixed-shooter · digest [0-9a-f]{64}\./);
  assert.match(r.narrative, /B2 concept turret-shooter · digest [0-9a-f]{64}\./);
  assert.match(r.narrative, /via front-intake/);
  assert.match(r.narrative, /ignores the step/);
});
