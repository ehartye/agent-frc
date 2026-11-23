/**
 * Across projects: custom shapes and force laws that look alike in more than one project are candidates to add to
 * the design library. Code is compared by its shape, not its names: identifiers and numbers are set aside, the CAD
 * kernel's own calls are kept.
 */
import {lexPython} from './lex.mjs';

/** The tokens of a custom file with its own names and numbers made anonymous. */
export function tokensOf(text) {
  const code = lexPython(text).code.join('\n');
  return (code.match(/[A-Za-z_]\w*|\d+\.?\d*|\S/g) ?? []).map(token =>
    /^\d/.test(token) ? '0' : /^(?:BRep|gp_|Geom|GC_|TopoDS|TopAbs|TopExp|BRepPrim|math|def|return|for|in|if|else|while|import|from|and|or|not)/.test(token) || !/^\w/.test(token) ? token : 'n');
}

/** How alike two token lists are: the share of runs of five tokens they hold in common. */
export function likeness(a, b) {
  const runs = tokens => { const set = new Set(); for (let i = 0; i + 5 <= tokens.length; i++) set.add(tokens.slice(i, i + 5).join(' ')); return set; };
  const left = runs(a), right = runs(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const run of left) if (right.has(run)) shared++;
  return shared / (left.size + right.size - shared);
}

/**
 * Library candidates among the custom code of several projects. customs is [{project, name, kind, file, text}].
 * Returns [{kind, members: [{project, name, file}], likeness, why}] for code that looks alike or shares a name in
 * more than one project.
 */
export function libraryCandidates(customs, threshold = 0.5) {
  const tokens = customs.map(item => tokensOf(item.text)), found = [];
  for (let i = 0; i < customs.length; i++) for (let j = i + 1; j < customs.length; j++) {
    const a = customs[i], b = customs[j];
    if (a.project === b.project || a.kind !== b.kind) continue;
    const score = likeness(tokens[i], tokens[j]);
    if (score >= threshold || a.name === b.name) found.push({kind: a.kind, members: [a, b].map(({project, name, file}) => ({project, name, file})), likeness: score,
      why: score >= threshold ? 'their code is ' + Math.round(score * 100) + '% alike' : 'they share the name "' + a.name + '" (code ' + Math.round(score * 100) + '% alike)'});
  }
  return found.sort((x, y) => y.likeness - x.likeness);
}
