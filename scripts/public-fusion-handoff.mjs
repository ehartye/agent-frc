import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, realpathSync, readFileSync, openSync, readSync, closeSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const roles = ['frame','drive','mechanism'];
function requireValue(ok, message) {
  if (!ok) throw Error('Public Fusion handoff: '+message);
}

function trackedFile(root, name) {
  requireValue(text(name) && !name.includes('\\') && !/[:\0-\x1f]/.test(name) &&
    name.split('/').every(part => part && !['.','..','.git','artifacts'].includes(part)), 'invalid project path');
  const local = path.join(root,name);
  requireValue(existsSync(local) && realpathSync(local) === local, 'missing or redirected '+name);
  const stage = execFileSync('git',['-C',root,'--literal-pathspecs','ls-files','--stage','-z','--',name],{encoding:'utf8'});
  requireValue(/^100(?:644|755) [a-f0-9]+ 0\t/.test(stage) && stage.endsWith('\t'+name+'\0'), 'track '+name+' as a regular file');
  return local;
}

function archiveDigest(file) {
  const fd = openSync(file,'r'), hash = createHash('sha256'), chunk = Buffer.alloc(1024*1024);
  try {
    let size = readSync(fd,chunk);
    requireValue(size >= 4 && chunk.readUInt32LE(0) === 0x04034b50,'expected Fusion archive bytes, including a resolved download');
    while (size) {
      hash.update(chunk.subarray(0,size));
      size = readSync(fd,chunk);
    }
    return hash.digest('hex');
  } finally {closeSync(fd);}
}

function motionSample(sample) {
  const m = sample?.relativeTransform;
  requireValue(Number.isFinite(sample?.position) && Array.isArray(m) && m.length === 16 && m.every(Number.isFinite) &&
    m.slice(12).every((value,i) => Math.abs(value - (i===3 ? 1 : 0)) < 1e-8), 'invalid native joint sample');
  const axes = [m.slice(0,3),m.slice(4,7),m.slice(8,11)];
  for (const [i,a] of axes.entries()) {
    for (const [j,b] of axes.entries()) {
      requireValue(Math.abs(a.reduce((sum,v,k)=>sum+v*b[k],0)-(i===j?1:0))<1e-6,'expected rigid relative transform');
    }
  }
  const [a,b,c] = axes;
  requireValue(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0])>0,'expected right-handed relative transform');
  return m;
}

function installedOccurrences(components) {
  const validated = new Set(), installed = new Set();
  for (const [id,node] of Object.entries(components)) {
    requireValue(text(id) && Number.isSafeInteger(node?.bodies) && node.bodies>=0, 'invalid native body count for '+id);
    if (node.parent !== undefined) requireValue(text(node.parent) && Object.hasOwn(components,node.parent),
      'unknown native parent for '+id);
  }
  for (const id of Object.keys(components)) {
    const chain=new Set();
    for(let ancestor=id; ancestor!==undefined && !validated.has(ancestor); ancestor=components[ancestor].parent) {
      requireValue(!chain.has(ancestor), 'cyclic native hierarchy at '+ancestor);
      chain.add(ancestor);
    }
    for(const name of chain) validated.add(name);
    if (components[id].bodies>0) {
      for(let ancestor=id; ancestor!==undefined && !installed.has(ancestor); ancestor=components[ancestor].parent)
        installed.add(ancestor);
    }
  }
  return installed;
}

