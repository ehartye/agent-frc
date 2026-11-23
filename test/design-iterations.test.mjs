/**
 * @lane merge
 * @subject scripts/design.mjs
 * @subject scripts/design_iteration.py
 * @subject scripts/fusion_authority.py
 */
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('a numbered restart preserves the outgoing evidence and changes the active CAD source', () => {
  execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    ['-B', fileURLToPath(new URL('./design_iterations.py',import.meta.url))]);
});
