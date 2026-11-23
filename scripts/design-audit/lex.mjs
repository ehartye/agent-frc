/**
 * Code read as code: comments and docstrings dropped, string contents set aside, line numbers kept. Small lexers for
 * Python and JavaScript that are good enough to tell a call from a mention in prose or in a string.
 */

/**
 * Lex one Python file. Returns
 *   code      one entry per source line: the line with comments removed and each string written as "" (its quotes kept)
 *   strings   [{line, value}] every string literal that is not a docstring, at the line it starts on
 */
export function lexPython(text) {
  return lex(text.replace(/\r\n?/g, '\n'), {comment: '#', docstrings: true});
}

/** Lex one JavaScript file, in the same form as lexPython. A template literal is one string; what it fills in is dropped. */
export function lexJavaScript(text) {
  return lex(text.replace(/\r\n?/g, '\n'), {comment: '//', block: true, template: true});
}

function lex(text, {comment, block = false, docstrings = false, template = false}) {
  const out = [], strings = [];
  let line = 1, i = 0, current = '', statementStart = true;
  const push = () => { out.push(current); current = ''; line++; };
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { push(); i++; if (!/[([{,\\]\s*$/.test(out.at(-1) ?? '')) statementStart = true; continue; }
    if (text.startsWith(comment, i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (block && text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2), stop = end < 0 ? text.length : end + 2;
      for (const ch of text.slice(i, stop)) if (ch === '\n') push();
      i = stop; continue;
    }
    const prefix = docstrings ? text.slice(i).match(/^[rRbBuUfF]{0,2}(?=["'])/)?.[0] ?? '' : '';
    const q = text[i + prefix.length];
    const opens = (q === '"' || q === "'" || (template && q === '`')) && !(prefix && /\w/.test(text[i - 1] ?? ''));
    if (opens) {
      const triple = docstrings && text.startsWith(q.repeat(3), i + prefix.length), delimiter = triple ? q.repeat(3) : q;
      let j = i + prefix.length + delimiter.length, value = '';
      const startLine = line;
      while (j < text.length && !text.startsWith(delimiter, j)) {
        if (text[j] === '\\') { value += text.slice(j, j + 2); j += 2; continue; }
        if (text[j] === '\n' && !triple && q !== '`') break;
        value += text[j]; j++;
      }
      const end = Math.min(text.length, j + delimiter.length), docstring = triple && statementStart && /^\s*$/.test(current);
      for (const ch of text.slice(i, end)) if (ch === '\n') push();
      if (!docstring) { strings.push({line: startLine, value: value.replace(/\\(.)/g, '$1')}); current += prefix + q + q; }
      i = end; statementStart = false; continue;
    }
    if (!/\s/.test(c)) statementStart = false;
    current += c; i++;
  }
  out.push(current);
  return {code: out, strings};
}

/** The strings of a lexed file, by line number. */
export function stringsByLine(lexed) {
  const by = new Map();
  for (const {line, value} of lexed.strings) by.set(line, [...(by.get(line) ?? []), value]);
  return by;
}
