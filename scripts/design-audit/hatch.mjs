/**
 * A hatch doing too much: custom shapes, force laws and criteria in custom/ read against the library's contracts
 * (DESIGN.md sections 6 and 13.6). The audit reads structure, not intent: a wrong law that looks like a law passes.
 */
import {lexPython, stringsByLine} from './lex.mjs';

const allowed = {shape: ['math', 'OCP', 'frc_design_kernel'], force: ['math'], criterion: ['math']};
/** A side door for code: loading modules by path, changing the import path, running text as code. */
const sideDoor = /\b(?:importlib|spec_from_file_location|import_module|__import__|sys\.path|exec|eval|compile|runpy|globals|setattr)\b/;
/** Files, the clock, the network, chance and the environment: a shape is a pure function of its parameters. */
const outside = /\b(?:open|Path|read_text|read_bytes|write_text|write_bytes|os\.\w+|environ|getenv|time\.\w+|datetime|random|uuid|socket|urllib|requests|STEPControl_Reader|STEPControl_Writer|StlAPI_\w+|BRepTools\.(?:Read|Write)\w*|BRepTools_\w+|IGESControl_\w+)\b/;
/** Several bodies: a compound, or several solids fused to pass the one-solid check. */
const compound = /\b(?:TopoDS_Compound|MakeCompound|BRep_Builder|TopoDS_CompSolid)\b/;
const fuse = /\bBRepAlgoAPI_Fuse\b/;
/** Moving the shape it built: placement belongs to "place" and poses. */
const moves = /\b(?:gp_Trsf|gp_GTrsf|BRepBuilderAPI_Transform|BRepBuilderAPI_GTransform|TopLoc_Location)\b|\.(?:Moved|Located|Move|Location|Mirrored|Rotated|Translated)\s*\(/;
/** The calls that make solids, and the ones that make something no listed shape can. */
const listedSolids = /\bBRepPrimAPI_Make(?:Box|Cylinder|Sphere)\b/g;
const beyondListed = /\b(?:BRepBuilderAPI_Make(?:Edge|Wire|Face|Polygon)|BRepPrimAPI_Make(?:Prism|Revol|Cone|Torus|Wedge)|BRepOffsetAPI_\w+|BRepFilletAPI_\w+|GC_\w+|Geom2?d?_\w+|GCE2d_\w+|BRepFill\w*|ShapeUpgrade\w*)\b/;
/** Numbers that are not design arithmetic: none, one, two, a half, and the right, straight and full angles. */
const plainNumber = value => [0, 1, 2, 0.5, 90, 180, 360].includes(Math.abs(value)) || Math.abs(value) < 0.01;
/** A force law that steers the piece, or stands in for what the library already models. */
const steers = /target|goal|aim|setpoint|desired|destination|guide|seat/i;
const standsIn = /stiff|spring|penetrat|contact|wall|floor|belt|roller|wheel|motor|brake|gravity|accel/i;
/** The method's own runs, which custom trial code must not tell apart. */
const methodWords = /\b(?:control|brackets?|half\w*|stepS|step_s|timestep|dt|nominal|run_index|runIndex|is_control|isControl)\b/;

/** The modules a Python line imports, top-level names only. */
function imported(row) {
  const from = row.match(/^\s*from\s+(\.*[\w.]*)\s+import\b/), plain = row.match(/^\s*import\s+([\w.,\s]+?)\s*$/);
  if (from) return [from[1].startsWith('.') ? '(a relative import)' : from[1].split('.')[0]];
  return plain ? plain[1].split(',').map(part => part.trim().split(/\s+as\s+/)[0].split('.')[0]) : [];
}

/** Line numbers of a pattern in the code, with what matched. */
function where(code, pattern) {
  const found = [];
  code.forEach((row, index) => { const match = row.match(pattern); if (match) found.push({line: index + 1, what: match[0].replace(/^\.|\s*\($/g, '')}); });
  return found;
}

/** The body lines of one top-level function, by its name, as [start, end) indexes into code. */
function body(code, name) {
  const start = code.findIndex(row => new RegExp('^def\\s+' + name + '\\s*\\(').test(row));
  if (start < 0) return null;
  let end = start + 1;
  while (end < code.length && (/^\s/.test(code[end]) || !code[end].trim())) end++;
  return [start, end];
}

/**
 * The findings for one custom code file. kind is shape, force or criterion (from its registration, or shape when it
 * has none). Returns [{form, file, line, detail}] and the number of code lines.
 */
export function customFindings(file, text, kind = 'shape') {
  const lexed = lexPython(text), code = lexed.code, strings = stringsByLine(lexed), found = [];
  const add = (form, line, detail) => found.push({form, file, line, detail});
  const lines = code.filter(row => row.trim()).length;
  code.forEach((row, index) => {
    for (const module of imported(row)) if (!(allowed[kind] ?? allowed.shape).includes(module))
      add('custom-imports', index + 1, 'a custom ' + kind + ' imports ' + module + '; it may import only ' + (allowed[kind] ?? allowed.shape).join(', '));
  });
  for (const {line, what} of where(code, sideDoor)) add('custom-imports', line, 'uses ' + what + ', a side door for code the contract does not allow');
  for (const {line, what} of where(code, outside)) add('custom-reads-or-writes', line, 'uses ' + what + ': custom code is a pure function of its parameters and reads or writes nothing');
  // Numbers kept in the code, which the source and the ranges cannot reach.
  const numbers = [];
  code.forEach((row, index) => { for (const match of row.matchAll(/(?<![\w.])(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)(?![\w.])/gi)) if (!plainNumber(Number(match[1]))) numbers.push({line: index + 1, value: match[1]}); });
  const distinct = [...new Set(numbers.map(number => number.value))];
  if (distinct.length >= 3) add('custom-hidden-numbers', numbers[0].line, 'holds ' + distinct.length + ' numbers of its own (' + distinct.slice(0, 6).join(', ') + (distinct.length > 6 ? ', ...' : '') +
    ') on lines ' + [...new Set(numbers.map(number => number.line))].slice(0, 8).join(', ') + ': pass them in as parameters so the source ' + (kind === 'shape' ? 'shows them' : 'and the ranges can reach them'));
  if (kind === 'shape') shapeFindings(code, add);
  else trialFindings(code, strings, kind, add);
  return {findings: found, lines};
}

function shapeFindings(code, add) {
  for (const {line, what} of where(code, compound)) add('custom-several-solids', line, 'builds a compound with ' + what + ': a custom shape returns exactly one solid');
  const fused = where(code, fuse), made = code.join('\n').match(new RegExp(listedSolids.source + '|' + beyondListed.source, 'g')) ?? [];
  if (fused.length && made.length >= 2) add('custom-several-solids', fused[0].line, 'fuses ' + made.length + ' solids it made into one: draw separate parts as separate solids, or join listed shapes with a union in the source');
  const span = body(code, 'build');
  if (span) for (let i = span[0]; i < span[1]; i++) if (/^\s*return\s*(?:\[|\(\s*[^)]*,|\w+\s*,)/.test(code[i])) add('custom-several-solids', i + 1, 'returns several values: a custom shape returns exactly one solid');
  for (const {line, what} of where(code, moves)) add('custom-places-itself', line, 'moves the shape with ' + what + ': draw it in its own coordinates and place it with "place" in the source');
  const all = code.join('\n'), listed = all.match(listedSolids) ?? [];
  if (listed.length && !beyondListed.test(all)) add('custom-listed-shape', code.findIndex(row => listedSolids.test(row)) + 1 || 1,
    'makes only ' + [...new Set(listed.map(call => call.replace('BRepPrimAPI_Make', '').toLowerCase()))].join(' and ') + ' solids: a listed shape (box, cylinder, sphere, union, difference, intersection) can make this');
  listedSolids.lastIndex = 0;
}

function trialFindings(code, strings, kind, add) {
  code.forEach((row, index) => {
    if (/^\s*(?:global|nonlocal)\b/.test(row)) add('custom-trial-state', index + 1, 'keeps state between calls (' + row.trim().split(/\s+/)[0] + '): two runs of the same inputs could differ');
    if (/^[A-Za-z_]\w*\s*=\s*(?:\[|\{|set\(|dict\(|list\()/.test(row)) add('custom-trial-state', index + 1, 'holds a module-level ' + row.match(/=\s*(\[|\{|\w+\()/)[1].replace('(', '') + ' that calls can change: two runs of the same inputs could differ');
    if (/^def\s+\w+\s*\([^)]*=\s*(?:\[|\{)/.test(row)) add('custom-trial-state', index + 1, 'has a list or dict default argument, which keeps state between calls');
    const words = [row, ...(strings.get(index + 1) ?? [])].join(' ');
    const method = words.match(methodWords);
    if (method) add('custom-trial-method', index + 1, 'reads "' + method[0] + '": custom trial code must not tell the control, a bracket or the half-step repeat from the nominal run');
  });
  const span = body(code, kind === 'force' ? 'force' : 'judge');
  if (!span) return;
  const inside = code.slice(span[0], span[1]), words = inside.map((row, i) => [row, ...(strings.get(span[0] + i + 1) ?? [])].join(' '));
  if (kind === 'criterion') {
    const returns = inside.filter(row => /^\s*return\b/.test(row));
    if (returns.length && returns.every(row => /^\s*return\s+(?:True|1|not\s+False)\s*$/.test(row))) add('custom-criterion-always', span[0] + 1, 'judge() returns true whatever the run shows');
    return;
  }
  const steer = words.findIndex(text => steers.test(text)), stand = words.findIndex(text => standsIn.test(text));
  if (steer >= 0) add('custom-guide-force', span[0] + steer + 1, 'the force law steers toward "' + words[steer].match(steers)[0] + '": a law that moves the piece where the author wants it cannot fail');
  if (stand >= 0) add('custom-stands-in', span[0] + stand + 1, 'the force law speaks of "' + words[stand].match(standsIn)[0] + '", which the library already models (contacts, materials, drives, loads): use those');
}
