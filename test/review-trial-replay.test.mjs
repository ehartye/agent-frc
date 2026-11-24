/**
 * @lane merge
 * @subject templates/preliminary-review/review.html
 * @subject scripts/kernel_layout/replays.py
 * @subject scripts/package_view.py
 * @subject test/fixtures/ready_example.py
 */
// The review page plays a trial from the library's own record. Failure caught: a published page whose trial replay,
// built from trials.json with no hand-made replay set, fails to load or play, or throws while it plays.
// Synthetic teaching fixture: the invented starter with its tray, wall and ball. Needs the CAD kernel, the design
// library and a Chrome or Edge with software WebGL.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {browser, probePage} from './headless-browser.mjs';

const skip = process.env.FRC_TEST_PROFILE === 'portable' ? 'Run the CAD kernel checks at the qualified station' : !browser() && 'No Chrome or Edge found; set CHROME_PATH';
const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

// Errors and console errors from the first script on, so nothing the page throws while it loads or plays is missed.
const early = `window.__errors=[];addEventListener('error',e=>__errors.push(String(e.message||e)));
 addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));const said=console.error.bind(console);console.error=(...a)=>{__errors.push(a.map(String).join(' '));said(...a)};`;
const play = `const $=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<200&&/Loading|Verifying/.test($('#sceneStatus').textContent);i++)await wait(50);
 const picked=$('#motion').selectedOptions[0],group=picked?.parentElement.label,frames=+$('#time').max;
 $('#play').click();for(let i=0;i<200&&+$('#time').value<frames;i++)await wait(50);
 const reached=+$('#time').value,clock=$('#fraction').textContent,status=$('#sceneStatus').textContent,errors=[...__errors];
 // Control: an error thrown now is caught, so an empty list means the page threw none.
 setTimeout(()=>{throw Error('invented control error')});await wait(50);
 return {group,label:picked?.textContent,frames,reached,clock,status,errors,caught:__errors.slice(errors.length)};`;

test('the review page plays a trial replay built from the library trial record, with no errors', {skip}, async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'trial-replay-'));
  t.after(() => rmSync(temp, {recursive: true, force: true}));
  const season = path.join(temp, 'season');
  execFileSync(py, ['-B', fileURLToPath(new URL('../examples/design-source/create.py', import.meta.url)), season, '--project-review', '--no-check'], {stdio: 'pipe'});
  // Runs the trial with the library, checks the layout with --write-view and stages the release.
  execFileSync(py, ['-B', fileURLToPath(new URL('./fixtures/ready_example.py', import.meta.url)), season, '1.0', 'Turning carrier'], {stdio: 'pipe'});
  const judgement = JSON.parse(readFileSync(path.join(season, 'cad/preliminary-design/releases/1.0/judgement.json'), 'utf8'));
  assert.equal(judgement.presentation.replays, undefined, 'no hand-made replay set');
  const site = path.join(season, 'docs/preliminary-design'), scene = JSON.parse(gunzipSync(readFileSync(path.join(site, 'releases/1.0/review-scene.json.gz'))));
  const trace = JSON.parse(readFileSync(path.join(season, 'cad/preliminary-design/releases/1.0/records/trials.json'), 'utf8')).trials['ball stays at the wall'].nominal.trace;
  const [replay] = scene.replays;
  assert.equal(replay.id, 'trial-ball-stays-at-the-wall');
  assert.deepEqual(replay.time, trace.rows.map(row => row[0]), 'the replay runs on the trial\'s own clock');
  const shown = await probePage(site, 'releases/1.0/index.html', play, {query: '?case=' + replay.id, early, webgl: true});
  assert.deepEqual([shown.group, shown.label, shown.frames], ['Trial replays', replay.label, trace.rows.length - 1]);
  assert.equal(shown.reached, shown.frames, 'the replay played to its last frame');
  assert.equal(shown.clock, trace.rows.at(-1)[0].toFixed(2) + ' s');
  assert.match(shown.status, /^Scene (loaded|digest verified)/);
  assert.deepEqual(shown.errors, []);
  assert.ok(shown.caught.some(e => /invented control error/.test(e)), 'the error capture works: ' + JSON.stringify(shown.caught));
});
