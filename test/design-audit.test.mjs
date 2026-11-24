/**
 * @lane merge
 * @subject scripts/design-audit.mjs
 * @subject scripts/design-audit/lex.mjs
 * @subject scripts/design-audit/code.mjs
 * @subject scripts/design-audit/source.mjs
 * @subject scripts/design-audit/hatch.mjs
 * @subject scripts/design-audit/generated.mjs
 * @subject scripts/design-audit/across.mjs
 */
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {acrossLines, auditDesign, forms, reportLines} from '../scripts/design-audit.mjs';

// An invented project: a tote carrier with a base, a swinging arm and a hook, with no relation to any game or team.
const hook = `"""Custom shape "hook": a flat hook with a curved jaw, drawn at the origin; the design source places it.

Nothing here reads a file or keeps an open handle: an open jaw is only a shape.
"""
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakeWire
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
from OCP.GC import GC_MakeArcOfCircle
from OCP.gp import gp_Pnt, gp_Vec


def build(parameters):
    reach, depth, width = parameters["reachMm"], parameters["depthMm"], parameters["widthMm"]
    a, b, c = gp_Pnt(0, 0, 0), gp_Pnt(reach, 0, 0), gp_Pnt(reach, 0, -depth)
    belly = gp_Pnt(reach / 2, 0, -depth / 4)
    wire = BRepBuilderAPI_MakeWire()
    wire.Add(BRepBuilderAPI_MakeEdge(a, b).Edge())
    wire.Add(BRepBuilderAPI_MakeEdge(b, c).Edge())
    wire.Add(BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(c, belly, a).Value()).Edge())
    face = BRepBuilderAPI_MakeFace(wire.Wire(), True).Face()
    return BRepPrimAPI_MakePrism(face, gp_Vec(0, width, 0)).Shape()
`;
const drag = `"""Custom force "drag": air drag on the piece, against its speed."""


def force(signals, parameters):
    speed = signals["speedMps"]
    return (-parameters["coefficient"] * speed * abs(speed), 0.0, 0.0)
`;
const held = `"""Custom criterion "held": the tote stays above the floor by the stated clearance."""


def judge(run, parameters):
    return run["measures"]["lowestMm"] >= parameters["clearMm"]
`;
const box = (name, group, from, to) => ({name, group, massKg: 0.5, shape: {kind: 'box', fromMm: from, toMm: to}});
function design() {
  return {
    schema: 'frc-design-kernel/design@1', name: 'Tote carrier 1.0', units: {length: 'mm', mass: 'kg'},
    parameters: {arm_len: 240, arm_z: '=arm_len / 2 + 30'},
    groups: {base: {role: 'structure'}, arm: {role: 'mechanism', carriedBy: 'base'}},
    custom: {
      hook: {reason: 'The jaw is a curved slot; no listed shape draws an arc in an outline.', limits: 'Outline only; jaw radius is a guess until the tote lip is measured.'},
      drag: {kind: 'force', reason: 'The layer has no air drag, and a long throw slows in the air.', limits: 'Quadratic drag with one coefficient; spin is ignored.'},
      held: {kind: 'criterion', reason: 'Held means a clearance over the floor that no single event states.', limits: 'Reads one measure; it says nothing about how the tote is held.'},
    },
    solids: [
      box('base plate', 'base', [-200, -150, 0], [200, 150, 8]),
      box('post left', 'base', [-20, 100, 8], [20, 140, 300]),
      box('post right', 'base', [-20, -140, 8], [20, -100, 300]),
      box('bumper front', 'base', [200, -150, 0], [230, 150, 60]),
      box('bumper rear', 'base', [-230, -150, 0], [-200, 150, 60]),
      box('arm', 'arm', [0, -10, 300], ['=arm_len', 10, 320]),
      box('arm brace', 'arm', [0, -30, 290], [40, 30, 300]),
      {name: 'hook', group: 'arm', massKg: 0.2, shape: {kind: 'custom', use: 'hook', parameters: {reachMm: 60, depthMm: 40, widthMm: 20}}, place: [{kind: 'translation', travelMm: ['=arm_len', -10, 300]}]},
    ],
    pieces: {tote: {shape: {kind: 'sphere', centerMm: [0, 0, 0], radiusMm: 80}, massKg: {value: 1.2, measured: 'kitchen scale, three totes'}}},
    materials: {pad: {stiffnessNPerM: {value: 80000, assumed: [40000, 160000]}, restitution: {value: 0.3, assumed: [0.2, 0.5]}, friction: {value: 0.8, assumed: [0.6, 1.0]}}},
    poses: {down: {}, up: {arm: [{kind: 'rotation', originMm: [0, 0, 300], axis: [0, -1, 0], travelDeg: 60}]}},
    motions: {raise: {through: ['down', 'up']}},
    trials: {
      carry: {assumes: [{id: 'tote-round', text: 'The tote is drawn as a ball.'}], plane: {normal: 'y', atMm: 0}, pose: 'down',
        piece: {use: 'tote', start: {atMm: ['=arm_len', 0, 400]}}, surfaces: [{solid: 'arm', material: 'pad'}], forces: [{use: 'drag', parameters: {coefficient: 0.02}}],
        pass: {custom: {use: 'held', parameters: {clearMm: 20}}}, control: {change: {'surfaces[0].material': 'none'}}, stepS: 0.0005, durationS: 1},
    },
  };
}
const fixedStep = names => "ISO-10303-21;\nHEADER;\nFILE_NAME('Tote carrier 1.0','2000-01-01T00:00:00',(''),(''),'','','');\nENDSEC;\nDATA;\n" + names.map((name, i) => "#" + (i + 1) + "=MANIFOLD_SOLID_BREP('" + name + "',#9);\n").join('') + 'ENDSEC;\nEND-ISO-10303-21;\n';
/** A project's own helper named like a library module, prose that mentions the CAD kernel, and a call of the library's command. */
const helpers = {
  'scripts/builder.py': '"""Our own helper. It needs no OCP: the library builds; see "import OCP" in its docs."""\nfrom builder import assembly  # a project module of the same name\nimport subprocess\n\n\ndef rebuild():\n    print("from OCP import nothing")\n    subprocess.run(["python", "-m", "frc_design_kernel", "build", "design/design.json", "--out", "design/generated"], check=True)\n',
  'scripts/measure_report.py': 'import json\nimport frc_design_kernel as kernel\nfrom frc_design_kernel.measure import clearance\nfrom frc_design_kernel import load, placements\n\nrecord = json.load(open("design/generated/manifest.json"))\nstep = open("design/generated/design.step").read()\n',
  'scripts/site.mjs': "// The agent-frc plugin is the agent's tool; this file only writes the site.\nimport {writeFileSync} from 'node:fs';\nwriteFileSync('docs/manifest.json', '{}');\n",
  'docs/sitemap.xml': '<urlset><url><loc>mujoco notes</loc></url></urlset>\n',
};

