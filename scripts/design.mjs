#!/usr/bin/env node
import fs from 'node:fs';
import {checkDesignDestination} from './active-design.mjs';
import {projectFrameProfile} from './project-frame-profile.mjs';
import {frameDxf} from './frame-dxf.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDesign,assertDesign,canonicalStringify,deriveGeometry,exportCad,frameReviewBasis,spatialChecks,rehearsalBudget,reviseDesign} from './design-artifact.mjs';
const args=process.argv.slice(2),[command,input,out,...rest]=args;
function readJson(file) {
  if (!file) throw Error('Input JSON path required');
  if (fs.statSync(file).size > 2_000_000) throw Error('Input exceeds 2 MB');
  return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
}
function load(file) { return assertDesign(readJson(file)); }
function write(file,text){checkDesignDestination(file);fs.writeFileSync(file,text,{encoding:'utf8',flag:'wx'})}
function handoff(a) {
  const checks = spatialChecks(a);
  return [
    '# CAD handoff for '+a.id,
    'Revision '+a.revision+'. Artifact coordinates use metres and OpenSCAD uses millimetres.',
    'Canonical design SHA-256 '+createHash('sha256').update(canonicalStringify(a)).digest('hex')+'.',
    'Edit design.json for the next revision. geometry.json contains the robot solids and workspace references. blockout.scad positions the robot and references in world coordinates.',
    'Workspace basis: '+a.workspace.basis,
    'Target registration: '+a.frames.target.basis,
    '## Screens',
    ...checks.map(c=>'- '+c.id+' ('+c.status+'). '+c.scope),
    '## Remaining evidence',
    ...a.provenance.limitations.map(l=>'- '+l),
    ...(a.design.frameProfile?['Import frame-plan.dxf as a millimetre sketch in Fusion. The four closed boundaries reserve the frame, backing, padding and cover; set actual materials, thicknesses, fasteners, wheel travel and straight-edge mounting in the installed assembly.']:[]),
    'Check the support strip, bumper attachments and full object path before using the opening for mechanical design.',
    '',
  ].join('\n\n');
}
try{
 if(command==='new'){if(!input||rest.length)throw Error('Usage: design new output.json [project.json]');const project=out?readJson(out):{};const convention=projectFrameProfile(input);if(project.frameProfile===undefined&&convention!==undefined)project.frameProfile=convention;write(input,canonicalStringify(createDesign(project)));console.log('Created editable design artifact');}
 else if(command==='frame-basis'){if(!input||out)throw Error('Usage: design frame-basis input.json');console.log(JSON.stringify(frameReviewBasis(load(input)),null,2));}
 else if(command==='validate'){if(out)throw Error('Usage: design validate input.json');const a=load(input);console.log(JSON.stringify({valid:true,id:a.id,revision:a.revision,checks:spatialChecks(a),budget:rehearsalBudget(a)},null,2));}
 else if(command==='opening'){checkDesignDestination(input);if(!out||rest.length!==1||!['on','off'].includes(rest[0]))throw Error('Usage: design opening input.json new-output.json on|off');const a=reviseDesign(load(input),x=>{x.operations[0].enabled=rest[0]==='on'});write(out,canonicalStringify(a));console.log('Saved new revision; prior checks invalidated');}
 else if(command==='export'){checkDesignDestination(input);if(!out||rest.length)throw Error('Usage: design export input.json NEW-directory');const a=load(input),dir=path.resolve(out);checkDesignDestination(dir);fs.mkdirSync(dir);try{write(path.join(dir,'design.json'),canonicalStringify(a));write(path.join(dir,'geometry.json'),JSON.stringify(deriveGeometry(a),null,2)+'\n');write(path.join(dir,'blockout.scad'),exportCad(a));if(a.design.frameProfile)write(path.join(dir,'frame-plan.dxf'),frameDxf(deriveGeometry(a).framePlan));write(path.join(dir,'checks.json'),JSON.stringify({checks:spatialChecks(a),budget:rehearsalBudget(a)},null,2)+'\n');write(path.join(dir,'HANDOFF.md'),handoff(a));}catch(e){throw Error('Incomplete new export directory retained for inspection: '+e.message)}console.log('Exported editable source and spatial CAD handoff; no physical validation claimed');}
 else throw Error('Usage: design new|frame-basis|validate|opening|export ...');
}catch(e){console.error(e.message);process.exitCode=1}
