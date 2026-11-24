/**
 * @lane merge
 * @subject scripts/design-audit/generated.mjs
 * @subject scripts/design-audit.mjs
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {auditDesign} from '../scripts/design-audit.mjs';
import {findLibrary} from '../scripts/design-audit/generated.mjs';

// Needs the CAD kernel and the design library, frc-design-kernel, in the selected Python. The hosted run installs
// both in its layout check job and runs this file there.
const found = findLibrary();

// An invented design: a base, a post and a swinging flag with a custom notch, with no relation to any game or team.
const notch = `"""Custom shape "notch": a flag with a round notch in its edge, drawn at the origin."""
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeWire
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
from OCP.GC import GC_MakeArcOfCircle
from OCP.gp import gp_Pnt, gp_Vec


def build(parameters):
    length, height, width = parameters["lengthMm"], parameters["heightMm"], parameters["widthMm"]
    corners = [gp_Pnt(0, 0, 0), gp_Pnt(length, 0, 0), gp_Pnt(length, 0, height), gp_Pnt(0, 0, height)]
    wire = BRepBuilderAPI_MakeWire()
    for start, end in zip(corners[:2], corners[1:3]):
        wire.Add(BRepBuilderAPI_MakeEdge(start, end).Edge())
    middle = gp_Pnt(length / 2, 0, height - height / 4)
    wire.Add(BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(corners[2], middle, corners[3]).Value()).Edge())
    wire.Add(BRepBuilderAPI_MakeEdge(corners[3], corners[0]).Edge())
    face = BRepBuilderAPI_MakeFace(wire.Wire(), True).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(0, width, 0)).Shape()
`;
const design = {
  schema: 'frc-design-kernel/design@1', name: 'Flag stand 1.0', units: {length: 'mm', mass: 'kg'}, parameters: {post_top: 200},
  groups: {base: {role: 'structure'}, flag: {role: 'mechanism', carriedBy: 'base'}},
  custom: {notch: {reason: 'The flag edge is a round notch; no listed outline draws an arc.', limits: 'Outline only; the notch depth is a guess.'}},
  solids: [
    {name: 'base plate', group: 'base', massKg: 1, shape: {kind: 'box', fromMm: [-100, -60, 0], toMm: [100, 60, 6]}},
    {name: 'post', group: 'base', massKg: 0.3, shape: {kind: 'box', fromMm: [-10, -10, 6], toMm: [10, 10, '=post_top']}},
    {name: 'foot {corner}', group: 'base', massKg: 0.05, each: [{corner: 'a', x: -90, y: -50}, {corner: 'b', x: 80, y: -50}, {corner: 'c', x: -90, y: 40}, {corner: 'd', x: 80, y: 40}],
      shape: {kind: 'box', fromMm: ['=x', '=y', -4], toMm: ['=x + 10', '=y + 10', 0]}},
    {name: 'cap', group: 'base', massKg: 0.02, shape: {kind: 'box', fromMm: [-12, -12, '=post_top'], toMm: [12, 12, '=post_top + 4']}},
    {name: 'flag', group: 'flag', massKg: 0.1, shape: {kind: 'custom', use: 'notch', parameters: {lengthMm: 80, heightMm: 40, widthMm: 4}},
      place: [{kind: 'translation', travelMm: [10, -2, '=post_top - 40']}]},
  ],
  contacts: [{pair: ['post', 'base plate']}, {pair: ['flag', 'post']}],
  poses: {down: {}, up: {flag: [{kind: 'rotation', originMm: [0, 0, '=post_top'], axis: [0, -1, 0], travelDeg: 30}]}},
  motions: {wave: {through: ['down', 'up'], by: 'hand'}},
};

/** A project holding the design, built and measured once by the library; every case starts from a copy of it. */
let built;
function original(t) {
  if (built) return built;
  built = mkdtempSync(path.join(os.tmpdir(), 'design-audit-library-'));
  mkdirSync(path.join(built, 'design/custom'), {recursive: true});
  writeFileSync(path.join(built, 'design/design.json'), JSON.stringify(design, null, 2) + '\n');
  writeFileSync(path.join(built, 'design/custom/notch.py'), notch);
  for (const command of [['build', 'design/design.json', '--out', 'design/generated'], ['measure', 'design/design.json', '--out', 'design/generated', '--workers', '1']]) {
    const done = spawnSync(found.python, ['-B', '-m', 'frc_design_kernel', ...command], {cwd: built, encoding: 'utf8', timeout: 300000});
    assert.equal(done.status, 0, command[0] + ' failed: ' + done.stderr + done.stdout);
  }
  return built;
}
function copy(t, change) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'design-audit-case-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  cpSync(original(t), root, {recursive: true});
  change?.(root);
  return root;
}
const edit = (root, file, change) => writeFileSync(path.join(root, file), change(readFileSync(path.join(root, file), 'utf8')));
const forms = result => result.findings.map(finding => finding.form + ' ' + finding.file + ': ' + finding.detail);

test('outputs the library made from the current source regenerate; a hand edit, an earlier source and a changed custom file are each reported',
  {skip: !found.python && process.env.FRC_TEST_REQUIRE_LIBRARY !== '1' && 'The design library is not importable here (' + found.reason + '). The hosted layout check job installs it and runs this test'}, t => {
    assert.ok(found.python, 'the design library must be importable where FRC_TEST_REQUIRE_LIBRARY is set: ' + found.reason);
    t.after(() => built && rmSync(built, {recursive: true, force: true}));
    const clean = auditDesign(copy(t), {python: found.python});
    assert.deepEqual(forms(clean), [], 'a fresh build regenerates, and the audit judges no measurement');
    assert.match(clean.coverage.library, /built design\/design\.json /);

    const handManifest = auditDesign(copy(t, root => edit(root, 'design/generated/manifest.json', text => text.replace(/"volumeMm3": \d+/, '"volumeMm3": 1'))), {python: found.python});
    assert.ok(forms(handManifest).some(line => /^output-differs design\/generated\/manifest\.json: differs from a fresh build in solids/.test(line)), forms(handManifest).join('\n'));

    const handStep = auditDesign(copy(t, root => edit(root, 'design/generated/design.step', text => text.replace('ENDSEC;', '/* tidied */\nENDSEC;'))), {python: found.python});
    assert.ok(forms(handStep).some(line => /^output-differs design\/generated\/design\.step: is not the design STEP a fresh build gives/.test(line)), forms(handStep).join('\n'));

    const earlier = auditDesign(copy(t, root => edit(root, 'design/design.json', text => text.replace('"post_top": 200', '"post_top": 220'))), {python: found.python});
    assert.match(forms(earlier).join('\n'), /^output-differs design\/generated\/manifest\.json: differs from a fresh build in .*solids/m);

    const custom = auditDesign(copy(t, root => edit(root, 'design/custom/notch.py', text => text.replace('height - height / 4', 'height - height / 3'))), {python: found.python});
    assert.match(forms(custom).join('\n'), /output-differs design\/generated\/manifest\.json: differs from a fresh build in solids/);

    // A solid's note changes nothing that is built: the same outputs are not reported.
    const note = auditDesign(copy(t, root => edit(root, 'design/design.json', text => text.replace('"name": "post",', '"name": "post", "note": "Invented",'))), {python: found.python});
    assert.deepEqual(forms(note), []);

    const notRun = auditDesign(copy(t), {run: false});
    assert.deepEqual(forms(notRun), []);
    assert.match(notRun.coverage.notRun.join(' '), /Did not build 1 generated manifest again: --no-run was given/);
  });