/** The compliant project as {file: text}, with overlay applied: a value of null removes a file; a function of the design edits it. */
function files({edit, overlay = {}} = {}) {
  const data = design();
  edit?.(data);
  const source = JSON.stringify(data, null, 2) + '\n', names = data.solids.map(solid => solid.name);
  const manifest = {schema: 'frc-design-kernel/manifest@1', design: {name: data.name, source: 'design.json', frame: ''}, generator: {library: 'frc-design-kernel', version: '0.1.0', commit: null},
    pose: null, files: {design: 'design.step', fixtures: null}, solids: names.map(name => ({name, group: 'base', volumeMm3: 1, boundsMm: [0, 0, 0, 1, 1, 1]})), fixtures: [],
    custom: [{name: 'hook', kind: 'shape', file: 'custom/hook.py', lines: hook.split('\n').length, reason: '', limits: '', usedBy: ['hook']}], parts: []};
  return {'design/design.json': source, 'design/custom/hook.py': hook, 'design/custom/drag.py': drag, 'design/custom/held.py': held,
    'design/generated/manifest.json': JSON.stringify(manifest, null, 2), 'design/generated/design.step': fixedStep(names), ...helpers, ...overlay};
}
function project(t, spec = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'design-audit-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [name, text] of Object.entries(files(spec))) {
    if (text === null) continue;
    mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    writeFileSync(path.join(root, name), typeof text === 'function' ? text() : text);
  }
  return root;
}
const audit = (t, spec, options = {}) => auditDesign(project(t, spec), {run: false, ...options});
const formsOf = result => [...new Set(result.findings.map(finding => finding.form))].sort();

test('a compliant project with a custom shape, a custom force law and a custom criterion has no findings, and the report says what it did not run', t => {
  const result = audit(t);
  assert.deepEqual(result.findings, [], JSON.stringify(result.findings, null, 1));
  const lines = reportLines(result);
  assert.match(lines.at(-1), /^No findings in what the audit read; the library was not run/);
  assert.ok(lines.some(line => /^Not run: .*--no-run/.test(line)) && lines.some(line => /^Not looked at: /.test(line)), lines.join('\n'));
  assert.ok(result.info.some(item => /1 of 8 robot solids are custom shapes/.test(item.text)));
});

