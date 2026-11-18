import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = new URL('../test/',import.meta.url);
const suites = readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => fileURLToPath(new URL(name,directory)));
if (!suites.length) throw Error('No test suites found');
const run = spawnSync(process.execPath,['--test',...suites],{stdio:'inherit'});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
