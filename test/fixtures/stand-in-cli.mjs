// Run one of the plugin's commands on an invented project whose layout judgement is stood in for:
//
//   node stand-in-cli.mjs stage-gate.mjs preliminary PROJECT --release ID
//   node stand-in-cli.mjs verdict PROJECT JUDGEMENT      print the stood-in verdict
//
// The shipped commands take no stand-in: each exports main(), and this hands it one in process.
import path from 'node:path';
import {standIn} from './preliminary-release.mjs';

const [script, ...args] = process.argv.slice(2);
if (script === 'verdict') {
  const verdict = standIn(path.resolve(args[0]), path.resolve(args[0], args[1]));
  if (verdict.reason) { console.error(verdict.reason); process.exitCode = 2; } else console.log(JSON.stringify(verdict));
} else await (await import('../../scripts/' + script)).main(args, {judge: standIn});
