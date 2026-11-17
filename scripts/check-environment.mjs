import {inspectEnvironment,parseArgs} from './setup-health.mjs';
try{const r=inspectEnvironment(parseArgs(process.argv.slice(2)));console.log(JSON.stringify(r,null,2));process.exitCode=r.ready?0:2;}catch(e){console.error(e.message);process.exitCode=2;}
