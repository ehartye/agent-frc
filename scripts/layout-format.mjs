/**
 * Which of the two layout formats a design uses.
 *
 * The current format is a design source, which the design library builds and measures, with a judgement file beside
 * it that the plugin reads. The earlier format is a layout plan with a motion study and a STEP that a project builder
 * wrote. A design keeps the format it was checked in; nothing converts one to the other.
 */
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const judgementSchema = 'agent-frc/layout-judgement@1', judgementFile = 'judgement.json', planFile = 'layout.json';

/** Whether a file is a judgement file: the plugin's half of a design checked on the design library. */
export function isJudgement(file) {
  try { return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')).schema === judgementSchema; } catch { return false; }
}

/** The name of the file a design folder is checked from: its judgement file, or the layout plan of the earlier format. */
export const planNameIn = folder => existsSync(path.join(folder, judgementFile)) ? judgementFile : planFile;

/** The layout check for a plan file, as {script, library}: the check on the design library, or the earlier one. */
export function checkFor(file) {
  const library = isJudgement(file);
  return {library, script: fileURLToPath(new URL(library ? './layout_check.py' : './preliminary_design.py', import.meta.url))};
}