function checkJoint(claim, actual, installed, direction, translationScale, frameKey) {
  requireValue(Object.keys(claim).every(k=>['id','type','occurrenceOne','occurrenceTwo','direction'].includes(k)),'unsupported joint claim for '+claim.id);
  if (direction) {
    const axis=direction.axis;
    requireValue(claim.type!=='rigid' && direction.frame===claim[frameKey] &&
      [1,-1].includes(direction.sign) && Array.isArray(axis) && axis.length===3 && axis.every(Number.isFinite) &&
      Math.abs(Math.hypot(...axis)-1)<1e-7, 'invalid signed direction contract for '+claim.id);
  }
  requireValue(['slider','revolute','rigid'].includes(claim.type) && actual?.type === claim.type, 'missing or different joint '+claim.id);
  requireValue(claim.occurrenceOne !== claim.occurrenceTwo &&
    ['occurrenceOne','occurrenceTwo'].every(key => text(claim[key]) && claim[key] === actual[key] &&
      installed.has(claim[key])), 'different joint endpoints for '+claim.id);
  if (claim.type === 'rigid') return;
  requireValue(actual.positionUnit===undefined || actual.positionUnit===(claim.type==='slider'?'mm':'deg'), 'different joint readback unit for '+claim.id);
  const samples = actual.samples;
  requireValue(Array.isArray(samples) && samples.length >= 2, 'missing observed motion for '+claim.id);
  const matrices = samples.map(motionSample), first = matrices[0];
  const axes = [0,1,2,4,5,6,8,9,10];
  let moved = false;
  const consistent = samples.every((sample,i) => {
    const m = matrices[i], delta = Math.abs(sample.position-samples[0].position);
    const rotationTrace = axes.reduce((sum,k)=>sum+first[k]*m[k],0);
    const angle = Math.acos(Math.max(-1,Math.min(1,(rotationTrace-1)/2)))*180/Math.PI;
    if (delta<=1e-7) return first.every((v,k)=>Math.abs(v-m[k])<1e-6);
    moved = true;
    const dot = (a,b) => a.reduce((sum,x,k)=>sum+x*b[k],0);
    const expectedSign = direction && Math.sign(sample.position-samples[0].position)*direction.sign;
    if (claim.type === 'slider') {
      const offset = [3,7,11].map(k=>(m[k]-first[k])*translationScale), travel=Math.hypot(...offset);
      if (direction && (travel<=1e-5 || Math.abs(dot(offset,direction.axis)/travel-expectedSign)>1e-5)) return false;
      return delta>1e-5 && travel>1e-5 && angle<1e-3 && Math.abs(travel-delta)<1e-3;
    }
    if (direction) {
      if (delta>=179.999 || angle<1e-3) return false;
      // Skew of R_after * transpose(R_before) gives the signed rotation axis in the parent frame.
      const term=(i,j)=>dot(m.slice(i*4,i*4+3),first.slice(j*4,j*4+3));
      const skew=[term(2,1)-term(1,2),term(0,2)-term(2,0),term(1,0)-term(0,1)];
      if (Math.abs(dot(skew,direction.axis)/Math.hypot(...skew)-expectedSign)>1e-5) return false;
    }
    const reduced = delta%360;
    return angle>1e-3 && Math.abs(angle-Math.min(reduced,360-reduced))<1e-3;
  });
  requireValue(consistent && moved,'no matching observed relative '+claim.type+' motion for '+claim.id);
}

