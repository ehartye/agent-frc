import {authorizeRender} from './authorize-render-fixture.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {buildHighlights} from '../scripts/robot-highlights.mjs';

const project = fileURLToPath(new URL('../examples/highlights/', import.meta.url));
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const python = process.platform === 'win32' ? 'python' : 'python3';
const py = (name, ...args) => spawnSync(python, [path.join(scripts,name), ...args], {encoding:'utf8'});

test('colored highlights bind the resolved palette, source assignment and facet ranges', async t => {
  const root = await mkdtemp(path.join(tmpdir(),'cad-colors-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  await cp(project,root,{recursive:true});
  const manifest = path.join(root,'project.json'), target = path.join(root,'site');
  const cad = path.join(root,'docs/robot/cad'), receipt = path.join(cad,'receipt.json');
  const record = JSON.parse(await readFile(receipt,'utf8'));
  const shape = JSON.parse(await readFile(path.join(root,'cad-showcase.json'),'utf8'));
  const colored = path.join(root,'roles.json');
  const rows = Array.from({length:record.solids},(_,i)=>({id:'slab-'+i,role:'structure'}));
  const assignments = Buffer.from(JSON.stringify({schema:'agent-frc/assembly-appearances@1',sourceSha256:record.sourceSha256,solids:rows}));
  await writeFile(colored,assignments);
  await writeFile(path.join(root,'cad-showcase.json'),JSON.stringify({...shape,appearances:'roles.json'}));
  const config = JSON.parse(py('component_palette.py',root).stdout);
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(config.colors).sort(([a],[b])=>a<b?-1:a>b?1:0)));
  const facets = gunzipSync(await readFile(path.join(cad,'assembly.stl.gz'))).subarray(84);
  record.schema='agent-frc/cad-still@2';
  record.appearances={file:'roles.json',sha256:sha(assignments),paletteSha256:sha(canonical),
    groups:[{role:'structure',color:config.colors.structure,solids:rows.length,triangles:record.triangles,facetsSha256:sha(facets)}]};
  const save = () => writeFile(receipt,JSON.stringify(record));
  const selectedFile = path.join(root,'cad-showcase.json');
  await assert.rejects(buildHighlights(manifest,target),/Selected appearance manifest/);
  const staleReadme = py('cad-readmes.py',root);
  assert.notEqual(staleReadme.status,0);
  assert.match(staleReadme.stderr,/Selected appearance manifest/);
  await save();
  await writeFile(selectedFile,JSON.stringify({...shape,appearances:'other-roles.json'}));
  await assert.rejects(buildHighlights(manifest,target),/Selected appearance manifest/);
  await writeFile(selectedFile,JSON.stringify({...shape,appearances:'roles.json'}));
  authorizeRender(root);
  await buildHighlights(manifest,target);
  const viewer = (await readdir(target)).find(p=>p.startsWith('cad-'));
  const html = await readFile(path.join(target,viewer,'index.html'),'utf8');
  assert.ok(html.includes(JSON.stringify([[record.triangles,config.colors.structure,'structure']])));
  record.appearances.groups[0].facetsSha256='f'.repeat(64);
  await save();
  await assert.rejects(buildHighlights(manifest,target),/exported facets/);
  record.appearances.groups[0].facetsSha256=sha(facets);
  await save();
  await mkdir(path.join(root,'cad'),{recursive:true});
  await writeFile(path.join(root,'cad/component-palette.json'),JSON.stringify({schema:'agent-frc/component-palette@1',colors:{structure:'#112233'}}));
  await assert.rejects(buildHighlights(manifest,target),/palette changed/);
  await rm(path.join(root,'cad/component-palette.json'));
  await writeFile(colored,Buffer.concat([assignments,Buffer.from('\n')]));
  await assert.rejects(buildHighlights(manifest,target),/manifest or resolved palette changed/);
});

test('native STEP still and orbit agree on repeated solid roles', {skip:process.env.FRC_TEST_PROFILE==='portable' && 'Run the CAD kernel and rendering controls at the qualified station'}, async t => {
  const available=spawnSync(python,['-c','import OCP, vtk, numpy'],{encoding:'utf8'});
  if(available.status!==0){t.skip('Optional OCP, VTK and NumPy are required for native rendering');return;}
  const root=await mkdtemp(path.join(tmpdir(),'cad-native-colors-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const fixture=fileURLToPath(new URL('./cad_appearance_fixture.py',import.meta.url));
  const run=spawnSync(python,[fixture,root],{encoding:'utf8'});
  assert.equal(run.status,0,run.stdout+run.stderr);
});
