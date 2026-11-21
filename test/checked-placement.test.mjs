import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('pre-acceptance placement checks preserve the retained pose and article-specific limits',()=>{
  const python=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
  execFileSync(python,['-B',fileURLToPath(new URL('./checked_placement.py',import.meta.url))]);
});
