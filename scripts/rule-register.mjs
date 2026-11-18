import { isDeepStrictEqual } from 'node:util';

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

export function verifyRuleValues(register, profile) {
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
  return register;
}
