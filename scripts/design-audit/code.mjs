/**
 * Going around the door: project code outside custom/ that does the design library's work itself, reaches into the
 * library's internals, or runs plugin code. Each finding is {form, file, line, detail}.
 */
import {lexJavaScript, lexPython, stringsByLine} from './lex.mjs';

/** The CAD kernel packages: OCP and the libraries built on it, and their JavaScript ports. */
const pythonKernel = /^\s*(?:from\s+(OCP|OCC|cadquery|build123d)\b[\w.]*\s+import\b|import\s+(OCP|OCC|cadquery|build123d)\b)/;
const javascriptKernel = /\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](opencascade\.js|replicad|occt-import-js)["']/;
/** Writing a STEP file through the kernel's own writers. A display mesh (STL, glTF) is presentation, not the design. */
const kernelWriter = /\b(STEPControl_Writer|IGESControl_Writer|exportStep|export_step)\b/;
const modelFile = /\.(?:step|stp|iges|igs)$/i;
/** What the library writes. A file of one of these names beside a design source, or a record that carries its schema. */
export const libraryRecords = ['manifest.json', 'measurements.json', 'trials.json', 'screen.json'];
const libraryRecord = new RegExp('(?:^|[\\\\/])(?:' + libraryRecords.map(name => name.replace('.', '\\.')).join('|') + ')$');
const librarySchema = /^frc-design-kernel\/[\w-]+@\d+$/;
/** A project's own trial or measurement record: a JSON file named for one, or a schema ID that says so. */
const ownTrialFile = /(?:^|[\/{}-])(?:[\w-]*trials?|[\w-]*measurements)\.json$/i, ownTrialSchema = /^[\w.-]+\/[\w-]*(?:trial|measurement)[\w-]*@\d+$/i;
/** A call that writes a file. The mode of open() is read from the strings on the line. */
const pythonWrite = /\b(?:write\w*|dump|save\w*|to_json)\s*\(/;
const javascriptWrite = /\b(?:write\w*|createWriteStream|save\w*)\s*\(/;

/**
 * The design library's public calls, as its README and DESIGN.md document them for other tools: the top-level
 * functions, the measure layer and the motion vocabulary. Everything else (builder, kernel, source, trials, status,
 * cli, errors, version) is how the library works inside, and a project reaches it through the command line.
 */
export const publicTop = new Set(['Design', 'DesignError', 'build', 'export', 'generator', 'load', 'placements', 'sampled', 'measure', 'motion']);
const publicModule = /^frc_design_kernel(?:\.(?:measure|motion)(?:\.\w+)*)?$/;

/** The library modules a Python import line names that are not public, or none. */
export function internalImports(line) {
  const from = line.match(/^\s*from\s+(frc_design_kernel(?:\.\w+)*)\s+import\s+\(?\s*([\w\s,*]+?)\s*\)?\s*$/);
  if (from) {
    if (from[1] !== 'frc_design_kernel') return publicModule.test(from[1]) ? [] : [from[1]];
    return from[2].split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(name => name && !publicTop.has(name)).map(name => 'frc_design_kernel.' + name);
  }
  const plain = line.match(/^\s*import\s+([\w.,\s]+?)\s*$/);
  if (!plain) return [];
  return plain[1].split(',').map(part => part.trim().split(/\s+as\s+/)[0]).filter(name => name.startsWith('frc_design_kernel.') && !publicModule.test(name));
}

/** The findings in one code file outside custom/. foreign is the CI audit's list of plugin names; uses is its detector. */
export function codeFindings(file, text, {plugin} = {}) {
  const python = /\.pyw?$/i.test(file), javascript = /\.(?:[cm]?js|ts)$/i.test(file);
  const found = [], usesLibrary = /frc[_-]design[_-]kernel|design\.json/.test(text);
  const add = (form, line, detail) => found.push({form, file, line, detail});
  if (python || javascript) {
    const lexed = python ? lexPython(text) : lexJavaScript(text), strings = stringsByLine(lexed);
    const held = new Map();
    lexed.code.forEach((row, index) => {
      const line = index + 1, here = strings.get(line) ?? [];
      // A variable that holds a model file or a record's name, for a write further down.
      const assigned = row.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*(?::\s*[\w.[\]]+\s*)?=(?!=)/);
      const target = here.find(value => modelFile.test(value) || libraryRecord.test(value) || ownTrialFile.test(value));
      if (assigned && target) held.set(assigned[1], target);
    });
    lexed.code.forEach((row, index) => {
      const line = index + 1, here = strings.get(line) ?? [];
      if (python) {
        const kernel = row.match(pythonKernel);
        if (kernel) add('kernel-outside-custom', line, 'imports ' + (kernel[1] ?? kernel[2]));
        for (const module of internalImports(row)) add('library-internals', line, 'imports ' + module);
      } else if (javascriptKernel.test(row)) add('kernel-outside-custom', line, 'imports ' + row.match(javascriptKernel)[1]);
      for (const value of here) if (/^frc_design_kernel\.\w/.test(value) && !publicModule.test(value.split(':')[0]) && /import|load|spec/.test(row)) add('library-internals', line, 'loads ' + value);
      if (kernelWriter.test(row)) add('writes-model', line, 'writes a model file with ' + row.match(kernelWriter)[1]);
      const opensToWrite = /\bopen\s*\(/.test(row) && here.some(mode => /^[rwxabt+]{1,3}$/.test(mode) && /[wxa]/.test(mode));
      const writes = python ? opensToWrite || pythonWrite.test(row) : javascriptWrite.test(row);
      if (writes) {
        const names = [...here, ...[...held].filter(([name]) => new RegExp('(?<![\\w$.])' + name.replace(/\$/g, '\\$') + '(?![\\w$])').test(row)).map(([, value]) => value)];
        const model = names.find(value => modelFile.test(value)), record = names.find(value => libraryRecord.test(value)), trial = names.find(value => ownTrialFile.test(value));
        if (model && !kernelWriter.test(row)) add('writes-model', line, 'writes ' + model);
        // A file of a library record's name is the library's only in code that works with the library.
        if (record && usesLibrary) add('writes-library-record', line, 'writes ' + record);
        else if (trial) add('own-record', line, 'writes ' + trial);
      }
      // A record put together in code with a schema ID: the library's, or the project's own trial record.
      const schema = here.find(value => librarySchema.test(value) || ownTrialSchema.test(value));
      if (schema && /["'`]\s*:|\bschema\s*[:=]|\[\s*["'`]{2}\s*\]\s*=/.test(row) && !/[!=]==?|\bstartswith\b|\bin\s|\.get\(|\.includes\(|\bmatch/.test(row))
        add(librarySchema.test(schema) ? 'writes-library-record' : 'own-record', line, 'makes a record with the schema ' + schema);
    });
    if (plugin) for (const use of plugin(file, text)) add('plugin-code', use.line, use.form);
  }
  return dedupe(found);
}

/** A MuJoCo scene kept as a file. The library makes the scene from the design source and never writes one. */
export function sceneFileFindings(file, text) {
  return /<mujoco\b/.test(text) ? [{form: 'engine-scene-file', file, line: text.slice(0, text.indexOf('<mujoco')).split('\n').length, detail: 'holds a MuJoCo scene'}] : [];
}

/** One finding per file, form and detail, with every line that shows it as a sorted list. */
export function dedupe(found) {
  const by = new Map();
  for (const item of found) {
    const key = item.file + '\0' + item.form + '\0' + item.detail, lines = [item.line].flat().filter(Boolean), held = by.get(key);
    if (held) held.line = [...new Set([...held.line, ...lines])].sort((a, b) => a - b);
    else by.set(key, {...item, line: lines});
  }
  return [...by.values()];
}
