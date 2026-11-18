import crypto from 'node:crypto';

// Original inert data: portable tests never obtain historical bytes from repository history.
const paths=['scripts/acquisition-contract.py','case-studies/integrated-prototype-targets.json','case-studies/coral-mass-evidence.json','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/IntegratedPregripPrototype.java','examples/java-2026-sim/src/main/java/org/agentfrc/lesson/PoweredGuidePlant.java','case-studies/acquisition-contract.json','scripts/test-acquisition-contract.py'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function fixture(){
 const content=new Map(paths.map((p,i)=>[p,Buffer.from(`inert fixture ${i}\n`)]));
 content.set(paths[5],Buffer.from(JSON.stringify({pins:Object.fromEntries(paths.slice(0,5).map(p=>[p,sha(content.get(p))]))})+'\n'));
 const files=paths.map(p=>{const b=content.get(p);return {path:p,blob:crypto.createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex'),sha256:sha(b)};});
 const registry={schema:'agent-frc/historical-verification-registry@1',cases:[{id:'acquisition-contract',locator:'1'.repeat(40),argv:['-I','-B',paths[6]],tests:['test_controls','test_domain','test_energy_and_continuity','test_fresh','test_mass_bounds','test_rebound_and_stop_loss'],files}]};
 const deps={onTempCreated:()=>{},readTreeEntry:(_root,_locator,p)=>{const f=files.find(f=>f.path===p);return {mode:'100644',type:'blob',oid:f.blob};},readBlob:(_root,oid)=>content.get(files.find(f=>f.blob===oid).path)};
 return {registry,content,deps};
}
