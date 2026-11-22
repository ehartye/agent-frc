import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('staging publishes the compressed geometry once and the index check refuses a tampered copy', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'preliminary-geometry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const author = path.join(root, 'cad', 'preliminary-design');
  const dir = path.join(author, 'releases', 'a');
  await mkdir(dir, { recursive: true });
  const script = path.join(author, 'stage.py');
  await writeFile(script, await readFile(fileURLToPath(new URL('../templates/stage-preliminary-review.py', import.meta.url))));
  async function pin(file, content) {
    await writeFile(path.join(dir, file), content);
    return { file, sha256: sha(content) };
  }
  const content = Buffer.from('{"schema":"agent-frc/package-geometry@1","meshes":[],"cases":[]}');
  const geometry = { ...(await pin('viewer.geometry.json.gz', gzipSync(content))), contentSha256: sha(content) };
  const shown = { file: geometry.file, contentSha256: geometry.contentSha256, bytes: content.length };
  const motion = await pin('paths.json', '{"cases":[]}');
  const view = await pin('viewer.html', '<html><script type="application/json" id="data">' + JSON.stringify({ geometry: shown }) + '</script></html>');
  const limits = await pin('package-limits.json', '{"inspectionLimitKg":14}');
  const budgets = await pin('budgets.json', JSON.stringify({ requirements: limits, masses: [], electricalCases: {} }));
  const plan = await pin('layout.json', JSON.stringify({ motion, budgets, view: view.file }));
  await pin('receipt.json', JSON.stringify({ planSha256: plan.sha256, view: { ...view, verified: true, geometry }, issue: 'synthetic-a',
    status: 'layout-checked', missingInputs: [], reopen: [], step: { file: 'package.step', sha256: 'a'.repeat(64) }, motion,
    stages: { turn: { purpose: 'operating' } }, cycle: ['turn'], control: { witness: { pair: ['head', 'rail'], status: 'fail' } },
    budgets: { source: budgets, limits, massStatus: 'pass', electricalCases: [{ case: 'weak', status: 'pass' }] },
    cases: [{ case: 'turn', status: 'pass' }], narrativeReview: { objectives: [{ objective: 'Move the sample', disposition: 'represented' }] } }));
  await pin('missions.json', JSON.stringify({ missionCases: [{ case: 'turn', kind: 'operating-case', accomplishes: 'delivered', objective: 'Move the sample' }] }));
  const run = (...args) => spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [script, ...args], { encoding: 'utf8' });

  const input = path.join(dir, geometry.file);
  await writeFile(input, gzipSync(content, { level: 1 }));
  assert.match(run('a').stderr, /Regenerate it with --write-view and save that run's receipt/, 'the receipt pins the compressed bytes it checked');
  await writeFile(input, gzipSync(content));
  const staged = run('a');
  assert.equal(staged.status, 0, staged.stderr);
  const served = path.join(root, 'docs', 'preliminary-design', 'releases', 'a', geometry.file);
  assert.equal(sha(await readFile(served)), geometry.sha256);
  assert.equal(run('--check-index').status, 0);
  await writeFile(served, gzipSync(Buffer.from('{"meshes":["tampered"]}')));
  assert.match(run('--check-index').stderr, /Indexed geometry differs from receipt: a/);
  await writeFile(served, Buffer.from('not gzip'));
  assert.match(run('--check-index').stderr, /Indexed geometry differs from receipt: a/, 'a corrupt stream fails the check instead of crashing');
});
