import fs from 'node:fs';
import {runMotorBenchmark} from './motor-physics.mjs';
try{if(process.argv.length!==3)throw Error('Usage: node scripts/run-motor-physics.mjs config.json');const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(runMotorBenchmark(config),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
