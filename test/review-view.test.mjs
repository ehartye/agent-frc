/**
 * @lane merge
 * @subject scripts/package_view.py
 * @subject scripts/preliminary_design.py
 * @subject scripts/review-scene.mjs
 */
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('review header, motion evidence, field interactions, default fit and compressed scene', {skip: process.env.FRC_TEST_PROFILE === 'portable' && 'Run the CAD kernel checks at the qualified station'}, () => {
  const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  execFileSync(py, ['-B', fileURLToPath(new URL('./review_view.py', import.meta.url))], {stdio: 'pipe'});
});
