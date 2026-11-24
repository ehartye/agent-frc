/**
 * @lane merge
 * @subject scripts/layout_check.py
 * @subject scripts/kernel_layout/progress.py
 * @subject scripts/kernel_layout/run.py
 * @subject test/fixtures/slow_library/sitecustomize.py
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Needs the CAD kernel and the design library, frc-design-kernel, in the selected Python.
test('a run says where it is to another process: inside one long motion or trial, killed, frozen, or with a worker stuck',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, () => {
    const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('./judge_progress_check.py', import.meta.url))], {stdio: 'pipe'});
  });
