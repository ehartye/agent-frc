/**
 * @lane merge
 * @subject scripts/package_view.py
 * @subject scripts/kernel_layout/view.py
 * @subject scripts/kernel_layout/replays.py
 * @subject scripts/review-scene.mjs
 * @subject examples/design-source/create.py
 */
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Needs the CAD kernel and the design library, frc-design-kernel, in the selected Python.
test('the review page builds from the source, the judgement, the page file and the records; a page edit changes no verdict; a stale record refuses it',
  {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, () => {
    const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    execFileSync(py, ['-B', fileURLToPath(new URL('./review_page_check.py', import.meta.url))], {stdio: 'pipe'});
  });
