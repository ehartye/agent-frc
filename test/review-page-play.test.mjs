/**
 * @lane merge
 * @subject scripts/package_view.py
 * @subject scripts/kernel_layout/view.py
 * @subject examples/design-source/create.py
 */
// Acceptance 15, in the browser: the invented example's review page, built from its records with no receipt, opens and
// plays every entry of its animation list to the last frame with no error. Failure caught: a page the records build
// that does not load, that leaves a motion unplayable or that throws while it plays.
// Synthetic teaching fixture: the invented starter. Needs the CAD kernel, the design library and a Chrome or Edge with software WebGL.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {browser, probePage} from './headless-browser.mjs';

const skip = process.env.FRC_TEST_PROFILE === 'portable' ? 'Run the CAD kernel checks at the qualified station' : !browser() && 'No Chrome or Edge found; set CHROME_PATH';
const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const plugin = fileURLToPath(new URL('..', import.meta.url));

// Errors and console errors from the first script on, so nothing the page throws while it loads or plays is missed.
const early = `window.__errors=[];addEventListener('error',e=>__errors.push(String(e.message||e)));
 addEventListener('unhandledrejection',e=>__errors.push(String(e.reason)));const said=console.error.bind(console);console.error=(...a)=>{__errors.push(a.map(String).join(' '));said(...a)};`;
const playAll = `const $=s=>document.querySelector(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<200&&/Loading|Verifying/.test($('#sceneStatus').textContent);i++)await wait(50);
 const played=[],status=$('#sceneStatus').textContent,chip=$('#state').textContent,source=$('#decisionSource').textContent;
 $('#speed').value='10';
 for(let k=0;k<$('#motion').options.length;k++){
  $('#motion').selectedIndex=k;$('#motion').dispatchEvent(new Event('change'));const frames=+$('#time').max;
  $('#play').click();for(let i=0;i<300&&+$('#time').value<frames;i++)await wait(20);
  played.push({id:$('#motion').value,group:$('#motion').selectedOptions[0].parentElement.label,frames,reached:+$('#time').value,readout:$('#liveMeasure').textContent});
 }
 const errors=[...__errors];setTimeout(()=>{throw Error('invented control error')});await wait(50);
 return {status,chip,source,played,errors,caught:__errors.slice(errors.length),
  power:[...$('#duty').options].map(o=>o.value),weight:$('#weightBody').textContent,inspect:(inspect('rail'),$('#inspName').textContent)};`;

test('the example review page built from its records opens with every motion playable and no error', {skip}, async t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'review-page-'));
  t.after(() => rmSync(temp, {recursive: true, force: true}));
  const project = path.join(temp, 'project'), rel = 'cad/preliminary-design/releases/1.0/results', run = (command, args) => execFileSync(command, args, {cwd: project, stdio: 'pipe'});
  // Makes a project, writes the example into it, judges it and builds its page, as an agent does.
  mkdirSync(project);
  run('git', ['init', '-q']);
  run(process.execPath, [path.join(plugin, 'scripts/project-layout.mjs'), 'init', project]);
  run(py, ['-B', path.join(plugin, 'examples/design-source/create.py'), project]);
  run(process.execPath, [path.join(plugin, 'scripts/design.mjs'), 'judge', '1.0', '--page', '--workers', '1']);
  const site = path.join(temp, 'site'), dir = path.join(site, 'releases/1.0');
  mkdirSync(dir, {recursive: true});
  cpSync(path.join(plugin, 'templates/preliminary-review-fonts'), path.join(site, 'fonts'), {recursive: true});
  cpSync(path.join(project, rel, 'review.html'), path.join(dir, 'index.html'));
  cpSync(path.join(project, rel, 'review-scene.json.gz'), path.join(dir, 'review-scene.json.gz'));
  const shown = await probePage(site, 'releases/1.0/index.html', playAll, {early, webgl: true, width: 1600, height: 1000});
  assert.ok(!shown.probeError, shown.probeError);
  assert.equal(shown.status, 'Scene loaded');
  assert.match(shown.chip, /layout-checked$/);
  assert.match(shown.source, /^\(judged .*\d{4}-\d\d-\d\d/);
  assert.deepEqual(shown.played.map(p => p.id), ['acquire', 'transfer', 'deliver', 'park', 'service', 'package-displacement-control']);
  for (const p of shown.played) assert.equal(p.reached, p.frames, p.id + ' played to its last frame');
  assert.match(shown.played[1].readout, /gate 12\.0 mm.*pivot 90\.0°.*bus \d+\.\d\d–\d+\.\d\d V/, 'the driven turn reads out its drives and bus at its end');
  assert.match(shown.played[0].readout, /^By hand: no motor drives this motion/);
  assert.deepEqual(shown.power, ['loaded-turn', 'release', 'park-loaded']);
  assert.match(shown.weight, /inspection/);
  assert.equal(shown.inspect, 'rail');
  assert.deepEqual(shown.errors, []);
  assert.ok(shown.caught.some(e => /invented control error/.test(e)), 'the error capture works: ' + JSON.stringify(shown.caught));
});
