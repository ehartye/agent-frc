import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { newRegister, reviewRegister, governingManual } from './rule-register.mjs';
import { rulesModel } from './kickoff.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export { newRegister, reviewRegister } from './rule-register.mjs';

export function compileRules(register, profile) {
  const model=rulesModel({ ...profile, ruleRegister:register });
  return { ...model, manualBinding:governingManual(register,profile) };
}

async function readJson(file) {
  return JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
}

async function writeProjectFile(destination, value) {
  const relative = path.relative(await realpath(root), await realpath(path.dirname(path.resolve(destination))));
  if (!relative || !(path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep))) {
    throw Error('Choose an output in the design project outside the plugin.');
  }
  await writeFile(destination, JSON.stringify(value,null,2) + '\n', { flag:'wx' });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command,...files] = process.argv.slice(2);
    if (command === 'init' && files.length === 1) await writeProjectFile(files[0],newRegister());
    else if (command === 'review' && files.length === 1) {
      const register = reviewRegister(await readJson(files[0]));
      console.log(JSON.stringify({edition:register.edition,facts:register.facts.length,openQuestions:register.openQuestions}));
    } else if (command === 'compile' && files.length === 3) {
      const raw = await readFile(files[0]);
      const model = compileRules(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,'')),await readJson(files[1]));
      model.ruleRegisterSha256 = createHash('sha256').update(raw).digest('hex');
      await writeProjectFile(files[2],model);
    } else throw Error('Usage: rules init REGISTER | review REGISTER | compile REGISTER PROFILE NEW_MODEL');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