const hookWith = extra => hook.replace('    return BRepPrimAPI_MakePrism', extra + '    return BRepPrimAPI_MakePrism');
const replaceFile = (name, text) => ({overlay: {[name]: text}});
// Each form: the change that must be reported, and a near miss that must not be.
const cases = {
  'kernel-outside-custom': [replaceFile('scripts/plate.py', 'from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox\nplate = BRepPrimAPI_MakeBox(10, 10, 2).Shape()\n'),
    replaceFile('scripts/plate.py', '# Plates are boxes in the design source; nothing here imports OCP.\nprint("import OCP")\n')],
  'writes-model': [replaceFile('scripts/export.py', 'with open("design/out/design.step", "w") as handle:\n    handle.write("ISO-10303-21;")\n'),
    replaceFile('scripts/export.py', 'with open("design/generated/design.step") as handle:\n    print(handle.read()[:80])\n')],
  'writes-library-record': [replaceFile('scripts/forge.py', 'import json\nrecord = {"schema": "frc-design-kernel/measurements@1", "source": "design.json"}\njson.dump(record, open("design/generated/measurements.json", "w"))\n'),
    replaceFile('scripts/forge.py', 'import json\nrecord = json.load(open("design/generated/measurements.json"))\nassert record["schema"] == "frc-design-kernel/measurements@1"\n')],
  'own-record': [replaceFile('scripts/solver.py', 'import json\nout = "results/carry-trials.json"\nwith open(out, "w") as handle:\n    json.dump({"schema": "tote/trial-record@1"}, handle)\n'),
    replaceFile('scripts/solver.py', 'import json\nwith open("results/carry-trials.json") as handle:\n    print(json.load(handle))\n')],
  'library-internals': [replaceFile('scripts/reach.py', 'from frc_design_kernel.builder import assembly\nimport frc_design_kernel.kernel.shapes as shapes\n'),
    replaceFile('scripts/reach.py', 'from frc_design_kernel.measure import approach\nfrom frc_design_kernel import build, export\nfrom builder import assembly\n')],
  'plugin-code': [replaceFile('scripts/old.py', 'import os, subprocess\nPLUGIN = os.environ["AGENT_FRC_ROOT"]\nsubprocess.run(["node", os.path.join(PLUGIN, "scripts", "design.mjs")])\n'),
    replaceFile('scripts/old.py', '# Checks are run by the agent with the plugin, never by this project.\nprint("done")\n')],
  'output-differs': [replaceFile('design/generated/design.step', fixedStep(['base plate']).replace('2000-01-01T00:00:00', '2031-05-06T07:08:09')), {}],
  'custom-several-solids': [replaceFile('design/custom/hook.py', hookWith('    builder = BRep_Builder()\n    compound = TopoDS_Compound()\n')), {}],
  'custom-places-itself': [replaceFile('design/custom/hook.py', hookWith('    shift = gp_Trsf()\n    shift.SetTranslation(gp_Vec(reach, 0, 0))\n')), {}],
  'custom-reads-or-writes': [replaceFile('design/custom/hook.py', hookWith('    depth = float(Path("jaw.txt").read_text())\n')), {}],
  'custom-imports': [replaceFile('design/custom/hook.py', 'import numpy\n' + hook), {}],
  'custom-hidden-numbers': [replaceFile('design/custom/hook.py', hookWith('    reach, depth = reach + 12.5, depth * 1.37 + 81\n')), {}],
  'custom-not-registered': [replaceFile('design/custom/spare.py', 'def build(parameters):\n    return None\n'), {}],
  'custom-no-reason': [{edit: data => { data.custom.hook.reason = 'tbd'; }}, {}],
  'custom-unused': [{edit: data => { data.custom.spare = {reason: 'A second hook for a wider tote, drawn later.', limits: 'None drawn yet; it is a placeholder.'}; }, overlay: {'design/custom/spare.py': hook}}, {}],
  'custom-trial-method': [replaceFile('design/custom/drag.py', drag.replace('speed = signals["speedMps"]', 'speed = signals["speedMps"] if signals["stepS"] > 0.0004 else 0.0')), {}],
  'custom-trial-state': [replaceFile('design/custom/drag.py', 'calls = []\n' + drag.replace('    speed =', '    calls.append(1)\n    speed =')), {}],
  'custom-criterion-always': [replaceFile('design/custom/held.py', 'def judge(run, parameters):\n    return True\n'), {}],
  'custom-guide-force': [replaceFile('design/custom/drag.py', 'def force(signals, parameters):\n    return (parameters["k"] * (parameters["targetMm"] - signals["xMm"]), 0.0, 0.0)\n'), {}],
  'custom-stands-in': [replaceFile('design/custom/drag.py', 'def force(signals, parameters):\n    sink = -signals["zMm"]\n    return (0.0, parameters["floorStiffness"] * max(sink, 0.0), 0.0)\n'), {}],
  'engine-scene-file': [replaceFile('design/scene.xml', '<mujoco model="tote"><worldbody/></mujoco>\n'), {}],
  'engine-setting-in-trial': [{edit: data => { data.trials.carry.surfaces[0].solref = [0.02, 1]; }}, {}],
  'custom-share': [{edit: data => { for (const name of ['arm brace', 'bumper front']) Object.assign(data.solids.find(solid => solid.name === name), {shape: {kind: 'custom', use: 'hook', parameters: {}}}); }}, {}],
  'custom-size': [replaceFile('design/custom/hook.py', hookWith(Array.from({length: 30}, (_, i) => '    reach = reach + 0\n').join(''))), {}],
  'restated-dimension': [{edit: data => { data.trials.carry.piece.start.atMm = [240, 0, 400]; }}, {}],
  'custom-listed-shape': [replaceFile('design/custom/hook.py', 'from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox\n\n\ndef build(parameters):\n    return BRepPrimAPI_MakeBox(parameters["xMm"], parameters["yMm"], parameters["zMm"]).Shape()\n'), {}],
  'override-no-reason': [replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3', interactions: {carry: {decides: 'Invented', trial: 'carry', override: {verdict: 'planar is enough'}}}})),
    replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3', interactions: {carry: {decides: 'Invented', trial: 'carry', override: {verdict: 'planar is enough', reason: 'The tote is carried flat; the arm holds it square to the plane.'}}}}))],
  'override-unknown-verdict': [replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3', interactions: {carry: {decides: 'Invented', trial: 'carry', override: {verdict: 'planar', reason: 'Invented reason.'}}}})),
    replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3', interactions: {carry: {decides: 'Invented', trial: 'carry', override: {verdict: 'needs 3D', reason: 'Invented reason.'}}}}))],
  'interaction-no-trial': [replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3', interactions: {carry: {decides: 'Invented'}}})),
    replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3', interactions: {carry: {decides: 'Invented', noTrial: 'Invented: no result changes the design.'}}}))],
  'trial-not-in-source': [replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3',
      interactions: {carry: {decides: 'Invented', trial: 'carry'}}, motions: {raise: {transportedBy: {tote: {trial: 'lift'}}}}})),
    replaceFile('design/judgement.json', JSON.stringify({schema: 'agent-frc/layout-judgement@3',
      interactions: {carry: {decides: 'Invented', trial: 'carry'}}, motions: {raise: {transportedBy: {tote: {trial: 'carry'}}}}}))],
  'input-no-source': [{edit: data => { data.materials.pad.friction = 0.8; }}, {}],
  'trial-no-control': [{edit: data => { delete data.trials.carry.control; }}, {}],
  'trial-no-brackets': [{edit: data => { for (const field of ['stiffnessNPerM', 'restitution', 'friction']) data.materials.pad[field] = {value: data.materials.pad[field].value, measured: 'bench rig'}; }},
    {edit: data => { for (const field of ['stiffnessNPerM', 'restitution', 'friction']) data.materials.pad[field] = {value: data.materials.pad[field].value, measured: 'bench rig'}; data.trials.carry.brackets = [{input: 'materials.pad.friction.value', values: [0.6, 0.4]}]; }}],
};

