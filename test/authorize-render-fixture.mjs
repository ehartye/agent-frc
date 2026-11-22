// Isolated tests of rendering and handoff bind their synthetic candidate to a mechanical-readiness review result,
// as a design marked effective carries one. The mechanical evaluator has its own physical controls.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function authorizeRender(root,{archive,manifest='project.json'}={}){
  const hash=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
  const selected=JSON.parse(readFileSync(path.join(root,'cad-showcase.json'))),cad=JSON.parse(readFileSync(path.join(root,'docs/robot/cad/receipt.json')));
  writeFileSync(path.join(root,'test-review.json'),JSON.stringify({schema:'agent-frc/mechanical-readiness-result@1',configuration:'Controlled candidate',
    stepSha256:cad.sourceSha256,solids:cad.solids,archiveSha256:archive?hash(archive):'b'.repeat(64),buildReadiness:'pass',showcaseEligibility:'pass',findings:[]}));
  const mech={reviewResult:'test-review.json'};
  writeFileSync(path.join(root,'cad-showcase.json'),JSON.stringify({...selected,mechanicalReadiness:mech}));
  if(existsSync(path.join(root,manifest))){
    const data=JSON.parse(readFileSync(path.join(root,manifest)));
    writeFileSync(path.join(root,manifest),JSON.stringify({...data,mechanicalReadiness:mech}));
  }
  return {review:'test-review.json'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  console.log(JSON.stringify(authorizeRender(process.argv[2])));
}
