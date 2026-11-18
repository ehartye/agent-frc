import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { rulesModel } from './kickoff.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const topics = ['field', 'inventory', 'timing', 'scoring', 'restrictions'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const unique = list => new Set(list).size === list.length;

export function newRegister() {
  return {
    schema: 'frc-rule-register/v1', edition: '', cutoff: '', sources: [], facts: [],
    openQuestions: topics.map(topic => ({ topic, question: 'Which provisions govern ' + topic + '?' }))
  };
}

export function reviewRegister(register) {
  if (register?.schema !== 'frc-rule-register/v1' || !nonempty(register.edition) ||
      !nonempty(register.cutoff) || !Array.isArray(register.sources) || !register.sources.length ||
      !Array.isArray(register.facts) || !register.facts.length || !Array.isArray(register.openQuestions)) {
    throw Error('Provide an edition, evidence cutoff, sources, extracted facts and open questions.');
  }
  const sources = register.sources.map(source => source.id);
  if (!unique(sources) || !register.sources.every(s => [s.id,s.title,s.edition,s.location].every(nonempty))) {
    throw Error('Each source needs a unique ID, title, edition and location.');
  }
  const pointers = new Set();
  for (const fact of register.facts) {
    if (![fact.id,fact.topic,fact.statement,fact.locator].every(nonempty) ||
        !sources.includes(fact.sourceId) || !['modeled','unmodeled'].includes(fact.status)) {
      throw Error('Each fact needs a source, locator, statement, topic and modeling status.');
    }
    if (fact.status === 'modeled') {
      if (!nonempty(fact.pointer) || !fact.pointer.startsWith('/') ||
          pointers.has(fact.pointer) || !Object.hasOwn(fact,'value')) {
        throw Error('Give each modeled fact a distinct JSON Pointer and its reviewed value.');
      }
      pointers.add(fact.pointer);
    } else if (!nonempty(fact.reason)) throw Error('Describe how an unmodeled fact affects design.');
  }
  if (!unique(register.facts.map(f => f.id))) throw Error('Fact IDs must be unique.');
  if (!register.openQuestions.every(q => nonempty(q.topic) && nonempty(q.question))) throw Error('Incomplete question.');
  for (const topic of topics) {
    if (!register.facts.some(f => f.topic === topic) && !register.openQuestions.some(q => q.topic === topic)) {
      throw Error('Record a provision or open question for ' + topic);
    }
  }
  return register;
}

export function compileRules(register, profile) {
  reviewRegister(register);
  if (register.edition !== profile.edition) throw Error('The register and field profile must use the same edition.');
  for (const fact of register.facts.filter(f => f.status === 'modeled')) {
    let value = profile;
    for (const part of fact.pointer.slice(1).split('/')) {
      if (/~(?![01])/.test(part)) throw Error('Invalid JSON Pointer in ' + fact.id);
      const key = part.replaceAll('~1','/').replaceAll('~0','~');
      if (!value || typeof value !== 'object' || !Object.hasOwn(value,key)) throw Error('Missing field for ' + fact.id);
      value = value[key];
    }
    if (!isDeepStrictEqual(value,fact.value)) throw Error('Profile disagrees with rule fact ' + fact.id);
  }
  return { ...rulesModel(profile), ruleRegister: register };
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
