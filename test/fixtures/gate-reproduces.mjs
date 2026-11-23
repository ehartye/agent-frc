// A stand-in for the layout check at the stage gate, for tests of the staging commands on invented releases that hold
// no solid to check. It returns the published receipt of the release as a physics-only rerun would: the gate then
// finds the check reproduced. Tests of the gate itself use the real check or a stand-in that fails.
import {readFileSync} from 'node:fs';
import path from 'node:path';

export default function reproduces({project}) {
  const id = path.basename(project), phase = path.basename(path.dirname(path.dirname(project)));
  const published = path.join(project, '..', '..', '..', '..', 'docs', phase, phase === 'detailed-design' ? 'designs' : 'releases', id, 'receipt.json');
  return {...JSON.parse(readFileSync(published, 'utf8')), physicsOnly: true};
}