// Read only projects which explicitly declare this public deliverable.
export function publicFusionHandoff(project) {
  const root = realpathSync(project), configFile = path.join(root,'project-layout.json');
  if (!existsSync(configFile)) return;
  const config = JSON.parse(readFileSync(configFile,'utf8'));
  if (!Object.hasOwn(config,'publicFusionHandoff')) return;
  trackedFile(root,'project-layout.json');
  const manifestPath = config.publicFusionHandoff;
  const manifest = JSON.parse(readFileSync(trackedFile(root,manifestPath),'utf8'));
  requireValue(manifest.schema === 'agent-frc/public-fusion-handoff@1' && manifest.shareable === true &&
    text(manifest.revision), 'declare the revision and confirm redistribution');
  const {archive,reopen,components,joints} = manifest;
  // The manifest names the archive and the reopen receipt by path. A SHA-256 typed beside either is verified, and none is required.
  const typed = value => value === undefined || /^[a-f0-9]{64}$/.test(value);
  requireValue(/^cad\/.+\.f3[dz]$/i.test(archive?.file) && typed(archive?.sha256), 'expected a public CAD archive under cad/');
  const file = trackedFile(root,archive.file), archiveSha256 = archiveDigest(file);
  requireValue(archive.sha256 === undefined || archiveSha256 === archive.sha256, 'downloaded archive hash differs');
  const git = args => execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  requireValue(git(['hash-object','--no-filters','--',archive.file]) === git(['rev-parse',':'+archive.file]),
    'tracked archive bytes differ from the download');
  const bytes = readFileSync(trackedFile(root,reopen?.file));
  requireValue(reopen.sha256 === undefined || digest(bytes) === reopen.sha256,'reopen receipt hash differs');
  const obs = JSON.parse(bytes);
  // The reopen receipt is written at the reopen: its digest must be that of the archive offered now.
  requireValue(obs.opened === true && obs.source === archive.file && obs.sha256 === archiveSha256,
    'reopen the exact student download and record its path and hash');
  requireValue(object(obs.components) && Array.isArray(components) && components.length && Array.isArray(joints), 'expected component inventory and explicit joint claim list');
  const installed = installedOccurrences(obs.components);
  const ids = new Set(), covered = new Set();
  let editable = false;
  for (const c of components) {
    requireValue(text(c?.id) && !ids.has(c.id) && (roles.includes(c.role) || c.role === 'other') &&
      ['project-original','project-proxy','authorized-supplier'].includes(c.representation) && text(c.provenance),
      'declare distinct installed IDs, roles and authorized representations');
    ids.add(c.id); covered.add(c.role);
    const item = obs.components[c.id];
    requireValue(Object.hasOwn(obs.components,c.id) && Number.isSafeInteger(item?.bodies) && item.bodies > 0,
      'missing physical component '+c.id);
    if (c.parent !== undefined) requireValue(c.parent===item.parent, 'different native parent for '+c.id);
    if (c.bodyNames !== undefined) {
      requireValue(Array.isArray(c.bodyNames) && c.bodyNames.length && c.bodyNames.every(text) &&
        new Set(c.bodyNames).size===c.bodyNames.length && Array.isArray(item.bodyNames) &&
        item.bodyNames.length===item.bodies && c.bodyNames.every(id => item.bodyNames.filter(name=>name===id).length===1),
        'missing or ambiguous claimed body name for '+c.id);
    }
    if (c.editMetric !== undefined) {
      requireValue(['extrusions','editableFeatures','baseFeatures'].includes(c.editMetric) &&
        Number.isSafeInteger(item[c.editMetric]) && item[c.editMetric] > 0, 'missing editable feature for '+c.id);
      editable = true;
    }
  }
  for (const [id,item] of Object.entries(obs.components)) {
    if (item.bodies) requireValue(ids.has(id), 'declare representation and provenance for '+id);
  }
  requireValue(roles.every(role => covered.has(role)), 'identify separate frame, drive and mechanism occurrences');
  const jointIds = new Set();
  requireValue([undefined,'mm','cm'].includes(obs.transformTranslationUnit),'unknown transform translation unit');
  const scale = obs.transformTranslationUnit==='cm' ? 10 : 1;
  const frameKey = obs.relativeTransformFrame ?? 'occurrenceOne';
  requireValue(['occurrenceOne','occurrenceTwo'].includes(frameKey),'unknown relative observation frame');
  let signedJoints = 0;
  for (const j of joints) {
    requireValue(text(j?.id) && !jointIds.has(j.id) && object(obs.joints) && Object.hasOwn(obs.joints,j.id), 'missing or duplicate claimed joint '+j?.id);
    let direction;
    if (Object.hasOwn(j,'direction')) {
      const ref=j.direction;
      requireValue(ref?.file!==reopen.file && ref?.file!==manifestPath,'use independent direction reference');
      const data=readFileSync(trackedFile(root,ref?.file));
      requireValue(ref.sha256===undefined || digest(data)===ref.sha256,'changed direction reference');
      const rules=JSON.parse(data);
      requireValue(Object.hasOwn(rules,j.id) && object(rules[j.id]),'missing source direction for '+j.id);
      direction=rules[j.id]; signedJoints++;
    }
    jointIds.add(j.id); checkJoint(j,obs.joints[j.id],installed,direction,scale,frameKey);
    if (j.type!=='rigid') editable=true;
  }
  requireValue(editable,'identify a native edit feature or a verified moving joint');
  return {revision:manifest.revision, file, name:archive.file, sha256:archiveSha256, components:ids.size, joints:jointIds.size, signedJoints};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    requireValue(process.argv.length===3, 'usage: public-fusion-handoff.mjs PROJECT');
    const handoff = publicFusionHandoff(process.argv[2]);
    requireValue(handoff,'project has not declared a public whole-robot archive');
    const {file, ...summary} = handoff;
    console.log(JSON.stringify(summary));
  } catch (error) {console.error(error.message); process.exitCode=1;}
}
