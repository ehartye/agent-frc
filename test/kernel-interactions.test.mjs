/**
 * @lane merge
 * @subject scripts/layout_check.py
 * @subject scripts/kernel_layout/interactions.py
 * @subject scripts/effective-readiness.mjs
 * @subject examples/design-source/create.py
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Needs the CAD kernel and the design library, frc-design-kernel, in the selected Python.
test('the judge runs each trial and both ends of each adjustment, screens each interaction and applies its bar, and the readiness report repeats it',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, () => {
    const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('./kernel_interactions_check.py', import.meta.url))], {stdio: 'pipe'});
  });
