import {readViewerJSON} from './native-viewer-cli.mjs';
import {assessContactConvergence} from './contact-convergence.mjs';
try{
  const args=process.argv.slice(2);if(args.length!==2)throw Error('Usage: check-contact-convergence expected-manifest.json observed-receipt.json');
  const result=assessContactConvergence(readViewerJSON(args[0]),readViewerJSON(args[1]));
  console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='within-declared-bounds'?0:result.status==='not-converged'?1:2;
}catch(error){console.error(error.message);process.exitCode=2;}
