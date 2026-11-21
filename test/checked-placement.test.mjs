import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('pre-acceptance placement checks preserve the retained pose and article-specific limits',()=>{
  const python=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
  execFileSync(python,['-B',fileURLToPath(new URL('./checked_placement.py',import.meta.url))]);
});

test('a commissioned thread requires spatial containment and a modeled helical male',()=>{
  const python=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
  execFileSync(python,['-B',fileURLToPath(new URL('./spatial_mating_fit.py',import.meta.url))]);
});
