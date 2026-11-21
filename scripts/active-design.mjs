import fs from 'node:fs';
import path from 'node:path';

// Resolve the project from the requested destination, including a worktree checkout.
export function activeDesignFor(destination) {
  let dir = path.dirname(path.resolve(destination));
  while (true) {
    const marker = path.join(dir, 'iterations', 'active.json');
    if (fs.existsSync(marker)) {
      const active = JSON.parse(fs.readFileSync(marker,'utf8'));
      const number = active.number;
      const expected = 'iterations/' + String(number).padStart(3,'0') + '/design';
      if (active.schema !== 'agent-frc/active-iteration@1' || !Number.isInteger(number) ||
          number < 1 || number > 999 || active.root !== expected) throw Error('Invalid active iteration');
      if (fs.readdirSync(path.join(dir,'iterations')).some(n=>/^\d{3}$/.test(n) && Number(n)>number)) throw Error('A later numbered design exists; verify the active pointer');
      const root = path.join(dir,expected);
      const opening = JSON.parse(fs.readFileSync(path.join(root,'..','iteration.json'),'utf8'));
      if (opening.id !== active.id || opening.number !== number || fs.realpathSync(root) !== fs.realpathSync(dir) + path.sep + expected.split('/').join(path.sep))
        throw Error('Active design identity or location changed');
      return root;
    }
    const parent = path.join(dir,'iterations');
    if (fs.existsSync(parent) && fs.readdirSync(parent).some(n=>/^\d{3}$/.test(n))) throw Error('Numbered designs are missing their active pointer');
    if (fs.existsSync(path.join(dir,'.git')) || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

export function checkDesignDestination(file) {
  const root = activeDesignFor(file);
  if (!root) return;
  const target = path.resolve(file);
  const parent = path.dirname(target);
  if (!target.startsWith(root + path.sep) ||
      (fs.existsSync(parent) && !fs.realpathSync(parent).startsWith(root + path.sep) && fs.realpathSync(parent) !== root))
    throw Error('Write new design artifacts under the active iteration: ' + root);
}