test('every form has a fixture that is reported and a near miss that is not', t => {
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(forms).sort(), 'one case per form');
  for (const [form, pair] of Object.entries(cases)) {
    const [reported, control] = pair;
    const found = audit(t, reported), clear = audit(t, control);
    assert.ok(found.findings.some(finding => finding.form === form), form + ' is reported: ' + JSON.stringify(formsOf(found)));
    assert.ok(!clear.findings.some(finding => finding.form === form), form + ' near miss is not reported: ' + JSON.stringify(clear.findings.filter(finding => finding.form === form)));
    assert.ok(found.findings.filter(finding => finding.form === form).every(finding => finding.file && finding.detail), form + ' names its file and says what it saw');
  }
});

test('a finding is never reported as clean, and the verdict counts it', t => {
  const lines = reportLines(audit(t, cases['writes-model'][0]));
  assert.match(lines.join('\n'), /\[writes-model\][\s\S]*scripts\/export\.py\n\s+line 1: writes design\/out\/design\.step/);
  assert.match(lines.at(-1), /^1 finding in 1 file\. This audit is advice: it blocks nothing\.$/);
});

test('a declared exception with a reason covers its findings and is listed on every run; one without a reason covers nothing', t => {
  const exceptions = {skip: [], exceptions: [{path: 'scripts/plate.py', form: 'kernel-outside-custom', reason: 'A fixture plate kept until the source draws it.'}, {path: 'scripts/'}]};
  const spec = {overlay: {...cases['kernel-outside-custom'][0].overlay, '.design-audit.json': JSON.stringify(exceptions)}};
  const result = audit(t, spec), lines = reportLines(result).join('\n');
  assert.deepEqual(result.findings, []);
  assert.equal(result.exceptions[0].covers.length, 1);
  assert.match(lines, /Declared exceptions in \.design-audit\.json, listed on every run:\n  scripts\/plate\.py \[kernel-outside-custom\]: A fixture plate kept until the source draws it\. Covers 1 finding:/);
  assert.match(lines, /Fix: \.design-audit\.json holds an exception without a path and a reason/);
  assert.match(lines.split('\n').at(-1), /No findings in what the audit read, 1 finding under declared exceptions/);
});

