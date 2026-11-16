import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {assessAttemptLedger,transportCoverage,sourcePins} from './season-goal-boundary.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
export function report(){
 const transportFile='case-studies/diagnostic-world-supervisor.json',fixtureFile='case-studies/season-goal-fixtures.json';
 const transport=JSON.parse(read(transportFile)),fixtures=JSON.parse(read(fixtureFile));
 return {schema:'frc-season-goal-boundary-report/v1',sourceCodeSha256:{...sourcePins(),...Object.fromEntries(['scripts/record-season-goals.mjs',transportFile,fixtureFile].map(p=>[p,createHash('sha256').update(read(p)).digest('hex')]))},transportRunId:transport.runId,transportExecution:'Existing receipt imported and summarized, not rerun in this milestone',transportCoverage:transportCoverage(transport),interfaceFixtureResults:assessAttemptLedger(fixtures.attempts),limitations:['No automatic conversion of local capture/release into a target event','Positive target observations are hand-specified interface fixtures, not flight/contact/field-sensor simulation','Actual launch/placement trajectory, target geometry, closed-loop drive and component load validation remain missing','No complete match score, persistence/removal accounting, penalties, ranking or strategy superiority','Guide/brake mechanical acceptance remains independent and blocked'],simulationReady:false,engineeringAcceptance:'blocked'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.length!==3)throw Error('Usage: node scripts/record-season-goals.mjs fresh-output.json');
 fs.writeFileSync(process.argv[2],JSON.stringify(report(),null,2)+'\n',{flag:'wx'});
}
