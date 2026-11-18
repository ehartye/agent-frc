// The supported metadata format is deliberately two ordered fields, not general YAML.
// Normalize line endings only in memory; callers retain the original source bytes.
export function validateSkills(entries) {
  const skills = [];
  const issues = [];
  const names = new Map();
  for (const entry of [...entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const issue = (code, reason) => issues.push({ path: entry.path, code, reason });
    const body = entry.body.replaceAll('\r\n', '\n');
    if (!body.startsWith('---')) {
      issue('missing-frontmatter', 'Start the skill with a --- frontmatter delimiter.');
      continue;
    }
    const lines = body.split('\n');
    const end = lines.indexOf('---', 1);
    if (lines[0] !== '---' || end < 0 || lines.slice(0, end + 1).some(line => line.includes('\r'))) {
      issue('invalid-frontmatter', 'Use standalone --- delimiters and LF or CRLF line endings.');
      continue;
    }
    const fields = lines.slice(1, end);
    const nameLine = fields.find(line => line.startsWith('name:'));
    const descriptionLine = fields.find(line => line.startsWith('description:'));
    if (!nameLine || !nameLine.slice(5).trim()) {
      issue('missing-name', 'Frontmatter requires a nonempty name field.');
      continue;
    }
    if (!descriptionLine || !descriptionLine.slice(12).trim()) {
      issue('missing-description', 'Frontmatter requires a JSON-encoded description field.');
      continue;
    }
    if (fields.length !== 2 || fields[0] !== nameLine || fields[1] !== descriptionLine) {
      issue('invalid-frontmatter', 'Use exactly name then description, with no additional frontmatter fields.');
      continue;
    }
    const match = nameLine.match(/^name: ([a-z0-9-]+)$/);
    if (!match) {
      issue('invalid-name', 'Name must use lowercase letters, digits or hyphens after "name: ".');
      continue;
    }
    const name = match[1];
    let description;
    try {
      if (!descriptionLine.startsWith('description: ')) throw new Error('separator');
      description = JSON.parse(descriptionLine.slice(13));
    } catch {
      issue('invalid-description', 'Description must be valid JSON after "description: ".');
      continue;
    }
    const countBefore = issues.length;
    if (names.has(name)) issue('duplicate-name', `Name ${name} is already declared in ${names.get(name)}.`);
    else names.set(name, entry.path);
    if (name !== entry.folder) issue('name-folder-mismatch', `Name ${name} must match folder ${entry.folder}.`);
    if (issues.length === countBefore) skills.push({ path: entry.path, name, description });
  }
  issues.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  return { skills, issues };
}