test('a skipped folder is not read and the report says so; a project with no design source reports that, and code doing the library\'s work as information', t => {
  const skipped = audit(t, cases['kernel-outside-custom'][0], {skip: ['scripts']});
  assert.equal(skipped.findings.length, 0);
  assert.match(reportLines(skipped).join('\n'), /Skipped scripts\/ \(\d+ files\)/);
  const gone = Object.fromEntries(Object.keys(files()).filter(name => name.startsWith('design/')).map(name => [name, null]));
  const bare = audit(t, {overlay: {...gone, ...cases['kernel-outside-custom'][0].overlay}}), text = reportLines(bare).join('\n');
  assert.deepEqual(bare.findings, []);
  assert.ok(!bare.findings.some(finding => finding.form === 'kernel-outside-custom'));
  assert.match(text, /the project has no design source/);
  assert.match(text, /1 file: calls the CAD kernel outside custom\/\. A finding once the project holds a design source: scripts\/plate\.py/);
});

test('custom code that looks alike in two projects is a library candidate; unlike code is not', t => {
  const one = audit(t), two = audit(t, replaceFile('design/custom/hook.py', hook.replace(/reach/g, 'span').replace('depth / 4', 'depth / 3')));
  assert.match(acrossLines([one, two]).join('\n'), /Library candidate \(shape\): .*design\/custom\/hook\.py and .*design\/custom\/hook\.py/);
  const three = audit(t, replaceFile('design/custom/hook.py', 'from OCP.BRepPrimAPI import BRepPrimAPI_MakeTorus\n\n\ndef build(parameters):\n    ring = BRepPrimAPI_MakeTorus(parameters["majorMm"], parameters["minorMm"])\n    return ring.Shape()\n'));
  const others = acrossLines([three, {...two, customs: two.customs.map(item => ({...item, name: 'jaw'}))}]).join('\n');
  assert.doesNotMatch(others, /Library candidate \(shape\)/);
});

test('the report lists every motion no motor drives, with its cause, from the top file and its subsystem files', t => {
  const root = project(t, {edit: data => {
    data.motions = {raise: {through: ['down', 'up'], by: 'hand'}};
    data.subsystems = [{file: 'subsystems/arm.json'}];
  }, overlay: {'design/subsystems/arm.json': JSON.stringify({schema: 'frc-design-kernel/subsystem@1',
    motions: {swing: {drive: {pivot: {to: 40}}, durationS: {value: 0.5, assumed: [0.4, 0.6]}}, settle: {from: {after: 'swing'}, by: 'gravity', moves: {}}}})}});
  const result = auditDesign(root, {run: false});
  const line = result.info.find(item => item.form === 'motions-without-a-motor');
  assert.ok(line, JSON.stringify(result.info));
  assert.equal(line.file, 'design/design.json');
  assert.deepEqual(line.motions, [{motion: 'raise', by: 'hand', file: 'design/design.json'}, {motion: 'settle', by: 'gravity', file: 'design/subsystems/arm.json'}]);
  assert.match(line.text, /^2 motions without a motor: raise \(by hand\), settle \(by gravity, in design\/subsystems\/arm\.json\)$/);
  assert.ok(reportLines(result).some(text => text.includes('2 motions without a motor: raise (by hand)')));
  // Control: when a motor drives every motion, nothing is listed.
  const driven = auditDesign(project(t, {edit: data => { data.motions = {raise: {drive: {pivot: {to: 40}}, durationS: {value: 0.5, assumed: [0.4, 0.6]}}}; }}), {run: false});
  assert.equal(driven.info.find(item => item.form === 'motions-without-a-motor'), undefined);
});
