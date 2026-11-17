import fs from 'node:fs';
import {diagnoseTrace,renderDiagnostics,hashBytes} from './trace-diagnostics.mjs';
try {
 const [input,jsonOut,htmlOut,...extra]=process.argv.slice(2);
 if(!input||!jsonOut||!htmlOut||extra.length)throw Error('Usage: node scripts/inspect-trace.mjs input.json report.json report.html');
 if(fs.existsSync(jsonOut)||fs.existsSync(htmlOut)||jsonOut===htmlOut)throw Error('Fresh distinct output paths required');
 if(fs.statSync(input).size>32*1024*1024)throw Error('Input exceeds 32 MiB');
 const bytes=fs.readFileSync(input),report=diagnoseTrace(JSON.parse(bytes.toString('utf8')),hashBytes(bytes));
 const html=renderDiagnostics(report);
 if(hashBytes(fs.readFileSync(input))!==report.sourceSha256)throw Error('Input changed during diagnostics');
 fs.writeFileSync(jsonOut,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(htmlOut,html,{flag:'wx'});
 console.log(JSON.stringify({schema:report.schema,sourceSha256:report.sourceSha256,rows:report.rows.length,issues:report.issues,missingFields:report.missingFields,acceptance:false}));
} catch(e){console.error(e.message);process.exitCode=2;}
