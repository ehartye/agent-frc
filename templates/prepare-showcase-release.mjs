/** Copy into the project, adapt the build to include its final aliases and freeze this adapter with the approved baseline. */
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const [approved,project,plugin]=process.argv.slice(2,5).map(name=>realpathSync(name));
const output=path.resolve(process.argv[5]);
mkdirSync(output); // Choose a fresh release directory.
const policy=JSON.parse(readFileSync(path.join(approved,'.github/showcase-release.json')));
if(!['branch','built'].includes(policy.layout)) throw Error('Select the actual Pages layout');
const approvedCommit=execFileSync('git',['-C',approved,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const config={...policy,approvedCommit,approvedSite:policy.layout==='branch'?
  path.join(approved,policy.servedDirectory):path.join(output,'approved')};
const env={...process.env};
if(env.FRC_REVIEWER_PUBLIC_KEY) {
  config.reviewerPublicKey=path.join(output,'reviewer-public.pem');
  writeFileSync(config.reviewerPublicKey,env.FRC_REVIEWER_PUBLIC_KEY+'\n',{flag:'wx'});
  env.FRC_MODEL_REVIEW_PUBLIC_KEY=config.reviewerPublicKey;
  env.FRC_MODEL_PROJECT=JSON.parse(readFileSync(path.join(approved,policy.sourcePolicy))).project;
}
function build(root,site) {
  execFileSync(process.execPath,[path.join(plugin,'scripts/robot-highlights.mjs'),path.join(root,'highlights.json'),site],
    {stdio:'inherit',cwd:root,env});
  // Add project-specific final copies here. Use code from the approved project or pinned tool.
}
if(policy.layout==='built') {
  build(approved,config.approvedSite);
  build(project,path.join(output,'site'));
}
// If an exempt field page changes, regenerate it separately with the pinned builder
// and set config.independentFieldRoot to that independent output before checking.
writeFileSync(path.join(output,'station.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
