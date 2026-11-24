/**
 * Outputs that do not regenerate: the library's records (manifest, measurements, trials, screen) and STEP files
 * whose stamp names an earlier source, whose content disagrees with their own stamp, or that the library no longer
 * makes from the source.
 *
 * Fingerprints are compared without the library. Where the library can be run, the audit also rebuilds each design
 * into a temporary folder and asks the library's status command about each folder of records. It writes nothing in
 * the project.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {libraryRecords} from './code.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
/** The fingerprint the library gives a custom code file: of its text with line ends made plain. */
const textSha = bytes => sha(Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8'));
const short = hash => String(hash ?? 'none').slice(0, 12);
const fixedStepTime = "2000-01-01T00:00:00";
const readJson = full => { try { return JSON.parse(readFileSync(full, 'utf8')); } catch { return null; } };
const plural = (count, one, many = one + 's') => count + ' ' + (count === 1 ? one : many);

const JOB = 'frc-design-kernel/measurement-job@1';
/** A measurement job record: RECORDS/measurements/<job id>.json, one per job the library answered. */
const jobRecord = output => output.record.schema === JOB;

/** The library records among a project's files: [{file, record}]. */
export function libraryOutputs(root, files) {
  return files.filter(file => libraryRecords.includes(path.posix.basename(file)) || path.posix.basename(path.posix.dirname(file)) === 'measurements' && file.endsWith('.json'))
    .map(file => ({file, record: readJson(path.join(root, file))}))
    .filter(({record}) => typeof record?.schema === 'string' && record.schema.startsWith('frc-design-kernel/'));
}

/** The folder of records an output belongs to: a job record's is the folder above measurements/. */
const recordsFolder = output => jobRecord(output) ? path.posix.dirname(path.posix.dirname(output.file)) : path.posix.dirname(output.file);

/** The design source an output was made from: the nearest source of the recorded name in its folder or above it. A job
 *  record names no source: it belongs to the one design source nearest its records folder. */
function ownerOf(output, sources) {
  const name = output.record.design?.source;
  let folder = recordsFolder(output);
  for (;;) {
    const here = sources.filter(source => path.posix.dirname(source.file) === folder);
    const found = jobRecord(output) ? (here.length === 1 ? here[0] : null) : here.find(source => path.posix.basename(source.file) === name);
    if (found) return found;
    if (folder === '.' || !folder) return null;
    folder = path.posix.dirname(folder);
  }
}

/** Which Python can import the design library, as {python, version} or {reason}. */
export function findLibrary(python) {
  const tried = python ? [python] : process.env.PYTHON ? [process.env.PYTHON] : process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  let reason = 'no Python was found (tried ' + tried.join(', ') + ')';
  for (const command of tried) {
    const done = spawnSync(command, ['-B', '-c', 'import frc_design_kernel as k, json; print(json.dumps(k.generator()))'], {encoding: 'utf8', timeout: 60000});
    if (done.error) continue;
    if (done.status === 0) { try { return {python: command, version: JSON.parse(done.stdout.trim().split('\n').pop())}; } catch { /* fall through */ } }
    reason = command + ' cannot import the design library frc_design_kernel (' + ((done.stderr || '').trim().split('\n').pop() || 'exit ' + done.status) + ')';
  }
  return {reason};
}

const library = (found, args, timeout) => spawnSync(found.python, ['-B', '-m', 'frc_design_kernel', ...args], {encoding: 'utf8', timeout, maxBuffer: 1 << 28, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
const lastLine = done => (done.error ? String(done.error.message) : (done.stderr || done.stdout || '').trim().split('\n').filter(Boolean).pop()) || 'exit ' + done.status;
/** The top-level parts of two records that differ, the generator left out. */
const differing = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter(name => name !== 'generator' && JSON.stringify(a?.[name]) !== JSON.stringify(b?.[name]));

/** The STEP files a manifest names, checked against the manifest without the library. */
function stepFindings(root, output, add) {
  const folder = path.posix.dirname(output.file), manifest = output.record;
  for (const [role, name] of Object.entries(manifest.files ?? {})) {
    if (!name) continue;
    const file = path.posix.join(folder, name), full = path.join(root, file);
    if (!existsSync(full)) { add('stale-output', output.file, 'names ' + file + ' as its ' + role + ' STEP, which is not there: regenerate'); continue; }
    if (statSync(full).size > 256 * 1024 * 1024) continue;
    const text = readFileSync(full, 'latin1'), header = text.match(/FILE_NAME\('[^']*','([^']*)'/);
    if (header && header[1] !== fixedStepTime) add('hand-edited-output', file, 'its header time is ' + header[1] + ', not the library\'s fixed time: the file was saved again by another tool');
    const names = (role === 'fixtures' ? manifest.fixtures : manifest.solids) ?? [];
    const missing = names.map(row => row.name).filter(solid => !text.includes("'" + solid + "'"));
    if (missing.length) add('hand-edited-output', file, 'does not hold ' + plural(missing.length, 'solid') + ' its manifest lists (' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ', ...' : '') + ')');
  }
}

/** Fingerprints a record carries for the files it was made from: the source, custom code and parts. */
function stampFindings(root, output, source, add) {
  const record = output.record, folder = path.posix.dirname(source.file);
  if (record.design?.sourceSha256 && record.design.sourceSha256 !== source.sha256)
    add('stale-output', output.file, 'was made from an earlier ' + source.file + ' (recorded ' + short(record.design.sourceSha256) + ', now ' + short(source.sha256) + '): regenerate it');
  for (const row of record.custom ?? []) {
    const full = path.join(root, folder, row.file ?? 'custom/' + row.name + '.py');
    if (!existsSync(full)) add('stale-output', output.file, 'lists custom "' + row.name + '" from ' + row.file + ', which is not there');
    else if (row.sha256 && textSha(readFileSync(full)) !== row.sha256) add('stale-output', output.file, 'was made with an earlier ' + row.file + ': regenerate it');
  }
  for (const row of record.parts ?? []) {
    const full = path.join(root, folder, row.file ?? '');
    if (row.file && existsSync(full) && row.sha256 && sha(readFileSync(full)) !== row.sha256) add('stale-output', output.file, 'was made with an earlier part file ' + row.file + ': regenerate it');
  }
}

/** Rebuild one design into a temporary folder and compare its manifest and STEP files with the committed ones. */
function rebuild(root, output, source, found, add, ran) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'design-audit-'));
  try {
    const pose = output.record.pose ? ['--pose', output.record.pose] : [];
    const begun = Date.now(), done = library(found, ['build', path.join(root, source.file), '--out', temp, ...pose], 600000);
    ran.push('built ' + source.file + ' in ' + ((Date.now() - begun) / 1000).toFixed(1) + ' s');
    if (done.status !== 0) { add('stale-output', output.file, 'cannot be made again: the library does not build ' + source.file + ' now (' + lastLine(done) + ')'); return; }
    const made = readJson(path.join(temp, 'manifest.json')), parts = differing(output.record, made);
    const stamped = output.record.design?.sourceSha256 === source.sha256;
    const versions = 'recorded ' + versionOf(output.record.generator) + ', installed ' + versionOf(made?.generator);
    if (parts.length && stamped) add('hand-edited-output', output.file, 'disagrees with what its own source gives now in ' + parts.join(', ') + ', though its stamp names that source: edited by hand, or made by another library version (' + versions + ')');
    else if (parts.length) add('stale-output', output.file, 'differs from a fresh build in ' + parts.join(', ') + ': regenerate it');
    if (parts.length) return;
    for (const [role, name] of Object.entries(made?.files ?? {})) {
      if (!name) continue;
      const committed = path.join(root, path.posix.dirname(output.file), name);
      if (existsSync(committed) && sha(readFileSync(committed)) !== sha(readFileSync(path.join(temp, name))))
        add('hand-edited-output', path.posix.join(path.posix.dirname(output.file), name), 'is not the ' + role + ' STEP a fresh build gives, though its manifest is: edited or saved again by hand, or made by another library version (' + versions + ')');
    }
  } finally { rmSync(temp, {recursive: true, force: true}); }
}
const versionOf = generator => generator ? generator.version + (generator.commit ? ' at ' + short(generator.commit) : '') : 'unknown';

/** Ask the library's status command about one folder of measurement and trial records. */
function status(root, folder, records, source, found, add, ran) {
  const begun = Date.now(), done = library(found, ['status', path.join(root, source.file), path.join(root, folder), '--json'], 600000);
  ran.push('asked status of ' + folder + ' in ' + ((Date.now() - begun) / 1000).toFixed(1) + ' s');
  const text = done.stdout ?? '', start = text.indexOf('\n{') >= 0 ? text.indexOf('\n{') + 1 : text.startsWith('{') ? 0 : -1;
  let result = null;
  if (done.status === 0 && start >= 0) try { result = JSON.parse(text.slice(start)); } catch { /* reported below */ }
  if (!result) { add('stale-output', records[0].file, 'the library\'s status command could not compare it with ' + source.file + ' (' + lastLine(done) + ')'); return; }
  for (const row of result.records ?? []) {
    if (row.state !== 'stale') continue;
    const record = records.find(item => /^trial /.test(row.record) ? item.record.schema.includes('trial') : item.file === path.posix.join(folder, row.file ?? '')) ?? records[0];
    const stamped = !jobRecord(record) && record.record.design?.sourceSha256 === source.sha256;
    add(stamped ? 'hand-edited-output' : 'stale-output', record.file, row.record + ' is stale' + (stamped ? ' though its stamp names the current source (edited by hand, or made by another library version)' : '') + ': ' + (row.changes ?? []).slice(0, 3).join('; ') + ((row.changes ?? []).length > 3 ? '; ...' : ''));
  }
}

/**
 * The findings about a project's generated outputs. sources are {file, sha256, ...}; found is findLibrary's result
 * or {reason} when the library is not to be run. Returns {findings, info, ran, notRun}.
 */
export function generatedFindings(root, files, sources, found) {
  const findings = [], info = [], ran = [], notRun = [];
  const add = (form, file, detail) => findings.push({form, file, line: null, detail});
  const outputs = libraryOutputs(root, files), folders = new Map();
  for (const output of outputs) {
    const source = ownerOf(output, sources);
    if (!source) { add('stale-output', output.file, 'names the design source ' + (output.record.design?.source ?? '(none)') + ', which is not in its folder or above it: it cannot be made again'); continue; }
    stampFindings(root, output, source, add);
    if (output.record.schema.startsWith('frc-design-kernel/manifest')) {
      stepFindings(root, output, add);
      if (found.python) rebuild(root, output, source, found, add, ran);
    } else if (/measurement|trial/.test(output.record.schema)) {
      const folder = recordsFolder(output), entry = folders.get(folder) ?? {source, records: []};
      entry.records.push(output); folders.set(folder, entry);
    }
  }
  for (const [folder, {source, records}] of folders) if (found.python) status(root, folder, records, source, found, add, ran);
  if (!found.python && outputs.length) notRun.push('Did not run the design library to rebuild ' + plural(outputs.length, 'generated record') + ' and ask their status: ' + found.reason + '. Only their fingerprints were compared.');
  for (const source of sources) if (!outputs.some(output => ownerOf(output, sources) === source)) info.push({file: source.file, text: 'has no generated manifest or record beside it or below it, so nothing of it was compared'});
  return {findings, info, ran, notRun, outputs};
}
