/**
 * @lane merge
 * @subject scripts/layout_check.py
 * @subject scripts/kernel_layout/verdict.py
 * @subject examples/design-source/create.py
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Needs the CAD kernel and the design library, frc-design-kernel, in the selected Python.
test('the layout judgement on the records of the design library passes a clear layout and rejects interference, a floating solid, an overweight design, a sagging bus and a stale record',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, () => {
    const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('./kernel_layout_check.py', import.meta.url))], {stdio: 'pipe'});
  });
