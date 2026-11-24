/**
 * @lane merge
 * @subject scripts/layout_check.py
 * @subject scripts/kernel_layout/run.py
 * @subject scripts/kernel_layout/verdict.py
 * @subject examples/design-source/create.py
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Needs the CAD kernel and the design library, frc-design-kernel, in the selected Python.
const skip = process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station';
const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const check = name => execFileSync(py, ['-B', fileURLToPath(new URL('./' + name, import.meta.url))], {stdio: 'pipe'});

test('the judge passes a clear layout and rejects interference, a floating solid, an overweight design, a sagging bus and a premise left', {skip}, () => {
  check('kernel_layout_check.py');
});

test('the judge stops at the cheapest failure, judges the one thing named, and decides nothing from saved results, the log or what changed', {skip}, () => {
  check('judge_check.py');
});
