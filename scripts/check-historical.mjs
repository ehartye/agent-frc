import {verifyHistorical,exitCode,publishResult} from './historical-verification.mjs';
const args=process.argv.slice(2),options={},seen=new Set();let output,list=false;
try{
 for(let i=0;i<args.length;i++){
  const a=args[i];if(seen.has(a))throw Error(`Repeated flag: ${a}`);seen.add(a);
  if(a==='--list'){list=true;continue;}
  if(a==='--run'){options.run=true;continue;}
  if(!['--case','--python','--output'].includes(a))throw Error(`Unknown flag: ${a}`);
  const value=args[++i];if(!value||value.startsWith('--'))throw Error(`Missing value: ${a}`);
  if(a==='--case')options.caseId=value;else if(a==='--python')options.python=value;else output=value;
 }
 if(list){if(args.length!==1)throw Error('--list cannot be combined with other flags');console.log(JSON.stringify({cases:['acquisition-contract']}));}
 else{
  const result=verifyHistorical(options);
  if(output)try{publishResult(output,result);}catch(e){result.status='failed';result.issues.push({code:'output-failed',message:e.message});}
  console.log(JSON.stringify(result,null,2));process.exitCode=exitCode(result);
 }
}catch(e){console.log(JSON.stringify({schema:'agent-frc/historical-verification-result@1',status:'invalid',issues:[{code:'arguments-invalid',message:e.message}]}));process.exitCode=2;}
