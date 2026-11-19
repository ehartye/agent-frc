import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('resolve inherited, overridden and project-specific CAD colors', async t => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  if (spawnSync(python, ['--version']).error?.code === 'ENOENT') {
    return t.skip('Python is required for the CAD palette tool.');
  }
  const root = await mkdtemp(path.join(tmpdir(), 'component-palette-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const script = fileURLToPath(new URL('../scripts/component_palette.py', import.meta.url));
  const run = () => spawnSync(python, [script, root], {encoding: 'utf8'});
  const read = () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).colors;
  };
  const inherited = read();
  assert.equal(inherited.mechanism, '#007F78');
  await mkdir(path.join(root, 'cad'));
  const file = path.join(root, 'cad/component-palette.json');
  const schema = 'agent-frc/component-palette@1';
  await writeFile(file, JSON.stringify({schema, colors: {structure: '#234abc', tread: '#212122'}}));
  assert.deepEqual(read(), {...inherited, structure: '#234ABC', tread: '#212122'});
  for (const invalid of [
    {schema, colors: {structure: 'blue'}},
    {schema, colors: {' ': '#888888'}},
    {schema, colors: []},
    {schema: 'unknown', colors: {}},
  ]) {
    await writeFile(file, JSON.stringify(invalid));
    assert.equal(run().status, 1);
  }
  await writeFile(file, '{"schema":"agent-frc/component-palette@1","colors":{"x":"#000000","x":"#EEEEEE"}}');
  assert.match(run().stderr, /Repeated palette field/);
});
